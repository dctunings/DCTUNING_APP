// Enumerate all ORI/Stage1 pairs in D:\DATABASE\Tuning_DB_BIN\Audi\
// Matches files by common prefix — if an "*.Original" or "*.ori" has a
// companion "*.Stage1" of same size, that's a pair.

const fs = require('fs')
const path = require('path')

const DIR = 'D:/DATABASE/Tuning_DB_BIN/Audi'
const files = fs.readdirSync(DIR)
console.log(`Total files in Audi folder: ${files.length}`)

// Split by extension / stage tag
const oriFiles = []  // { name, path, size }
const stageFiles = []  // { name, path, size, stage }

for (const f of files) {
  const full = path.join(DIR, f)
  let stat
  try { stat = fs.statSync(full) } catch { continue }
  if (!stat.isFile()) continue
  const lower = f.toLowerCase()
  const sz = stat.size
  if (lower.endsWith('.original') || lower.endsWith('.ori') || lower.endsWith('.ori2')) {
    oriFiles.push({ name: f, path: full, size: sz })
  } else {
    // Detect stage from any substring like "stage1", "stage2", "stage3", "stage1+", "stage2+"
    const m = lower.match(/stage(\d)(\+?)/i)
    if (m) stageFiles.push({ name: f, path: full, size: sz, stage: parseInt(m[1]) })
  }
}
console.log(`ORI files: ${oriFiles.length}`)
console.log(`Stage files: ${stageFiles.length}`)

// Match: strip the trailing _XXXX.Original / _XXXX.Stage1 cal ID and compare the rest.
// Files like "Audi_A3_..._03G906018DH_SN100L8000000_BC52.ori" pair with
//            "Audi_A3_..._03G906018DH_SN100L8000000_8DE3_Stage1.bin"
// The unique prefix is everything before the 4-hex-char cal ID.

function prefixOf(name) {
  // Strip extension
  let s = name
  s = s.replace(/\.(Original|ori|ori2|Stage\d\+*\.bin|Stage\d\+*|bin|Stage1\+\+\+)$/i, '')
  // Drop trailing 4-hex cal ID
  s = s.replace(/_[0-9A-F]{4}(\+*)?$/i, '')
  return s
}

// Build an ORI lookup by prefix
const oriByPrefix = new Map()
for (const o of oriFiles) {
  const p = prefixOf(o.name)
  if (!oriByPrefix.has(p)) oriByPrefix.set(p, [])
  oriByPrefix.get(p).push(o)
}

// Match stages to their ORIs
const pairs = []  // { ori, stage1?, stage2?, stage3? }
const pairByPrefix = new Map()
for (const s of stageFiles) {
  const p = prefixOf(s.name)
  const oris = oriByPrefix.get(p)
  if (!oris || oris.length === 0) continue
  // Pick the ORI with the same size (same cal)
  const matched = oris.find(o => o.size === s.size)
  if (!matched) continue
  let pair = pairByPrefix.get(p)
  if (!pair) { pair = { prefix: p, ori: matched }; pairByPrefix.set(p, pair); pairs.push(pair) }
  pair[`stage${s.stage}`] = s
}

// Pairs must have at least a Stage1 to be useful
const withStage1 = pairs.filter(p => p.stage1)
console.log(`\nMatched pairs (ORI + Stage1): ${withStage1.length}`)
console.log(`Pairs with Stage2: ${pairs.filter(p=>p.stage2).length}`)
console.log(`Pairs with Stage3: ${pairs.filter(p=>p.stage3).length}`)

// Extract ECU family hint from filename
function ecuHint(name) {
  const L = name.toLowerCase()
  if (L.includes('siemens') || L.match(/03g906018(d|a)/i)) return 'PPD1.x'
  if (L.match(/0261207|0261206|0261204/) || L.includes('me7')) return 'ME7.x'
  if (L.match(/0281017|0281018|0281019|0281020|0281030/) || L.includes('edc17')) return 'EDC17'
  if (L.match(/0281015|0281016|0281014/) || L.includes('edc16')) return 'EDC16'
  if (L.match(/0281010|0281011|0281012|0281013/)) return 'EDC15'
  if (L.match(/03l906022|03l906018/i)) return 'EDC17'
  if (L.match(/03g906016|03g906019|03g906021/i)) return 'EDC16 PD'
  if (L.match(/med17|03c906|5wp/i)) return 'MED17'
  return '?'
}

// Print first 60
console.log(`\nFirst 60 pairs:\n`)
for (const p of withStage1.slice(0, 60)) {
  const hint = ecuHint(p.ori.name)
  console.log(`  [${hint.padEnd(8)}] ${(p.ori.size/1024).toFixed(0)}K  ${p.ori.name.slice(0, 100)}`)
}
if (withStage1.length > 60) console.log(`  ... and ${withStage1.length - 60} more`)

// Summary by ECU family
const byFamily = {}
for (const p of withStage1) {
  const f = ecuHint(p.ori.name)
  byFamily[f] = (byFamily[f] || 0) + 1
}
console.log('\nPairs by ECU family:')
for (const [f, n] of Object.entries(byFamily).sort((a,b)=>b[1]-a[1])) console.log(`  ${f.padEnd(10)} ${n}`)

// Write pair list to JSON for the batch analyzer
fs.writeFileSync('C:/temp/audi_pairs.json', JSON.stringify(
  withStage1.map(p => ({
    prefix: p.prefix,
    ecuHint: ecuHint(p.ori.name),
    oriPath: p.ori.path, oriSize: p.ori.size,
    stage1Path: p.stage1.path,
    stage2Path: p.stage2?.path ?? null,
    stage3Path: p.stage3?.path ?? null,
  })),
  null, 2
))
console.log(`\nWrote C:/temp/audi_pairs.json with ${withStage1.length} pairs`)
