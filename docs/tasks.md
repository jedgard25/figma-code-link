## tasks

Status: Completed on 2026-03-02.

We need to update our adapter and figma plugin:

## NextJS Adapter:

[x] DomReview overlay hover tracking now re-evaluates on scroll/resize using the last pointer position, so outlines stay aligned to the container and naturally transition as the cursor passes over new containers while scrolling.

Comment UI: (domReviewOverlay)
[x] Collapsed comment pin increased to ~2x size.
[x] Pin anchor moved to top-right, fully inside the outlined container with padding.
[x] Added delete action for existing review comments in popup view mode.
[x] Editing now preloads the existing comment/status instead of emptying fields.

## Plugin

[x] Review-mode link flow now requests and persists `layerTree` + `componentsUsed` using the same modal export flow as build mode.
[x] Centralized modal metadata extraction in UI (`getModalMetadataPayload`) to avoid duplicated logic between build/link/edit flows.

**Review Checklist:**

- SSOT maintained? Stores/DB truth clear and clean?
- Patchwork fixes? (excess events/vars, duplicated logic, non-standard patterns)
- Solutions elegant? Comments accurate? (remove transient)
- Code bloat/smell? Overly-complex state management?
- Files need atomization?

As you are making multiple changes, you should also see if theres other areas of centralization, cleanup, or codebase improvement.

[x] Small centralization cleanup completed for modal payload handling; no additional broad refactors were introduced to keep scope focused.


