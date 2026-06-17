// Render build/icon.svg into a multi-size Windows .ico (PNG-compressed entries)
// plus a 512px icon.png. Uses sharp (already in node_modules).
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const svg = fs.readFileSync(path.join(dir, 'icon.svg'))
const sizes = [16, 32, 48, 64, 128, 256]

const pngs = {}
for (const s of sizes) {
  pngs[s] = await sharp(svg).resize(s, s).png().toBuffer()
}
// 512px master PNG (electron-builder / web use)
await sharp(svg).resize(512, 512).png().toFile(path.join(dir, 'icon.png'))

// Assemble ICO: ICONDIR header + N ICONDIRENTRY + concatenated PNG payloads.
const count = sizes.length
const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0) // reserved
header.writeUInt16LE(1, 2) // type: icon
header.writeUInt16LE(count, 4)

const entries = Buffer.alloc(16 * count)
let offset = 6 + 16 * count
const payloads = []
sizes.forEach((s, i) => {
  const buf = pngs[s]
  const e = i * 16
  entries.writeUInt8(s >= 256 ? 0 : s, e + 0) // width (0 == 256)
  entries.writeUInt8(s >= 256 ? 0 : s, e + 1) // height
  entries.writeUInt8(0, e + 2) // palette
  entries.writeUInt8(0, e + 3) // reserved
  entries.writeUInt16LE(1, e + 4) // color planes
  entries.writeUInt16LE(32, e + 6) // bits per pixel
  entries.writeUInt32LE(buf.length, e + 8) // size of payload
  entries.writeUInt32LE(offset, e + 12) // offset of payload
  offset += buf.length
  payloads.push(buf)
})

fs.writeFileSync(path.join(dir, 'icon.ico'), Buffer.concat([header, entries, ...payloads]))
console.log('wrote icon.ico (', sizes.join(','), ') and icon.png')
