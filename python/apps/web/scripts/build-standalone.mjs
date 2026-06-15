// Make Next's standalone output self-contained (no pnpm symlinks), so the Hub
// can copy it into a module bundle and run `node server.js` on any machine.
//
// pnpm hoists deps under node_modules/.pnpm/ and symlinks the top-level
// node_modules/<pkg>. Windows file-copy strips those symlinks, so the packaged
// app fails on require('next') etc. We rebuild a flat node_modules with
// `npm install --omit=dev` and swap it in. Mirrors flow's build-standalone.mjs;
// PhoenixPy's web is a standalone (non-workspace) project, so the standalone
// root is .next/standalone directly (flow nests under apps/web).
//
// Run after `next build` (the build script chains it).

import { execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  rmSync,
  cpSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(HERE, "..");
const NEXT_OUT = join(WEB_ROOT, ".next");
const STANDALONE = join(NEXT_OUT, "standalone");

const log = (m) => console.log(`[build-standalone] ${m}`);
const run = (cmd, opts = {}) => {
  log(`$ ${cmd}`);
  execSync(cmd, { stdio: "inherit", shell: true, ...opts });
};

if (!existsSync(join(STANDALONE, "server.js"))) {
  console.error(
    `[build-standalone] missing ${join(STANDALONE, "server.js")} — run "next build" first.`,
  );
  process.exit(1);
}

// 1. Next standalone doesn't copy static/ + public/ — do it ourselves.
log("copying .next/static + public into the standalone tree");
const staticSrc = join(NEXT_OUT, "static");
const staticDst = join(STANDALONE, ".next", "static");
if (existsSync(staticSrc)) {
  rmSync(staticDst, { recursive: true, force: true });
  cpSync(staticSrc, staticDst, { recursive: true });
}
const publicSrc = join(WEB_ROOT, "public");
const publicDst = join(STANDALONE, "public");
if (existsSync(publicSrc)) {
  rmSync(publicDst, { recursive: true, force: true });
  cpSync(publicSrc, publicDst, { recursive: true });
}

// 2. Flat (symlink-free) node_modules via npm install, swapped into standalone.
log("npm install (flat, prod only) → replaces pnpm symlink tree");
const flatDir = join(STANDALONE, ".flat-install");
rmSync(flatDir, { recursive: true, force: true });
mkdirSync(flatDir, { recursive: true });

const pkg = JSON.parse(readFileSync(join(WEB_ROOT, "package.json"), "utf8"));
writeFileSync(
  join(flatDir, "package.json"),
  JSON.stringify(
    { name: pkg.name, version: pkg.version, private: true, dependencies: pkg.dependencies },
    null,
    2,
  ),
);
run("npm install --omit=dev --no-audit --no-fund --no-package-lock", { cwd: flatDir });

const nodeModulesSrc = join(flatDir, "node_modules");
if (!existsSync(nodeModulesSrc)) {
  console.error("[build-standalone] npm install did not produce node_modules");
  process.exit(1);
}

const nm = join(STANDALONE, "node_modules");
log(`replacing ${nm}`);
rmSync(nm, { recursive: true, force: true });
cpSync(nodeModulesSrc, nm, { recursive: true });

rmSync(flatDir, { recursive: true, force: true });
log("done");
