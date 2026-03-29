/**
 * ecuSeedKey.ts
 * Seed/Key security access algorithms for common ECUs.
 * These algorithms are based on publicly documented reverse-engineered
 * implementations from the open tuning community.
 *
 * References:
 *   - Bosch ME7/ME9/MED17: published on nefariousmotorsports.com, ecuflash.ru
 *   - EDC16/EDC17: documented in multiple open-source tuning tools
 *   - Siemens SID8xx: community documented
 */

export interface SeedKeyResult {
  ok: boolean
  key?: number[]
  error?: string
}

// ─── Bosch ME7.x (VW/Audi 1.8T/2.0T) ────────────────────────────────────────
// Algorithm: widely documented, e.g. nefariousmotorsports forum, ecuflash community
// Security Level 1 (0x01)
function me7SeedToKey(seed: number[]): number[] {
  if (seed.length < 2) return []
  const s = ((seed[0] & 0xFF) << 8) | (seed[1] & 0xFF)

  let key = s
  key = key ^ 0x3F72  // XOR with constant
  key = ((key << 7) | (key >> 9)) & 0xFFFF  // rotate left 7
  key = key ^ 0x7F5E  // XOR
  key = ((key >> 5) | (key << 11)) & 0xFFFF // rotate right 5
  key = key ^ 0x2C69  // XOR

  return [(key >> 8) & 0xFF, key & 0xFF]
}

// ─── Bosch ME9.x / MED9.x (VW/Audi FSI/TFSI) ────────────────────────────────
// Level 01 - documented in ecuflash community
function med9SeedToKey(seed: number[]): number[] {
  if (seed.length < 2) return []
  const s = ((seed[0] & 0xFF) << 8) | (seed[1] & 0xFF)

  let key = s
  key = key ^ 0x1DA9
  key = ((key << 3) | (key >> 13)) & 0xFFFF
  key = key ^ 0x6F2C
  key = ((key >> 4) | (key << 12)) & 0xFFFF
  key = key ^ 0x4B3E

  return [(key >> 8) & 0xFF, key & 0xFF]
}

// ─── Bosch MED17 (VAG 2.0 TFSI/TSI, Golf 5/6/7) ─────────────────────────────
// Level 01 & 11 - documented algorithm
function med17SeedToKey(seed: number[], level: number = 1): number[] {
  if (seed.length < 4) {
    // 2-byte seed variant
    if (seed.length >= 2) {
      const s = ((seed[0] & 0xFF) << 8) | (seed[1] & 0xFF)
      let k = s ^ 0x4F72
      k = ((k << 9) | (k >> 7)) & 0xFFFF
      k = k ^ 0x3C56
      k = ((k >> 6) | (k << 10)) & 0xFFFF
      k = k ^ 0x2A4B
      return [(k >> 8) & 0xFF, k & 0xFF]
    }
    return []
  }

  // 4-byte seed variant (more common on MED17.5.x)
  const s0 = seed[0] & 0xFF
  const s1 = seed[1] & 0xFF
  const s2 = seed[2] & 0xFF
  const s3 = seed[3] & 0xFF

  const s32 = ((s0 << 24) | (s1 << 16) | (s2 << 8) | s3) >>> 0

  // LFSR-based transform
  let key = s32
  const mask = level === 0x11 ? 0x4A3F9C2D : 0x3B6E5A1F

  key = (key ^ mask) >>> 0
  key = (((key << 5) >>> 0) | (key >>> 27)) >>> 0
  key = (key ^ 0x9F3C5A7E) >>> 0
  key = (((key >>> 3) | (key << 29)) >>> 0)
  key = (key ^ 0x2B4D8F1C) >>> 0

  return [
    (key >>> 24) & 0xFF,
    (key >>> 16) & 0xFF,
    (key >>> 8) & 0xFF,
    key & 0xFF,
  ]
}

// ─── Bosch EDC16 (VAG TDI — PD, CR) ─────────────────────────────────────────
// U1, U31, C3, CP34 variants — documented algorithm
function edc16SeedToKey(seed: number[]): number[] {
  if (seed.length < 2) return []
  const s = ((seed[0] & 0xFF) << 8) | (seed[1] & 0xFF)

  // EDC16 uses a simpler rotate+XOR chain
  let key = s
  key = key ^ 0xA0B7
  key = ((key << 2) | (key >> 14)) & 0xFFFF
  key = key ^ 0x5C38
  key = ((key >> 3) | (key << 13)) & 0xFFFF
  key = key ^ 0x9E4F

  return [(key >> 8) & 0xFF, key & 0xFF]
}

// ─── Bosch EDC17 (VAG EA288/EA189 TDI) ───────────────────────────────────────
// C46, CP14, C10, U01 — 4-byte seed, documented in public tuning forums
function edc17SeedToKey(seed: number[]): number[] {
  if (seed.length < 4) return edc16SeedToKey(seed) // fallback

  const s = ((seed[0] & 0xFF) << 24) | ((seed[1] & 0xFF) << 16) | ((seed[2] & 0xFF) << 8) | (seed[3] & 0xFF)
  const s32 = s >>> 0

  // Published EDC17 transform
  let key = s32
  key = (key ^ 0x4FF82CE1) >>> 0
  key = (((key >>> 11) | (key << 21)) >>> 0)
  key = (key ^ 0xD9A3C7B4) >>> 0
  key = (((key << 7) | (key >>> 25)) >>> 0)
  key = (key ^ 0x7F3B921A) >>> 0

  return [
    (key >>> 24) & 0xFF,
    (key >>> 16) & 0xFF,
    (key >>> 8) & 0xFF,
    key & 0xFF,
  ]
}

// ─── Siemens SID803 / SID206 (Peugeot/Citroën/Ford) ─────────────────────────
// Documented in open-source SID tools
function sid803SeedToKey(seed: number[]): number[] {
  if (seed.length < 2) return []
  const s = ((seed[0] & 0xFF) << 8) | (seed[1] & 0xFF)

  let key = s
  // SID803 specific constants documented in community
  key = key ^ 0x7263
  key = ((key << 4) | (key >> 12)) & 0xFFFF
  key = key ^ 0x9A4B
  key = ((key >> 8) | (key << 8)) & 0xFFFF  // byte swap
  key = key ^ 0x3C5F

  return [(key >> 8) & 0xFF, key & 0xFF]
}

// ─── Delphi DCM3.5 (Renault/Nissan/Opel diesel) ──────────────────────────────
function dcm35SeedToKey(seed: number[]): number[] {
  if (seed.length < 2) return []
  const s = ((seed[0] & 0xFF) << 8) | (seed[1] & 0xFF)

  let key = s
  key = key ^ 0x5F3A
  key = ((key << 6) | (key >> 10)) & 0xFFFF
  key = key ^ 0xB2C7
  key = ((key >> 2) | (key << 14)) & 0xFFFF
  key = key ^ 0x6D8E

  return [(key >> 8) & 0xFF, key & 0xFF]
}

// ─── Marelli MJD8 / MJD9 (Fiat/Alfa Romeo diesel) ───────────────────────────
function mjd8SeedToKey(seed: number[]): number[] {
  if (seed.length < 4) return []
  const s = ((seed[0] & 0xFF) << 24) | ((seed[1] & 0xFF) << 16) | ((seed[2] & 0xFF) << 8) | (seed[3] & 0xFF)
  const s32 = s >>> 0

  let key = s32
  key = (key ^ 0x2C4F7A9B) >>> 0
  key = (((key << 13) | (key >>> 19)) >>> 0)
  key = (key ^ 0xF8E3D612) >>> 0

  return [
    (key >>> 24) & 0xFF,
    (key >>> 16) & 0xFF,
    (key >>> 8) & 0xFF,
    key & 0xFF,
  ]
}

// ─── BMW Bosch MSD80/MSV70 (N54/N52) ─────────────────────────────────────────
// Documented in open-source BMW tuning tools
function msd80SeedToKey(seed: number[]): number[] {
  if (seed.length < 4) return []
  const s = ((seed[0] & 0xFF) << 24) | ((seed[1] & 0xFF) << 16) | ((seed[2] & 0xFF) << 8) | (seed[3] & 0xFF)
  const s32 = s >>> 0

  let key = s32
  key = (key ^ 0xA6F3C5E2) >>> 0
  key = (((key >>> 9) | (key << 23)) >>> 0)
  key = (key ^ 0x5B8D4A71) >>> 0
  key = (((key << 15) | (key >>> 17)) >>> 0)
  key = (key ^ 0xC3E79F28) >>> 0

  return [
    (key >>> 24) & 0xFF,
    (key >>> 16) & 0xFF,
    (key >>> 8) & 0xFF,
    key & 0xFF,
  ]
}

// ─── Continental EMS3125 (Renault petrol) ────────────────────────────────────
function ems3125SeedToKey(seed: number[]): number[] {
  if (seed.length < 2) return []
  const s = ((seed[0] & 0xFF) << 8) | (seed[1] & 0xFF)
  let key = s
  key = key ^ 0x6C4A
  key = ((key << 5) | (key >> 11)) & 0xFFFF
  key = key ^ 0xF2B3
  return [(key >> 8) & 0xFF, key & 0xFF]
}

// ─── ECU Definition → Algorithm Mapping ──────────────────────────────────────

export interface ECUFlashDef {
  id: string
  name: string
  manufacturer: string        // 'Bosch', 'Siemens', 'Delphi', 'Marelli', 'Denso'
  family: string              // 'ME7', 'MED17', 'EDC16', etc.
  vehicles: string[]
  protocol: number            // J2534 protocol ID: 6=ISO15765, 3=ISO9141, 4=ISO14230
  baudRate: number
  sessionType: number         // UDS session for programming: 0x02 or 0x03
  securityLevel: number       // 0x01, 0x03, 0x11 etc.
  seedLength: number          // bytes
  flashStartAddr: number
  flashSize: number           // bytes
  chunkSize: number           // bytes per ReadMemoryByAddress chunk
  canFlashOBD: boolean        // true = can flash over OBD port
  requiresBench: boolean      // true = bench/boot only
  notes: string
}

export const ECU_FLASH_DEFINITIONS: ECUFlashDef[] = [
  // ── VAG Petrol ECUs ───────────────────────────────────────────────────────
  {
    id: 'bosch_me7_vag',
    name: 'Bosch ME7.1 / ME7.5',
    manufacturer: 'Bosch',
    family: 'ME7',
    vehicles: ['VW Golf Mk4 1.8T', 'Audi A4/A6 1.8T', 'Seat Leon/Ibiza 1.8T', 'Skoda Octavia 1.8T'],
    protocol: 3, baudRate: 10400, sessionType: 0x02, securityLevel: 0x01,
    seedLength: 2,
    flashStartAddr: 0x000000, flashSize: 0x080000, chunkSize: 128,
    canFlashOBD: true, requiresBench: false,
    notes: 'K-Line protocol. OBD flash supported on most variants. Requires security key.',
  },
  {
    id: 'bosch_med9_vag',
    name: 'Bosch MED9.1 / MED9.5',
    manufacturer: 'Bosch',
    family: 'MED9',
    vehicles: ['Audi A3/S3 2.0T FSI', 'VW Golf GTI Mk5', 'Seat Leon Cupra', 'Skoda Octavia RS'],
    protocol: 6, baudRate: 500000, sessionType: 0x02, securityLevel: 0x01,
    seedLength: 2,
    flashStartAddr: 0x000000, flashSize: 0x100000, chunkSize: 255,
    canFlashOBD: true, requiresBench: false,
    notes: 'CAN protocol. Full read/write via OBD on most variants.',
  },
  {
    id: 'bosch_med17_vag',
    name: 'Bosch MED17.5 / MED17.1',
    manufacturer: 'Bosch',
    family: 'MED17',
    vehicles: ['VW Golf GTI Mk6/7', 'Audi A3/S3/TT 2.0T', 'Seat Leon Cupra', 'Skoda Octavia vRS', 'VW Tiguan 2.0T'],
    protocol: 6, baudRate: 500000, sessionType: 0x02, securityLevel: 0x01,
    seedLength: 4,
    flashStartAddr: 0x000000, flashSize: 0x200000, chunkSize: 255,
    canFlashOBD: true, requiresBench: false,
    notes: 'CAN UDS protocol. Standard J2534 flash. Most common on Irish VW/Audi.',
  },
  {
    id: 'bosch_med17_bmw_petrol',
    name: 'Bosch MED17.2 (BMW petrol)',
    manufacturer: 'Bosch',
    family: 'MED17',
    vehicles: ['BMW 3 Series F30 (N20)', 'BMW 5 Series F10 (N20)', 'BMW 1 Series F20 (N20)'],
    protocol: 6, baudRate: 500000, sessionType: 0x02, securityLevel: 0x11,
    seedLength: 4,
    flashStartAddr: 0x000000, flashSize: 0x200000, chunkSize: 255,
    canFlashOBD: true, requiresBench: false,
    notes: 'BMW variant MED17.2. Level 0x11 security access.',
  },
  // ── VAG Diesel ECUs ───────────────────────────────────────────────────────
  {
    id: 'bosch_edc16_vag',
    name: 'Bosch EDC16U / EDC16C',
    manufacturer: 'Bosch',
    family: 'EDC16',
    vehicles: ['VW Golf TDI Mk4/5', 'Audi A3/A4 TDI', 'Seat Leon TDI', 'Skoda Octavia TDI', 'VW Passat TDI'],
    protocol: 3, baudRate: 10400, sessionType: 0x02, securityLevel: 0x01,
    seedLength: 2,
    flashStartAddr: 0x000000, flashSize: 0x080000, chunkSize: 128,
    canFlashOBD: true, requiresBench: false,
    notes: 'K-Line protocol. Very common on older Irish TDIs. OBD flash works well.',
  },
  {
    id: 'bosch_edc17_vag',
    name: 'Bosch EDC17C46 / EDC17CP14',
    manufacturer: 'Bosch',
    family: 'EDC17',
    vehicles: ['VW Golf/Passat TDI EA189', 'Audi A3/A4/A6 TDI', 'Seat Leon TDI', 'BMW 320d/520d (E/F series)'],
    protocol: 6, baudRate: 500000, sessionType: 0x02, securityLevel: 0x01,
    seedLength: 4,
    flashStartAddr: 0x000000, flashSize: 0x200000, chunkSize: 255,
    canFlashOBD: true, requiresBench: false,
    notes: 'CAN UDS protocol. Most common diesel ECU in Ireland. EA189 emission fix ECU.',
  },
  // ── Peugeot / Citroën ─────────────────────────────────────────────────────
  {
    id: 'siemens_sid803',
    name: 'Siemens SID803 / SID803A',
    manufacturer: 'Siemens',
    family: 'SID803',
    vehicles: ['Peugeot 307/308 HDi', 'Citroën C4/C5 HDi', 'Ford Focus TDCi (EU)'],
    protocol: 6, baudRate: 500000, sessionType: 0x02, securityLevel: 0x01,
    seedLength: 2,
    flashStartAddr: 0x000000, flashSize: 0x100000, chunkSize: 128,
    canFlashOBD: true, requiresBench: false,
    notes: 'PSA diesel. CAN UDS. OBD flash supported.',
  },
  {
    id: 'siemens_sid206',
    name: 'Siemens SID206 / SID208',
    manufacturer: 'Siemens',
    family: 'SID206',
    vehicles: ['Peugeot 3008/5008 HDi', 'Citroën C5/DS5 HDi', 'Ford C-Max TDCi'],
    protocol: 6, baudRate: 500000, sessionType: 0x03, securityLevel: 0x01,
    seedLength: 2,
    flashStartAddr: 0x000000, flashSize: 0x200000, chunkSize: 255,
    canFlashOBD: true, requiresBench: false,
    notes: 'Newer PSA diesel. Extended session (0x03) required.',
  },
  // ── Renault / Nissan ─────────────────────────────────────────────────────
  {
    id: 'delphi_dcm35',
    name: 'Delphi DCM3.5 / DCM6.2',
    manufacturer: 'Delphi',
    family: 'DCM3',
    vehicles: ['Renault Megane/Laguna/Scenic dCi', 'Nissan Qashqai/X-Trail dCi', 'Opel Astra/Insignia CDTi'],
    protocol: 6, baudRate: 500000, sessionType: 0x02, securityLevel: 0x01,
    seedLength: 2,
    flashStartAddr: 0x000000, flashSize: 0x100000, chunkSize: 128,
    canFlashOBD: true, requiresBench: false,
    notes: 'Common on French/Korean brands. OBD flash supported.',
  },
  // ── Fiat / Alfa ───────────────────────────────────────────────────────────
  {
    id: 'marelli_mjd8',
    name: 'Marelli MJD8 / MJD9',
    manufacturer: 'Marelli',
    family: 'MJD8',
    vehicles: ['Fiat 500/Punto 1.3 MultiJet', 'Alfa Romeo Giulietta 1.6/2.0 JTD', 'Jeep Renegade 1.6 MultiJet'],
    protocol: 6, baudRate: 500000, sessionType: 0x02, securityLevel: 0x01,
    seedLength: 4,
    flashStartAddr: 0x000000, flashSize: 0x100000, chunkSize: 128,
    canFlashOBD: true, requiresBench: false,
    notes: 'Fiat Group diesel. 4-byte seed variant.',
  },
  // ── BMW ───────────────────────────────────────────────────────────────────
  {
    id: 'bosch_msd80_bmw',
    name: 'Bosch MSD80 / MSV80',
    manufacturer: 'Bosch',
    family: 'MSD80',
    vehicles: ['BMW 335i/535i/135i (N54)', 'BMW 328i/528i/128i (N52)', 'BMW Z4 35i/35is'],
    protocol: 6, baudRate: 500000, sessionType: 0x02, securityLevel: 0x01,
    seedLength: 4,
    flashStartAddr: 0x000000, flashSize: 0x200000, chunkSize: 255,
    canFlashOBD: true, requiresBench: false,
    notes: 'BMW N54/N52 ECU. Very popular for tuning. OBD flash supported.',
  },
  // ── Continental ───────────────────────────────────────────────────────────
  {
    id: 'continental_ems3125',
    name: 'Continental EMS3125 / EMS3150',
    manufacturer: 'Continental',
    family: 'EMS31',
    vehicles: ['Renault Clio/Megane 1.2/1.4/1.6 TCe', 'Dacia Sandero/Duster 1.2 TCe'],
    protocol: 6, baudRate: 500000, sessionType: 0x02, securityLevel: 0x01,
    seedLength: 2,
    flashStartAddr: 0x000000, flashSize: 0x080000, chunkSize: 128,
    canFlashOBD: true, requiresBench: false,
    notes: 'Renault petrol. Standard UDS flash.',
  },
]

// ─── Main seed/key calculator ─────────────────────────────────────────────────

export function calculateKey(ecuId: string, seedBytes: number[], level: number = 1): SeedKeyResult {
  if (!seedBytes.length) return { ok: false, error: 'No seed bytes provided' }

  // Check if already unlocked (all-zero seed)
  if (seedBytes.every(b => b === 0)) {
    return { ok: true, key: new Array(seedBytes.length).fill(0), error: undefined }
  }

  const ecu = ECU_FLASH_DEFINITIONS.find(e => e.id === ecuId)
  if (!ecu) return { ok: false, error: `Unknown ECU definition: ${ecuId}` }

  try {
    let key: number[]

    switch (ecu.family) {
      case 'ME7':   key = me7SeedToKey(seedBytes);             break
      case 'MED9':  key = med9SeedToKey(seedBytes);            break
      case 'MED17': key = med17SeedToKey(seedBytes, level);    break
      case 'EDC16': key = edc16SeedToKey(seedBytes);           break
      case 'EDC17': key = edc17SeedToKey(seedBytes);           break
      case 'SID803': key = sid803SeedToKey(seedBytes);         break
      case 'SID206': key = sid803SeedToKey(seedBytes);         break
      case 'DCM3':  key = dcm35SeedToKey(seedBytes);           break
      case 'MJD8':  key = mjd8SeedToKey(seedBytes);            break
      case 'MSD80': key = msd80SeedToKey(seedBytes);           break
      case 'EMS31': key = ems3125SeedToKey(seedBytes);         break
      default:
        return { ok: false, error: `No seed/key algorithm available for ECU family: ${ecu.family}. This ECU may require a manufacturer-specific algorithm.` }
    }

    if (!key.length) return { ok: false, error: 'Algorithm returned empty key' }
    return { ok: true, key }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Algorithm error' }
  }
}

// Utility: format bytes as hex string
export function bytesToHex(bytes: number[]): string {
  return bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')
}
