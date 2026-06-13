// Build a self-contained Next.js standalone output that doesn't rely on pnpm's
// symlink-based node_modules layout.
//
// Why we need this: pnpm hoists deps under `node_modules/.pnpm/` and turns the
// top-level `node_modules/<pkg>` into symlinks. Windows file-copy operations
// strip those symlinks, so when the packaged app reaches the user's machine
// `require('@next/env')` etc. fail. We replace the pnpm tree with a flat one
// produced by `npm install` (no symlinks, every module is a real folder).
//
// Run after `next build`:
//   pnpm --filter web exec node scripts/build-standalone.mjs

import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, cpSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const WEB_ROOT = resolve(HERE, '..')
const NEXT_OUT = join(WEB_ROOT, '.next')
const STANDALONE = join(NEXT_OUT, 'standalone')
// outputFileTracingRoot points at the workspace root, so the standalone tree
// nests web under apps/web/.
const STANDALONE_WEB = join(STANDALONE, 'apps', 'web')

function log(msg) { console.log(`[build-standalone] ${msg}`) }

function run(cmd, opts = {}) {
  log(`$ ${cmd}`)
  execSync(cmd, { stdio: 'inherit', shell: true, ...opts })
}

if (!existsSync(STANDALONE_WEB)) {
  console.error(`[build-standalone] missing ${STANDALONE_WEB} — run "next build" first.`)
  process.exit(1)
}

// 1. Copy static + public into the standalone tree (Next standalone quirk).
log('copying .next/static + public into the standalone tree')
const staticSrc = join(NEXT_OUT, 'static')
const staticDst = join(STANDALONE_WEB, '.next', 'static')
if (existsSync(staticSrc)) {
  rmSync(staticDst, { recursive: true, force: true })
  cpSync(staticSrc, staticDst, { recursive: true })
}
const publicSrc = join(WEB_ROOT, 'public')
const publicDst = join(STANDALONE_WEB, 'public')
if (existsSync(publicSrc)) {
  rmSync(publicDst, { recursive: true, force: true })
  cpSync(publicSrc, publicDst, { recursive: true })
}

// 2. Build a flat node_modules with npm install, then replace the symlinked one.
log('npm install (flat, prod only) → replaces pnpm symlink tree')
const flatDir = join(STANDALONE, '.flat-install')
rmSync(flatDir, { recursive: true, force: true })
mkdirSync(flatDir, { recursive: true })

// Use a clean package.json that only has prod deps, so npm install doesn't
// try to pull in tailwind/eslint/types/etc.
const pkg = JSON.parse(readFileSync(join(WEB_ROOT, 'package.json'), 'utf8'))
const flatPkg = {
  name: pkg.name,
  version: pkg.version,
  private: true,
  dependencies: pkg.dependencies,
}
writeFileSync(join(flatDir, 'package.json'), JSON.stringify(flatPkg, null, 2))
run('npm install --omit=dev --no-audit --no-fund --no-package-lock', { cwd: flatDir })

const nodeModulesSrc = join(flatDir, 'node_modules')
if (!existsSync(nodeModulesSrc)) {
  console.error('[build-standalone] npm install did not produce node_modules')
  process.exit(1)
}

// Replace both potential node_modules locations Next standalone might use.
const nmInWeb = join(STANDALONE_WEB, 'node_modules')
const nmAtRoot = join(STANDALONE, 'node_modules')
log(`replacing ${nmInWeb}`)
rmSync(nmInWeb, { recursive: true, force: true })
cpSync(nodeModulesSrc, nmInWeb, { recursive: true })
log(`removing pnpm-style ${nmAtRoot}`)
rmSync(nmAtRoot, { recursive: true, force: true })

// Cleanup the temp install dir.
rmSync(flatDir, { recursive: true, force: true })
log('done')
