# Figma Code Link — Implementation Review

> Does this implementation make sense for the bigger goal? Can we simplify? Design concerns?

---

## ✅ Architecture Assessment

The plan is **sound and well-scoped**. The two-track approach (adapter-nextjs for the server + plugin rewrite for the UI) is the right call. Key strengths:

1. **Express over Next.js API routes** — Correct. The fixed port `:7842` is essential for the Figma plugin's `devAllowedDomains` whitelist. Next.js API routes would be tied to the dev server's port (usually `:3000`), which changes and can't be hardcoded into [manifest.json](file:///Users/evindrews/Documents/figma-code-link/packages/figma-plugin/manifest.json).

2. **`figma-tasks.json` as SSOT** — Clean. File-based persistence means zero infrastructure, git-trackable state, and direct agent consumption. No database, no Redis, no in-memory only.

3. **Deferred CID preprocessing** — Smart phasing. Build mode doesn't need CID injection at all — entries originate from Figma, not the browser DOM. This avoids the Babel/SWC plugin complexity until Review mode is actually needed.

4. **Plugin stays vanilla HTML/CSS/JS** — Correct constraint. Figma plugins run in a sandboxed iframe with no build tooling. No React, no bundler.

---

## ⚠️ Design Concerns & Questions

### 1. Express as a dependency weight

Express pulls in ~30 packages. For a dev-only server that serves 6 endpoints, consider **a lighter alternative**:
- **`http` (Node built-in)** — Zero deps. Manual routing, but the API surface is tiny.
- **`polka` or `micro`** — ~1 dep, Express-compatible API.

**Recommendation:** Start with Express for speed of implementation. If package size becomes a concern, swap to Node `http` later — the route handlers are so simple they barely need a framework.

### 2. CORS permissiveness

The plan says "CORS fully permissive for localhost origins." This is fine for dev, but worth noting:
- The Figma plugin iframe makes `fetch()` calls to `localhost:7842` from a Figma-controlled origin. The CORS headers need to allow `*` or the specific Figma iframe origin (which is opaque/null for `data:` and `blob:` URIs).
- **Action:** Use `cors({ origin: true })` in Express — this reflects the request origin back, which handles all cases.

### 3. Thumbnail re-fetching on plugin restart

The plan states thumbnails are transient — re-fetched on plugin load by iterating over all entries. For a queue with many entries, this could be slow (each `exportAsync` is a ~100-500ms operation).

**Mitigation options:**
- Lazy-load thumbnails: only fetch when the item is visible (intersection observer pattern, but in a simple list this may not help much).
- Cache thumbnails in plugin storage (`figma.clientStorage.setAsync`) with `nodeId` as key.
- Accept the latency — the queue is unlikely to exceed ~20 items in practice.

**Recommendation:** Accept latency for MVP. If it becomes noticeable, add `figma.clientStorage` caching.

### 4. yalc workflow for ongoing development

yalc requires `yalc publish` + `yalc push` on every change to `adapter-nextjs`. This is friction during active development.

**Mitigation:** Add a `"dev"` script to `adapter-nextjs` that watches + rebuilds + pushes:
```json
"dev": "tsc --watch & yalc push --changed"
```
Or use `nodemon`/`chokidar-cli` to automate the push cycle.

### 5. Future adapter extensibility

The plan mentions a "generic server abstraction" in the spec (§6.1) but the implementation plan correctly defers it. When `adapter-svelte` is eventually built, the server code will be nearly identical — just the client component and (optionally) preprocessing differ.

**Future action:** Extract `server/` into a shared `@figma-code-link/core` package. For now, keep it in `adapter-nextjs`.

---

## 🔍 Simplification Opportunities

| Area | Current | Simpler? |
|------|---------|----------|
| `FigmaCodeLink` React component | Polls `/health`, shows FAB with task count popover | Could be even simpler: just a floating dot. No popover until Review mode. |
| `bin` entry for CLI | `npx figma-link-server` | Could just be a documented `node` command. Avoid over-engineering the DX for a single integration. |
| Monorepo workspaces | npm workspaces + `tsconfig.base.json` | Only 2 packages (plugin has no build). Could skip workspaces and just have independent packages. But workspaces are low-cost to set up. |

**Verdict:** These are minor. The plan is already lean. Ship as-is.

---

## Q&A

**Q: Why not use the Figma REST API for thumbnails instead of `exportAsync`?**
A: The REST API (`/v1/images/{file_key}`) requires authentication (personal access token or OAuth) and network access. `exportAsync` runs locally in the plugin sandbox with no auth needed. It's simpler and faster for dev-only usage.

**Q: Should `figma-tasks.json` live in the project root or `docs/`?**
A: Project root is the default — agents find it immediately. Make it configurable via `startFigmaLinkServer({ filePath: './docs/figma-tasks.json' })` for projects that prefer a `docs/` directory.

**Q: Could an agent update task status via the API, or should it edit `figma-tasks.json` directly?**
A: Both should work. The API is the clean path (`PUT /tasks/:entryId { status: "review" }`), but since the file is just JSON, direct file edits work too. The server re-reads from disk on every request, so there's no out-of-sync risk.

**Q: What happens if two plugin instances or an agent and plugin write simultaneously?**
A: Simple last-write-wins. The JSON file is tiny and writes are atomic (write to temp → rename). Race conditions are theoretically possible but practically negligible for a single-developer tool.

---

## Conclusion

The plan is **ready to execute**. No major architectural changes needed. The phasing is correct, the scope is right-sized, and the deferred items (Review mode, CID preprocessing) are properly identified as future work. Ship Phase 1 + 2 as the sprint deliverable.
