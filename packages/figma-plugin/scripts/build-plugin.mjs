import { build } from "esbuild";
import {
  mkdir,
  readFile,
  rm,
  writeFile,
  copyFile,
  access,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pluginRoot = path.resolve(__dirname, "..");
const distRoot = path.join(pluginRoot, "dist");
const distPlugin = path.join(distRoot, "plugin");
const tmpRoot = path.join(distRoot, ".tmp");

async function ensureFile(filePath) {
  try {
    await access(filePath);
  } catch (_error) {
    throw new Error(`Expected file to exist: ${filePath}`);
  }
}

async function runBuild() {
  await rm(distRoot, { recursive: true, force: true });
  await mkdir(distPlugin, { recursive: true });
  await mkdir(tmpRoot, { recursive: true });

  await build({
    entryPoints: [path.join(pluginRoot, "src/plugin/main.ts")],
    bundle: true,
    format: "iife",
    target: ["es2018"],
    outfile: path.join(distPlugin, "code.js"),
    logLevel: "info",
  });

  await build({
    entryPoints: [path.join(pluginRoot, "src/ui/main.ts")],
    bundle: true,
    format: "iife",
    target: ["es2018"],
    outfile: path.join(tmpRoot, "ui.js"),
    logLevel: "info",
    loader: {
      ".css": "css",
    },
  });

  const templateHtml = await readFile(
    path.join(pluginRoot, "src/ui/index.html"),
    "utf8",
  );
  const uiJs = await readFile(path.join(tmpRoot, "ui.js"), "utf8");
  const uiCss = await readFile(path.join(tmpRoot, "ui.css"), "utf8");

  const finalHtml = templateHtml
    .replace("<!-- STYLES -->", `<style>\n${uiCss}\n</style>`)
    .replace("<!-- SCRIPT -->", `<script>\n${uiJs}\n</script>`);

  await writeFile(path.join(distPlugin, "ui.html"), finalHtml, "utf8");
  await copyFile(
    path.join(pluginRoot, "manifest.json"),
    path.join(distPlugin, "manifest.json"),
  );

  await ensureFile(path.join(distPlugin, "manifest.json"));
  await ensureFile(path.join(distPlugin, "code.js"));
  await ensureFile(path.join(distPlugin, "ui.html"));

  await rm(tmpRoot, { recursive: true, force: true });
  console.log(`Built plugin to ${distPlugin}`);
}

runBuild().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
