# Log

Summary: Added a shared adapter core, shipped a packaged Svelte adapter with dev auto-start and CID preprocessing, refactored the Next.js adapter onto the shared core, and migrated `origami-app` off its embedded Figma Link implementation.

Files Modified:

- packages/adapter-core/package.json
- packages/adapter-core/tsconfig.json
- packages/adapter-core/src/index.ts
- packages/adapter-core/src/types.ts
- packages/adapter-core/src/server/index.ts
- packages/adapter-core/src/server/routes.ts
- packages/adapter-core/src/server/store.ts
- packages/adapter-nextjs/package.json
- packages/adapter-nextjs/src/index.ts
- packages/adapter-nextjs/src/types.ts
- packages/adapter-nextjs/src/server/index.ts
- packages/adapter-nextjs/src/server/routes.ts
- packages/adapter-nextjs/src/server/store.ts
- packages/adapter-nextjs/src/components/DomReviewOverlay.tsx
- packages/adapter-nextjs/README.md
- packages/adapter-svelte/package.json
- packages/adapter-svelte/tsconfig.json
- packages/adapter-svelte/scripts/copy-assets.mjs
- packages/adapter-svelte/src/ambient.d.ts
- packages/adapter-svelte/src/vite-env.d.ts
- packages/adapter-svelte/src/index.ts
- packages/adapter-svelte/src/bin/figma-link-server.ts
- packages/adapter-svelte/src/vite/index.ts
- packages/adapter-svelte/src/preprocess/cidPreprocessor.ts
- packages/adapter-svelte/src/components/DomReviewOverlay.svelte
- packages/adapter-svelte/src/components/DomReviewOverlay.svelte.d.ts
- packages/adapter-svelte/src/components/FigmaCodeLink.svelte
- packages/adapter-svelte/src/components/FigmaCodeLink.svelte.d.ts
- packages/adapter-svelte/README.md
- packages/figma-plugin/package.json
- packages/figma-plugin/src/shared/messages.ts
- origami-app/package.json
- origami-app/svelte.config.js
- origami-app/vite.config.ts
- origami-app/src/routes/+layout.svelte
- origami-app/src/lib/stores.ts
- origami-app/src/lib/api.ts
- origami-app/src/lib/types.ts
- origami-app/src/app.css
- origami-app/src-tauri/src/main.rs
- origami-app/src-tauri/src/lib.rs
- origami-app/src-tauri/src/commands/mod.rs

Functions/Components Changed:

- `startFigmaLinkServer`: moved to shared core and reused by both adapters.
- `TaskStore`: moved to shared core and fixed review dedupe on create.
- `registerRoutes`: moved to shared core with framework-independent review and screenshot endpoints.
- `DomReviewOverlay` (React): kept as the Next.js runtime layer over the shared API, with bundled screenshot loading.
- `DomReviewOverlay` (Svelte): added packaged review overlay for Svelte apps.
- `cidPreprocessor` (Svelte): added conservative native-element CID injection with compatibility hooks.
- `createFigmaLinkVitePlugin`: added Svelte/Vite dev auto-start integration for the shared server.

Breaking Changes:

- `origami-app` no longer exposes the old Tauri `figma_link_*` commands or the embedded Figma Link overlay/service/preprocessor files.
- Svelte config-time imports should use `figma-code-link-svelte/preprocess` and `figma-code-link-svelte/vite` rather than the package root.
- The packaged adapters now rely on `figma-code-link-core` for the shared server/task model.

## Follow-up Debugging — 2026-03-07

Summary: Investigated `origami-app` build and runtime failures after the Svelte adapter migration. Fixed linked-package resolution issues, removed browser exposure to Node-side adapter exports, and hardened dev server startup against stale port collisions. `npm test` passes and the previous Vite resolve errors were eliminated, but the Tauri window/runtime hang reported by the user still persists and needs a separate follow-up.

Additional Files Modified:

- packages/adapter-core/src/server/index.ts
- packages/adapter-svelte/package.json
- packages/adapter-svelte/src/index.ts
- packages/adapter-svelte/src/server.ts
- packages/adapter-svelte/src/vite/index.ts
- packages/adapter-svelte/tsconfig.build.json
- origami-app/package.json
- origami-app/tsconfig.json
- origami-app/vite.config.ts

Additional Changes:

- Fixed local linked-package Svelte type identity issues between `figma-code-link` and `origami-app`.
- Added direct app-side dependencies required for local adapter development (`figma-code-link-core`, `html2canvas`, `express`, `cors`).
- Split server helpers off the Svelte adapter root export so browser imports only load client-safe code.
- Added handling for `EADDRINUSE` during Figma Link dev server startup so repeated dev runs do not immediately fail on port `7842` collisions.

Current Status:

- `origami-app` typecheck/build validation succeeds (`npm test` passes).
- Prior resolve failures for `figma-code-link-core`, `html2canvas`, `express`, and `cors` were resolved.
- User still reports a runtime/dev hang with browser-side exceptions after startup, so the migration should be treated as not fully validated yet.
