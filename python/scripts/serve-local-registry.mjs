// Local test harness for the Hub install flow — NO GitHub needed.
//
// Serves dist/ over http with a registry.json that points the Hub at the local
// bundle zip. Point the Hub at it with PHOENIXNEST_REGISTRY_URL and you get the
// real install experience (download → sha256 → extract → run embedded).
//
//   1) build the bundle + zip:
//        node scripts/build-bundle.mjs
//        tar -a -c -f dist/phoenixpy-0.1.0.zip -C dist/bundle .
//   2) serve it (this script, leave running):
//        node scripts/serve-local-registry.mjs
//   3) run the Hub against it (another terminal):
//        cd ../../hub          (i.e. PhoenixNest/hub)
//        $env:PHOENIXNEST_REGISTRY_URL="http://127.0.0.1:8799/registry.json"
//        npm run dev
//   → PhoenixPy shows in the Hub's "add module" → Install → progress → embeds.

import { createServer } from "node:http";
import {
  createReadStream,
  statSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PY_ROOT = resolve(HERE, "..");
const DIST = join(PY_ROOT, "dist");
const ZIP_NAME = "phoenixpy-0.1.0.zip";
const ZIP = join(DIST, ZIP_NAME);
const PORT = 8799;
const HOST = "127.0.0.1";

if (!existsSync(ZIP)) {
  console.error(`[local-registry] missing ${ZIP}\n  build it first:\n  node scripts/build-bundle.mjs\n  tar -a -c -f dist/${ZIP_NAME} -C dist/bundle .`);
  process.exit(1);
}

function sha256(path) {
  return new Promise((res, rej) => {
    const h = createHash("sha256");
    const s = createReadStream(path);
    s.on("data", (d) => h.update(d));
    s.on("end", () => res(h.digest("hex")));
    s.on("error", rej);
  });
}

console.log("[local-registry] hashing bundle…");
const sha = await sha256(ZIP);
const sizeMb = Math.round(statSync(ZIP).size / (1024 * 1024));

const registry = {
  modules: [
    {
      id: "python",
      name: "PhoenixPy",
      icon: "🐍",
      description: "Local Python IDE — notebook, editor, terminal, and AI assistant",
      type: "service",
      latest: "0.1.0",
      size: `${sizeMb} MB`,
      url: `http://${HOST}:${PORT}/${ZIP_NAME}`,
      sha256: sha,
    },
  ],
};
writeFileSync(join(DIST, "registry.json"), JSON.stringify(registry, null, 2));
console.log(`[local-registry] registry.json written (sha256 ${sha.slice(0, 16)}…, ${sizeMb} MB)`);

createServer((req, res) => {
  const name = decodeURIComponent((req.url || "/").split("?")[0]).replace(/^\/+/, "");
  const file = join(DIST, name);
  if (!file.startsWith(DIST) || !name || !existsSync(file)) {
    res.writeHead(404);
    return res.end("not found");
  }
  const st = statSync(file);
  res.writeHead(200, {
    "Content-Length": st.size,
    "Content-Type": extname(file) === ".json" ? "application/json" : "application/octet-stream",
  });
  createReadStream(file).pipe(res);
}).listen(PORT, HOST, () => {
  console.log(`\n[local-registry] serving ${DIST} at http://${HOST}:${PORT}`);
  console.log("[local-registry] now run the Hub against it (another terminal):");
  console.log("    cd P:\\PhoenixNest\\hub");
  console.log(`    $env:PHOENIXNEST_REGISTRY_URL="http://${HOST}:${PORT}/registry.json"`);
  console.log("    npm run dev");
  console.log("\n[local-registry] leave this running. Ctrl+C to stop.\n");
});
