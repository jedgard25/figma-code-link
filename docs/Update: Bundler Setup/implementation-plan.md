# Figma Code Link — Update: Bundler Setup (Implementation Plan)

> Plan to move the plugin UI from a large single-file `ui.html` into a maintainable bundled setup while keeping current behavior unchanged.

---

## Goal

Introduce a lightweight bundler workflow for `packages/figma-plugin` so we can:

- split UI code into modules (`ui.ts`, views, api, state, styles)
- keep `code.ts` (plugin sandbox) clear and testable
- output the same final artifacts required by Figma (`ui.html`, `code.js`, `manifest.json`)
- preserve existing UX/flows (Build mode + thumbnails + queue actions)

Non-goal for this update: redesigning plugin UX or changing server API behavior.

---

## Current Pain Points

- `ui.html` is large and hard to safely edit.
- Inline CSS + JS makes regressions more likely.
- No clean boundary between rendering, state transitions, API calls, and sandbox messaging.

---

## Target Architecture

`packages/figma-plugin/`

- `src/code.ts` — Figma sandbox runtime (selection polling, export thumbnail, notify, close)
- `src/ui/index.html` — minimal HTML shell
- `src/ui/main.ts` — UI bootstrap
- `src/ui/state.ts` — central state model + updates
- `src/ui/api.ts` — server client for `:7842`
- `src/ui/sandbox.ts` — `postMessage` bridge helpers
- `src/ui/render/*.ts` — per-view render functions
- `src/ui/styles.css` — plugin styles
- `dist/` — generated outputs
  - `dist/code.js`
  - `dist/ui.html`

Build tool output is copied/synced so manifest still references:

- `main: "code.js"`
- `ui: "ui.html"`

---

## Tooling Decision (Recommended)

Use **esbuild** with one small build script.

Why:

- minimal config and very fast iteration
- easy HTML/CSS/TS bundling pattern
- no framework overhead
- watch mode is straightforward

Alternative: Vite can also work, but is heavier than needed for this plugin scope.

---

## Implementation Phases

## Phase 1 — Bundler Scaffold

1. Add plugin-local dev dependencies (`esbuild`, optional `chokidar` for copy/watch helpers).
2. Add build script file (example: `scripts/build-plugin.mjs`).
3. Build `src/code.ts` -> `code.js`.
4. Build UI TS/CSS bundle and inject into generated `ui.html`.
5. Confirm `manifest.json` still points to `code.js` and `ui.html`.

Deliverable: one command produces plugin-loadable artifacts.

## Phase 2 — Extract UI from monolithic `ui.html`

1. Move inline `<style>` to `src/ui/styles.css`.
2. Move inline `<script>` logic to `src/ui/main.ts` + modules.
3. Keep HTML shell minimal (`#app` root + script/style references handled by bundler).
4. Preserve all current behaviors exactly:
   - server health polling
   - queue fetch and actions
   - add-to-queue modal flow
   - selection polling
   - thumbnail request/response handling
   - focus stability behavior

Deliverable: feature parity with improved code organization.

## Phase 3 — Dev Workflow Quality

1. Add scripts in `packages/figma-plugin/package.json`:
   - `build`
   - `watch`
2. Add root helper script in repo `package.json` (optional):
   - `build:plugin`
3. Document “edit -> build/watch -> reload plugin” loop in plugin README.

Deliverable: clear daily workflow without manual file surgery.

---

## Acceptance Criteria

- `npm run build` in `packages/figma-plugin` emits working `code.js` + `ui.html`.
- Figma can import/run plugin using existing `manifest.json`.
- Current Build mode behavior is unchanged from user perspective.
- Thumbnail export/render works for valid selected nodes.
- Input focus remains stable while typing in modal fields.
- Plugin README contains concise build/watch instructions.

---

## Risks + Mitigations

1. **Risk:** Asset path mismatches break plugin load.
   - **Mitigation:** Output files directly into plugin root (or copy from `dist` as final step).

2. **Risk:** Bundle introduces runtime differences vs inline script.
   - **Mitigation:** Keep state/message protocol identical; migrate in small modules with parity checks.

3. **Risk:** Watch flow creates stale artifacts.
   - **Mitigation:** Clean output at build start and log emitted file paths each run.

---

## Validation Checklist

1. Build plugin artifacts.
2. Re-import/reload plugin in Figma.
3. Verify disconnected server view appears when server is down.
4. Start server and verify queue loads.
5. Add item from selection; verify thumbnail appears.
6. Type in metadata fields for >10 seconds; ensure no focus loss.
7. Delete/copy/clear actions still work.

---

## Suggested Next Command Sequence (when implementing)

From `packages/figma-plugin`:

```bash
npm install
npm run build
```

For active iteration:

```bash
npm run watch
```

Then in Figma desktop, reload the development plugin and verify flows.
