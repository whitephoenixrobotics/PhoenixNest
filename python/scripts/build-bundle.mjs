// Assemble a PhoenixPy module bundle for the Hub (flow's model). Produces a
// folder the Hub installs (download → extract → run embedded):
//
//   dist/bundle/
//     module.json           manifest (service: backend cmd/args + frontend server.js)
//     api/  app/ + phoenix_py_entry.py + requirements.txt + runtime/ (portable Python)
//     web/  Next standalone (server.js + node_modules + .next + public)
//
// The runtime is a SELF-CONTAINED python-build-standalone interpreter — Python
// "embedded in the bundle" like flow, but a real interpreter (not a frozen exe)
// so it can also create venvs + run the user's notebooks. Runs on any Windows
// machine with no system Python.
//
// Prereq:  apps/web → pnpm build   (produces .next/standalone)
// Run:     node scripts/build-bundle.mjs

import {
  cpSync,
  rmSync,
  mkdirSync,
  existsSync,
  writeFileSync,
  renameSync,
} from "node:fs";
import { execSync } from "node:child_process";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PY_ROOT = resolve(HERE, ".."); // python/
const API = join(PY_ROOT, "apps", "api");
const STANDALONE = join(PY_ROOT, "apps", "web", ".next", "standalone");
const DIST = join(PY_ROOT, "dist");
const OUT = join(DIST, "bundle");
const CACHE = join(DIST, "cache");
const VERSION = "0.1.0";

// Pinned python-build-standalone (CPython 3.13, x86_64 Windows, install_only —
// the clean relocatable layout). Bump the tag/version to update Python.
const PBS_TAG = "20260610";
const PBS_FILE = `cpython-3.13.14+${PBS_TAG}-x86_64-pc-windows-msvc-install_only.tar.gz`;
const PBS_URL = `https://github.com/astral-sh/python-build-standalone/releases/download/${PBS_TAG}/${encodeURIComponent(PBS_FILE)}`;

const log = (m) => console.log(`[build-bundle] ${m}`);
const noPyc = (src) => !src.includes("__pycache__");
const sh = (cmd, opts = {}) => execSync(cmd, { stdio: "inherit", shell: true, ...opts });

if (!existsSync(join(STANDALONE, "server.js"))) {
  console.error("[build-bundle] missing web standalone — run `pnpm build` in apps/web first.");
  process.exit(1);
}

log(`output: ${OUT}`);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "api"), { recursive: true });
mkdirSync(CACHE, { recursive: true });

// 1) backend source (app/ + entry + requirements — NOT data/, tests/, venv)
log("copying backend source");
cpSync(join(API, "app"), join(OUT, "api", "app"), { recursive: true, filter: noPyc });
cpSync(join(API, "phoenix_py_entry.py"), join(OUT, "api", "phoenix_py_entry.py"));
cpSync(join(API, "requirements.txt"), join(OUT, "api", "requirements.txt"));

// 2) portable Python runtime → api/runtime
const pbsTar = join(CACHE, PBS_FILE);
if (!existsSync(pbsTar)) {
  log(`downloading python-build-standalone (${PBS_TAG}, ~45MB)…`);
  sh(`curl -sL -o "${pbsTar}" "${PBS_URL}"`);
} else {
  log("python-build-standalone cached — skipping download");
}
log("extracting Python runtime");
// Run tar from the cache dir with a bare filename — a "P:\…" arg makes GNU tar
// (git/msys) treat the drive as a remote host ("Cannot connect to \P"). Extract
// to cache/python, then move it into the bundle with Node.
rmSync(join(CACHE, "python"), { recursive: true, force: true });
sh(`tar -xzf "${PBS_FILE}"`, { cwd: CACHE }); // → cache/python/
renameSync(join(CACHE, "python"), join(OUT, "api", "runtime")); // → api/runtime/

log("pip install backend deps into the runtime");
sh(`"${join(OUT, "api", "runtime", "python.exe")}" -m pip install --no-warn-script-location -q -r requirements.txt`, {
  cwd: join(OUT, "api"),
});

// 3) web standalone
log("copying web standalone (→ web/)");
cpSync(STANDALONE, join(OUT, "web"), { recursive: true });

// 4) manifest the Hub reads (openServiceBundle). The standalone runtime puts
//    python.exe at the runtime root (not Scripts/).
const manifest = {
  id: "python",
  name: "PhoenixPy",
  version: VERSION,
  type: "service",
  backend: {
    cmd: "api/runtime/python.exe",
    args: ["phoenix_py_entry.py"],
    cwd: "api",
    port: 8200,
    portEnv: "PHOENIX_API_PORT",
    health: "http://127.0.0.1:8200/health",
  },
  frontend: {
    entry: "web/server.js",
    port: 3300,
    ready: "http://127.0.0.1:3300/",
  },
  url: "http://127.0.0.1:3300",
};
writeFileSync(join(OUT, "module.json"), JSON.stringify(manifest, null, 2));
log("module.json written");
log(`done — portable bundle at ${OUT}. Next: node scripts/zip-bundle.mjs`);
