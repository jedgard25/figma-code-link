import AdmZip from "adm-zip";
import { access, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pluginRoot = path.resolve(__dirname, "..");
const distRoot = path.join(pluginRoot, "dist");
const distPlugin = path.join(distRoot, "plugin");
const zipPath = path.join(distRoot, "figma-code-link-plugin.zip");

async function ensureBuildOutput() {
  await access(path.join(distPlugin, "manifest.json"));
  await access(path.join(distPlugin, "code.js"));
  await access(path.join(distPlugin, "ui.html"));
}

async function runPackage() {
  await ensureBuildOutput();
  await rm(zipPath, { force: true });

  const zip = new AdmZip();
  zip.addLocalFolder(distPlugin);
  zip.writeZip(zipPath);

  console.log(`Packaged plugin at ${zipPath}`);
}

runPackage().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
