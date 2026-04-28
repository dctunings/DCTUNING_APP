// Walks every configured archive root + a few extras and copies every
// .a2l file (case-insensitive) into ~/Desktop/A2L/.
//
// A2L files are ASAM-MCD-2MC calibration descriptors — the DAMOS-format
// reference data Damo uses for map identification across his tools (WinOLS,
// ECM Titanium, KESS, Swiftec). Gathering them in one place lets him point
// any tool at the same set without trawling 18 different archive folders.
//
// Collision handling: when two A2L files share a basename (very common —
// "MED9_1.a2l" exists in many DAMOS packs), we prefix the destination
// filename with the immediate parent folder name. Three-way collisions get
// a numeric suffix.

import fs from 'node:fs'
import path from 'node:path'

const ROOTS = [
  'D:/DATABASE/Tuning_DB_BIN',
  'D:/audi-package',
  'D:/DAMOS 2020',
  'D:/DAMOS-2021-2022',
  'D:/ECU Dumps and EEPROMs',
  'D:/ECU maps',
  'D:/Vw VOLKSWAGEN  ECU Map Tuning Files Stage 1 + Stage 2  Remap Files Collection TESTED',
  'D:/2017.2019',
  'D:/dctuning-scan',
  'D:/last tuner files',
  'D:/tuning files',
  'D:/remap DVD3',
  'C:/Users/damoc/Desktop/Damos',
  'C:/Users/damoc/Desktop/Damos-Big-Archive',
  'C:/Users/damoc/Desktop/ECU FILES TEST',
  'C:/Users/damoc/Desktop/DATABASE',
  'C:/Users/damoc/Desktop/checksum corrector software',
]

const DEST = 'C:/Users/damoc/Desktop/A2L'
fs.mkdirSync(DEST, { recursive: true })

// Damo's D: drive transiently goes to sleep — retry existence check up to
// 4 times with growing delay before giving up on a root.
function existsWithRetry(p) {
  if (fs.existsSync(p)) return true
  for (let attempt = 1; attempt <= 4; attempt++) {
    const until = Date.now() + 2000 * attempt
    while (Date.now() < until) { /* spin */ }
    if (fs.existsSync(p)) {
      console.log(`    (woke ${p} after ${2 * attempt}s)`)
      return true
    }
  }
  return false
}

let visited = 0, found = 0, copied = 0, skippedDup = 0, errors = 0
const seenSizes = new Map()  // basename → Set of sizes already copied (dedupe identical files)
let progressLast = Date.now()

function walk(dir, depth = 0) {
  if (depth > 12) return
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) }
  catch { return }
  for (const entry of entries) {
    if (entry.name === 'System Volume Information' || entry.name.startsWith('$')
        || entry.name === '.git' || entry.name === 'node_modules'
        || entry.name === 'A2L' /* don't recurse into our own destination */) continue
    const full = path.join(dir, entry.name)
    try {
      if (entry.isDirectory()) {
        walk(full, depth + 1)
      } else if (entry.isFile()) {
        visited++
        if (!entry.name.toLowerCase().endsWith('.a2l')) continue
        found++
        copyA2L(full)
        const now = Date.now()
        if (now - progressLast > 2000) {
          progressLast = now
          process.stdout.write(`\r    visited ${visited} files, found ${found} A2Ls, copied ${copied} (skipped ${skippedDup} duplicates, ${errors} errors)`)
        }
      }
    } catch { errors++ }
  }
}

function copyA2L(src) {
  let stat
  try { stat = fs.statSync(src) } catch { errors++; return }
  const size = stat.size
  if (size === 0) { skippedDup++; return }   // empty placeholder

  const base = path.basename(src)
  const baseLower = base.toLowerCase()

  // Dedupe by (basename, size) — if we already copied a file with same name
  // and same byte count, it's almost certainly the same A2L re-archived.
  const seen = seenSizes.get(baseLower)
  if (seen && seen.has(size)) { skippedDup++; return }
  if (!seen) seenSizes.set(baseLower, new Set([size]))
  else seen.add(size)

  // Build destination filename — prefix with parent folder name when the
  // filename alone might collide with something already there.
  const parentName = path.basename(path.dirname(src))
  const safeParent = parentName.replace(/[<>:"/\\|?*]/g, '_').slice(0, 40)
  let dest = path.join(DEST, base)
  if (fs.existsSync(dest)) {
    // Filename collision — try parent-prefixed variant
    const stem = base.replace(/\.a2l$/i, '')
    const ext = base.match(/\.a2l$/i)?.[0] || '.a2l'
    dest = path.join(DEST, `${safeParent}__${stem}${ext}`)
    let suffix = 2
    while (fs.existsSync(dest)) {
      dest = path.join(DEST, `${safeParent}__${stem}_${suffix}${ext}`)
      suffix++
      if (suffix > 100) { errors++; return }
    }
  }

  try {
    fs.copyFileSync(src, dest)
    copied++
  } catch (e) {
    errors++
  }
}

console.log(`Destination: ${DEST}`)
console.log(`Scanning ${ROOTS.length} roots for *.a2l files...\n`)

for (const root of ROOTS) {
  if (!existsWithRetry(root)) {
    console.log(`  ⚠ skipping (not found): ${root}`)
    continue
  }
  const before = found
  const startedAt = Date.now()
  console.log(`  → scanning ${root}`)
  walk(root)
  const dur = ((Date.now() - startedAt) / 1000).toFixed(1)
  process.stdout.write(`\r    ${root}: +${found - before} A2Ls (${dur}s)\n`)
}

console.log()
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
console.log(`Total files visited: ${visited}`)
console.log(`A2L files found:     ${found}`)
console.log(`Copied:              ${copied}`)
console.log(`Skipped (dupes):     ${skippedDup}`)
console.log(`Errors:              ${errors}`)
console.log(`Output: ${DEST}`)
