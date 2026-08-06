// Generates build/icon.png — the single source electron-builder converts into
// .ico / .icns / png sets. Drawn from scratch (no image deps) so the icon is
// reproducible from source: a dark app tile holding four panes, one active.

import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const S = 1024
const px = new Uint8ClampedArray(S * S * 4)

/** Signed distance to a rounded rect; negative inside. */
function sdRoundRect(x, y, x0, y0, x1, y1, r) {
  const cx = Math.max(x0 + r, Math.min(x, x1 - r))
  const cy = Math.max(y0 + r, Math.min(y, y1 - r))
  const dx = x - cx
  const dy = y - cy
  const d = Math.hypot(dx, dy) - r
  const inside = x > x0 && x < x1 && y > y0 && y < y1
  return inside && dx === 0 && dy === 0 ? -r : inside ? Math.min(d, 0) : Math.max(d, 0)
}

const lerp = (a, b, t) => a + (b - a) * t
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]

/** Paint a rounded rect with a vertical gradient, antialiased over ~1.5px. */
function rect(x0, y0, x1, y1, r, top, bottom) {
  const [tr, tg, tb] = hex(top)
  const [br, bg, bb] = hex(bottom)
  for (let y = Math.floor(y0 - 2); y <= Math.ceil(y1 + 2); y++) {
    for (let x = Math.floor(x0 - 2); x <= Math.ceil(x1 + 2); x++) {
      if (x < 0 || y < 0 || x >= S || y >= S) continue
      const d = sdRoundRect(x + 0.5, y + 0.5, x0, y0, x1, y1, r)
      const a = Math.max(0, Math.min(1, 0.5 - d / 1.5))
      if (a <= 0) continue
      const t = (y - y0) / Math.max(1, y1 - y0)
      const cr = lerp(tr, br, t)
      const cg = lerp(tg, bg, t)
      const cb = lerp(tb, bb, t)
      const i = (y * S + x) * 4
      const dst = px[i + 3] / 255
      const out = a + dst * (1 - a) // source-over
      px[i] = (cr * a + px[i] * dst * (1 - a)) / (out || 1)
      px[i + 1] = (cg * a + px[i + 1] * dst * (1 - a)) / (out || 1)
      px[i + 2] = (cb * a + px[i + 2] * dst * (1 - a)) / (out || 1)
      px[i + 3] = out * 255
    }
  }
}

// App tile
rect(96, 96, 928, 928, 184, '#272b36', '#12131a')

// Four panes; the first reads as the active panel.
const pad = 110
const gap = 30
const x0 = 96 + pad
const x1 = 928 - pad
const size = (x1 - x0 - gap) / 2
const cells = [
  [x0, x0, '#7d97ff', '#5a6fe0'],
  [x0 + size + gap, x0, '#333846', '#2a2e3a'],
  [x0, x0 + size + gap, '#333846', '#2a2e3a'],
  [x0 + size + gap, x0 + size + gap, '#333846', '#2a2e3a']
]
for (const [cx, cy, top, bottom] of cells) rect(cx, cy, cx + size, cy + size, 44, top, bottom)

// --- PNG encoding ------------------------------------------------------------
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(S, 0)
ihdr.writeUInt32BE(S, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // RGBA
const raw = Buffer.alloc((S * 4 + 1) * S)
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0 // filter: none
  Buffer.from(px.buffer, y * S * 4, S * 4).copy(raw, y * (S * 4 + 1) + 1)
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
])

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'build', 'icon.png')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, png)
console.log(`wrote ${out} (${S}x${S}, ${(png.length / 1024).toFixed(1)} KB)`)
