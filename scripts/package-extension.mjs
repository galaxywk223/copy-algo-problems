import { createWriteStream } from "node:fs";
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import archiver from "archiver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const manifestPath = path.join(rootDir, "manifest.json");
const distDir = path.join(rootDir, "dist");
const assetsDir = path.join(rootDir, "assets");
const releaseDir = path.join(rootDir, "release");

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const version = manifest.version;
const packageBaseName = `copy-algo-problems-${version}`;
const stagingDir = path.join(releaseDir, packageBaseName);
const zipPath = path.join(releaseDir, `${packageBaseName}.zip`);

await rm(stagingDir, { force: true, recursive: true });
await rm(zipPath, { force: true });
await mkdir(stagingDir, { recursive: true });

await cp(manifestPath, path.join(stagingDir, "manifest.json"));
await cp(assetsDir, path.join(stagingDir, "assets"), { recursive: true });
await cp(distDir, path.join(stagingDir, "dist"), { recursive: true });

await createZip(stagingDir, zipPath, packageBaseName);

console.log(`Packaged extension: ${zipPath}`);

function createZip(sourceDir, outputPath, rootFolderName) {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(outputPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", resolve);
    output.on("error", reject);
    archive.on("error", reject);

    archive.pipe(output);
    archive.directory(sourceDir, rootFolderName);
    archive.finalize();
  });
}
