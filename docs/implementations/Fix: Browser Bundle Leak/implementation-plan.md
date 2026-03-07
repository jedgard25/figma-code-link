# Implementation Plan — Fix: Browser Bundle Leak

## Context

After the Svelte adapter migration, `origami-app` hangs on a white Tauri window. The browser console reports that Node.js built-ins (`events`, `url`, `http`, `path`, `buffer`) have been externalized by Vite and crash at runtime when accessed. The root cause is three compounding issues — see [review.md](./review.md) for the full diagnosis.

**Error chain:**

```
vite.config.ts
  → figma-code-link-svelte/vite          (ESM, Vite plugin)
    → figma-code-link-core               (CJS, top-level import, no browser stub)
      → express, cors, node:http, node:fs, node:path, Buffer
        → externalized as empty browser stubs → crash
```

Three concrete code sites must change. No product logic is touched.

---

## Phase 1 — Fix `adapter-core` conditional exports

**Agent:** backend  
**Deps:** none  
**Context:**

- `packages/adapter-core/package.json`
- `packages/adapter-core/src/index.ts`

**What:** Add proper conditional exports to `adapter-core` so Vite (and any other bundler) can distinguish the Node.js server path from a safe browser stub.

**How/Where:**

- Create `packages/adapter-core/src/browser.ts` containing only `export {};` (empty module — no server code, no imports).
- Add to `adapter-core/package.json` exports:
  ```json
  ".": {
    "types":   "./dist/index.d.ts",
    "node":    "./dist/index.js",
    "browser": "./dist/browser.js",
    "default": "./dist/index.js"
  }
  ```
  The `"node"` condition resolves first in Node.js runtimes. The `"browser"` condition gives Vite/esbuild a clean empty module for browser bundling passes. `"default"` remains for any tooling that handles neither condition.
- Run `npm run build` in `packages/adapter-core` to emit `dist/browser.js`.

**Contract:** `adapter-core` advertises a no-op browser entry. Vite no longer pulls Node built-ins into the browser bundle when scanning this package.

---

## Phase 2 — Convert vite plugin to lazy import

**Agent:** frontend-infra  
**Deps:** none (parallel with Phase 1)  
**Context:**

- `packages/adapter-svelte/src/vite/index.ts` — top-level `import { startFigmaLinkServer } from "figma-code-link-core"` on line 1

**What:** Replace the static top-level import with a dynamic `import()` inside `configureServer` so `figma-code-link-core` is never in the static module graph analyzed by Vite's dependency optimizer.

**How/Where:**

- Remove the top-level `import { startFigmaLinkServer, type StartFigmaLinkServerOptions } from "figma-code-link-core"`.
- Move the `StartFigmaLinkServerOptions` type-only import back to a `import type` at the top (type-only imports are erased and safe).
- Inside `configureServer`, add:
  ```ts
  const { startFigmaLinkServer } = await import("figma-code-link-core");
  ```
- Mark `configureServer` as `async`. This is valid for Vite plugin hooks.
- Run `npm run build` in `packages/adapter-svelte`.

**Contract:** `figma-code-link-core` no longer appears in any static import graph that Vite's esbuild optimizer would process. The server still starts correctly because `configureServer` resolves before the dev server is used.

---

## Phase 3 — Add `optimizeDeps.exclude` to `origami-app/vite.config.ts`

**Agent:** frontend-infra  
**Deps:** none (parallel with Phase 1 and Phase 2)  
**Context:**

- `origami-app/vite.config.ts`

**What:** Explicitly exclude `figma-code-link-core` from Vite's browser dependency optimizer as a defense-in-depth layer. This ensures that even if a future static import reappears, it will not be pre-bundled for the browser.

**How/Where:**

- Add to `defineConfig`:
  ```ts
  optimizeDeps: {
    exclude: ['figma-code-link-core'],
  },
  ```
- No other Vite config changes are needed at this stage.

**Contract:** `figma-code-link-core` is hard-excluded from the browser pre-bundle pass regardless of how it appears in the dependency graph.

---

## Phase 4 — Remove spurious direct Node deps from `origami-app`

**Agent:** integration  
**Deps:** Phase 1 (adapter-core browser stub must exist before removing the app-level fallbacks)  
**Context:**

- `origami-app/package.json` — `devDependencies` currently lists `figma-code-link-core`, `express`, `cors` directly

**What:** Remove `figma-code-link-core`, `express`, and `cors` from `origami-app`'s direct `devDependencies`. These are adapter-internal concerns that were promoted to app-level deps as a previous debugging workaround. Keeping them here causes Vite to treat them as project-level browser candidates.

**How/Where:**

- Remove from `origami-app/package.json` `devDependencies`:
  - `"figma-code-link-core"`
  - `"express"`
  - `"cors"`
- Run `npm install` in `origami-app` to clean the lockfile.
- Verify that `adapter-svelte` and `adapter-core` still resolve their own `express`/`cors` through their own `node_modules` trees.

**Contract:** No Node-only packages appear as direct `devDependencies` of `origami-app`. Adapter transitive deps are resolved through the adapter package's own dependency tree.

---

## Phase 5 — Validation

**Agent:** qa  
**Deps:** Phase 1, Phase 2, Phase 3, Phase 4  
**Context:**

- `origami-app`
- `packages/adapter-svelte`
- `packages/adapter-core`

**What:** Confirm the app starts, the browser console is clean, and the adapter still functions end-to-end in dev mode.

**How/Where:**

- Run `npm test` in `origami-app` — typecheck must pass.
- Run `npm run tauri dev` — Tauri window must render the app (no white screen).
- Confirm no `Module "events|url|http|path|buffer" has been externalized` warnings appear in the browser console.
- Confirm the Figma Link dev server starts on port 7842 (visible in terminal output from the Vite plugin).
- Confirm `DomReviewOverlay` is interactive (hover highlights appear on `[data-cid]` elements).

**Contract:** The app loads without Node module externalization errors. The Svelte adapter migration is validated at the runtime level.

---

## Deliverables Checklist

- `adapter-core/src/browser.ts` stub created and emitted to `dist/browser.js`.
- `adapter-core/package.json` has `"node"` and `"browser"` conditional exports.
- `adapter-svelte/src/vite/index.ts` uses dynamic `import()` for `figma-code-link-core` with no static top-level value import.
- `origami-app/vite.config.ts` has `optimizeDeps.exclude: ['figma-code-link-core']`.
- `origami-app/package.json` no longer lists `figma-code-link-core`, `express`, or `cors` as direct devDependencies.
- `origami-app` loads in Tauri with no Node module externalization errors.
- `origami-app` Figma Link server starts and overlay is interactive.
