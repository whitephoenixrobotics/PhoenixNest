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
function streamTo(url, out, onChunk, signal, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) return reject(new Error('cancelled'))
    if (redirects > 5) return reject(new Error('too many redirects'))
    const lib = url.startsWith('https') ? https : http
    const req = lib.get(url, { headers: { 'User-Agent': 'PhoenixNest' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        return streamTo(res.headers.location, out, onChunk, signal, redirects + 1).then(resolve, reject)
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
    if (signal) signal.addEventListener('abort', () => req.destroy(new Error('cancelled')), { once: true })
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
async function downloadFile(url, dest, onProgress, signal) {
  const out = fs.createWriteStream(dest)
  let got = 0
  let total = 0
  try {
    await streamTo(
      url,
      out,
      (n, t) => {
        got += n
        total = t
        if (onProgress) onProgress(got, total)
      },
      signal,
    )
  } finally {
    await new Promise((r) => out.end(r)) // flush all buffered data before returning
  }
  return { got, total }
}

// Download a multi-part zip (GitHub's 2GB/asset limit) and concatenate the parts
// in order into one file. Reports overall percent across all parts.
async function downloadParts(urls, dest, onProgress, signal) {
  fs.rmSync(dest, { force: true })
  const out = fs.createWriteStream(dest)
  try {
    for (let i = 0; i < urls.length; i++) {
      if (signal && signal.aborted) throw new Error('cancelled')
      let partGot = 0
      await streamTo(
        urls[i],
        out,
        (n, total) => {
          partGot += n
          const frac = total ? partGot / total : 0
          const percent = Math.round(((i + frac) / urls.length) * 100)
          if (onProgress) onProgress({ percent, part: i + 1, parts: urls.length })
        },
        signal,
      )
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

// Windows: antivirus (Defender) and the Search indexer transiently lock
// freshly-extracted files — especially .exe — so an immediate rename fails with
// EPERM/EBUSY/EACCES. The lock clears within a second or two, so retry with
// backoff before giving up.
async function renameWithRetry(from, to, attempts = 12) {
  for (let i = 0; i < attempts; i++) {
    try {
      fs.renameSync(from, to)
      return
    } catch (e) {
      const transient = e && ['EPERM', 'EBUSY', 'EACCES', 'ENOTEMPTY'].includes(e.code)
      if (!transient || i === attempts - 1) throw e
      installLog(`[install] rename ${e.code}, retry ${i + 1}/${attempts}`)
      await sleep(200 * (i + 1))
    }
  }
}

// Move a directory atomically when possible; fall back to copy+remove if the
// filesystem keeps refusing the rename (a persistently locked file, or staging
// landing on a different volume).
async function moveDir(from, to) {
  try {
    await renameWithRetry(from, to)
  } catch (e) {
    if (!e || !['EPERM', 'EBUSY', 'EACCES', 'ENOTEMPTY', 'EXDEV'].includes(e.code)) throw e
    installLog(`[install] rename failed (${e.code}); falling back to copy`)
    fs.cpSync(from, to, { recursive: true })
    fs.rmSync(from, { recursive: true, force: true })
  }
}

// Extract a zip with yauzl (pure JS — handles zip64 + large files, no external
// tar/PowerShell binary whose path parsing varies). Streams each entry and
// reports per-entry progress. onProgress(percent).
function extractZip(zip, destDir, onProgress, signal) {
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
        if (signal && signal.aborted) return fail(new Error('cancelled'))
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

// Full install/update. `spec` = resolved download spec:
//   { id, name, version, edition?, type, sha256, url?  |  parts?: string[] }
// onProgress({ phase, percent, part?, parts? }); optional AbortSignal `signal`.
//
// ATOMIC + SAFE: downloads + extracts into a staging dir and only swaps it over
// the live install at the very end (a fast rename). If the user cancels or
// anything fails mid-way, the existing install is left 100% intact — the app
// never ends up half-updated/broken.
async function installModule(spec, onProgress, signal) {
  const finalDir = path.join(modulesDir(), spec.id)
  const staging = path.join(modulesDir(), `.staging-${spec.id}`)
  const backup = `${finalDir}.old`
  const tmpZip = path.join(dataDir(), `${spec.id}-${spec.version}.zip`)
  fs.mkdirSync(modulesDir(), { recursive: true })

  // Clear any leftovers from a previously interrupted run.
  fs.rmSync(staging, { recursive: true, force: true })
  fs.rmSync(tmpZip, { force: true })

  const cleanupTemp = () => {
    try {
      fs.rmSync(staging, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
    try {
      fs.rmSync(tmpZip, { force: true })
    } catch {
      /* ignore */
    }
  }
  const checkCancel = () => {
    if (signal && signal.aborted) throw new Error('cancelled')
  }

  try {
    // 1. Download (cancellable).
    onProgress({ phase: 'download', percent: 0 })
    if (Array.isArray(spec.parts) && spec.parts.length) {
      await downloadParts(spec.parts, tmpZip, (p) => onProgress({ phase: 'download', ...p }), signal)
    } else if (spec.url) {
      await downloadFile(
        spec.url,
        tmpZip,
        (got, total) => onProgress({ phase: 'download', percent: total ? Math.round((got / total) * 100) : 0, got, total }),
        signal,
      )
    } else {
      throw new Error('no url or parts for module')
    }
    checkCancel()

    // 2. Verify.
    if (spec.sha256) {
      onProgress({ phase: 'verify', percent: 100 })
      const h = await sha256File(tmpZip)
      installLog(`[install ${spec.id}] sha match=${h.toLowerCase() === spec.sha256.toLowerCase()}`)
      if (h.toLowerCase() !== spec.sha256.toLowerCase()) throw new Error('checksum mismatch')
    }
    checkCancel()

    // 3. Extract into STAGING (never touches the live install yet; cancellable).
    onProgress({ phase: 'extract', percent: 0 })
    await extractZip(tmpZip, staging, (pct) => onProgress({ phase: 'extract', percent: pct }), signal)
    checkCancel()

    let manifest = {}
    try {
      manifest = JSON.parse(fs.readFileSync(path.join(staging, 'module.json'), 'utf-8'))
    } catch {
      /* no manifest — fall back to spec fields */
    }

    // 4. Swap — the ONLY moment the live install dir is touched. Rename is
    // retried (Windows AV briefly locks freshly-extracted files) and falls back
    // to copy if the FS keeps refusing it; on failure the old install is
    // restored so the app is never left half-updated.
    fs.rmSync(backup, { recursive: true, force: true })
    const hadOld = fs.existsSync(finalDir)
    if (hadOld) await renameWithRetry(finalDir, backup)
    try {
      await moveDir(staging, finalDir)
    } catch (e) {
      if (hadOld) {
        try {
          await renameWithRetry(backup, finalDir)
        } catch {
          /* leave backup dir for manual recovery */
        }
      }
      throw e
    }
    fs.rmSync(backup, { recursive: true, force: true })
    fs.rmSync(tmpZip, { force: true })

    const installed = readInstalled()
    installed[spec.id] = {
      version: spec.version,
      edition: spec.edition || manifest.edition || null,
      path: finalDir,
      type: manifest.type || spec.type || 'static',
      manifest,
      runtimeEnv: spec.runtimeEnv || null,
      installedAt: new Date().toISOString(),
    }
    writeInstalled(installed)
    onProgress({ phase: 'done', percent: 100 })
    installLog(`[install ${spec.id}] done v${spec.version}`)
    return installed[spec.id]
  } catch (e) {
    cleanupTemp() // leave the existing install untouched
    installLog(`[install ${spec.id}] ${signal && signal.aborted ? 'cancelled' : 'failed: ' + (e.message || e)}`)
    throw e
  }
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
