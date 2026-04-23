// Copy VAG signature catalogs into src/renderer/public/vag-signatures/ so the
// web build serves them as static assets at /vag-signatures/*.json.
// Runs before `npm run build:web`. Desktop (Electron) build doesn't need this —
// it reads catalogs directly from resources/vag-signatures/ at runtime.
//
// Why copy instead of symlink: Windows filesystems, CI runners, and git all
// behave inconsistently with symlinks. A copy is boring and portable.
// The copies in public/ are gitignored to avoid committing 43MB twice.

import { readdirSync, copyFileSync, mkdirSync, existsSync, statSync, cpSync } from 'node:fs'
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

// 2. Copy recipe library (manifest + ~2,200 per-variant recipes, ~215 MB).
// Uses cpSync recursive for the per-partnumber subdirectories.
const RECIPES_SRC = resolve(__dirname, '..', 'resources', 'recipes')
const RECIPES_DST = resolve(__dirname, '..', 'src', 'renderer', 'public', 'recipes')
if (existsSync(RECIPES_SRC)) {
  mkdirSync(RECIPES_DST, { recursive: true })
  cpSync(RECIPES_SRC, RECIPES_DST, { recursive: true, force: true })
  // Approximate count+size for logging
  let recipeCount = 0, recipeBytes = 0
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name)
      if (entry.isDirectory()) walk(p)
      else if (entry.isFile() && entry.name.endsWith('.json')) {
        recipeCount++
        recipeBytes += statSync(p).size
      }
    }
  }
  walk(RECIPES_DST)
  console.log(`[copy-web-catalogs] copied ${recipeCount} recipe files (${(recipeBytes / 1024 / 1024).toFixed(1)} MB) → ${RECIPES_DST}`)
} else {
  console.warn(`[copy-web-catalogs] recipes missing: ${RECIPES_SRC}`)
}
