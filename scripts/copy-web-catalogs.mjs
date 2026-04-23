// Copy VAG signature catalogs into src/renderer/public/vag-signatures/ so the
// web build serves them as static assets at /vag-signatures/*.json.
// Runs before `npm run build:web`. Desktop (Electron) build doesn't need this —
// it reads catalogs directly from resources/vag-signatures/ at runtime.
//
// Why copy instead of symlink: Windows filesystems, CI runners, and git all
// behave inconsistently with symlinks. A copy is boring and portable.
// The copies in public/ are gitignored to avoid committing 43MB twice.

import { readdirSync, copyFileSync, mkdirSync, existsSync, statSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(__dirname, '..', 'resources', 'vag-signatures')
const DST = resolve(__dirname, '..', 'src', 'renderer', 'public', 'vag-signatures')

if (!existsSync(SRC)) {
  console.error(`[copy-web-catalogs] source missing: ${SRC}`)
  process.exit(1)
}

mkdirSync(DST, { recursive: true })

let copiedCount = 0
let totalBytes = 0
for (const name of readdirSync(SRC)) {
  if (!name.startsWith('vagcat7_') || !name.endsWith('.json')) continue
  const srcPath = join(SRC, name)
  const dstPath = join(DST, name)
  copyFileSync(srcPath, dstPath)
  totalBytes += statSync(srcPath).size
  copiedCount++
}

const mb = (totalBytes / 1024 / 1024).toFixed(1)
console.log(`[copy-web-catalogs] copied ${copiedCount} catalogs (${mb} MB) → ${DST}`)
