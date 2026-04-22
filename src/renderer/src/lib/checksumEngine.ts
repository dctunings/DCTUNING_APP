import type { EcuDef } from './ecuDefinitions'

export interface ChecksumInfo {
  algo: string
  offset: number
  stored: number
  calculated: number
  valid: boolean
}

export interface BlockCorrectionResult {
  blocksFixed: number
  tableOffset: number
  initMode: 'standard' | 'blockid' | 'bosch' | 'monolithic'
  // 'monolithic' — file has a valid Bosch program descriptor header (FADECAFE/CAFEAFFE
  // magic at 0x40000 area, typical of EDC16U VW PD-TDI monolithic cal files) but NO
  // separate block CRC table. The single header CRC (bosch-crc32) is already sufficient —
  // no block corrections needed. UI should show "✓ monolithic file" instead of warning.
}

// ─── CRC32 lookup table (reflected polynomial 0xEDB88320) ─────────────────────
const CRC32_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    t[i] = c
  }
  return t
})()

// ─── Core CRC32 engine — handles any init value, always final-XORs 0xFFFFFFFF ──
function crc32Core(bytes: Uint8Array, start: number, length: number, init: number): number {
  let crc = init >>> 0
  for (let i = start; i < start + length && i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8)
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

// Standard CRC32 — init 0xFFFFFFFF, XorOut 0xFFFFFFFF
// Used for: older Continental ECUs
function crc32(bytes: Uint8Array, start: number, length: number): number {
  return crc32Core(bytes, start, length, 0xFFFFFFFF)
}

// Bosch EDC17/MED17 CRC32 — init 0xFADECAFE (EEPROM/header context)
// Research note: PFLASH block CRCs use block-ID as seed; handled in correctBlockChecksums.
// 0xFADECAFE is used for the main header/EEPROM checksum context on Tricore EDC17/MED17.
function crc32Bosch(bytes: Uint8Array, start: number, length: number): number {
  return crc32Core(bytes, start, length, 0xFADECAFE)
}

// Block CRC32 — custom initial value (Bosch block ID or index as init)
function crc32WithInit(bytes: Uint8Array, start: number, length: number, init: number): number {
  return crc32Core(bytes, start, length, init)
}

// ─── ME7.x / ME9 word-based additive checksum ─────────────────────────────────
// Confirmed by ME7Sum (nyetwurk/ME7Sum on GitHub) and ME7 tuning community:
//   • Sums 16-bit BIG-ENDIAN words (not individual bytes) from address 0 to checksumOffset
//   • Accumulates in 32 bits to preserve carries across word boundaries
//   • Stored value = two's complement of the low 16 bits (~sum + 1) & 0xFFFF
//   • An INVERSE word (~checksum) is stored at checksumOffset+2 as a sanity check
//
// This is entirely different from a byte-sum — summing bytes produces wrong results on ME7.
// Verified: if you sum the words including the checksum word, the total wraps to 0x0000.
function boschWordChecksum(bytes: Uint8Array, endOffset: number): number {
  let sum = 0
  for (let i = 0; i + 1 < endOffset && i + 1 < bytes.length; i += 2) {
    const word = (bytes[i] << 8) | bytes[i + 1]  // big-endian uint16
    sum = (sum + word) >>> 0  // 32-bit accumulator — must not truncate mid-loop
  }
  return (~sum + 1) & 0xFFFF  // two's complement of low 16 bits
}

// ─── Siemens/Continental PPD1 CRC32 (forward, poly 0x04C11DB7) ───────────────
// Used on Siemens PPD1.1/PPD1.2/PPD1.3/PPD1.5 VAG PD-TDI ECUs (03G906018*, 2MB flash).
// Algorithm (reverse-engineered from 03G906018DH SN100L8 ORI/Stage1 pair, verified
// against 3 additional pairs — SN100K5300000 0271/A213 and SN100L8 8DE3):
//   1. Read block descriptor table at (checksumOffset + 4):
//        [count:u32 BE][start_addr:u32 BE, end_addr:u32 BE] × count
//   2. For each block, file offset = addr − 0x00800000 (flash base).
//   3. Compute CRC32 forward (non-reflected) with poly 0x04C11DB7, init = 0,
//      final XOR = 0, MSB-first byte feeding, over all block bytes concatenated.
//   4. Stored big-endian at checksumOffset.
// Reference binary 03G906018DH SN100L8 BC52.ori: 5 blocks, 248,384 bytes, csum 0x0C1D2D63.
const CRC32_FWD_TABLE = (() => {
  const POLY = 0x04C11DB7
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = (i << 24) >>> 0
    for (let j = 0; j < 8; j++) c = (c & 0x80000000) ? ((c << 1) ^ POLY) >>> 0 : (c << 1) >>> 0
    t[i] = c >>> 0
  }
  return t
})()

interface Ppd1Block { fileStart: number; fileEnd: number }

function parsePpd1Blocks(view: DataView, fileSize: number, csumOffset: number): Ppd1Block[] | null {
  const FLASH_BASE = 0x00800000
  if (csumOffset + 8 > fileSize) return null
  const count = view.getUint32(csumOffset + 4, false) // big-endian
  if (count === 0 || count > 32) return null
  if (csumOffset + 8 + count * 8 > fileSize) return null
  const blocks: Ppd1Block[] = []
  for (let i = 0; i < count; i++) {
    const s = view.getUint32(csumOffset + 8 + i * 8,     false)
    const e = view.getUint32(csumOffset + 8 + i * 8 + 4, false)
    if (s < FLASH_BASE || e < FLASH_BASE || e < s) return null
    const fs = s - FLASH_BASE, fe = e - FLASH_BASE
    if (fs >= fileSize || fe >= fileSize) return null
    blocks.push({ fileStart: fs, fileEnd: fe })
  }
  return blocks
}

function ppd1Crc32(bytes: Uint8Array, blocks: Ppd1Block[]): number {
  let crc = 0
  for (const b of blocks) {
    for (let i = b.fileStart; i <= b.fileEnd; i++) {
      crc = (CRC32_FWD_TABLE[((crc >>> 24) ^ bytes[i]) & 0xFF] ^ (crc << 8)) >>> 0
    }
  }
  return crc >>> 0
}

// ─── Bosch simple BYTE additive checksum (EDC15 / BMW MS43) ──────────────────
// Used on older platforms (M78/M797 processor) where 8-bit byte accumulation is correct.
// Note: calling convention uses checksumOffset+2 so the internal -2 lands correctly:
//   i < (checksumOffset+2) - 2 = checksumOffset → last byte summed = checksumOffset-1 ✓
function boschSimple(bytes: Uint8Array, start: number, length: number): number {
  let sum = 0
  for (let i = start; i < start + length - 2 && i < bytes.length; i++) {
    sum = (sum + bytes[i]) & 0xFFFF
  }
  return sum
}

// ─── Block table entry ────────────────────────────────────────────────────────
interface BlockEntry {
  startAddr: number
  endAddr: number
  csumOffset: number
  storedCRC: number
  index: number
}

// ─── Scan for Bosch block checksum table ──────────────────────────────────────
// Bosch EDC17/EDC16/MED17 embed a segment descriptor table in the binary.
// Each entry: [startAddr:u32, endAddr:u32, CRC32:u32] = 12 bytes, little-endian.
// Research (nefariousmotorsports.com / EDC17 community): three seed modes observed —
//   • 0xFFFFFFFF (standard/Continental)
//   • block-ID or index (Bosch PFLASH per-block CRC — each block has its own seed)
//   • 0xFADECAFE (some EEPROM/DFLASH context CRCs)
// We detect empirically by testing all three before modifying.
function findBlockTable(
  bytes: Uint8Array,
  view: DataView
): { entries: BlockEntry[]; initMode: 'standard' | 'blockid' | 'bosch'; tableOffset: number } | null {
  const fileSize = bytes.length
  // Known candidate locations for the block descriptor table in Bosch binaries
  const candidateOffsets = [0x000, 0x020, 0x200, 0x400, 0x800, 0x1000]
  // Common Bosch block IDs used as per-block CRC init values (documented in Nefmoto wiki)
  const boschBlockIds = [0x10, 0x40, 0x60, 0x80, 0x00, 0x01, 0x02, 0x03]

  for (const tableOffset of candidateOffsets) {
    const entries: BlockEntry[] = []

    for (let i = 0; i < 8; i++) {
      const off = tableOffset + i * 12
      if (off + 12 > fileSize) break

      const blockStart = view.getUint32(off, true)
      const blockEnd   = view.getUint32(off + 4, true)
      const storedCRC  = view.getUint32(off + 8, true)

      // Valid entry: start < end, both within file, block >= 1 KB, CRC not trivially erased
      if (
        blockStart < blockEnd &&
        blockEnd <= fileSize &&
        (blockEnd - blockStart) >= 1024 &&
        storedCRC !== 0x00000000 &&
        storedCRC !== 0xFFFFFFFF
      ) {
        entries.push({ startAddr: blockStart, endAddr: blockEnd, csumOffset: off + 8, storedCRC, index: i })
      } else {
        break
      }
    }

    if (entries.length < 2) continue

    // ── Mode 1: standard CRC32 (init = 0xFFFFFFFF) ───────────────────────────
    const stdChecks = entries.slice(0, Math.min(entries.length, 3))
    if (stdChecks.every(e => crc32(bytes, e.startAddr, e.endAddr - e.startAddr) === e.storedCRC)) {
      return { entries, initMode: 'standard', tableOffset }
    }

    // ── Mode 2: block-ID CRC32 — try entry index as init ─────────────────────
    // This is the most common EDC17 PFLASH CRC mode — each block uses its own ID as seed.
    if (entries.slice(0, Math.min(entries.length, 3)).every(e =>
      crc32WithInit(bytes, e.startAddr, e.endAddr - e.startAddr, e.index) === e.storedCRC
    )) {
      return { entries, initMode: 'blockid', tableOffset }
    }

    // ── Mode 3: known Bosch block IDs (0x10, 0x40, 0x60 …) ───────────────────
    if (entries.length <= boschBlockIds.length) {
      const boschMatch = entries.every((e, idx) =>
        crc32WithInit(bytes, e.startAddr, e.endAddr - e.startAddr, boschBlockIds[idx]) === e.storedCRC
      )
      if (boschMatch) return { entries, initMode: 'blockid', tableOffset }
    }

    // ── Mode 4: 0xFADECAFE init — EDC17/MED17 EEPROM/DFLASH variant ──────────
    if (entries.slice(0, Math.min(entries.length, 3)).every(e =>
      crc32Bosch(bytes, e.startAddr, e.endAddr - e.startAddr) === e.storedCRC
    )) {
      return { entries, initMode: 'bosch', tableOffset }
    }
  }

  return null
}

// ─── Detect EDC16U-style monolithic calibration header ──────────────────────
// EDC16U VW PD-TDI files (e.g. 389289 1.9 TDI) have a Bosch program descriptor at
// file offset 0x40000 marked by two 8-byte magic sequences:
//   FA DE CA FE CA FE AF FE
// These are end-of-descriptor markers (typically 3 per file — main/ASW1/CAL descriptors).
// The file has NO separate block CRC table — only a single header CRC at the
// checksumOffset (corrected by the main bosch-crc32 pass). If we see this signature,
// we can assert the file is "monolithic" and the block-CRC warning is a false alarm.
// Verified against 389289 Golf 1.9 TDI ORI file — 3 magic pairs at 0x4003C/0x40064/0x4008C.
function hasMonolithicBoschHeader(bytes: Uint8Array): boolean {
  const scanStart = 0x40000
  const scanEnd = 0x40200
  if (bytes.length < scanEnd) return false
  let magicPairs = 0
  for (let i = scanStart; i < scanEnd - 7; i++) {
    if (bytes[i]   === 0xFA && bytes[i+1] === 0xDE && bytes[i+2] === 0xCA && bytes[i+3] === 0xFE &&
        bytes[i+4] === 0xCA && bytes[i+5] === 0xFE && bytes[i+6] === 0xAF && bytes[i+7] === 0xFE) {
      magicPairs++
      i += 7  // skip past this magic pair to avoid double-counting
    }
  }
  // Require at least 2 descriptors (ASW + CAL minimum) to avoid false positives
  return magicPairs >= 2
}

// ─── Attempt block-level checksum correction ─────────────────────────────────
// Modifies buffer in-place. Call AFTER correctChecksum (which handles header CRC).
// Returns result:
//   blocksFixed > 0    → block checksums found and corrected
//   initMode='monolithic' → EDC16U-style single-region file, no block CRCs needed (safe)
//   otherwise          → no block table found, caller may warn user to verify externally
export function correctBlockChecksums(buffer: ArrayBuffer): BlockCorrectionResult {
  const bytes = new Uint8Array(buffer)
  const view  = new DataView(buffer)

  const found = findBlockTable(bytes, view)
  if (!found) {
    // Before warning, check if this is an EDC16U monolithic cal file — those legitimately
    // have no block CRC table and only need the main header checksum (which has already
    // been corrected by correctChecksum). Returning initMode='monolithic' tells the UI
    // to display a green "no block CRCs needed" status instead of a yellow warning.
    if (hasMonolithicBoschHeader(bytes)) {
      return { blocksFixed: 0, tableOffset: 0x40000, initMode: 'monolithic' }
    }
    return { blocksFixed: 0, tableOffset: 0, initMode: 'standard' }
  }

  const { entries, initMode, tableOffset } = found
  const boschBlockIds = [0x10, 0x40, 0x60, 0x80, 0x00, 0x01, 0x02, 0x03]

  for (const entry of entries) {
    let newCRC: number
    if (initMode === 'bosch') {
      newCRC = crc32Bosch(bytes, entry.startAddr, entry.endAddr - entry.startAddr)
    } else if (initMode === 'standard') {
      newCRC = crc32(bytes, entry.startAddr, entry.endAddr - entry.startAddr)
    } else {
      // blockid: Bosch block IDs (0x10,0x40,0x60…) or entry index as init
      const initVal = entry.index < boschBlockIds.length ? boschBlockIds[entry.index] : entry.index
      newCRC = crc32WithInit(bytes, entry.startAddr, entry.endAddr - entry.startAddr, initVal)
    }
    view.setUint32(entry.csumOffset, newCRC, true)
  }

  return { blocksFixed: entries.length, tableOffset, initMode }
}

// ─── Verify header checksum ───────────────────────────────────────────────────
export function verifyChecksum(buffer: ArrayBuffer, ecuDef: EcuDef): ChecksumInfo {
  const bytes = new Uint8Array(buffer)
  const view  = new DataView(buffer)
  const algo  = ecuDef.checksumAlgo

  let stored = 0, calculated = 0

  if (algo === 'bosch-crc32') {
    // EDC17/MED17 (Tricore): EEPROM/header CRC — 0xFADECAFE seed, little-endian storage.
    // PFLASH block CRCs use block-ID seeds and are handled by correctBlockChecksums().
    stored = view.getUint32(ecuDef.checksumOffset, true)
    const tmp = new Uint8Array(buffer.slice(0))
    for (let i = 0; i < 4; i++) tmp[ecuDef.checksumOffset + i] = 0xFF
    calculated = crc32Bosch(tmp, 0, tmp.length)

  } else if (algo === 'continental-crc') {
    // Older Continental ECUs (SIMOS10/11): standard CRC32 init 0xFFFFFFFF.
    // NOTE: SIMOS18 uses a completely different block-level CRC structure (init 0x00000000,
    // covering multiple address ranges per security header) — set checksumAlgo: 'none' for SIMOS18.
    stored = view.getUint32(ecuDef.checksumOffset, true)
    const tmp = new Uint8Array(buffer.slice(0))
    for (let i = 0; i < 4; i++) tmp[ecuDef.checksumOffset + i] = 0xFF
    calculated = crc32(tmp, 0, tmp.length)

  } else if (algo === 'bosch-me7') {
    // ME7.x (Bosch Motronic ME7): 16-bit big-endian WORD sum, two's complement storage.
    // Confirmed by ME7Sum (nyetwurk/ME7Sum): sums words up to checksumOffset, stores
    // two's complement. An inverse word is written at checksumOffset+2 as a sanity check.
    // Stored and calculated as big-endian uint16.
    stored     = view.getUint16(ecuDef.checksumOffset, false)  // big-endian
    calculated = boschWordChecksum(bytes, ecuDef.checksumOffset)

  } else if (algo === 'bosch-simple') {
    // EDC15 / BMW MS43: byte-level additive sum (older M78/M797 platform).
    // checksumOffset+2 ensures the internal -2 lands at checksumOffset-1 exactly.
    stored     = view.getUint16(ecuDef.checksumOffset, false)
    calculated = boschSimple(bytes, 0, ecuDef.checksumOffset + 2)

  } else if (algo === 'ppd1-crc32') {
    // Siemens PPD1.x VAG PD-TDI: CRC32 forward over block table. Stored big-endian.
    // We need to zero the csum field before computing IF it falls inside any block —
    // for real PPD1 binaries the csum at 0x402C4 is OUTSIDE the 5 blocks (block 1 ends
    // at 0x402BF, block 2 starts at 0x41100), so no zeroing is needed. But we check
    // defensively in case a variant has a different block layout.
    stored = view.getUint32(ecuDef.checksumOffset, false)  // big-endian
    const blocks = parsePpd1Blocks(view, bytes.length, ecuDef.checksumOffset)
    if (!blocks) {
      calculated = 0  // unparseable block table — return non-match
    } else {
      const csInBlock = blocks.some(b =>
        ecuDef.checksumOffset >= b.fileStart && ecuDef.checksumOffset + 3 <= b.fileEnd
      )
      if (csInBlock) {
        const tmp = new Uint8Array(buffer.slice(0))
        for (let i = 0; i < 4; i++) tmp[ecuDef.checksumOffset + i] = 0x00
        calculated = ppd1Crc32(tmp, blocks)
      } else {
        calculated = ppd1Crc32(bytes, blocks)
      }
    }
  }

  return { algo, offset: ecuDef.checksumOffset, stored, calculated, valid: stored === calculated }
}

// ─── Correct header checksum ──────────────────────────────────────────────────
export function correctChecksum(buffer: ArrayBuffer, ecuDef: EcuDef): ArrayBuffer {
  const copy  = buffer.slice(0)
  const bytes = new Uint8Array(copy)
  const view  = new DataView(copy)
  const algo  = ecuDef.checksumAlgo

  if (algo === 'bosch-crc32') {
    const tmp = new Uint8Array(copy.slice(0))
    for (let i = 0; i < 4; i++) tmp[ecuDef.checksumOffset + i] = 0xFF
    view.setUint32(ecuDef.checksumOffset, crc32Bosch(tmp, 0, tmp.length), true)

  } else if (algo === 'continental-crc') {
    const tmp = new Uint8Array(copy.slice(0))
    for (let i = 0; i < 4; i++) tmp[ecuDef.checksumOffset + i] = 0xFF
    view.setUint32(ecuDef.checksumOffset, crc32(tmp, 0, tmp.length), true)

  } else if (algo === 'bosch-me7') {
    // Write two's complement word-sum at checksumOffset (big-endian).
    // Write bitwise inverse at checksumOffset+2 — ME7 firmware checks both words
    // as a paired sanity check (checksum + ~checksum). Both must be correct.
    const checksum = boschWordChecksum(bytes, ecuDef.checksumOffset)
    view.setUint16(ecuDef.checksumOffset,     checksum,                  false)  // big-endian
    view.setUint16(ecuDef.checksumOffset + 2, (~checksum) & 0xFFFF,      false)  // inverse word

  } else if (algo === 'bosch-simple') {
    // EDC15 / BMW MS43: byte-level sum, stored as big-endian uint16.
    // Research confirms: EDC15 uses the same v + ~v pair pattern as ME7 (checksumLength=4 means
    // 4-byte region = [uint16 checksum] + [uint16 inverse] stored at checksumOffset+2).
    const checksum = boschSimple(bytes, 0, ecuDef.checksumOffset + 2)
    view.setUint16(ecuDef.checksumOffset, checksum, false)
    if (ecuDef.checksumLength >= 4) {
      // Write bitwise inverse immediately after checksum word (v + ~v sanity pair).
      view.setUint16(ecuDef.checksumOffset + 2, (~checksum) & 0xFFFF, false)
    }

  } else if (algo === 'ppd1-crc32') {
    // Siemens PPD1.x VAG PD-TDI: CRC32 forward over 5-block descriptor table.
    // Zero the stored csum field first if it falls inside any block (defensive).
    const blocks = parsePpd1Blocks(view, bytes.length, ecuDef.checksumOffset)
    if (blocks) {
      const csInBlock = blocks.some(b =>
        ecuDef.checksumOffset >= b.fileStart && ecuDef.checksumOffset + 3 <= b.fileEnd
      )
      let newCRC: number
      if (csInBlock) {
        const tmp = new Uint8Array(copy.slice(0))
        for (let i = 0; i < 4; i++) tmp[ecuDef.checksumOffset + i] = 0x00
        newCRC = ppd1Crc32(tmp, blocks)
      } else {
        newCRC = ppd1Crc32(bytes, blocks)
      }
      view.setUint32(ecuDef.checksumOffset, newCRC, false)  // big-endian
    }
    // If block table unparseable, leave unchanged — safer than writing garbage.
  }
  // algo === 'none': do not touch — SIMOS18 and other complex-checksum ECUs

  return copy
}
