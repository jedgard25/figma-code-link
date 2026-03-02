# Figma Code Link — Current Application State

This document describes the current end-to-end system across:

- `packages/adapter-nextjs` (server + client overlay tooling)
- `packages/figma-plugin` (Build and Review UI in Figma)
- consumer integration (for example `evin-drews-site`)

The product now supports both Build mode and Review mode.

---

## What shipped

### Build mode

- Create tasks from Figma selection in the plugin
- Persist tasks in `figma-tasks.json`
- Edit, delete, copy, copy-set, clear-all from plugin UI
- Optional Layer Tree capture for richer implementation context

### Review mode

- Create review entries from the website DOM via `DomReviewOverlay`
- Persist review entries in the same `figma-tasks.json` file using `type: "review"`
- Capture DOM screenshots to `.figma-link/screens/*.png` (not JSON)
- Link a DOM review entry to a Figma node in the plugin
- Render linked and unlinked review cards differently in plugin UI

---

## Data model (v2)

`figma-tasks.json` remains the single file of record.

```json
{
  "version": 2,
  "entries": [
    {
      "type": "build",
      "figmaNodeId": "123:456",
      "figmaNodeName": "Button / Primary",
      "comment": "Build this variant",
      "status": "to-build"
    },
    {
      "type": "review",
      "dataCid": "components/Button.tsx:38",
      "figmaNodeId": "123:999",
      "figmaNodeName": "Button / Primary",
      "domThumbnailPath": ".figma-link/screens/components_Button.tsx_38.png",
      "comment": "Padding mismatch",
      "status": "to-fix"
    }
  ]
}
```

Core fields:

- `type`: `"build" | "review"`
- `figmaNodeId?`, `figmaNodeName?`
- `dataCid?`
- `domThumbnailPath?`
- `comment?`
- `status`: `"to-build" | "to-fix" | "review" | "completed"`

---

## Adapter package (`packages/adapter-nextjs`)

Public exports:

- `startFigmaLinkServer`
- `FigmaCodeLink`
- `DomReviewOverlay`
- `cidPreprocessor`

### CID preprocessor

- Babel plugin for dev mode
- Injects `data-cid="<relative-src-path>:<line>"` into JSX elements missing `data-cid`
- Never overwrites explicit `data-cid`

### DOM review overlay

- Dev-only UI toggle in browser
- Hover highlight for nearest `[data-cid]`
- Click opens comment/status popup
- Save flow:
  1. `POST /review`
  2. optional `html2canvas` capture
  3. `POST /review/screenshot`

---

## Server API (`localhost:7842`)

### Health

- `GET /health`

### Build tasks

- `GET /tasks`
- `POST /tasks`
- `PUT /tasks/:figmaNodeId`
- `DELETE /tasks/:figmaNodeId`
- `DELETE /tasks`

### Review entries

- `GET /review`
- `POST /review`
- `PUT /review/:dataCid`
- `PUT /review/:dataCid/link`
- `DELETE /review/:dataCid`
- `DELETE /review`

### Review screenshots

- `POST /review/screenshot`
- `GET /review/screenshot/:filename`

Screenshot files are written to:

- `.figma-link/screens/<sanitized-cid>.png`

---

## Plugin architecture (`packages/figma-plugin`)

Source is modular under `src/` and built to `dist/plugin/`.

### Runtime areas

- `src/plugin/*`: sandbox runtime (`figma` API)
- `src/shared/messages.ts`: UI ↔ sandbox contracts
- `src/ui/*`: app state/render/events/api/orchestrator

### Plugin views

- `server`: waits for adapter server
- `build`: create and manage build queue
- `review`: manage review entries, link/edit/delete/copy
- `settings`: feature toggles (for example Layer Tree capture)

### Additional sandbox messages

In addition to selection and thumbnail messaging, the plugin supports:

- `EXPORT_LAYER_TREE`
- `LAYER_TREE_DATA`
- `LAYER_TREE_ERROR`

---

## Build and packaging

Root commands:

- `npm run plugin:build`
- `npm run plugin:package`

Build output:

- `packages/figma-plugin/dist/plugin/manifest.json`
- `packages/figma-plugin/dist/plugin/code.js`
- `packages/figma-plugin/dist/plugin/ui.html`
- `packages/figma-plugin/dist/figma-code-link-plugin.zip`

Figma import path:

- `packages/figma-plugin/dist/plugin/manifest.json`

---

## Consumer integration notes

Typical Next.js usage:

- mount `FigmaCodeLink` + `DomReviewOverlay` in `layout.tsx`
- run local server via `figma-link-server`
- configure Babel to load `figma-code-link-nextjs/dist/babel/cid-preprocessor` in development
- ignore `.figma-link/` in `.gitignore`

---

## Related docs

- `docs/layer-tree-schema-reference.md`
- `docs/Update: Review Mode/implementation-plan.md`
- `docs/Update: Review Mode/log.md`
