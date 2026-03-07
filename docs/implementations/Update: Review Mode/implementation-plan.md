# Implementation Plan — Review Mode

## Context

Implement the "Review" feature end-to-end: DOM selection with comments → saved review entries in `figma-tasks.json` → Figma plugin Review view with link flow to associate a `data-cid` with a Figma node.

**Key findings from codebase audit:**

- `DevCidInspector.tsx` exists in `evin-drews-site` but is unmounted and repo-specific — it is **not** the foundation for the package component. `DomReviewOverlay` is built from scratch in `adapter-nextjs` for portability, and `DevCidInspector.tsx` is deleted from the consumer repo on integration.
- `data-cid` attributes are manually placed throughout the site with good coverage, but gaps may exist in new or third-party components — **CIDPreprocessor is integral** and ships in Phase 1 alongside the schema work.
- `figma-tasks.json` uses a flat `entries[]` array — add a `type: "build" | "review"` discriminant field to entries rather than splitting into two top-level arrays.
- Review view in the plugin is a placeholder stub.
- `TaskEntry` in both packages lacks `dataCid` — needs to be added.
- DOM thumbnails must **not** be stored in `figma-tasks.json` (base64 bloat) — write screenshot PNGs to disk under a sidecar directory.

---

## Phase 1 — Foundation (parallel, no deps)

### Step 1.0 — CIDPreprocessor Babel Plugin

**Agent:** backend  
**Deps:** none  
**Context:**

- `packages/adapter-nextjs/src/` — new directory `babel/`
- This is integral infrastructure: the overlay relies on `[data-cid]` being present on elements. Consumer code may have gaps; the preprocessor ensures full coverage without overwriting explicit values.
- `evin-drews-site/next.config.ts` — minimal config, `reactCompiler: true`; Babel plugin injection goes here

**What:** Create a Babel plugin (`packages/adapter-nextjs/src/babel/cid-preprocessor.ts`) that, in development only:

- Traverses JSX opening elements in component files
- If the element does **not** already have a `data-cid` prop, injects `data-cid="<relative-path>:<line>"` where `<relative-path>` is the file path relative to the project `src/` root and `<line>` is the JSX opening tag's 1-based line number
- Skips: fragments (`<>`), host elements inside node_modules, and any element already carrying an explicit `data-cid` (static string OR expression)
- Dev-only guard: if `process.env.NODE_ENV !== 'development'`, the plugin is a no-op

**How/Where:**

- `packages/adapter-nextjs/src/babel/cid-preprocessor.ts` — exports a Babel plugin factory as the default export
- Add `packages/adapter-nextjs/src/babel/index.ts` barrel exporting `{ cidPreprocessor }`
- Export `cidPreprocessor` from `packages/adapter-nextjs/src/index.ts`
- Consumer activates via `next.config.ts` experimental Babel config (document in README)
- Does not require or modify `@babel/core` as a runtime dep — list as `peerDependencies`

**Contract:** Exported `cidPreprocessor` Babel plugin. Any JSX element lacking `data-cid` in dev gets one auto-injected. Existing explicit values are never overwritten.

---

### Step 1.1 — Shared Type Updates

**Agent:** backend  
**Deps:** none  
**Context:**

- `packages/adapter-nextjs/src/types.ts`
- `packages/figma-plugin/src/shared/messages.ts`

**What:** Add `dataCid` and `type` fields to `TaskEntry` across both packages. Update `TaskFile` version to `2`.

**How/Where:**

In `adapter-nextjs/src/types.ts`:

```
TaskEntry:
  + dataCid?: string          // e.g. "button.tsx:38" or semantic cid like "hero.cta.primary"
  + type?: "build" | "review" // default "build" when absent (backward compat)
  + domThumbnailPath?: string  // relative path to screenshot file, e.g. ".figma-link/screens/hero.cta.primary.png"

TaskFile:
  version: 2  // bump

UpdateTaskInput:
  + figmaNodeId?: string       // allowed now — used to link a review entry that had no figmaNodeId at creation
  + figmaNodeName?: string     // already present
```

In `figma-plugin/src/shared/messages.ts`:

- Mirror the same `dataCid`, `type`, `domThumbnailPath` additions to `TaskEntry`.

**Contract:** Updated `TaskEntry` interface used by all downstream steps.

---

### Step 1.2 — Server Route Extensions

**Agent:** backend  
**Deps:** none  
**Context:**

- `packages/adapter-nextjs/src/server/routes.ts`
- `packages/adapter-nextjs/src/server/store.ts`

**What:**

1. Add `POST /review` — creates a review entry (type: "review") with `dataCid`, `comment`, and captures a DOM screenshot if provided.
2. Add `GET /review` — returns only `entries` where `type === "review"`.
3. Extend `POST /tasks` to pass `type` through.
4. Extend `PUT /tasks/:figmaNodeId` (and add `PUT /review/:dataCid`) to allow linking: setting `figmaNodeId` + `figmaNodeName` on an existing review entry (this is how the Figma plugin "links" a DOM entry).
5. Add `POST /review/screenshot` — accepts `{ dataCid, base64 }`, writes PNG to `.figma-link/screens/<sanitised-cid>.png` relative to `process.cwd()`, returns `{ path }`. Keeps base64 out of the JSON file entirely.

**How/Where:**

- In `store.ts`: add `createReview(input: CreateReviewInput)` and `linkReview(dataCid, figmaNodeId, figmaNodeName)`. Reuse existing `normalizeEntry` / `writeTaskFile`.
- Add `CreateReviewInput` to `types.ts`: `{ dataCid: string; comment?: string; status?: TaskStatus }`.
- `linkReview` merges `figmaNodeId` + `figmaNodeName` onto the entry matching `dataCid`; throws if no match.
- Fix existing `parseErrorStatus` fragility: replace string matching with a typed `AppError` class carrying `statusCode`.

**Contract:**

- `POST /review` → `201 { entry: TaskEntry }`
- `GET /review` → `200 TaskEntry[]`
- `PUT /review/:dataCid/link` → `200 { entry: TaskEntry }`
- `POST /review/screenshot` → `201 { path: string }`

---

## Phase 2 — DOM Overlay Component (depends on Step 1.2)

### Step 2.1 — `DomReviewOverlay` component in `adapter-nextjs`

**Agent:** frontend  
**Deps:** Step 1.0, Step 1.2  
**Context:**

- `packages/adapter-nextjs/src/components/FigmaCodeLink.tsx` — existing floating overlay, follow the same positioning and dev-guard pattern
- Built **from scratch** in the adapter package — no dependency on consumer repo files. Must work on any React/Next.js site, not just `evin-drews-site`.

**What:** Build `DomReviewOverlay` as a new self-contained exported component in `adapter-nextjs`.

**How/Where:** `packages/adapter-nextjs/src/components/DomReviewOverlay.tsx`

Behavior:

1. **Toggle button** — fixed, bottom-right (above `FigmaCodeLink` pill). Shows a pencil/inspect icon. Persists `enabled` in `localStorage` under `fcl:review-overlay`.
2. **When enabled:**
   - Adds `pointer-events: none` overlay div on top of viewport (`position: fixed, inset: 0, z-index: 9998`).
   - Intercepts `pointermove` on `document` (capture phase) to find closest `[data-cid]` ancestor — renders a dashed highlight rect positioned to match the element's `getBoundingClientRect()`. The overlay div itself has `pointer-events: none`; the highlight is a CSS-outlined absolutely-positioned child.
   - On `click` (capture phase, `preventDefault()`): opens comment popup.
3. **Comment popup** — appears anchored near the clicked element. Contains:
   - CID display (read-only)
   - Textarea for comment
   - Status selector: `"to-fix"` (default) | `"review"`
   - "Save" button → `POST /review` with `{ dataCid, comment, status }`, then captures screenshot (see below), then `POST /review/screenshot` with base64
   - "Cancel" button
4. **Screenshot capture:** On save, use `html2canvas` (peer dep) to capture the hovered element's bounding region. Convert to base64 and `POST /review/screenshot`.
   - If `html2canvas` is unavailable, skip silently (thumbnail will be absent).
5. **Returns `null` if `NODE_ENV !== "development"`.**

**CSS:** Inline styles or a small CSS module — do not depend on consumer repo styles. Use CSS custom properties for theming if needed.

**Props:**

```ts
interface DomReviewOverlayProps {
  serverUrl?: string; // default "http://localhost:7842"
}
```

**Exports:** Add `DomReviewOverlay` to `packages/adapter-nextjs/src/index.ts` barrel.

**Contract:** Component ready to mount in `layout.tsx`. Saves entries via `POST /review`.

---

### Step 2.2 — Consumer Repo Integration

**Agent:** frontend  
**Deps:** Step 2.1  
**Context:**

- `evin-drews-site/src/app/layout.tsx` — `<FigmaCodeLink />` already mounted here
- `evin-drews-site/src/components/DevCidInspector.tsx` — unmounted; superseded by the package component, **delete it**
- `evin-drews-site/src/styles/dev-cid.css` — styles tied to the old inspector; **delete it** and remove its import if any

**What:** Mount `<DomReviewOverlay />` in `layout.tsx`, wire up `cidPreprocessor` in `next.config.ts`, and remove the old inspector.

**How/Where:**

```tsx
// layout.tsx
import { FigmaCodeLink, DomReviewOverlay } from "figma-code-link-nextjs";
// inside <body>:
<FigmaCodeLink />
<DomReviewOverlay />
```

```ts
// next.config.ts
import { cidPreprocessor } from "figma-code-link-nextjs";
// add to experimental.babelConfig or compiler options per Next.js docs
```

- Delete `evin-drews-site/src/components/DevCidInspector.tsx`
- Delete `evin-drews-site/src/styles/dev-cid.css` and remove any import
- Add `.figma-link/` to `.gitignore`

**Contract:** Review overlay live in dev mode. Old inspector fully removed. Auto CID injection active for elements without explicit `data-cid`.

---

## Phase 3 — Figma Plugin Review View (depends on Step 1.1)

### Step 3.1 — Review View Render

**Agent:** frontend (plugin)  
**Deps:** Step 1.1  
**Context:**

- `packages/figma-plugin/src/ui/render/views.ts` — `renderReviewView` stub
- `packages/figma-plugin/src/ui/state/store.ts` — `AppState`, `ModalState`
- `packages/figma-plugin/src/ui/render/modal.ts`
- `packages/figma-plugin/src/ui/events/actions.ts`
- `packages/figma-plugin/src/ui/api/client.ts`
- CSS classes reference from documentation

**What:** Implement `renderReviewView` to display review entries with:

- Same toolbar pattern as build view: "Copy Set" + "Clear All" (no "Add to Queue")
- Entry cards with a distinct "unlinked" state (red tint + broken-link icon) vs "linked" state (normal, side-by-side Figma + DOM thumbnail)
- Each card shows: `figmaNodeName` (or "Unlinked" if absent), `dataCid`, `comment`, status tag
- Linked cards show both the Figma thumbnail (existing cache system) and the DOM screenshot path as an `<img src>` (the path is a filesystem path, so it won't render in plugin iframe — use a proxy route, see Step 3.2)
- "Link" button on unlinked cards → opens the existing modal flow (Step 3.3)
- "Edit" button → opens modal in `edit` mode
- "Delete" button → `DELETE /tasks/:figmaNodeId` or `DELETE /review/:dataCid`

**How/Where:**

- `renderReviewView(state)` in `views.ts`
- Add CSS: `.review-card`, `.review-card--unlinked`, `.review-card__dom-thumb`, `.review-card__figma-thumb`, `.review-card__link-icon`, `.review-card__broken-link`
- Filter: API client `getReviewEntries()` → `GET /review`

**Contract:** Review view renders entries. Link/edit/delete actions wired. Cards visually distinguish linked vs unlinked.

---

### Step 3.2 — Screenshot Proxy Route

**Agent:** backend  
**Deps:** Step 1.2  
**Context:** The Figma plugin iframe cannot access local filesystem paths directly.

**What:** Add `GET /review/screenshot/:filename` that reads the PNG from `.figma-link/screens/<filename>` and responds with `Content-Type: image/png`. This lets the plugin render `<img src="http://localhost:7842/review/screenshot/hero.cta.primary.png">`.

**How/Where:** One new route in `routes.ts`. Use `fs.readFileSync` + `res.type('png').send(buffer)`. Return 404 if file absent.

**Contract:** Plugin can render DOM thumbnails as `<img>` tags.

---

### Step 3.3 — Review Link Modal Flow

**Agent:** frontend (plugin)  
**Deps:** Step 3.1  
**Context:**

- `packages/figma-plugin/src/ui/render/modal.ts`
- `packages/figma-plugin/src/ui/state/store.ts`
- Existing `create` modal flow (select → metadata → queue)

**What:** Add a `"link"` mode to `ModalState` for linking a DOM review entry to a Figma node. Triggered by "Link" on an unlinked review card.

**How/Where:**

- `ModalState.mode` gets a new value: `"link"`
- `ModalState` gains: `linkingEntry?: TaskEntry` (the review entry being linked)
- Modal in `link` mode:
  - **Step `select`:** Same as create — poll selection. Title: "Select the Figma layer for this entry". Shows the DOM entry info (dataCid + comment) as context in the modal body.
  - **Step `metadata`:** Shows Figma thumbnail + DOM screenshot side by side. Read-only name. Comment field pre-populated from `linkingEntry.comment` (editable). Status selector pre-set.
  - Submit: Calls `PUT /review/:dataCid/link` with `{ figmaNodeId, figmaNodeName }` + optional comment update. On success: `refreshTasks()`, `closeModal()`.
- No changes needed to the plugin sandbox — same `POLL_SELECTION` / `EXPORT_THUMBNAIL` messages used.

**Contract:** Full link flow implemented. Unlinked review entries become linked.

---

## Phase 4 — API Client + State Updates (depends on Phase 3)

### Step 4.1 — Plugin API Client Extension

**Agent:** frontend (plugin)  
**Deps:** Step 3.1, Step 3.3  
**Context:**

- `packages/figma-plugin/src/ui/api/client.ts`

**What:** Add `getReviewEntries()`, `createReviewEntry()`, `linkReviewEntry(dataCid, figmaNodeId, figmaNodeName)`, `deleteReviewEntry(dataCid)` to the client.

**How/Where:** `api/client.ts` — mirror existing `getTasks` / `createTask` patterns. No new abstractions needed.

**Contract:** All Review operations available to `main.ts`.

---

### Step 4.2 — Main Orchestrator Updates

**Agent:** frontend (plugin)  
**Deps:** Step 4.1  
**Context:**

- `packages/figma-plugin/src/ui/main.ts` — orchestrates health check, task refresh, modal lifecycle

**What:**

- On view switch to `"review"`: call `refreshReviewEntries()` (fetches `GET /review`, stores in `state.reviewEntries`).
- Add `state.reviewEntries: TaskEntry[]` to `AppState`.
- Health loop: refresh both `entries` and `reviewEntries` on tick when `currentView` dictates.
- Thumbnail requests for review entries: request `EXPORT_THUMBNAIL` for linked entries (with `figmaNodeId`) using the existing thumbnail cache system.

**Contract:** Review view stays current with server state.

---

## Checklist — Original Request Decomposed

- [ ] User can select a DOM element via overlay toggle → hover highlight
- [ ] Popup comment UI with dataCid, comment, status
- [ ] On save: `POST /review` creates entry in `figma-tasks.json` with `type: "review"`
- [ ] DOM screenshot captured and saved to `.figma-link/screens/` (not in JSON)
- [ ] Plugin Review tab populated from `GET /review`
- [ ] Unlinked cards styled distinctly (red tint, broken-link icon)
- [ ] Link flow: select Figma node → `PUT /review/:dataCid/link` → card becomes linked
- [ ] Linked cards show Figma thumbnail + DOM thumbnail side by side
- [ ] Comment editable from Figma end (via edit modal)
- [ ] Copy Set and Clear All available in Review view
- [ ] No "Add to Queue" in Review view
- [ ] `type: "build" | "review"` discriminant on `TaskEntry` — schema version bumped to 2
- [ ] `DomReviewOverlay` built from scratch in `adapter-nextjs`, exported, and mounted in `layout.tsx`
- [ ] `DevCidInspector.tsx` deleted from `evin-drews-site`; `dev-cid.css` deleted
- [ ] `cidPreprocessor` Babel plugin shipped in Phase 1, activated in `next.config.ts`
- [ ] `.figma-link/` added to `.gitignore` in consumer repo
