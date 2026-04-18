/**
 * binaryDiff.ts — byte-level diff between two ECU binaries (ORI vs Stage1)
 * with map-shape clustering.
 *
 * Raw byte-diff alone is useless — a 16×12 uint16 boost map that was modified
 * across all 12 rows will show as 12 separate 20-30 byte changes spaced 32
 * bytes apart. What the tuner needs is ONE entry that says "this 384-byte
 * block at 0x056D40 is a map, probably 16×12 uint16, values went from
 * 1200-1800 → 1400-2100 (+16% avg)".
 *
 * Pipeline:
 *   1. Raw sweep — byte runs that differ (same as before).
 *   2. Tight merge — gap tolerance 4 bytes — gives you per-row diffs.
 *   3. Stride clustering — look at the spacing between tight regions.
 *      If 3+ regions are spaced at a regular stride (16, 32, 48, 64, 96
 *      bytes, etc.) we treat them as ROWS of ONE map. Row stride → cols.
 *      Cluster count → rows.
 *   4. Large merge for the rest — gap 48 — catches dense map diffs.
 *   5. Drop regions smaller than `minRegionLen` (noise).
 *   6. Interpret each region's bytes as u16 LE + u16 BE, pick whichever
 *      gives the more coherent before/after ranges, compute true %-change.
 *
 * Output: DiffRegion[] where each region is (ideally) ONE map the tuner
 * modified, with inferred dimensions and physical-ish % change.
 */

export interface DiffRegion {
  /** Byte offset where the first differing byte sits. */
  offset: number
  /** Total length of the region in bytes. */
  length: number
  /** Number of bytes that actually differ within the region. */
  changedBytes: number

  // Raw bytes
  before: Uint8Array
  after: Uint8Array

  // Byte stats (u8)
  beforeMin: number; beforeMax: number; beforeMean: number
  afterMin: number; afterMax: number; afterMean: number

  /** "How different is this region" as a percent, based on the per-cell
   *  absolute delta divided by before-mean. Uses u16 interpretation when
   *  it fits cleanly, otherwise u8. */
  pctChange: number

  // Inferred map shape — set when the region came from stride clustering.
  inferredRows?: number
  inferredCols?: number
  /** 'u16-le' | 'u16-be' | 'u8' — the element size the % change was computed against. */
  valueKind?: 'u16-le' | 'u16-be' | 'u8'
  /** Before/after value stats at the inferred element size (u16 typically). */
  valueBeforeMin?: number
  valueBeforeMax?: number
  valueBeforeMean?: number
  valueAfterMin?: number
  valueAfterMax?: number
  valueAfterMean?: number
  /** If the region is a stride cluster, this is how many "rows" were merged. */
  stride?: number
}

export interface DiffSummary {
  sizesMatch: boolean
  sameBytes: boolean
  totalBytes: number
  changedBytes: number
  /** Map-sized regions after clustering. What you want to show the user. */
  regions: DiffRegion[]
  /** Tiny regions below minRegionLen (often CRC noise). Available if you
   *  want to show "+N trivial changes" but not mixed with the real maps. */
  noise: DiffRegion[]
}

// ─── Internal types ─────────────────────────────────────────────────────────

interface Run { start: number; end: number }   // [start, end) exclusive

// ─── Main entry ─────────────────────────────────────────────────────────────

export function diffBinaries(
  a: ArrayBuffer,
  b: ArrayBuffer,
  opts: {
    /** Tight-merge gap (same-map cells with unchanged bytes between). Default 4. */
    tightGap?: number
    /** Min changed bytes for a region to count as a real map. Default 8. */
    minRegionLen?: number
    /** Gap tolerance for the post-cluster large merge. Default 8. */
    largeGap?: number
  } = {}
): DiffSummary {
  const tightGap = opts.tightGap ?? 4
  const minRegionLen = opts.minRegionLen ?? 8
  const largeGap = opts.largeGap ?? 8

  if (a.byteLength !== b.byteLength) {
    return { sizesMatch: false, sameBytes: false, totalBytes: 0, changedBytes: 0, regions: [], noise: [] }
  }
  const total = a.byteLength
  const A = new Uint8Array(a)
  const B = new Uint8Array(b)

  // Pass 1 — raw differing-byte runs.
  const runs: Run[] = []
  let i = 0
  while (i < total) {
    if (A[i] !== B[i]) {
      const s = i
      i++
      while (i < total && A[i] !== B[i]) i++
      runs.push({ start: s, end: i })
    } else {
      i++
    }
  }

  if (runs.length === 0) {
    return { sizesMatch: true, sameBytes: true, totalBytes: total, changedBytes: 0, regions: [], noise: [] }
  }

  // Pass 2 — tight merge (per-row diffs within a map).
  const tight: Run[] = [runs[0]]
  for (let r = 1; r < runs.length; r++) {
    const prev = tight[tight.length - 1]
    if (runs[r].start - prev.end <= tightGap) prev.end = runs[r].end
    else tight.push({ ...runs[r] })
  }

  // Pass 3 — stride clustering. Walk through `tight`, detect chains of 3+
  // regions spaced at a consistent stride in {16, 24, 32, 48, 64, 96, 128, 192, 256},
  // merge each chain into one map-region.
  const COMMON_STRIDES = [16, 24, 32, 48, 64, 96, 128, 192, 256]
  const STRIDE_TOL = 2   // tolerate ±2 bytes of jitter between row starts
  const used = new Array<boolean>(tight.length).fill(false)
  const clusterMerged: Array<{ start: number; end: number; stride?: number; rows?: number }> = []

  for (let k = 0; k < tight.length; k++) {
    if (used[k]) continue
    let matched = false
    for (const stride of COMMON_STRIDES) {
      const chain: number[] = [k]
      let lastStart = tight[k].start
      for (let j = k + 1; j < tight.length; j++) {
        if (used[j]) continue
        const expected = lastStart + stride
        if (Math.abs(tight[j].start - expected) <= STRIDE_TOL) {
          chain.push(j)
          lastStart = tight[j].start
        } else if (tight[j].start > expected + STRIDE_TOL) {
          break   // chain broken
        }
        // else: a region inside the expected slot — skip it (dense map case)
      }
      if (chain.length >= 3) {
        // Mark the whole chain as used, emit ONE merged region spanning all.
        const first = tight[chain[0]]
        const last = tight[chain[chain.length - 1]]
        clusterMerged.push({
          start: first.start,
          end: Math.max(last.end, last.start + stride),  // include the final row
          stride,
          rows: chain.length,
        })
        for (const idx of chain) used[idx] = true
        matched = true
        break
      }
    }
    if (!matched) {
      // Leave as singleton — will get merged by the large-gap pass below.
      clusterMerged.push({ start: tight[k].start, end: tight[k].end })
      used[k] = true
    }
  }

  // Pass 4 — large-gap merge of remaining singletons. This catches dense
  // maps where every byte changed (no gap to stride-detect).
  clusterMerged.sort((a, b) => a.start - b.start)
  const finalRuns: typeof clusterMerged = [clusterMerged[0]]
  for (let k = 1; k < clusterMerged.length; k++) {
    const prev = finalRuns[finalRuns.length - 1]
    // Only merge if NEITHER is a stride cluster (don't pollute an inferred map).
    if (prev.stride === undefined && clusterMerged[k].stride === undefined
        && clusterMerged[k].start - prev.end <= largeGap) {
      prev.end = clusterMerged[k].end
    } else {
      finalRuns.push({ ...clusterMerged[k] })
    }
  }

  // Pass 5 — build DiffRegion with full stats + value interpretation.
  const regions: DiffRegion[] = []
  const noise: DiffRegion[] = []
  let changedTotal = 0

  for (const f of finalRuns) {
    const len = f.end - f.start
    const before = A.slice(f.start, f.end)
    const after = B.slice(f.start, f.end)

    let changed = 0
    let bMin = 255, bMax = 0, bSum = 0
    let aMin = 255, aMax = 0, aSum = 0
    for (let k = 0; k < len; k++) {
      const bv = before[k], av = after[k]
      if (bv !== av) changed++
      if (bv < bMin) bMin = bv; if (bv > bMax) bMax = bv; bSum += bv
      if (av < aMin) aMin = av; if (av > aMax) aMax = av; aSum += av
    }
    changedTotal += changed

    const region: DiffRegion = {
      offset: f.start, length: len, changedBytes: changed,
      before, after,
      beforeMin: bMin, beforeMax: bMax, beforeMean: bSum / len,
      afterMin: aMin, afterMax: aMax, afterMean: aSum / len,
      pctChange: 0,
    }

    // Interpret as u16 when the length is even and ≥ 4 bytes (2 cells).
    if (len >= 4 && len % 2 === 0) {
      const chosen = pickBestU16Interpretation(before, after)
      region.valueKind = chosen.le ? 'u16-le' : 'u16-be'
      region.valueBeforeMin = chosen.bMin; region.valueBeforeMax = chosen.bMax; region.valueBeforeMean = chosen.bMean
      region.valueAfterMin = chosen.aMin; region.valueAfterMax = chosen.aMax; region.valueAfterMean = chosen.aMean
      region.pctChange = chosen.pctChange
    } else {
      region.valueKind = 'u8'
      const bMean = bSum / len
      const absDeltaSum = (() => {
        let s = 0
        for (let k = 0; k < len; k++) s += Math.abs(after[k] - before[k])
        return s
      })()
      region.pctChange = bMean > 0 ? (absDeltaSum / len) / bMean * 100 : 0
    }

    // Inferred shape
    if (f.stride && f.rows) {
      region.stride = f.stride
      region.inferredRows = f.rows
      // Assume uint16 row layout: cols = stride / 2
      region.inferredCols = f.stride / 2
    }

    // Split into noise vs real based on changedBytes.
    // CRC / checksum noise is typically 2-8 tiny changes in the header region.
    if (changed < minRegionLen) {
      noise.push(region)
    } else {
      regions.push(region)
    }
  }

  // Sort by pct change desc — biggest edits first.
  regions.sort((a, b) => b.pctChange - a.pctChange)

  return {
    sizesMatch: true, sameBytes: false,
    totalBytes: total, changedBytes: changedTotal,
    regions, noise,
  }
}

// ─── u16 interpretation picker ──────────────────────────────────────────────
// Try both LE and BE, pick whichever produces a more coherent % change.
// "Coherent" = smaller jump relative to before-mean (real maps change by
// 5-50%, garbage u16 interpretations produce wild 400%+ swings).
interface U16Interp {
  le: boolean
  bMin: number; bMax: number; bMean: number
  aMin: number; aMax: number; aMean: number
  pctChange: number
}
function pickBestU16Interpretation(before: Uint8Array, after: Uint8Array): U16Interp {
  const le = interpretU16(before, after, true)
  const be = interpretU16(before, after, false)
  // Pick whichever has the more plausible % (smaller magnitude, assuming
  // tunes don't double-triple most maps; but not zero — picks the one with
  // more actual change signal if both are sane).
  const leScore = plausibleScore(le.pctChange)
  const beScore = plausibleScore(be.pctChange)
  return beScore >= leScore ? be : le
}
function plausibleScore(pct: number): number {
  // Real map changes: 2-60%. Over 200% is almost certainly wrong byte order.
  const a = Math.abs(pct)
  if (a >= 2 && a <= 60) return 100
  if (a >= 1 && a <= 120) return 60
  if (a >= 0 && a <= 250) return 20
  return 0
}
function interpretU16(before: Uint8Array, after: Uint8Array, le: boolean): U16Interp {
  const n = before.length / 2
  let bMin = Infinity, bMax = -Infinity, bSum = 0
  let aMin = Infinity, aMax = -Infinity, aSum = 0
  let absDeltaSum = 0
  for (let i = 0; i < n; i++) {
    const bi = i * 2
    const bv = le ? before[bi] | (before[bi + 1] << 8) : (before[bi] << 8) | before[bi + 1]
    const av = le ? after[bi] | (after[bi + 1] << 8) : (after[bi] << 8) | after[bi + 1]
    if (bv < bMin) bMin = bv; if (bv > bMax) bMax = bv; bSum += bv
    if (av < aMin) aMin = av; if (av > aMax) aMax = av; aSum += av
    absDeltaSum += Math.abs(av - bv)
  }
  const bMean = bSum / n
  const aMean = aSum / n
  const pct = bMean > 0 ? (absDeltaSum / n) / bMean * 100 : 0
  return { le, bMin, bMax, bMean, aMin, aMax, aMean, pctChange: pct }
}

// ─── Candidate matching (unchanged from prev version) ───────────────────────

export interface CandidateRange {
  offset: number
  rows: number
  cols: number
  dtype: 'uint8' | 'int8' | 'uint16' | 'int16'
}

export function findCoveringCandidate<T extends CandidateRange>(
  region: DiffRegion,
  candidates: T[]
): T | null {
  const regEnd = region.offset + region.length
  let best: T | null = null
  let bestOverlap = 0
  for (const c of candidates) {
    const elSize = c.dtype === 'uint16' || c.dtype === 'int16' ? 2 : 1
    const cStart = c.offset
    const cEnd = c.offset + c.rows * c.cols * elSize
    const overlapStart = Math.max(region.offset, cStart)
    const overlapEnd = Math.min(regEnd, cEnd)
    const overlap = overlapEnd - overlapStart
    if (overlap > 0 && overlap > bestOverlap) {
      bestOverlap = overlap
      best = c
    }
  }
  return best
}
