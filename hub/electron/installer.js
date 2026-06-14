'use strict'

// Module installer for PhoenixNest: fetches the remote registry, downloads a
// module's zip from GitHub Releases (with progress), verifies its sha256,
// extracts it into the user's app-data, and records it in installed.json.
// No setup.exe / NSIS — PhoenixNest IS the installer.

const { app } = require('electron')
const path = require('path')
const fs = require('fs')
const https = require('https')
const http = require('http')
const crypto = require('crypto')
const { execFile } = require('child_process')

const REGISTRY_URL =
  process.env.PHOENIXNEST_REGISTRY_URL ||
  'https://raw.githubusercontent.com/whitephoenixrobotics/PhoenixNest-Modules/main/registry.json'

function dataDir() {
  return path.join(app.getPath('appData'), 'PhoenixNest')
}
function modulesDir() {
  return path.join(dataDir(), 'modules')
}
function installedJsonPath() {
  return path.join(dataDir(), 'installed.json')
}

function readInstalled() {
  try {
    return JSON.parse(fs.readFileSync(installedJsonPath(), 'utf-8'))
  } catch {
    return {}
  }
}
function writeInstalled(obj) {
  fs.mkdirSync(dataDir(), { recursive: true })
  fs.writeFileSync(installedJsonPath(), JSON.stringify(obj, null, 2))
}

// GET text, following redirects.
function httpGetText(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('too many redirects'))
    const lib = url.startsWith('https') ? https : http
    lib
      .get(url, { headers: { 'User-Agent': 'PhoenixNest' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          return httpGetText(res.headers.location, redirects + 1).then(resolve, reject)
        }
        if (res.statusCode !== 200) {
          res.resume()
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`))
        }
        let data = ''
        res.setEncoding('utf8')
        res.on('data', (c) => (data += c))
        res.on('end', () => resolve(data))
      })
      .on('error', reject)
  })
}

async function fetchRegistry() {
  return JSON.parse(await httpGetText(REGISTRY_URL))
}

// Download to a file, following redirects, reporting (got,total) bytes.
function downloadFile(url, dest, onProgress, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('too many redirects'))
    const lib = url.startsWith('https') ? https : http
    const req = lib.get(url, { headers: { 'User-Agent': 'PhoenixNest' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        return downloadFile(res.headers.location, dest, onProgress, redirects + 1).then(resolve, reject)
      }
      if (res.statusCode !== 200) {
        res.resume()
        return reject(new Error(`HTTP ${res.statusCode}`))
      }
      const total = parseInt(res.headers['content-length'] || '0', 10)
      let got = 0
      const out = fs.createWriteStream(dest)
      res.on('data', (c) => {
        got += c.length
        if (onProgress) onProgress(got, total)
      })
      res.pipe(out)
      out.on('finish', () => out.close(() => resolve({ got, total })))
      out.on('error', reject)
    })
    req.on('error', reject)
  })
}

function sha256File(p) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256')
    const s = fs.createReadStream(p)
    s.on('data', (d) => h.update(d))
    s.on('end', () => resolve(h.digest('hex')))
    s.on('error', reject)
  })
}

// Extract a zip. Windows 10+ ships bsdtar (handles zip); fall back to PowerShell.
function extractZip(zip, destDir) {
  fs.mkdirSync(destDir, { recursive: true })
  return new Promise((resolve, reject) => {
    execFile('tar', ['-xf', zip, '-C', destDir], (err) => {
      if (!err) return resolve()
      execFile(
        'powershell',
        ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${destDir}' -Force`],
        (err2) => (err2 ? reject(err2) : resolve()),
      )
    })
  })
}

// Full install: download → verify → extract → record. onProgress({phase,percent}).
async function installModule(mod, onProgress) {
  const dir = path.join(modulesDir(), mod.id)
  const tmpZip = path.join(dataDir(), `${mod.id}-${mod.latest}.zip`)
  fs.mkdirSync(dataDir(), { recursive: true })

  onProgress({ phase: 'download', percent: 0 })
  await downloadFile(mod.url, tmpZip, (got, total) =>
    onProgress({ phase: 'download', percent: total ? Math.round((got / total) * 100) : 0, got, total }),
  )

  if (mod.sha256) {
    onProgress({ phase: 'verify', percent: 100 })
    const h = await sha256File(tmpZip)
    if (h.toLowerCase() !== mod.sha256.toLowerCase()) {
      fs.rmSync(tmpZip, { force: true })
      throw new Error('checksum mismatch')
    }
  }

  onProgress({ phase: 'extract', percent: 100 })
  fs.rmSync(dir, { recursive: true, force: true })
  await extractZip(tmpZip, dir)
  fs.rmSync(tmpZip, { force: true })

  let manifest = {}
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(dir, 'module.json'), 'utf-8'))
  } catch {
    /* no manifest — fall back to registry fields */
  }

  const installed = readInstalled()
  installed[mod.id] = {
    version: mod.latest,
    path: dir,
    type: manifest.type || mod.type || 'static',
    manifest,
    installedAt: new Date().toISOString(),
  }
  writeInstalled(installed)
  onProgress({ phase: 'done', percent: 100 })
  return installed[mod.id]
}

function uninstallModule(id) {
  const installed = readInstalled()
  const info = installed[id]
  if (info && info.path) fs.rmSync(info.path, { recursive: true, force: true })
  delete installed[id]
  writeInstalled(installed)
}

module.exports = {
  REGISTRY_URL,
  dataDir,
  modulesDir,
  fetchRegistry,
  readInstalled,
  installModule,
  uninstallModule,
}
