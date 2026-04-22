import type { EcuDef, MapDef, DataType, MapCategory } from './ecuDefinitions'
import { ECU_DEFINITIONS } from './ecuDefinitions'
import type { A2LMapDef } from './a2lParser'
import { ECU_CATALOG, type EcuCatalogEntry } from './ecuCatalog'
import { getPhysicalClamps, physicalToRawClamps } from './categoryClamps'

export interface DetectedEcu {
  def: EcuDef
  confidence: number     // 0–1
  matchedStrings: string[]
  fileSize: number
}

export interface ExtractedMap {
  mapDef: MapDef
  data: number[][]      // physical values (after factor/offset applied)
  rawData: number[][]   // raw integer values as stored in binary
  offset: number        // byte offset where map was found (-1 = not found)
  found: boolean
  source: 'signature' | 'fixedOffset' | 'calSearch' | 'a2l' | 'drt' | 'kp' | 'scanner' | 'none'
  quality?: number      // 0-1 data quality score (smoothness × range × non-trivial)
  // Optional per-cell multiplier grid for ECM Titanium-style zone editing.
  // When present, each cell uses its own multiplier instead of the stage-level uniform multiplier.
  cellMultiplierGrid?: number[][]
  // Optional per-cell addend grid (raw units). Used for addend-based maps (SOI, ignition timing)
  // where the Zone Editor stores degree offsets converted to raw units per cell.
  // When present, each cell's stored raw value gets +cellAddendGrid[r][c] applied.
  cellAddendGrid?: number[][]
}

// ─── ECU Detection ────────────────────────────────────────────────────────────
export function detectEcu(buffer: ArrayBuffer): DetectedEcu | null {
  const bytes = new Uint8Array(buffer)

  // Build search strings from the binary for ident matching.
  // For large files (>1MB), only scan key regions to avoid creating massive strings:
  //   - First 512KB (contains headers, part numbers, ident strings)
  //   - Middle region around 75% (contains cal ident blocks in some ECUs)
  //   - Last 256KB (contains trailing ident blocks)
  // For small files (<1MB), scan the entire file.
  let scanBytes: Uint8Array
  if (bytes.length > 1048576) {
    // Large file: combine first 512K + middle 256K + last 256K
    const first = bytes.slice(0, 524288)
    const midStart = Math.floor(bytes.length * 0.70)
    const mid = bytes.slice(midStart, midStart + 262144)
    const last = bytes.slice(bytes.length - 262144)
    const combined = new Uint8Array(first.length + mid.length + last.length)
    combined.set(first, 0)
    combined.set(mid, first.length)
    combined.set(last, first.length + mid.length)
    scanBytes = combined
  } else {
    scanBytes = bytes
  }
  const ascii_spaced       = Array.from(scanBytes).map(b => b >= 32 && b < 127 ? String.fromCharCode(b) : ' ').join('')
  const ascii_compact      = Array.from(scanBytes).map(b => b >= 32 && b < 127 ? String.fromCharCode(b) : '' ).join('')
  const ascii_nounderscore = Array.from(scanBytes).map(b => b === 95 ? '' : b >= 32 && b < 127 ? String.fromCharCode(b) : '').join('')

  let best: DetectedEcu | null = null
  let bestScore = 0

  for (const def of ECU_DEFINITIONS) {
    const matched: string[] = []
    for (const s of def.identStrings) {
      if (s.length < 4) continue
      if (ascii_spaced.includes(s) || ascii_compact.includes(s) || ascii_nounderscore.includes(s)) matched.push(s)
    }
    // Also check file size range
    const sizeOk = buffer.byteLength >= def.fileSizeRange[0] && buffer.byteLength <= def.fileSizeRange[1]
    // Require at least one ident string match — size alone is not sufficient
    if (matched.length === 0) continue

    // Length-weighted scoring: longer strings are more specific and count for more.
    // "EDC17CP20" (9 chars) outweighs "EDC16" (5 chars) — prevents a binary that
    // contains both EDC16 and EDC17 strings from resolving to the wrong family.
    const qualifiedStrings = def.identStrings.filter(s => s.length >= 4)
    const matchedWeight  = matched.reduce((sum, s) => sum + s.length, 0)
    const totalWeight    = qualifiedStrings.reduce((sum, s) => sum + s.length, 0)
    const stringScore    = totalWeight > 0 ? matchedWeight / totalWeight : 0
    const score = stringScore * 0.7 + (sizeOk ? 0.3 : 0)
    if (score > bestScore) {
      bestScore = score
      best = { def, confidence: score, matchedStrings: matched, fileSize: buffer.byteLength }
    }
  }

  // Threshold raised 0.15 → 0.50. Below that, the match is a weak ident-string
  // collision (e.g. "EDC16" substring + size-OK = 0.23) against a very specific
  // variant def — worse than saying "not recognised" because it claims confidence
  // the app doesn't have. At <50% we fall back to the catalog detector + user
  // override, which is honest about uncertainty.
  return bestScore >= 0.50 ? best : null
}

// ─── Part number extraction from binary content ───────────────────────────────
// Scans the binary for embedded ASCII part numbers.
// Priority order:
//   1. VW/Audi/BMW/Ford alphanumeric  (e.g. 03L906018AG, 06A906032TE, 8V21-12A650-AB)
//   2. Bosch 10-digit numeric         (e.g. 0261207446, 0281014069)
//   3. Generic 7-10 digit numeric     (e.g. 1037394205)
// Only scans the first 512 KB — part numbers are always in the calibration header.
export function extractPartNumberFromBinary(buffer: ArrayBuffer): string | null {
  const bytes  = new Uint8Array(buffer)
  const scanLen = Math.min(bytes.length, 512 * 1024)
  const ascii  = Array.from(bytes.subarray(0, scanLen))
    .map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : ' ')
    .join('')

  // 1. VW/Audi/Skoda/Seat alphanumeric: 3 digits + letter + 5-6 digits + 0-3 letters
  //    e.g. 03L906018AG  06A906032TE  03C906025AA  8K0907115J
  const vwMatches = [...ascii.matchAll(/(?<![A-Z0-9])(\d{2,3}[A-Z]\d{5,7}[A-Z]{0,3})(?![A-Z0-9])/g)]
    .map(m => m[1])
    .filter(m => m.length >= 8 && m.length <= 14)
  if (vwMatches.length > 0) return vwMatches[0]

  // 2. Bosch numeric 10-digit starting with 026x or 028x (ME7, EDC15, EDC16, EDC17)
  //    e.g. 0261207446  0281014069  0281018057
  const boschMatches = [...ascii.matchAll(/(?<!\d)(02[0-9]{8})(?!\d)/g)]
    .map(m => m[1])
    .filter(m => /^0(26|28|12|20|21|22|23|24|25|27|29|30|31)\d/.test(m))
  if (boschMatches.length > 0) return boschMatches[0]

  // 3. Generic long numeric (7-10 digits) as last resort
  const genericMatches = [...ascii.matchAll(/(?<!\d)(\d{8,10})(?!\d)/g)]
    .map(m => m[1])
    .filter(m => !/^0+$/.test(m) && !/^(1234|9999|0000)/.test(m))
  if (genericMatches.length > 0) return genericMatches[0]

  return null
}

// ─── Filename-based ECU detection fallback ────────────────────────────────────
// Used when binary content detection fails (encrypted/proprietary/tool-format files).
// Parses the filename for ECU family keywords and returns a low-confidence match.
// Keyword list covers common naming conventions from WinOLS, ECM Titanium, KESS, CMD etc.
export function detectEcuFromFilename(filename: string): DetectedEcu | null {
  // Normalise: lowercase, then collapse all spaces/underscores/hyphens/dots so
  // "EDC 16", "EDC_16", "EDC-16", "edc16" all become "edc16" for matching.
  const lower = filename.toLowerCase()
  const norm  = lower.replace(/[\s_\-\.]+/g, '')   // spaces/underscores/hyphens/dots removed

  // Match helper — checks both raw lowercase and normalised form
  const has = (kw: string) => lower.includes(kw) || norm.includes(kw.replace(/[\s_\-\.]+/g, ''))

  // Map of filename keywords → ECU definition id (ordered most-specific first)
  const filenameRules: Array<[string[], string]> = [
    [['edc17cp20','cp20'],            'edc17'],
    [['edc17cp14','cp14'],            'edc17'],
    [['edc17c46','c46'],              'edc17'],
    [['edc17c41','c41'],              'edc17'],
    [['edc17cp','edc17c','edc17u'],   'edc17'],
    [['edc17','edc 17'],              'edc17'],
    [['edc16c34','c34'],              'edc16'],
    [['edc16c8','c8'],                'edc16'],
    [['edc16cp','edc16c','edc16u'],   'edc16'],
    [['edc16','edc 16'],              'edc16'],
    [['edc15c','edc15p','edc15','edc 15'], 'edc15'],
    [['med17.5','med175'],            'med17'],
    [['med17.9','med179'],            'med17'],
    [['med17'],                       'med17'],
    [['me7.5','me75','me7'],          'me7'],
    [['me9.0','me90','me9'],          'me9'],
    [['simos18','sim18'],             'simos18'],
    [['simos11','sim11'],             'continental_simos11'],
    [['simos10','sim10'],             'simos10'],
    [['msd80','msd85','msd87'],       'bmw_msd'],
    [['ppd1.1','ppd1.2','ppd1.3','ppd1.5','ppd1'], 'vag_ppd1'],
    [['dcm3.5','dcm35'],              'dcm35'],
    [['dcm3.7','dcm37'],              'delphi_mt86'],
    [['dcm6.1','dcm61'],              'dcm61'],
    [['dcm6.2','dcm62'],              'vag_dcm62'],
    [['crd2.1','crd2'],               'delphi_crd2'],
    [['crd3.1','crd3'],               'delphi_crd3'],
    [['sid208'],                      'sid208'],
    [['sid807'],                      'sid807'],
    [['sid310','sid305','sid307'],    'sid310'],
    [['ems3120','ems312'],            'ems3120'],
    [['pcr2.1','pcr21'],              'pcr21'],
    [['mjd6','mjd8','mj8'],           'marelli_mjd'],
    [['iaw4','iaw5','iaw6','iaw7'],   'marelli_iaw'],
    [['mt80'],                        'delphi_mt80'],
    [['mevd17'],                      'bmw_mevd17'],
    [['mg1cs','mg1c'],                'mg1'],
    [['sim2k'],                       'sim2k'],
    // New ECU families
    [['sid801','sid802','sid803','sid804','sid805','sid806','sid807'], 'siemens_sid'],
    [['sid201','sid206','sid301'],     'siemens_sid'],
    [['ems3110','ems3120','ems3125','ems3130','ems3132','ems3150'], 'siemens_ems3'],
    [['pcr2','pcr21'],                'siemens_pcr'],
    [['dcm3.5','dcm35','dcm3.7','dcm37'], 'delphi_dcm35'],
    [['8gmf','mm8gmf','multiair'],    'marelli_8gmf'],
    [['mjd6f3','mjd602','mjd8f2','mjd8df','mjd9df'], 'marelli_mjd'],
    [['denso','279700'],              'denso_v8'],
    [['visteon','6c1u','dcu10','dcu-10'], 'visteon_dcm'],
    [['siemens'],                     'siemens_sid'],  // generic Siemens fallback
    [['delphi'],                      'delphi_dcm35'], // generic Delphi fallback
    [['marelli'],                     'marelli_8gmf'], // generic Marelli fallback
  ]

  for (const [keywords, defId] of filenameRules) {
    for (const kw of keywords) {
      if (has(kw)) {
        const def = ECU_DEFINITIONS.find(d => d.id === defId)
        if (def) {
          return {
            def,
            confidence: 0.35,   // low confidence — filename hint only
            matchedStrings: [kw],
            fileSize: 0,
          }
        }
      }
    }
  }
  return null
}

// ─── Catalog-backed ECU variant detection (WinOLS 698-ECU catalog) ────────────
// Search the binary ASCII for any known WinOLS ECU variant name.
// Unlike detectEcu() which requires one of our 217 internal EcuDefs, this
// covers all 695 WinOLS-recognised variants — so we can at least tell the user
// "this is a MED17.5.25" even if we don't yet have a map catalog for it.
//
// The catalog is sorted longest-variant-first, so "MED17.5.25" matches before
// "MED17" (which would otherwise be a subset match). First hit wins.
//
// Returns null when no variant name is embedded in the binary.

export interface DetectedCatalogEcu {
  entry: EcuCatalogEntry
  matchedString: string   // the exact variant name found in the binary
  confidence: number      // 0-1, higher for longer/more-specific matches
}

export function detectEcuFromCatalog(buffer: ArrayBuffer, filename?: string): DetectedCatalogEcu | null {
  const bytes = new Uint8Array(buffer)

  // For large files, scan only header + trailer regions — same strategy as detectEcu.
  let scanBytes: Uint8Array
  if (bytes.length > 1048576) {
    const first = bytes.slice(0, 524288)
    const midStart = Math.floor(bytes.length * 0.70)
    const mid = bytes.slice(midStart, midStart + 262144)
    const last = bytes.slice(bytes.length - 262144)
    const combined = new Uint8Array(first.length + mid.length + last.length)
    combined.set(first, 0)
    combined.set(mid, first.length)
    combined.set(last, first.length + mid.length)
    scanBytes = combined
  } else {
    scanBytes = bytes
  }

  // Build ASCII haystacks — raw (with spaces) and "compact" (all whitespace +
  // underscores removed) so variants like "EDC17_CP20" match "EDC17CP20".
  const ascii        = Array.from(scanBytes).map(b => b >= 32 && b < 127 ? String.fromCharCode(b) : ' ').join('')
  const asciiCompact = ascii.replace(/[\s_]+/g, '')

  // ALSO include the filename (if supplied) in the search corpus. Most tuning
  // files carry the ECU family name in the filename but not in the binary —
  // "Audi_A3_EDC16_...Original" won't have "EDC16" literal bytes in flash,
  // but the name does. Without this, catalog detection misses ~70% of diesel binaries.
  const fileStr = filename ?? ''

  const haystackUpper        = (ascii + '\n' + fileStr).toUpperCase()
  const haystackCompactUpper = (asciiCompact + '\n' + fileStr.replace(/[\s_]+/g, '')).toUpperCase()

  // Catalog is already sorted by length DESC — first hit is the most specific.
  // Skip extremely short variants (≤3 chars) to avoid false-positives in random bytes.
  for (const entry of ECU_CATALOG) {
    if (entry.variant.length < 4) continue
    const target = entry.variant.toUpperCase()
    const targetCompact = target.replace(/[\s_]+/g, '')
    if (haystackUpper.includes(target) || haystackCompactUpper.includes(targetCompact)) {
      // Length-based confidence: a 12-char match is way more specific than a 4-char match.
      const conf = Math.min(1, entry.variant.length / 12)
      return { entry, matchedString: entry.variant, confidence: conf }
    }
  }
  return null
}

// ─── Signature search ─────────────────────────────────────────────────────────
function findSignature(bytes: Uint8Array, sig: number[], startFrom = 0): number {
  outer: for (let i = startFrom; i <= bytes.length - sig.length; i++) {
    for (let j = 0; j < sig.length; j++) {
      if (bytes[i + j] !== sig[j]) continue outer
    }
    return i + sig.length  // return position AFTER the signature
  }
  return -1
}

// ─── Read value from buffer ───────────────────────────────────────────────────
function readVal(view: DataView, offset: number, dtype: DataType, le: boolean): number {
  switch (dtype) {
    case 'uint8':   return view.getUint8(offset)
    case 'int8':    return view.getInt8(offset)
    case 'uint16':  return view.getUint16(offset, le)
    case 'int16':   return view.getInt16(offset, le)
    case 'float32': return view.getFloat32(offset, le)
    default:        return view.getUint8(offset)
  }
}

function dtypeSize(dtype: DataType): number {
  switch (dtype) {
    case 'uint8': case 'int8':    return 1
    case 'uint16': case 'int16':  return 2
    case 'float32':               return 4
    default:                       return 1
  }
}

// ─── Physical range per category ──────────────────────────────────────────────
const PHYS_RANGES: Record<string, { min: number; max: number }> = {
  boost:    { min: -5,   max: 4000 },  // mbar (0-4000) or bar (0-4) depending on ECU
  torque:   { min: -10,  max: 700 },   // Nm — widened for EDC15 variants with higher torque maps
  fuel:     { min: -5,   max: 150 },   // mg/st — widened from 100 for EDC15 tuned maps
  smoke:    { min: 0,    max: 150 },   // mg/st — widened from 50: real EDC15 smoke limiters go 55-100
  ignition: { min: -50,  max: 70 },
  limiter:  { min: 0,    max: 8000 },
  emission: { min: -5,   max: 150 },
  misc:     { min: -500, max: 500 },
}

// ─── Fast data quality scoring (inline min/max, no .flat()) ───────────────────
// Scores how likely a data block is to be a REAL ECU map vs garbage/padding.
//
// Real ECU maps have these characteristics:
//   1. Values within expected physical range for the category
//   2. Smooth gradients — adjacent cells differ by small amounts
//   3. Low zigzag — values trend consistently, don't reverse direction constantly
//   4. Many distinct values spread across the grid (not flat fill)
//   5. No large constant regions (>60% same value = fill/padding)
//   6. Variation in MOST rows, not just a few
//
// Garbage data (random bytes interpreted as map) typically:
//   - Zigzags wildly (direction reverses every 1-2 cells)
//   - Has a flat fill region with random-looking border rows
//   - Has huge jumps between adjacent cells
function scoreMapData(phys: number[][], category: string): number {
  const rows = phys.length
  const cols = phys[0]?.length ?? 0
  if (rows === 0 || cols === 0) return 0
  const range = PHYS_RANGES[category] ?? PHYS_RANGES.misc
  const total = rows * cols

  // ── 1. Range check: are values within expected physical range? ──
  let inRange = 0, sum = 0, vMin = Infinity, vMax = -Infinity
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = phys[r][c]; sum += v
      if (v < vMin) vMin = v; if (v > vMax) vMax = v
      if (v >= range.min && v <= range.max) inRange++
    }
  }
  if (total === 0) return 0
  const rangeFrac = inRange / total
  if (rangeFrac < 0.85) return 0

  // ── 1b. Category-specific minimum value sanity checks ──
  // Real torque maps always have some cells > 30 Nm — even the smallest production engines.
  // False positives from calSearch often read correction tables or index data with values
  // of 1–25 Nm which pass the range check (-10 to 700) but aren't real torque ceilings.
  // Similarly, boost maps should have peak values above 0.1 bar (100 mbar) to be real.
  if (category === 'torque' && vMax < 30) return 0

  // ── 2. Mode/fill check: reject blocks dominated by a single value ──
  const valCounts = new Map<number, number>()
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const key = Math.round(phys[r][c] * 100) / 100
      valCounts.set(key, (valCounts.get(key) ?? 0) + 1)
    }
  }
  let modeCount = 0
  for (const cnt of valCounts.values()) { if (cnt > modeCount) modeCount = cnt }
  const modeFrac = modeCount / total
  // If >60% of cells are the same value → fill/padding region, not a real map
  if (modeFrac > 0.60) return 0.02

  // ── 3. Constant-row check: reject if too many rows are completely flat ──
  let constRows = 0
  for (let r = 0; r < rows; r++) {
    let allSame = true
    for (let c = 1; c < cols; c++) {
      if (Math.abs(phys[r][c] - phys[r][0]) > 0.01) { allSame = false; break }
    }
    if (allSame) constRows++
  }
  // If more than 40% of rows are completely constant, suspicious
  // Real maps may have 1-2 constant rows (at idle or at max) but not 50%+
  if (constRows > rows * 0.40) return 0.03

  // ── 3b. Outlier check: reject maps where a few cells dominate the range ──
  // Real tuning maps have smooth gradients. If max is >10× median, it's likely
  // garbage (e.g. axis data leaking into map data, or uninitialized cells).
  const sorted = phys.flat().sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  if (median > 0.1 && vMax > median * 15) return 0.02  // extreme outlier vs bulk
  if (median < 0.5 && vMax > 50 && category !== 'emission') return 0.02  // most cells near-zero but max is large

  // ── 4. Smoothness: adjacent cells shouldn't jump wildly ──
  let adjDiffSum = 0, adjCount = 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (c + 1 < cols) { adjDiffSum += Math.abs(phys[r][c + 1] - phys[r][c]); adjCount++ }
      if (r + 1 < rows) { adjDiffSum += Math.abs(phys[r + 1][c] - phys[r][c]); adjCount++ }
    }
  }
  const meanAdj = adjCount > 0 ? adjDiffSum / adjCount : 999
  const physRange = vMax - vMin
  const smoothness = physRange > 0 ? Math.max(0, 1 - (meanAdj / physRange) * 2) : 0

  // ── 5. Zigzag detection: real maps trend smoothly, garbage reverses direction ──
  // Count direction reversals per row and column.
  // Real map row:    5, 10, 18, 25, 30, 35 → 0 reversals (monotonic)
  // Real with peak:  5, 15, 25, 20, 15, 10 → 1 reversal
  // Garbage row:     4, 50, 1, 191, 47, 191 → 4 reversals in 5 transitions
  let totalReversals = 0, totalTransitions = 0
  // Check rows
  for (let r = 0; r < rows; r++) {
    for (let c = 1; c < cols - 1; c++) {
      const d1 = phys[r][c] - phys[r][c - 1]
      const d2 = phys[r][c + 1] - phys[r][c]
      // Only count as reversal if both differences are significant (>0.5% of range)
      const threshold = physRange * 0.005
      if ((d1 > threshold && d2 < -threshold) || (d1 < -threshold && d2 > threshold)) {
        totalReversals++
      }
      totalTransitions++
    }
  }
  // Check columns
  for (let c = 0; c < cols; c++) {
    for (let r = 1; r < rows - 1; r++) {
      const d1 = phys[r][c] - phys[r - 1][c]
      const d2 = phys[r + 1][c] - phys[r][c]
      const threshold = physRange * 0.005
      if ((d1 > threshold && d2 < -threshold) || (d1 < -threshold && d2 > threshold)) {
        totalReversals++
      }
      totalTransitions++
    }
  }
  // Zigzag ratio: 0 = perfectly monotonic, 1 = every cell reverses
  // Real maps: 0.0 - 0.15 (smooth with occasional inflection)
  // Garbage:   0.3 - 0.6+ (random direction changes)
  const zigzagRatio = totalTransitions > 0 ? totalReversals / totalTransitions : 0
  // Hard reject if zigzag is extreme (>35% of transitions reverse)
  if (zigzagRatio > 0.50) return 0.03
  // Soft penalty: scale from 1.0 (no zigzag) to 0.0 (50% zigzag)
  // Relaxed from 0.35 — EDC16 smoke limiters have zigzag ~0.38 due to
  // multi-copy map blocks where cells alternate between copies.
  const zigzagScore = Math.max(0, 1 - zigzagRatio / 0.50)

  // ── 6. Non-triviality: CV and unique values ──
  const mean = sum / total
  let varianceSum = 0
  for (let r = 0; r < rows; r++) { for (let c = 0; c < cols; c++) { varianceSum += (phys[r][c] - mean) ** 2 } }
  const stdDev = Math.sqrt(varianceSum / total)
  const absMean = Math.abs(mean)
  const cv = absMean > 1 ? stdDev / absMean : stdDev

  const uniqueVals = new Set<number>()
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      uniqueVals.add(Math.round(phys[r][c] * 100) / 100)
    }
  }
  const uniqueRatio = uniqueVals.size / total

  // CV scoring: 0→1 (CV < 0.05 → low, CV > 0.3 → full)
  const cvScore = Math.min(1, Math.max(0, (cv - 0.03) / 0.25))
  // Unique ratio scoring: 0→1
  const uniqueScore = Math.min(1, uniqueRatio / 0.20)
  const nonTrivial = Math.max(cvScore, uniqueScore) * 0.7 + Math.min(cvScore, uniqueScore) * 0.3

  // ── Combine all scores ──
  return rangeFrac * smoothness * zigzagScore * nonTrivial
}

// ─── EDC15 0xEA38 marker search ──────────────────────────────────────────────
// When signatures and fixedOffset fail for EDC15, scan the cal region for
// 0xEA38 axis markers and match structurally-found maps to the requested mapDef
// by category-specific value range heuristics.
//
// EDC15 (C167) stores maps in this structure:
//   [0xEA38:u16_LE][X_count:u16_LE][X_axis][sep:u16][Y_count:u16_LE][Y_axis][DATA]
//
// Many EDC15 binaries do NOT contain the ASCII symbol strings (LADSOLL, MENZK, etc.)
// that the signature scanner looks for. The 0xEA38 marker is the only reliable way
// to find maps in these "stripped" ROMs.
//
// Also handles dimension mismatches: mapDef might say 1×8 (from one variant) but
// the real binary has the map as 8×11 or 16×12 (different variant). We match by
// value range, not just dimensions.
function searchEDC15Markers(
  buffer: ArrayBuffer, mapDef: MapDef
): { offset: number; raw: number[][]; phys: number[][]; score: number; actualRows: number; actualCols: number } | null {
  // 0xEA38 format stores all data as uint16 LE. If mapDef says uint8/int8, the real
  // binary may still store it as uint16 in this variant. We try matching with the
  // mapDef's factor applied to uint16 data. If factor is wrong for uint16, the physical
  // values won't match the category range and the map won't be claimed. Safe to try.

  const view = new DataView(buffer)
  const len = buffer.byteLength
  const le = true  // EDC15 C167 is little-endian
  const MARKER = 59960  // 0xEA38

  // EDC15 cal region bounds
  const calStart = len <= 0x100000
    ? Math.floor(len * 0.53) & ~1   // 512KB: ~53%
    : Math.floor(len * 0.60) & ~1   // 1MB: ~60%
  const calEnd = Math.min(
    len <= 0x100000 ? Math.floor(len * 0.78) : Math.floor(len * 0.80),
    len - 32
  )

  // Wider physical ranges per category (broader than PHYS_RANGES to catch EDC15 variants)
  const WIDE: Record<string, { min: number; max: number; minSpread: number }> = {
    boost:    { min: 0,    max: 4500,  minSpread: 300 },   // mbar 0-4500
    fuel:     { min: -5,   max: 200,   minSpread: 10  },   // mg/st (wider than PHYS_RANGES 100)
    torque:   { min: -50,  max: 1000,  minSpread: 50  },   // Nm
    smoke:    { min: -5,   max: 250,   minSpread: 5   },   // mg/st (wider than PHYS_RANGES 50)
    limiter:  { min: 0,    max: 10000, minSpread: 100 },
    emission: { min: -10,  max: 500,   minSpread: 5   },
    ignition: { min: -80,  max: 100,   minSpread: 5   },
    misc:     { min: -5000,max: 10000, minSpread: 10  },
  }
  const wideRange = WIDE[mapDef.category] ?? WIDE.misc

  let bestOffset = -1, bestScore = 0
  let bestRaw: number[][] | null = null, bestPhys: number[][] | null = null
  let bestRows = 0, bestCols = 0

  for (let i = calStart; i < calEnd - 8; i += 2) {
    if (view.getUint16(i, le) !== MARKER) continue

    // Read X axis count
    const xCount = view.getUint16(i + 2, le)
    if (xCount < 2 || xCount > 24) continue

    const xStart = i + 4
    const xEnd = xStart + xCount * 2
    if (xEnd + 4 > len) continue

    // Read X axis — must be monotonically increasing
    const xAxis: number[] = []
    let xOk = true
    for (let j = 0; j < xCount; j++) {
      const v = view.getUint16(xStart + j * 2, le)
      if (j > 0 && v <= xAxis[j - 1]) { xOk = false; break }
      if (v > 50000) { xOk = false; break }
      xAxis.push(v)
    }
    if (!xOk || xAxis.length !== xCount) continue
    if (xAxis[xCount - 1] - xAxis[0] < 50) continue

    // Skip separator word, read Y count
    const yCountOff = xEnd + 2
    if (yCountOff + 2 > len) continue
    const yCount = view.getUint16(yCountOff, le)
    if (yCount < 2 || yCount > 24) continue
    if (xCount * yCount < 8) continue

    const yStart = yCountOff + 2
    const yEnd = yStart + yCount * 2
    if (yEnd > len) continue

    // Read Y axis — must be monotonically increasing
    const yAxis: number[] = []
    let yOk = true
    for (let j = 0; j < yCount; j++) {
      const v = view.getUint16(yStart + j * 2, le)
      if (j > 0 && v <= yAxis[j - 1]) { yOk = false; break }
      if (v > 50000) { yOk = false; break }
      yAxis.push(v)
    }
    if (!yOk || yAxis.length !== yCount) continue

    // Data block follows Y axis
    const dataStart = yEnd
    const dataBytes = xCount * yCount * 2
    if (dataStart + dataBytes > len) continue

    // Read full data block (xCount rows × yCount cols)
    const rows = xCount, cols = yCount
    const raw: number[][] = []
    const phys: number[][] = []
    let ok = true, rMin = Infinity, rMax = -Infinity, pMin = Infinity, pMax = -Infinity
    for (let r = 0; r < rows && ok; r++) {
      const rawRow: number[] = [], physRow: number[] = []
      for (let c = 0; c < cols; c++) {
        const off = dataStart + (r * cols + c) * 2
        if (off + 2 > len) { ok = false; break }
        const rv = view.getUint16(off, le)
        const pv = rv * mapDef.factor + mapDef.offsetVal
        rawRow.push(rv); physRow.push(pv)
        if (rv < rMin) rMin = rv; if (rv > rMax) rMax = rv
        if (pv < pMin) pMin = pv; if (pv > pMax) pMax = pv
      }
      if (ok) { raw.push(rawRow); phys.push(physRow) }
    }
    if (!ok || raw.length !== rows) { i = dataStart + dataBytes - 2; continue }

    // Skip constant/flat data
    if (rMax - rMin < 2) { i = dataStart + dataBytes - 2; continue }

    // Check physical values against wide category range
    let inRange = 0
    const total = rows * cols
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (phys[r][c] >= wideRange.min && phys[r][c] <= wideRange.max) inRange++
      }
    }
    const rangeFrac = inRange / total
    if (rangeFrac < 0.65) { i = dataStart + dataBytes - 2; continue }

    // Physical spread must be meaningful for this category
    const physSpread = pMax - pMin
    if (physSpread < wideRange.minSpread) { i = dataStart + dataBytes - 2; continue }

    // Smoothness check (inline — don't use scoreMapData which has tight PHYS_RANGES)
    const range = rMax - rMin || 1
    let smoothH = 0, smoothV = 0, totalH = 0, totalV = 0
    for (let r = 0; r < rows; r++) {
      for (let c = 1; c < cols; c++) {
        totalH++
        if (Math.abs(raw[r][c] - raw[r][c - 1]) < range * 0.4) smoothH++
      }
    }
    for (let r = 1; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        totalV++
        if (Math.abs(raw[r][c] - raw[r - 1][c]) < range * 0.4) smoothV++
      }
    }
    const smoothness = Math.max(
      totalH > 0 ? smoothH / totalH : 0,
      totalV > 0 ? smoothV / totalV : 0
    )
    if (smoothness < 0.30) { i = dataStart + dataBytes - 2; continue }

    // Dimension match scoring: exact match (possibly transposed) = 1.0, flexible = lower
    let dimScore = 0
    if ((mapDef.rows === rows && mapDef.cols === cols) ||
        (mapDef.rows === cols && mapDef.cols === rows)) {
      dimScore = 1.0
    } else {
      // mapDef is 1D (1×8) but real map is 2D — common in EDC15 variants
      const defCells = mapDef.rows * mapDef.cols
      const actCells = rows * cols
      if (defCells <= 16 && actCells >= 16) {
        dimScore = 0.35  // allow 1D→2D upgrade
      } else {
        const ratio = Math.min(defCells, actCells) / Math.max(defCells, actCells)
        dimScore = ratio * 0.25
      }
    }

    // ClampMax proximity check (same as Kf_ search)
    let clampScore = 0.5
    const stageClamps0 = [mapDef.stage1, mapDef.stage2, mapDef.stage3]
      .filter(s => s && typeof (s as any).clampMax === 'number')
      .map(s => (s as any).clampMax as number)
    if (stageClamps0.length > 0) {
      const maxClamp = Math.max(...stageClamps0)
      const sortedRaw0 = raw.flat().sort((a, b) => a - b)
      const medianRaw0 = sortedRaw0[Math.floor(sortedRaw0.length / 2)]
      if (maxClamp > 0 && medianRaw0 > maxClamp * 2.5) {
        i = dataStart + dataBytes - 2; continue
      }
      clampScore = medianRaw0 <= maxClamp ? 1.0 : Math.max(0, 1 - (medianRaw0 - maxClamp) / maxClamp)
    }

    // Combined score: smoothness + range compliance + dimension match + clampMax proximity
    const totalScore = smoothness * 0.25 + rangeFrac * 0.25 + dimScore * 0.25 + clampScore * 0.25

    if (totalScore > bestScore) {
      bestScore = totalScore; bestOffset = dataStart
      bestRaw = raw; bestPhys = phys
      bestRows = rows; bestCols = cols
    }

    // Skip past this map's data
    i = dataStart + dataBytes - 2
  }

  if (bestOffset < 0 || !bestRaw || !bestPhys) return null
  return { offset: bestOffset, raw: bestRaw, phys: bestPhys, score: bestScore, actualRows: bestRows, actualCols: bestCols }
}

// ─── ME7/ME9 Kf_ inline format search ────────────────────────────────────────
// Bosch ME7/ME9/MED9 store maps in Kf_ inline format:
//   [cols:u16_LE][rows:u16_LE][X_axis: cols×u16_LE][Y_axis: rows×u16_LE][DATA: rows×cols×u16_LE]
//
// extractMap() uses calSearch for these "pointer architecture" ECUs, but calSearch
// fails for most maps because:
//   1. ME7 mapDefs have le:false (BE), but Kf_ data is ACTUALLY little-endian (C167 native)
//      → calSearch reads with wrong endianness → garbage values → rejected
//   2. calStartPct defaults to 0.40 but ME7 cal region starts at ~0.10 (10% of 1MB)
//   3. 1D mapDefs (LDRXN 1×16, MXMOMI 1×8) don't meet calSearch min 4×4 requirement
//   4. Kf_ data starts after header+axes — stride-based scanning misses exact start
//
// Only uint8 maps (like KFLDHBN) work in calSearch because they have no byte order issue.
//
// This function scans the ME7 cal region for Kf_ headers, reads data as LE (matching
// the real format), and matches against the mapDef by category + value range + dimensions.
function searchKfMarkers(
  buffer: ArrayBuffer, mapDef: MapDef
): { offset: number; raw: number[][]; phys: number[][]; score: number; actualRows: number; actualCols: number } | null {
  const view = new DataView(buffer)
  const len = buffer.byteLength
  const le = true  // ME7/ME9 Kf_ data is LE (C167 native byte order, confirmed by scanner)

  // ME7 cal region: scanner finds Kf_ maps from ~10% to ~65% of 1MB files
  // For smaller files (512KB), use 10% to 80%
  const calStart = Math.floor(len * 0.08) & ~1
  const calEnd = Math.min(Math.floor(len * 0.70), len - 32)

  // Wider physical ranges per category for ME7
  const WIDE: Record<string, { min: number; max: number; minSpread: number }> = {
    boost:    { min: -1,   max: 200,   minSpread: 5   },   // % load (factor 0.023438)
    fuel:     { min: -5,   max: 500,   minSpread: 5   },   // various units
    torque:   { min: -100, max: 2000,  minSpread: 5   },   // Nm or % load
    smoke:    { min: -5,   max: 300,   minSpread: 5   },
    limiter:  { min: 0,    max: 10000, minSpread: 100 },
    emission: { min: -10,  max: 500,   minSpread: 5   },
    ignition: { min: -60,  max: 80,    minSpread: 3   },   // °BTDC (int8 × 0.75)
    misc:     { min: -5000,max: 10000, minSpread: 5   },
  }
  const wideRange = WIDE[mapDef.category] ?? WIDE.misc

  let bestOffset = -1, bestScore = 0
  let bestRaw: number[][] | null = null, bestPhys: number[][] | null = null
  let bestRows = 0, bestCols = 0

  for (let i = calStart; i <= calEnd - 8; i += 2) {
    const d0 = view.getUint16(i, le)      // cols
    const d1 = view.getUint16(i + 2, le)  // rows

    // Valid Kf_ dimension range
    if (d0 < 3 || d0 > 24 || d1 < 3 || d1 > 24) continue
    if (d0 * d1 < 9) continue  // at least 3×3

    const cols = d0, rows = d1
    const xStart = i + 4
    const yStart = xStart + cols * 2
    const dataStart = yStart + rows * 2
    const dataBytes = rows * cols * 2
    if (dataStart + dataBytes > len) continue

    // Validate X axis — monotonically increasing
    const xAxis: number[] = []
    let xOk = true
    for (let j = 0; j < cols; j++) {
      const v = view.getUint16(xStart + j * 2, le)
      if (j > 0 && v <= xAxis[j - 1]) { xOk = false; break }
      if (v > 50000) { xOk = false; break }
      xAxis.push(v)
    }
    if (!xOk || xAxis.length !== cols) continue

    // Validate Y axis — monotonically increasing
    const yAxis: number[] = []
    let yOk = true
    for (let j = 0; j < rows; j++) {
      const v = view.getUint16(yStart + j * 2, le)
      if (j > 0 && v <= yAxis[j - 1]) { yOk = false; break }
      if (v > 50000) { yOk = false; break }
      yAxis.push(v)
    }
    if (!yOk || yAxis.length !== rows) continue

    // Axis span checks
    if (xAxis[cols - 1] - xAxis[0] < 20) continue
    if (yAxis[rows - 1] - yAxis[0] < 5) continue

    // At least one axis should have engine-range values
    const maxAxisVal = Math.max(xAxis[cols - 1], yAxis[rows - 1])
    if (maxAxisVal < 200) continue

    // Read data block (rows × cols, all uint16 LE)
    const raw: number[][] = []
    const phys: number[][] = []
    let ok = true, pMin = Infinity, pMax = -Infinity, rMin = Infinity, rMax = -Infinity
    for (let r = 0; r < rows && ok; r++) {
      const rawRow: number[] = [], physRow: number[] = []
      for (let c = 0; c < cols; c++) {
        const off = dataStart + (r * cols + c) * 2
        if (off + 2 > len) { ok = false; break }
        const rv = view.getUint16(off, le)
        const pv = rv * mapDef.factor + mapDef.offsetVal
        rawRow.push(rv); physRow.push(pv)
        if (rv < rMin) rMin = rv; if (rv > rMax) rMax = rv
        if (pv < pMin) pMin = pv; if (pv > pMax) pMax = pv
      }
      if (ok) { raw.push(rawRow); phys.push(physRow) }
    }
    if (!ok || raw.length !== rows) { i = dataStart + dataBytes - 2; continue }

    // Skip flat data
    if (rMax - rMin < 2) { i = dataStart + dataBytes - 2; continue }

    // Physical values must fit the category
    let inRange = 0
    const total = rows * cols
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (phys[r][c] >= wideRange.min && phys[r][c] <= wideRange.max) inRange++
      }
    }
    const rangeFrac = inRange / total
    if (rangeFrac < 0.60) { i = dataStart + dataBytes - 2; continue }

    const physSpread = pMax - pMin
    if (physSpread < wideRange.minSpread) { i = dataStart + dataBytes - 2; continue }

    // Smoothness check
    const range = rMax - rMin || 1
    let smoothH = 0, smoothV = 0, totalH = 0, totalV = 0
    for (let r = 0; r < rows; r++) {
      for (let c = 1; c < cols; c++) {
        totalH++
        if (Math.abs(raw[r][c] - raw[r][c - 1]) < range * 0.4) smoothH++
      }
    }
    for (let r = 1; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        totalV++
        if (Math.abs(raw[r][c] - raw[r - 1][c]) < range * 0.4) smoothV++
      }
    }
    const smoothness = Math.max(
      totalH > 0 ? smoothH / totalH : 0,
      totalV > 0 ? smoothV / totalV : 0
    )
    if (smoothness < 0.25) { i = dataStart + dataBytes - 2; continue }

    // Dimension match scoring
    let dimScore = 0
    if ((mapDef.rows === rows && mapDef.cols === cols) ||
        (mapDef.rows === cols && mapDef.cols === rows)) {
      dimScore = 1.0
    } else {
      const defCells = mapDef.rows * mapDef.cols
      const actCells = rows * cols
      if (defCells <= 16 && actCells >= 8) {
        dimScore = 0.35  // 1D→2D upgrade
      } else {
        const ratio = Math.min(defCells, actCells) / Math.max(defCells, actCells)
        dimScore = ratio * 0.25
      }
    }

    // ClampMax proximity: if the mapDef has stage clampMax, the data's raw values
    // should be in a reasonable range relative to it. Maps whose raw values far exceed
    // the expected operational max are wrong matches (e.g., raw 12000 for a map with
    // clampMax 5000 means phys values are 2.4× the tuned ceiling — not this map).
    let clampScore = 0.5  // neutral if no clampMax available
    const stageClamps = [mapDef.stage1, mapDef.stage2, mapDef.stage3]
      .filter(s => s && typeof (s as any).clampMax === 'number')
      .map(s => (s as any).clampMax as number)
    if (stageClamps.length > 0) {
      const maxClamp = Math.max(...stageClamps)
      // Expected operational raw max: clampMax is the ceiling after tuning.
      // Stock raw values should be below clampMax. If median raw > 2× clampMax,
      // this is almost certainly the wrong map.
      const sortedRaw = raw.flat().sort((a, b) => a - b)
      const medianRaw = sortedRaw[Math.floor(sortedRaw.length / 2)]
      if (maxClamp > 0 && medianRaw > maxClamp * 2.5) {
        // Way too high — skip this match entirely
        i = dataStart + dataBytes - 2; continue
      }
      // Score: 1.0 if median is below clampMax, drops as it exceeds
      clampScore = medianRaw <= maxClamp ? 1.0 : Math.max(0, 1 - (medianRaw - maxClamp) / maxClamp)
    }

    const totalScore = smoothness * 0.25 + rangeFrac * 0.25 + dimScore * 0.25 + clampScore * 0.25

    if (totalScore > bestScore) {
      bestScore = totalScore; bestOffset = dataStart
      bestRaw = raw; bestPhys = phys
      bestRows = rows; bestCols = cols
    }

    i = dataStart + dataBytes - 2
  }

  if (bestOffset < 0 || !bestRaw || !bestPhys) return null
  return { offset: bestOffset, raw: bestRaw, phys: bestPhys, score: bestScore, actualRows: bestRows, actualCols: bestCols }
}

// ─── Cal-region smart search (optimised) ──────────────────────────────────────
// Searches the calibration region for data blocks matching a MapDef.
// FAST: checks first row only as quick filter, then scores full block on hits.
// Only used for 2D maps (≥4 rows × ≥4 cols) to avoid false positives.
function searchCalRegion(
  buffer: ArrayBuffer, mapDef: MapDef, family: string
): { offset: number; raw: number[][]; phys: number[][]; score: number } | null {
  const view = new DataView(buffer)
  const len = buffer.byteLength
  const elSize = dtypeSize(mapDef.dtype)
  const blockBytes = mapDef.rows * mapDef.cols * elSize
  const cells = mapDef.rows * mapDef.cols

  // Skip 1D maps and tiny maps — too many false positives
  if (mapDef.rows < 4 || mapDef.cols < 4 || cells < 32) return null

  const fam = family.toUpperCase()
  let calStartPct = 0.40
  if (fam.includes('EDC16')) calStartPct = 0.78
  // MED17.5 StageX mappack: boost at 0x4FE0C (24%), ignition at 0x5F32E (29%), torque at 0x40346 (12%).
  // Previous 0.72 missed ALL maps in MED17.5 2MB files. Cal region starts at ~12% for this family.
  else if (fam.includes('MED17') || fam.includes('MEVD17')) calStartPct = len >= 0x400000 ? 0.50 : 0.10
  // EDC17C46 StageX: SOI at 0x26C0E (15%), boost at ~25%, gearbox at 0x7E2xx (50%).
  // Previous 0.65 missed ALL SOI and boost maps. Cal region starts at ~10% for EDC17.
  else if (fam.includes('EDC17')) calStartPct = 0.10
  else if (fam.includes('EDC15')) calStartPct = 0.45
  else if (fam.includes('ME7') || fam.includes('ME9') || fam.includes('MED9')) calStartPct = 0.08
  const calStart = Math.floor(len * calStartPct) & ~1
  const calEnd = len - blockBytes

  const range = PHYS_RANGES[mapDef.category] ?? PHYS_RANGES.misc
  let bestOffset = -1, bestScore = 0
  let bestRaw: number[][] | null = null, bestPhys: number[][] | null = null

  // Step size: 4 bytes balances coverage vs speed.
  // stride=16 missed maps (alignment issues), stride=2 was too slow (Preview froze).
  // stride=4 catches all 4-byte-aligned maps (standard Bosch alignment) while
  // scanning 4× faster than stride=2. Maps at odd 2-byte alignments are rare.
  const stride = 4

  for (let pos = calStart; pos <= calEnd; pos += stride) {
    // Quick reject: check first 4 values of first row
    let bail = false
    for (let c = 0; c < Math.min(4, mapDef.cols); c++) {
      const rv = readVal(view, pos + c * elSize, mapDef.dtype, mapDef.le)
      const pv = rv * mapDef.factor + mapDef.offsetVal
      if (pv < range.min || pv > range.max) { bail = true; break }
    }
    if (bail) continue

    // Check last row too (quick cross-check)
    const lastRowOff = pos + (mapDef.rows - 1) * mapDef.cols * elSize
    if (lastRowOff + elSize <= len) {
      const rv = readVal(view, lastRowOff, mapDef.dtype, mapDef.le)
      const pv = rv * mapDef.factor + mapDef.offsetVal
      if (pv < range.min || pv > range.max) continue
    }

    // Read full block and score
    const raw: number[][] = [], phys: number[][] = []
    let ok = true
    for (let r = 0; r < mapDef.rows && ok; r++) {
      const rawRow: number[] = [], physRow: number[] = []
      for (let c = 0; c < mapDef.cols; c++) {
        const off = pos + (r * mapDef.cols + c) * elSize
        if (off + elSize > len) { ok = false; break }
        const rv = readVal(view, off, mapDef.dtype, mapDef.le)
        const pv = rv * mapDef.factor + mapDef.offsetVal
        // Early bail if value way out of range
        if (pv < range.min - 10 || pv > range.max + 10) { ok = false; break }
        rawRow.push(rv); physRow.push(pv)
      }
      if (ok) { raw.push(rawRow); phys.push(physRow) }
    }
    if (!ok || raw.length !== mapDef.rows) continue

    const score = scoreMapData(phys, mapDef.category)
    if (score > bestScore && score > 0.10) {
      bestScore = score; bestOffset = pos; bestRaw = raw; bestPhys = phys
    }
  }

  if (bestOffset < 0 || !bestRaw || !bestPhys) return null
  return { offset: bestOffset, raw: bestRaw, phys: bestPhys, score: bestScore }
}

// ─── Extract a single map ─────────────────────────────────────────────────────
export function extractMap(buffer: ArrayBuffer, mapDef: MapDef, ecuFamily?: string): ExtractedMap {
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  const elSize = dtypeSize(mapDef.dtype)

  const readAt = (pos: number, rows = mapDef.rows, cols = mapDef.cols) => {
    const needed = rows * cols * elSize
    if (pos < 0 || pos + needed > buffer.byteLength) return null
    const raw: number[][] = []
    const phys: number[][] = []
    for (let r = 0; r < rows; r++) {
      raw.push([])
      phys.push([])
      for (let c = 0; c < cols; c++) {
        const rawVal = readVal(view, pos + (r * cols + c) * elSize, mapDef.dtype, mapDef.le)
        raw[r].push(rawVal)
        phys[r].push(rawVal * mapDef.factor + mapDef.offsetVal)
      }
    }
    return { raw, phys }
  }

  // All ECUs: try signature → fixedOffset → calSearch (same path for everyone).
  // The Remap Builder works by finding maps via their signature byte patterns in the binary.
  // This was working correctly for EDC16, ME7, MED17, EDC17 before pointer-arch changes broke it.
  const fam = (ecuFamily ?? '').toUpperCase()
  {
    // Signature search — primary method, works for all ECU families
    for (const sig of mapDef.signatures) {
      // matchIndex support: when a signature matches multiple locations (e.g. two consecutive
      // 8×8 maps with identical headers), skip to the Nth match (0-based, default 0 = first).
      const targetMatch = mapDef.matchIndex ?? 0
      let pos = -1
      let searchFrom = 0
      for (let m = 0; m <= targetMatch; m++) {
        pos = findSignature(bytes, sig, searchFrom)
        if (pos === -1) break
        if (m < targetMatch) searchFrom = pos  // pos is after sig, so next search won't re-find it
      }
      if (pos === -1) continue

      // Kf_ header auto-detection: Bosch Kennfeld inline format starts with
      // [cols:u16, rows:u16, X_axis(cols×u16), Y_axis(rows×u16), DATA...].
      // When detected, sigOffset is ignored — dataPos is calculated from the header dims.
      // Actual dimensions from the header override mapDef.rows/cols, handling variants
      // with different map sizes than the definition default.
      //
      // Two endiannesses:
      //   BE (MED9.1, ME7): sig starts with 0x00 (high byte of cols < 256)
      //   LE (EDC17, EDC16 LE): sig[1] === 0x00 (high byte of cols in second position)
      // ASCII sigs (0x41+) skip Kf_ detection entirely — they use sigOffset.
      //
      // IMPORTANT: findSignature returns position AFTER the sig. The signature bytes
      // ARE the start of the Kf_ header, so we read from headerPos = pos - sig.length.
      let kfDetected = false
      let kfCols = 0, kfRows = 0
      const headerPos = pos - sig.length
      if (sig.length >= 4 && headerPos >= 0) {
        // Big-endian Kf_ header (MED9.1, ME7) — sig[0] === 0x00
        if (sig[0] === 0x00) {
          kfCols = (bytes[headerPos] << 8) | bytes[headerPos + 1]
          kfRows = (bytes[headerPos + 2] << 8) | bytes[headerPos + 3]
          if (kfCols >= 2 && kfCols <= 25 && kfRows >= 2 && kfRows <= 25) {
            kfDetected = true
          }
        }
        // Little-endian Kf_ header (EDC17 C46, stripped variants) — sig[1] === 0x00
        if (!kfDetected && sig[1] === 0x00 && sig[0] >= 2 && sig[0] <= 25) {
          kfCols = bytes[headerPos] | (bytes[headerPos + 1] << 8)
          kfRows = bytes[headerPos + 2] | (bytes[headerPos + 3] << 8)
          if (kfCols >= 2 && kfCols <= 25 && kfRows >= 2 && kfRows <= 25) {
            kfDetected = true
          }
        }
      }

      let dataPos: number, actualRows: number, actualCols: number
      if (kfDetected) {
        actualCols = kfCols
        actualRows = kfRows
        dataPos = headerPos + 4 + kfCols * 2 + kfRows * 2
      } else {
        actualCols = mapDef.cols
        actualRows = mapDef.rows
        dataPos = pos + mapDef.sigOffset
      }

      const result = readAt(dataPos, actualRows, actualCols)
      if (!result) continue
      const quality = scoreMapData(result.phys, mapDef.category)
      // minQuality <= 0 bypasses quality check entirely (for flat maps like torque monitor)
      const minQ = mapDef.minQuality ?? 0.15
      if (minQ <= 0 || quality > minQ) {
        const actualMapDef = (kfDetected && (actualRows !== mapDef.rows || actualCols !== mapDef.cols))
          ? { ...mapDef, rows: actualRows, cols: actualCols }
          : mapDef
        return { mapDef: actualMapDef, data: result.phys, rawData: result.raw, offset: dataPos, found: true, source: 'signature', quality }
      }
    }

    // fixedOffset fallback
    if (mapDef.fixedOffset !== undefined && mapDef.fixedOffset >= 0) {
      const result = readAt(mapDef.fixedOffset)
      if (result) {
        const quality = scoreMapData(result.phys, mapDef.category)
        const minQ = mapDef.minQuality ?? 0.15
        if (minQ <= 0 || quality > minQ) {
          return { mapDef, data: result.phys, rawData: result.raw, offset: mapDef.fixedOffset, found: true, source: 'fixedOffset', quality }
        }
      }
    }

    // Cal-region smart search as final fallback for non-pointer ECUs too.
    // skipCalSearch:true — explicit opt-out for mapDefs where a false-positive calSearch
    // match would be worse than "Not Found" (e.g. C46 stripped variants where the generic
    // IQ/Lambda maps don't exist and calSearch picks up axis-breakpoint regions as data).
    if (ecuFamily && mapDef.rows >= 4 && mapDef.cols >= 4 && !mapDef.skipCalSearch) {
      const found = searchCalRegion(buffer, mapDef, ecuFamily)
      if (found) {
        return { mapDef, data: found.phys, rawData: found.raw, offset: found.offset, found: true, source: 'calSearch', quality: found.score }
      }
    }

    // EDC15 0xEA38 marker search — catches maps that signatures/fixedOffset/calSearch all miss.
    // Many EDC15 binaries have NO ASCII symbol strings (MENZK, MXMOM, LSMK, SDATF, LADSOLL).
    // The 0xEA38 axis marker is the only reliable structural format in these "stripped" ROMs.
    // Also handles dimension mismatches: mapDef may say 1×8 but real map is 8×11 in this variant.
    if (fam.includes('EDC15')) {
      const markerResult = searchEDC15Markers(buffer, mapDef)
      if (markerResult) {
        // Build a modified mapDef with actual dimensions from the marker scan
        // so the grid displays correctly AND write-back uses the correct block size.
        const actualMapDef: MapDef = {
          ...mapDef,
          rows: markerResult.actualRows,
          cols: markerResult.actualCols,
          dtype: 'uint16',   // 0xEA38 format is always uint16
          le: true,          // EDC15 C167 is always LE
        }
        return {
          mapDef: actualMapDef,
          data: markerResult.phys,
          rawData: markerResult.raw,
          offset: markerResult.offset,
          found: true,
          source: 'calSearch',
          quality: markerResult.score,
        }
      }
    }
  }

  // Not found — return zeroed placeholder
  const empty = Array.from({ length: mapDef.rows }, () => Array(mapDef.cols).fill(0))
  return { mapDef, data: empty, rawData: empty, offset: -1, found: false, source: 'none' }
}

// ─── Extract all maps for an ECU ─────────────────────────────────────────────
// Tracks used offsets to prevent multiple mapDefs from claiming the same data block.
// Without deduplication, 3+ maps writing to the same offset corrupt each other's data.
// Critical maps get priority (processed first) so they claim the best offsets.
export function extractAllMaps(buffer: ArrayBuffer, ecuDef: EcuDef): ExtractedMap[] {
  // Sort: critical maps first, then by map index for stability
  const indexed = ecuDef.maps.map((m, i) => ({ m, i }))
  indexed.sort((a, b) => {
    if (a.m.critical && !b.m.critical) return -1
    if (!a.m.critical && b.m.critical) return 1
    return a.i - b.i
  })

  const usedOffsets = new Set<number>()
  const results: ExtractedMap[] = new Array(ecuDef.maps.length)

  for (const { m, i } of indexed) {
    const result = extractMap(buffer, m, ecuDef.family)
    if (result.found && result.offset >= 0) {
      if (usedOffsets.has(result.offset)) {
        // Offset already claimed by another map — mark as not found to prevent corruption
        const empty = Array.from({ length: m.rows }, () => Array(m.cols).fill(0))
        results[i] = { mapDef: m, data: empty, rawData: empty, offset: -1, found: false, source: 'none' }
      } else {
        usedOffsets.add(result.offset)
        results[i] = result
      }
    } else {
      results[i] = result
    }
  }

  return results
}

// ─── Write value to buffer ────────────────────────────────────────────────────
function writeVal(view: DataView, offset: number, value: number, dtype: DataType, le: boolean): void {
  const clamped = Math.round(value)
  switch (dtype) {
    case 'uint8':   view.setUint8(offset, Math.max(0, Math.min(255, clamped))); break
    case 'int8':    view.setInt8(offset, Math.max(-128, Math.min(127, clamped))); break
    case 'uint16':  view.setUint16(offset, Math.max(0, Math.min(65535, clamped)), le); break
    case 'int16':   view.setInt16(offset, Math.max(-32768, Math.min(32767, clamped)), le); break
    case 'float32': view.setFloat32(offset, value, le); break
  }
}

// ─── A2L address validation ────────────────────────────────────────────────────
// Validates whether A2L map addresses point to real data in the binary by checking
// if sample physical values fall within the map's declared min/max range.
// This is the safety gate: only maps with status 'valid' should be written to.

export interface A2LValidationResult {
  map: A2LMapDef
  status: 'valid' | 'uncertain' | 'invalid' | 'outofrange'
  confidence: number      // 0–1, fraction of sample values within physical range
  sampleValues: number[]  // physical values sampled from the binary at this address
  signature: number[]     // up to 12 bytes immediately before the map in the binary
}

export function validateA2LMapsInBinary(
  buffer: ArrayBuffer,
  maps: A2LMapDef[]
): A2LValidationResult[] {
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)

  return maps.map(map => {
    const dtype = map.dataType as DataType
    const elSize = dtypeSize(dtype)
    const totalBytes = map.rows * map.cols * elSize

    // Address out of file bounds
    if (map.fileOffset < 0 || map.fileOffset + totalBytes > buffer.byteLength) {
      return { map, status: 'outofrange', confidence: 0, sampleValues: [], signature: [] }
    }

    // Sample up to 16 values spread across the map
    // BUG FIX D1: use map.le (set by extractMapsFromA2L from the ECU family) instead of
    // hardcoded true. ME7/EDC15/SID are big-endian — reading them as LE produces garbage
    // values that fail range checks, causing correct addresses to be marked 'invalid'.
    const mapLE = map.le ?? true  // default LE for unknown/TriCore families
    const total = map.rows * map.cols
    const stride = Math.max(1, Math.floor(total / 16))
    const sampleValues: number[] = []
    for (let i = 0; i < total; i += stride) {
      const raw = readVal(view, map.fileOffset + i * elSize, dtype, mapLE)
      sampleValues.push(raw * map.factor + map.physicalOffset)
    }

    // Detect erased flash (all 0xFF or 0xFFFF) or blank (all zero)
    const allFF = sampleValues.every(v => {
      const raw = map.factor !== 0 ? (v - map.physicalOffset) / map.factor : 0
      return Math.abs(raw - 255) < 2 || Math.abs(raw - 65535) < 2
    })
    const allZero = sampleValues.every(v => Math.abs(v) < 0.0001)

    // Fraction of samples within the declared physical range (±15% tolerance)
    // BUG FIX D3: when min=0 and max=0 (undeclared range in A2L), skip range check entirely
    // rather than letting everything within ±1 of zero score as valid.
    const rangeSpan = map.max - map.min
    let confidence = 0
    if (rangeSpan === 0 && map.min === 0 && map.max === 0) {
      // No range declared — mark uncertain, don't try to validate
      confidence = 0.5
    } else {
      const tol = rangeSpan > 0 ? rangeSpan * 0.15 : Math.abs(map.max) * 0.15 + Math.abs(map.min) * 0.15 + 1
      const inRangeCount = sampleValues.filter(
        v => v >= map.min - tol && v <= map.max + tol
      ).length
      confidence = sampleValues.length > 0 ? inRangeCount / sampleValues.length : 0
    }

    // Extract 12-byte signature immediately before the map
    const sigStart = Math.max(0, map.fileOffset - 12)
    const signature = Array.from(bytes.slice(sigStart, map.fileOffset))

    let status: A2LValidationResult['status']
    if (allFF || allZero)       status = 'uncertain'
    else if (confidence >= 0.70) status = 'valid'
    else if (confidence >= 0.35) status = 'uncertain'
    else                         status = 'invalid'

    return { map, status, confidence, sampleValues, signature }
  })
}

// ─── Build a MapDef from a validated A2L map ────────────────────────────────
// Creates a synthetic MapDef that uses the A2L's exact file offset (fixedOffset)
// instead of signature searching. Stage params and metadata are inherited from
// the matching ecuDefinitions MapDef so the remap engine still applies correctly.
export function syntheticMapDefFromA2L(a2lMap: A2LMapDef, baseDef: MapDef): MapDef {
  return {
    ...baseDef,
    rows:       a2lMap.rows,
    cols:       a2lMap.cols,
    dtype:      a2lMap.dataType as DataType,
    // BUG FIX E1: use the A2L-derived endianness (set by extractMapsFromA2L from BIG_ENDIAN_FAMILIES).
    // EDC16 (PowerPC MPC5565) is big-endian — a2lMap.le = false.  Using baseDef.le (= true in ecuDef)
    // caused display to read LE while validation read BE, producing wildly wrong physical values
    // (e.g. 1800 hPa boost → −6141 instead of 1.8 bar).  Both paths must use the same byte order.
    le:         a2lMap.le,
    // Use ecuDef factor/offsetVal, NOT the A2L file's values.
    // A2L factor conventions vary wildly between vendors (e.g. KFMIRL A2L factor ≈ 655 vs
    // ecuDef 0.023438 — a 28,000× difference). The remap params (multiplier, clampMax, addend)
    // are all calibrated against ecuDef factor. Using A2L factor breaks the display (shows
    // 2,796,160 % instead of 100 %) and corrupts clampMax enforcement in the preview.
    // The A2L contribution here is the file address only — let ecuDef handle the scaling.
    factor:     baseDef.factor,
    offsetVal:  baseDef.offsetVal,
    signatures: [],    // skip signature search
    sigOffset:  0,
    fixedOffset: a2lMap.fileOffset,  // go directly to validated address
  }
}

// ─── Build a MapDef from a DRT map ──────────────────────────────────────────
// DRT files provide direct file offsets, dimensions, AND scaling (factor/physicalOffset).
// Use DRT scaling for correct physical display; keep ecuDef for metadata/remap params only.
export function syntheticMapDefFromDRT(
  drtMap: { fileOffset: number; rows: number; cols: number; dataType: string; factor: number; physicalOffset: number },
  baseDef: MapDef
): MapDef {
  return {
    ...baseDef,                          // keep ecuDef metadata (name, category, remap params)
    rows:        drtMap.rows,
    cols:        drtMap.cols,
    dtype:       drtMap.dataType as DataType,
    // Use ecuDef factor/offsetVal, NOT DRT-supplied scaling.
    // DRT factor conventions differ from ecuDef: using DRT values causes the same display
    // corruption as A2L factor mismatch (e.g. MXMOMI showing 0.4 Nm instead of ~300 Nm).
    // Remap params (multiplier, clampMax, addend) are calibrated against ecuDef factor.
    // DRT contribution here is file address + dimensions only.
    factor:      baseDef.factor,
    offsetVal:   baseDef.offsetVal,
    le:          baseDef.le,  // inherit endianness from ecuDefinitions — big-endian ECUs (ME7, SID, MS43) use le:false
    signatures:  [],
    sigOffset:   0,
    fixedOffset: drtMap.fileOffset,      // DRT-supplied file offset
  }
}

// ─── Build a MapDef from a DAMOS signature-scan match ─────────────────────────
// Creates a stage-editable MapDef for a map discovered by the signature scanner
// but not present in the curated ecuDefinitions. Factor defaults to 1.0 (raw
// uint16 display) because the scanner only knows the 24-byte signature, not the
// physical scaling. User can still apply uniform multipliers / zone edits and
// write values back to the binary — the output is simply raw-value based rather
// than physical-unit based (+10% of raw 26150 → 28765).
export interface SignatureMatch {
  name: string
  family: string
  offset: number
  rows: number
  cols: number
  type: 'MAP' | 'CURVE' | 'VALUE' | 'VAL_BLK'
  desc: string
  portable: boolean
  factor?: number
  offsetVal?: number
  unit?: string
  scalingVerified?: boolean
  // v7: verified dtype + data offset within record (from RECORD_LAYOUT cross-pair consensus)
  dtype?: 'uint8' | 'int8' | 'uint16' | 'int16' | 'uint32' | 'int32' | 'float32'
  dataOffset?: number
}

// v3.11.8: physical units restored, but now VERIFIED from A2L COMPU_METHOD blocks
// across multiple training pairs. When the scanner provides match.factor and the
// scaling was confirmed in ≥2 binaries (match.scalingVerified), we use it directly.
// Otherwise we fall back to raw uint16 display (factor=1) — no guessing.
//
// The COMPU_METHOD extraction uses Bosch/Continental INVERSE convention: the RAT_FUNC
// coefficients in the A2L describe raw-as-function-of-physical, so we invert to get
// physical-as-function-of-raw. Verified against known-value maps across PPD1, SIMOS18,
// EDC17C46 — PPD1 map0883 MAP Limiter → 0.083 hPa/raw (raw 32768 → 2717 hPa = 2.72 bar
// absolute, matches Stage 1 tune ceiling).

export function syntheticMapDefFromSignature(match: SignatureMatch): MapDef {
  // Big-endian for older Bosch (EDC16/17, ME7, SIMOS 8/12/16). Little-endian for MED17, MG1,
  // SIMOS 18, PPD1. Matches the decoding we do in the sig-scan heatmap preview.
  const BE_FAMILIES = new Set(['EDC15', 'EDC16', 'EDC16U', 'EDC17', 'EDC17C46', 'EDC17C64', 'ME7', 'SIMOS8', 'SIMOS12', 'SIMOS16'])
  const isBE = BE_FAMILIES.has(match.family.toUpperCase())

  // Use the verified scaling from the catalog when available (factor confirmed by
  // ≥2 training pairs agreeing). Otherwise fall back to raw uint16 (factor=1) rather
  // than guessing — honest raw display beats wrong-by-2x physical values.
  const scaling = (match.scalingVerified && match.factor !== undefined && isFinite(match.factor))
    ? { factor: match.factor, offsetVal: match.offsetVal ?? 0, unit: match.unit ?? '' }
    : null

  // Category heuristic — name first, description fallback. Purely cosmetic (colored badge)
  // but also drives the stage default multipliers below, so worth getting right.
  const n = match.name.toLowerCase()
  const d = match.desc.toLowerCase()
  let category: MapCategory = 'misc'
  if (/boost|map_sp|map_lim|turbo|tcha|prs_boost|pv_grd|charger/.test(n) || /boost|turbo|charger|map.?lim|precontrol|n75/.test(d)) category = 'boost'
  else if (/smoke|rauch|soot/.test(n) || /smoke|rauch|soot/.test(d)) category = 'smoke'
  else if (/tqi|torque|trq|tq_lim|pow_max|drivers?.?wish|driver.?req/.test(n) || /torque|torq|drivers?.?wish|pedal.?map/.test(d)) category = 'torque'
  else if (/iga|igni|spark|knk|knock|soi|ang_inj/.test(n) || /ignition|spark|knock|timing|soi/.test(d)) category = 'ignition'
  else if (/\binj\b|iq_|mff|mf_|fuel|rail|maf_|quant|menge|t_close|t_doi/.test(n) || /inject|fuel|rail|quantity|menge/.test(d)) category = 'fuel'
  else if (/lim|max_|min_|ceil/.test(n) || /limit|ceiling/.test(d)) category = 'limiter'
  else if (/egr|dpf|sa_|lamb|lnt|urea|adblue|regen|rgn/.test(n) || /egr|dpf|lambda|catalyst|nox|regen/.test(d)) category = 'emission'
  // "Pressure" alone lands in boost — most pressure maps in an ECU are manifold/rail pressure, which behave like boost.
  else if (/prs_|press|_sp_/.test(n) || /pressure|druck/.test(d)) category = 'boost'

  // Category-driven default stage multipliers. Torque/fuel/boost get mild positive bumps —
  // still conservative (user dials up from here); misc/limiter/emission/ignition start at 0%
  // because blindly scaling those by a fixed % is almost always wrong. Values calibrated
  // against typical diesel/petrol Stage 1/2/3 gains so the defaults land somewhere sensible
  // instead of overshooting — user can always crank higher.
  // v3.11.16: Multipliers calibrated against real-world Stage 1/2/3 shop norms for VAG diesels:
  //   • Golf 1.9/2.0 TDI 105-140 HP:  Stage 1 = +30 HP / +70 Nm (≈ +25-30% power)
  //   • Stage 2 = +45-55 HP (requires DPF/EGR addons or hardware)
  //   • Stage 3 = full tune with hardware mods
  // Previous values (1.06/1.08/1.10 for Stage 1) produced output averaging +6-8% which is
  // unusably conservative — real Stage 1 moves peak boost +15-20%, peak fuel +18-25%,
  // torque ceiling +25-30%. These new values produce realistic Stage output on first click;
  // user can still dial down per-map via the manual editor for conservative street tunes.
  // Smoke limiter needs to rise more than fuel (else it caps the fuel increase) — hence
  // the bigger step on smoke category.
  let stage1Mul = 1, stage2Mul = 1, stage3Mul = 1
  if (category === 'torque')       { stage1Mul = 1.22; stage2Mul = 1.35; stage3Mul = 1.50 }
  else if (category === 'fuel')    { stage1Mul = 1.18; stage2Mul = 1.30; stage3Mul = 1.42 }
  else if (category === 'boost')   { stage1Mul = 1.15; stage2Mul = 1.25; stage3Mul = 1.35 }
  else if (category === 'smoke')   { stage1Mul = 1.25; stage2Mul = 1.40; stage3Mul = 1.55 }

  // v3.11.14: physical-unit safety clamps. If the catalog gave us a verified factor+unit,
  // we translate a category-specific physical ceiling (e.g. boost ≤ 3000 hPa, fuel ≤ 120 mg/stk)
  // into a raw-storage clamp. This protects against the multiplier pushing a map past a safe
  // physical limit — even on Stage 3, boost can't exceed 3 bar abs, fuel can't exceed 120 mg/stk.
  // Without verified scaling we apply no clamp (fall back to multiplier only, matches pre-v3.11.14).
  const physClamps = scaling ? getPhysicalClamps(category, scaling.unit) : undefined
  const rawClamps  = physicalToRawClamps(physClamps, scaling?.factor, scaling?.offsetVal, match.dtype ?? 'uint16')

  const id = `sig_${match.family}_${match.offset.toString(16)}_${match.name.replace(/[^a-z0-9_]/gi, '_')}`.slice(0, 120)

  // Generic numbered axis values so the Zone Editor has something to label with.
  // The real axis breakpoints live in the binary at nearby offsets (Kf_ header) but sig-scan
  // doesn't parse those — sequential indexes beat blank/undefined axis labels.
  const axisXValues = Array.from({ length: match.cols }, (_, i) => i)
  const axisYValues = Array.from({ length: match.rows }, (_, i) => i)

  return {
    id,
    name: match.name,
    category,
    desc: match.desc || match.name,
    signatures: [],
    sigOffset: 0,
    // v7: if the A2L record has embedded axes (NO_AXIS_PTS headers + AXIS_PTS values),
    // dataOffset tells us how many bytes to skip past that header to reach the actual
    // data cells. Most Bosch/Continental A2Ls use separate axis tables (dataOffset=0)
    // so this is typically 0.
    fixedOffset: match.offset + (match.dataOffset ?? 0),
    rows: match.rows,
    cols: match.cols,
    // v7: prefer verified dtype from A2L RECORD_LAYOUT; fall back to uint16 only
    // when unknown. ME7 often uses UBYTE/SBYTE for small-range values — decoding
    // those as uint16 produced garbage (e.g. factor=10 RPM with raw uint8=50
    // should give 500 RPM, but uint16 decode gives 128000 RPM).
    dtype: match.dtype ?? 'uint16',
    le: !isBE,
    factor: scaling?.factor ?? 1,
    offsetVal: scaling?.offsetVal ?? 0,
    unit: scaling?.unit ?? '',
    stage1: { multiplier: stage1Mul, clampMax: rawClamps.clampMax, clampMin: rawClamps.clampMin },
    stage2: { multiplier: stage2Mul, clampMax: rawClamps.clampMax, clampMin: rawClamps.clampMin },
    stage3: { multiplier: stage3Mul, clampMax: rawClamps.clampMax, clampMin: rawClamps.clampMin },
    axisXValues,
    axisYValues,
    critical: false,
    showPreview: true,
    allowUniform: true,
    minQuality: 0,
  }
}

// ─── Write map back into buffer ───────────────────────────────────────────────
export function writeMap(buffer: ArrayBuffer, extracted: ExtractedMap, newRaw: number[][]): ArrayBuffer {
  if (!extracted.found || extracted.offset < 0) return buffer
  const copy = buffer.slice(0)
  const view = new DataView(copy)
  const elSize = dtypeSize(extracted.mapDef.dtype)
  const { rows, cols, dtype, le } = extracted.mapDef
  // Bounds check: ensure the entire map fits within the buffer before writing any cell.
  // extractMap already validates this via readAt, but guard here too — a corrupt ExtractedMap
  // (e.g. from a DRT/A2L source) could have an offset that would cause DataView RangeError.
  const needed = rows * cols * elSize
  if (extracted.offset + needed > copy.byteLength) return buffer
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const off = extracted.offset + (r * cols + c) * elSize
      writeVal(view, off, newRaw[r][c], dtype, le)
    }
  }
  return copy
}

