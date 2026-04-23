// Browser-side VAG signature scanner.
// Fetches catalog JSONs from /vag-signatures/vagcat7_*.json (served as static assets
// from the web build output) and runs the pure scanner core over the binary.
//
// Used as a drop-in replacement for `window.api.vagScanSignatures` (Electron IPC)
// when running in the web version of the app. The port maintains full API
// compatibility — the RemapBuilder code doesn't know or care which path runs.

import { FAMILIES, buildBucket, scanSignaturesCore } from './vagScannerCore'
import type { Family, CompactEntry, Bucket, ScanResult } from './vagScannerCore'

// Module-level cache — catalogs are large-ish (~3-4MB each gzipped), we don't want
// to refetch across scans. Browser HTTP cache also kicks in, but keeping bucket
// objects avoids re-parsing + re-building the prefix index on every scan.
const bucketCache: Partial<Record<Family, Bucket>> = {}
const fetchPromises: Partial<Record<Family, Promise<Bucket | null>>> = {}

async function fetchFamilyCatalog(fam: Family): Promise<Bucket | null> {
  const cached = bucketCache[fam]
  if (cached) return cached
  const inflight = fetchPromises[fam]
  if (inflight) return inflight

  const promise = (async (): Promise<Bucket | null> => {
    try {
      const res = await fetch(`./vag-signatures/vagcat7_${fam.toLowerCase()}.json`, {
        // Long-lived cache — catalogs are versioned via commit hash in the deploy
        cache: 'force-cache',
      })
      if (!res.ok) return null
      const entries = (await res.json()) as CompactEntry[]
      const bucket = buildBucket(entries)
      bucketCache[fam] = bucket
      return bucket
    } catch {
      return null
    }
  })()
  fetchPromises[fam] = promise
  return promise
}

/**
 * Web-mode signature scanner. Matches the shape of the Electron IPC handler so
 * RemapBuilder can call it interchangeably. Fetches all family catalogs in
 * parallel, then runs the scanner core over the binary.
 */
export async function webScanSignatures(
  binary: ArrayBuffer | Uint8Array | number[],
  forceFamily?: Family,
): Promise<{ ok: true; result: ScanResult } | { ok: false; error: string }> {
  try {
    // Normalize input — IPC passes number[] to avoid cloning ArrayBuffer.
    // In web we may get either form depending on caller.
    const binaryBytes: Uint8Array =
      binary instanceof Uint8Array ? binary
      : Array.isArray(binary) ? new Uint8Array(binary)
      : new Uint8Array(binary as ArrayBuffer)

    // Fetch every family's catalog in parallel. First scan on a cold cache takes
    // a moment; subsequent scans (and page reloads) are near-instant.
    const familiesToFetch: Family[] = forceFamily ? [forceFamily] : [...FAMILIES]
    const buckets: Partial<Record<Family, Bucket>> = {}
    await Promise.all(
      familiesToFetch.map(async fam => {
        const b = await fetchFamilyCatalog(fam)
        if (b) buckets[fam] = b
      })
    )

    const result = scanSignaturesCore(binaryBytes, buckets, forceFamily)
    return { ok: true, result }
  } catch (e) {
    return { ok: false, error: String(e instanceof Error ? e.message : e) }
  }
}

/** Catalog stats, for parity with the main-process API. */
export async function webCatalogStats(): Promise<{ ok: true; stats: Record<Family, number> } | { ok: false; error: string }> {
  try {
    const stats: Record<string, number> = {}
    await Promise.all(
      FAMILIES.map(async fam => {
        try {
          const res = await fetch(`./vag-signatures/vagcat7_${fam.toLowerCase()}.json`, { cache: 'force-cache' })
          if (!res.ok) { stats[fam] = 0; return }
          const entries = (await res.json()) as unknown[]
          stats[fam] = entries.length
        } catch {
          stats[fam] = 0
        }
      })
    )
    return { ok: true, stats: stats as Record<Family, number> }
  } catch (e) {
    return { ok: false, error: String(e instanceof Error ? e.message : e) }
  }
}
