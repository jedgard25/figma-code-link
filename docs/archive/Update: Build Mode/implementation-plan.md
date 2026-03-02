# Figma Code Link — Implementation Plan

> Phased plan for building `adapter-nextjs`, rewriting the Figma plugin (Build mode), and integrating into `evin-drews-site` via yalc.

---

## Context

We have an MVP "Review" mode plugin (single-entry flag → link wizard) living in `figma-code-link/packages/figma-plugin/`. The adapter-nextjs scaffold is empty. The `evin-drews-site` repo is a Next.js 16 landing page (React 19, React Compiler, vanilla CSS, no Tailwind).

**Goal:** Ship a working Build-mode plugin with a task queue, backed by a real `adapter-nextjs` package that runs a localhost server, manages `figma-tasks.json`, and installs into the Next.js repo via `yalc`.

---

## Phase 1 — Monorepo Scaffold + `adapter-nextjs`

> **No deps.** All steps can run in parallel.

### Step 1.1 — Monorepo Root

| Field | Value |
|-------|-------|
| **Agent** | Infrastructure |
| **Deps** | None |
| **Context** | Repo currently has no root [package.json](file:///Users/evindrews/Documents/evin-drews-site/package.json) or workspace config. Just `docs/` and `packages/`. |
| **What** | Create root monorepo scaffold so `packages/*` are workspaces. |
| **How/Where** | Create root [package.json](file:///Users/evindrews/Documents/evin-drews-site/package.json) with `"workspaces": ["packages/*"]`, root [.gitignore](file:///Users/evindrews/Documents/evin-drews-site/.gitignore) (node_modules, dist, .DS_Store), and root `tsconfig.base.json` for shared TS config. |
| **Contract** | All packages can reference shared TS config; `npm install` from root installs all workspace deps. |

### Step 1.2 — `adapter-nextjs` Package Structure

| Field | Value |
|-------|-------|
| **Agent** | Backend |
| **Deps** | None |
| **Context** | `packages/adapter-nextjs/` exists with empty `src/index.ts` and minimal `package.json`. Current `evin-drews-site` uses Next.js 16, React 19, React Compiler, vanilla CSS. The adapter should be a dev-only package. |
| **What** | Build the complete `adapter-nextjs` package that exports: (1) an HTTP server, (2) `figma-tasks.json` file management, (3) a React overlay component. |
| **How/Where** | `packages/adapter-nextjs/src/` — see file structure below. |
| **Contract** | Exports `FigmaCodeLink` (React client component for `layout.tsx`), `startFigmaLinkServer()` (standalone Express server on `:7842`), and file-based CRUD for `figma-tasks.json`. |

#### File Structure

```
packages/adapter-nextjs/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                 # Re-exports public API
│   ├── server/
│   │   ├── index.ts             # startFigmaLinkServer() — Express on :7842
│   │   ├── routes.ts            # Route handlers (GET/POST/PUT/DELETE /tasks, health)
│   │   └── store.ts             # figma-tasks.json read/write/CRUD
│   ├── components/
│   │   └── FigmaCodeLink.tsx    # "use client" — overlay FAB (dev-only)
│   └── types.ts                 # Shared types (TaskEntry, TaskStatus, etc.)
└── dist/                        # Built output (gitignored)
```

#### `figma-tasks.json` Schema

```json
{
  "version": 1,
  "entries": [
    {
      "entryId": "uuid-v4",
      "figmaNodeId": "1234:567",
      "figmaNodeName": "Button / Primary",
      "comment": "This button doesn't look right",
      "status": "to-build",
      "timestamp": "2026-02-28T12:05:00Z"
    }
  ]
}
```

**Status values:** `"to-build"` | `"to-fix"` | `"review"` | `"completed"`

#### Server API Contract

| Method | Path | Body | Purpose |
|--------|------|------|---------|
| `GET` | `/health` | — | Returns `{ ok: true }` (connection check for plugin) |
| `GET` | `/tasks` | — | Returns full `figma-tasks.json` contents |
| `POST` | `/tasks` | `{ figmaNodeId, figmaNodeName, comment?, status? }` | Creates new entry (generates `entryId` + `timestamp`), writes to file, returns created entry |
| `PUT` | `/tasks/:entryId` | `{ comment?, status?, figmaNodeId?, figmaNodeName? }` | Updates entry fields, writes to file |
| `DELETE` | `/tasks/:entryId` | — | Removes single entry |
| `DELETE` | `/tasks` | — | Clears all entries (resets to empty array) |

> All mutations write to `figma-tasks.json` in the host project root (or `docs/` — configurable via `filePath` option). CORS fully permissive for `localhost` origins.

#### Server Implementation Notes

- Use **Express** (lightweight, zero-config) — not Next.js API routes, because the server must run on a fixed port (`:7842`) independent of the Next.js dev server port.
- Server auto-creates `figma-tasks.json` on first write if it doesn't exist.
- Server can be started via a simple Node script: `node ./node_modules/figma-code-link-nextjs/dist/server/index.js` or programmatically.
- Dev-only: the `FigmaCodeLink` component conditionally renders nothing in production (`process.env.NODE_ENV !== 'development'`).
- Include a `bin` entry in `package.json` so users can run `npx figma-link-server` to start it.

#### `FigmaCodeLink` React Component

Minimal for Phase 1 — just the server connection indicator:

- `"use client"` directive
- Renders only in `development` mode
- Small fixed-position FAB (bottom-right corner) showing connection status
- Polls `/health` every 5s to show green/red dot
- Clicking opens a small popover listing current task count from `/tasks`
- This is the "review" mode stub — visual only, no CID overlay (CID preprocessing is deferred to Phase 3)

### Step 1.3 — Build & Publish via yalc

| Field | Value |
|-------|-------|
| **Agent** | Infrastructure |
| **Deps** | 1.1, 1.2 |
| **Context** | `evin-drews-site` is the test host. yalc enables local package development without npm publish. |
| **What** | Build `adapter-nextjs`, publish to yalc, install into `evin-drews-site`, integrate into `layout.tsx`, add server start script. |
| **How/Where** | |
| **Contract** | `evin-drews-site` can `npm run dev` and simultaneously run the figma-link server; the `FigmaCodeLink` component renders in the browser; the figma-plugin can connect. |

**Integration Steps:**

1. In `packages/adapter-nextjs/`: `npm run build` → `yalc publish`
2. In `evin-drews-site/`: `yalc add figma-code-link-nextjs --dev`
3. Add to `layout.tsx`:
   ```tsx
   import { FigmaCodeLink } from 'figma-code-link-nextjs';
   // inside <body>:
   <FigmaCodeLink />
   {children}
   ```
4. Add a convenience script to `package.json`:
   ```json
   "scripts": {
     "figma-link": "figma-link-server"
   }
   ```
5. Verify: `npm run dev` + `npm run figma-link` → FAB shows green dot in browser, `GET /tasks` returns empty queue.

---

## Phase 2 — Figma Plugin Rewrite (Build Mode)

> **Deps:** Phase 1 complete (server running, API available).

### Step 2.1 — Plugin Scaffold & Multi-Screen Architecture

| Field | Value |
|-------|-------|
| **Agent** | Frontend (Figma Plugin) |
| **Deps** | 1.2 (API contract finalized) |
| **Context** | Current plugin is a single-file `ui.html` (362 lines) with inline CSS/JS and a 3-state machine (`waiting → flagged → success`). Rewriting to a multi-screen architecture with `Build` mode as the primary flow. Plugin runs in a sandboxed iframe — no build step, no npm, just vanilla HTML/CSS/JS. |
| **What** | Rewrite `ui.html` to support multiple views, a navbar, and the full Build-mode queue flow. Rewrite `code.ts` to support new message types. Update `manifest.json` naming. |
| **How/Where** | `packages/figma-plugin/ui.html`, `packages/figma-plugin/code.ts`, `packages/figma-plugin/manifest.json` |
| **Contract** | Plugin connects to `:7842`, displays task queue, supports full CRUD lifecycle for entries. |

### Step 2.2 — App Design Specification

> This section is the primary design reference. All screens, components, and flows are defined here.

#### Window & Layout

- Plugin window: **360 × 540px** (`figma.showUI({ width: 360, height: 540 })`)
- Layout: vertical flex column — `navbar` (fixed top) → `content area` (scrollable, flex: 1) → `toolbar` (fixed bottom)
- Font: `-apple-system, BlinkMacSystemFont, 'Inter', sans-serif` at `12px` base
- Colors:
  - Background: `#FFFFFF`
  - Text primary: `#1A1A1A`
  - Text secondary: `#888888`
  - Text muted: `#AAAAAA`
  - Border: `#E5E5E5`
  - Primary accent: `#7C6DF0` (purple — existing brand)
  - Primary hover: `#6B5CE0`
  - Danger: `#DC2626`
  - Success: `#22C55E`
  - Status tags:
    - `to-build`: `bg: #FEF3C7` / `text: #92400E` (amber)
    - `to-fix`: `bg: #FEE2E2` / `text: #991B1B` (red)
    - `review`: `bg: #E0E7FF` / `text: #3730A3` (indigo)
    - `completed`: `bg: #D1FAE5` / `text: #065F46` (green)

#### Screens

##### `view.server.window` — Server Disconnected

Shown when `/health` endpoint is unreachable.

- Centered vertically and horizontally in the content area
- Pulsing red dot (`8px`, same pulse animation as current) + text: **"Waiting for server…"**
- Below: muted small text: `"Start the figma-link server in your project."`
- No navbar or toolbar visible — full takeover screen
- Polls `/health` every 3 seconds; transitions to `view.build.window` on success

##### `view.build.window` — Primary Build View

The main screen. Contains:

- **`navbar`** (top, fixed)
- **`queue`** (middle, scrollable, flex: 1)
- **`toolbar`** (bottom, fixed)

##### `view.review.window` — Review Mode (Stub)

- **`navbar`** (top, fixed)
- Centered content: `"Review mode — coming soon."` in muted text
- No toolbar

#### Components

##### `navbar`

- Height: `40px`, border-bottom: `1px solid #E5E5E5`, padding: `0 12px`
- Horizontal flex, `align-items: center`, `justify-content: space-between`
- Left side: two tab buttons — **`Build`** | **`Review`**
  - Tab buttons: `padding: 6px 12px`, `border-radius: 4px`, `font-size: 11px`, `font-weight: 600`
  - Active tab: `background: #F0F0F0`, `color: #1A1A1A`
  - Inactive tab: `background: transparent`, `color: #888`
  - Hover (inactive): `background: #F8F8F8`
- Right side: **`Clear All`** button
  - `font-size: 11px`, `color: #DC2626`, `background: transparent`, `border: none`, `cursor: pointer`
  - Only visible when queue has entries
  - On click: `DELETE /tasks` → clears queue → re-renders

##### `toolbar`

- Height: `48px`, border-top: `1px solid #E5E5E5`, padding: `0 12px`
- Horizontal flex, `align-items: center`, gap: `8px`
- Contains two buttons:
  - **`Add to Queue`** — primary button (`btn-primary` style: `background: #7C6DF0`, `color: #FFF`, `border-radius: 6px`, `padding: 8px 16px`, `font-weight: 600`)
  - **`Copy Set`** — secondary button (`btn-secondary` style: `background: #F0F0F0`, `color: #333`, same sizing)
    - Copies all queue entries as formatted text to clipboard
    - Disabled (50% opacity) when queue is empty

##### `queue` (empty state)

- Centered content: `"No queued design tasks."` in `#AAA`, `font-size: 12px`
- Below: small muted text: `"Click 'Add to Queue' to get started."`

##### `queue` (populated)

- Vertical list of `queue.item` components
- `padding: 8px 12px`, `gap: 8px` between items
- Scrollable overflow-y

##### `queue.item`

Each item is a horizontal card representing one task entry.

- Container: `border: 1px solid #E5E5E5`, `border-radius: 8px`, `padding: 10px`, `display: flex`, `gap: 10px`
- **Left column — Thumbnail area**
  - `max-width: 25%`, `min-width: 60px`, `aspect-ratio: 1`
  - `background: #F5F5F5`, `border-radius: 4px`, `overflow: hidden`
  - If thumbnail available: `<img>` fills the area (`object-fit: cover`)
  - If no thumbnail: centered placeholder icon or just the grey box
- **Right column — Details**
  - Vertical flex, `flex: 1`, `gap: 4px`
  - **Row 1 — Name**: `font-weight: 600`, `font-size: 12px`, `color: #1A1A1A` — shows `figmaNodeName`
  - **Row 2 — Comment** (if present): `font-size: 11px`, `color: #555`, `font-style: italic`, truncated to 2 lines (`-webkit-line-clamp: 2`)
  - **Row 3 — Action row**: horizontal flex, `gap: 6px`, `align-items: center`, `margin-top: auto`
    - **Status tag**: pill badge — `font-size: 10px`, `font-weight: 600`, `padding: 2px 8px`, `border-radius: 10px`, uppercase text. Colors per status (see above).
    - **Delete button**: small icon/text button — `font-size: 10px`, `color: #DC2626`, `background: transparent`, `border: none`. Label: `✕` or `Delete`.
    - **Copy button**: small icon/text button — `font-size: 10px`, `color: #888`, `background: transparent`, `border: none`. Label: `Copy`. Copies single entry as formatted text.

##### `new.item` — Add-to-Queue Modal Overlay

A full-screen modal that floats over the build view.

- **Overlay backdrop**: `position: fixed`, `inset: 0`, `background: rgba(0,0,0,0.4)`, `z-index: 100`
- **Modal container**: `position: fixed`, `inset: 10px`, `background: #FFF`, `border-radius: 12px`, `z-index: 101`, `display: flex`, `flex-direction: column`, `overflow: hidden`
- **Modal has 2 states** driven by user flow:

**State 1 — Select Component** (initial)

- Header: `padding: 16px`, `border-bottom: 1px solid #E5E5E5`
  - Title: **"Select New Component"** — `font-size: 14px`, `font-weight: 600`
  - Subtitle: `"Select a component on the canvas to create a ticket."` — `font-size: 11px`, `color: #888`
- Body: centered vertically
  - Pulsing dot + `"Waiting for selection…"` in muted text
  - The plugin continuously reads `figma.currentPage.selection` via a `POLL_SELECTION` message loop every 500ms
  - When a node is selected: transitions to display `"Selected: {nodeName}"`, node ID in mono, `figmaNodeId` shown
  - Buttons at bottom: row — `Cancel` (secondary) | `Continue` (primary, enabled only when a node is selected)
- Cancel → closes modal, returns to queue view

**State 2 — Entry Metadata** (after Continue)

- Header: same frame, title changes to **"Queue Details"**
- Body:
  - **Preview row**: `display: flex`, `gap: 12px`, `margin-bottom: 16px`
    - Left: Thumbnail area (same style as queue.item, populated if possible)
    - Right: `figmaNodeName` (bold), `figmaNodeId` (mono, muted)
  - **Form fields** — vertical, `gap: 12px`:
    - **Name field**: `<label>Name</label>` + `<input type="text">` — pre-filled with the Figma layer/component name. Editable.
    - **Comments field**: `<label>Comments</label>` + `<textarea>` — empty, placeholder: `"Describe what needs to be built or fixed…"`. `rows: 3`, `resize: vertical`
  - **Button row**: `display: flex`, `gap: 8px`, `justify-content: flex-end`, `padding: 16px`, `border-top: 1px solid #E5E5E5`
    - **Cancel** (secondary)
    - **Copy & Cancel** (secondary) — copies the entry schema as JSON to clipboard, then closes modal
    - **Queue** (primary) — `POST /tasks` with entry data → closes modal → queue refreshes

##### Thumbnail Handling

- Figma Plugin API provides `node.exportAsync({ format: 'PNG', constraint: { type: 'WIDTH', value: 200 } })` to export a node as a PNG `Uint8Array`.
- In `code.ts`: on `EXPORT_THUMBNAIL` message, export the selected node → send the base64-encoded image data back to `ui.html` via `postMessage`.
- `ui.html` renders as `<img src="data:image/png;base64,{data}">`.
- Thumbnails are transient (not persisted in `figma-tasks.json`) — re-fetched from Figma on plugin load by iterating over entries' `figmaNodeId` values.
- If a node can't be found (deleted, moved), show the grey placeholder fallback.

#### Flow (Detailed Walkthrough)

```
1. Plugin opens → polls GET /health
2. Server unreachable → view.server.window (pulsing red dot, "Waiting for server…")
3. Server responds → view.build.window
   3a. GET /tasks → populate queue (may be empty)
   3b. For each entry with figmaNodeId, dispatch EXPORT_THUMBNAIL to code.ts → populate thumbnails
4. Queue empty → centered "No queued design tasks." message
5. User clicks "Add to Queue" in toolbar
6. new.item modal opens — State 1: "Select New Component"
7. User selects a component on the Figma canvas
   7a. code.ts detects selection change via POLL_SELECTION → sends SELECTION_DATA { nodeId, nodeName } to ui.html
   7b. Modal updates: shows node name + ID, "Continue" button enables
8. User clicks "Cancel" → modal closes, returns to queue
9. User clicks "Continue" → modal transitions to State 2: "Queue Details"
   9a. EXPORT_THUMBNAIL dispatched → thumbnail populates in preview
10. User fills in Name (pre-populated) and Comments (optional)
11. User clicks "Cancel" → modal closes
12. User clicks "Copy & Cancel" → entry JSON copied to clipboard → modal closes
13. User clicks "Queue"
    13a. POST /tasks { figmaNodeId, figmaNodeName: <name field value>, comment: <comments field value>, status: "to-build" }
    13b. Server creates entry in figma-tasks.json
    13c. Modal closes → queue re-fetches GET /tasks → new entry appears in queue
14. Queue item visible with thumbnail, name, comment, status tag
15. User can click Delete on a queue item → DELETE /tasks/:entryId → queue re-fetches
16. User can click Copy on a queue item → copies formatted entry to clipboard
17. User can click "Copy Set" in toolbar → copies all entries as formatted text
18. User can click "Clear All" in navbar → DELETE /tasks → queue empties
19. User switches to "Review" tab → view.review.window → "Review mode — coming soon."
20. User switches back to "Build" tab → view.build.window with current queue state
```

#### Message Protocol (`code.ts` ↔ `ui.html`)

| Direction | Message Type | Payload | Purpose |
|-----------|-------------|---------|---------|
| UI → Sandbox | `POLL_SELECTION` | — | Request current selection state |
| Sandbox → UI | `SELECTION_DATA` | `{ nodeId, nodeName, hasSelection }` | Report selected node (or nothing) |
| UI → Sandbox | `EXPORT_THUMBNAIL` | `{ nodeId }` | Request PNG export of a node |
| Sandbox → UI | `THUMBNAIL_DATA` | `{ nodeId, base64 }` | Base64 PNG data for the node |
| Sandbox → UI | `THUMBNAIL_ERROR` | `{ nodeId, error }` | Node not found or export failed |
| UI → Sandbox | `NOTIFY` | `{ message }` | Show Figma toast notification |
| UI → Sandbox | `CLOSE` | — | Close plugin |

> The old `LINK` and `NODE_ID` messages are removed — replaced by `POLL_SELECTION` / `SELECTION_DATA` which decouples selection reading from the linking flow.

### Step 2.3 — `code.ts` Rewrite

| Field | Value |
|-------|-------|
| **Agent** | Frontend (Figma Plugin) |
| **Deps** | 2.1 (design spec) |
| **Context** | Current `code.ts` is 32 lines handling `LINK`, `NOTIFY`, `CLOSE`. Needs new message types for selection polling and thumbnail export. |
| **What** | Rewrite `code.ts` to handle new message protocol. |
| **How/Where** | `packages/figma-plugin/code.ts` |
| **Contract** | Sandbox handles `POLL_SELECTION`, `EXPORT_THUMBNAIL`, `NOTIFY`, `CLOSE`. Returns `SELECTION_DATA`, `THUMBNAIL_DATA`, `THUMBNAIL_ERROR`. |

### Step 2.4 — `ui.html` Rewrite

| Field | Value |
|-------|-------|
| **Agent** | Frontend (Figma Plugin) |
| **Deps** | 2.1 (design spec), 2.3 (`code.ts` contract) |
| **Context** | Current `ui.html` is 362 lines with inline CSS and JS. Rewriting for multi-screen architecture. No build tools — stays as a single HTML file with embedded `<style>` and `<script>`. |
| **What** | Rewrite `ui.html` with all screens, components, and flows described in Step 2.2. |
| **How/Where** | `packages/figma-plugin/ui.html` |
| **Contract** | Fully functional Build-mode plugin UI that connects to `:7842` API, manages queue CRUD, handles thumbnails, and supports the complete user flow. |

**Implementation Notes:**
- Use a simple view-router pattern: a `currentView` variable (`"server"` | `"build"` | `"review"`) and a `render()` function that swaps content.
- `new.item` modal is overlay-rendered on top of the current view (not a view swap).
- All DOM manipulation via `innerHTML` + event listener rebinding (same pattern as current, no frameworks).
- CSS uses BEM-like naming (`.queue-item__thumbnail`, `.navbar__tab--active`).
- Keep all code in a single `<script>` block; organize with clear section comments.

### Step 2.5 — `manifest.json` Update

| Field | Value |
|-------|-------|
| **Agent** | Frontend (Figma Plugin) |
| **Deps** | None |
| **Context** | Current name is "Origami Figma Link" — needs rebranding. |
| **What** | Update plugin name, ID, and window dimensions. |
| **How/Where** | `packages/figma-plugin/manifest.json` |
| **Contract** | `name: "Figma Code Link"`, `id: "figma-code-link"`, window size 360×540. |

---

## Phase 3 — Integration & Polish

> **Deps:** Phase 1 + Phase 2 complete.

### Step 3.1 — End-to-End Verification

| Field | Value |
|-------|-------|
| **Agent** | Integration |
| **Deps** | 1.3, 2.4 |
| **Context** | All pieces built. Need to verify the full loop works. |
| **What** | Verify: start server in `evin-drews-site` → open Figma plugin → add entries to queue → see `figma-tasks.json` created/updated in project root → entries visible in queue → delete/clear works. |
| **How/Where** | Manual testing in both projects. |
| **Contract** | Full CRUD lifecycle works end-to-end. `figma-tasks.json` is generated and persisted. |

### Step 3.2 — Copilot / Agent Consumption

| Field | Value |
|-------|-------|
| **Agent** | Integration |
| **Deps** | 3.1 |
| **Context** | The primary value prop: AI agents can read `figma-tasks.json`, pick up tasks, fetch Figma design context via MCP, implement changes, and flip status to `"review"`. |
| **What** | Verify that `figma-tasks.json` is readable by Copilot/Claude. Entries contain enough info (`figmaNodeId`, `figmaNodeName`, `comment`, `status`) for an agent to: (a) locate the design via `get_design_context(nodeId)` MCP call, (b) understand the task, (c) update status via the API. |
| **How/Where** | Test with Copilot in `evin-drews-site` — point it at `figma-tasks.json` and ask it to complete a task. |
| **Contract** | Agents can read, understand, and act on `figma-tasks.json` entries. |

### Step 3.3 — Review Mode (Future — Not This Sprint)

> Deferred. The existing "Review" mode (browser CID overlay → flag → link) will be rebuilt in a future phase. For now, `view.review.window` shows a stub message.

### Step 3.4 — CID Preprocessing (Future — Not This Sprint)

> Deferred. The Babel/SWC plugin for injecting `data-cid` attributes into JSX is not needed for the Build-mode flow. Build mode creates entries from the Figma side (select component → queue). CID preprocessing enables the Review-mode flow (hover DOM elements → flag).

---

## API Contract Reference

### `figma-tasks.json` Full Schema

```json
{
  "version": 1,
  "entries": [
    {
      "entryId": "550e8400-e29b-41d4-a716-446655440000",
      "figmaNodeId": "1234:567",
      "figmaNodeName": "Button / Primary",
      "comment": "This button doesn't look right",
      "status": "to-build",
      "timestamp": "2026-02-28T12:05:00Z"
    }
  ]
}
```

### Entry Type

```typescript
type TaskStatus = 'to-build' | 'to-fix' | 'review' | 'completed';

interface TaskEntry {
  entryId: string;          // UUID v4
  figmaNodeId: string;      // Figma node ID (e.g. "1234:567")
  figmaNodeName: string;    // Figma layer/component name
  comment?: string;         // User notes
  status: TaskStatus;
  timestamp: string;        // ISO 8601
}

interface TaskFile {
  version: number;          // Always 1
  entries: TaskEntry[];
}
```

### Server Endpoints (`:7842`)

| Method | Path | Request Body | Response | Notes |
|--------|------|-------------|----------|-------|
| `GET` | `/health` | — | `{ ok: true }` | Connection check |
| `GET` | `/tasks` | — | `TaskFile` | Full file contents |
| `POST` | `/tasks` | `Partial<TaskEntry>` (requires `figmaNodeId`, `figmaNodeName`) | `TaskEntry` (created) | Generates `entryId`, `timestamp`; defaults `status` to `"to-build"` |
| `PUT` | `/tasks/:entryId` | `Partial<TaskEntry>` | `TaskEntry` (updated) | Merges fields |
| `DELETE` | `/tasks/:entryId` | — | `{ deleted: true }` | Removes entry |
| `DELETE` | `/tasks` | — | `{ cleared: true }` | Removes all entries |

---

## User Checklist

- [ ] Monorepo root scaffolded (`package.json`, `tsconfig.base.json`, `.gitignore`)
- [ ] `adapter-nextjs` server implemented (Express, `:7842`, CORS, `figma-tasks.json` CRUD)
- [ ] `adapter-nextjs` types exported (`TaskEntry`, `TaskFile`, `TaskStatus`)
- [ ] `FigmaCodeLink` React component created (dev-only FAB, connection status)
- [ ] `adapter-nextjs` builds cleanly (`npm run build`)
- [ ] `adapter-nextjs` published via yalc
- [ ] `evin-drews-site` installs yalc package, `FigmaCodeLink` renders in browser
- [ ] Server script works (`npm run figma-link` starts server)
- [ ] `manifest.json` updated (name, ID, dimensions)
- [ ] `code.ts` rewritten (new message protocol: selection polling, thumbnail export)
- [ ] `ui.html` rewritten with full Build-mode UI:
  - [ ] Server disconnected screen
  - [ ] Build view with navbar + queue + toolbar
  - [ ] Review view stub
  - [ ] Empty queue state
  - [ ] Populated queue with `queue.item` cards
  - [ ] `new.item` modal — State 1 (select component)
  - [ ] `new.item` modal — State 2 (entry metadata form)
  - [ ] Thumbnail rendering from Figma node export
  - [ ] Status tags with correct colors
  - [ ] Delete / Copy / Copy Set / Clear All actions
- [ ] End-to-end flow verified (plugin → server → `figma-tasks.json` → queue display)
- [ ] `figma-tasks.json` readable by AI agents for task pickup
