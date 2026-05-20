// Copy build-time catalogs from resources/ into src/renderer/public/ so
// the web build can serve them as static assets.
//
// Damo audit fix Apr 28 2026: previous version only copied recipe
// directories that DIDN'T already exist in public/, which meant stale
// recipes from old extractor runs persisted forever. Plus the public/
// folder accumulated orphan files (AUTO_Stage1.json from a defunct
// extractor schema) that bloated every build. Now we wipe + recopy.

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const pub = path.join(root, 'src', 'renderer', 'public')
const res = path.join(root, 'resources')

function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
}

function copyDir(srcDir, destDir) {
  ensureDir(destDir)
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const s = path.join(srcDir, entry.name)
    const d = path.join(destDir, entry.name)
    if (entry.isDirectory()) copyDir(s, d)
    else fs.copyFileSync(s, d)
  }
}

function wipeDir(d) {
  if (!fs.existsSync(d)) return
  fs.rmSync(d, { recursive: true, force: true })
}

// ── 1. VAG signature catalogs ───────────────────────────────────────────
const sigSrc = path.join(res, 'vag-signatures')
const sigDst = path.join(pub, 'vag-signatures')
if (fs.existsSync(sigSrc)) {
  wipeDir(sigDst)
  copyDir(sigSrc, sigDst)
  console.log('[copy-web-catalogs] vag-signatures copied')
} else {
  console.log('[copy-web-catalogs] vag-signatures missing (skip)')
}

// ── 2. Map multipliers (single JSON file) ───────────────────────────────
const mulSrc = path.join(res, 'map-multipliers.json')
const mulDst = path.join(pub, 'map-multipliers.json')
if (fs.existsSync(mulSrc)) {
  fs.copyFileSync(mulSrc, mulDst)
  console.log('[copy-web-catalogs] map-multipliers.json copied')
}

// ── 3. Recipe library ───────────────────────────────────────────────────
// Full wipe + recopy. Previously this only added new directories so stale
// recipes from old extractor runs (including the deprecated `hw`/`sw`
// AUTO_Stage1.json schema) persisted, bloating the build and confusing
// the user when they showed up in the browser.
const recipesSrc = path.join(res, 'recipes')
const recipesDst = path.join(pub, 'recipes')
if (fs.existsSync(recipesSrc)) {
  wipeDir(recipesDst)
  copyDir(recipesSrc, recipesDst)
  // Count the result for the build log.
  let count = 0
  function countJson(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) countJson(p)
      else if (e.name.endsWith('.json')) count++
    }
  }
  countJson(recipesDst)
  console.log(`[copy-web-catalogs] recipes: ${count} JSON files copied (wipe + recopy)`)
} else {
  console.log('[copy-web-catalogs] resources/recipes missing (skip)')
}

console.log('[copy-web-catalogs] Done')
