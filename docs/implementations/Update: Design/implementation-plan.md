# Implementation Plan: Unified Design System

## Context

Three surfaces require a unified design system:

| Surface          | Framework                 | Theme | Current Accent   | Style Approach                                  | Size                 |
| ---------------- | ------------------------- | ----- | ---------------- | ----------------------------------------------- | -------------------- |
| `adapter-nextjs` | React 18 / Next.js        | Dark  | Purple `#7B61FF` | 100% inline JS style objects (`C` constant)     | ~1400 lines monolith |
| `adapter-svelte` | Svelte 5                  | Dark  | Orange `#ff6b35` | Hardcoded JS color constants + scoped `<style>` | ~1 component         |
| `figma-plugin`   | Vanilla JS (HTML strings) | Light | Purple `#7c6df0` | Flat CSS file (~1100 lines), hardcoded hex      |

**Design debt summary**: Three different accents, three different font stacks, no shared tokens, no headless component primitives. The overlays inject into host apps — `tokens-export.css` must never be injected into host `:root`. See `review.md`.

## Token Strategy

**SSOT**: `tokens-export.css` (repo root) holds the canonical design values.

**Overlay adapters (dark, injected into host apps)**:

- New file: `packages/shared/fcl-tokens.css` defines `--fcl-*` properties scoped to `[data-fcl-root]`
- Token values are hard-mapped (no `var()` chain to host page's `:root`)
- Overlay root element carries `data-fcl-root` attribute at all times
- Adapters inject a `<style>` tag with FCL token declarations into `document.head` on mount (once, with deduplication guard)

**Figma plugin (light, owns its page)**:

- Plugin's `index.html` embeds `tokens-export.css` via inline or import
- Plugin styles reference `--bg-primary`, `--fg-primary`, `--border-primary` etc. from `tokens-export.css` directly

**Unified accent**: `#3891ff` (`--brand-primary`) replaces all existing orange/purple accents across all surfaces.

**Font**: `--font-primary` is implemented as `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif` everywhere (not "SF Pro" literally).

**Monospace**: `ui-monospace, "SF Mono", Menlo, Monaco, "Courier New", monospace`

---

## Phase 1 — Foundation (no dependencies, run in parallel)

### Step 1.1 — FCL Token Layer

**Agent**: Frontend / Design

**Deps**: None

**Context**:

- `tokens-export.css` (repo root) — canonical token values
- Dark mode values under `[data-theme="dark-mode"]` in that file
- `packages/` directory (no `shared/` subfolder exists yet)
- Review concern #1: tokens must NOT pollute host app `:root`

**What**:
Create `packages/shared/fcl-tokens.css`. This file defines two scoped token sets:

1. `[data-fcl-root]` — overlay dark theme tokens (`--fcl-*`)
2. `:root` — plugin light theme tokens (`--fcl-*`), safe because the plugin owns its page

Both sets use the same `--fcl-*` naming so component CSS is portable across surfaces. The overlay section overrides in place via attribute scoping.

**Token names to define (both overlay and plugin variants)**:

```
--fcl-bg-primary       /* overlay: gray-12 #2d2620 | plugin: gray-1 #ffffff */
--fcl-bg-secondary     /* overlay: gray-11 #352e28 | plugin: gray-2 #f8f7f7 */
--fcl-bg-tertiary      /* overlay: gray-10 #3c352f | plugin: gray-3 #f1f0f0 */
--fcl-bg-input         /* overlay: gray-10          | plugin: gray-1 */
--fcl-fg-primary       /* overlay: gray-1  #ffffff  | plugin: gray-12 #2d2620 */
--fcl-fg-secondary     /* overlay: gray-5  #dfdede  | plugin: gray-8  #4a443f */
--fcl-fg-muted         /* overlay: gray-7  #999896  | plugin: gray-7  #999896 */
--fcl-border-primary   /* overlay: gray-9  #433c37  | plugin: gray-3  #f1f0f0 */
--fcl-border-secondary /* overlay: gray-8  #4a443f  | plugin: gray-4  #e9e9e9 */
--fcl-accent           /* both: #3891ff (--brand-primary) */
--fcl-accent-soft      /* both: rgba(56, 145, 255, 0.14) */
--fcl-success          /* both: #4ADE80 */
--fcl-success-soft     /* both: rgba(74, 222, 128, 0.12) */
--fcl-error            /* both: #FF5F57 */
--fcl-warning          /* both: #FBBF24 */
--fcl-font-sans        /* both: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif */
--fcl-font-mono        /* both: ui-monospace, "SF Mono", Menlo, Monaco, "Courier New", monospace */
--fcl-radius-sm        /* both: var(--radius-4) = 4px */
--fcl-radius-md        /* both: var(--radius-8) = 8px */
--fcl-radius-lg        /* both: var(--radius-12) = 12px */
--fcl-radius-pill      /* both: var(--radius-max) = 9999px */
--fcl-z-overlay        /* both: 2147483640 */
--fcl-z-popup          /* both: 2147483647 */
```

Note: for the overlay section (`[data-fcl-root]`), values are hardcoded (not `var()` chains) to be host-independent. For the plugin `:root` section, values can reference `tokens-export.css` variables via `var()` since the plugin controls its full page.

**How/Where**: Create `packages/shared/fcl-tokens.css`. No `package.json` needed — this file is consumed via file reference during build.

**Contract**: `packages/shared/fcl-tokens.css` with all `--fcl-*` custom properties. Consumed by steps 2.1, 2.2, 2.3.

---

### Step 1.2 — Install adapter-nextjs Dependencies

**Agent**: Backend / Dependencies

**Deps**: None

**Context**:

- `packages/adapter-nextjs/package.json` — current deps: `figma-code-link-core`, `html2canvas`, `uuid`
- Peer deps: `@babel/core`, `next`, `react >=18`
- Radix UI primitives are the target headless library

**What**:
Install Radix UI primitives and Lucide icons in `packages/adapter-nextjs`:

- `@radix-ui/react-popover` — ReviewPopup panel
- `@radix-ui/react-select` — status dropdown
- `@radix-ui/react-tooltip` — CommentPin hover tooltip
- `@radix-ui/react-alert-dialog` — delete confirmation (replace the inline state pattern)
- `lucide-react` — icon library (replaces hand-rolled PencilIcon SVG)

All are `dependencies` (not devDependencies), since they render in the dev overlay output but are referenced at component runtime. The overlay already tree-shakes via the `NODE_ENV !== 'development'` guard.

**How/Where**: `npm install` within `packages/adapter-nextjs/`. Update `package.json`.

**Contract**: `node_modules/@radix-ui/*` and `lucide-react` available for step 2.1. Updated `package.json`.

---

### Step 1.3 — Install adapter-svelte Dependencies

**Agent**: Backend / Dependencies

**Deps**: None

**Context**:

- `packages/adapter-svelte/package.json` — current deps: `html2canvas`; peer deps: `svelte >=5.0.0`, `vite >=6.0.0`
- Bits UI is compatible with Svelte 5 (runes-based)

**What**:
Install Bits UI and Lucide Svelte in `packages/adapter-svelte`:

- `bits-ui` — Svelte 5 compatible headless component library (provides: Popover, Select, Tooltip, all needed)
- `lucide-svelte` — icon library

Both are `dependencies`.

**How/Where**: `npm install` within `packages/adapter-svelte/`. Update `package.json`.

**Contract**: `bits-ui` and `lucide-svelte` available for step 2.2. Updated `package.json`.

---

## Phase 2 — Redesign (depends on Phase 1, steps run in parallel)

### Step 2.1 — Redesign adapter-nextjs DomReviewOverlay

**Agent**: Frontend — Next.js

**Deps**: 1.1, 1.2

**Context**:

- `packages/adapter-nextjs/src/components/DomReviewOverlay.tsx` — ~1,400 lines, all inline styles, `C` color object, uses max z-indices, sub-components `CommentPin` and `ReviewPopup` defined inline
- `packages/adapter-nextjs/src/components/FigmaCodeLink.tsx` — thin no-op wrapper, keep as-is
- `packages/shared/fcl-tokens.css` — target token file (from step 1.1)
- Radix UI: `@radix-ui/react-popover`, `@radix-ui/react-select`, `@radix-ui/react-tooltip`, `@radix-ui/react-alert-dialog`
- Lucide: `lucide-react`
- **Theme**: Always dark. Uses `[data-fcl-root]`-scoped `--fcl-*` tokens.

**What**:
Fully rewrite `DomReviewOverlay.tsx`:

1. **Token injection**: On mount, inject a `<style>` tag into `document.head` containing the `[data-fcl-root]` block from `fcl-tokens.css`. Include a deduplication guard (check for the style tag by ID before injecting). Remove the `C = { ... }` constant entirely.
2. **Root container**: Apply `data-fcl-root` attribute to the root `<div>`. All styles reference `var(--fcl-*)` — zero hardcoded hex.
3. **Sub-component extraction**: Extract `CommentPin`, `ReviewPopup`, and `Toolbar` into separate named components in the same file (or separate files in `src/components/`). Each component is independently readable and styled.
4. **ReviewPopup → Radix Popover**: Replace the absolutely-positioned popup `<div>` with `@radix-ui/react-popover`. Use `Popover.Root`, `Popover.Content`, `Popover.Anchor` for auto-positioning (handles viewport overflow automatically, removing manual `popupTop`/`popupLeft` geometry calculations).
5. **Status select → Radix Select**: Replace the `<select>` element with `@radix-ui/react-select`. Style using `--fcl-*` tokens.
6. **CommentPin tooltip → Radix Tooltip**: Replace hover state rendering logic with `@radix-ui/react-tooltip`. Wraps the `CommentPin` button.
7. **Delete confirm → Radix AlertDialog**: Replace the inline delete confirmation state with `@radix-ui/react-alert-dialog`.
8. **Icons**: Replace hand-rolled `PencilIcon` SVG with Lucide `Pencil` component. Add any other icons (e.g., `X` for close, `Trash2` for delete, `Check` for save).
9. **Accent recolor**: Replace accent `#7B61FF` purple with `var(--fcl-accent)` = `#3891ff` blue everywhere.
10. **CSS approach**: Use a `DomReviewOverlay.css` (CSS Module or plain CSS) or a `<style>` block rather than inline style objects. Each visual concern gets a class, not an inline style. The `C` object and `FONT`/`MONO` string constants are fully removed.

**Preserve without change**:

- All event handler logic (`onPointerMove`, `onClick`, `captureElement`, `refreshGeometry`)
- All server API calls (`saveReview`, `deleteSelectedReview`, `fetchExistingReviews`)
- The `enabled` / `connected` / `savedEntries` state
- `NODE_ENV !== 'development'` early return guard
- Props interface (`serverUrl`, `enabledByDefault`)

**How/Where**: Modify `packages/adapter-nextjs/src/components/DomReviewOverlay.tsx`. If extracting sub-components to separate files, place them in `packages/adapter-nextjs/src/components/` and update the barrel export in `src/index.ts` only if new public exports are needed. A companion `DomReviewOverlay.css` may be created if using CSS modules.

**Contract**:

- `DomReviewOverlay` renders identically to current functional behavior
- No hardcoded hex colors anywhere in the file
- `C` constant removed; all colors from `var(--fcl-*)`
- Radix Popover handles ReviewPopup positioning (no manual `popupTop`/`popupLeft` calculations)
- Accent is `#3891ff`

---

### Step 2.2 — Redesign adapter-svelte DomReviewOverlay

**Agent**: Frontend — Svelte

**Deps**: 1.1, 1.3

**Context**:

- `packages/adapter-svelte/src/components/DomReviewOverlay.svelte` — uses a JS const `colors` object for hardcoded values, some CSS custom property (`--fcl-font-sans`) already in the `<style>` block, Svelte-scoped styles
- `packages/adapter-svelte/src/components/FigmaCodeLink.svelte` — thin wrapper, keep as-is
- `packages/shared/fcl-tokens.css` — target token file (from step 1.1)
- `bits-ui` — Svelte 5 headless components: `Popover`, `Select`, `Tooltip`
- `lucide-svelte` — icons
- **Theme**: Always dark. Uses `[data-fcl-root]`-scoped `--fcl-*` tokens.
- **Framework constraints**: Svelte 5 runes syntax (`$state`, `$derived`, `$effect`). No Svelte 4 reactive declarations (`$:`).

**What**:
Fully rewrite `DomReviewOverlay.svelte`:

1. **Token injection**: On mount (via `onMount` or `$effect`), inject a `<style>` tag scoped to `[data-fcl-root]` into `document.head`. Deduplication guard by ID. Remove the JS `colors` constant entirely.
2. **Root element**: The overlay root element carries `data-fcl-root` attribute. All CSS in the `<style>` block references `var(--fcl-*)` — zero hardcoded hex values.
3. **ReviewPopup → Bits UI Popover**: Replace the absolutely-positioned popup with `bits-ui` `Popover.Root` + `Popover.Content`. Removes manual geometry calculation for popup position.
4. **Status select → Bits UI Select**: Replace the `<select>` element with `bits-ui` `Select.Root` + `Select.Content` + `Select.Item`. Style with `--fcl-*` tokens.
5. **Pin tooltip → Bits UI Tooltip**: Wrap `CommentPin` in `bits-ui` `Tooltip.Root`.
6. **Icons**: Replace any inline SVG icon markup with `lucide-svelte` components (e.g., `<Pencil />`, `<Trash2 />`, `<X />`).
7. **Accent recolor**: Replace orange `#ff6b35` and `accentSoft` with `var(--fcl-accent)` and `var(--fcl-accent-soft)` everywhere.
8. **CSS discipline**: The `<style>` block is the SSOT for all visual styling. No inline `style=` attribute on any element except where dynamic values are required (e.g., position coordinates for outlines). Inline styles for positioning must still use token-based values for sizing properties.
9. **Success/error states**: Map to `var(--fcl-success)`, `var(--fcl-error)` from the token layer.

**Preserve without change**:

- All event handler logic (`onPointerMove`, `onClick`, `captureElement`, `refreshGeometry`)
- All server API calls and localStorage persistence (`fcl:review-overlay`)
- State variables (`enabled`, `connected`, `savedEntries`, `hoverEl`, etc.)
- Props (`serverUrl?: string`, `enabledByDefault?: boolean`)
- Geometry management via RAF patterns

**How/Where**: Modify `packages/adapter-svelte/src/components/DomReviewOverlay.svelte`. Large components may be split (e.g., `ReviewPopup.svelte`, `CommentPin.svelte`) placed in `packages/adapter-svelte/src/components/`. Internal sub-components are not exported from `src/index.ts`.

**Contract**:

- `DomReviewOverlay` renders identically to current functional behavior
- Zero hardcoded hex in `<style>` block or `<script>` block
- Svelte 5 runes syntax throughout
- Accent is `#3891ff`

---

### Step 2.3 — Redesign Figma Plugin UI

**Agent**: Frontend — Figma Plugin

**Deps**: 1.1

**Context**:

- `packages/figma-plugin/src/ui/styles.css` — ~1,100 lines, hardcoded hex values throughout, BEM-inconsistent class naming, no CSS custom properties for colors
- `packages/figma-plugin/src/ui/main.ts` — ~650 lines, HTML string rendering, 11+ string-matched action branches, manual focus save/restore
- `packages/figma-plugin/src/ui/render/views.ts` — HTML string templates for queue, navbar
- `packages/figma-plugin/src/ui/render/modal.ts` — 2-page modal HTML string render
- `packages/figma-plugin/src/ui/render/settings.ts` — settings panel HTML string
- `packages/figma-plugin/src/ui/index.html` — plugin HTML shell
- `tokens-export.css` (repo root) — canonical token values (light mode `:root`, dark mode at `[data-theme="dark-mode"]`)
- **Theme**: Light. Plugin is a Figma panel — light matches the Figma IDE.
- **No component library** — vanilla JS/HTML strings. Radix/Bits not applicable here.

**What**:

1. **Embed tokens**: In the plugin's build process (`scripts/build-plugin.mjs`), inline the content of `tokens-export.css` at the top of the output `ui.html` within a `<style>` tag. Alternatively, add a `<style>` import in `index.html` that gets bundled. The plugin's `styles.css` then references `var(--bg-primary)`, `var(--fg-primary)`, etc. directly.

2. **Rewrite `styles.css` to use `--fcl-*` token variables** (via the plugin's `:root` versions from `fcl-tokens.css` in step 1.1):
   - Remove all hardcoded hex values
   - Colors map: `#ffffff` → `var(--fcl-bg-primary)`, `#f0f0f0` → `var(--fcl-bg-secondary)`, `#1a1a1a` → `var(--fcl-fg-primary)`, `#888888` → `var(--fcl-fg-muted)`, `#e5e5e5` → `var(--fcl-border-primary)`, `#7c6df0` → `var(--fcl-accent)`, `#dc2626` → `var(--fcl-error)`
   - Status tag colors (`to-build`, `to-fix`, `review`, `completed`) are the only exception — these may remain hardcoded as they are semantic/product-specific and not part of the FCL token set. Define them as local CSS custom properties at the top of `styles.css` for easy maintenance.
   - Normalize class naming: BEM discipline. No mixed dash/underscore modifiers. Pattern: `block__element--modifier`. Audit inconsistencies (`.queue-item__name` vs `.center-screen` vs `.pulse-dot`) and regularize.

3. **Rewrite `main.ts` action handler** from nested `if` chain to an action registry pattern:

   ```typescript
   const actions: Record<string, (state: AppState) => Promise<void> | void> = {
     "switch-build": handleSwitchBuild,
     "switch-review": handleSwitchReview,
     // ...
   };
   // Dispatcher:
   const handler = actions[action];
   if (handler) handler(state);
   ```

   This eliminates the 11-branch `if/else` chain, makes missing actions explicit, and prevents silently unhandled actions.

4. **Remove manual focus save/restore**: The `captureFocus()` / `restoreFocus()` pattern exists because HTML string re-renders blow away DOM focus. Replace by: do not re-render the full UI on every state change — only re-render changed regions (modal content when modal state changes, queue content when entries change, navbar when view changes). This is achievable by splitting the `render()` call into focused sub-renders. No third-party library needed.

5. **Inline style strings in template functions**: Remove all `style="margin-top:8px;color:#aaaaaa"` inline-style attributes in HTML template strings. These must be replaced with named CSS classes using the token system.

**Preserve without change**:

- All plugin sandbox code (`src/plugin/main.ts`, `thumbnail.ts`, `layer-tree.ts`)
- All messaging contracts (`src/shared/messages.ts`)
- All API client logic (`src/ui/api/client.ts`)
- Plugin bridge (`src/ui/bridge/plugin-bridge.ts`)
- All state shape in `src/ui/state/store.ts`
- Build scripts

**How/Where**: Modify `packages/figma-plugin/src/ui/styles.css`, `main.ts`, `render/views.ts`, `render/modal.ts`, `render/settings.ts`, `index.html`. Build script updated to embed `tokens-export.css`.

**Contract**:

- Plugin renders identically to current functional behavior (same views, same actions)
- `styles.css` has zero hardcoded hex outside of status tag section
- Action handler is registry-based, not `if/else`
- No inline `style=` attributes in HTML template strings
- Accent is `#3891ff`

---

## Phase 3 — Parity Audit (depends on all Phase 2 steps)

### Step 3.1 — Cross-Surface Visual Parity

**Agent**: Frontend / Design

**Deps**: 2.1, 2.2, 2.3

**Context**:

- All three redesigned surfaces
- `packages/shared/fcl-tokens.css` — shared token file

**What**:
Cross-check visual consistency across all three surfaces:

1. Run the Figma plugin and both adapters in dev mode
2. Verify: accent color is `#3891ff` on all surfaces, not orange/purple
3. Verify: identical border-radius on panels and buttons (using same `--fcl-radius-*` tokens)
4. Verify: font stacks render identically
5. Verify: status tags (`to-build`, `to-fix`, `review`, `completed`) use the same color values in plugin and both adapters
6. Fix any token reference mismatches or missed hardcoded values

**How/Where**: Minor CSS/token edits to whichever surfaces have drift.

**Contract**: Visual spec verified. All three surfaces share the same accent, spacing, and typographic rhythm. No hardcoded colors remain in any component or stylesheet.

---

## Deliverables Checklist

- [ ] `packages/shared/fcl-tokens.css` created with `--fcl-*` custom properties for both overlay dark and plugin light contexts
- [ ] `adapter-nextjs`: Radix UI + Lucide installed in `package.json`
- [ ] `adapter-svelte`: Bits UI + Lucide Svelte installed in `package.json`
- [ ] `adapter-nextjs` `DomReviewOverlay.tsx`: `C` constant removed, Radix Popover/Select/Tooltip/AlertDialog used, all colors via `var(--fcl-*)`, accent is `#3891ff`, sub-components extracted
- [ ] `adapter-svelte` `DomReviewOverlay.svelte`: JS colors constant removed, Bits UI Popover/Select/Tooltip used, all colors via `var(--fcl-*)`, Svelte 5 runes throughout, accent is `#3891ff`
- [ ] `figma-plugin` `styles.css`: zero hardcoded hex (except status tags), all colors via `var(--fcl-*)` from token import
- [ ] `figma-plugin` `main.ts`: action registry pattern replaces `if/else` chain, manual focus save/restore eliminated
- [ ] Inline `style=` attributes removed from all HTML template strings in figma-plugin render layer
- [ ] `tokens-export.css` embedded in plugin build output
- [ ] Visual parity confirmed: accent, radius, typography consistent across all three surfaces
