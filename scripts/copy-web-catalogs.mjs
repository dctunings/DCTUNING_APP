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

// 1. Copy VAG signature catalogs (13 files, ~43 MB)
const CATALOGS_SRC = resolve(__dirname, '..', 'resources', 'vag-signatures')
const CATALOGS_DST = resolve(__dirname, '..', 'src', 'renderer', 'public', 'vag-signatures')
if (existsSync(CATALOGS_SRC)) {
  mkdirSync(CATALOGS_DST, { recursive: true })
  let count = 0, bytes = 0
  for (const name of readdirSync(CATALOGS_SRC)) {
    if (!name.startsWith('vagcat7_') || !name.endsWith('.json')) continue
    const s = join(CATALOGS_SRC, name), d = join(CATALOGS_DST, name)
    copyFileSync(s, d)
    bytes += statSync(s).size
    count++
  }
  console.log(`[copy-web-catalogs] copied ${count} VAG catalogs (${(bytes / 1024 / 1024).toFixed(1)} MB) → ${CATALOGS_DST}`)
} else {
  console.warn(`[copy-web-catalogs] VAG catalogs missing: ${CATALOGS_SRC}`)
}

// 2. Copy map-multipliers.json (v3.14 Tier 2 library). ~3.3 MB. Web loader
// fetches this at /map-multipliers.json when the Electron IPC path is absent.
const MULTS_SRC = resolve(__dirname, '..', 'resources', 'map-multipliers.json')
const MULTS_DST = resolve(__dirname, '..', 'src', 'renderer', 'public', 'map-multipliers.json')
if (existsSync(MULTS_SRC)) {
  copyFileSync(MULTS_SRC, MULTS_DST)
  const kb = (statSync(MULTS_SRC).size / 1024).toFixed(1)
  console.log(`[copy-web-catalogs] copied map-multipliers.json (${kb} KB) → ${MULTS_DST}`)
} else {
  console.warn(`[copy-web-catalogs] map-multipliers.json missing — Tier 2 will fall back to category defaults in the web build`)
}

// 3. Copy ONLY the recipe manifest (~560 KB) — full recipe tree lives in
// Supabase Storage `recipes` bucket since v3.15.4 (no longer bundled in the
// web build). The manifest still needs to be bundled because the app loads
// it on startup to populate the variant lookup, and shipping it as a static
// asset is faster than another Supabase round-trip.
const MANIFEST_SRC = resolve(__dirname, '..', 'resources', 'recipes', 'manifest.json')
const MANIFEST_DST_DIR = resolve(__dirname, '..', 'src', 'renderer', 'public', 'recipes')
const MANIFEST_DST = join(MANIFEST_DST_DIR, 'manifest.json')
if (existsSync(MANIFEST_SRC)) {
  mkdirSync(MANIFEST_DST_DIR, { recursive: true })
  copyFileSync(MANIFEST_SRC, MANIFEST_DST)
  const kb = (statSync(MANIFEST_SRC).size / 1024).toFixed(1)
  console.log(`[copy-web-catalogs] copied recipe manifest (${kb} KB) → ${MANIFEST_DST}`)
} else {
  console.warn(`[copy-web-catalogs] recipe manifest missing: ${MANIFEST_SRC}`)
}
