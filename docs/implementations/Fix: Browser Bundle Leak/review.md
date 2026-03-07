# Review — Browser Bundle Leak (Node.js Modules in Vite Browser Build)

## Does the request make sense?

Yes. The white-screen hang and DOM console errors are a direct consequence of Node.js built-in modules (`events`, `url`, `http`, `path`, `buffer`) being included in Vite's browser pre-bundler pass. This is a real and blocking defect that must be fixed before the Svelte adapter migration can be considered shipped. The surface is small and the diagnosis is clear.

---

## Root Cause — Three Compounding Problems

### 1. `adapter-core` has no conditional exports and no browser stub

`adapter-core/package.json` exposes a single `"."` export with only a `"default"` condition:

```json
".": { "types": "...", "default": "./dist/index.js" }
```

That `default` points directly to CommonJS code that `require()`s `express`, `cors`, `node:http`, `node:fs`, `node:path`, and uses `Buffer`. There is no `"node"` condition to signal "this is server-only" and no `"browser"` condition pointing to a safe stub. Vite's esbuild optimizer has no signal to skip it for browser processing.

### 2. `adapter-svelte/dist/vite/index.js` imports `figma-code-link-core` at the top level

```ts
// src/vite/index.ts — line 1
import { startFigmaLinkServer } from "figma-code-link-core";
```

This is a static top-level import. Even though `vite.config.ts` is executed in Node.js, Vite's dependency optimizer scans the full transitive module graph of all packages that are dependencies or devDependencies of the app. `figma-code-link-core` appears in that graph through `adapter-svelte` → `dist/vite/index.js` → `figma-code-link-core`. Because `adapter-core` is CJS with no browser stub, esbuild pre-bundles it for ESM compatibility and externalizes Node built-ins as empty stubs. Those stubs crash at runtime when accessed.

### 3. `figma-code-link-core`, `express`, and `cors` are direct `devDependencies` of `origami-app`

These were added in the previous debugging pass to resolve local linked-package resolution. However, promoting them to direct app-level deps makes Vite treat them as first-class project dependencies — firmly placing them in the optimizer's scan scope, even if no browser code imports them. This reinforced the problem rather than fixing it.

---

## What the Previous Fix Got Right (and Wrong)

The previous follow-up (2026-03-07) correctly:

- Split the server path off the `adapter-svelte` root export so `import ... from 'figma-code-link-svelte'` stays browser-safe.
- Identified and partially isolated the server surface.

It did not fix:

- The top-level `figma-code-link-core` import in `dist/vite/index.js` (the new source of the leak).
- The lack of conditional exports on `adapter-core`.
- The direct `devDependencies` it added to `origami-app` — those should not live there.

---

## Is There a Simpler Path?

No single-line fix closes all three gaps. The simplest complete fix is:

1. Add a `"node"` conditional export to `adapter-core` and a no-op browser stub as the `"browser"` condition. Rebuild `adapter-core`.
2. Convert `adapter-svelte/src/vite/index.ts` to use a dynamic `import()` for `figma-code-link-core` inside `configureServer`, eliminating it from the static module graph. Rebuild `adapter-svelte`.
3. Add `optimizeDeps.exclude: ['figma-code-link-core']` to `origami-app/vite.config.ts` as a defense-in-depth layer.
4. Remove `figma-code-link-core`, `express`, and `cors` from `origami-app`'s direct `devDependencies`. They are adapter concerns, not app concerns.

These four changes are independent, low-risk, and reversible. No schema migrations, no breaking API changes, no component rewrites.

---

## Real Risks

### Dynamic import async signature change in Vite plugin

`configureServer` in Vite plugins can be synchronous or async. Making it `async` to support `await import(...)` is valid and supported. However, if any HMR path depends on the return value or timing of `configureServer`, it should be verified.

### `optimizeDeps.exclude` may need to widen

If any other linked package transitively pulls in another Node-only module with no browser condition, the same externalize-and-crash behavior will repeat. After the primary fix, a quick check of the optimizer output is worthwhile.

### Removing express/cors from `origami-app` devDeps

These were added because local linked-package installs do not always hoist the adapter's transitive deps. After removal, run a clean install and confirm Vite can still resolve `express` and `cors` through each adapter package's own `node_modules`. If not, add `optimizeDeps.include` for them keyed off the adapter paths, not the bare names.

---

## Bottom Line

The migration is structurally sound. The adapter split is correct. This is a Vite bundler configuration and package metadata problem, not an architectural one. The three-step fix (conditional exports + dynamic import + exclude list) closes the leak without touching any product logic.
