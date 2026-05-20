// Trace where each manifest recipe came from. The manifest doesn't store the
// full source path (only sourceFolder = basename) so this script re-walks the
// ROOTS, matches each tuned-file basename against the manifest, and counts
// how many manifest entries match each root.

import fs from 'node:fs'
import path from 'node:path'

const ROOTS = [
  'D:/DATABASE/Tuning_DB_BIN',
  'D:/audi-package',
  'D:/DAMOS 2020',
  'D:/DAMOS-2021-2022',
  'D:/Vw VOLKSWAGEN  ECU Map Tuning Files Stage 1 + Stage 2  Remap Files Collection TESTED',
  'D:/dctuning-scan/damos_rar_extract',
  'D:/dctuning-scan/new_vag_extract/from_hex_s19',
  'D:/dctuning-scan/new_vag_extract/from_archives',
  'D:/dctuning-scan/dls_extract',
  'D:/last tuner files',
  'D:/tuning files',
  'C:/Users/damoc/Desktop/Damos',
  'C:/Users/damoc/Desktop/ECU FILES TEST',
]

const manifest = JSON.parse(fs.readFileSync('resources/recipes/manifest.json', 'utf8'))
const tunedFiles = new Map() // basename → manifest entries
for (const e of manifest) {
  if (!e.sourceTunedFile) continue
  const base = e.sourceTunedFile
  if (!tunedFiles.has(base)) tunedFiles.set(base, [])
  tunedFiles.get(base).push(e)
}
console.log(`Manifest: ${manifest.length} entries, ${tunedFiles.size} unique tuned basenames`)
console.log()

const perRoot = new Map(ROOTS.map(r => [r, { matched: 0, files: 0 }]))

function walk(dir, root, depth = 0) {
  if (depth > 15) return
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    if (e.name.startsWith('$') || e.name === 'System Volume Information') continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      walk(full, root, depth + 1)
    } else if (e.isFile()) {
      perRoot.get(root).files++
      if (tunedFiles.has(e.name)) {
        perRoot.get(root).matched += tunedFiles.get(e.name).length
      }
    }
  }
}

for (const root of ROOTS) {
  if (!fs.existsSync(root)) {
    console.log(`  ⚠ skipping (not found): ${root}`)
    continue
  }
  console.log(`  → ${root}`)
  walk(root, root)
}

console.log()
console.log('━━━ Recipes per ROOT (basename match) ━━━')
let totalMatched = 0
for (const [root, stats] of perRoot) {
  if (stats.files === 0) continue
  totalMatched += stats.matched
  console.log(`  ${root.padEnd(80)} ${stats.matched.toString().padStart(6)} recipes / ${stats.files.toString().padStart(7)} files`)
}
console.log(`  ${'TOTAL matched recipes (may overlap)'.padEnd(80)} ${totalMatched.toString().padStart(6)}`)
