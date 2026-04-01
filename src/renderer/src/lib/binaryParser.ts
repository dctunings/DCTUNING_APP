import type { EcuDef, MapDef, DataType } from './ecuDefinitions'
import { ECU_DEFINITIONS } from './ecuDefinitions'

export interface DetectedEcu {
  def: EcuDef
  confidence: number     // 0–1
  matchedStrings: string[]
  fileSize: number
}

export interface ExtractedMap {
  mapDef: MapDef
  data: number[][]      // physical values (after factor/offset applied)
  rawData: number[][]   // raw integer values as stored in binary
  offset: number        // byte offset where map was found (-1 = not found)
  found: boolean
}

// ─── ECU Detection ────────────────────────────────────────────────────────────
export function detectEcu(buffer: ArrayBuffer): DetectedEcu | null {
  const bytes = new Uint8Array(buffer)
  // Search up to 512KB (or full file if smaller) for ECU identification strings
  const searchLen = Math.min(524288, bytes.length)
  const searchSlice = bytes.slice(0, searchLen)
  const ascii = Array.from(searchSlice).map(b => b >= 32 && b < 127 ? String.fromCharCode(b) : ' ').join('')

  let best: DetectedEcu | null = null
  let bestScore = 0

  for (const def of ECU_DEFINITIONS) {
    const matched: string[] = []
    for (const s of def.identStrings) {
      if (ascii.includes(s)) matched.push(s)
    }
    // Also check file size range
    const sizeOk = buffer.byteLength >= def.fileSizeRange[0] && buffer.byteLength <= def.fileSizeRange[1]
    if (matched.length === 0 && !sizeOk) continue

    const score = (matched.length / def.identStrings.length) * 0.7 + (sizeOk ? 0.3 : 0)
    if (score > bestScore) {
      bestScore = score
      best = { def, confidence: score, matchedStrings: matched, fileSize: buffer.byteLength }
    }
  }

  return bestScore > 0.29 ? best : null
}

// ─── Signature search ─────────────────────────────────────────────────────────
function findSignature(bytes: Uint8Array, sig: number[]): number {
  outer: for (let i = 0; i <= bytes.length - sig.length; i++) {
    for (let j = 0; j < sig.length; j++) {
      if (bytes[i + j] !== sig[j]) continue outer
    }
    return i + sig.length  // return position AFTER the signature
  }
  return -1
}

// ─── Read value from buffer ───────────────────────────────────────────────────
function readVal(view: DataView, offset: number, dtype: DataType, le: boolean): number {
  switch (dtype) {
    case 'uint8':   return view.getUint8(offset)
    case 'int8':    return view.getInt8(offset)
    case 'uint16':  return view.getUint16(offset, le)
    case 'int16':   return view.getInt16(offset, le)
    case 'float32': return view.getFloat32(offset, le)
    default:        return view.getUint8(offset)
  }
}

function dtypeSize(dtype: DataType): number {
  switch (dtype) {
    case 'uint8': case 'int8':    return 1
    case 'uint16': case 'int16':  return 2
    case 'float32':               return 4
    default:                       return 1
  }
}

// ─── Extract a single map ─────────────────────────────────────────────────────
export function extractMap(buffer: ArrayBuffer, mapDef: MapDef): ExtractedMap {
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  const elSize = dtypeSize(mapDef.dtype)
  const needed = mapDef.rows * mapDef.cols * elSize

  const readAt = (pos: number) => {
    if (pos < 0 || pos + needed > buffer.byteLength) return null
    const raw: number[][] = []
    const phys: number[][] = []
    for (let r = 0; r < mapDef.rows; r++) {
      raw.push([])
      phys.push([])
      for (let c = 0; c < mapDef.cols; c++) {
        const rawVal = readVal(view, pos + (r * mapDef.cols + c) * elSize, mapDef.dtype, mapDef.le)
        raw[r].push(rawVal)
        phys[r].push(rawVal * mapDef.factor + mapDef.offsetVal)
      }
    }
    return { raw, phys }
  }

  // Try each signature
  for (const sig of mapDef.signatures) {
    let pos = findSignature(bytes, sig)
    if (pos === -1) continue
    pos += mapDef.sigOffset
    const result = readAt(pos)
    if (!result) continue
    return { mapDef, data: result.phys, rawData: result.raw, offset: pos, found: true }
  }

  // Fallback: use fixedOffset if provided (known variant-specific location)
  if (mapDef.fixedOffset !== undefined && mapDef.fixedOffset >= 0) {
    const result = readAt(mapDef.fixedOffset)
    if (result) {
      return { mapDef, data: result.phys, rawData: result.raw, offset: mapDef.fixedOffset, found: true }
    }
  }

  // Not found — return zeroed placeholder
  const empty = Array.from({ length: mapDef.rows }, () => Array(mapDef.cols).fill(0))
  return { mapDef, data: empty, rawData: empty, offset: -1, found: false }
}

// ─── Extract all maps for an ECU ─────────────────────────────────────────────
export function extractAllMaps(buffer: ArrayBuffer, ecuDef: EcuDef): ExtractedMap[] {
  return ecuDef.maps.map(m => extractMap(buffer, m))
}

// ─── Write value to buffer ────────────────────────────────────────────────────
function writeVal(view: DataView, offset: number, value: number, dtype: DataType, le: boolean): void {
  const clamped = Math.round(value)
  switch (dtype) {
    case 'uint8':   view.setUint8(offset, Math.max(0, Math.min(255, clamped))); break
    case 'int8':    view.setInt8(offset, Math.max(-128, Math.min(127, clamped))); break
    case 'uint16':  view.setUint16(offset, Math.max(0, Math.min(65535, clamped)), le); break
    case 'int16':   view.setInt16(offset, Math.max(-32768, Math.min(32767, clamped)), le); break
    case 'float32': view.setFloat32(offset, value, le); break
  }
}

// ─── Write map back into buffer ───────────────────────────────────────────────
export function writeMap(buffer: ArrayBuffer, extracted: ExtractedMap, newRaw: number[][]): ArrayBuffer {
  if (!extracted.found || extracted.offset < 0) return buffer
  const copy = buffer.slice(0)
  const view = new DataView(copy)
  const elSize = dtypeSize(extracted.mapDef.dtype)
  const { rows, cols, dtype, le } = extracted.mapDef
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const off = extracted.offset + (r * cols + c) * elSize
      writeVal(view, off, newRaw[r][c], dtype, le)
    }
  }
  return copy
}
