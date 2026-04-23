// VAG signature scanner — pure, environment-agnostic core.
// Works in both Electron main process (loads catalogs from fs) and browser renderer
// (fetches catalogs via HTTP). This module has NO Node.js dependencies — uses
// Uint8Array, DataView, and atob() only.
//
// Catalog format (compact JSONs built by C:/temp/compact_catalog_v7.js):
//   [{ n: name, s: sig-base64 (24B), r: rows, c: cols, t: 'M'|'C'|'V'|'B', d: desc,
//      p: 0|1, f?: factor, ov?: offset, u?: unit, v?: 1 (verified), dt?: dtype,
//      dO?: dataOffset within record }]

export const FAMILIES = [
  'ME7',
  'EDC16', 'EDC16U', 'EDC17', 'EDC17C46',
  'MED9', 'MED17',
  'SIMOS8', 'SIMOS16', 'SIMOS18',
  'PPD1', 'MG1', 'OTHER',
] as const
export type Family = (typeof FAMILIES)[number]

export interface CompactEntry {
  n: string
  s: string       // base64-encoded 24-byte sig
  r: number
  c: number
  t: string       // M/C/V/B
  d: string
  p: 0 | 1
  f?: number
  ov?: number
  u?: string
  v?: 1
  dt?: string     // u1/s1/u2/s2/u4/s4/f4
  dO?: number
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
  dtype?: 'uint8' | 'int8' | 'uint16' | 'int16' | 'uint32' | 'int32' | 'float32'
  dataOffset?: number
}

export interface ScanResult {
  detectedFamily: Family | 'UNKNOWN'
  familyScores: Record<string, number>
  totalMaps: number
  byType: { MAP: number; CURVE: number; VALUE: number; VAL_BLK: number }
  matches: ScanMatch[]
}

const TYPE_MAP: Record<string, ScanMatch['type']> = { M: 'MAP', C: 'CURVE', V: 'VALUE', B: 'VAL_BLK' }

const DTYPE_MAP: Record<string, ScanMatch['dtype']> = {
  u1: 'uint8', s1: 'int8',
  u2: 'uint16', s2: 'int16',
  u4: 'uint32', s4: 'int32',
  f4: 'float32',
}

// ─── Base64 → Uint8Array (browser-safe, no Node Buffer) ──────────────────────
function base64ToBytes(b64: string): Uint8Array {
  // atob exists in browsers and modern Node (20+)
  const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary')
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xFF
  return out
}

// ─── 8-byte hex prefix (for bucket key) ──────────────────────────────────────
// Same output format as the Node version: uppercase hex, 16 chars, e.g. "4B4641503132334C"
const HEX = '0123456789ABCDEF'
function prefix8Hex(bin: Uint8Array, offset: number): string {
  // Unrolled for perf — this is the inner scanning loop
  let s = ''
  for (let i = 0; i < 8; i++) {
    const b = bin[offset + i]
    s += HEX[(b >>> 4) & 0x0F] + HEX[b & 0x0F]
  }
  return s
}

// ─── Bucket type — same structure across main + renderer ─────────────────────
export interface Bucket {
  byPrefix: Map<string, { e: CompactEntry; full: Uint8Array }[]>
}

export function buildBucket(entries: CompactEntry[]): Bucket {
  const byPrefix = new Map<string, { e: CompactEntry; full: Uint8Array }[]>()
  for (const e of entries) {
    const full = base64ToBytes(e.s)
    if (full.length !== 24) continue
    const p8 = prefix8Hex(full, 0)
    // Skip low-entropy prefixes (all-zeros, all-FFs, repeated-byte) — quadratic blowup risk
    if (p8 === '0000000000000000' || p8 === 'FFFFFFFFFFFFFFFF' || /^(..)\1{7}$/.test(p8)) continue
    let list = byPrefix.get(p8)
    if (!list) { list = []; byPrefix.set(p8, list) }
    list.push({ e, full })
  }
  return { byPrefix }
}

// ─── Compare 24 bytes of binary against a stored sig ─────────────────────────
function bytesEqual24(a: Uint8Array, aOff: number, b: Uint8Array): boolean {
  for (let i = 0; i < 24; i++) if (a[aOff + i] !== b[i]) return false
  return true
}

/**
 * Scan a binary buffer against pre-built family buckets.
 * @param binary   Raw bytes (ArrayBuffer or Uint8Array)
 * @param buckets  Map of family → Bucket (pre-parsed from catalog JSONs)
 * @param forceFamily Optional override — skips auto-detection
 */
export function scanSignaturesCore(
  binary: ArrayBuffer | Uint8Array,
  buckets: Partial<Record<Family, Bucket>>,
  forceFamily?: Family,
): ScanResult {
  const bin = binary instanceof Uint8Array ? binary : new Uint8Array(binary)

  // Flatten buckets across families: prefix → entries tagged with family
  const familiesToScan: Family[] = forceFamily ? [forceFamily] : [...FAMILIES]
  const combined = new Map<string, { e: CompactEntry; full: Uint8Array; fam: Family }[]>()
  for (const fam of familiesToScan) {
    const b = buckets[fam]
    if (!b) continue
    for (const [p8, list] of b.byPrefix) {
      let dst = combined.get(p8)
      if (!dst) { dst = []; combined.set(p8, dst) }
      for (const item of list) dst.push({ e: item.e, full: item.full, fam })
    }
  }

  const familyScores: Record<string, number> = {}
  const byFamilyByName: Partial<Record<Family, Map<string, { offset: number; e: CompactEntry }>>> = {}

  const binLen = bin.length
  // Inner loop — same 2-byte stride as the Node version for consistency
  for (let i = 0; i + 24 <= binLen; i += 2) {
    const p8 = prefix8Hex(bin, i)
    const cands = combined.get(p8)
    if (!cands) continue
    for (const c of cands) {
      if (!bytesEqual24(bin, i, c.full)) continue
      familyScores[c.fam] = (familyScores[c.fam] || 0) + 1
      let fbn = byFamilyByName[c.fam]
      if (!fbn) { fbn = new Map(); byFamilyByName[c.fam] = fbn }
      if (!fbn.has(c.e.n)) fbn.set(c.e.n, { offset: i, e: c.e })
    }
  }

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
        name, family: detected as Family, offset: hit.offset,
        rows: hit.e.r, cols: hit.e.c, type, desc: hit.e.d,
        portable: hit.e.p === 1,
        factor: hit.e.f, offsetVal: hit.e.ov, unit: hit.e.u,
        scalingVerified: hit.e.v === 1,
        dtype, dataOffset: hit.e.dO,
      })
      byType[type]++
    }
    matches.sort((a, b) => a.offset - b.offset)
  }

  return { detectedFamily: detected, familyScores, totalMaps: matches.length, byType, matches }
}
