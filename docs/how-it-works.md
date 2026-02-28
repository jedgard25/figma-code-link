# Figma Code Link — How It Works (High Level)

## Big Picture

This system has 3 parts:

1. **Host app integration** (`evin-drews-site`)
   - Renders a small dev-only FAB (`FigmaCodeLink`) in the app.
   - Talks to `http://localhost:7842` to show connection + task count.

2. **Local task server** (`adapter-nextjs`)
   - Runs on **port 7842**.
   - Owns the JSON queue file (`figma-tasks.json`).
   - API:
     - `GET /health`
     - `GET /tasks`
     - `POST /tasks`
     - `PUT /tasks/:entryId`
     - `DELETE /tasks/:entryId`
     - `DELETE /tasks`

3. **Figma plugin** (`packages/figma-plugin`)
   - Connects to the same local server.
   - Lets you add/edit queue metadata from Figma selection flow.
   - Exports node thumbnails via plugin sandbox and displays them in queue cards.

---

## Data Flow

- Plugin or app UI action → calls server API → server updates `figma-tasks.json`.
- Anyone reading the file (human, Copilot, scripts) sees the same source of truth.

`figma-tasks.json` lives in the host project root by default.

---

## Important Runtime Behavior

- `npm run dev` in `evin-drews-site` **does not** auto-start the task server.
- Server starts separately with:

```bash
npm run figma-link
```

So during dev you usually run **two terminals**:

1. `npm run dev`
2. `npm run figma-link`

---

## Dev Command Cheatsheet (What to run + in what order)

Use this section as your fast memory aid.

### First-time setup (or after dependency changes)

Terminal A (in `figma-code-link`):

```bash
cd /Users/evindrews/Documents/figma-code-link
npm install
```

Terminal B (in `evin-drews-site`):

```bash
cd /Users/evindrews/Documents/evin-drews-site
npm install
```

### Normal daily dev (app + server)

Terminal 1 (in `evin-drews-site`):

```bash
cd /Users/evindrews/Documents/evin-drews-site
npm run dev
```

Terminal 2 (in `evin-drews-site`):

```bash
cd /Users/evindrews/Documents/evin-drews-site
npm run figma-link
```

### After editing `adapter-nextjs` (fast sync path)

From `evin-drews-site` run one command:

```bash
cd /Users/evindrews/Documents/evin-drews-site
npm run figma-link:sync
```

That command does all of this for you:

1. builds `adapter-nextjs`
2. `yalc push` from `figma-code-link`
3. `yalc update` + `npm install` in `evin-drews-site`

Then restart any running `dev`/`figma-link` terminals.

### Quick preflight before opening/running plugin

```bash
curl http://localhost:7842/health
curl http://localhost:7842/tasks
```

- `/health` should return `{ "ok": true }`
- `/tasks` should return a JSON object with `version` + `entries`

### Most common test loop

1. Start app: `npm run dev`
2. Start server: `npm run figma-link`
3. In Figma, run plugin
4. Add a queue item
5. Verify queue updates in plugin + app
6. If you edited `adapter-nextjs`, run `npm run figma-link:sync` and restart processes

---

## yalc (Local Package Linking) — Practical Mental Model

`yalc` is a local “fake publish” workflow for npm packages.

- In the package repo (`figma-code-link`), you publish a local snapshot.
- In the consuming repo (`evin-drews-site`), you install that snapshot.

### Typical update cycle after editing `adapter-nextjs`

From `figma-code-link/packages/adapter-nextjs`:

```bash
npm run build
npx yalc publish
```

From `evin-drews-site`:

```bash
npx yalc update figma-code-link-nextjs
npm install
```

Then restart any running processes if needed (`dev` / `figma-link`).

> In short: **yes**, if you edit `adapter-nextjs`, you do need to refresh the consumer repo’s yalc package to pick up changes.

---

## Quick Troubleshooting

- Plugin says waiting for server:
  - check `npm run figma-link`
  - check `curl http://localhost:7842/health`
- Queue not updating in app/plugin:
  - check `curl http://localhost:7842/tasks`
  - verify `figma-tasks.json` exists in host repo root.
