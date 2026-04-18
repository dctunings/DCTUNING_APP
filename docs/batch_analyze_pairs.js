// Batch-analyze every ORI/Stage1 pair in audi_pairs.json.
// Writes one JSON line per pair to audi_analysis.jsonl, plus a per-variant
// aggregation to audi_variants.json.

const fs = require('fs')
const path = require('path')

const PAIRS = JSON.parse(fs.readFileSync('C:/temp/audi_pairs.json', 'utf8'))
console.log(`Processing ${PAIRS.length} pairs...`)

const OUT = fs.openSync('C:/temp/audi_analysis.jsonl', 'w')
const VARIANT_MAP = new Map()   // `${partNumber}|${swVersion}` → { pairs: [], allRegions: [], files: [] }

const START = Date.now()

// Extract part number + SW version from filename
function parseFilename(name) {
  const info = {}
  // VW/Audi part numbers: 10-12 char alphanumeric, e.g. 03L906022BQ, 03G906018DH
  const pnMatch = name.match(/(?<![A-Z0-9])([034][0-9][A-Z]9060[12][89][A-Z]{0,3})(?![A-Z0-9])/i)
  if (pnMatch) info.partNumber = pnMatch[1].toUpperCase()
  // Bosch part numbers: 0261xxxxxx / 0281xxxxxx
  const boschMatch = name.match(/(?<!\d)(02[68]1[0-9]{6})(?!\d)/)
  if (boschMatch) info.boschPart = boschMatch[1]
  // SW version: 6-digit numeric ID before the 4-hex cal marker
  const swMatch = name.match(/_([0-9]{6})_/)
  if (swMatch) info.swVersion = swMatch[1]
  // Siemens SW serials (SN* / SM* / SA*)
  const snMatch = name.match(/_(S[NMA][A-Z0-9]{10,13})_/)
  if (snMatch) info.siemensSerial = snMatch[1]
  return info
}

function ecuFamily(name, size) {
  const L = name.toLowerCase()
  if (L.includes('siemens-continental') || L.includes('siemens')) {
    if (L.includes('03f906070')) return 'SIMOS_PCR'      // 1.2 TFSI
    if (L.includes('03l906023') || L.includes('03l906021')) return 'SIMOS_PCR21'  // 1.6 TDI CR
    return 'PPD1.x'
  }
  if (L.match(/0281017|0281018|0281019|0281020|0281030/)) return 'EDC17'
  if (L.match(/0281015|0281016|0281014/)) return 'EDC16'
  if (L.match(/0281010|0281011|0281012|0281013/)) return 'EDC15'
  if (L.match(/03l906022|03l906018|03l906021|04l906021|04l906056/i)) return 'EDC17/MED17'
  if (L.match(/03g906016|03g906019|03g906021/i)) return 'EDC16 PD'
  if (L.match(/03c906|0261s0|04e906016|04l906016/i)) return 'MED17'
  if (L.match(/0261206|0261207|0261204|0261203/)) return 'ME7.x'
  if (L.match(/5wp4|06a906033/)) return 'ME7/ME9 petrol'
  return `unknown-${size/1024|0}K`
}

// Diff engine (same pipeline as single-pair analyzers)
function analyzePair(pair) {
  const A = fs.readFileSync(pair.oriPath)
  const B = fs.readFileSync(pair.stage1Path)
  if (A.length !== B.length) return { sizesMatch: false }

  // Raw diff
  const runs = []
  let changed = 0, i = 0
  while (i < A.length) {
    if (A[i] !== B[i]) { const s = i; i++; while (i < A.length && A[i] !== B[i]) { i++; }; runs.push({ s, e: i }) } else i++
  }
  for (const r of runs) changed += r.e - r.s
  if (runs.length === 0) return { sizesMatch: true, sameBytes: true, changed: 0, regions: [] }

  // Tight merge
  const tight = [runs[0]]
  for (let r = 1; r < runs.length; r++) {
    const prev = tight[tight.length-1]
    if (runs[r].s - prev.e <= 4) prev.e = runs[r].e
    else tight.push({ ...runs[r] })
  }
  // Stride cluster
  const STRIDES = [8, 16, 24, 32, 48, 64, 96, 128, 192, 256]
  const used = new Array(tight.length).fill(false)
  const clusters = []
  for (let k = 0; k < tight.length; k++) {
    if (used[k]) continue
    let best = null
    for (const stride of STRIDES) {
      const chain = [k]; let last = tight[k].s
      for (let j = k+1; j < tight.length; j++) {
        if (used[j]) continue
        const exp = last + stride
        if (Math.abs(tight[j].s - exp) <= 2) { chain.push(j); last = tight[j].s }
        else if (tight[j].s > exp + 2) break
      }
      if (chain.length >= 3 && (!best || chain.length > best.chain.length)) best = { chain, stride }
    }
    if (best) {
      const f = tight[best.chain[0]], l = tight[best.chain[best.chain.length-1]]
      clusters.push({ s: f.s, e: Math.max(l.e, l.s + best.stride), stride: best.stride, rows: best.chain.length })
      for (const idx of best.chain) used[idx] = true
    } else { clusters.push({ s: tight[k].s, e: tight[k].e }); used[k] = true }
  }
  clusters.sort((a,b)=>a.s-b.s)

  // Stats per cluster in both BE and LE u16
  function u16stats(buf, off, len, le) {
    let mn = Infinity, mx = 0, sum = 0, n = 0
    for (let i = off; i + 1 < off + len; i += 2) {
      const v = le ? buf[i] | (buf[i+1]<<8) : (buf[i]<<8) | buf[i+1]
      if (v < mn) mn = v; if (v > mx) mx = v; sum += v; n++
    }
    return { min: mn, max: mx, mean: sum/n, n }
  }

  const regions = []
  for (const c of clusters) {
    const len = c.e - c.s
    let chg = 0
    for (let k = 0; k < len; k++) if (A[c.s+k] !== B[c.s+k]) chg++
    if (chg < 6) continue
    // Only record BE stats (most VAG ECUs are BE; EDC17/MED17 LE handled later by family)
    const bBE = u16stats(A, c.s, len, false)
    const aBE = u16stats(B, c.s, len, false)
    const bLE = u16stats(A, c.s, len, true)
    const aLE = u16stats(B, c.s, len, true)
    const pctBE = bBE.mean > 0 ? ((aBE.mean - bBE.mean) / bBE.mean) * 100 : 0
    const pctLE = bLE.mean > 0 ? ((aLE.mean - bLE.mean) / bLE.mean) * 100 : 0
    regions.push({
      off: c.s, len, chg,
      stride: c.stride ?? null, rows: c.rows ?? null,
      cols: c.stride ? c.stride/2 : null,
      be: { mean: +bBE.mean.toFixed(0), aMean: +aBE.mean.toFixed(0), pct: +pctBE.toFixed(1) },
      le: { mean: +bLE.mean.toFixed(0), aMean: +aLE.mean.toFixed(0), pct: +pctLE.toFixed(1) },
    })
  }
  // Sort by |pct| desc (BE by default)
  regions.sort((x,y) => Math.abs(y.be.pct) - Math.abs(x.be.pct))

  return { sizesMatch: true, changed, regions }
}

// Process all pairs
let ok = 0, failed = 0, skipped = 0
const totalStart = Date.now()
for (let idx = 0; idx < PAIRS.length; idx++) {
  const p = PAIRS[idx]
  const filename = path.basename(p.oriPath)
  const info = parseFilename(filename)
  info.ecuFamily = ecuFamily(filename, p.oriSize)
  info.size = p.oriSize

  try {
    const r = analyzePair(p)
    if (!r.sizesMatch) { skipped++; continue }
    const rec = {
      idx, file: filename, size: p.oriSize,
      family: info.ecuFamily,
      partNumber: info.partNumber ?? info.boschPart ?? null,
      swVersion: info.swVersion ?? info.siemensSerial ?? null,
      changedBytes: r.changed,
      regionCount: r.regions?.length ?? 0,
      topRegions: (r.regions ?? []).slice(0, 20),   // cap for file size
    }
    fs.writeSync(OUT, JSON.stringify(rec) + '\n')
    // Aggregate by variant
    const key = `${info.ecuFamily}|${info.partNumber ?? '?'}|${info.swVersion ?? '?'}`
    if (!VARIANT_MAP.has(key)) VARIANT_MAP.set(key, { key, pairs: 0, files: [], allRegions: [] })
    const v = VARIANT_MAP.get(key)
    v.pairs++
    if (v.files.length < 5) v.files.push(filename)
    for (const reg of (r.regions ?? []).slice(0, 30)) v.allRegions.push({ off: reg.off, len: reg.len, stride: reg.stride, rows: reg.rows, cols: reg.cols, bePct: reg.be.pct, leMean: reg.le.mean, beMean: reg.be.mean })
    ok++
  } catch (e) {
    failed++
  }

  if ((idx+1) % 50 === 0 || idx === PAIRS.length - 1) {
    const pct = ((idx+1) / PAIRS.length * 100).toFixed(0)
    const elapsed = ((Date.now() - totalStart) / 1000).toFixed(0)
    const eta = PAIRS.length > 0 ? ((Date.now() - totalStart) * (PAIRS.length - idx - 1) / (idx + 1) / 1000).toFixed(0) : '?'
    console.log(`  ${idx+1}/${PAIRS.length} (${pct}%)  ok=${ok} failed=${failed} skipped=${skipped}  elapsed ${elapsed}s  eta ${eta}s`)
  }
}

fs.closeSync(OUT)
console.log(`\nAnalysis complete: ${ok} pairs analysed, ${failed} failed, ${skipped} skipped (size mismatch)`)
console.log(`Elapsed: ${((Date.now() - START) / 1000).toFixed(0)}s`)

// ── Variant aggregation: for each variant with 2+ pairs, find consistent offsets ──
const variants = []
for (const v of VARIANT_MAP.values()) {
  // Group regions by offset (within ±2 bytes tolerance)
  const offsetGroups = new Map()
  for (const r of v.allRegions) {
    // Bucket by offset rounded to nearest 2
    const key = r.off & ~0x1
    if (!offsetGroups.has(key)) offsetGroups.set(key, [])
    offsetGroups.get(key).push(r)
  }
  // Keep only offsets that appear in ≥2 pairs (or all pairs if variant has only 1)
  const consistentOffsets = []
  for (const [off, group] of offsetGroups) {
    if (group.length < Math.min(2, v.pairs)) continue
    // Average
    let sumPct = 0, sumMean = 0, nStride = 0, sumStride = 0
    for (const g of group) {
      sumPct += g.bePct
      sumMean += g.beMean
      if (g.stride) { nStride++; sumStride += g.stride }
    }
    consistentOffsets.push({
      offset: off,
      hitCount: group.length,
      avgBePct: +(sumPct / group.length).toFixed(1),
      avgBeMean: +(sumMean / group.length).toFixed(0),
      stride: nStride > 0 ? +(sumStride / nStride).toFixed(0) : null,
      rows: group[0].rows ?? null,
      cols: group[0].cols ?? null,
    })
  }
  consistentOffsets.sort((a,b) => Math.abs(b.avgBePct) - Math.abs(a.avgBePct))
  variants.push({
    key: v.key,
    pairs: v.pairs,
    sampleFiles: v.files,
    consistentOffsets: consistentOffsets.slice(0, 40),
  })
}
// Sort variants by pair count desc — most-common variants first
variants.sort((a,b) => b.pairs - a.pairs)
fs.writeFileSync('C:/temp/audi_variants.json', JSON.stringify(variants, null, 2))
console.log(`Wrote ${variants.length} variant aggregations to audi_variants.json`)

// Print top variants
console.log('\nTop 20 variants by pair count:')
for (const v of variants.slice(0, 20)) {
  const [family, pn, sw] = v.key.split('|')
  console.log(`  ${v.pairs.toString().padStart(3)}× ${family.padEnd(18)}  ${pn.padEnd(14)}  sw=${sw.padEnd(14)}  ${v.consistentOffsets.length} consistent offsets`)
}
