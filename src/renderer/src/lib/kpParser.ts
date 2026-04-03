// src/renderer/src/lib/kpParser.ts
// WinOLS MapPack (.kp) file parser for the browser/Electron renderer.
//
// KP format:
//   Binary header (variable) → embedded ZIP starting at PK\x03\x04 signature
//   Inside the ZIP: a file named "intern" (flat binary map database)
//   Each record in intern: [uint32 nameLen][name bytes][null byte][fixed data ~425 bytes]
//   Address is a uint32 LE within the fixed data, heuristically found in range [0x100, 0x800000].

import { decompressSync } from 'fflate'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KPMap {
  name: string
  address: number
  rows: number
  cols: number
}

export interface KPParseResult {
  maps: KPMap[]
  warnings: string[]
}

export interface KPConvertedMap {
  name: string
  description: string
  category: 'boost' | 'fuel' | 'ignition' | 'torque' | 'limiter' | 'egr' | 'dpf' | 'other'
  address: number
  fileOffset: number
  rows: number
  cols: number
  dataType: 'uint8' | 'uint16' | 'int8' | 'int16' | 'float32'
  factor: number
  physicalOffset: number
  min: number
  max: number
  axisX: { size: number; min: number; max: number; label: string }
  axisY: { size: number; min: number; max: number; label: string } | undefined
  source: 'KP'
}

// ─── Names to skip (structural / metadata entries in intern) ─────────────────
const KP_SKIP_NAMES = new Set([
  'intern', 'Hexdump', 'Binary data', 'Passenger car', 'Engine',
  'Motor', 'My maps', 'PKW', 'LKW', 'Bike', 'Original',
  'Version 1', 'Version 2', 'Version 3',
])

// ─── Category inference from map name keywords ────────────────────────────────
function inferCategory(name: string): KPConvertedMap['category'] {
  const u = name.toUpperCase()
  if (/BOOST|TURBO|WASTEGATE|MANIFOLD|MAP_BOOST|BOOST_LIMIT/.test(u)) return 'boost'
  if (/FUEL|INJECT|LAMBDA|AFR|RAIL|SOI|EOI|PILOT|POST|QUANTITY|STOICH/.test(u)) return 'fuel'
  if (/IGNIT|TIMING|SPARK|KNOCK|ADVANCE|RETARD|KFZW/.test(u)) return 'ignition'
  if (/TORQUE|TORQ|NM[_ ]|TQ/.test(u)) return 'torque'
  if (/LIMITER|LIMIT|RPM_MAX|REV_LIM|SPEED_LIM/.test(u)) return 'limiter'
  if (/EGR/.test(u)) return 'egr'
  if (/DPF|FAP|REGEN/.test(u)) return 'dpf'
  return 'other'
}

// ─── Axis inference (same approach as drtParser) ─────────────────────────────
function inferAxes(category: string, cols: number, rows: number): {
  axisX: KPConvertedMap['axisX']
  axisY: KPConvertedMap['axisY']
} {
  const rpmMax = category === 'limiter' ? 7000 : 5000
  const axisX = { size: Math.max(cols, 1), min: 750, max: rpmMax, label: 'RPM' }
  if (rows <= 1) return { axisX, axisY: undefined }
  const yDefs: Record<string, { min: number; max: number; label: string }> = {
    boost:    { min: 0,   max: 120,  label: 'IQ mg/st'  },
    fuel:     { min: 0,   max: 100,  label: 'Load %'    },
    torque:   { min: 900, max: 1050, label: 'Baro hPa'  },
    ignition: { min: 0,   max: 120,  label: 'IQ mg/st'  },
    limiter:  { min: 0,   max: 100,  label: 'Load %'    },
  }
  const yDef = yDefs[category] ?? { min: 0, max: rows, label: `${rows} pts` }
  return { axisX, axisY: { size: rows, ...yDef } }
}

// ─── Minimal ZIP local-file extractor ────────────────────────────────────────
// Walks ZIP local file entries (PK\x03\x04) without relying on the central directory.
// Finds the entry named "intern" and decompresses it using fflate.
// Supports deflate (method 8) and stored (method 0).
function extractInternFromZip(zipBytes: Uint8Array): Uint8Array | null {
  const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength)
  let pos = 0

  while (pos + 30 < zipBytes.length) {
    // Local file header signature
    if (view.getUint32(pos, true) !== 0x04034b50) break

    const method       = view.getUint16(pos + 8,  true)
    const crc32        = view.getUint32(pos + 14, true)  // eslint-disable-line @typescript-eslint/no-unused-vars
    const compSize     = view.getUint32(pos + 18, true)
    const uncompSize   = view.getUint32(pos + 22, true)
    const nameLen      = view.getUint16(pos + 26, true)
    const extraLen     = view.getUint16(pos + 28, true)

    const nameBytes = zipBytes.slice(pos + 30, pos + 30 + nameLen)
    const entryName = new TextDecoder('ascii').decode(nameBytes)
    const dataStart = pos + 30 + nameLen + extraLen
    const dataEnd   = dataStart + compSize

    if (entryName === 'intern') {
      const compressedData = zipBytes.slice(dataStart, dataEnd)
      if (method === 0) {
        // Stored — no compression
        return compressedData
      } else if (method === 8) {
        // Deflate — use fflate (raw inflate, no zlib header)
        try {
          return decompressSync(compressedData, new Uint8Array(uncompSize))
        } catch {
          // fflate decompressSync expects raw deflate; try with zlib header stripped
          try {
            // Some ZIPs embed a zlib-wrapped deflate stream — strip the 2-byte header
            return decompressSync(compressedData.slice(2), new Uint8Array(uncompSize))
          } catch {
            return null
          }
        }
      }
      return null  // unsupported compression
    }

    pos = dataEnd
    // Guard: if compSize is 0 and we're stuck, advance
    if (compSize === 0) pos += nameLen + extraLen + 30
  }

  return null
}

// ─── intern binary parser ─────────────────────────────────────────────────────
// Scans for length-prefixed ASCII strings followed by null byte + fixed data block.
// Each valid record: [uint32 nameLen][nameBytes][0x00][~425 bytes fixed data]
// Fixed record size = 430 + nameLen (advance this on each hit to stay aligned).
const RECORD_FIXED_SIZE = 430

function parseIntern(d: Uint8Array): KPMap[] {
  const view = new DataView(d.buffer, d.byteOffset, d.byteLength)
  const results: KPMap[] = []
  const seenAddresses = new Set<number>()
  let i = 0

  while (i < d.length - 8) {
    // Read candidate name length (uint32 LE)
    if (i + 4 > d.length) break
    const nameLen = view.getUint32(i, true)

    if (nameLen >= 3 && nameLen <= 80 && i + 4 + nameLen < d.length) {
      // All bytes printable ASCII?
      let isPrintable = true
      for (let k = i + 4; k < i + 4 + nameLen; k++) {
        if (d[k] < 32 || d[k] >= 127) { isPrintable = false; break }
      }
      const hasNull = d[i + 4 + nameLen] === 0x00

      if (isPrintable && hasNull) {
        const name = new TextDecoder('ascii').decode(d.slice(i + 4, i + 4 + nameLen))

        // Skip structural / metadata names
        const skip = KP_SKIP_NAMES.has(name)
          || name.startsWith('DW ')
          || name.startsWith('Version ')

        if (!skip) {
          // Fixed data starts right after name + null byte
          const fixedStart = i + 4 + nameLen + 1

          // Dimensions: fields at fixedStart+4 and fixedStart+8
          let rows = 0
          let cols = 0
          if (fixedStart + 12 <= d.length) {
            // f0 = element size, f1 = rows candidate, f2 = cols candidate
            const f1 = view.getUint32(fixedStart + 4,  true)
            const f2 = view.getUint32(fixedStart + 8,  true)
            if (f1 >= 1 && f1 <= 50) rows = f1
            if (f2 >= 1 && f2 <= 50) cols = f2
          }

          // Address: first uint32 in classic range [0x100, 0x800000] OR TriCore range
          // [0x80000000, 0x80FFFFFF] (EDC17, MED17, MG1 flash mapped at 0x80000000+).
          let address: number | null = null
          const scanEnd = Math.min(fixedStart + 250, d.length - 4)
          for (let s = fixedStart + 20; s <= scanEnd; s += 4) {
            const candidate = view.getUint32(s, true)
            const isClassic  = candidate >= 0x100      && candidate <= 0x800000
            const isTriCore  = candidate >= 0x80000000 && candidate <= 0x80FFFFFF
            if (isClassic || isTriCore) {
              address = candidate
              break
            }
          }

          if (address !== null && !seenAddresses.has(address)) {
            seenAddresses.add(address)
            results.push({ name, address, rows: Math.max(rows, 1), cols: Math.max(cols, 1) })
          }
        }

        // Advance by fixed record size
        i += RECORD_FIXED_SIZE + nameLen
        continue
      }
    }
    i++
  }

  return results
}

// ─── Main KP parser ───────────────────────────────────────────────────────────
export function parseKP(buffer: ArrayBuffer): KPParseResult {
  const bytes = new Uint8Array(buffer)
  const warnings: string[] = []

  // Find embedded ZIP (PK\x03\x04 signature)
  let pkOffset = -1
  for (let i = 0; i < bytes.length - 4; i++) {
    if (bytes[i] === 0x50 && bytes[i+1] === 0x4B && bytes[i+2] === 0x03 && bytes[i+3] === 0x04) {
      pkOffset = i
      break
    }
  }

  if (pkOffset < 0) {
    warnings.push('No embedded ZIP found — old format or corrupt file')
    return { maps: [], warnings }
  }

  const zipBytes = bytes.slice(pkOffset)
  const internData = extractInternFromZip(zipBytes)

  if (!internData) {
    warnings.push('Could not extract "intern" file from embedded ZIP')
    return { maps: [], warnings }
  }

  const maps = parseIntern(internData)

  if (maps.length === 0) {
    warnings.push('No maps found in intern binary — format may differ from expected')
  }

  return { maps, warnings }
}

// ─── Convert KP maps to RemapBuilder-compatible format ───────────────────────
export function convertKPMaps(result: KPParseResult): KPConvertedMap[] {
  return result.maps.map(m => {
    const category = inferCategory(m.name)
    const { axisX, axisY } = inferAxes(category, m.cols, m.rows)
    const dataType = 'uint16'  // KP doesn't specify; uint16 is the most common ECU map type
    const factor = 1
    const physicalOffset = 0
    return {
      name: `${m.name}_${m.address.toString(16).toUpperCase().padStart(6, '0')}`,
      description: m.name,
      category,
      address: m.address,
      // TriCore ECUs map flash at 0x80000000 — subtract base to get file offset.
      // Classic ECUs (HC12, ST10) use address directly as file offset.
      fileOffset: m.address >= 0x80000000 ? m.address - 0x80000000 : m.address,
      rows: m.rows,
      cols: m.cols,
      dataType,
      factor,
      physicalOffset,
      min: 0,
      max: 65535,
      axisX,
      axisY,
      source: 'KP' as const,
    }
  })
}
