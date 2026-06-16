// Zip dist/bundle → dist/phoenixpy-<version>.zip using yazl, which produces a
// standard PKZIP the Hub's yauzl extractor reads (bsdtar/`tar` zips are NOT
// yauzl-compatible). Store mode (no compression) → fast; fine for the local
// install test served over localhost. Switch to { compress: true } for release.

import yazl from "yazl";
import { createWriteStream, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(HERE, "..", "dist");
const SRC = join(DIST, "bundle");
const VERSION = "0.1.0";
const OUT = join(DIST, `phoenixpy-${VERSION}.zip`);

if (!existsSync(join(SRC, "module.json"))) {
  console.error("[zip-bundle] missing dist/bundle — run `node scripts/build-bundle.mjs` first.");
  process.exit(1);
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

// Default: compress (smaller download for the release). `--store` = no
// compression (fast, for the local install test served over localhost).
const STORE = process.argv.includes("--store");
const zip = new yazl.ZipFile();
let n = 0;
for (const file of walk(SRC)) {
  const entry = relative(SRC, file).split("\\").join("/"); // zip uses forward slashes
  zip.addFile(file, entry, { compress: !STORE });
  n++;
}
console.log(`[zip-bundle] adding ${n} files (${STORE ? "store" : "compress"} mode)…`);

zip.outputStream
  .pipe(createWriteStream(OUT))
  .on("close", () => {
    const mb = Math.round(statSync(OUT).size / (1024 * 1024));
    console.log(`[zip-bundle] done → ${OUT} (${mb} MB)`);
  });
zip.end();
