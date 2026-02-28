# Figma Code Link Plugin

Build-mode Figma plugin that connects to a local task server and queues Figma node tickets in `figma-tasks.json`.

## Setup

1. In Figma desktop: **Plugins → Development → Import plugin from manifest...**
2. Select `packages/figma-plugin/manifest.json`
3. In your host app, start the server (`npm run figma-link`) so `http://localhost:7842/health` is reachable
4. Run the plugin from **Plugins → Development → Figma Code Link**

## Usage

1. Open plugin and wait for server connection
2. In **Build** tab, click **Add to Queue**
3. Select a node on the Figma canvas and click **Continue**
4. Edit name/comments and click **Queue**
5. Manage queue via **Copy**, **Delete**, **Copy Set**, and **Clear All**
6. Use **Review** tab as a placeholder view (coming soon)

## Server API

- `GET /health`
- `GET /tasks`
- `POST /tasks`
- `PUT /tasks/:entryId`
- `DELETE /tasks/:entryId`
- `DELETE /tasks`

## Requirements

- Figma desktop app
- Local task server running on `http://localhost:7842`
