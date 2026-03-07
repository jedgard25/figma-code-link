# Figma Code Link Svelte Adapter

This package provides the Svelte overlay runtime, a conservative CID preprocessor, Vite dev boot integration, and the shared Figma Code Link server helpers.

## Quick Start

Add the Vite plugin so `npm run dev` starts the Figma Code Link server automatically.

```ts
import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { createFigmaLinkVitePlugin } from "figma-code-link-svelte/vite";

export default defineConfig({
  plugins: [createFigmaLinkVitePlugin(), sveltekit()],
});
```

Enable CID injection in Svelte preprocessing.

```js
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { cidPreprocessor } from "figma-code-link-svelte/preprocess";

export default {
  preprocess: [
    vitePreprocess(),
    cidPreprocessor({
      sourceRoot: new URL("./src", import.meta.url).pathname,
      skipFileMarker: "figma-link-disable",
    }),
  ],
};
```

Mount the runtime overlay in your root layout.

```svelte
<script lang="ts">
  import { DomReviewOverlay } from "figma-code-link-svelte";
</script>

<DomReviewOverlay />
```

## Compatibility Hooks

- `sourceRoot`: stabilizes relative CID paths across larger repos.
- `include` / `exclude`: limit preprocessing to known-safe files.
- `formatCid`: customize CID formatting while preserving deterministic path + line semantics.
- `skipFileMarker`: disable automatic CID injection for files that need manual control.

If a component is too dynamic for safe automatic injection, prefer manual `data-cid` values.

## Behavior

- The preprocessor only targets native elements and never overwrites explicit `data-cid` attributes.
- The overlay uses the same shared task/review API as the Next.js adapter.
- Screenshot capture is bundled in the package and stored under `.figma-link/screens/`.
- The standalone fallback remains available through `startFigmaLinkServer()` or the `figma-link-server` CLI.

## Reference Integration

`origami-app` now uses this packaged adapter for its Svelte/Tauri development workflow instead of an embedded overlay and custom Tauri HTTP bridge.
