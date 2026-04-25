// Cross-recipe map-multiplier extractor.
//
// For every ORI/tuned pair we have:
//   1. Run the VAG signature scanner on the ORI to identify named DAMOS maps
//      with their offsets + dimensions + dtype.
//   2. For each identified map, read its raw bytes before (from ORI) and after
//      (from the tuned file) and compute the mean multiplier the tuner applied.
//   3. Record: mapName + family + stage → list of multipliers (one per tune
//      where that map name appeared).
//
// After processing all pairs, compute median+P25+P75 per (mapName, stage). The
// output `resources/map-multipliers.json` becomes Tier 2 of the Stage Engine:
// for any user ORI containing a recognisable DAMOS map, even when no recipe
// matches their exact variant, we apply the learned multiplier distilled from
// thousands of real tuners' Stage N files.
//
// This is the "no ECU left behind" layer. A variant we've never seen still
// gets a tune, because the maps inside it have the same names as maps we've
// seen tuned across the corpus.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Scanner logic is inlined below rather than imported from vagScannerCore.ts —
// Node can't import .ts directly and this script is standalone.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CATALOGS_DIR = path.resolve(__dirname, '..', 'resources', 'vag-signatures')
const OUT_PATH     = path.resolve(__dirname, '..', 'resources', 'map-multipliers.json')

// Families + their catalog files
const FAM_LIST = [
  'ME7', 'EDC16', 'EDC16U', 'EDC17', 'EDC17C46',
  'MED9', 'MED17', 'SIMOS8', 'SIMOS16', 'SIMOS18',
  'PPD1', 'MG1', 'OTHER',
]

// ───────── Pure scanner core (duplicated from vagScannerCore.ts) ─────────
// Small enough to inline here rather than fight with Node TS imports.

function prefix8Hex(bin, offset) {
  const HEX = '0123456789ABCDEF'
  let s = ''
  for (let i = 0; i < 8; i++) {
    const b = bin[offset + i]
    s += HEX[(b >>> 4) & 0x0F] + HEX[b & 0x0F]
  }
  return s
}

function bytesEqual24(a, aOff, b) {
  for (let i = 0; i < 24; i++) if (a[aOff + i] !== b[i]) return false
  return true
}

function buildBucketLocal(entries) {
  const byPrefix = new Map()
  for (const e of entries) {
    const full = Buffer.from(e.s, 'base64')
    if (full.length !== 24) continue
    const p8 = prefix8Hex(full, 0)
    if (p8 === '0000000000000000' || p8 === 'FFFFFFFFFFFFFFFF' || /^(..)\1{7}$/.test(p8)) continue
    let list = byPrefix.get(p8)
    if (!list) { list = []; byPrefix.set(p8, list) }
    list.push({ e, full })
  }
  return byPrefix
}

// Load all catalogs once, keep in memory
console.log('[multipliers] loading VAG catalogs...')
const catalogs = new Map() // fam → bucket (Map<p8, entries>)
const catalogEntries = new Map() // fam → Array<CompactEntry> for name lookup
for (const fam of FAM_LIST) {
  const p = path.join(CATALOGS_DIR, `vagcat7_${fam.toLowerCase()}.json`)
  if (!fs.existsSync(p)) { catalogs.set(fam, new Map()); catalogEntries.set(fam, []); continue }
  const entries = JSON.parse(fs.readFileSync(p, 'utf8'))
  catalogEntries.set(fam, entries)
  catalogs.set(fam, buildBucketLocal(entries))
  console.log(`  ${fam}: ${entries.length} entries`)
}

// Scan binary against one or more family buckets; return per-family name→offset Map
function scanAllFamilies(bin) {
  // Combined prefix map: p8 → [{ e, full, fam }]
  const combined = new Map()
  for (const [fam, bucket] of catalogs) {
    for (const [p8, list] of bucket) {
      let dst = combined.get(p8)
      if (!dst) { dst = []; combined.set(p8, dst) }
      for (const item of list) dst.push({ e: item.e, full: item.full, fam })
    }
  }

  const familyScores = {}
  const byFamilyByName = {} // fam → Map<name, { offset, e }>

  const binLen = bin.length
  for (let i = 0; i + 24 <= binLen; i += 2) {
    const p8 = prefix8Hex(bin, i)
    const cands = combined.get(p8)
    if (!cands) continue
    for (const c of cands) {
      if (!bytesEqual24(bin, i, c.full)) continue
      familyScores[c.fam] = (familyScores[c.fam] || 0) + 1
      if (!byFamilyByName[c.fam]) byFamilyByName[c.fam] = new Map()
      if (!byFamilyByName[c.fam].has(c.e.n)) {
        byFamilyByName[c.fam].set(c.e.n, { offset: i, e: c.e })
      }
    }
  }
  return { familyScores, byFamilyByName }
}

// Pick the detected family = highest score
function detectFamily(familyScores) {
  const rank = Object.entries(familyScores).sort((a, b) => b[1] - a[1])
  return rank[0] ? rank[0][0] : null
}

// ───────── Read cells from a buffer given map dtype + dimensions ─────────
function readCells(buf, offset, rows, cols, dtypeCode, le) {
  const cells = []
  const elSize = dtypeCode === 'u1' || dtypeCode === 's1' ? 1
               : dtypeCode === 'u4' || dtypeCode === 's4' || dtypeCode === 'f4' ? 4
               : 2
  const total = rows * cols
  for (let i = 0; i < total; i++) {
    const off = offset + i * elSize
    if (off + elSize > buf.length) return null
    let v
    switch (dtypeCode) {
      case 'u1': v = buf.readUInt8(off); break
      case 's1': v = buf.readInt8(off); break
      case 's2': v = le ? buf.readInt16LE(off) : buf.readInt16BE(off); break
      case 'u4': v = le ? buf.readUInt32LE(off) : buf.readUInt32BE(off); break
      case 's4': v = le ? buf.readInt32LE(off) : buf.readInt32BE(off); break
      case 'f4': v = le ? buf.readFloatLE(off) : buf.readFloatBE(off); break
      default:   v = le ? buf.readUInt16LE(off) : buf.readUInt16BE(off); break
    }
    cells.push(v)
  }
  return cells
}

// LE/BE detection by family. Matches syntheticMapDefFromSignature convention.
const BE_FAMILIES = new Set(['EDC15', 'EDC16', 'EDC16U', 'EDC17', 'EDC17C46', 'EDC17C64', 'ME7', 'SIMOS8', 'SIMOS12', 'SIMOS16'])

// ───────── Walk pair sources (same as extract-recipes.mjs) ─────────
const ROOTS = [
  'D:/DATABASE/Tuning_DB_BIN',
  'D:/audi-package',
  'D:/DAMOS 2020',
  'D:/DAMOS-2021-2022',
  'D:/ECU Dumps and EEPROMs',
  'D:/ECU maps',
  'D:/Vw VOLKSWAGEN  ECU Map Tuning Files Stage 1 + Stage 2  Remap Files Collection TESTED',
  'D:/2017.2019',
  'C:/Users/damoc/Desktop/DATABASE/Tuning_DB_BIN',
  'C:/Users/damoc/Desktop/Damos-Big-Archive',      // v3.14.1 — added Apr 24 2026
  'D:/dctuning-scan/damos_rar_extract',             // extracted RAR contents
  'C:/Users/damoc/Desktop/Damos',                   // v3.14.3 — new DAMOS folder (multi-brand, VAG subfolders only matter)
  'C:/Users/damoc/Desktop/ECU FILES TEST',          // v3.14.3 — Damo's curated reference set
  'D:/dctuning-scan/new_vag_extract/from_hex_s19',  // v3.14.3 — converted HEX/S19 → BIN
  'D:/dctuning-scan/new_vag_extract/from_archives', // v3.14.3 — extracted ZIPs (mostly .dat reference)
]
const MIN_SIZE = 64 * 1024
const MAX_SIZE = 12 * 1024 * 1024
const SKIP_EXT = new Set(['.pdf', '.txt', '.doc', '.docx', '.xls', '.xlsx', '.zip', '.rar', '.7z',
                          '.odx', '.pdx', '.a2l', '.dll', '.exe', '.xml', '.json', '.png', '.jpg',
                          '.jpeg', '.gif', '.msi', '.lnk', '.ini', '.cfg'])

function parseFilename(name) {
  const base = path.basename(name)
  const partMatch = base.match(/(0[0-9][0-9A-Z][0-9]{6}[A-Z]{1,3})/)
  const swMatch = base.match(/(S[NAMG][0-9A-Z]{3}[0-9A-Z]{8})/)
  let stage = 0
  if (/(?:^|[\._])Stage\s?3/i.test(base)) stage = 3
  else if (/(?:^|[\._])Stage\s?2/i.test(base)) stage = 2
  else if (/(?:^|[\._])Stage\s?1/i.test(base)) stage = 1
  else if (/(?:^|[\._])(Original|\.ori|_ori)/i.test(base) || base.toLowerCase().endsWith('.ori')) stage = 0
  return { partNumber: partMatch?.[1] ?? null, swNumber: swMatch?.[1] ?? null, stage, base }
}

function walk(dir, callback, depth = 0) {
  if (depth > 10) return
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const entry of entries) {
    if (entry.name === 'System Volume Information' || entry.name.startsWith('$')) continue
    const full = path.join(dir, entry.name)
    try {
      if (entry.isDirectory()) walk(full, callback, depth + 1)
      else if (entry.isFile()) callback(full, entry.name)
    } catch {}
  }
}

// Group files by (partNumber, swNumber)
const groups = new Map()
for (const root of ROOTS) {
  if (!fs.existsSync(root)) continue
  console.log(`[multipliers] scanning ${root} ...`)
  walk(root, (full, name) => {
    const ext = path.extname(name).toLowerCase()
    if (SKIP_EXT.has(ext)) return
    let size; try { size = fs.statSync(full).size } catch { return }
    if (size < MIN_SIZE || size > MAX_SIZE) return
    const info = parseFilename(name)
    if (!info.partNumber) return
    const key = `${info.partNumber}__${info.swNumber || 'unknown'}`
    let g = groups.get(key)
    if (!g) { g = { originals: [], tunes: [] }; groups.set(key, g) }
    if (info.stage === 0) g.originals.push(full)
    else g.tunes.push({ path: full, stage: info.stage })
  })
}
console.log(`[multipliers] ${groups.size} variant groups formed`)

// ───────── Process each pair: scan ORI, compute per-map multipliers for tuned ─────────
// v3.14: per-family partition fixes cross-family pollution.
// Old behaviour: key on mapName only, so LADSOLL from EDC16 and LADSOLL from ME7
//   merged into one bucket. Their actual tuning behaviour differs.
// New behaviour: key on (family, name). At the end we also emit a cross-family
//   aggregate per name (family = '*') as a safety fallback for stage engine.
// Structure: Map<`${family}::${name}`, { family, name, stage1[], stage2[], stage3[] }>
const multipliers = new Map()

let pairsProcessed = 0
let mapsSeen = 0
for (const [key, g] of groups) {
  if (g.originals.length === 0 || g.tunes.length === 0) continue
  const oriPath = g.originals[0]
  let ori
  try { ori = fs.readFileSync(oriPath) } catch { continue }

  // Scan ORI
  const { familyScores, byFamilyByName } = scanAllFamilies(ori)
  const detectedFam = detectFamily(familyScores)
  if (!detectedFam) continue
  const le = !BE_FAMILIES.has(detectedFam)
  const mapsInOri = byFamilyByName[detectedFam]
  if (!mapsInOri) continue

  for (const t of g.tunes) {
    let tuned
    try { tuned = fs.readFileSync(t.path) } catch { continue }
    if (tuned.length !== ori.length) continue
    pairsProcessed++

    // For each named map in ORI, compute multiplier applied by tuner
    for (const [name, hit] of mapsInOri) {
      const rows = hit.e.r, cols = hit.e.c
      if (!rows || !cols || rows * cols < 4) continue
      const dtypeCode = hit.e.dt || 'u2'
      const dataOffset = hit.e.dO || 0
      const mapOff = hit.offset + dataOffset

      const before = readCells(ori, mapOff, rows, cols, dtypeCode, le)
      const after  = readCells(tuned, mapOff, rows, cols, dtypeCode, le)
      if (!before || !after) continue

      // Only count the map if the tune actually modified it
      let changed = false
      for (let i = 0; i < before.length; i++) if (before[i] !== after[i]) { changed = true; break }
      if (!changed) continue

      // Compute multiplier: mean(after)/mean(before). Skip degenerate cases.
      let sumB = 0, sumA = 0
      for (let i = 0; i < before.length; i++) { sumB += before[i]; sumA += after[i] }
      if (Math.abs(sumB) < 1e-6) continue
      const mult = sumA / sumB

      // Sanity-reject implausible multipliers (catastrophe filter)
      if (!isFinite(mult) || mult < 0.3 || mult > 3.0) continue

      mapsSeen++
      const famKey = `${detectedFam}::${name}`
      let entry = multipliers.get(famKey)
      if (!entry) {
        entry = { name, family: detectedFam, stage1: [], stage2: [], stage3: [] }
        multipliers.set(famKey, entry)
      }
      if (t.stage >= 1 && t.stage <= 3) {
        entry[`stage${t.stage}`].push(mult)
      }
    }
  }
}

console.log(`[multipliers] processed ${pairsProcessed} tuned files, ${mapsSeen} (map, tune) observations`)
console.log(`[multipliers] ${multipliers.size} unique (family, name) pairs`)

// ───────── Compute statistics per (mapName, stage) ─────────
function median(arr) {
  if (arr.length === 0) return null
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid]
}
function percentile(arr, p) {
  if (arr.length === 0) return null
  const s = [...arr].sort((a, b) => a - b)
  const idx = Math.min(s.length - 1, Math.floor(p * s.length))
  return s[idx]
}

const out = []
// Per-family entries (one per (family, name) pair)
for (const { name, family, stage1, stage2, stage3 } of multipliers.values()) {
  const entry = { name, family, count: { s1: stage1.length, s2: stage2.length, s3: stage3.length } }
  if (stage1.length >= 2) entry.stage1 = { median: median(stage1), p25: percentile(stage1, 0.25), p75: percentile(stage1, 0.75), n: stage1.length }
  if (stage2.length >= 2) entry.stage2 = { median: median(stage2), p25: percentile(stage2, 0.25), p75: percentile(stage2, 0.75), n: stage2.length }
  if (stage3.length >= 2) entry.stage3 = { median: median(stage3), p25: percentile(stage3, 0.25), p75: percentile(stage3, 0.75), n: stage3.length }
  // Only include maps with at least one stage having n>=2 (statistical significance floor)
  if (entry.stage1 || entry.stage2 || entry.stage3) out.push(entry)
}

// v3.14: also emit cross-family aggregates (family = '*') so the stage engine
// can fall back to them when a user's family doesn't have enough observations
// for a specific map name. Same statistical floor (n>=2 per stage).
const crossFamily = new Map() // name -> { stage1[], stage2[], stage3[] }
for (const { name, stage1, stage2, stage3 } of multipliers.values()) {
  let agg = crossFamily.get(name)
  if (!agg) { agg = { name, stage1: [], stage2: [], stage3: [] }; crossFamily.set(name, agg) }
  agg.stage1.push(...stage1)
  agg.stage2.push(...stage2)
  agg.stage3.push(...stage3)
}
for (const { name, stage1, stage2, stage3 } of crossFamily.values()) {
  const entry = { name, family: '*', count: { s1: stage1.length, s2: stage2.length, s3: stage3.length } }
  if (stage1.length >= 2) entry.stage1 = { median: median(stage1), p25: percentile(stage1, 0.25), p75: percentile(stage1, 0.75), n: stage1.length }
  if (stage2.length >= 2) entry.stage2 = { median: median(stage2), p25: percentile(stage2, 0.25), p75: percentile(stage2, 0.75), n: stage2.length }
  if (stage3.length >= 2) entry.stage3 = { median: median(stage3), p25: percentile(stage3, 0.25), p75: percentile(stage3, 0.75), n: stage3.length }
  if (entry.stage1 || entry.stage2 || entry.stage3) out.push(entry)
}

// Sort by (name, family) for stable diffs. '*' comes before real families (asterisk < letters in ASCII).
out.sort((a, b) => a.name.localeCompare(b.name) || a.family.localeCompare(b.family))

fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 1))
const sizeKb = (fs.statSync(OUT_PATH).size / 1024).toFixed(1)
console.log(`[multipliers] wrote ${out.length} map-name entries (${sizeKb} KB) → ${OUT_PATH}`)

// Quick stats: show the best-covered maps
const topCovered = [...out].sort((a, b) => {
  const an = (a.stage1?.n || 0) + (a.stage2?.n || 0) + (a.stage3?.n || 0)
  const bn = (b.stage1?.n || 0) + (b.stage2?.n || 0) + (b.stage3?.n || 0)
  return bn - an
}).slice(0, 12)
console.log(`\nTop-covered map names (most tuner observations):`)
for (const e of topCovered) {
  const line = [e.family, e.name]
  if (e.stage1) line.push(`S1 ×${e.stage1.median.toFixed(3)} (n=${e.stage1.n})`)
  if (e.stage2) line.push(`S2 ×${e.stage2.median.toFixed(3)} (n=${e.stage2.n})`)
  if (e.stage3) line.push(`S3 ×${e.stage3.median.toFixed(3)} (n=${e.stage3.n})`)
  console.log('  ' + line.join(' · '))
}
