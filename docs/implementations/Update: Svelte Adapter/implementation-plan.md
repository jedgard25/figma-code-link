# Implementation Plan — Svelte Adapter

## Context

Deliver a packaged Svelte adapter for Figma Code Link, align it with the existing Next.js adapter architecture, and migrate `origami-app` off its embedded adapter implementation. The critical design constraint is CID injection safety in large Svelte codebases: the package must be stable by default and configurable at the edges, not hard-coded to `origami-app`'s current complexity.

Key conclusions from review:

- Reuse one shared task/review server and storage model across Next.js and Svelte.
- Keep framework-specific logic thin: runtime overlay, dev boot integration, and CID preprocessing hooks.
- Ship a conservative Svelte CID preprocessor plus compatibility hooks, rather than baking all `origami-app` edge handling into the default package behavior.
- Auto-start the local server from framework dev mode where possible, while keeping a standalone CLI/programmatic fallback.
- Migrate `origami-app` fully to the packaged adapter, then delete/archive the embedded implementation in one cleanup phase.

## Phase 1 — Package Architecture Alignment

### Step 1.1

**Agent:** backend  
**Deps:** none  
**Context:**

- `packages/adapter-nextjs/src/server/*`
- `packages/adapter-nextjs/src/types.ts`
- `packages/figma-plugin/src/shared/messages.ts`
- `docs/architecture.md`

**What:** Extract and normalize the framework-agnostic adapter core used by both adapters.

**How/Where:**

- Define a shared core surface for task/review contracts, file persistence, route registration, and server startup options.
- Keep `figma-tasks.json` as SSOT and retain the current review/build unified data model.
- Ensure screenshot handling is optional and does not block core adapter usage.
- Refactor `adapter-nextjs` to consume the shared core instead of owning server logic directly.

**Contract:** A reusable server/core module consumed by both Next.js and Svelte adapters with one task schema and one REST API.

### Step 1.2

**Agent:** backend  
**Deps:** none  
**Context:**

- `packages/adapter-nextjs/package.json`
- `packages/adapter-nextjs/src/bin/figma-link-server.ts`

**What:** Define package boundaries and dependency policy for the Svelte adapter release.

**How/Where:**

- Create a new package under `packages/adapter-svelte/`.
- Mirror the export structure of `adapter-nextjs`: runtime component(s), CID preprocessor/plugin entry, dev integration entry, and server helpers.
- Move screenshot capture away from end-user peer dependency friction: default capture dependency bundled in the adapter package or wrapped internally behind an optional feature flag.
- Preserve the standalone server/bin entry as a fallback for nonstandard environments.

**Contract:** Clear public API and dependency strategy for `adapter-svelte`, with shared expectations across both framework adapters.

## Phase 2 — Svelte CID Strategy

### Step 2.1

**Agent:** frontend-infra  
**Deps:** Step 1.1  
**Context:**

- `origami-app/src/lib/preprocessors/cidPreprocessor.ts`
- `origami-app/svelte.config.js`
- Svelte compiler/preprocessor constraints

**What:** Design and implement the package CID injection strategy for Svelte.

**How/Where:**

- Build a conservative Svelte preprocessor for dev mode that targets native elements only and never overwrites explicit `data-cid`.
- Support stable CID generation based on normalized relative path plus source line.
- Skip component tags and any markup regions known to be unsafe for automated injection.
- Document manual `data-cid` as the compatibility escape hatch.

**Contract:** Safe default CID injection for standard Svelte repos that does not assume `origami-app` specifics.

### Step 2.2

**Agent:** frontend-infra  
**Deps:** Step 2.1  
**Context:**

- `origami-app/src/lib/preprocessors/cidPreprocessor.ts`
- anticipated host-repo variation across Svelte apps

**What:** Add compatibility hooks so complex repos can adapt CID behavior without forking the package.

**How/Where:**

- Expose preprocessor options for include/exclude path filtering, source-root resolution, and CID formatting.
- Support explicit opt-out markers or config predicates for files/components the preprocessor should skip.
- Keep the hook surface small and deterministic; do not expose parser internals as API.
- Document when manual `data-cid` annotation is preferable to more automation.

**Contract:** A minimal compatibility layer that lets `origami-app` integrate cleanly without forcing package consumers into the same complexity.

## Phase 3 — Svelte Runtime and Dev Integration

### Step 3.1

**Agent:** frontend  
**Deps:** Step 1.1  
**Context:**

- `origami-app/src/lib/components/FigmaLinkOverlay.svelte`
- Next.js adapter runtime component design

**What:** Build the packaged Svelte overlay/runtime layer.

**How/Where:**

- Port the runtime behavior, not the app-specific implementation details: element targeting via `[data-cid]`, hover highlight, review save flow, linked/unlinked visual states, and plugin-facing server communication.
- Keep the component self-contained with package-owned styles and explicit dev-only gating.
- Reuse the shared task/review server API from Phase 1.
- Support optional screenshot capture through the shared capture boundary.

**Contract:** A packaged Svelte overlay component that can be mounted in a host app with no dependency on `origami-app` stores or Tauri APIs.

### Step 3.2

**Agent:** frontend-infra  
**Deps:** Step 1.1, Step 2.1  
**Context:**

- `origami-app/svelte.config.js`
- Vite/SvelteKit dev server lifecycle
- `packages/adapter-nextjs/src/server/index.ts`

**What:** Implement framework-native dev boot integration for Svelte.

**How/Where:**

- Add a Svelte/Vite integration entry that starts the Figma Link server automatically in dev mode and avoids duplicate boot on HMR restarts.
- Make port/file-path configurable while defaulting to the existing local behavior.
- Preserve an explicit manual startup path for unsupported workflows.

**Contract:** A Svelte integration path where `npm run dev` is sufficient to bring up both the app and the Figma Link server in normal development.

### Step 3.3

**Agent:** backend  
**Deps:** Step 1.1  
**Context:**

- `packages/adapter-nextjs/src/server/routes.ts`
- screenshot/review endpoints already used by the plugin

**What:** Finalize screenshot and review endpoint behavior so both adapters expose the same runtime capabilities.

**How/Where:**

- Keep review CRUD and screenshot proxying framework-agnostic.
- Ensure screenshot capture is best-effort and never blocks saving review entries.
- Verify that plugin expectations remain unchanged across Next.js and Svelte hosts.

**Contract:** One stable HTTP interface for the plugin and browser overlays, independent of framework.

## Phase 4 — Origami-App Migration

### Step 4.1

**Agent:** integration  
**Deps:** Step 2.2, Step 3.1, Step 3.2  
**Context:**

- `origami-app/src/routes/+layout.svelte`
- `origami-app/svelte.config.js`
- `origami-app/src/lib/components/FigmaLinkOverlay.svelte`
- `origami-app/src/lib/services/figmaLink.service.ts`
- `origami-app/src/lib/stores.ts`
- `origami-app/src-tauri/src/commands/figma_link.rs`
- `origami-app/src-tauri/src/main.rs`

**What:** Replace the embedded adapter usage in `origami-app` with the packaged Svelte adapter.

**How/Where:**

- Install and wire `packages/adapter-svelte` into `origami-app`.
- Replace local overlay imports/usages with the packaged runtime component.
- Replace direct local CID preprocessor wiring with the packaged preprocessor/integration entry.
- Configure any `origami-app`-specific compatibility hooks discovered in Phase 2.
- Switch the app off the Tauri-backed local HTTP server path and onto the shared Node-side Figma Link server integration.

**Contract:** `origami-app` runs entirely on the packaged Svelte adapter flow with any necessary compatibility config isolated at the integration boundary.

### Step 4.2

**Agent:** integration  
**Deps:** Step 4.1  
**Context:**

- same files as Step 4.1
- `origami-app/src/lib/api.ts`
- `origami-app/src/lib/types.ts`
- `origami-app/src/app.css`

**What:** Remove or archive the superseded embedded adapter implementation.

**How/Where:**

- Delete or archive the local overlay component, service layer, preprocessor files, related stores/types, and Tauri Figma Link backend code that are no longer used.
- Remove dead feature flags and app CSS specific to the old overlay if they no longer apply.
- Keep the cleanup atomic with the migration so the app does not retain two competing integration paths.

**Contract:** `origami-app` contains one Figma Link integration path only: the packaged Svelte adapter.

## Phase 5 — Validation and Documentation

### Step 5.1

**Agent:** qa  
**Deps:** Step 4.2  
**Context:**

- `origami-app`
- `packages/adapter-svelte`
- `packages/figma-plugin`

**What:** Validate the end-to-end Svelte adapter workflow against the real target app.

**How/Where:**

- Verify dev boot: one normal app dev command starts the app and Figma Link server.
- Verify CID coverage on representative `origami-app` screens, including known complex markup areas.
- Verify review creation, screenshot capture behavior, plugin linking flow, persistence, reload behavior, and cleanup.
- Verify the app build remains stable in production mode with the adapter disabled or stripped appropriately.

**Contract:** A verified migration with known compatibility gaps documented before release.

### Step 5.2

**Agent:** docs  
**Deps:** Step 5.1  
**Context:**

- `packages/adapter-nextjs`
- `packages/adapter-svelte`
- `packages/figma-plugin`
- top-level docs for both repos

**What:** Document the mature installation story for both Next.js and Svelte.

**How/Where:**

- Update package README/docs with quick-start instructions, auto-start behavior, fallback manual server startup, compatibility hook usage, and screenshot behavior.
- Document the migration outcome for `origami-app` as the reference Svelte integration.
- Explicitly call out when manual `data-cid` values are recommended.

**Contract:** Installation and migration docs that match the shipped architecture and reduce end-user setup friction.

## Deliverables Checklist

- `packages/adapter-svelte` exists and mirrors the mature capabilities of the Next.js adapter.
- Shared adapter server/core logic is reused across frameworks.
- Svelte CID injection ships with a safe default and a small compatibility layer.
- Dev-mode server auto-start is available for Svelte and remains supported for Next.js improvements.
- End-user screenshot support no longer depends on awkward peer setup for the core flow.
- `origami-app` is migrated onto the packaged Svelte adapter.
- Embedded origami-specific adapter code is removed or archived after cutover.
- End-to-end review/build workflow is validated with the Figma plugin.
