// VAG signature scanner (main process).
//
// v3.11.22: delegates to the shared pure-JS core at renderer/src/lib/vagScannerCore.ts
// so the same algorithm runs in both Electron main AND the web renderer. This wrapper
// is only responsible for loading catalog JSONs from disk (Electron resources folder).
//
// Catalog format (compact JSONs built by C:/temp/compact_catalog_v7.js):
//   [{ n: name, s: sig-base64 (24B), r: rows, c: cols, t: 'M'|'C'|'V'|'B', d: desc, p: 0|1,
//      f?: factor, ov?: offset, u?: unit, v?: 1=verified, dt?: dtype, dO?: dataOffset }]

import fs from 'fs'
import path from 'path'
import { FAMILIES, buildBucket, scanSignaturesCore } from '../renderer/src/lib/vagScannerCore'
import type { Family, CompactEntry, Bucket, ScanResult } from '../renderer/src/lib/vagScannerCore'

export type { Family, ScanMatch, ScanResult } from '../renderer/src/lib/vagScannerCore'

// Per-family bucket cache — loaded lazily on first scan.
const bucketsByFamily: Partial<Record<Family, Bucket>> = {}
const catalogSizes: Partial<Record<Family, number>> = {}

function resolveCatalogPath(fam: Family): string {
  const fname = `vagcat7_${fam.toLowerCase()}.json`
  // In dev: resources/ sits next to project root. In packaged Electron,
  // process.resourcesPath points at the app's resources folder. Try both.
  const candidates = [
    path.join(process.resourcesPath || '', 'vag-signatures', fname),
    path.join(__dirname, '..', '..', 'resources', 'vag-signatures', fname),
    path.join(__dirname, '..', '..', '..', 'resources', 'vag-signatures', fname),
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return candidates[candidates.length - 1]
}

function loadFamily(fam: Family): Bucket {
  const cached = bucketsByFamily[fam]
  if (cached) return cached
  const p = resolveCatalogPath(fam)
  if (!fs.existsSync(p)) {
    const empty = buildBucket([])
    bucketsByFamily[fam] = empty
    catalogSizes[fam] = 0
    return empty
  }
  const entries = JSON.parse(fs.readFileSync(p, 'utf8')) as CompactEntry[]
  catalogSizes[fam] = entries.length
  const bucket = buildBucket(entries)
  bucketsByFamily[fam] = bucket
  return bucket
}

/**
 * Scan a binary buffer for known VAG map signatures.
 * @param buffer  Raw ECU image (post-HEX-parse if applicable).
 * @param forceFamily  Optional family override; if unset, auto-detects by hit count.
 */
export function scanSignatures(buffer: ArrayBuffer | Buffer, forceFamily?: Family): ScanResult {
  const bytes = Buffer.isBuffer(buffer) ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength) : new Uint8Array(buffer)
  const familiesToScan: Family[] = forceFamily ? [forceFamily] : [...FAMILIES]
  const buckets: Partial<Record<Family, Bucket>> = {}
  for (const fam of familiesToScan) {
    buckets[fam] = loadFamily(fam)
  }
  return scanSignaturesCore(bytes, buckets, forceFamily)
}

/** Stats for diagnostics — returns catalog sizes if loaded. */
export function getCatalogStats(): Record<Family, number> {
  const out = {} as Record<Family, number>
  for (const fam of FAMILIES) {
    try {
      const p = resolveCatalogPath(fam)
      if (fs.existsSync(p)) {
        if (catalogSizes[fam] === undefined) loadFamily(fam)
        out[fam] = catalogSizes[fam] ?? 0
      } else {
        out[fam] = 0
      }
    } catch {
      out[fam] = 0
    }
  }
  return out
}
