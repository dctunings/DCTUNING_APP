import type { EcuDef } from './ecuDefinitions'

export interface ChecksumInfo {
  algo: string
  offset: number
  stored: number
  calculated: number
  valid: boolean
}

// ─── Bosch CRC32 (simplified) ─────────────────────────────────────────────────
const CRC32_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    t[i] = c
  }
  return t
})()

function crc32(bytes: Uint8Array, start: number, length: number): number {
  let crc = 0xFFFFFFFF
  for (let i = start; i < start + length && i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8)
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

// ─── Bosch simple additive checksum ─────────────────────────────────────────
function boschSimple(bytes: Uint8Array, start: number, length: number): number {
  let sum = 0
  for (let i = start; i < start + length - 2 && i < bytes.length; i++) {
    sum = (sum + bytes[i]) & 0xFFFF
  }
  return sum
}

// ─── Verify checksum ──────────────────────────────────────────────────────────
export function verifyChecksum(buffer: ArrayBuffer, ecuDef: EcuDef): ChecksumInfo {
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  const algo = ecuDef.checksumAlgo

  let stored = 0
  let calculated = 0

  if (algo === 'bosch-crc32' || algo === 'continental-crc') {
    stored = view.getUint32(ecuDef.checksumOffset, true)
    // Calculate over entire file excluding checksum bytes
    const tmpBytes = new Uint8Array(buffer.slice(0))
    for (let i = 0; i < 4; i++) tmpBytes[ecuDef.checksumOffset + i] = 0xFF
    calculated = crc32(tmpBytes, 0, tmpBytes.length)
  } else if (algo === 'bosch-simple') {
    stored = view.getUint16(ecuDef.checksumOffset, false)
    calculated = boschSimple(bytes, 0, ecuDef.checksumOffset + ecuDef.checksumLength)
  }

  return {
    algo,
    offset: ecuDef.checksumOffset,
    stored,
    calculated,
    valid: stored === calculated,
  }
}

// ─── Correct checksum ─────────────────────────────────────────────────────────
export function correctChecksum(buffer: ArrayBuffer, ecuDef: EcuDef): ArrayBuffer {
  const copy = buffer.slice(0)
  const bytes = new Uint8Array(copy)
  const view = new DataView(copy)
  const algo = ecuDef.checksumAlgo

  if (algo === 'bosch-crc32' || algo === 'continental-crc') {
    const tmp = new Uint8Array(copy.slice(0))
    for (let i = 0; i < 4; i++) tmp[ecuDef.checksumOffset + i] = 0xFF
    const newCrc = crc32(tmp, 0, tmp.length)
    view.setUint32(ecuDef.checksumOffset, newCrc, true)
  } else if (algo === 'bosch-simple') {
    const newSum = boschSimple(bytes, 0, ecuDef.checksumOffset)
    view.setUint16(ecuDef.checksumOffset, newSum, false)
  }

  return copy
}
