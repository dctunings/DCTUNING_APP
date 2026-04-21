// VAG signature scanner (main process).
//
// Loads per-family compact catalogs from resources/vag-signatures/ and scans a binary
// buffer for known DAMOS-named maps. Auto-detects ECU family by hit count.
//
// Catalog format (compact JSONs built by C:/temp/compact_catalog.js):
//   [{ n: name, s: sig-base64 (24B), r: rows, c: cols, t: 'M'|'C'|'V'|'V', d: desc, p: 0|1 }]
//
// Scanning strategy:
//   1. Build a prefix bucket over the first 8 bytes of every signature (hex string → entries).
//   2. Iterate the binary at 2-byte steps; at each offset, hash the 8-byte prefix and look up
//      candidate entries. For each candidate, verify the full 24-byte sig matches.
//   3. Keep the first (lowest-offset) hit per map name.
//
// Families with non-empty catalogs: ME7, EDC16, EDC17, MED9, MED17, PPD1, OTHER.
// Held-out validation: 18/21 binaries across families got real DAMOS-named maps identified.

import fs from 'fs'
import path from 'path'

const FAMILIES = [
  'ME7',
  'EDC16', 'EDC16U', 'EDC17', 'EDC17C46',
  'MED9', 'MED17',
  'SIMOS8', 'SIMOS16', 'SIMOS18',
  'PPD1', 'MG1', 'OTHER',
] as const
type Family = (typeof FAMILIES)[number]

interface CompactEntry {
  n: string       // map name
  s: string       // sig as base64 (24 bytes)
  r: number       // rows
  c: number       // cols
  t: string       // type: 'M'/'C'/'V'/'B' (MAP/CURVE/VALUE/VAL_BLK)
  d: string       // description
  p: 0 | 1        // 1 = fully portable across all source binaries
  // v6: scaling extracted from A2L COMPU_METHOD with Bosch INVERSE convention.
  f?: number      // factor (physical = raw * f + ov)
  ov?: number     // offset
  u?: string      // unit string
  v?: 1           // 1 = scaling verified across ≥2 training pairs + plausibility checked
  // v7: dtype from A2L RECORD_LAYOUT + data offset within record (for axis-embedded maps)
  dt?: string     // dtype code: u1/s1/u2/s2/u4/s4/f4 (compact form of UBYTE/SBYTE/UWORD/SWORD/ULONG/SLONG/FLOAT32)
  dO?: number     // bytes from the A2L address to skip before data starts (axes header)
}

export interface ScanMatch {
  name: string
  family: Family
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
  // v7: verified dtype from A2L RECORD_LAYOUT (cross-pair consensus) + byte offset
  // into the record where actual data cells start (non-zero for axis-embedded maps).
  dtype?: 'uint8' | 'int8' | 'uint16' | 'int16' | 'uint32' | 'int32' | 'float32'
  dataOffset?: number
}

export interface ScanResult {
  detectedFamily: Family | 'UNKNOWN'
  familyScores: Record<string, number>     // total sig hits per family
  totalMaps: number                         // unique maps in detected family
  byType: { MAP: number; CURVE: number; VALUE: number; VAL_BLK: number }
  matches: ScanMatch[]                      // sorted by offset ascending
}

const TYPE_MAP: Record<string, ScanMatch['type']> = { M: 'MAP', C: 'CURVE', V: 'VALUE', B: 'VAL_BLK' }

// Decode v7 compact dtype codes to the strings the app's binaryParser expects.
const DTYPE_MAP: Record<string, ScanMatch['dtype']> = {
  u1: 'uint8', s1: 'int8',
  u2: 'uint16', s2: 'int16',
  u4: 'uint32', s4: 'int32',
  f4: 'float32',
}

// Prebuilt lookup per family — populated lazily on first scan.
// prefix8Hex → array of { e: CompactEntry, fullSig: Buffer (24B) }
type Bucket = Map<string, { e: CompactEntry; full: Buffer }[]>
const bucketsByFamily: Partial<Record<Family, Bucket>> = {}
const catalogsByFamily: Partial<Record<Family, CompactEntry[]>> = {}

function resolveCatalogPath(fam: Family): string {
  // v7 catalog files include verified dtype (UBYTE/UWORD/etc.) per entry from A2L
  // RECORD_LAYOUT, plus the data offset within the record for axis-embedded maps.
  const fname = `vagcat7_${fam.toLowerCase()}.json`
  // In dev: resources/ sits next to project root. In packaged Electron, process.resourcesPath
  // points at the app's resources folder. Try both.
  const candidates = [
    path.join(process.resourcesPath || '', 'vag-signatures', fname),
    path.join(__dirname, '..', '..', 'resources', 'vag-signatures', fname),
    path.join(__dirname, '..', '..', '..', 'resources', 'vag-signatures', fname),
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return candidates[candidates.length - 1] // last candidate is dev-mode default
}

function loadFamily(fam: Family): Bucket {
  const cached = bucketsByFamily[fam]
  if (cached) return cached
  const p = resolveCatalogPath(fam)
  if (!fs.existsSync(p)) {
    bucketsByFamily[fam] = new Map()
    return bucketsByFamily[fam]!
  }
  const entries = JSON.parse(fs.readFileSync(p, 'utf8')) as CompactEntry[]
  const bucket: Bucket = new Map()
  for (const e of entries) {
    const full = Buffer.from(e.s, 'base64')
    if (full.length !== 24) continue
    const p8 = full.slice(0, 8).toString('hex').toUpperCase()
    // Skip entries with low-entropy 8-byte prefix — all-zeros and all-FFs cause
    // quadratic blowup scanning erased flash regions without being uniquely identifying.
    if (p8 === '0000000000000000' || p8 === 'FFFFFFFFFFFFFFFF' || /^(..)\1{7}$/.test(p8)) continue
    if (!bucket.has(p8)) bucket.set(p8, [])
    bucket.get(p8)!.push({ e, full })
  }
  catalogsByFamily[fam] = entries
  bucketsByFamily[fam] = bucket
  return bucket
}

/**
 * Scan a binary buffer for known VAG map signatures.
 * @param buffer  Raw ECU image (post-HEX-parse if applicable).
 * @param forceFamily  Optional family override; if unset, auto-detects by hit count.
 */
export function scanSignatures(buffer: ArrayBuffer | Buffer, forceFamily?: Family): ScanResult {
  const bin = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)

  // Build combined bucket across all families (or just the forced family).
  const familiesToScan: Family[] = forceFamily ? [forceFamily] : [...FAMILIES]
  // Prefix → entries across families; each entry tagged with its family.
  const combined = new Map<string, { e: CompactEntry; full: Buffer; fam: Family }[]>()
  for (const fam of familiesToScan) {
    const b = loadFamily(fam)
    for (const [p8, list] of b) {
      let dst = combined.get(p8)
      if (!dst) { dst = []; combined.set(p8, dst) }
      for (const item of list) dst.push({ e: item.e, full: item.full, fam })
    }
  }

  // Scan
  const familyScores: Record<string, number> = {}
  // Per-family: Map<name, { offset, entry }>  — keep first hit only.
  const byFamilyByName: Partial<Record<Family, Map<string, { offset: number; e: CompactEntry }>>> = {}

  const binLen = bin.length
  for (let i = 0; i + 24 <= binLen; i += 2) {
    const p8 = bin.slice(i, i + 8).toString('hex').toUpperCase()
    const cands = combined.get(p8)
    if (!cands) continue
    // Verify the full 24-byte sig only for buffered-prefix candidates
    for (const c of cands) {
      if (bin.compare(c.full, 0, 24, i, i + 24) !== 0) continue
      familyScores[c.fam] = (familyScores[c.fam] || 0) + 1
      let fbn = byFamilyByName[c.fam]
      if (!fbn) { fbn = new Map(); byFamilyByName[c.fam] = fbn }
      if (!fbn.has(c.e.n)) fbn.set(c.e.n, { offset: i, e: c.e })
    }
  }

  // Detect top family
  const rank = Object.entries(familyScores).sort((a, b) => b[1] - a[1])
  const detected: Family | 'UNKNOWN' = forceFamily || (rank[0] ? (rank[0][0] as Family) : 'UNKNOWN')

  const detectedHits = detected !== 'UNKNOWN' ? byFamilyByName[detected as Family] : undefined
  const matches: ScanMatch[] = []
  const byType = { MAP: 0, CURVE: 0, VALUE: 0, VAL_BLK: 0 }
  if (detectedHits) {
    for (const [name, hit] of detectedHits) {
      const type = TYPE_MAP[hit.e.t] || 'VALUE'
      const dtype = hit.e.dt ? DTYPE_MAP[hit.e.dt] : undefined
      matches.push({
        name,
        family: detected as Family,
        offset: hit.offset,
        rows: hit.e.r,
        cols: hit.e.c,
        type,
        desc: hit.e.d,
        portable: hit.e.p === 1,
        factor: hit.e.f,
        offsetVal: hit.e.ov,
        unit: hit.e.u,
        scalingVerified: hit.e.v === 1,
        dtype,
        dataOffset: hit.e.dO,
      })
      byType[type]++
    }
    matches.sort((a, b) => a.offset - b.offset)
  }

  return {
    detectedFamily: detected,
    familyScores,
    totalMaps: matches.length,
    byType,
    matches,
  }
}

/** Stats for diagnostics — returns catalog sizes if loaded. */
export function getCatalogStats(): Record<Family, number> {
  const out = {} as Record<Family, number>
  for (const fam of FAMILIES) {
    try {
      const p = resolveCatalogPath(fam)
      if (fs.existsSync(p)) {
        if (!catalogsByFamily[fam]) loadFamily(fam)
        out[fam] = catalogsByFamily[fam]?.length || 0
      } else {
        out[fam] = 0
      }
    } catch {
      out[fam] = 0
    }
  }
  return out
}
