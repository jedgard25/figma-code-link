# Review — Review Mode Implementation

## Does this implementation make sense for the bigger goal?

Yes, directionally. The plan keeps `figma-tasks.json` as the single source of truth, extends the existing type system minimally, reuses the modal flow in the plugin, and delivers `DomReviewOverlay` as a portable package component. CIDPreprocessor is now correctly treated as integral infrastructure rather than an optional add-on. The phasing is clean and parallel.

---

## Refactor / Simplification Opportunities

### 1. `type: "build" | "review"` vs. top-level sections

The plan adds a `type` discriminant to `TaskEntry` and keeps everything in `entries[]`. The overview floated splitting into `"build": []` / `"review": []` top-level keys. Both work, but the flat discriminant is simpler and requires no migration of the store's existing loop logic. **Recommend the discriminant approach.**

### 2. `PUT /review/:dataCid/link` vs. reusing `PUT /tasks/:figmaNodeId`

Adding a separate route for linking feels right because review entries may not have a `figmaNodeId` yet (it's the thing being assigned). But `PUT /tasks` currently identifies records by `figmaNodeId` — this can't be used for unlinked entries. The new `PUT /review/:dataCid/link` is the correct call. However, `dataCid` values are human-readable strings like `"hero.cta.primary"` — ensure they're URL-encoded at the call site.

### 3. `html2canvas` as a peer dependency

`html2canvas` is a non-trivial bundle addition. The capture is a nice-to-have — the `dataCid` value is already enough for Copilot to grep the component. Consider making it an optional import with a graceful fallback, and documenting it as opt-in. The plan already says "skip silently if unavailable" — this is the right call, but the consumer should know they need to install it.

### 4. Screenshot serving via `/review/screenshot/:filename` proxy

This is the right pattern — keeps the plugin iframe from needing filesystem access. One concern: the `.figma-link/screens/` directory needs to be added to `.gitignore` in consumer repos. Document this.

### 5. `DevCidInspector.tsx` removal

Previous plan said leave it. Updated: delete `DevCidInspector.tsx` and `dev-cid.css` from `evin-drews-site` on integration. The package component is the canonical implementation; keeping the old file creates confusion and a maintenance trap.

---

## Design Concerns

### Unlinked entry identity

Review entries created from the DOM have no `figmaNodeId` at creation time. The store currently uses `figmaNodeId` as the primary key for upserts, deduplication, and URL routing (`PUT /tasks/:figmaNodeId`). This assumption breaks for review entries.

**Resolution in the plan:** `dataCid` becomes the primary key for review entries. The store needs a secondary index / lookup path. This is the most architecturally significant change — make sure `store.ts` deduplication in `normalizeTaskFile` handles entries where `figmaNodeId` is absent (currently it would collapse them to one entry since all have `figmaNodeId: ""`).

**Concrete fix needed:** `normalizeTaskFile` deduplication must key review entries by `dataCid` when `figmaNodeId` is empty, not by `figmaNodeId`.

### Linked review entry identity shift

Once a review entry is linked (`figmaNodeId` assigned), it now has a valid `figmaNodeId`. At that point, does it behave like a build entry? Probably not — it should remain `type: "review"` and still be addressable by `dataCid`. Don't allow the link operation to change the primary key used downstream.

### Status semantics ambiguity (pre-existing)

`TaskStatus` has `"review"` as a value AND `ViewName` has `"review"`. Review entries in the new system will default to `"to-fix"` status. The existing `"review"` status value is now ambiguous — it meant something else before. Consider whether `"to-fix"` is the right default, and whether `TaskStatus` needs a cleanup pass (e.g., remove the `"review"` status since it's no longer needed as a status once there's a proper `type` field).

---

## Q&A

**Q: Do review entries appear in the Build view as well?**  
A: No — they should be filtered by `type`. `GET /tasks` returns only `type === "build"` entries; `GET /review` returns only `type === "review"`. The build view only shows build entries.

**Q: What happens when you run `Copy Set` on review entries?**  
A: Should copy them in the same format as build entries — the Copilot consumer is the same. The linked `dataCid` provides the grep anchor; the Figma side provides the design spec. Both are useful together.

**Q: Can a review entry be promoted to a build entry?**  
A: Not in scope now. Could be a future status/type transition flow.

**Q: Should the plugin be able to create review entries (from Figma side only, without a DOM interaction)?**  
A: Not in this iteration. Review entries originate from DOM selection. Figma plugin's role is to link and annotate.

**Q: Screenshot capture timing — what if the element animates or is in a scroll-hidden state?**  
A: The screenshot is taken at click time, so the element is visible. Scroll position is respected by `getBoundingClientRect`. This is acceptable for a dev tool.
