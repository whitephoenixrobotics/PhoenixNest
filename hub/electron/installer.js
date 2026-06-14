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
const yauzl = require('yauzl')

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

// Stream a URL into an open write stream (follows redirects). Reports per-call
// (got,total) for THIS url; `baseGot` lets callers accumulate across parts.
function streamTo(url, out, onChunk, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('too many redirects'))
    const lib = url.startsWith('https') ? https : http
    const req = lib.get(url, { headers: { 'User-Agent': 'PhoenixNest' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        return streamTo(res.headers.location, out, onChunk, redirects + 1).then(resolve, reject)
      }
      if (res.statusCode !== 200) {
        res.resume()
        return reject(new Error(`HTTP ${res.statusCode}`))
      }
      const total = parseInt(res.headers['content-length'] || '0', 10)
      let got = 0
      res.on('data', (c) => {
        got += c.length
        if (onChunk) onChunk(c.length, total)
      })
      res.on('end', () => resolve({ got, total }))
      res.on('error', reject)
      res.pipe(out, { end: false })
    })
    req.on('error', reject)
  })
}

function installLog(s) {
  try {
    fs.appendFileSync(path.join(dataDir(), 'install.log'), s + '\n')
  } catch {
    /* ignore */
  }
}

// Download a single-file zip.
async function downloadFile(url, dest, onProgress) {
  const out = fs.createWriteStream(dest)
  let got = 0
  let total = 0
  try {
    await streamTo(url, out, (n, t) => {
      got += n
      total = t
      if (onProgress) onProgress(got, total)
    })
  } finally {
    await new Promise((r) => out.end(r)) // flush all buffered data before returning
  }
  return { got, total }
}

// Download a multi-part zip (GitHub's 2GB/asset limit) and concatenate the parts
// in order into one file. Reports overall percent across all parts.
async function downloadParts(urls, dest, onProgress) {
  fs.rmSync(dest, { force: true })
  const out = fs.createWriteStream(dest)
  try {
    for (let i = 0; i < urls.length; i++) {
      let partGot = 0
      await streamTo(urls[i], out, (n, total) => {
        partGot += n
        const frac = total ? partGot / total : 0
        const percent = Math.round(((i + frac) / urls.length) * 100)
        if (onProgress) onProgress({ percent, part: i + 1, parts: urls.length })
      })
    }
  } finally {
    await new Promise((r) => out.end(r)) // flush remaining bytes (was a truncation risk)
  }
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

function dirHasFiles(dir) {
  try {
    return fs.readdirSync(dir).length > 0
  } catch {
    return false
  }
}

// Extract a zip with yauzl (pure JS — handles zip64 + large files, no external
// tar/PowerShell binary whose path parsing varies). Streams each entry and
// reports per-entry progress. onProgress(percent).
function extractZip(zip, destDir, onProgress) {
  fs.mkdirSync(destDir, { recursive: true })
  return new Promise((resolve, reject) => {
    yauzl.open(zip, { lazyEntries: true }, (err, zf) => {
      if (err) return reject(err)
      const total = zf.entryCount || 0
      let done = 0
      let lastPct = -1
      const report = () => {
        if (total && onProgress) {
          const p = Math.min(99, Math.round((done / total) * 100))
          if (p !== lastPct) {
            lastPct = p
            onProgress(p)
          }
        }
      }
      const fail = (e) => {
        try {
          zf.close()
        } catch {
          /* ignore */
        }
        reject(e)
      }
      zf.on('error', fail)
      zf.on('entry', (entry) => {
        const outPath = path.join(destDir, entry.fileName)
        // Zip-slip guard: never write outside destDir.
        if (!outPath.startsWith(destDir)) {
          done++
          report()
          return zf.readEntry()
        }
        if (/\/$/.test(entry.fileName)) {
          fs.mkdirSync(outPath, { recursive: true })
          done++
          report()
          return zf.readEntry()
        }
        fs.mkdirSync(path.dirname(outPath), { recursive: true })
        zf.openReadStream(entry, (e2, rs) => {
          if (e2) return fail(e2)
          const ws = fs.createWriteStream(outPath)
          rs.on('error', fail)
          ws.on('error', fail)
          ws.on('close', () => {
            done++
            report()
            zf.readEntry()
          })
          rs.pipe(ws)
        })
      })
      zf.on('end', () => {
        installLog(`[extract] yauzl done entries=${total} hasFiles=${dirHasFiles(destDir)}`)
        if (!dirHasFiles(destDir)) return reject(new Error('extraction produced no files'))
        if (onProgress) onProgress(100)
        resolve()
      })
      zf.readEntry()
    })
  })
}

// Full install. `spec` = resolved download spec:
//   { id, name, version, edition?, type, sha256, url?  |  parts?: string[] }
// onProgress({ phase, percent, part?, parts? }).
async function installModule(spec, onProgress) {
  const dir = path.join(modulesDir(), spec.id)
  const tmpZip = path.join(dataDir(), `${spec.id}-${spec.version}.zip`)
  fs.mkdirSync(dataDir(), { recursive: true })

  onProgress({ phase: 'download', percent: 0 })
  if (Array.isArray(spec.parts) && spec.parts.length) {
    await downloadParts(spec.parts, tmpZip, (p) => onProgress({ phase: 'download', ...p }))
  } else if (spec.url) {
    await downloadFile(spec.url, tmpZip, (got, total) =>
      onProgress({ phase: 'download', percent: total ? Math.round((got / total) * 100) : 0, got, total }),
    )
  } else {
    throw new Error('no url or parts for module')
  }

  try {
    installLog(`[install ${spec.id}/${spec.edition || '-'}] downloaded ${fs.statSync(tmpZip).size} bytes`)
  } catch {
    /* ignore */
  }

  if (spec.sha256) {
    onProgress({ phase: 'verify', percent: 100 })
    const h = await sha256File(tmpZip)
    installLog(`[install] sha got=${h.slice(0, 16)} want=${spec.sha256.slice(0, 16)} match=${h.toLowerCase() === spec.sha256.toLowerCase()}`)
    if (h.toLowerCase() !== spec.sha256.toLowerCase()) {
      fs.rmSync(tmpZip, { force: true })
      throw new Error('checksum mismatch')
    }
  }

  onProgress({ phase: 'extract', percent: 0 })
  fs.rmSync(dir, { recursive: true, force: true })
  await extractZip(tmpZip, dir, (pct) => onProgress({ phase: 'extract', percent: pct }))
  fs.rmSync(tmpZip, { force: true })

  let manifest = {}
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(dir, 'module.json'), 'utf-8'))
  } catch {
    /* no manifest — fall back to spec fields */
  }

  const installed = readInstalled()
  installed[spec.id] = {
    version: spec.version,
    edition: spec.edition || manifest.edition || null,
    path: dir,
    type: manifest.type || spec.type || 'static',
    manifest,
    // Registry-provided runtime config (merged into the backend env at launch),
    // so config can be fixed without rebuilding the bundle.
    runtimeEnv: spec.runtimeEnv || null,
    installedAt: new Date().toISOString(),
  }
  writeInstalled(installed)
  onProgress({ phase: 'done', percent: 100 })
  return installed[spec.id]
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
