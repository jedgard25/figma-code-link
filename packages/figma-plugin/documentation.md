# Figma Code Link Plugin — Current State

This document describes the current plugin implementation after the Review-mode rollout.

---

## Overview

`packages/figma-plugin` is a modular plugin that:

- connects to local adapter server at `http://localhost:7842`
- supports Build, Review, Server, and Settings views
- manages both build tasks and review entries
- links unlinked DOM review entries to selected Figma nodes
- renders Figma thumbnails and proxied DOM screenshots

Source lives in `src/`. Build outputs are generated into `dist/plugin/`.

---

## Directory structure

```txt
packages/figma-plugin/
  manifest.json
  package.json
  tsconfig.json
  README.md
  documentation.md
  scripts/
    build-plugin.mjs
    package-plugin.mjs
  src/
    shared/
      messages.ts
    plugin/
      main.ts
      thumbnail.ts
      layer-tree.ts
    ui/
      index.html
      main.ts
      styles.css
      api/
        client.ts
      bridge/
        plugin-bridge.ts
      events/
        actions.ts
      render/
        views.ts
        modal.ts
        settings.ts
      state/
        store.ts
  dist/
    plugin/
      manifest.json
      code.js
      ui.html
    figma-code-link-plugin.zip
```

---

## Runtime architecture

### 1) Sandbox runtime (`src/plugin/*`)

Receives:

- `POLL_SELECTION`
- `EXPORT_THUMBNAIL`
- `EXPORT_LAYER_TREE`
- `NOTIFY`
- `CLOSE`

Responds with:

- `SELECTION_DATA`
- `THUMBNAIL_DATA`
- `THUMBNAIL_ERROR`
- `LAYER_TREE_DATA`
- `LAYER_TREE_ERROR`

### 2) Shared contracts (`src/shared/messages.ts`)

- canonical UI ↔ sandbox payload types
- shared `TaskEntry` shape including review fields:
  - `type`
  - `dataCid`
  - `domThumbnailPath`

### 3) UI app (`src/ui/*`)

`main.ts` orchestrates:

- health polling
- build and review refresh loops
- modal lifecycle for create/edit/link
- thumbnail requests and cache
- action dispatch (`copy`, `clear`, `delete`, `link`, `edit`)

---

## View behavior

### Build view

- queue cards for `GET /tasks`
- toolbar: `Add to Queue`, `Copy Set`, `Clear All`
- create/edit/delete/copy entry actions

### Review view

- review cards for `GET /review`
- linked/unlinked visual states
- unlinked action: `Link`
- linked action: `Edit`
- always available: `Delete`, `Copy`
- toolbar: `Copy Set`, `Clear All`

### Link flow (review)

1. user clicks `Link` on unlinked review card
2. modal enters `link` mode and polls selection
3. after selection, metadata step shows Figma + DOM previews
4. submit calls `PUT /review/:dataCid/link`
5. list refreshes and card becomes linked

---

## API usage from plugin

Build endpoints:

- `GET /tasks`
- `POST /tasks`
- `PUT /tasks/:figmaNodeId`
- `DELETE /tasks/:figmaNodeId`
- `DELETE /tasks`

Review endpoints:

- `GET /review`
- `PUT /review/:dataCid`
- `PUT /review/:dataCid/link`
- `DELETE /review/:dataCid`
- `DELETE /review`

Image proxy endpoint:

- `GET /review/screenshot/:filename`

---

## Layer Tree

When `Generate Layer Tree` is enabled in settings, selected nodes include:

- `layerTree`
- `componentsUsed`

on queue submission.

Reference:

- `docs/layer-tree-schema-reference.md`

---

## Build and packaging

Commands:

- `npm run plugin:build`
- `npm run plugin:package`

Generated outputs:

- `dist/plugin/manifest.json`
- `dist/plugin/code.js`
- `dist/plugin/ui.html`
- `dist/figma-code-link-plugin.zip`

Import in Figma from:

- `packages/figma-plugin/dist/plugin/manifest.json`

---

## Notes

- Legacy root files (`code.ts`, `code.js`, `ui.html`) are retired.
- `src/` is source of truth.
- `dist/` is generated output only.
