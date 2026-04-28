/**
 * generate-icons.mjs
 * Converts icon.svg → icon.png (Linux) + icon.ico (Windows) + icon.icns (macOS)
 *
 * Usage:  node build/icons/generate-icons.mjs
 * Deps:   sharp, png-to-ico  (both in devDependencies)
 */

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const __dirname = dirname(fileURLToPath(import.meta.url))
const svgPath   = join(__dirname, 'icon.svg')
const svgBuf    = readFileSync(svgPath)

// ── Sizes ────────────────────────────────────────────────────────────────────
// ICO needs: 16, 24, 32, 48, 64, 96, 128, 256
// ICNS needs: 16, 32, 64, 128, 256, 512, 1024
// PNG (Linux): 512

const icoSizes  = [16, 24, 32, 48, 64, 96, 128, 256]
const icnsSizes = [16, 32, 64, 128, 256, 512, 1024]

async function renderPng(size) {
  return sharp(svgBuf, { density: Math.ceil((size / 1024) * 96) })
    .resize(size, size)
    .png()
    .toBuffer()
}

// ── 1. icon.png (512×512, for Linux AppImage) ─────────────────────────────
console.log('Rendering icon.png (512×512)…')
const png512 = await renderPng(512)
writeFileSync(join(__dirname, 'icon.png'), png512)
console.log('  ✓ icon.png')

// ── 2. icon.ico (Windows) ─────────────────────────────────────────────────
console.log('Building icon.ico…')
const icoPngBuffers = await Promise.all(icoSizes.map(renderPng))
const icoBuffer = await pngToIco(icoPngBuffers)
writeFileSync(join(__dirname, 'icon.ico'), icoBuffer)
console.log('  ✓ icon.ico')

// ── 3. icon.icns (macOS) ──────────────────────────────────────────────────
// Build a minimal ICNS file manually — Apple's format is a sequence of
// typed chunks: 4-byte type + 4-byte length (includes header) + PNG data.
// Modern macOS (10.7+) supports PNG-encoded icons with type codes below.
console.log('Building icon.icns…')

const icnsTypeMap = {
  16:   'icp4',   // 16×16   PNG
  32:   'icp5',   // 32×32   PNG
  64:   'icp6',   // 64×64   PNG
  128:  'ic07',   // 128×128 PNG
  256:  'ic08',   // 256×256 PNG
  512:  'ic09',   // 512×512 PNG
  1024: 'ic10',   // 1024×1024 PNG (also used for 512@2x)
}

const chunks = []
for (const size of icnsSizes) {
  const type = icnsTypeMap[size]
  const pngBuf = await renderPng(size)
  const header = Buffer.alloc(8)
  header.write(type, 0, 'ascii')
  header.writeUInt32BE(pngBuf.length + 8, 4)
  chunks.push(header, pngBuf)
  console.log(`  rendered ${size}×${size}`)
}

const body       = Buffer.concat(chunks)
const icnsHeader = Buffer.alloc(8)
icnsHeader.write('icns', 0, 'ascii')
icnsHeader.writeUInt32BE(body.length + 8, 4)

writeFileSync(join(__dirname, 'icon.icns'), Buffer.concat([icnsHeader, body]))
console.log('  ✓ icon.icns')

console.log('\n✅ All icon files generated in build/icons/')
