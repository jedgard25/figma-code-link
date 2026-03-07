# Architectural Review: Unified Design System

The request is well-scoped and technically sound. Proceed with the plan. Four concerns need to be resolved before implementation starts — each has a clear resolution.

---

## 1. Token Scoping: Overlays Inject into Host Apps

**The problem**: `tokens-export.css` defines all tokens on `:root`. The overlay adapters (`DomReviewOverlay`) inject themselves into arbitrary user applications — at runtime, the host app owns `:root`. Injecting FCL tokens there risks name collisions and pollutes the host app's cascade.

**Resolution**: Define FCL-specific tokens as `--fcl-*` custom properties scoped to `[data-fcl-root]` attribute on the overlay's root container element. These properties hold token values **directly** (e.g., `--fcl-bg: #2d2620;`) rather than chaining `var()` references to `:root`. The overlay becomes a fully self-contained CSS scope. `tokens-export.css` is the human source of truth for what values to use — it is never injected into a host app at runtime.

The Figma plugin owns its own full HTML context and is exempt from this constraint — it can reference tokens normally on `:root`.

---

## 2. Three Accent Colors Must Collapse to One

**The problem**: The two adapters currently use different accent colors (Svelte: orange `#ff6b35`, Next.js: purple `#7B61FF`) with no design rationale for the difference. The Figma plugin uses yet another purple (`#7c6df0`). None of these match the token system's brand primary.

**Resolution**: Standardize on `#3891ff` (from `--brand-primary` in `tokens-export.css`) as the single FCL accent across all three surfaces. This eliminates the inconsistency and grounds the design in the actual token system the user is adopting.

---

## 3. "SF Pro" Token Value Is Not Embeddable

**The problem**: `tokens-export.css` lists `--font-primary: "SF Pro"`. SF Pro is a licensed Apple system font — it cannot be embedded and will silently fall back. Using it as a CSS `font-family` value alone will fail on non-Apple systems.

**Resolution**: Implement the font using the full system font stack that resolves to SF Pro where available:

```
-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif
```

Treat `--font-primary: "SF Pro"` as a design-layer label, not a CSS production value. Each adapter/plugin implementation should use the full stack string.

---

## 4. Headless Library Scope Is Appropriate, With Caveats

Radix UI (Next.js) and Bits UI (Svelte) are the right choices. The overlays are dev-only — bundle cost is negligible. The primitives (Popover, Select, Tooltip) replace fragile hand-rolled DOM positioning and eliminate the focus-capture/restore hacks present in both adapters.

- Radix UI requires React 18+ → Next.js adapter targets `react >=18` ✅
- Bits UI requires Svelte 5 → Svelte adapter targets `svelte >=5.0.0` ✅
- Lucide is correct for icons — consistent, tree-shakeable, good TypeScript support

**Caveat**: The Next.js `DomReviewOverlay.tsx` (~1,400 lines) and Figma plugin `main.ts` (~650 lines) are monolithic. The redesign is an opportunity to extract sub-components (`CommentPin`, `ReviewPopup`, `Toolbar`). This should be done as part of the redesign — not deferred — to avoid delivering the same architectural debt in new clothes.

---

## 5. Figma Plugin: Light Theme Is Correct, Not Design Debt

The plugin runs inside Figma's own panel — a light-themed IDE. Using a dark theme there would be jarring and incongruent. The current light theme is correct. The only debt is the hardcoded hex values, not the theme direction.

---

## Verdict

Proceed. The approach is sound when the token scoping constraint (#1) is strictly followed. The plan should:

- Never inject `tokens-export.css` or any `:root` token declarations into a host app
- Unify accent on `#3891ff`
- Atomize monolithic components during the redesign pass
- Use the full system font stack in all production CSS
