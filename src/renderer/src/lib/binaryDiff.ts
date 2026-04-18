/**
 * binaryDiff.ts — byte-level diff between two ECU binaries (ORI vs Stage1).
 *
 * The scanner finds map-shaped byte patterns; the classifier guesses what
 * they are. What neither can do is answer "which ones did the tuner of THIS
 * specific file actually change?". That's exactly what loading a Stage1 pair
 * answers — the bytes that differ are, by definition, the maps that matter
 * for a real tune of this variant.
 *
 * Diff strategy:
 *   1. Files must be same size (or we bail) — mismatched length = different
 *      variant, not an ORI/Stage1 pair.
 *   2. Walk byte-by-byte, collect runs where bytes differ.
 *   3. Merge runs that are within `gapTol` bytes of each other into a single
 *      region (prevents a 16×16 uint16 map with 2 unchanged cells from
 *      being reported as 3 separate regions).
 *   4. For each merged region, compute before/after basic stats so the UI
 *      can show "changed by +12%" or "mostly raised".
 */

export interface DiffRegion {
  /** Byte offset where the first differing byte sits. */
  offset: number
  /** Total length of the region in bytes (includes any un-differing bytes
   *  swallowed by the gap-tolerance merge). */
  length: number
  /** Number of bytes that actually differ within the region. */
  changedBytes: number
  /** Raw bytes before/after the change. Exact-length arrays of `length`
   *  bytes, straight from the two buffers. */
  before: Uint8Array
  after: Uint8Array
  /** Quick stats on the raw bytes (max u8 value = 255). */
  beforeMin: number; beforeMax: number; beforeMean: number
  afterMin: number; afterMax: number; afterMean: number
  /** Rough "how different is this region" in percent, based on the mean
   *  absolute delta of the raw bytes, divided by beforeMean. Useful for
   *  UI sorting ("show me what changed most first"). Zero if the before
   *  mean is zero. */
  pctChange: number
}

export interface DiffSummary {
  /** Matched-size check. If false, `regions` is empty and `same` indicates
   *  whether the files happen to be byte-identical despite the size match. */
  sizesMatch: boolean
  sameBytes: boolean
  totalBytes: number
  changedBytes: number
  regions: DiffRegion[]
}

/** Compute all differing regions between two buffers.
 *
 *  `gapTol` — max number of unchanged bytes between two runs before we treat
 *  them as separate regions. Default 4 covers e.g. "2 cells changed, 1 cell
 *  unchanged, 5 cells changed" in a uint16 map (4 bytes of unchanged = 2 cells).
 *
 *  `minRegionLen` — ignore regions smaller than this. Default 2 skips
 *  single-byte noise (CRC bytes, checksum area) which isn't map data. */
export function diffBinaries(
  a: ArrayBuffer,
  b: ArrayBuffer,
  opts: { gapTol?: number; minRegionLen?: number } = {}
): DiffSummary {
  const gapTol = opts.gapTol ?? 4
  const minRegionLen = opts.minRegionLen ?? 2

  if (a.byteLength !== b.byteLength) {
    return { sizesMatch: false, sameBytes: false, totalBytes: 0, changedBytes: 0, regions: [] }
  }
  const total = a.byteLength
  const A = new Uint8Array(a)
  const B = new Uint8Array(b)

  // Sweep — detect raw runs of change.
  interface Run { start: number; end: number }   // [start, end) exclusive
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
    return { sizesMatch: true, sameBytes: true, totalBytes: total, changedBytes: 0, regions: [] }
  }

  // Merge close runs.
  const merged: Run[] = [runs[0]]
  for (let r = 1; r < runs.length; r++) {
    const prev = merged[merged.length - 1]
    if (runs[r].start - prev.end <= gapTol) {
      prev.end = runs[r].end
    } else {
      merged.push({ ...runs[r] })
    }
  }

  // Build DiffRegion per merged run.
  const regions: DiffRegion[] = []
  let changedTotal = 0
  for (const m of merged) {
    const len = m.end - m.start
    if (len < minRegionLen) continue

    const before = A.slice(m.start, m.end)
    const after = B.slice(m.start, m.end)

    let changed = 0
    let bMin = 255, bMax = 0, bSum = 0
    let aMin = 255, aMax = 0, aSum = 0
    let absDeltaSum = 0
    for (let k = 0; k < len; k++) {
      const bv = before[k], av = after[k]
      if (bv !== av) changed++
      if (bv < bMin) bMin = bv
      if (bv > bMax) bMax = bv
      bSum += bv
      if (av < aMin) aMin = av
      if (av > aMax) aMax = av
      aSum += av
      absDeltaSum += Math.abs(av - bv)
    }
    const bMean = bSum / len
    const aMean = aSum / len
    const pct = bMean > 0 ? (absDeltaSum / len) / bMean * 100 : 0

    changedTotal += changed
    regions.push({
      offset: m.start,
      length: len,
      changedBytes: changed,
      before, after,
      beforeMin: bMin, beforeMax: bMax, beforeMean: bMean,
      afterMin: aMin, afterMax: aMax, afterMean: aMean,
      pctChange: pct,
    })
  }

  return { sizesMatch: true, sameBytes: false, totalBytes: total, changedBytes: changedTotal, regions }
}

/** Given a list of scanner candidates with known data-block ranges, return
 *  the candidate whose data block covers the given region (if any). Used to
 *  pair each DiffRegion with its matching ScannedCandidate so the UI can
 *  show "this changed region sits inside the 12×16 map at 0x4FF30 (X axis
 *  500-7500 RPM, Y 1000-2400 mbar)". */
export interface CandidateRange {
  offset: number        // data block start (not header)
  rows: number
  cols: number
  dtype: 'uint8' | 'int8' | 'uint16' | 'int16'
}

export function findCoveringCandidate<T extends CandidateRange>(
  region: DiffRegion,
  candidates: T[]
): T | null {
  const regEnd = region.offset + region.length
  // Pick the candidate whose data block (offset + rows*cols*dtypeSize) fully
  // contains — or overlaps most of — the region.
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
