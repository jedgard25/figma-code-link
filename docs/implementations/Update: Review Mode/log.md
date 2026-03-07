# Review Mode Implementation Log

Date: 2026-03-01

## Completed

- Added schema v2 support in adapter with `TaskEntry.type`, `dataCid`, and `domThumbnailPath`.
- Added review APIs in adapter server:
  - `GET /review`
  - `POST /review`
  - `PUT /review/:dataCid`
  - `PUT /review/:dataCid/link`
  - `DELETE /review/:dataCid`
  - `DELETE /review`
  - `POST /review/screenshot`
  - `GET /review/screenshot/:filename`
- Added PNG sidecar storage under `.figma-link/screens/` and ensured screenshots are not embedded in `figma-tasks.json`.
- Implemented `DomReviewOverlay` in adapter package and exported it from package index.
- Added CID preprocessor Babel plugin (`src/babel/cid-preprocessor.ts`) and export barrel.
- Extended plugin shared types, client API helpers, view renderer, modal renderer, and main orchestrator for Review mode.
- Implemented linked/unlinked review card UI with dual thumbnails and link/edit/delete/copy actions.
- Mounted `<DomReviewOverlay />` in consumer app `layout.tsx`.
- Removed old `DevCidInspector.tsx` and `dev-cid.css` from consumer app.
- Added `.figma-link/` to consumer `.gitignore`.

## Validation

- Ran static error checks on adapter, plugin, and consumer integration files.
- Ran monorepo build successfully:
  - `npm run build` in `figma-code-link` completed without failures.

## Notes / Concerns

- Consumer `next.config.ts` activates the CID plugin via a path-string Babel plugin entry to avoid type-export drift before local package sync.
- After pushing/publishing the updated adapter package, consumer can switch to direct imported activation if desired.
