// Assemble a PhoenixPy module bundle for the Hub (flow's model). Produces a
// folder the Hub can install (download → extract → run embedded):
//
//   dist/bundle/
//     module.json           manifest (service: backend cmd/args + frontend server.js)
//     api/  app/ + phoenix_py_entry.py + requirements.txt + runtime/ (Python)
//     web/  Next standalone (server.js + node_modules + .next + public)
//
// Prereqs:
//   • apps/web:  pnpm build      (produces .next/standalone)
//   • apps/api:  venv with deps  (pip install -r requirements.txt)
//
// Modes:
//   local   (default) — copy the dev venv as the runtime. Runs ONLY on this
//                        machine (a venv hardcodes its base-Python path). Use to
//                        test the full Hub install/run flow.
//   …portable cross-machine Python (python-build-standalone) comes next.
//
// Run:  node scripts/build-bundle.mjs

import {
  cpSync,
  rmSync,
  mkdirSync,
  existsSync,
  writeFileSync,
} from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PY_ROOT = resolve(HERE, ".."); // python/
const API = join(PY_ROOT, "apps", "api");
const STANDALONE = join(PY_ROOT, "apps", "web", ".next", "standalone");
const OUT = join(PY_ROOT, "dist", "bundle");
const VERSION = "0.1.0";

const log = (m) => console.log(`[build-bundle] ${m}`);
const noPyc = (src) => !src.includes("__pycache__");

if (!existsSync(join(STANDALONE, "server.js"))) {
  console.error("[build-bundle] missing web standalone — run `pnpm build` in apps/web first.");
  process.exit(1);
}
if (!existsSync(join(API, "venv", "Scripts", "python.exe"))) {
  console.error("[build-bundle] missing apps/api/venv — create it + pip install -r requirements.txt first.");
  process.exit(1);
}

log(`output: ${OUT}`);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "api"), { recursive: true });

// 1) backend source (app/ + entry + requirements — NOT data/, tests/, venv)
log("copying backend source");
cpSync(join(API, "app"), join(OUT, "api", "app"), { recursive: true, filter: noPyc });
cpSync(join(API, "phoenix_py_entry.py"), join(OUT, "api", "phoenix_py_entry.py"));
cpSync(join(API, "requirements.txt"), join(OUT, "api", "requirements.txt"));

// 2) Python runtime — LOCAL mode: copy the dev venv (this machine only).
log("copying Python runtime (venv → api/runtime) — LOCAL-machine only");
cpSync(join(API, "venv"), join(OUT, "api", "runtime"), { recursive: true, filter: noPyc });

// 3) web standalone
log("copying web standalone (→ web/)");
cpSync(STANDALONE, join(OUT, "web"), { recursive: true });

// 4) manifest the Hub reads (openServiceBundle)
const manifest = {
  id: "python",
  name: "PhoenixPy",
  version: VERSION,
  type: "service",
  backend: {
    cmd: "api/runtime/Scripts/python.exe",
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
log(`done — bundle at ${OUT}`);
