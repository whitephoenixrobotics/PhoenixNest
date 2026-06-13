'use strict'

// Manages the bundled backend (phoenix-api.exe) and Next.js standalone server
// when the app is packaged. In dev (npm run start) we skip spawning — the user
// already runs them via `start.bat` and the env defaults point at localhost.

const { app } = require('electron')
const { spawn } = require('child_process')
const http = require('http')
const net = require('net')
const path = require('path')
const fs = require('fs')

const procs = []

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port
      srv.close(() => resolve(port))
    })
  })
}

function waitForUrl(url, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume()
        if (res.statusCode && res.statusCode < 500) return resolve()
        retry()
      })
      req.setTimeout(2000, () => {
        req.destroy()
        retry()
      })
      req.on('error', retry)
    }
    const retry = () => {
      if (Date.now() > deadline) return reject(new Error(`timeout waiting for ${url}`))
      setTimeout(tick, 500)
    }
    tick()
  })
}

function resourcePath(...parts) {
  // In a packaged build resources live next to the .exe under "resources/".
  const base = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..')
  return path.join(base, ...parts)
}

function spawnTracked(cmd, args, opts = {}) {
  const child = spawn(cmd, args, { stdio: 'inherit', windowsHide: true, ...opts })
  child.on('exit', (code) => console.log(`[phoenix] ${path.basename(cmd)} exited code=${code}`))
  procs.push(child)
  return child
}

// Supabase URL is not a secret (the project URL appears in the frontend bundle
// too) — baked here so the packaged backend can verify Supabase tokens without
// needing a .env file shipped alongside it.
const SUPABASE_URL = 'https://hdvyywbwotgbeyapoknd.supabase.co'

async function startBackend() {
  const exe = resourcePath('phoenix-api', 'phoenix-api.exe')
  if (!fs.existsSync(exe)) {
    throw new Error(`backend binary not found: ${exe}`)
  }
  const port = await findFreePort()
  const env = {
    ...process.env,
    PHOENIX_API_HOST: '127.0.0.1',
    PHOENIX_API_PORT: String(port),
    SUPABASE_URL,
  }
  console.log(`[phoenix] starting backend on :${port}`)
  spawnTracked(exe, [], { env, cwd: path.dirname(exe) })
  await waitForUrl(`http://127.0.0.1:${port}/health`)
  console.log('[phoenix] backend ready')
  return `http://127.0.0.1:${port}`
}

async function startFrontend() {
  // Next standalone (with outputFileTracingRoot pointing at the workspace) puts
  // server.js under apps/web/, so we run it from there. The flat node_modules
  // produced by scripts/build-standalone.mjs lives next to it.
  const cwd = resourcePath('web', 'apps', 'web')
  const server = path.join(cwd, 'server.js')
  if (!fs.existsSync(server)) {
    throw new Error(`frontend server not found: ${server}`)
  }
  const port = await findFreePort()
  const env = { ...process.env, PORT: String(port), HOSTNAME: '127.0.0.1' }
  console.log(`[phoenix] starting frontend on :${port}`)
  // The bundled Node runtime ships with Electron — node binary is resolved via
  // process.execPath when ELECTRON_RUN_AS_NODE is set.
  spawnTracked(process.execPath, [server], {
    env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
    cwd,
  })
  await waitForUrl(`http://127.0.0.1:${port}/login`)
  console.log('[phoenix] frontend ready')
  return `http://127.0.0.1:${port}`
}

function stopAll() {
  for (const p of procs) {
    try { p.kill() } catch { /* already gone */ }
  }
  procs.length = 0
}

module.exports = { startBackend, startFrontend, stopAll }
