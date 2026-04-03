// src/renderer/src/lib/dtcRemoval.ts
// DTC (Diagnostic Trouble Code) suppression for common emissions systems.
//
// Approach:
//   1. ASCII DAMOS symbol search — Bosch ME7/ME9 embeds calibration variable names
//      as ASCII in the binary. We find the name, then zero the value byte at a
//      known fixed offset. This is the most reliable approach for ME7.
//   2. DAMOS label search — EDC16/EDC17 sometimes embeds map labels as ASCII.
//      We search for known EGR/DPF/SCR enable map names and zero their value bytes.
//   3. OBD-II P-code scan — scan for 2-byte P-code values in DTC definition tables,
//      then zero the adjacent monitoring enable byte.
//   4. Safe-only: we NEVER write to a region we haven't confidently located.
//      Every pattern match is validated (byte range, not in header, unique offset).

// ─── DTC Group Catalog ────────────────────────────────────────────────────────
// Maps add-on IDs to the OBD-II codes they suppress and a plain-language note.

export interface DTCGroup {
  id: string
  label: string
  codes: string[]
  addonId: string
  note: string
}

export const DTC_GROUPS: DTCGroup[] = [
  {
    id: 'egr_flow',
    label: 'EGR Flow / Position',
    codes: ['P0401', 'P0402', 'P0403', 'P0404', 'P0405', 'P0406', 'P0407', 'P0408'],
    addonId: 'egr_dtcs',
    note: 'EGR valve position and flow monitoring. Required after physical EGR removal or blanking.',
  },
  {
    id: 'dpf_diff',
    label: 'DPF Differential Pressure',
    codes: ['P2002', 'P2003', 'P244A', 'P244B', 'P2452', 'P2453'],
    addonId: 'dpf_sensors',
    note: 'DPF differential pressure sensor monitoring. Suppressed after DPF physical removal.',
  },
  {
    id: 'dpf_temp',
    label: 'DPF Temperature Sensor',
    codes: ['P0544', 'P0545', 'P0546', 'P2033', 'P2080', 'P2084'],
    addonId: 'dpf_sensors',
    note: 'DPF pre/post temperature sensor monitoring. Suppressed alongside DPF pressure monitoring.',
  },
  {
    id: 'cat_eff',
    label: 'Catalyst Efficiency',
    codes: ['P0420', 'P0421', 'P0430', 'P0431'],
    addonId: 'cat',
    note: 'Downstream lambda-based catalyst efficiency monitor (P0420/P0430). Suppressed after cat removal.',
  },
  {
    id: 'lambda_ds',
    label: 'Downstream Lambda / O2',
    codes: ['P0136', 'P0137', 'P0138', 'P0140', 'P0141', 'P0146', 'P0147', 'P0148'],
    addonId: 'cat',
    note: 'Downstream O2 heater and plausibility monitoring. Disabled when cat monitor is suppressed.',
  },
  {
    id: 'adblue_sys',
    label: 'AdBlue / SCR System',
    codes: ['P207F', 'P20EE', 'P2047', 'P2048', 'P229F', 'P2BAD', 'P203A'],
    addonId: 'adblue',
    note: 'DEF quality, SCR dosing, pump and efficiency monitoring. For off-road / agricultural use only.',
  },
  {
    id: 'sai_pump',
    label: 'Secondary Air Injection',
    codes: ['P0410', 'P0411', 'P0412', 'P0413', 'P0414', 'P0415'],
    addonId: 'sai',
    note: 'SAI pump operation and airflow monitoring. Common on VAG petrol engines 2001–2010.',
  },
  {
    id: 'evap_sys',
    label: 'EVAP Leak Detection',
    codes: ['P0440', 'P0441', 'P0442', 'P0455', 'P0456', 'P0457'],
    addonId: 'evap',
    note: 'EVAP purge valve and fuel tank vapour leak detection monitoring.',
  },
]

// ─── Binary Pattern Definitions ───────────────────────────────────────────────
// Each pattern: find `signature` bytes anywhere in the binary, then write
// `zeroValue` at offset `valueOffset` bytes AFTER the end of the signature.
// Validated: target byte must be in range [minByte, maxByte] before writing.
// ecuFamilies: if set, only apply when ECU family matches.

interface DTCPattern {
  signature: number[]
  valueOffset: number
  zeroValue: number
  addonId: string
  minByte?: number     // original byte must be >= this (default 1) — prevents double-write
  maxByte?: number     // original byte must be <= this (default 255)
  ecuFamilies?: string[]
  label: string        // human-readable description of what this pattern controls
}

const DTC_PATTERNS: DTCPattern[] = [

  // ── ME7: SAI enable codeword (CWSAK = 0x00 disables SAI pump) ────────────────
  // ME7 stores byte codewords as VALUE characteristics. The DAMOS name is embedded
  // in the binary as ASCII before the value. CWSAK=1 enables SAI; CWSAK=0 disables.
  {
    signature: [0x43,0x57,0x53,0x41,0x4B],  // "CWSAK"
    valueOffset: 6, zeroValue: 0x00,
    addonId: 'sai', ecuFamilies: ['me7'],
    minByte: 1,
    label: 'ME7 SAI enable codeword (CWSAK)',
  },

  // ── ME7: Downstream lambda monitor enable (CWLAM2D = 0x00 disables cat check) ──
  // Controls whether the downstream O2 is checked for P0420/P0421 catalyst efficiency.
  {
    signature: [0x43,0x57,0x4C,0x41,0x4D,0x32,0x44],  // "CWLAM2D"
    valueOffset: 8, zeroValue: 0x00,
    addonId: 'cat', ecuFamilies: ['me7'],
    minByte: 1,
    label: 'ME7 downstream lambda monitor enable (CWLAM2D)',
  },

  // ── ME7: EVAP purge system enable (CWTEA = 0x00 disables EVAP) ───────────────
  {
    signature: [0x43,0x57,0x54,0x45,0x41],  // "CWTEA"
    valueOffset: 6, zeroValue: 0x00,
    addonId: 'evap', ecuFamilies: ['me7'],
    minByte: 1,
    label: 'ME7 EVAP enable codeword (CWTEA)',
  },

  // ── ME7: SAI second enable (CWSAK2) ──────────────────────────────────────────
  {
    signature: [0x43,0x57,0x53,0x41,0x4B,0x32],  // "CWSAK2"
    valueOffset: 6, zeroValue: 0x00,
    addonId: 'sai', ecuFamilies: ['me7'],
    minByte: 1,
    label: 'ME7 SAI secondary enable (CWSAK2)',
  },

  // ── EDC16/EDC17: EGR monitoring inhibit (FGRINH) ────────────────────────────
  // "FGRINH" = Fehler GRenzwert INHibit — EGR fault threshold inhibit.
  // When set to 0xFF or 0x01, EGR DTC monitoring is active. Zeroing disables it.
  {
    signature: [0x46,0x47,0x52,0x49,0x4E,0x48],  // "FGRINH"
    valueOffset: 2, zeroValue: 0x00,
    addonId: 'egr_dtcs',
    label: 'Bosch EGR DTC inhibit flag (FGRINH)',
  },

  // ── EDC16/EDC17: EGR active enable (EGRAKT) ──────────────────────────────────
  {
    signature: [0x45,0x47,0x52,0x41,0x4B,0x54],  // "EGRAKT"
    valueOffset: 2, zeroValue: 0x00,
    addonId: 'egr_dtcs',
    label: 'Bosch EGR active enable (EGRAKT)',
  },

  // ── EDC16/EDC17: DPF activation flag (DPFAKTIV) ──────────────────────────────
  // Main DPF system enable. Zeroing stops DPF pressure and regen monitoring.
  {
    signature: [0x44,0x50,0x46,0x41,0x4B,0x54,0x49,0x56],  // "DPFAKTIV"
    valueOffset: 2, zeroValue: 0x00,
    addonId: 'dpf_sensors',
    label: 'Bosch DPF system activation flag (DPFAKTIV)',
  },

  // ── EDC16/EDC17: DPF enable byte (DPFENABL) ──────────────────────────────────
  {
    signature: [0x44,0x50,0x46,0x45,0x4E,0x41,0x42,0x4C],  // "DPFENABL"
    valueOffset: 2, zeroValue: 0x00,
    addonId: 'dpf_sensors',
    label: 'Bosch DPF monitoring enable (DPFENABL)',
  },

  // ── EDC17: AdBlue/SCR dosing master enable (MFAMBWS) ─────────────────────────
  // Controls the SCR dosing system. Zeroing suppresses all SCR-related DTCs.
  {
    signature: [0x4D,0x46,0x41,0x4D,0x42,0x57,0x53],  // "MFAMBWS"
    valueOffset: 2, zeroValue: 0x00,
    addonId: 'adblue',
    label: 'Bosch SCR dosing master enable (MFAMBWS)',
  },

  // ── EDC17: SCR system enable (SCRENABLE / SCRENABL) ──────────────────────────
  {
    signature: [0x53,0x43,0x52,0x45,0x4E,0x41,0x42,0x4C],  // "SCRENABL"
    valueOffset: 2, zeroValue: 0x00,
    addonId: 'adblue',
    label: 'Bosch SCR system enable (SCRENABL)',
  },

  // ── EDC17: AdBlue quality monitoring (AMBSWQMON) ─────────────────────────────
  {
    signature: [0x41,0x4D,0x42,0x53,0x57,0x51,0x4D,0x4F,0x4E],  // "AMBSWQMON"
    valueOffset: 2, zeroValue: 0x00,
    addonId: 'adblue',
    label: 'Bosch AdBlue quality monitor enable (AMBSWQMON)',
  },

  // ── MED17 / ME9: Downstream lambda enable (CWLAMBDA2) ────────────────────────
  {
    signature: [0x43,0x57,0x4C,0x41,0x4D,0x42,0x44,0x41,0x32],  // "CWLAMBDA2" (some variants)
    valueOffset: 8, zeroValue: 0x00,
    addonId: 'cat',
    minByte: 1,
    label: 'MED17 downstream lambda enable (CWLAMBDA2)',
  },

  // ── OBD-II P-code table: EGR codes stored as uint16 BE in DTC definition table ─
  // Bosch stores OBD-II codes as 2-byte big-endian values followed by a monitoring
  // enable nibble. We look for the code and zero the byte at +2 (enable flag).
  // P0401 = [0x04,0x01], P0404 = [0x04,0x04]
  {
    signature: [0x04,0x01,0x00,0x01],  // P0401 + 0x00 + enable=0x01
    valueOffset: 3, zeroValue: 0x00,
    addonId: 'egr_dtcs', minByte: 1, maxByte: 1,
    label: 'OBD-II P0401 EGR Flow Low monitor enable',
  },
  {
    signature: [0x04,0x04,0x00,0x01],  // P0404 + 0x00 + enable=0x01
    valueOffset: 3, zeroValue: 0x00,
    addonId: 'egr_dtcs', minByte: 1, maxByte: 1,
    label: 'OBD-II P0404 EGR Circuit Range monitor enable',
  },
  {
    signature: [0x04,0x05,0x00,0x01],  // P0405 + enable
    valueOffset: 3, zeroValue: 0x00,
    addonId: 'egr_dtcs', minByte: 1, maxByte: 1,
    label: 'OBD-II P0405 EGR Sensor A Low monitor enable',
  },
  // P2002 DPF efficiency
  {
    signature: [0x20,0x02,0x00,0x01],  // P2002 + enable
    valueOffset: 3, zeroValue: 0x00,
    addonId: 'dpf_sensors', minByte: 1, maxByte: 1,
    label: 'OBD-II P2002 DPF Efficiency Low monitor enable',
  },
  // P244A DPF differential pressure
  {
    signature: [0x24,0x4A,0x00,0x01],
    valueOffset: 3, zeroValue: 0x00,
    addonId: 'dpf_sensors', minByte: 1, maxByte: 1,
    label: 'OBD-II P244A DPF Pressure Differential Low monitor enable',
  },
  // P0420 cat efficiency
  {
    signature: [0x04,0x20,0x00,0x01],
    valueOffset: 3, zeroValue: 0x00,
    addonId: 'cat', minByte: 1, maxByte: 1,
    label: 'OBD-II P0420 Catalyst Efficiency Bank 1 monitor enable',
  },
  {
    signature: [0x04,0x30,0x00,0x01],  // P0430 bank 2
    valueOffset: 3, zeroValue: 0x00,
    addonId: 'cat', minByte: 1, maxByte: 1,
    label: 'OBD-II P0430 Catalyst Efficiency Bank 2 monitor enable',
  },
  // P207F AdBlue quality
  {
    signature: [0x20,0x7F,0x00,0x01],
    valueOffset: 3, zeroValue: 0x00,
    addonId: 'adblue', minByte: 1, maxByte: 1,
    label: 'OBD-II P207F Reductant Quality Sensor Circuit monitor enable',
  },
  {
    signature: [0x20,0xEE,0x00,0x01],  // P20EE
    valueOffset: 3, zeroValue: 0x00,
    addonId: 'adblue', minByte: 1, maxByte: 1,
    label: 'OBD-II P20EE SCR NOx Catalyst Efficiency monitor enable',
  },
  // P0410 SAI
  {
    signature: [0x04,0x10,0x00,0x01],
    valueOffset: 3, zeroValue: 0x00,
    addonId: 'sai', minByte: 1, maxByte: 1,
    label: 'OBD-II P0410 Secondary Air Injection System monitor enable',
  },
  // P0440 EVAP
  {
    signature: [0x04,0x40,0x00,0x01],
    valueOffset: 3, zeroValue: 0x00,
    addonId: 'evap', minByte: 1, maxByte: 1,
    label: 'OBD-II P0440 EVAP System monitor enable',
  },
]

// ─── Scan result ──────────────────────────────────────────────────────────────

export interface DTCPatternResult {
  label: string
  addonId: string
  found: boolean
  offset: number       // offset of the value byte in the buffer
  originalByte: number
  newByte: number
}

// ─── Scan for DTC patterns ────────────────────────────────────────────────────
// Returns all patterns that were found (regardless of whether they'd be written).
// Used for UI preview — shows tuner what will be changed.

export function scanDTCPatterns(
  buffer: ArrayBuffer,
  addonIds: string[],
  ecuId = '',
): DTCPatternResult[] {
  const bytes = new Uint8Array(buffer)
  const results: DTCPatternResult[] = []
  // Skip the first 256 bytes (file header area) and the last 64 bytes
  const scanStart = 256
  const scanEnd = bytes.length - 64

  for (const pattern of DTC_PATTERNS) {
    if (!addonIds.includes(pattern.addonId)) continue
    // ECU family filter
    if (pattern.ecuFamilies) {
      const match = pattern.ecuFamilies.some(f => ecuId === f || ecuId.startsWith(f + '_'))
      if (!match) continue
    }

    const sig = pattern.signature
    // Scan for signature
    outer: for (let i = scanStart; i < scanEnd - sig.length - pattern.valueOffset; i++) {
      for (let j = 0; j < sig.length; j++) {
        if (bytes[i + j] !== sig[j]) continue outer
      }
      // Signature found — check target byte
      const valueIdx = i + sig.length + pattern.valueOffset
      if (valueIdx >= bytes.length) continue
      const original = bytes[valueIdx]
      const minB = pattern.minByte ?? 1
      const maxB = pattern.maxByte ?? 255
      if (original < minB || original > maxB) continue
      results.push({
        label: pattern.label,
        addonId: pattern.addonId,
        found: true,
        offset: valueIdx,
        originalByte: original,
        newByte: pattern.zeroValue,
      })
      break  // one match per pattern is enough
    }
  }

  return results
}

// ─── Apply DTC suppression ────────────────────────────────────────────────────
// Applies all found suppressions and returns {modifiedBuffer, results}.
// Safe: only writes to bytes that were confidently located by pattern scan.

export function suppressDTCs(
  buffer: ArrayBuffer,
  addonIds: string[],
  ecuId = '',
): { modifiedBuffer: ArrayBuffer; results: DTCPatternResult[]; suppressedCount: number } {
  const found = scanDTCPatterns(buffer, addonIds, ecuId)
  if (found.length === 0) {
    return { modifiedBuffer: buffer, results: [], suppressedCount: 0 }
  }

  const out = new Uint8Array(buffer.slice(0))
  // Deduplicate by offset — never write the same byte twice
  const written = new Set<number>()
  let suppressedCount = 0

  for (const r of found) {
    if (written.has(r.offset)) continue
    out[r.offset] = r.newByte
    written.add(r.offset)
    suppressedCount++
  }

  return { modifiedBuffer: out.buffer, results: found, suppressedCount }
}

// ─── Get DTC groups for active addons ────────────────────────────────────────
// Returns only the DTC groups relevant to the currently selected addons.

export function getActiveDTCGroups(addonIds: string[]): DTCGroup[] {
  return DTC_GROUPS.filter(g => addonIds.includes(g.addonId))
}
