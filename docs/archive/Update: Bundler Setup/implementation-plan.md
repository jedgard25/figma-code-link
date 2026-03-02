# Figma Plugin Bundler Setup — Implementation Plan

> Scope plan for splitting `packages/figma-plugin/ui.html` into maintainable source files and producing a packaged plugin artifact via one command.

---

## Context Snapshot

- Current plugin UI is monolithic: `packages/figma-plugin/ui.html` contains styles + app state + render logic + event wiring + API calls in one file (~1k lines).
- Plugin sandbox logic is in `packages/figma-plugin/code.ts` and mirrored manually in `code.js`.
- `packages/figma-plugin/` currently has no package-level build tooling or scripts.
- Desired outcome: elegant file split + simple build command that outputs deliverable plugin package.

---

## Tooling Decision (Recommended)

Use **esbuild + small Node packaging script** for the plugin package.

Why this is the best fit for current repo:

- Minimal tooling footprint and fast builds.
- Easy to adopt without introducing framework-heavy UI assumptions.
- Works with current vanilla plugin UI architecture while still allowing modular TS/CSS files.
- Keeps output deterministic (`code.js`, `ui.html`, optional `assets/*`) for Figma manifest compatibility.

---

## Target Architecture

### Source Structure (authoring)

- `packages/figma-plugin/src/plugin/main.ts`
- `packages/figma-plugin/src/plugin/thumbnail.ts`
- `packages/figma-plugin/src/shared/messages.ts`
- `packages/figma-plugin/src/ui/index.html`
- `packages/figma-plugin/src/ui/main.ts`
- `packages/figma-plugin/src/ui/styles.css`
- `packages/figma-plugin/src/ui/state/store.ts`
- `packages/figma-plugin/src/ui/api/client.ts`
- `packages/figma-plugin/src/ui/render/views.ts`
- `packages/figma-plugin/src/ui/render/modal.ts`
- `packages/figma-plugin/src/ui/events/actions.ts`
- `packages/figma-plugin/src/ui/bridge/plugin-bridge.ts`

### Build Output (deliverable)

- `packages/figma-plugin/dist/plugin/manifest.json`
- `packages/figma-plugin/dist/plugin/code.js`
- `packages/figma-plugin/dist/plugin/ui.html`
- `packages/figma-plugin/dist/plugin/assets/*` (if emitted)
- `packages/figma-plugin/dist/figma-code-link-plugin.zip`

---

## Phase 1 — Build Scaffold

### Step 1.1

| Field         | Value                                                                                                                        |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Agent**     | Tooling                                                                                                                      |
| **Deps**      | None                                                                                                                         |
| **Context**   | Plugin package has no `package.json` and no build scripts.                                                                   |
| **What**      | Add package-local tooling + scripts for clean/build/package flow.                                                            |
| **How/Where** | Create `packages/figma-plugin/package.json`, `tsconfig.json`, and `scripts/build-plugin.mjs` + `scripts/package-plugin.mjs`. |
| **Contract**  | `npm run -w packages/figma-plugin build` produces dist plugin files with fixed names.                                        |

### Step 1.2

| Field         | Value                                                                                                                |
| ------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Agent**     | Architecture                                                                                                         |
| **Deps**      | 1.1                                                                                                                  |
| **Context**   | Current source files are root-level (`ui.html`, `code.ts`) and tightly coupled.                                      |
| **What**      | Create `src/` layout with explicit module boundaries for plugin runtime, shared message types, and UI layers.        |
| **How/Where** | Add folder tree under `packages/figma-plugin/src/` and move code with behavior parity first.                         |
| **Contract**  | Source of truth is `src/`; legacy root files become generated outputs only (or are removed after parity validation). |

### Step 1.3

| Field         | Value                                                                                                                             |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Agent**     | Tooling                                                                                                                           |
| **Deps**      | 1.1, 1.2                                                                                                                          |
| **Context**   | Figma expects `manifest.json` references to real output files.                                                                    |
| **What**      | Implement deterministic build pipeline for `code.js`, `ui.html`, and copied manifest.                                             |
| **How/Where** | Use esbuild to bundle TS entries, copy/transform `src/ui/index.html` into dist, and copy `manifest.json` into dist plugin folder. |
| **Contract**  | Dist folder is directly importable in Figma via `dist/plugin/manifest.json`.                                                      |

---

## Phase 2 — UI Decomposition (Behavior Parity)

### Step 2.1

| Field         | Value                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Agent**     | Frontend                                                                                                            |
| **Deps**      | 1.2                                                                                                                 |
| **Context**   | UI currently mixes rendering, state, events, fetch, and bridge concerns in one script block.                        |
| **What**      | Split UI into state/API/render/events/bridge modules without changing UX or API behavior.                           |
| **How/Where** | Migrate logic from old `ui.html` script into `src/ui/*` modules; keep existing views and interactions identical.    |
| **Contract**  | All existing flows remain intact: server waiting, build/review tabs, add-to-queue modal, copy/delete/clear actions. |

### Step 2.2

| Field         | Value                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------- |
| **Agent**     | Integration                                                                                       |
| **Deps**      | 2.1                                                                                               |
| **Context**   | UI ↔ sandbox message types are stringly-typed and easy to drift.                                  |
| **What**      | Create shared message contracts and align both sides to one typed schema.                         |
| **How/Where** | Define message unions in `src/shared/messages.ts`; consume in both `src/plugin/*` and `src/ui/*`. |
| **Contract**  | No protocol drift; compile-time validation for message handlers and payloads.                     |

### Step 2.3

| Field         | Value                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Agent**     | QA                                                                                                                  |
| **Deps**      | 2.1, 2.2                                                                                                            |
| **Context**   | Modular migration can introduce silent runtime regressions.                                                         |
| **What**      | Run behavior-parity validation checklist before deleting legacy source files.                                       |
| **How/Where** | Verify selection polling, thumbnail export, queue CRUD actions, copy actions, and health polling manually in Figma. |
| **Contract**  | New modular source is proven equivalent to current behavior.                                                        |

---

## Phase 3 — Deliverable Packaging + DX

### Step 3.1

| Field         | Value                                                                                         |
| ------------- | --------------------------------------------------------------------------------------------- |
| **Agent**     | Tooling                                                                                       |
| **Deps**      | 1.3, 2.3                                                                                      |
| **Context**   | Need one easy command for a shippable plugin bundle.                                          |
| **What**      | Add packaging script that zips the plugin dist payload.                                       |
| **How/Where** | `packages/figma-plugin/scripts/package-plugin.mjs` creates `dist/figma-code-link-plugin.zip`. |
| **Contract**  | Zip contains `manifest.json`, `code.js`, `ui.html`, and emitted assets.                       |

### Step 3.2

| Field         | Value                                                                  |
| ------------- | ---------------------------------------------------------------------- |
| **Agent**     | Infra                                                                  |
| **Deps**      | 3.1                                                                    |
| **Context**   | Root scripts should offer a simple entry point for daily usage.        |
| **What**      | Add root-level command aliases for plugin build and package flows.     |
| **How/Where** | Update root `package.json` with `plugin:build` and `plugin:package`.   |
| **Contract**  | One command to generate deliverable package: `npm run plugin:package`. |

### Step 3.3

| Field         | Value                                                                                   |
| ------------- | --------------------------------------------------------------------------------------- |
| **Agent**     | Docs                                                                                    |
| **Deps**      | 3.2                                                                                     |
| **Context**   | Team needs clear import/build instructions after migration.                             |
| **What**      | Update plugin docs to reflect new source/build workflow and Figma import path.          |
| **How/Where** | Update `packages/figma-plugin/README.md` and add quick commands + expected output list. |
| **Contract**  | New contributor can build and import plugin artifact with no tribal knowledge.          |

---

## Risks and Mitigations

- **Risk:** UI message contract drift between sandbox and iframe.
  - **Mitigation:** Shared typed message definitions + exhaustive handler switches.
- **Risk:** Build output filename mismatch with manifest references.
  - **Mitigation:** Fixed output names and post-build validation in script.
- **Risk:** Event/timer leaks during modularization.
  - **Mitigation:** Central lifecycle manager for selection/health polling timers.
- **Risk:** Scope creep into UX changes.
  - **Mitigation:** Phase 2 enforces strict behavior parity before enhancements.

---

## Acceptance Checklist (Mapped to Request)

- [ ] `ui.html` monolith replaced by modular source tree under `packages/figma-plugin/src/ui/*`
- [ ] Plugin sandbox code modularized under `packages/figma-plugin/src/plugin/*`
- [ ] Build output generated into deterministic deliverable folder (`dist/plugin/*`)
- [ ] Simple one-command package build exists at repo root: `npm run plugin:package`
- [ ] Figma import works from `packages/figma-plugin/dist/plugin/manifest.json`
- [ ] Existing plugin behavior still works end-to-end after split
