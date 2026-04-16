/**
 * featureProcessor.ts — One-click tuning macros for ECU performance features.
 *
 * These macros modify specific map data in the binary buffer using addresses
 * found by the scanner. They don't re-scan — they use existing ClassifiedCandidate
 * results to locate and modify maps.
 *
 * Supported features (EDC16):
 *   - Popcorn (Hardcut): Zero-out last RPM column of torque limiter
 *   - Launch Control: Limit torque at 0 km/h via speed-torque curve
 *   - Smoke on Launch: Increase smoke limiter at low airflow for diesel smoke effect
 *   - SVBL finder: Locate single-value boost limiter via 7ADF marker
 *   - RPM limiter finder: Locate hardcut RPM value in calibration area
 */

import type { ScannedCandidate, ClassifiedCandidate, ClassificationResult } from './mapClassifier'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FoundLimiter {
  name: string
  offset: number        // byte offset in binary
  rawValue: number      // current raw uint16 value
  physValue: number     // physical value (after factor)
  unit: string
  factor: number
  min: number           // slider min (physical)
  max: number           // slider max (physical)
  description: string
}

export interface AddonFeature {
  id: string
  name: string
  description: string
  enabled: boolean
  compatible: boolean   // false if ECU doesn't support this
  badge?: string        // "Diesel" / "Manual Only" etc.
}

export interface FeatureResult {
  success: boolean
  message: string
  modifiedOffsets: number[]  // byte offsets that were changed
}

// ─── Limiter Finders ──────────────────────────────────────────────────────────

/**
 * Find the SVBL (Single Value Boost Limiter).
 * Strategy 1: Search for byte pattern [00 00 7A DF] — SVBL is 2 bytes before the 00 00.
 * Strategy 2: Search for the uint16 value 0x7ADF (31455) — SVBL is 2 bytes before it.
 * Strategy 3: Search near boost map for isolated values in 2100-3500 mbar range.
 */
export function findSVBL(buffer: ArrayBuffer, le: boolean, boostMapOffset?: number): FoundLimiter | null {
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  const len = buffer.byteLength
  const rU16 = (off: number) => le ? view.getUint16(off, true) : view.getUint16(off, false)
  const searchStart = Math.floor(len * 0.60) & ~1

  // Strategy 1: Raw byte pattern search for [00 00 7A DF]
  for (let i = searchStart; i < len - 6; i++) {
    if (bytes[i] === 0x00 && bytes[i + 1] === 0x00 && bytes[i + 2] === 0x7A && bytes[i + 3] === 0xDF) {
      // SVBL is 2 bytes before the 00 00
      if (i >= 2) {
        const svblRaw = rU16(i - 2)
        if (svblRaw >= 1500 && svblRaw <= 4000) {
          return {
            name: 'Boost Limiter (SVBL)',
            offset: i - 2,
            rawValue: svblRaw,
            physValue: svblRaw,
            unit: 'mbar',
            factor: 1,
            min: 1500,
            max: 4000,
            description: 'Maximum boost pressure ceiling. ECU enters limp mode if exceeded.',
          }
        }
      }
    }
  }

  // Strategy 2: Search for 0x7ADF as a uint16 value (either endianness)
  for (let i = searchStart; i < len - 4; i += 2) {
    const val = rU16(i)
    if (val === 0x7ADF && i >= 2) {
      const svblRaw = rU16(i - 2)
      if (svblRaw >= 1500 && svblRaw <= 4000) {
        return {
          name: 'Boost Limiter (SVBL)',
          offset: i - 2,
          rawValue: svblRaw,
          physValue: svblRaw,
          unit: 'mbar',
          factor: 1,
          min: 1500,
          max: 4000,
          description: 'Maximum boost pressure ceiling. Found via 7ADF marker.',
        }
      }
    }
    // Also check byte-swapped in case endianness assumption is wrong
    const valSwap = le ? view.getUint16(i, false) : view.getUint16(i, true)
    if (valSwap === 0x7ADF && i >= 2) {
      const svblRaw = rU16(i - 2)
      if (svblRaw >= 1500 && svblRaw <= 4000) {
        return {
          name: 'Boost Limiter (SVBL)',
          offset: i - 2,
          rawValue: svblRaw,
          physValue: svblRaw,
          unit: 'mbar',
          factor: 1,
          min: 1500,
          max: 4000,
          description: 'Maximum boost pressure ceiling. Found via 7ADF marker (swap).',
        }
      }
    }
  }

  // Strategy 3: Search near boost map for isolated boost ceiling values
  if (boostMapOffset && boostMapOffset > 512) {
    const from = Math.max(0, boostMapOffset - 1024) & ~1
    const to = Math.min(len - 2, boostMapOffset + 1024)
    for (let i = from; i < to; i += 2) {
      const val = rU16(i)
      if (val < 2000 || val > 3500) continue
      const before = i >= 2 ? rU16(i - 2) : 0
      const after = i + 2 < len ? rU16(i + 2) : 0
      if (Math.abs(before - val) > 500 && Math.abs(after - val) > 500) {
        return {
          name: 'Boost Limiter (SVBL)',
          offset: i,
          rawValue: val,
          physValue: val,
          unit: 'mbar',
          factor: 1,
          min: 1500,
          max: 4000,
          description: 'Boost pressure ceiling found near boost target map.',
        }
      }
    }
  }

  return null
}

/**
 * Find RPM hardcut limiter.
 * Strategy 1: Search for byte pattern [14 B4 00] (5300 in big-endian context).
 * Strategy 2: Search for isolated RPM values (4800-5500) in cal region.
 */
export function findRPMLimiter(buffer: ArrayBuffer, le: boolean): FoundLimiter | null {
  const view = new DataView(buffer)
  const len = buffer.byteLength
  const rU16 = (off: number) => le ? view.getUint16(off, true) : view.getUint16(off, false)
  const searchStart = Math.floor(len * 0.70) & ~1

  // Search for typical RPM cut values as uint16
  const typicalLimits = [5300, 5200, 5100, 5000, 4900, 4800, 5400, 5500]

  for (const target of typicalLimits) {
    for (let i = searchStart; i < len - 6; i += 2) {
      const val = rU16(i)
      if (val !== target) continue

      // Validate: RPM limiters are isolated — neighbors are 0 or very different values
      const before = i >= 2 ? rU16(i - 2) : 0
      const after = i + 2 < len ? rU16(i + 2) : 0
      const isolated = (before === 0 || Math.abs(before - val) > 800) &&
                       (after === 0 || Math.abs(after - val) > 800)
      if (isolated) {
        return {
          name: 'RPM Hardcut Limiter',
          offset: i,
          rawValue: val,
          physValue: val,
          unit: 'RPM',
          factor: 1,
          min: 3000,
          max: 7000,
          description: 'Maximum engine speed before fuel cut. Raise for extended powerband.',
        }
      }
    }
  }
  return null
}

/**
 * Find all limiters in the binary.
 * Pass boostMapOffset from scanner results for better SVBL detection.
 */
export function findAllLimiters(buffer: ArrayBuffer, le: boolean, boostMapOffset?: number): FoundLimiter[] {
  const limiters: FoundLimiter[] = []
  const svbl = findSVBL(buffer, le, boostMapOffset)
  if (svbl) limiters.push(svbl)
  const rpm = findRPMLimiter(buffer, le)
  if (rpm) limiters.push(rpm)
  return limiters
}

// ─── Addon Macros ─────────────────────────────────────────────────────────────

/**
 * Apply Popcorn (Hardcut) limiter to the torque limitation map.
 * Zeroes out the last RPM column to create a "brick wall" in torque delivery.
 */
export function applyPopcorn(
  buffer: ArrayBuffer,
  torqueLimitCandidate: ScannedCandidate,
  le: boolean
): FeatureResult {
  const view = new DataView(buffer)
  const { offset, rows, cols } = torqueLimitCandidate
  const modified: number[] = []

  // Set the last column (highest RPM) values to 0
  for (let r = 0; r < rows; r++) {
    const lastColOff = offset + (r * cols + (cols - 1)) * 2
    if (lastColOff + 2 > buffer.byteLength) continue

    // Read current value for the second-to-last column — keep it at max
    const penultOff = offset + (r * cols + (cols - 2)) * 2
    const penultVal = le ? view.getUint16(penultOff, true) : view.getUint16(penultOff, false)

    // Ensure second-to-last is at max torque
    if (le) view.setUint16(penultOff, Math.max(penultVal, 4500), true)
    else view.setUint16(penultOff, Math.max(penultVal, 4500), false)
    modified.push(penultOff)

    // Zero out last column
    if (le) view.setUint16(lastColOff, 0, true)
    else view.setUint16(lastColOff, 0, false)
    modified.push(lastColOff)
  }

  return {
    success: true,
    message: `Popcorn applied: zeroed ${rows} cells in last RPM column at 0x${offset.toString(16).toUpperCase()}`,
    modifiedOffsets: modified,
  }
}

/**
 * Remove Popcorn — restore last column to match second-to-last column values.
 */
export function removePopcorn(
  buffer: ArrayBuffer,
  torqueLimitCandidate: ScannedCandidate,
  le: boolean
): FeatureResult {
  const view = new DataView(buffer)
  const { offset, rows, cols } = torqueLimitCandidate
  const modified: number[] = []

  for (let r = 0; r < rows; r++) {
    const penultOff = offset + (r * cols + (cols - 2)) * 2
    const lastColOff = offset + (r * cols + (cols - 1)) * 2
    if (lastColOff + 2 > buffer.byteLength) continue

    const penultVal = le ? view.getUint16(penultOff, true) : view.getUint16(penultOff, false)
    if (le) view.setUint16(lastColOff, penultVal, true)
    else view.setUint16(lastColOff, penultVal, false)
    modified.push(lastColOff)
  }

  return {
    success: true,
    message: `Popcorn removed: restored ${rows} cells in last RPM column`,
    modifiedOffsets: modified,
  }
}

/**
 * Apply Smoke on Launch — increase smoke limiter values at low airflow / mid RPM.
 * Returns the original values so they can be restored on disable.
 */
export function applySmokeOnLaunch(
  buffer: ArrayBuffer,
  smokeLimitCandidate: ScannedCandidate,
  le: boolean,
  multiplier = 1.35
): FeatureResult & { originalValues: Map<number, number> } {
  const view = new DataView(buffer)
  const { offset, rows, cols } = smokeLimitCandidate
  const modified: number[] = []
  const originalValues = new Map<number, number>()

  const colEnd = Math.min(4, cols)
  const rowStart = Math.min(3, rows - 1)
  const rowEnd = Math.min(8, rows)

  for (let r = rowStart; r < rowEnd; r++) {
    for (let c = 0; c < colEnd; c++) {
      const off = offset + (r * cols + c) * 2
      if (off + 2 > buffer.byteLength) continue

      const raw = le ? view.getUint16(off, true) : view.getUint16(off, false)
      originalValues.set(off, raw)
      const newVal = Math.min(65535, Math.round(raw * multiplier))
      if (le) view.setUint16(off, newVal, true)
      else view.setUint16(off, newVal, false)
      modified.push(off)
    }
  }

  return {
    success: true,
    message: `Smoke on Launch: +${Math.round((multiplier - 1) * 100)}% fuel in low-airflow zone (${modified.length} cells)`,
    modifiedOffsets: modified,
    originalValues,
  }
}

/**
 * Remove Smoke on Launch — restore original values.
 */
export function removeSmokeOnLaunch(
  buffer: ArrayBuffer,
  originalValues: Map<number, number>,
  le: boolean
): FeatureResult {
  const view = new DataView(buffer)
  const modified: number[] = []
  for (const [off, val] of originalValues) {
    if (off + 2 > buffer.byteLength) continue
    if (le) view.setUint16(off, val, true)
    else view.setUint16(off, val, false)
    modified.push(off)
  }
  return {
    success: true,
    message: `Smoke on Launch removed: ${modified.length} cells restored to stock`,
    modifiedOffsets: modified,
  }
}

/**
 * Write a single limiter value to the binary buffer.
 */
export function writeLimiterValue(
  buffer: ArrayBuffer,
  limiter: FoundLimiter,
  newPhysValue: number,
  le: boolean
): void {
  const view = new DataView(buffer)
  const rawVal = Math.round(newPhysValue / limiter.factor)
  const clamped = Math.max(0, Math.min(65535, rawVal))
  if (le) view.setUint16(limiter.offset, clamped, true)
  else view.setUint16(limiter.offset, clamped, false)
}
