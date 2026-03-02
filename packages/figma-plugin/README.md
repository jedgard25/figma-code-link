# Figma Code Link Plugin

Build-mode Figma plugin that connects to a local task server and queues Figma node tickets in `figma-tasks.json`.

Detailed architecture and flow documentation is available in `documentation.md`.

## Build & Package

- Build plugin artifacts into `dist/plugin/*`:

  ```bash
  npm run plugin:build
  ```

- Build and create a distributable zip:

  ```bash
  npm run plugin:package
  ```

Expected outputs:

- `packages/figma-plugin/dist/plugin/manifest.json`
- `packages/figma-plugin/dist/plugin/code.js`
- `packages/figma-plugin/dist/plugin/ui.html`
- `packages/figma-plugin/dist/figma-code-link-plugin.zip`

## Source Layout

The source of truth is now `packages/figma-plugin/src/`:

- `src/plugin/*` for Figma sandbox runtime
- `src/ui/*` for UI state/render/events/bridge modules
- `src/shared/messages.ts` for typed UI ↔ plugin message contracts

## Setup

1. In Figma desktop: **Plugins → Development → Import plugin from manifest...**
2. Select `packages/figma-plugin/dist/plugin/manifest.json`
3. In your host app, start the server (`npm run figma-link`) so `http://localhost:7842/health` is reachable
4. Run the plugin from **Plugins → Development → Figma Code Link**

## Usage

1. Open plugin and wait for server connection
2. In **Build** tab, click **Add to Queue**
3. Select a node on the Figma canvas and click **Continue**
4. Edit name/comments and click **Queue**
5. Manage queue via **Edit**, **Copy**, **Delete**, **Copy Set**, and **Clear All**
6. Use **Review** tab as a placeholder view (coming soon)

## Server API

- `GET /health`
- `GET /tasks`
- `POST /tasks`
- `PUT /tasks/:figmaNodeId`
- `DELETE /tasks/:figmaNodeId`
- `DELETE /tasks`

## Requirements

- Figma desktop app
- Local task server running on `http://localhost:7842`
