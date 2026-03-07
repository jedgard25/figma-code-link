import fs from "node:fs";
import path from "node:path";

const root = new URL("..", import.meta.url);

function copy(relativePath) {
  const sourcePath = path.join(root.pathname, relativePath);
  const targetPath = path.join(
    root.pathname,
    "dist",
    relativePath.replace(/^src\//, ""),
  );
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

[
  "src/components/DomReviewOverlay.svelte",
  "src/components/DomReviewOverlay.svelte.d.ts",
  "src/components/FigmaCodeLink.svelte",
  "src/components/FigmaCodeLink.svelte.d.ts",
].forEach(copy);
