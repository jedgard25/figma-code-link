# Review — Svelte Adapter

## Does the request make sense?

Yes, but the right target is not "port the embedded origami adapter as-is." The current Next.js package already has the correct separation of concerns: shared task/review server, framework runtime overlay, and build-time CID injection. The Svelte work should preserve that split, then migrate `origami-app` onto the packaged adapter. Rebuilding the origami-specific implementation inside the package would lock its current technical debt into the public API.

## Scope Corrections

### 1. Do not ship origami-app's full regex CID logic as the universal default

The embedded Svelte preprocessor in `origami-app` is doing defensive parsing because the app is large and has edge cases. That is a compatibility problem, not a public-package baseline.

Recommended direction:

- Ship a conservative Svelte preprocessor in the adapter package for the common case: native elements only, explicit `data-cid` never overwritten, dev-only.
- Expose a small compatibility surface for advanced repos: include/exclude filters, path resolver, and a manual CID escape hatch.
- Keep manual `data-cid` support as the fallback for code the preprocessor should not touch.

This keeps the package stable while still allowing `origami-app` to bridge its edge cases cleanly.

### 2. Auto-start the local server in framework dev mode, but retain an explicit fallback

The current separate `figma-link-server` process is operationally annoying. For both Next.js and Svelte, the adapter should offer framework-native dev integration that starts the local server automatically when `npm run dev` runs.

However, the standalone server should remain supported because:

- some repos will need custom boot flows,
- some frameworks will not expose a clean dev hook,
- CI or remote debugging may still want an explicit process.

So the architecture should be "auto-start by default when integrated through the framework plugin," not "remove the server entry point entirely."

### 3. Do not keep the Tauri-backed origami adapter architecture

The embedded origami implementation routes review state through Tauri/Axum and an in-memory store. That is appropriate only for that app's temporary local integration. The public Svelte adapter should reuse the shared Node-side task server pattern from `adapter-nextjs`, not duplicate a second backend architecture.

This matters because the plugin's SSOT already lives in `figma-tasks.json`. The Tauri in-memory path breaks persistence, narrows portability, and creates two backend models for the same feature.

### 4. Remove end-user peer friction where it improves adoption

The `html2canvas` peer dependency is not a good default for a quick-install workflow. The base adapter should still work without screenshots, but the user should not need extra setup just to get the core link flow running.

Recommended direction:

- keep screenshot capture optional at runtime,
- move the capture implementation behind an internal adapter boundary,
- prefer bundling the default capture dependency with the adapter package rather than requiring consumer installation.

If bundle size becomes a concern, make screenshots feature-flagged, not installation-blocking.

## Real Risks

### 1. CID stability across Svelte compilation edge cases

If the package preprocessor is too aggressive, it will break builds. If it is too conservative, overlay coverage will be incomplete. This is the main design constraint. The public contract must therefore support selective opt-out and manual annotation.

### 2. Dev server lifecycle duplication

If Next.js and Svelte each grow their own server startup logic without a shared core, they will drift quickly. The server lifecycle should be centralized in shared adapter infrastructure and wrapped by thin framework integrations.

### 3. Migration ambiguity in origami-app

`origami-app` currently has overlay UI, service code, stores, preprocessor wiring, and Tauri server code embedded in the app. Partial removal would leave two overlapping systems. The migration plan needs an explicit cutover point and a cleanup phase.

### 4. Plugin maturity work should not get mixed into adapter packaging unnecessarily

The plugin UI stack can be improved later, but changing the plugin framework or adopting Bits UI/Radix during the adapter extraction would widen scope without reducing the main integration risk. Keep plugin-facing work focused on API compatibility and review/build ergonomics.

## Recommended Approach

Build a three-layer architecture:

1. Shared core package logic for task/review contracts, file store, routes, and optional screenshot service.
2. Thin framework adapters for Next.js and Svelte that provide runtime overlay and dev-server boot integration.
3. Host-level compatibility hooks for CID injection in unusual repos, with `origami-app` as the first migration target.

Then migrate `origami-app` fully off the embedded implementation once the packaged adapter reaches parity. Archive or remove the old overlay/preprocessor/backend code only after the packaged path is verified in the app.

## Bottom Line

The request is sound if the goal is a reusable Svelte adapter plus a real migration of `origami-app` onto shared package infrastructure. It becomes a mistake if the project simply republishes the current origami implementation. The plan should optimize for a stable public core, compatibility hooks at the edges, and a single server/data model across frameworks.
