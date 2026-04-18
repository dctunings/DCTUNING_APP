/**
 * memoryLookup.ts — Renderer-side helpers that talk to the main-process memory
 * store via IPC.
 *
 * The memory store (main/memoryStore.ts) is a local SQLite DB of confirmed map
 * fingerprints. On every scan we pass the list of ScannedCandidate through
 * `applyMemoryToCandidates()` — any candidate whose 12-byte Kf_ header is
 * already in memory gets auto-identified at 100% confidence without the
 * classifier having to guess.
 *
 * This file is renderer-safe (it never imports better-sqlite3) — all SQLite
 * access happens via `window.api.memory.*` IPC.
 */

import type { ScannedCandidate } from './mapClassifier'

// Shape mirrors FingerprintEntry in main/memoryStore.ts.
// We keep it in a dedicated interface here to avoid pulling main-process types
// through the renderer build.
export interface FingerprintEntry {
  id: string
  ecuFamily: string
  partNumber: string | null
  sigHex: string
  rows: number
  cols: number
  dtype: 'uint8' | 'int8' | 'uint16' | 'int16'
  le: boolean
  factor: number
  offsetVal: number
  unit: string | null
  mapDefId: string | null
  mapName: string
  category: string | null
  xAxis: number[] | null
  yAxis: number[] | null
  dataMin: number | null
  dataMax: number | null
  dataMean: number | null
  dna128: number[] | null
  confirmedBy: string | null
  confirmedAt: string
  lastSeenAt: string
  seenCount: number
  notes: string | null
}

/** 12-byte Kf_ header at `headerOffset` → lowercase hex string. */
export function candidateSigHex(buffer: ArrayBuffer, candidate: ScannedCandidate): string | null {
  const off = candidate.headerOffset
  if (off === undefined || off < 0) return null
  if (off + 12 > buffer.byteLength) return null
  const bytes = new Uint8Array(buffer, off, 12)
  let s = ''
  for (let i = 0; i < 12; i++) s += bytes[i].toString(16).padStart(2, '0')
  return s
}

/** One memory hit tied to its candidate. */
export interface MemoryMatch {
  candidate: ScannedCandidate
  entry: FingerprintEntry
  sigHex: string
}

/**
 * For every candidate, try to find a memory entry whose sig + dims match.
 * Returns the candidates split into (matched-in-memory) and (still-unknown).
 *
 * Matched candidates will also have their memory entry `markSeen`'d in the
 * background so the seen_count + last_seen_at columns stay current — lets
 * the UI prioritise frequently-seen fingerprints if we add a sort-by-use
 * view later.
 */
export async function applyMemoryToCandidates(
  buffer: ArrayBuffer,
  candidates: ScannedCandidate[]
): Promise<{ matched: MemoryMatch[]; unmatched: ScannedCandidate[] }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = (window as any).api
  if (!api?.memory?.find) return { matched: [], unmatched: candidates }

  const matched: MemoryMatch[] = []
  const unmatched: ScannedCandidate[] = []

  // Parallel lookups — each IPC round-trip is <1ms so we can fan out.
  const pending = candidates.map(async (c) => {
    const sig = candidateSigHex(buffer, c)
    if (!sig) { unmatched.push(c); return }
    try {
      const res = await api.memory.find(sig, c.rows, c.cols)
      const entries: FingerprintEntry[] = res?.entries ?? []
      if (entries.length > 0) {
        const best = entries[0]   // ordered by seen_count DESC, last_seen_at DESC
        matched.push({ candidate: c, entry: best, sigHex: sig })
        // Fire-and-forget bump of seen_count; don't block on it
        api.memory.markSeen(best.id).catch(() => { /* non-fatal */ })
      } else {
        unmatched.push(c)
      }
    } catch {
      unmatched.push(c)
    }
  })
  await Promise.all(pending)
  return { matched, unmatched }
}

/** Utility to build a FingerprintEntry from a ScannedCandidate + user-supplied label. */
export function buildEntryFromCandidate(
  buffer: ArrayBuffer,
  candidate: ScannedCandidate,
  label: {
    ecuFamily: string
    partNumber?: string | null
    mapDefId?: string | null
    mapName: string
    category?: string | null
    factor: number
    offsetVal?: number
    unit?: string | null
    notes?: string | null
    confirmedBy?: string | null
  }
): Omit<FingerprintEntry, 'id' | 'confirmedAt' | 'lastSeenAt' | 'seenCount'> & {
  id?: string
  confirmedAt?: string
  lastSeenAt?: string
  seenCount?: number
} {
  const sig = candidateSigHex(buffer, candidate) ?? ''
  return {
    ecuFamily: label.ecuFamily,
    partNumber: label.partNumber ?? null,
    sigHex: sig,
    rows: candidate.rows,
    cols: candidate.cols,
    dtype: candidate.dtype,
    le: candidate.le,
    factor: label.factor,
    offsetVal: label.offsetVal ?? 0,
    unit: label.unit ?? null,
    mapDefId: label.mapDefId ?? null,
    mapName: label.mapName,
    category: label.category ?? null,
    xAxis: candidate.axisX?.values ?? null,
    yAxis: candidate.axisY?.values ?? null,
    dataMin: candidate.valueRange.min,
    dataMax: candidate.valueRange.max,
    dataMean: candidate.valueRange.mean,
    dna128: null,
    confirmedBy: label.confirmedBy ?? null,
    notes: label.notes ?? null,
  }
}
