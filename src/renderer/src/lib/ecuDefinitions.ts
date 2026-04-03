export type DataType = 'uint8' | 'int8' | 'uint16' | 'int16' | 'float32'
export type ChecksumAlgo = 'bosch-crc32' | 'bosch-me7' | 'bosch-simple' | 'continental-crc' | 'none' | 'unknown'
export type MapCategory = 'boost' | 'fuel' | 'torque' | 'ignition' | 'limiter' | 'emission' | 'smoke' | 'misc'

export interface StageParams {
  multiplier?: number   // multiply raw values by this
  addend?: number       // add to each value after multiply
  clampMax?: number     // hard ceiling after modification
  clampMin?: number
  lastNRows?: number    // only apply to last N rows (highest RPM rows — e.g. popcorn limiter)
  lastNCols?: number    // only apply to last N cols (highest RPM cols — e.g. popcorn limiter)
}

export interface AddonParams {
  id: string
  label: string
  params: StageParams
}

export interface MapDef {
  id: string
  name: string
  category: MapCategory
  desc: string
  // Known DAMOS / A2L characteristic names for this map — used for name-first A2L matching.
  // Multiple names listed in priority order (most common first).
  a2lNames?: string[]
  // Binary location - array of candidate signatures (bytes), map starts sigOffset bytes after match end
  signatures: number[][]
  sigOffset: number
  // Fallback fixed byte offset (used when no signature matches; variant-specific)
  fixedOffset?: number
  // Map structure
  rows: number
  cols: number
  dtype: DataType
  le: boolean           // little-endian
  factor: number        // raw * factor = physical value
  offsetVal: number     // physical = raw*factor + offsetVal
  unit: string
  // Per-stage modification params
  stage1: StageParams
  stage2: StageParams
  stage3: StageParams
  // Optional add-on overrides keyed by addon id
  addonOverrides?: Record<string, StageParams>
  critical: boolean     // if true, warn if map not found
  showPreview: boolean
}

export interface EcuDef {
  id: string
  name: string
  manufacturer: string
  family: string
  // ASCII strings expected in first 1024 bytes of binary (any match = detected)
  identStrings: string[]
  fileSizeRange: [number, number]  // bytes min/max
  vehicles: string[]
  checksumAlgo: ChecksumAlgo
  checksumOffset: number   // offset in file where checksum is stored
  checksumLength: number   // bytes
  maps: MapDef[]
}

// ─── ECU Definitions ─────────────────────────────────────────────────────────

export const ECU_DEFINITIONS: EcuDef[] = [
  // ── Bosch MED17 (VAG petrol) ─────────────────────────────────────────────
  {
    id: 'med17',
    name: 'Bosch MED17',
    manufacturer: 'Bosch',
    family: 'MED17',
    // MED17 uses Infineon Tricore TC1796/TC1797 — NO embedded ASCII symbol names.
    // 0261S0x = Bosch special variant prefix for MED17/MED9 petrol ECUs.
    // MED17.1/17.1.1 = TC1796 (2MB); MED17.5.x/17.9.x = TC1797 (4MB).
    // BOOST MODEL: MED17 is TORQUE-DRIVEN — boost is not set directly. Chain:
    //   Pedal → MDFP (driver demand) → MASR (optimal torque) → target charge fill (rl_w) →
    //   target pressure upstream throttle (pssol/plsol) → KFLDRL linearization → wastegate via LDRXN.
    //   Key limiter symbols: LDRXN (max boost limit 1D, 16 RPM pts), KFLDHBN (max pressure ratio 2D),
    //   MDFP (max driver torque), MASR (max desired torque). Tuners must raise ALL of these.
    // IGNITION: KFZW = 16×16 main timing map, factor 0.75°/LSB. Some later EA888 Gen3 = 20×24.
    //   KFURL = lambda target at WOT (stock EA888: λ=0.85–0.87; Stage 1 target: λ=0.90–0.92).
    // CHECKSUM: CRC32 (reflected poly 0xEDB88320). Init value: 0xFADECAFE (confirmed by
    //   ConnorHowell/medc17-checksum-tool GitHub, open-source, Gaussian elimination GF(2)).
    //   Also uses ADD32 (32-bit dword sum) and ADD16 (16-bit word sum) secondary checks.
    //   'bosch-crc32' covers the primary CRC — ADD32/ADD16 must also be corrected externally.
    identStrings: ['MED17', 'ME17', '0261S', 'MEDG17', 'MED1750', 'MED17.1', 'MED17.5', 'MED17.9', 'MED9'],
    fileSizeRange: [524288, 4194304],   // 512KB – 4MB (TC1796=2MB, TC1797=4MB)
    vehicles: ['VW Golf GTI Mk6/7', 'Audi A3/S3 8P/8V', 'Seat Leon Cupra', 'Skoda Octavia vRS', 'VW Polo GTI', 'Audi TTS'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFF8,
    checksumLength: 4,
    maps: [
      {
        id: 'med17_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'Charge air pressure setpoint map. RPM vs throttle load. Increasing this raises boost target — primary Stage 1/2 map.',
        signatures: [[0x4C,0x44,0x4B,0x56,0x53,0x4F,0x4C,0x4C], [0x42,0x4F,0x4F,0x53,0x54,0x53,0x4F,0x4C]],
        sigOffset: 4,
        rows: 12, cols: 16, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.18 },
        stage2: { multiplier: 1.30 },
        stage3: { multiplier: 1.45, clampMax: 58000 },
        critical: true, showPreview: true,
      },
      {
        id: 'med17_fuel_inject',
        name: 'Fuel Injection Duration',
        category: 'fuel',
        desc: 'Base fuel injection duration map. Increasing this enriches fuelling to support more boost and power.',
        signatures: [[0x49,0x4E,0x4A,0x44,0x55,0x52,0x42,0x53], [0x46,0x55,0x45,0x4C,0x4D,0x41,0x50,0x01]],
        sigOffset: 4,
        rows: 16, cols: 16, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'ms',
        stage1: { multiplier: 1.12 },
        stage2: { multiplier: 1.20 },
        stage3: { multiplier: 1.30, clampMax: 60000 },
        critical: true, showPreview: true,
      },
      {
        id: 'med17_torque_limit',
        name: 'Torque Demand Limit',
        category: 'torque',
        desc: 'Driver demand torque ceiling. Must be raised to allow the engine to produce more torque without being silently capped.',
        signatures: [[0x54,0x51,0x4C,0x49,0x4D,0x01,0x00], [0x54,0x4F,0x52,0x51,0x4C,0x49,0x4D]],
        sigOffset: 2,
        rows: 8, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.25 },
        stage2: { multiplier: 1.40 },
        stage3: { multiplier: 1.60, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'med17_ign_timing',
        name: 'Ignition Timing Base',
        category: 'ignition',
        desc: 'Base ignition advance map. Optimised for better combustion efficiency. Stage 2/3 adds advance where knock margin allows.',
        signatures: [[0x49,0x47,0x4E,0x42,0x41,0x53,0x45], [0x5A,0x57,0x42,0x41,0x53,0x45,0x01]],
        sigOffset: 4,
        rows: 16, cols: 16, dtype: 'int8', le: true,
        factor: 0.75, offsetVal: -48, unit: '°BTDC',
        stage1: { addend: 0 },
        stage2: { addend: 1 },
        stage3: { addend: 2, clampMax: 60 },
        addonOverrides: {
          popcorn: { addend: -20, clampMin: 0, lastNCols: 2 },
        },
        critical: false, showPreview: true,
      },
      {
        id: 'med17_rev_limit',
        name: 'Rev Limiter',
        category: 'limiter',
        desc: 'Engine RPM hard cut limiter. Raised slightly on Stage 1/2 for better top-end pull.',
        signatures: [[0x52,0x45,0x56,0x4C,0x49,0x4D,0x01], [0x4E,0x4D,0x41,0x58,0x52,0x50,0x4D]],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'RPM',
        stage1: { addend: 300 },
        stage2: { addend: 500 },
        stage3: { addend: 800, clampMax: 8000 },
        addonOverrides: {
          launchcontrol: { multiplier: 0, addend: 3500, clampMax: 4500 },
          revlimit: { addend: 400, clampMax: 7500 },
        },
        critical: false, showPreview: true,
      },
      {
        id: 'med17_egr_duty',
        name: 'EGR Duty Cycle',
        category: 'emission',
        desc: 'Exhaust gas recirculation duty cycle map. NOTE: Most MED17 EA888 Gen1/Gen2 TSI/TFSI petrol engines do NOT have EGR — this map may not be present in all variants. EGR appears primarily in diesel EDC17 siblings. Later EA888 Gen3 variants may have an EGR cooler loop. If the signature is not found in a binary, this map is silently skipped. Zeroed for EGR delete add-on where applicable.',
        signatures: [[0x45,0x47,0x52,0x44,0x55,0x54,0x59], [0x41,0x47,0x52,0x44,0x55,0x54]],
        sigOffset: 4,
        rows: 8, cols: 8, dtype: 'uint8', le: true,
        factor: 0.4, offsetVal: 0, unit: '%',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: {
          egr: { multiplier: 0, clampMax: 0 },
        },
        critical: false, showPreview: false,
      },
      {
        id: 'med17_overboost_cut',
        name: 'Overboost Protection Cut (pBoostMax)',
        category: 'limiter',
        desc: 'Maximum boost pressure threshold before ECU activates fuel cut. Raised to prevent false overboost protection triggering on remapped boost maps.',
        a2lNames: ['pBoostMax', 'pSysMax', 'LimBoostPres', 'pLadeMax', 'BoostCutPres'],
        signatures: [[0x70,0x42,0x6F,0x6F,0x73,0x74,0x4D,0x61,0x78], [0x70,0x53,0x79,0x73,0x4D,0x61,0x78], [0x70,0x4C,0x61,0x64,0x65,0x4D,0x61,0x78]],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'mbar',
        stage1: { multiplier: 1.15, clampMax: 3000 },
        stage2: { multiplier: 1.28, clampMax: 3500 },
        stage3: { multiplier: 1.42, clampMax: 4500 },
        addonOverrides: {
          overboost: { multiplier: 1.5, clampMax: 4500 },
        },
        critical: false, showPreview: false,
      },
      {
        id: 'med17_speed_limit',
        name: 'Vehicle Speed Limiter',
        category: 'limiter',
        desc: 'Factory speed limiter. Set to maximum value to remove software speed restriction.',
        signatures: [[0x56,0x53,0x4C,0x49,0x4D,0x49,0x54], [0x53,0x50,0x44,0x4C,0x49,0x4D]],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'km/h',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: {
          speedlimiter: { multiplier: 0, addend: 65535 },
        },
        critical: false, showPreview: false,
      },
    ],
  },

  // ── Bosch EDC15 (VAG TDI 1.9 / 2.0 diesel, late 90s – early 2000s) ──────
  {
    id: 'edc15',
    name: 'Bosch EDC15',
    manufacturer: 'Bosch',
    family: 'EDC15',
    // C167 processor — binary embeds null-terminated DAMOS symbol names directly in ROM (confirmed).
    // Part numbers: 0281010–0281013 are the EDC15 range per Bosch numbering.
    // 0281001 removed (not a real EDC15 part number prefix). Added 0281012/0281013 (PD variants).
    // LADSOLL, MENZK, MXMOM, EGRKL are confirmed ASCII strings in real EDC15 binaries.
    // LADSOLL/MENZK/MXMOM/EGRKL/VP37/VP44 removed — these are generic Bosch map names shared
    // across EDC16/EDC17/ME7 families and cause false-positive EDC15 detection on any Bosch binary.
    identStrings: ['EDC15', 'EDC 15', 'EDC15C', 'EDC15P', 'EDC15VM', 'EDC15M+', 'EDC-15', '0281010', '0281011', '0281012', '0281013'],
    fileSizeRange: [262144, 1048576],   // 256KB – 1MB (standard VAG PD = 512KB; EDC15VM+/Mercedes = 1MB)
    vehicles: ['Audi A4 1.9 TDI', 'VW Passat 1.9 TDI', 'VW Golf Mk4 1.9 TDI', 'Skoda Octavia 1.9 TDI', 'Seat Leon 1.9 TDI', 'Audi A3 1.9 TDI'],
    // CHECKSUM: EDC15 uses a proprietary Bosch seed-based additive algorithm (NOT CRC32).
    // The algorithm (reverse-engineered in VAGEDCSuite source):
    //   1. Split the calibration block into 16-bit words (big-endian, C167 Motorola HiLo).
    //   2. Sum all words into a 32-bit accumulator (wrapping addition, no carry).
    //   3. Negate the sum (two's complement) and store at offset 0x7FFF0 (4 bytes).
    //   Some EDC15VM+ variants XOR a 'seed' correction word into the accumulator before negation.
    // Tool support: VAGEDCSuite (free, open-source), WinOLS basic, ECUFlash.
    // Our engine writes maps raw — always correct checksum with VAGEDCSuite BEFORE flashing.
    checksumAlgo: 'bosch-simple',
    checksumOffset: 0x7FFF0,
    checksumLength: 4,
    maps: [
      {
        id: 'edc15_boost_target',
        name: 'Boost Pressure Target (LADSOLL)',
        category: 'boost',
        desc: 'Desired boost pressure map (LADSOLL). RPM vs injection quantity (IQ). Primary Stage 1 map for 1.9 TDI — raises the charge air pressure target. Output unit: mbar absolute. Stock range ~1000–2620 mbar. Beware: some English guides mislabel axes (RPM vs load vs IQ). CORRECTED: 16 RPM cols × 10 IQ rows; factor 1.0 mbar/LSB; le:false (Motorola HiLo, confirmed EDC15 C167 byte order). Previous: wrong 9×11, factor 0.001 bar, le:true — all now corrected per diesel research and VAGEDCSuite community analysis.',
        signatures: [
          [0x4C,0x41,0x44,0x53,0x4F,0x4C,0x4C,0x00],     // "LADSOLL\0"
          [0x4C,0x41,0x44,0x53,0x4F,0x4C,0x4C],          // "LADSOLL"
          [0x4C,0x44,0x52,0x58,0x4E,0x00],                // "LDRXN\0"
          [0x4C,0x41,0x44,0x45,0x44,0x52,0x55,0x43,0x4B], // "LADEDRUCK"
        ],
        sigOffset: 2,
        fixedOffset: 0x6D80,
        // CORRECTED: rows:10 cols:16 (was 9×11). Diesel research: "16×10 (16 col RPM × 10 row IQ)".
        // CORRECTED: le:false — EDC15 C167 uses Motorola HiLo byte order (was le:true = WRONG).
        // CORRECTED: factor 1.0, unit mbar (was 0.001, bar). Stock raw ~1000–2620 = 1000–2620 mbar.
        // Stage clampMax: 3200 mbar = 3.2 bar absolute (realistic ceiling for K03s/K04 turbo).
        rows: 10, cols: 16, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'mbar',
        stage1: { multiplier: 1.15, clampMax: 3000 },
        stage2: { multiplier: 1.25, clampMax: 3100 },
        stage3: { multiplier: 1.38, clampMax: 3200 },
        critical: true, showPreview: true,
        addonOverrides: {},
      },
      {
        id: 'edc15_fuel_quantity',
        name: 'Injection Quantity Map (MENZK)',
        category: 'fuel',
        desc: 'Fuel injection quantity base map (MENZK). mg/stroke vs RPM and IQ demand. Raising this increases torque across the rev range. CORRECTED: le:false (Motorola HiLo — EDC15 C167); factor 0.1 mg/st/LSB (raw ~700 = 70 mg/st peak). Dimensions variant-dependent: 10×8 (10 load rows × 8 RPM cols) for most 1.9 TDI PD 115/150hp variants.',
        signatures: [
          [0x4D,0x45,0x4E,0x5A,0x4B,0x00],                // "MENZK\0"
          [0x4D,0x45,0x4E,0x5A,0x4B],                     // "MENZK"
          [0x4B,0x46,0x4D,0x53,0x4E,0x57,0x44,0x4B],      // "KFMSNWDK"
          [0x45,0x49,0x4E,0x53,0x50,0x52,0x5A,0x4B],      // "EINSPRZK"
        ],
        sigOffset: 2,
        fixedOffset: 0x6F20,
        // CORRECTED: le:false (Motorola HiLo). rows:10, cols:8 (10 load × 8 RPM, community consensus).
        // factor: 0.1 mg/st/LSB — raw 700 = 70 mg/st (stock peak), raw 900 = 90 mg/st (tuned).
        rows: 10, cols: 8, dtype: 'uint16', le: false,
        factor: 0.1, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.32, clampMax: 62000 },
        critical: true, showPreview: true,
        addonOverrides: {},
      },
      {
        id: 'edc15_torque_limit',
        name: 'Max Torque Map (MXMOM)',
        category: 'torque',
        desc: 'Maximum torque ceiling (MXMOM). Raise to match new fuel and boost levels — stock limit will silently cap power gains.',
        signatures: [
          [0x4D,0x58,0x4D,0x4F,0x4D,0x00],                // "MXMOM\0"
          [0x4D,0x58,0x4D,0x4F,0x4D],                     // "MXMOM"
          [0x4D,0x58,0x4D,0x4F,0x4D,0x53,0x41],           // "MXMOMSA"
          [0x54,0x51,0x4C,0x49,0x4D,0x44,0x43],           // "TQLIMDС"
        ],
        sigOffset: 2,
        fixedOffset: 0x71A0,
        rows: 1, cols: 8, dtype: 'uint16', le: false,   // EDC15 C167 = Motorola HiLo
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.25 },
        stage2: { multiplier: 1.40 },
        stage3: { multiplier: 1.55, clampMax: 65000 },
        critical: true, showPreview: true,
        addonOverrides: {},
      },
      {
        id: 'edc15_egr_map',
        name: 'EGR Flow Map (EGRKL)',
        category: 'emission',
        desc: 'EGR valve duty by RPM and load (EGRKL). Zeroed for EGR delete — reduces intake carbon, lowers intake temps.',
        signatures: [
          [0x45,0x47,0x52,0x4B,0x4C,0x00],                // "EGRKL\0"
          [0x45,0x47,0x52,0x4B,0x4C],                     // "EGRKL"
          [0x45,0x47,0x52,0x46,0x4C,0x4F,0x57],           // "EGRFLOW"
        ],
        sigOffset: 2,
        fixedOffset: 0x72C0,
        rows: 8, cols: 8, dtype: 'uint8', le: false,   // uint8 = single byte, le irrelevant but set for consistency
        factor: 0.4, offsetVal: 0, unit: '%',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: {
          egr: { multiplier: 0, clampMax: 0 },
        },
        critical: false, showPreview: false,
      },
      {
        id: 'edc15_rev_limit',
        name: 'RPM Hardcut Limiter (NMAX)',
        category: 'limiter',
        desc: 'Engine RPM hard-cut limiter (NMAX). When the crank signal exceeds this value the ECU performs a fuel cutoff. Stock value is typically 4800–5200 RPM on EDC15 diesels. Raising by 200–400 RPM allows full use of the power band without premature fuel cutoff on modified engines. Do NOT raise beyond the mechanical rev limit of the engine or turbocharger — consult engine builder. Symbol: NMAX / NSCHALT / NABSCHALTEN.',
        signatures: [
          [0x4E,0x4D,0x41,0x58,0x00],              // "NMAX\0"
          [0x4E,0x53,0x43,0x48,0x41,0x4C,0x54],    // "NSCHALT"
          [0x4E,0x41,0x42,0x53,0x43,0x48,0x41],    // "NABSCHA"
        ],
        sigOffset: 1,
        fixedOffset: 0x73F0,
        rows: 1, cols: 1, dtype: 'uint16', le: false,   // EDC15 C167 Motorola HiLo
        // factor 1: stored directly in RPM. Stock typically 4800–5200 RPM. Hex: 0x12C0 = 4800 RPM ✓
        factor: 1, offsetVal: 0, unit: 'RPM',
        stage1: { multiplier: 1.0 },   // unchanged — only raised via launchcontrol/specific request
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: {
          launchcontrol: { multiplier: 0, addend: 5500, clampMax: 6000 },
          revlimit: { addend: 300, clampMax: 5800 },
        },
        critical: false, showPreview: false,
      },
      {
        id: 'edc15_overboost_cut',
        name: 'Overboost Protection Cut (pBoostMax)',
        category: 'limiter',
        desc: 'Maximum boost pressure limit before ECU cuts fuelling. Raised to allow stage boost targets to be achieved without premature fuel cut.',
        a2lNames: ['pBoostMax', 'pLadeMax', 'LimBoostPres', 'LADEDRMAX', 'pLadedruckMax'],
        signatures: [[0x70,0x42,0x6F,0x6F,0x73,0x74,0x4D,0x61,0x78], [0x70,0x4C,0x61,0x64,0x65,0x4D,0x61,0x78], [0x4C,0x41,0x44,0x45,0x44,0x52,0x4D,0x41,0x58]],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint16', le: false,   // EDC15 C167 Motorola HiLo
        factor: 1, offsetVal: 0, unit: 'mbar',
        stage1: { multiplier: 1.12, clampMax: 2600 },
        stage2: { multiplier: 1.22, clampMax: 3000 },
        stage3: { multiplier: 1.35, clampMax: 3500 },
        addonOverrides: {
          overboost: { multiplier: 1.4, clampMax: 3200 },
        },
        critical: false, showPreview: false,
      },
      {
        id: 'edc15_speed_limit',
        name: 'Vehicle Speed Limiter (VMAX)',
        category: 'limiter',
        desc: 'Factory speed limiter value (VMAX). Set to maximum to remove software speed restriction.',
        signatures: [
          [0x56,0x4D,0x41,0x58,0x00],                     // "VMAX\0"
          [0x56,0x4D,0x41,0x58],                          // "VMAX"
          [0x56,0x53,0x4C,0x49,0x4D,0x49,0x54],           // "VSLIMIT"
        ],
        sigOffset: 1,
        fixedOffset: 0x73E0,
        rows: 1, cols: 1, dtype: 'uint16', le: false,   // EDC15 C167 Motorola HiLo
        factor: 1, offsetVal: 0, unit: 'km/h',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: {
          speedlimiter: { multiplier: 0, addend: 65535 },
        },
        critical: false, showPreview: false,
      },
      {
        id: 'edc15_smoke_limiter',
        name: 'Smoke Limiter (LSMK)',
        category: 'smoke',
        desc: 'Maximum fuel quantity ceiling by airflow/boost (LSMK). Without raising this, any fuel increase above stock is cut to prevent black smoke — the single most-missed EDC15 map.',
        signatures: [
          [0x4C,0x53,0x4D,0x4B,0x00],                     // "LSMK\0"
          [0x4C,0x53,0x4D,0x4B],                          // "LSMK"
          [0x4C,0x53,0x4D,0x4B,0x4E],                     // "LSMKN"
          [0x52,0x4B,0x42,0x45,0x47,0x52],                 // "RKBEGR"
        ],
        sigOffset: 2,
        fixedOffset: 0x7080,
        // CORRECTED: le:false (Motorola HiLo). factor:0.1 mg/st/LSB (consistent with MENZK).
        // raw 450 = 45 mg/st (stock smoke ceiling ~45–55 mg/st), raw 700 = 70 mg/st (tuned).
        rows: 1, cols: 8, dtype: 'uint16', le: false,
        factor: 0.1, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.10 },
        stage2: { multiplier: 1.18 },
        stage3: { multiplier: 1.28, clampMax: 650 },   // 65 mg/st ceiling (was 62000 with old factor 0.001)
        critical: true, showPreview: true,
      },
      {
        id: 'edc15_soi',
        name: 'Start of Injection (SDATF)',
        category: 'ignition',
        desc: 'Injection advance angle at full load (SDATF). Advancing timing improves combustion efficiency — standard Stage 2/3 mod on EDC15 PD engines.',
        signatures: [
          [0x53,0x44,0x41,0x54,0x46,0x00],                 // "SDATF\0"
          [0x53,0x44,0x41,0x54,0x46],                      // "SDATF"
          [0x46,0x4E,0x4E,0x4B,0x46],                      // "FNNKF"
          [0x53,0x50,0x52,0x49,0x54,0x5A],                 // "SPRITZ"
        ],
        sigOffset: 2,
        fixedOffset: 0x7200,
        rows: 1, cols: 8, dtype: 'int8', le: false,
        factor: 1.0, offsetVal: 0, unit: '°BTDC',
        stage1: { addend: 0 },
        stage2: { addend: 1 },
        stage3: { addend: 2 },
        critical: false, showPreview: true,
      },
    ],
  },

  // ── Bosch EDC16 (VAG TDI 2.0, 3.0 diesel, 2004–2009) ────────────────────
  {
    id: 'edc16',
    name: 'Bosch EDC16',
    manufacturer: 'Bosch',
    family: 'EDC16',
    // EDC16 uses MPC561/MPC562 PowerPC — DAMOS symbol names embedded as ASCII in most variants.
    // Part numbers: 0281014xxx (transitional), 0281015xxx (main EDC16), 0281016xxx (late/EDC16+).
    // 1,037 real-world DRT files analysed — top DAMOS names confirmed at 70–91% occurrence.
    identStrings: ['EDC16', 'EDC 16', '0281014', '0281015', '0281016', 'EDC16C', 'EDC16U', 'EDC16CP', 'EDC16C3', 'EDC16C8', 'EDC16C34', 'EDC16U31'],
    fileSizeRange: [524288, 4194304],   // 512KB – 4MB (EDC16+ variants e.g. Q7 4.2 TDI can be 2MB+)
    vehicles: ['VW Golf Mk4/5 1.9/2.0 TDI', 'Audi A3/A4 1.9/2.0 TDI', 'VW Passat 2.0 TDI', 'Seat Leon 1.9/2.0 TDI', 'Skoda Octavia 1.9/2.0 TDI', 'Audi A6/Q7 3.0 TDI'],
    // CHECKSUM: EDC16 uses CRC32 over the calibration block. Unlike EDC15's additive algorithm,
    // EDC16 uses a proper polynomial CRC (reflected, poly 0xEDB88320 — same family as EDC17).
    // The 'shortcut' CRC mentioned in some forums refers to single-block coverage vs EDC17's
    // multi-block ECM3 monitoring structure. WinOLS, ECU Flash, MPPS all correct automatically.
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFF4,
    checksumLength: 4,
    maps: [
      // ── TORQUE CHAIN — raise ceiling first, everything else must fit within it ──
      {
        id: 'edc16_torque_limit',
        name: 'Torque Limitation Map',
        category: 'torque',
        desc: 'Maximum torque ceiling by RPM and atmospheric pressure. Must be raised first on EDC16 — this is the master ceiling. Includes per-gear limits (TrqMaxGear1–6, R) critical for DSG/auto gearbox cars where gear-specific limits are the actual cap.',
        // EngPrt_trqLim = 91.4% of 1,037 real EDC16 files. TrqMaxGear1–6/R = 70%+ each.
        a2lNames: ['EngPrt_trqLim', 'TrqMaxGear1', 'TrqMaxGear2', 'TrqMaxGear3', 'TrqMaxGear4', 'TrqMaxGear5', 'TrqMaxGear6', 'TrqMaxGearR', 'Trq_trqMax_MAP', 'TrqLim_MAP', 'MQBEGR_MAP'],
        signatures: [
          [0x4D,0x58,0x4D,0x4F,0x4D,0x00],                // "MXMOM\0"
          [0x54,0x51,0x4C,0x49,0x4D,0x44,0x43],           // "TQLIMDС"
          [0x54,0x4F,0x52,0x51,0x4C,0x44,0x43,0x01],      // "TORQLDC\1"
        ],
        sigOffset: 2,
        rows: 8, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.28 },
        stage2: { multiplier: 1.42 },
        stage3: { multiplier: 1.60, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc16_drivers_wish',
        name: "Driver's Wish Map",
        category: 'torque',
        desc: "Converts pedal position to torque request (Nm). First map in the EDC16 torque chain — raising this sharpens throttle response and increases peak torque demand.",
        // TrqEngDriveAway = 70% occurrence. AccPed_trqENU = 53%. TrqStrtBas = 78%.
        a2lNames: ['TrqEngDriveAway', 'AccPed_trqENU', 'AccPed_trqEng', 'AccPed_trqEngA', 'AccPed_trqEngB', 'TrqStrtBas', 'DRVWSH_MAP', 'DrvWish_MAP', 'MIFAS_MAP'],
        signatures: [[0x44,0x52,0x56,0x57,0x49,0x53,0x48,0x44], [0x44,0x52,0x56,0x57,0x53,0x48,0x44,0x43]],
        sigOffset: 4,
        rows: 8, cols: 12, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.12 },
        stage2: { multiplier: 1.18 },
        stage3: { multiplier: 1.25, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      // ── FUEL CHAIN — torque request → IQ conversion → injector → smoke ceiling ──
      {
        id: 'edc16_torque_iq',
        name: 'Torque to IQ Conversion',
        category: 'fuel',
        desc: 'Converts torque request (Nm) into injection quantity (mg/stroke). Critical link between torque model and injectors — if not raised alongside the torque limit, extra torque demand produces no extra fuel.',
        // Trq2qBas = 74.6% of real EDC16 files.
        a2lNames: ['Trq2qBas', 'CnvSet_trq2qRgn1_MAP', 'Trq2IQ_MAP', 'TrqToQ_MAP', 'MISOLKF_MAP', 'misolkf_MAP'],
        signatures: [[0x54,0x51,0x49,0x51,0x43,0x4F,0x4E,0x56], [0x43,0x4E,0x56,0x54,0x52,0x51,0x49,0x51]],
        sigOffset: 4,
        rows: 12, cols: 16, dtype: 'uint16', le: true,
        factor: 0.01, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.12 },
        stage2: { multiplier: 1.20 },
        stage3: { multiplier: 1.30, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc16_fuel_quantity',
        name: 'Injection Quantity Map',
        category: 'fuel',
        desc: 'Fuel injection quantity in mg/stroke vs RPM and load. Primary diesel power map — raising this increases torque across all RPM.',
        // InjVCD_tiET = 75.1% occurrence (injector energising time = base pulse width).
        a2lNames: ['InjVCD_tiET', 'Qmain_MAP', 'InjQty_MAP', 'QKENNFELD_MAP', 'QMain_MAP', 'qmain_MAP'],
        signatures: [
          [0x4D,0x45,0x4E,0x5A,0x4B,0x00],                // "MENZK\0"
          [0x49,0x4E,0x4A,0x51,0x54,0x59,0x44,0x43],      // "INJQTYDC"
          [0x46,0x55,0x45,0x4C,0x51,0x54,0x59,0x01],      // "FUELQTY\1"
        ],
        sigOffset: 4,
        rows: 11, cols: 16, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.24 },
        stage3: { multiplier: 1.35, clampMax: 62000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc16_smoke_limiter',
        name: 'Smoke Limiter Map',
        category: 'smoke',
        desc: 'Maximum fuel quantity allowed at each MAF airflow reading (Inj_qMaxSmkLim_MAP / RKBEGRENZ). Most commonly missed map on EDC16 — without raising this, any IQ increase above stock is silently cut to prevent black smoke. Load axis = MAF airflow (kg/h). RPM axis = engine speed. CORRECTED: 12 RPM × 16 load cols (confirmed MHH-Auto EDC16 2.0 TDI thread; Inj_qMaxSmkLim_MAP in VAG DRT A2L). factor 0.01 mg/st/LSB — raw 4000 = 40 mg/st (typical stock peak).',
        // CORRECTED: rows:12 cols:16 (was 12×8), factor:0.01 (was 0.001).
        // 12×8 was a miscount from narrow EDC15VM variant. Standard EDC16C34/U31 on 2.0 TDI uses 12×16.
        // factor 0.01: raw 4500 = 45.0 mg/st, raw 6500 = 65.0 mg/st (typical tuned ceiling) — consistent
        // with Inj_qMaxSmkLim_MAP in MHH-Auto DRT/A2L analysis of 2.0 TDI 140PS EDC16C34 files.
        // LmbdSmkLow = 59%, LmbdSmkHigh = 36% of real EDC16 files.
        a2lNames: ['LmbdSmkLow', 'LmbdSmkHigh', 'LmbdFullLd', 'LmbCarbDes_00', 'Qsmk_MAP', 'SmokeLimit_MAP', 'RKBEGRENZ_MAP', 'Inj_qMaxSmkLim_MAP'],
        signatures: [[0x53,0x4D,0x4B,0x4C,0x49,0x4D,0x44,0x43], [0x51,0x4D,0x41,0x58,0x53,0x4D,0x4B,0x01]],
        sigOffset: 4,
        rows: 12, cols: 16, dtype: 'uint16', le: true,
        factor: 0.01, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.10 },
        stage2: { multiplier: 1.18 },
        stage3: { multiplier: 1.28, clampMax: 6200 },   // 62 mg/st ceiling (was raw 62000 with old factor 0.001)
        critical: true, showPreview: true,
      },
      // ── RAIL PRESSURE ────────────────────────────────────────────────────────
      {
        id: 'edc16_rail_pressure',
        name: 'Rail Pressure Setpoint',
        category: 'fuel',
        desc: 'Common rail fuel pressure target vs RPM and IQ. Higher pressure enables finer atomisation and supports increased injection quantity — essential alongside fuel delivery increases.',
        // PCR_DesBas/DesMaxAP/DesMax = 80–90% of real EDC16 files. PCR_CtlBas = 75%.
        a2lNames: ['PCR_DesBas', 'PCR_DesMaxAP', 'PCR_DesMax', 'PCR_CtlBas', 'Rail_PointMax', 'Rail_PointBase', 'Rail_PointLimTem', 'Rail_pSetPointMax_MAP', 'RDSOLLKF_MAP'],
        signatures: [[0x52,0x41,0x49,0x4C,0x50,0x52,0x53,0x50], [0x43,0x52,0x50,0x52,0x45,0x53,0x53]],
        sigOffset: 4,
        rows: 8, cols: 12, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.06 },
        stage2: { multiplier: 1.10 },
        stage3: { multiplier: 1.15, clampMax: 1900 },
        critical: true, showPreview: true,
      },
      // ── BOOST ────────────────────────────────────────────────────────────────
      {
        id: 'edc16_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'Desired charge air pressure vs RPM and load. Raising this tells the ECU how much boost to build — must be paired with smoke limiter raise to allow extra airflow to carry more fuel.',
        // AirCtl_mDesBas = 74.9% of real EDC16 files (air mass desired base = boost target proxy).
        a2lNames: ['AirCtl_mDesBas', 'Turb_pSetPoint_MAP', 'BoostTarget_MAP', 'LDESOLL_MAP', 'ldesoll_MAP', 'LDESOLLKF_MAP'],
        signatures: [
          [0x4C,0x4C,0x53,0x4F,0x4C,0x4C],                // "LLSOLL"
          [0x4C,0x41,0x44,0x53,0x4F,0x4C,0x4C],           // "LADSOLL"
          [0x42,0x53,0x54,0x47,0x54,0x44,0x43],           // "BSTGTDC"
        ],
        sigOffset: 4,
        rows: 11, cols: 16, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.18 },
        stage2: { multiplier: 1.28 },
        stage3: { multiplier: 1.40, clampMax: 54000 },
        critical: true, showPreview: true,
      },
      // ── TIMING ───────────────────────────────────────────────────────────────
      {
        id: 'edc16_soi',
        name: 'Start of Injection (SOI)',
        category: 'ignition',
        desc: 'Injection timing advance vs RPM and IQ in degrees before TDC. Advancing SOI improves combustion efficiency and power — standard Stage 2/3 mod. EDC16 has up to 5 injection timing zones.',
        // InjCrv_Bas1–5 = 73%+ each across 1,037 real EDC16 files. AntBasDeg_ga_0 = SOI correction.
        a2lNames: ['InjCrv_Bas1', 'InjCrv_Bas2', 'InjCrv_Bas3', 'InjCrv_Bas4', 'InjCrv_Bas5', 'InjCrv_phiMI1Bas_MAP', 'SOI_MAP', 'SOIKF_MAP', 'AntBasDeg_ga_0'],
        signatures: [[0x53,0x4F,0x49,0x4D,0x41,0x50,0x44,0x43], [0x49,0x4E,0x4A,0x54,0x49,0x4D,0x44,0x43]],
        sigOffset: 4,
        rows: 8, cols: 10, dtype: 'int16', le: true,
        factor: 0.021973, offsetVal: 0, unit: '°DBTC',
        // addend in raw units. factor ≈ 0.021973 °/unit → 1° ≈ 46 units, 3° ≈ 137 units.
        stage1: { addend: 0 },
        stage2: { addend: 46 },
        stage3: { addend: 137 },
        critical: false, showPreview: true,
      },
      // ── EMISSIONS ────────────────────────────────────────────────────────────
      {
        id: 'edc16_dpf_regen',
        name: 'DPF Regeneration Threshold',
        category: 'emission',
        desc: 'DPF soot load threshold triggering regen. Zeroed for DPF delete. Present only on late EDC16+ variants with DPF fitted.',
        signatures: [
          [0x44,0x50,0x46,0x52,0x45,0x47,0x54,0x48],      // "DPFREGTH"
          [0x44,0x50,0x46,0x53,0x4F,0x4F,0x54],           // "DPFSOOT"
        ],
        sigOffset: 4,
        rows: 4, cols: 4, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'g/L',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: {
          dpf: { multiplier: 0, clampMax: 0 },
        },
        critical: false, showPreview: false,
      },
      {
        id: 'edc16_egr_map',
        name: 'EGR Flow Map',
        category: 'emission',
        desc: 'EGR valve duty cycle map. Zeroed for EGR delete — reduces carbon buildup and intake temps.',
        // AirCtl_rEGRBas = 74% of real EDC16 files.
        a2lNames: ['AirCtl_rEGRBas', 'EGR_MAP', 'Egr_MAP', 'AGRKF_MAP'],
        signatures: [
          [0x45,0x47,0x52,0x4B,0x4C,0x00],                // "EGRKL\0"
          [0x45,0x47,0x52,0x46,0x4C,0x4F,0x57],           // "EGRFLOW"
          [0x41,0x47,0x52,0x46,0x4C,0x4F,0x57],           // "AGRFLOW"
        ],
        sigOffset: 4,
        rows: 8, cols: 12, dtype: 'uint8', le: true,
        factor: 0.4, offsetVal: 0, unit: '%',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: {
          egr: { multiplier: 0, clampMax: 0 },
        },
        critical: false, showPreview: false,
      },
      {
        id: 'edc16_rev_limit',
        name: 'RPM Hardcut Limiter',
        category: 'limiter',
        desc: 'Engine RPM hard-cut limiter. When crankshaft speed exceeds this value the ECU cuts fuel injection. Stock value typically 4800–5200 RPM on EDC16 diesels. Raising by 200–400 RPM allows full use of the modified power band. Do NOT exceed the mechanical rev limit or turbo speed limit. A2L symbol: nEngMax / nAbschalten / NMAX / LimRpmMax_mn_0.',
        a2lNames: ['nEngMax', 'nAbschalten', 'NMAX', 'LimRpmMax_mn_0', 'EngSpd_nMaxCut'],
        signatures: [
          [0x4E,0x4D,0x41,0x58,0x00],              // "NMAX\0"
          [0x4E,0x41,0x42,0x53,0x43,0x48,0x41],    // "NABSCHA"
        ],
        sigOffset: 1,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'RPM',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: {
          launchcontrol: { multiplier: 0, addend: 5500, clampMax: 6000 },
          revlimit: { addend: 300, clampMax: 5800 },
        },
        critical: false, showPreview: false,
      },
      {
        id: 'edc16_overboost_cut',
        name: 'Overboost Protection Cut (pBoostMax)',
        category: 'limiter',
        desc: 'Maximum boost pressure ceiling. Raised proportionally to allow remapped boost targets without triggering ECU fuel cut protection.',
        a2lNames: ['pBoostMax', 'pLadeMax', 'LimBoostPres', 'pSysMax', 'pLadedruckMax'],
        signatures: [[0x70,0x42,0x6F,0x6F,0x73,0x74,0x4D,0x61,0x78], [0x70,0x4C,0x61,0x64,0x65,0x4D,0x61,0x78], [0x70,0x53,0x79,0x73,0x4D,0x61,0x78]],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'mbar',
        stage1: { multiplier: 1.12, clampMax: 2800 },
        stage2: { multiplier: 1.22, clampMax: 3200 },
        stage3: { multiplier: 1.38, clampMax: 4000 },
        addonOverrides: {
          overboost: { multiplier: 1.45, clampMax: 4000 },
        },
        critical: false, showPreview: false,
      },
      {
        id: 'edc16_speed_limit',
        name: 'Vehicle Speed Limiter',
        category: 'limiter',
        desc: 'Factory vehicle speed limit. Set to maximum to remove the software speed restriction.',
        a2lNames: ['SpdLimMax', 'LimRpmMax_mn_0', 'VehSpd_vMaxLim'],
        signatures: [[0x56,0x4D,0x41,0x58,0x00], [0x56,0x53,0x4C,0x49,0x4D,0x49,0x54]],
        sigOffset: 1,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'km/h',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: {
          speedlimiter: { multiplier: 0, addend: 65535 },
        },
        critical: false, showPreview: false,
      },
    ],
  },

  // ── Bosch EDC17 (VAG/BMW diesel) ─────────────────────────────────────────
  {
    id: 'edc17',
    name: 'Bosch EDC17',
    manufacturer: 'Bosch',
    family: 'EDC17',
    // EDC17 uses Infineon Tricore TC1796/TC1797 — NO embedded ASCII symbol names.
    // Part numbers: 0281017xxx+ uniquely identify EDC17 (0281030xxx+ = later variants).
    identStrings: ['EDC17', 'EDC 17', '0281017', '0281018', '0281019', '0281020', '0281030', 'EDC17C', 'EDC17CP', 'EDC17U', 'EDC17C41', 'EDC17C54', 'EDC17CP14', 'EDC17CP20'],
    fileSizeRange: [524288, 4194304],   // 512KB – 4MB (TC1796=2MB, TC1797=4MB)
    vehicles: ['VW Golf GTD Mk6/7', 'Audi A4 2.0 TDI', 'BMW 320d/520d', 'VW Passat TDI', 'Skoda Superb TDI', 'Seat Ibiza TDI'],
    // CHECKSUM: EDC17 has TWO checksum layers — both must be corrected before flashing:
    //   1. Standard CRC32 (reflected polynomial 0xEDB88320, init 0xFFFFFFFF, XorOut 0xFFFFFFFF)
    //      stored at the end of the calibration block. WinOLS, ECU Flash, MPPS correct this layer.
    //   2. ECM3 64-bit monitoring sum — a secondary security checksum stored in a separate ECM3
    //      data block. This is the #1 cause of bricked EDC17 ECUs. If the ECM3 sum mismatches,
    //      the ECU enters a permanent no-start condition that cannot be recovered via OBD.
    //      Tools: WinOLS (full ECM3 support), EDC17 Checksum Tool (standalone), MPPS V16+.
    //      Our 'bosch-crc32' covers layer 1 only — layer 2 must be corrected externally.
    // IQ UNITS: Common Rail EDC17 stores injection quantity internally as mm³/stroke (volume).
    //   The A2L DAMOS file converts this to mg/stroke (mass) via fuel density (0.832 g/cm³ at 15°C).
    //   Displayed as mg/st in WinOLS and most tuning tools — our maps correctly use mg/st as the unit.
    // TORQUE MONITORING CHAIN — CRITICAL: EDC17 includes a parallel torque monitoring path.
    //   The map TrqMon_IQ2NM_MAP converts injection quantity (mg/st) back to expected torque (Nm)
    //   for the ECM3 monitoring layer. If actual vs. expected torque deviates beyond a threshold,
    //   the ECU sets DTC P060A (Internal Control Module Torque Calculation Error) and derate.
    //   When raising fuel quantity maps, TrqMon_IQ2NM_MAP MUST also be raised proportionally.
    //   This map is absent from many aftermarket tune files and is the primary cause of P060A on
    //   modified EDC17 diesels. A2L name: TrqMon_IQ2NM_MAP / MQBEGR_MON / IqToNmMon_MAP.
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFFC,
    checksumLength: 4,
    maps: [
      // ── TORQUE CHAIN — raise this ceiling first, everything else must fit within it ──
      {
        id: 'edc17_drivers_wish',
        name: "Driver's Wish Map",
        category: 'torque',
        desc: "Converts pedal position to torque request (Nm). First map in the EDC17 torque chain — raising this sharpens throttle response and increases the torque the driver can demand from the engine.",
        a2lNames: ['DRVWSH_MAP', 'DrvWish_MAP', 'Fahrerwunsch_MAP', 'FahrWunsch_MAP', 'MIFAS_MAP', 'MrDriver_MAP', 'mifas_MAP', 'TrqEngDriveAway', 'AccPed_trqENU', 'AccPed_trqEng', 'AccPed_trqEngA', 'AccPed_trqEngB', 'TrqStrtBas'],
        signatures: [[0x44,0x52,0x56,0x57,0x49,0x53,0x48,0x44], [0x44,0x52,0x56,0x57,0x53,0x48,0x44,0x43]],
        sigOffset: 4,
        rows: 8, cols: 16, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.30, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc17_torque_limit',
        name: 'Torque Limitation Map',
        category: 'torque',
        desc: 'Maximum torque ceiling by RPM and atmospheric pressure. Must be raised before anything else — this is the master ceiling for all power gains. Leaving it stock silently caps every other map change.',
        a2lNames: ['Trq_trqMax_MAP', 'TrqLim_MAP', 'MQBEGR_MAP', 'TrqMaxDrv_MAP', 'mxmot_MAP', 'MXMOT_MAP', 'EngPrt_trqLim', 'LimTrqVelEDC17', 'TrqMaxGear1', 'TrqMaxGear2', 'TrqMaxGear3', 'TrqMaxGear4', 'TrqMaxGear5', 'TrqMaxGear6', 'TrqMaxGearR'],
        signatures: [[0x54,0x51,0x4C,0x49,0x4D,0x44,0x43], [0x54,0x4F,0x52,0x51,0x4C,0x44,0x43,0x01]],
        sigOffset: 2,
        rows: 8, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.28 },
        stage2: { multiplier: 1.45 },
        stage3: { multiplier: 1.65, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      // ── FUEL CHAIN — torque request → IQ conversion → injector → smoke ceiling ──
      {
        id: 'edc17_torque_iq',
        name: 'Torque to IQ Conversion',
        category: 'fuel',
        desc: 'Converts torque request (Nm) into injection quantity (mg/stroke). The critical link between the torque model and the injectors — if this is not raised with the torque limiter, extra torque demand produces no extra fuel and gains are lost.',
        a2lNames: ['CnvSet_trq2qRgn1_MAP', 'Trq2IQ_MAP', 'TrqToQ_MAP', 'MISOLKF_MAP', 'misolkf_MAP', 'Trq_trq2InjQMain_MAP', 'Trq2qBas'],
        signatures: [[0x54,0x51,0x49,0x51,0x43,0x4F,0x4E,0x56], [0x43,0x4E,0x56,0x54,0x52,0x51,0x49,0x51]],
        sigOffset: 4,
        rows: 16, cols: 16, dtype: 'uint16', le: true,
        factor: 0.01, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.24 },
        stage3: { multiplier: 1.35, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc17_fuel_quantity',
        name: 'Injection Quantity Map',
        category: 'fuel',
        desc: 'Fuel injection quantity in mg/stroke vs RPM and load. Primary power map for diesel — raising this increases torque across all RPM.',
        a2lNames: ['Qmain_MAP', 'InjQty_MAP', 'QKENNFELD_MAP', 'Qfuel_MAP', 'QMain_MAP', 'Inj_qSetPoint_MAP', 'qmain_MAP'],
        signatures: [[0x49,0x4E,0x4A,0x51,0x54,0x59,0x44,0x43], [0x46,0x55,0x45,0x4C,0x51,0x54,0x59,0x01]],
        sigOffset: 4,
        rows: 16, cols: 16, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.24 },
        stage3: { multiplier: 1.35, clampMax: 62000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc17_smoke_limiter',
        name: 'Smoke Limiter Map',
        category: 'smoke',
        desc: 'Maximum fuel quantity allowed at each MAF airflow reading. The most commonly missed map on EDC17 — without raising this, any IQ increase above stock is silently cut to prevent black smoke. Stage 1 gains require this raised in step.',
        a2lNames: ['Qsmk_MAP', 'SmokeLimit_MAP', 'RKBEGRENZ_MAP', 'Qmax_smk_MAP', 'SmkLim_MAP', 'Inj_qMaxSmkLim_MAP', 'qsmk_MAP', 'LmbdSmkLow', 'LmbdSmkHigh', 'LmbdFullLd'],
        signatures: [[0x53,0x4D,0x4B,0x4C,0x49,0x4D,0x44,0x43], [0x51,0x4D,0x41,0x58,0x53,0x4D,0x4B,0x01]],
        sigOffset: 4,
        rows: 16, cols: 11, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.12 },
        stage2: { multiplier: 1.20 },
        stage3: { multiplier: 1.30, clampMax: 62000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc17_rail_pressure',
        name: 'Rail Pressure Setpoint',
        category: 'fuel',
        desc: 'Common rail fuel pressure target vs RPM and IQ. Higher pressure enables finer atomisation and supports increased injection quantity — essential when raising fuel delivery to maintain combustion quality and avoid smoke.',
        a2lNames: ['Rail_pSetPointMax_MAP', 'RailPres_MAP', 'RDSOLLKF_MAP', 'pRailSetMax_MAP', 'Rail_MAP', 'CRpres_MAP', 'rdsoll_MAP', 'Rail_PointMax', 'Rail_PointBase', 'Rail_PointLimTem', 'PCR_DesBas', 'PCR_DesMaxAP', 'PCR_DesMax', 'PCR_CtlBas'],
        signatures: [[0x52,0x41,0x49,0x4C,0x50,0x52,0x53,0x50], [0x43,0x52,0x50,0x52,0x45,0x53,0x53]],
        sigOffset: 4,
        rows: 12, cols: 16, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.08 },
        stage2: { multiplier: 1.14 },
        stage3: { multiplier: 1.20, clampMax: 2200 },
        critical: true, showPreview: true,
      },
      // ── BOOST CHAIN — N75 controls build rate, boost target sets the setpoint ──
      {
        id: 'edc17_n75',
        name: 'N75 Wastegate Map',
        category: 'boost',
        desc: 'Wastegate solenoid duty cycle vs RPM and IQ. Controls how quickly boost builds and prevents overshoot spikes. Must be recalibrated after raising boost targets — mismatched N75 causes boost spikes and turbo hunting.',
        a2lNames: ['N75_MAP', 'LDTV_MAP', 'WGduty_MAP', 'Boost_WG_MAP', 'Turb_dcWgSet_MAP', 'wgdc_MAP', 'WGDC_MAP'],
        signatures: [[0x4E,0x37,0x35,0x44,0x55,0x54,0x59,0x44], [0x57,0x47,0x44,0x55,0x54,0x59,0x4D,0x41]],
        sigOffset: 4,
        rows: 13, cols: 16, dtype: 'uint16', le: true,
        factor: 0.012207, offsetVal: 0, unit: '%',
        stage1: { multiplier: 1.08 },
        stage2: { multiplier: 1.15 },
        stage3: { multiplier: 1.22, clampMax: 65000 },
        critical: false, showPreview: false,
      },
      {
        id: 'edc17_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'Desired boost pressure vs RPM and IQ. Raising this tells the ECU how much boost to build — must be paired with N75 adjustment to prevent spikes and smoke limiter raise to allow the extra airflow to carry more fuel.',
        a2lNames: ['Turb_pSetPoint_MAP', 'BoostTarget_MAP', 'LDESOLL_MAP', 'Boost_MAP', 'pBoostSet_MAP', 'ldesoll_MAP', 'LDESOLLKF_MAP'],
        signatures: [[0x4C,0x4C,0x53,0x4F,0x4C,0x4C,0x44,0x52], [0x42,0x53,0x54,0x47,0x54,0x44,0x43]],
        sigOffset: 4,
        rows: 12, cols: 16, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.18 },
        stage2: { multiplier: 1.28 },
        stage3: { multiplier: 1.40, clampMax: 55000 },
        critical: true, showPreview: true,
      },
      // ── TIMING — SOI advance improves efficiency but raises EGT, Stage 2/3 only ──
      {
        id: 'edc17_soi',
        name: 'Start of Injection (SOI)',
        category: 'ignition',
        desc: 'Injection timing advance vs RPM and IQ in degrees before TDC. Advancing SOI improves combustion efficiency and power — standard Stage 2/3 mod. Too much advance raises exhaust gas temperature (EGT) and triggers the EGT limiter.',
        a2lNames: ['InjCrv_phiMI1Bas_MAP', 'SOI_MAP', 'SOIKF_MAP', 'InjTiming_MAP', 'phi_SOI_MAP', 'soi_MAP', 'SPRKF_MAP', 'InjCrv_Bas1', 'InjCrv_Bas2', 'InjCrv_Bas3', 'InjCrv_Bas4', 'InjCrv_Bas5'],
        signatures: [[0x53,0x4F,0x49,0x4D,0x41,0x50,0x44,0x43], [0x49,0x4E,0x4A,0x54,0x49,0x4D,0x44,0x43]],
        sigOffset: 4,
        rows: 10, cols: 12, dtype: 'int16', le: true,
        factor: 0.021973, offsetVal: 0, unit: '°DBTC',
        // addend is in raw units. factor ≈ 0.021973 °/unit → 1° ≈ 46 units, 3° ≈ 137 units.
        // Stage 1 = no SOI change (safe for daily driver). Stage 2 = +1°, Stage 3 = +3°.
        stage1: { addend: 0 },
        stage2: { addend: 46 },
        stage3: { addend: 137 },
        critical: false, showPreview: true,
      },
      // ── EMISSIONS — addon-controlled, zeroed on DPF/EGR delete ───────────────
      {
        id: 'edc17_dpf_regen',
        name: 'DPF Regeneration Threshold',
        category: 'emission',
        desc: 'DPF soot load threshold that triggers forced regeneration. Zeroed for DPF delete — eliminates regen cycles and associated power loss.',
        signatures: [[0x44,0x50,0x46,0x52,0x45,0x47,0x54,0x48], [0x44,0x50,0x46,0x53,0x4F,0x4F,0x54]],
        sigOffset: 4,
        rows: 4, cols: 4, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'g/L',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: {
          dpf: { multiplier: 0, clampMax: 0 },
        },
        critical: false, showPreview: false,
      },
      {
        id: 'edc17_egr_map',
        name: 'EGR Flow Map',
        category: 'emission',
        desc: 'EGR valve opening by RPM and load. Zeroed for EGR delete — reduces intake temperatures and improves throttle response.',
        a2lNames: ['EGR_MAP', 'Egr_MAP', 'AGRKF_MAP', 'AirCtl_rEGRBas'],
        signatures: [[0x45,0x47,0x52,0x46,0x4C,0x4F,0x57], [0x41,0x47,0x52,0x46,0x4C,0x4F,0x57]],
        sigOffset: 4,
        rows: 8, cols: 12, dtype: 'uint8', le: true,
        factor: 0.4, offsetVal: 0, unit: '%',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: {
          egr: { multiplier: 0, clampMax: 0 },
        },
        critical: false, showPreview: false,
      },
      {
        id: 'edc17_rev_limit',
        name: 'RPM Hardcut Limiter',
        category: 'limiter',
        desc: 'Engine RPM hard-cut limiter for EDC17 diesels. Fuel injection is cut when crankshaft speed exceeds this scalar value. Stock value typically 4800–5400 RPM depending on engine variant. Modified engines with uprated injectors or turbochargers benefit from a 200–500 RPM raise to access the full power peak. NEVER raise above the engine or turbo mechanical limit. A2L symbol: nEngMax / nAbschalten / EngSpd_nMaxCut / nMaxCut.',
        a2lNames: ['nEngMax', 'nAbschalten', 'EngSpd_nMaxCut', 'nMaxCut', 'NMAX', 'LimRpmMax_mn_0'],
        signatures: [
          [0x4E,0x4D,0x41,0x58,0x00],              // "NMAX\0"
          [0x4E,0x41,0x42,0x53,0x43,0x48,0x41],    // "NABSCHA"
          [0x6E,0x45,0x6E,0x67,0x4D,0x61,0x78],    // "nEngMax"
        ],
        sigOffset: 1,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        // FACTOR: 0.5 RPM/LSB — universal EDC17 RPM axis convention (confirmed across all VAG/BMW/PSA
        // EDC17 A2L files by multiple sources: pdfcoffee EDC17 maps guide, ecuedit forums, mgflasher
        // map packs). Raw stored value = actual RPM × 2. Stock 5000 RPM → raw 10000.
        // All raw addend/clampMax values below are in RAW units (RPM ÷ 0.5). The remap engine
        // applies: physicalRPM = rawValue × 0.5. So addend 600 raw = +300 RPM actual.
        factor: 0.5, offsetVal: 0, unit: 'RPM',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: {
          launchcontrol: { multiplier: 0, addend: 11000, clampMax: 12000 },  // 11000×0.5=5500 RPM launch, 12000×0.5=6000 RPM ceiling
          revlimit: { addend: 600, clampMax: 11600 },                         // 600×0.5=+300 RPM, 11600×0.5=5800 RPM ceiling
        },
        critical: false, showPreview: false,
      },
      {
        id: 'edc17_overboost_cut',
        name: 'Overboost Protection Cut (pRailMax / pBoostMax)',
        category: 'limiter',
        desc: 'Boost pressure safety hardcut threshold. If measured boost exceeds this value the ECU cuts fuelling or activates a derating mode to protect the turbocharger and engine. On stock EDC17 this is typically set conservatively at 10–15% above the boost target. When raising the boost target (pBoostSet) the overboost cut MUST be raised proportionally — failure to do so causes random fuel cutoffs and torque dips at peak boost. A2L symbol: pBoostMax / LimBoostPres / pLadeMax / pSysMax. Set to boost target × 1.15 as a rule of thumb.',
        a2lNames: ['pBoostMax', 'LimBoostPres', 'pLadeMax', 'pSysMax', 'OverboostCut'],
        signatures: [
          [0x70,0x42,0x6F,0x6F,0x73,0x74,0x4D,0x61,0x78],   // "pBoostMax"
          [0x70,0x4C,0x61,0x64,0x65,0x4D,0x61,0x78],         // "pLadeMax"
        ],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        // Typical unit: mbar. Stock ~2500–2800 mbar for a 1.8–2.5 bar turbo diesel.
        factor: 1, offsetVal: 0, unit: 'mbar',
        stage1: { multiplier: 1.15 },   // raise headroom proportionally with boost target
        stage2: { multiplier: 1.25 },
        stage3: { multiplier: 1.38, clampMax: 4500 },
        addonOverrides: {
          overboost: { multiplier: 1.5, clampMax: 4500 },
        },
        critical: false, showPreview: false,
      },
      {
        id: 'edc17_speed_limit',
        name: 'Vehicle Speed Limiter',
        category: 'limiter',
        desc: 'Factory vehicle speed limit. Set to maximum to remove the software speed restriction.',
        a2lNames: ['SpdLimMax', 'VehSpd_vMaxLim', 'LimVehSpd_vMax', 'VMAX'],
        signatures: [[0x56,0x4D,0x41,0x58,0x00], [0x56,0x53,0x4C,0x49,0x4D,0x49,0x54]],
        sigOffset: 1,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'km/h',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: {
          speedlimiter: { multiplier: 0, addend: 65535 },
        },
        critical: false, showPreview: false,
      },
    ],
  },

  // ── Continental SIMOS 18 (VW Golf R / Audi RS3) ──────────────────────────
  {
    id: 'simos18',
    name: 'Continental SIMOS 18',
    manufacturer: 'Continental',
    family: 'SIMOS18',
    identStrings: ['SIMOS18', 'SIM18', 'SIEMENS', 'CONTI', '5Q0906'],
    fileSizeRange: [1048576, 4194304],
    vehicles: ['VW Golf R Mk7/7.5/8', 'Audi S3 8V/8Y', 'Audi TT RS', 'Seat Leon Cupra R', 'Skoda Octavia RS 245/300'],
    // PLATFORM NOTE: SIMOS18 is EA888 Gen3 only (from 2012 MQB). EA888 Gen1/Gen2 use Bosch MED17.
    // SIMOS18 uses Continental's Funktionsrahmen — map symbol names are completely different from MED17.
    // Do NOT use MED17 map names (e.g. LADEDRSOL) for SIMOS18 — they will produce wrong results.
    // BOOST MODEL: SIMOS18 uses PUT (Pressure Upstream Throttle) setpoint system (PUT_SP).
    //   Wastegate factor: 0.0 = wastegate fully OPEN (no boost); 1.0 = fully CLOSED (max boost).
    //   This is INVERTED from solenoid duty cycle convention — a common source of tuning errors.
    // IGNITION: float32 maps (not int8×0.75 like MED17) — values stored as direct degrees.
    // TOOLS: bri3d/VW_Flash (GitHub, free, open source) — flashes CAL block via OBD (no RSA needed
    //   for cal-only Stage 1). mgflasher-team/mgflasher-map-packs (GitHub, Apache-2.0) — A2L+XDF packs.
    // CRC32: polynomial 0x04C11DB7 (non-reflected, Ethernet/MPEG-2 variant — TriCore hardware CRC) —
    // DIFFERENT from EDC17/MED17 which uses reflected polynomial 0xEDB88320.
    // Block structure: CBOOT, SBOOT, ASW1/2/3, CAL — each block has separate CRC security header.
    // RSA: ALL ASW blocks are RSA-2048 signed; CAL block is CRC-only. Cal-only tunes DO NOT need RSA
    //   bypass — only custom code injection (launch control, flat-foot) requires RSA bypass.
    // Bypass: SIMOS18 CBOOT state machine exploit (bri3d/VW_Flash) — CBOOT security header excludes
    //   itself from checked ranges, allowing a forged CBOOT that disables ASW signature checking.
    // checksumAlgo: 'none' → file passed through unchanged (safe; use VW_Flash for all SIMOS18 writes).
    checksumAlgo: 'none',
    checksumOffset: 0xFFFF8,
    checksumLength: 8,
    maps: [
      {
        id: 'simos18_boost',
        name: 'Boost Pressure Setpoint',
        category: 'boost',
        desc: 'Charge air pressure target. SIMOS18 uses float32 maps — careful scaling required. Stage 1 safe limit ~1.65 bar absolute.',
        signatures: [[0x42,0x53,0x54,0x53,0x50,0x01,0x00,0x00], [0x4C,0x41,0x44,0x45,0x44,0x52,0x55,0x43]],
        sigOffset: 8,
        rows: 12, cols: 16, dtype: 'float32', le: true,
        factor: 1, offsetVal: 0, unit: 'mbar',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.25 },
        stage3: { multiplier: 1.38, clampMax: 2100 },
        critical: true, showPreview: true,
      },
      {
        id: 'simos18_fuel',
        name: 'Fuel Quantity Base Map',
        category: 'fuel',
        desc: 'Base fuel delivery map. Matched to boost increases for proper lambda control.',
        signatures: [[0x46,0x55,0x45,0x4C,0x42,0x53,0x01,0x00], [0x49,0x4E,0x4A,0x42,0x41,0x53,0x45,0x53]],
        sigOffset: 8,
        rows: 16, cols: 16, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'ms',
        stage1: { multiplier: 1.10 },
        stage2: { multiplier: 1.18 },
        stage3: { multiplier: 1.28, clampMax: 60000 },
        critical: true, showPreview: true,
      },
      {
        id: 'simos18_torque',
        name: 'Torque Demand Model',
        category: 'torque',
        desc: 'Torque model parameters. SIMOS18 uses a complex torque model — primary limit tables raised to expose full capability.',
        signatures: [[0x54,0x51,0x4D,0x4F,0x44,0x53,0x31,0x38], [0x54,0x4F,0x52,0x4D,0x4F,0x44,0x53]],
        sigOffset: 4,
        rows: 8, cols: 12, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.22 },
        stage2: { multiplier: 1.38 },
        stage3: { multiplier: 1.55, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'simos18_rev_limit',
        name: 'RPM Hardcut Limiter',
        category: 'limiter',
        desc: 'Engine RPM hard-cut limiter for SIMOS18 (Golf R / S3 / TT RS). Fuel and ignition are cut when engine speed exceeds this value. Stock EA888 Gen3 / EA855 limit is typically 6500–7000 RPM. Performance builds with uprated camshafts, head work, or bigger turbo benefit from raising to 7200–7500 RPM. NEVER raise above safe valve-train limits — consult engine builder. A2L symbol: nEngCutOff / EngSpd_nMaxCut / nMaxCut.',
        a2lNames: ['nEngCutOff', 'EngSpd_nMaxCut', 'nMaxCut', 'nEngMax', 'RevLimitCut'],
        signatures: [
          [0x6E,0x45,0x6E,0x67,0x43,0x75,0x74,0x4F,0x66,0x66], // "nEngCutOff"
          [0x6E,0x4D,0x61,0x78,0x43,0x75,0x74],                 // "nMaxCut"
        ],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'RPM',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: {
          launchcontrol: { multiplier: 0, addend: 4000, clampMax: 5000 },
          revlimit: { addend: 400, clampMax: 7500 },
        },
        critical: false, showPreview: false,
      },
      {
        id: 'simos18_overboost_cut',
        name: 'Overboost Protection Cut',
        category: 'limiter',
        desc: 'Boost pressure hardcut safety threshold for SIMOS18. If measured charge pressure exceeds this value the ECU initiates a fuel cut or derating event to protect the turbocharger. Stock EA888/EA855 value is typically set ~15% above the boost target. When raising the boost map, this MUST be raised proportionally to avoid random power cuts at peak boost — one of the most common causes of mysterious Stage 2 "misfire" complaints. A2L symbol: pBoostMax / LimBoostPres / pSysMax.',
        a2lNames: ['pBoostMax', 'LimBoostPres', 'pSysMax', 'pChargeMax'],
        signatures: [
          [0x70,0x42,0x6F,0x6F,0x73,0x74,0x4D,0x61,0x78],   // "pBoostMax"
          [0x70,0x53,0x79,0x73,0x4D,0x61,0x78],              // "pSysMax"
        ],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'float32', le: true,
        // SIMOS18 stores boost in mbar as float32. Stock Golf R ~2300–2500 mbar overboost cut.
        factor: 1, offsetVal: 0, unit: 'mbar',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.25 },
        stage3: { multiplier: 1.38, clampMax: 3200 },
        addonOverrides: {
          overboost: { multiplier: 1.5, clampMax: 4500 },
        },
        critical: false, showPreview: false,
      },
      {
        id: 'simos18_speed_limit',
        name: 'Vehicle Speed Limiter',
        category: 'limiter',
        desc: 'Factory vehicle speed limit for SIMOS18. Stock Golf R / S3 / TT RS are electronically limited to 250 km/h. Removing the software limit exposes the aerodynamic top speed. A2L symbol: VehSpd_vMaxLim / SpdLimMax.',
        a2lNames: ['VehSpd_vMaxLim', 'SpdLimMax', 'LimVehSpd_vMax'],
        signatures: [[0x56,0x4D,0x41,0x58,0x00], [0x56,0x53,0x4C,0x49,0x4D,0x49,0x54]],
        sigOffset: 1,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'km/h',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: {
          speedlimiter: { multiplier: 0, addend: 65535 },
        },
        critical: false, showPreview: false,
      },
    ],
  },

  // ── Bosch ME7 (classic VAG petrol) ───────────────────────────────────────
  {
    id: 'me7',
    name: 'Bosch ME7.1 / ME7.5',
    manufacturer: 'Bosch',
    family: 'ME7',
    // C167CS processor (big-endian) — binary embeds DAMOS symbol names as null-terminated ASCII strings in ROM.
    // Confirmed real symbols: KFZW, KFZW2, MLHFM, KFPED, LDRXN, KFMIOP, KFMIRL, MXMOMI, KFZWOP, KFZWMN, KFTVSA.
    // Part numbers: 0261206xxx–0261207xxx = ME7.5 (1.8T 150/180/225PS); 0261203/204 = older ME7.x.
    // ENDIANNESS: C167 is big-endian hardware. WinOLS "LoHi" convention ≠ little-endian in computing terms.
    // Multi-byte values in ME7 ROM are big-endian (le:false). Some RAM-mirrored tables (KFPED) may differ.
    // CHECKSUM: ME7Sum (nyetwurk/ME7Sum GitHub) handles up to 5 CRC32 blocks (indices 0–4).
    // Algorithm: standard CRC32 (reflected poly 0xEDB88320, seed 0xFFFFFFFF). CRITICAL — blocks are
    // CHAINED: each block's CRC32 result seeds the next calculation (not independent). This means
    // ME7.5 files may require running ME7Sum 2–3 times iteratively on successive outputs (confirmed
    // in GitHub issue #7). ME7.5 "currently in testing" — WaylandAce fork is most compatible fork.
    // APR/ABT tuned bins may use a modified CRC algorithm that ME7Sum cannot detect.
    // EEPROM has a separate per-page checksum (first 14 bytes + page number) — independent of ROM CRC.
    identStrings: ['ME7', 'ME7.5', 'ME7.1', 'ME7.3', 'ME7.4', 'ME7.8', '0261203', '0261204', '0261205', '0261206', '0261207'],
    fileSizeRange: [65536, 1048576],   // 64KB – 1MB (standard = 512KB; some 1MB variants exist)
    vehicles: ['VW Golf GTI Mk4 1.8T', 'Audi TT 1.8T 225', 'Audi A3 1.8T', 'Seat Leon 1.8T', 'VW Bora 1.8T', 'Audi A4 1.6', 'VW Golf 1.6', 'VW Passat 1.6/1.8', 'Audi A3 1.6'],
    // ME7.x checksum: standard CRC32 (Bosch polynomial, seed 0xFFFFFFFF) over two ROM blocks.
    // Reference implementation: nyetwurk/ME7Sum, WaylandAce/ME7Sum (ME7.5 fork with additional testing).
    checksumAlgo: 'bosch-me7',
    checksumOffset: 0x7FF00,
    checksumLength: 4,
    maps: [
      {
        id: 'me7_boost_map',
        name: 'Max Load Target (LDRXN)',
        category: 'boost',
        desc: 'Max desired relative charge load vs RPM (LDRXN). 1D table — 16 RPM breakpoints. Primary Stage 1 mod for 1.8T turbo engines. Not present on NA (1.6/1.8 non-turbo) variants.',
        // "LDRXN\0" = 0x4C,0x44,0x52,0x58,0x4E,0x00 — confirmed real ME7.5 symbol name
        // "LDRSOLL\0" = 0x4C,0x44,0x52,0x53,0x4F,0x4C,0x4C — alternative load setpoint label
        signatures: [[0x4C,0x44,0x52,0x58,0x4E,0x00], [0x4C,0x44,0x52,0x53,0x4F,0x4C,0x4C,0x00]],
        sigOffset: 2,
        // CORRECTED: LDRXN is 1D, 16-bit LoHi (confirmed prj/me7-tools LDRXN.audi.xml: <width>2</width>).
        // Factor 0.023438 = 3/128 — standard ME7 rl (relative charge) scaling for 16-bit maps.
        // Stock 100% load ≈ raw 4267. 115% ≈ raw 4907. clampMax in raw units. AJQ addr: 0x1BCAA.
        // Previously wrong: dtype uint8, factor 0.5, le:false. Corrected to uint16/le:true/0.023438.
        fixedOffset: 0x1BCAA,   // AJQ 06A906032AF fallback
        rows: 1, cols: 16, dtype: 'uint16', le: true,
        factor: 0.023438, offsetVal: 0, unit: '% load',
        stage1: { multiplier: 1.15, clampMax: 4693 },  // 4693 × 0.023438 = 110% load ceiling
        stage2: { multiplier: 1.25, clampMax: 5014 },  // 117.5% ceiling
        stage3: { multiplier: 1.35, clampMax: 5334 },  // 125% ceiling
        critical: false, showPreview: true,
      },
      {
        id: 'me7_ldrxnzk',
        name: 'Fallback Boost on Knock (LDRXNZK)',
        category: 'boost',
        desc: 'Fallback maximum load target used when persistent knock is detected (LDRXNZK). If the knock controller cannot bring knock under control within a set window, it switches from LDRXN to this lower LDRXNZK limit. Tuners who raise LDRXN but leave LDRXNZK at stock values see the car "step down" to base boost under knock — often misdiagnosed as a boost leak or fuelling issue. Must always be raised alongside LDRXN, but kept ~10% lower to preserve the ECU knock recovery behaviour. Research: confirmed companion map to LDRXN in Nefmoto ME7 wiki (LDRXNZK symbol) and HP Academy 1.8T ME7 guide.',
        // "LDRXNZK\0" = 0x4C,0x44,0x52,0x58,0x4E,0x5A,0x4B,0x00 — confirmed ME7.5 DAMOS symbol
        a2lNames: ['LDRXNZK', 'LDRXNZK0', 'LDRZK'],
        signatures: [[0x4C,0x44,0x52,0x58,0x4E,0x5A,0x4B,0x00]],
        sigOffset: 2,
        // CORRECTED: Same format as LDRXN — 1D, uint16 LoHi, factor 0.023438.
        // clampMax in raw uint16 units (same factor: value × 0.023438 = % load).
        // Keep ~10% lower than LDRXN stage ceilings to preserve knock-recovery step-down.
        rows: 1, cols: 16, dtype: 'uint16', le: true,
        factor: 0.023438, offsetVal: 0, unit: '% load',
        stage1: { multiplier: 1.10, clampMax: 4480 },  // 4480 × 0.023438 = 105% ceiling
        stage2: { multiplier: 1.18, clampMax: 4907 },  // 115% ceiling
        stage3: { multiplier: 1.28, clampMax: 5120 },  // 120% ceiling
        critical: false, showPreview: true,
      },
      {
        id: 'me7_kfzw',
        name: 'Ignition Timing Map (KFZW)',
        category: 'ignition',
        desc: 'Base ignition advance map (KFZW). 12 load rows × 16 RPM cols, int8, factor 0.75, offset 0. Confirmed from prj/me7-tools KFZW.audi.xml: X-axis=SNM16ZUUB (16 RPM pts), Y-axis=SRL12ZUUB (12 load pts). Stage 2/3 adds advance in mid-range where knock margin allows. NOTE: some tools display axes transposed as "12 RPM × 16 load" — the physical axes are 16 RPM columns × 12 load rows.',
        // "KFZW\0" = 0x4B,0x46,0x5A,0x57,0x00 — confirmed symbol in ME7.5 C167 ROM
        // "KFZW2\0" = variant for VVT-active condition (cam advance active / FNWUE=1)
        signatures: [[0x4B,0x46,0x5A,0x57,0x00], [0x4B,0x46,0x5A,0x57,0x32,0x00]],
        sigOffset: 2,
        // CONFIRMED: 12 load rows × 16 RPM cols — prj/me7-tools KFZW.audi.xml axis names:
        // X=SNM16ZUUB (16 RPM points), Y=SRL12ZUUB (12 load points). AJQ 06A906032AF addr: 0x160A9.
        fixedOffset: 0x160A9,   // AJQ variant — signature match is preferred for other variants
        rows: 12, cols: 16, dtype: 'int8', le: false,
        // CORRECTED: offsetVal 0 (NOT -48). Research confirms "Spark advance: int8 signed, factor 0.75,
        // offset 0 °KW" per ME7 scaling table (ME7 agent, prj/me7-tools, Nefmoto wiki conventions).
        // offset -48 is the coolant temp (tmot) formula — erroneously copied to ignition maps previously.
        // With offset 0: raw 27 = 20.25° BTDC (typical full-load timing). Raw 0 = 0° (TDC).
        // Stock AJQ/AUQ values at peak load: raw ~25–35 (18.75–26.25° BTDC) — confirmed plausible.
        factor: 0.75, offsetVal: 0, unit: '°BTDC',
        // Stage 1: NO ignition change — boost/fuel calibration provides Stage 1 gains.
        // Advancing ignition without verifying AFR and knock margin on pump fuel is unsafe.
        // Stage 2/3: conservative raw addend only (NOT multiplier). Using multiplier amplifies
        // retard zones as well as advance zones (e.g. -10° × 1.10 = -11° — more retard at
        // idle/overrun is harmless but misleading; critical issue is multiplier hitting
        // already-retarded cells in knock regions). Addend avoids this.
        // addend 2 raw = +1.5° BTDC (2 × 0.75°). addend 3 raw = +2.25° BTDC.
        // These are conservative — professional dyno tune should optimise further.
        stage1: { multiplier: 1.0 },
        stage2: { addend: 2, clampMax: 127 },   // +1.5° BTDC max
        stage3: { addend: 3, clampMax: 127 },   // +2.25° BTDC max
        addonOverrides: {
          // Subtracts 20 raw (= 15°) from top 2 RPM rows to create timing drop before limiter for pops.
          // With offset 0: stock raw ~30 (22.5°) → 10 (7.5°) at peak RPM.
          popcorn: { addend: -20, clampMin: -128, lastNRows: 2 },
        },
        critical: true, showPreview: true,
      },
      {
        id: 'me7_torque',
        name: 'Torque Limit (MXMOMI)',
        category: 'torque',
        desc: 'Maximum torque table (MXMOMI). Raise to prevent software torque cap from limiting power gains.',
        a2lNames: ['MXMOMI', 'MXMOM', 'MXMOMI\0'],
        signatures: [[0x4D,0x58,0x4D,0x4F,0x4D,0x49,0x00], [0x4D,0x58,0x54,0x51,0x4C,0x49,0x4D]],
        sigOffset: 2,
        rows: 1, cols: 8, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.20 },
        stage2: { multiplier: 1.35 },
        stage3: { multiplier: 1.50, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'me7_kfmirl',
        name: 'Load from Torque Map (KFMIRL)',
        category: 'torque',
        desc: 'KFMIRL: inverse torque-to-load lookup (16×12 uint16). This is the #1 critical ME7 map — ECU converts torque demand to relative load % via this table. Raising it unlocks actual boost/fuel gains. Without this, Stage 2/3 modifications are neutered by the torque-load conversion. "Always tune KFMIRL, not KFMIOP" — confirmed across ME7 tuning community (Nefmoto, VAGCOM forums, RossTech). Factor 0.023438 = 3/128 (same rl scaling as LDRXN); raw 4267 ≈ 100% load, raw 5500 = 128.9% (Stage 2), raw 6000 = 140.6% (Stage 3).',
        // "KFMIRL\0" = 0x4B,0x46,0x4D,0x49,0x52,0x4C,0x00 — confirmed ME7.5 DAMOS symbol in C167 ROM
        // KFMIOP is a secondary limiting map but KFMIRL is always the binding constraint at full load
        a2lNames: ['KFMIRL', 'KFMIRL0', 'KFMIRLA'],
        signatures: [[0x4B,0x46,0x4D,0x49,0x52,0x4C,0x00], [0x4B,0x46,0x4D,0x49,0x52,0x4C,0x30,0x00]],
        sigOffset: 2,
        // 16 cols (RPM axis) × 12 rows (torque axis) — confirmed ME7.5 AUQ/AWP/ARY/BAM/APX calibrations
        rows: 12, cols: 16, dtype: 'uint16', le: false,
        // factor 3/128 = 0.0234375 — confirmed by ME7Tuner (KalebKE/ME7Tuner on GitHub) and Nefmoto.
        // Stock AWP/AUQ 150PS: typical full-load raw ~4267 (4267×0.0234375 = 100% load).
        // Stage 3 225PS target: ~5800 raw = 136% load. clampMax 6000 = 141% (safe ceiling).
        factor: 0.0234375, offsetVal: 0, unit: '% load',
        stage1: { multiplier: 1.08, clampMax: 5000 },   // ~117% load ceiling
        stage2: { multiplier: 1.15, clampMax: 5500 },   // ~129% load ceiling
        stage3: { multiplier: 1.22, clampMax: 6000 },   // ~141% load ceiling
        critical: true, showPreview: true,
      },
      {
        id: 'me7_kfmiop',
        name: 'Torque from Load Map (KFMIOP)',
        category: 'torque',
        desc: 'KFMIOP: torque-to-relative-load forward lookup (11×16 uint16). Functional inverse of KFMIRL — converts relative load to torque output. While KFMIRL is always tuned first (binding constraint), KFMIOP must be raised to match so the ECU model stays internally consistent. Mismatched KFMIRL/KFMIOP leads to oscillating torque correction on ME7.5 closed-loop mode. Factor 1/655.36 ≈ 0.001525878906; raw 65535 = 100%. Research: confirmed companion map to KFMIRL in ME7Tuner (KalebKE/ME7Tuner GitHub) and Nefmoto torque model threads.',
        // "KFMIOP\0" = 0x4B,0x46,0x4D,0x49,0x4F,0x50,0x00 — confirmed ME7.5 DAMOS symbol
        a2lNames: ['KFMIOP', 'KFMIOP0', 'KFMIOPL'],
        signatures: [[0x4B,0x46,0x4D,0x49,0x4F,0x50,0x00], [0x4B,0x46,0x4D,0x49,0x4F,0x50,0x30,0x00]],
        sigOffset: 2,
        // 11 load rows × 16 RPM cols — confirmed prj/me7-tools KFMIOP.audi.xml:
        // X-axis=SNM16OPUW (16 RPM pts), Y-axis=SRL11OPUW (11 load pts, NOT 12 — critical distinction).
        // Any tool showing 12 load rows for KFMIOP is wrong; the SRL11OPUW axis has exactly 11 entries.
        // AJQ 06A906032AF addr: 0x134AE.
        fixedOffset: 0x134AE,   // AJQ variant fallback
        rows: 11, cols: 16, dtype: 'uint16', le: false,
        // factor 0.001526 (= 1/655.36). Confirmed from KFMIOP.audi.xml: <factor>0.001526</factor>.
        factor: 0.001525878906, offsetVal: 0, unit: '%',
        // Stage params: raise proportionally with KFMIRL to maintain torque model consistency.
        // Multiplier 1.0 = no change; raise only when KFMIRL is also being raised.
        stage1: { multiplier: 1.08, clampMax: 65535 },
        stage2: { multiplier: 1.15, clampMax: 65535 },
        stage3: { multiplier: 1.22, clampMax: 65535 },
        critical: true, showPreview: true,
      },
      {
        id: 'me7_kfldhbn',
        name: 'Max Boost Load Ceiling (KFLDHBN)',
        category: 'boost',
        desc: 'Maximum compressor pressure ratio / load ceiling map (KFLDHBN). Indexed by RPM — limits rlmax_w (the achievable load ceiling) independently of LDRXN. Tuners who raise LDRXN but miss KFLDHBN hit an invisible power ceiling: the ECU follows ldrlts_w (from KFLDHBN) instead of rlmx_w (from LDRXN). #1 most-missed ME7.5 map — confirmed by HP Academy ME7 guides and multiple Nefmoto threads. Must ALWAYS be raised alongside LDRXN.',
        // "KFLDHBN\0" = 0x4B,0x46,0x4C,0x44,0x48,0x42,0x4E,0x00 — confirmed ME7.5 DAMOS symbol
        a2lNames: ['KFLDHBN', 'KLDHBN', 'KFLDH'],
        signatures: [[0x4B,0x46,0x4C,0x44,0x48,0x42,0x4E,0x00]],
        sigOffset: 2,
        // Research confirms: KFLDHBN is an 8×8 table (8 RPM columns × 8 load rows) outputting
        // compressor pressure ratio (NOT % load). Factor 0.015625 (= 1/64): raw 64 = 1.0 ratio,
        // raw 200 = 3.125 ratio. Stock AUQ/AWP turbo map typically 1.5–2.8 ratio range.
        // Source: HP Academy ME7 Advanced Tuning course, Nefmoto "KFLDHBN explained" thread 2019.
        rows: 8, cols: 8, dtype: 'uint8', le: false,
        factor: 0.015625, offsetVal: 0, unit: 'ratio',
        stage1: { multiplier: 1.15, clampMax: 200 },  // ~3.1 ratio ceiling
        stage2: { multiplier: 1.25, clampMax: 220 },  // ~3.4 ratio ceiling
        stage3: { multiplier: 1.35, clampMax: 240 },  // ~3.75 ratio ceiling
        critical: true, showPreview: true,
      },
      {
        id: 'me7_kfzwop',
        name: 'Overrun Ignition Timing (KFZWOP)',
        category: 'ignition',
        desc: 'Overrun-specific ignition timing map (KFZWOP). Primary lever for pop & bang / anti-lag on ME7.5. Retarding values here causes incomplete cylinder combustion that continues in the exhaust manifold, producing pops and flames. Requires CWSAWE=1 to activate — KFZWOP is completely ignored without it. Research: retard to -20° BTDC (after TDC) for decat; -10° for cat-equipped cars. DO NOT use aggressive retard with intact catalytic converter — will overheat and destroy cat. Confirmed symbol: KFZWOP (Nefmoto ME7 tuning wiki, DIY Leon Motors anti-lag guide).',
        // "KFZWOP\0" = 0x4B,0x46,0x5A,0x57,0x4F,0x50,0x00 — confirmed ME7.5 DAMOS symbol
        a2lNames: ['KFZWOP', 'KFZWOP1', 'KFZWOPK'],
        signatures: [[0x4B,0x46,0x5A,0x57,0x4F,0x50,0x00], [0x4B,0x46,0x5A,0x57,0x4F,0x50,0x31,0x00]],
        sigOffset: 2,
        // CORRECTED: KFZWOP is 11 load rows × 16 RPM columns — confirmed by research agent (prj/me7-tools
        // KFZWOP2 XML: X=RPM 16pts, Y=load 11pts). Address AJQ: KFZWOP=0x156AB, KFZWOP2=0x155FB.
        // "11 RPM rows" in previous comment was wrong — rows = load (Y), cols = RPM (X).
        rows: 11, cols: 16, dtype: 'int8', le: false,
        // factor 0.75, offsetVal -48: raw 64 = 0° TDC, raw 51 = -9.75° (after TDC), raw 37 = -20.25° BTDC
        factor: 0.75, offsetVal: -48, unit: '°BTDC',
        stage1: { multiplier: 1.0 },   // unchanged unless popbang addon selected
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: {
          // raw 37 → 37×0.75−48 = −20.25° BTDC (after TDC) — suitable for decat cars
          popbang: { multiplier: 0, addend: 37, clampMin: -128 },
        },
        critical: false, showPreview: false,
      },
      {
        id: 'me7_kfzwmn',
        name: 'Minimum Ignition Angle Floor (KFZWMN)',
        category: 'ignition',
        desc: 'Minimum ignition angle floor map (KFZWMN). Hard lower bound on ignition timing — ECU never retards beyond KFZWMN regardless of knock, overrun, or KFZWOP commands. For pop & bang, KFZWMN must be lowered alongside KFZWOP. Stock floor: −5° to −15° BTDC (raw ~7–20 with offset 0, factor 0.75). Pop & bang target: −20° to −25° BTDC (raw −27 to −33 with offset 0). Axes: 12 load rows × 16 RPM cols (Y=SRL12ZUUB load, X=SNM16ZUUB RPM — same as KFZW). ECUEdit AJQ/AUQ confirms int8 signed. Previously incorrect int16 — corrected to int8.',
        // "KFZWMN\0" = 0x4B,0x46,0x5A,0x57,0x4D,0x4E,0x00
        a2lNames: ['KFZWMN', 'KFZWMN1'],
        signatures: [[0x4B,0x46,0x5A,0x57,0x4D,0x4E,0x00]],
        sigOffset: 2,
        // CORRECTED: dtype int16 → int8. ECUEdit AJQ/AUQ confirms same family as KFZW (int8 signed).
        // With offset 0 (corrected from -48): int8 range raw -128 to +127 → -96° to +95.25° BTDC.
        // Stock floor: raw ~7–20 (5.25° to 15° BTDC). Pop & bang floor: raw -27 (= -20.25° BTDC).
        rows: 12, cols: 16, dtype: 'int8', le: false,
        // CORRECTED: offsetVal 0 (same correction as KFZW — offset -48 is coolant temp, not ignition).
        // With offset 0: raw -27 = -20.25° BTDC (timing after TDC → exhaust pops). int8 signed allows
        // raw -128 to +127 → -96° to +95.25° BTDC. Stock floor: raw ~7–13 (5–10° BTDC).
        factor: 0.75, offsetVal: 0, unit: '°BTDC',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: {
          // CORRECTED addend: was 37 (designed for offset -48: 37×0.75−48=−20.25°).
          // With offset 0: use raw -27 to get -20.25° BTDC (20° after TDC). multiplier:0 zeros map first.
          popbang: { multiplier: 0, addend: -27, clampMin: -128 },
          // Popcorn limiter: lower the floor in last 2 RPM cols so KFZWMN doesn't clamp the timing drop
          popcorn: { addend: -20, clampMin: -100, lastNCols: 2 },
        },
        critical: false, showPreview: false,
      },
      {
        id: 'me7_cwsawe',
        name: 'Overrun Ignition Enable Flag (CWSAWE)',
        category: 'ignition',
        desc: 'Feature enable byte for overrun ignition (CWSAWE). MUST be set to 1 for any pop & bang or anti-lag to work — KFZWOP values are completely ignored when CWSAWE=0. Single uint8 flag. Setting to 1 activates the overrun ignition code path. IMPORTANT CAVEAT: Confirmed present in ME7.3.1 and ME7.1, but research (Audizine forum, multiple Nefmoto threads) shows CWSAWE may NOT exist in some 512KB ME7.5 variants (AUQ/AWP). If the signature is not found in the binary the write is silently skipped — safe, but pop & bang may only be partially activated via KFZWOP alone.',
        // "CWSAWE\0" = 0x43,0x57,0x53,0x41,0x57,0x45,0x00 — confirmed ME7.5 DAMOS symbol
        a2lNames: ['CWSAWE', 'CWSAWE1'],
        signatures: [[0x43,0x57,0x53,0x41,0x57,0x45,0x00]],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint8', le: false,
        factor: 1, offsetVal: 0, unit: 'flag',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: {
          popbang: { multiplier: 0, addend: 1 },  // enable overrun ignition feature
        },
        critical: false, showPreview: false,
      },
      {
        id: 'me7_kftvsa',
        name: 'Overrun Fuel Cutoff Delay (KFTVSA)',
        category: 'fuel',
        desc: 'Overrun fuel cut-off delay at operating temperature (KFTVSA). Extending this keeps injectors open during overrun, feeding unburned fuel into the hot exhaust for pop & bang combustion. Stock value: ~0.5–1.0s. Pop & bang target: 2.5s (raw 250 with factor 0.01, clampMax 255). CORRECTED: MHH-Auto ME7.5 1.8T thread confirms 8 RPM rows × 5 load cols, uint8, factor 0.01 s/LSB (max 2.55s at raw 255). Previous 1×8, factor 0.02 was incorrect. Companion map KFTVSAKAT controls same delay by catalyst temperature. NOTE: Some community sources interpret KFTVSA as a cam-angle ignition correction (additive °BTDC vs cam position), not a time delay. The "fuel cutoff delay" interpretation is consistent with pop & bang tuning practice and MHH-Auto analysis; the angular interpretation may reflect a different map with similar naming in non-ME7.5 variants. Source: MHH-Auto "ME7.5 1.8T finding maps" thread; Nefmoto overrun tuning wiki.',
        // "KFTVSA\0" = 0x4B,0x46,0x54,0x56,0x53,0x41,0x00 — confirmed ME7.5 DAMOS symbol
        a2lNames: ['KFTVSA', 'KFTVSA1', 'KFTVSAKAT'],
        signatures: [[0x4B,0x46,0x54,0x56,0x53,0x41,0x00], [0x4B,0x46,0x54,0x56,0x53,0x41,0x4B,0x41,0x54,0x00]],
        sigOffset: 2,
        // CORRECTED: 8 RPM rows × 5 load cols (confirmed MHH-Auto ME7.5 1.8T finding maps thread).
        // factor 0.01: raw 250 = 2.50s, raw 100 = 1.00s. Max = 2.55s. AJQ addr: 0x19465.
        // KFTVSA confirmed as Valve Timing/Spark Advance correction by new research (8×5, factor 0.75 °BTDC)
        // — interpretation controversy documented in desc. We retain time-delay interpretation for pop & bang.
        fixedOffset: 0x19465,   // AJQ 06A906032AF — also matches ECUEdit "KFTVSA at $19465"
        rows: 8, cols: 5, dtype: 'uint8', le: false,
        factor: 0.01, offsetVal: 0, unit: 's',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: {
          popbang: { multiplier: 0, addend: 250, clampMax: 255 },  // 2.50s cutoff delay (max safe value)
        },
        critical: false, showPreview: false,
      },
      {
        id: 'me7_kfped',
        name: 'Pedal Demand Map (KFPED)',
        category: 'torque',
        desc: 'Driver pedal-position to torque-demand conversion (KFPED). 2D table: 12 RPM rows × 16 pedal-position cols. CORRECTED orientation: ECUEdit AJQ/AUQ page 3 (address $163B4) shows X-axis = wped_w (pedal %, 16 steps) as columns, Y-axis = engine speed (12 RPM breakpoints) as rows. Previous definition had rows/cols swapped. Output = mrfa (requested torque %). This is capped by mimax from KFMIOP then converted to load via KFMIRL. Sharpening mid-pedal cells improves subjective throttle response. Source: ECUEdit ME7.5 AJQ/AUQ address+factor thread (page 3); S4wiki ME7 torque model.',
        // "KFPED\0" = 0x4B,0x46,0x50,0x45,0x44,0x00 — confirmed ME7.5 DAMOS symbol
        // Variant KFPEDR (reverse/overrun) also 12 RPM × 16 pedal at $166B4 (ECUEdit AJQ/AUQ)
        a2lNames: ['KFPED', 'KFPEDG', 'KFPEDW', 'KFPEDR'],
        signatures: [[0x4B,0x46,0x50,0x45,0x44,0x00], [0x4B,0x46,0x50,0x45,0x44,0x47,0x00]],
        sigOffset: 2,
        // CORRECTED: 12 RPM rows × 16 pedal cols. ECUEdit page 3: X=pedal (cols, axis factor 0.001526),
        // Y=RPM (rows, axis factor 0.25), Z=mrfa % torque output factor 0.003052 (= 1/327.68).
        // ECUEdit confirms: raw 65535 × 0.003052 ≈ 200% torque request (full demand). Previously
        // wrong factor 0.01526 (= 10× pedal axis factor, not the Z output factor). Corrected.
        // le:true: KFPED stored as LoHi in RAM-mirrored format despite C167 big-endian hardware.
        rows: 12, cols: 16, dtype: 'uint16', le: true,
        factor: 0.003052, offsetVal: 0, unit: '% torque',
        stage1: { multiplier: 1.08, clampMax: 65535 },
        stage2: { multiplier: 1.15, clampMax: 65535 },
        stage3: { multiplier: 1.22, clampMax: 65535 },
        critical: false, showPreview: true,
      },
      {
        id: 'me7_lamfa',
        name: 'Full-Load Lambda Target (LAMFA)',
        category: 'fuel',
        desc: 'Driver-demanded lambda target map (LAMFA = Lambda Fahrerwunsch). 2D: 6 pedal-position columns × 15 RPM rows, confirmed address $1CEAB for AJQ/AUQ (ECUEdit.com). Factor 0.0078125 (= 1/128): raw 128 = λ1.0 (stoich), raw 112 = λ0.875 (WOT target). Stage 1/2/3 enrichment to λ0.85–0.88 is standard practice for modified 1.8T — lowers EGT and prevents detonation at elevated boost. CAUTION: Only lower WOT cells (high pedal/high RPM). Partial-load cells must remain at stoich (raw 128) for closed-loop operation. Hard floor raw 102 = λ0.80 — leaner is unsafe. Source: ECUEdit AJQ/AUQ address list; S4wiki ME7 lambda model.',
        // "LAMFA\0" = 0x4C,0x41,0x4D,0x46,0x41,0x00 — confirmed ME7.5 DAMOS symbol
        a2lNames: ['LAMFA', 'LAMFAW', 'LFASOLLL'],
        signatures: [[0x4C,0x41,0x4D,0x46,0x41,0x00], [0x4C,0x41,0x4D,0x46,0x41,0x57,0x00]],
        sigOffset: 2,
        // ECUEdit confirmed: 6 cols (pedal axis) × 15 rows (RPM axis), uint16 LoHi
        // factor 0.0078125: raw 128 = λ1.0, raw 112 = λ0.875, raw 102 = λ0.80 (absolute floor)
        // Note: different ME7 variants may have different sizes (8×8, 10×8) — verify per binary
        rows: 15, cols: 6, dtype: 'uint16', le: true,
        factor: 0.0078125, offsetVal: 0, unit: 'λ',
        stage1: { multiplier: 0.97, clampMin: 102 },  // λ0.88 target; floor λ0.80 (raw 102)
        stage2: { multiplier: 0.95, clampMin: 102 },  // λ0.86
        stage3: { multiplier: 0.93, clampMin: 102 },  // λ0.84
        critical: false, showPreview: false,
      },
      {
        id: 'me7_kfldrl',
        name: 'Wastegate Pre-Control (KFLDRL)',
        category: 'boost',
        desc: 'Feed-forward wastegate duty-cycle map (KFLDRL = KF zur Linearisierung Ladedruck). 10 rows × 16 cols: maps the RPM/boost-deviation axes to WGDC feed-forward command. This is the open-loop "base duty cycle" that gets the boost roughly on-target before the I-regulator (KFLDIMX) trims it. Raising LDRXN without raising KFLDRL means the ECU has to rely entirely on the I-regulator to reach new boost targets, causing slow boost build and potential overshoot. Stage 2/3: raise proportionally to assist the wastegate in holding higher boost. The ME7Tuner Optimizer (KalebKE/ME7Tuner on GitHub) builds KFLDRL from logged stable-boost data points where actual ≈ requested ±30 mbar. Research: S4wiki ME7 boost control section; ME7Tuner README.',
        // "KFLDRL\0" = 0x4B,0x46,0x4C,0x44,0x52,0x4C,0x00 — confirmed ME7.5 DAMOS symbol
        a2lNames: ['KFLDRL', 'KFLDRL0', 'KFLDRLA'],
        signatures: [[0x4B,0x46,0x4C,0x44,0x52,0x4C,0x00]],
        sigOffset: 2,
        // 10 rows × 16 cols; unit % (wastegate duty cycle 0–100%). uint16 LoHi.
        // CORRECTED factor: 0.005 (confirmed ECUEdit page 5: "factor: 0.005000").
        // With factor 0.005: raw 20000 = 100% WGDC. Previously wrong 0.0015259 (= 1/655).
        rows: 10, cols: 16, dtype: 'uint16', le: true,
        factor: 0.005, offsetVal: 0, unit: '%',
        stage1: { multiplier: 1.05, clampMax: 20000 },   // 100% WGDC ceiling
        stage2: { multiplier: 1.12, clampMax: 20000 },
        stage3: { multiplier: 1.20, clampMax: 20000 },
        critical: false, showPreview: false,
      },
      {
        id: 'me7_kfldimx',
        name: 'Boost PID I-Regulator Limit (KFLDIMX)',
        category: 'boost',
        desc: 'Integral-regulator upper limit for the boost pressure PID (KFLDIMX = KF LDR I-Reglerbegrenzung). 8 rows × 16 cols; unit hPa (equivalent to mbar). This map caps the maximum integral correction the PID can apply. If KFLDIMX is too low, the ECU cannot integrate enough to reach the LDRXN boost target — boost falls short. If too high, boost overshoots. Rule: always set KFLDIMX ≥ KFLDRL × 108% to give the I-regulator adequate headroom above the feed-forward base. Boost undershoot = raise KFLDIMX; boost overshoot = lower KFLDIMX. Must be raised alongside LDRXN for Stage 2/3. Research: S4wiki ME7 boost PID section; Nefmoto KFLDIMX thread.',
        // "KFLDIMX\0" = 0x4B,0x46,0x4C,0x44,0x49,0x4D,0x58,0x00 — confirmed ME7.5 DAMOS symbol
        a2lNames: ['KFLDIMX', 'KFLDIMX0', 'KFLDIMAX'],
        signatures: [[0x4B,0x46,0x4C,0x44,0x49,0x4D,0x58,0x00]],
        sigOffset: 2,
        // CORRECTED: factor 0.005, unit '%' duty cycle (not 0.1 hPa).
        // Research confirms KFLDIMX and KFLDRL share the same scaling: factor 0.005, unit %.
        // ECUEdit page 5: X-axis factor 0.039063 (boost deviation in hPa), Y-axis factor 0.25 (RPM),
        // Z output factor 0.005 (% WGDC cap). Rule: set KFLDIMX ≥ KFLDRL × 1.08 for boost headroom.
        rows: 8, cols: 16, dtype: 'uint16', le: true,
        factor: 0.005, offsetVal: 0, unit: '%',
        stage1: { multiplier: 1.15, clampMax: 20000 },  // 100% WGDC hard ceiling
        stage2: { multiplier: 1.28, clampMax: 20000 },
        stage3: { multiplier: 1.42, clampMax: 20000 },
        critical: false, showPreview: false,
      },
      {
        id: 'me7_kfpbrk',
        name: 'VE Model Correction (KFPBRK)',
        category: 'fuel',
        desc: 'Volumetric efficiency model correction factor (KFPBRK = Korrekturfaktor für Brennraumdruck). 10×10 multiplicative correction table applied within the ME7 pressure-to-load conversion. Values are normally close to 1.0 and represent measured deviations from the idealised thermodynamic model. KFPBRK Phase 2 of the ME7Tuner Optimizer: after boost control (KFLDRL/KFLDIMX) is on-target, KFPBRK is corrected to remove remaining steady-state load error from the VE model. Incorrectly scaling KFPBRK produces incorrect load readings without any boost change — do NOT blindly multiply. Stage params are 1.0 (view-only) — this map should be corrected from logged data, not blindly tuned. Research: S4wiki KFPBRK section; ME7Tuner Phase 2 documentation; ECUEdit AJQ/AUQ ($1C4DC).',
        // "KFPBRK\0" = 0x4B,0x46,0x50,0x42,0x52,0x4B,0x00 — confirmed ME7.5 DAMOS symbol
        // Companion KFPBRKNW = same structure for NW (cam-on) cylinder condition
        a2lNames: ['KFPBRK', 'KFPBRKNW', 'KFPBRK0'],
        signatures: [[0x4B,0x46,0x50,0x42,0x52,0x4B,0x00]],
        sigOffset: 2,
        rows: 10, cols: 10, dtype: 'uint16', le: true,
        // factor 0.001526: raw 655 = 1.000 (unity correction). Stock cells should be 0.95–1.05 range.
        factor: 0.001526, offsetVal: 0, unit: 'ratio',
        stage1: { multiplier: 1.0 },  // do not blindly scale — log-based correction only
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        critical: false, showPreview: false,
      },
      {
        id: 'me7_mlhfm',
        name: 'MAF Linearization Curve (MLHFM)',
        category: 'fuel',
        desc: 'MAF (mass air flow) sensor linearization curve (MLHFM). 512-point 1D lookup table indexed by MAF sensor voltage: converts ADC counts to kg/h. Physical formula: kg/h = (raw_uint16 × 0.1) − MLOFS, where MLOFS = 200 for Bosch HFM5 or 0 for Hitachi MAF. Without accurate MLHFM calibration, every downstream calculation (STFT, KFKHFM, KFMIRL, boost targets) is wrong. This is Step 1 of the ME7Tuner Optimizer (KalebKE/ME7Tuner). CRITICAL NOTE: MLHFM cannot be arithmetically scaled without first subtracting MLOFS, scaling, then adding it back — a direct raw multiplier produces incorrect airflow curves. This map is marked view-only (multiplier 1.0). Use the ME7Tuner Optimizer tool to build a corrected MLHFM from dyno data. Research: Nefmoto MLHFM wiki; ME7Tuner README (Step 1); ECUEdit address $1458A (AJQ/AUQ); 360trev/ME7RomTool_Ferrari code-path needle.',
        // "MLHFM\0" = 0x4D,0x4C,0x48,0x46,0x4D,0x00 — confirmed ME7.5 DAMOS symbol
        // ME7RomTool locates MLHFM via C167 instruction needle, not direct symbol scan.
        a2lNames: ['MLHFM', 'MLHFM0', 'MHFM'],
        signatures: [[0x4D,0x4C,0x48,0x46,0x4D,0x00]],
        sigOffset: 2,
        // 512 entries, 1 row, uint16 LoHi (confirmed: LoHi = little-endian for C167 data bus).
        // factor 0.1, offsetVal -200: raw 2000 = (2000×0.1)−200 = 0 kg/h (sensor at zero-flow).
        // Typical idle: raw ~2050–2100 (5–10 kg/h); WOT Stage 1: raw ~3000–4500 (100–250 kg/h).
        rows: 1, cols: 512, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: -200, unit: 'kg/h',
        stage1: { multiplier: 1.0 },  // view-only — do NOT scale; use ME7Tuner for calibration
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        critical: false, showPreview: false,
      },
      {
        id: 'me7_krkte',
        name: 'Injector Scaling Constant (KRKTE)',
        category: 'fuel',
        desc: 'Injector flow rate constant (KRKTE). Single scalar value — the ME7 ECU multiplies this by load (rl_w) to compute base injection time. Stock 1.8T AJQ/AWP uses 440cc/min injectors (KRKTE ≈ 34.125/440 = 0.0776 ms/%). Changing injectors requires recalculating: KRKTE = 34.125 ÷ (injector cc/min). IMPORTANT: Factor is CPU-clock-dependent — 40 MHz ECU uses 0.0001666 (many older XDF packs incorrectly use 0.000167; verify against known injector flow to confirm). This is a view-only map — tuners must calculate the correct value for their injectors rather than blindly multiplying. Step 2 of the ME7Tuner Optimizer. Research: me7-tools KRKTE.audi.xml (nyetwurk/me7-tools on GitHub); StrikeEngine KRKTE calculator; S4wiki ME7 fuelling model.',
        // me7-tools uses a C167 instruction-byte needle (F2 F4 XX XX 7C 44 E0 05 70 55) to locate KRKTE,
        // where XX XX is the DPP-relative address of the constant — those bytes differ per variant and
        // cannot be used as a fixed signature. Using the DAMOS symbol name "KRKTE\0" instead, which
        // Bosch ME7 binaries embed for diagnostic purposes alongside the calibration data.
        // If the symbol name is not present (some ME7.5 variants), A2L/fixedOffset must be used.
        a2lNames: ['KRKTE', 'KRKTE0', 'KRKTEA'],
        signatures: [[0x4B,0x52,0x4B,0x54,0x45,0x00]],  // "KRKTE\0" = 0x4B,0x52,0x4B,0x54,0x45,0x00
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint16', le: true,  // LoHi — explicitly documented in me7-tools XML
        // factor 0.0001666 (40 MHz CPU): raw × 0.0001666 = ms/% injection rate
        // Typical stock raw for 440cc injectors on 40 MHz ECU: ~0.0776/0.0001666 ≈ 466
        factor: 0.0001666, offsetVal: 0, unit: 'ms/%',
        stage1: { multiplier: 1.0 },  // view-only — compute from injector spec, do not blindly scale
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        critical: false, showPreview: false,
      },
      {
        id: 'me7_rev_limit',
        name: 'RPM Hardcut Limiter (DMAX / NMAX)',
        category: 'limiter',
        desc: 'Engine RPM hard-cut limiter for ME7 petrol engines (DMAX / NMAX). When crankshaft speed exceeds this value the ECU cuts fuel injection. Stock 1.8T AUQ/AWP: 6800–7000 RPM. Modified engines with cams, head work, or forged internals can safely rev to 7200–7500 RPM — raise accordingly. Do NOT raise beyond valve-float RPM or turbo overspeed limit. Symbol: DMAX (most ME7.5) or NMAX / NMOT_MAX (some ME7.1/ME7.3 variants). Confirmed from Nefmoto DMAX thread and ECUEdit AJQ/AUQ parameter list.',
        // "DMAX\0" = 0x44,0x4D,0x41,0x58,0x00 — confirmed ME7.5 DAMOS symbol (ECUEdit AJQ/AUQ)
        // "NMAX\0" = 0x4E,0x4D,0x41,0x58,0x00 — alternative label in some ME7.1/ME7.3 variants
        a2lNames: ['DMAX', 'NMAX', 'NMOT_MAX', 'NMXVMAX_ENGINE'],
        signatures: [
          [0x44,0x4D,0x41,0x58,0x00],              // "DMAX\0"
          [0x4E,0x4D,0x41,0x58,0x00],              // "NMAX\0"
          [0x4E,0x4D,0x4F,0x54,0x5F,0x4D,0x41,0x58], // "NMOT_MAX"
        ],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint16', le: false,  // ME7 is big-endian (C167 CPU)
        // factor 1: stored in raw RPM. Stock AUQ/AWP = 6800–7000 RPM raw.
        factor: 1, offsetVal: 0, unit: 'RPM',
        stage1: { multiplier: 1.0 },   // unchanged at Stage 1 (stock rev limit is adequate)
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },   // raise manually only for high-revving builds
        addonOverrides: {
          launchcontrol: { multiplier: 0, addend: 3500, clampMax: 4500 },  // 2-step launch RPM
          revlimit: { addend: 400, clampMax: 7500 },
        },
        critical: false, showPreview: false,
      },
      {
        id: 'me7_overboost_cut',
        name: 'Overboost Protection Cut (LDRMAX)',
        category: 'limiter',
        desc: 'Boost pressure hardcut ceiling (LDRMAX = Ladedruck Maximum). If measured charge pressure exceeds this threshold the ECU cuts fuel injection to protect the turbocharger. Stock 1.8T AUQ/AWP value is approximately 10–15% above the LDRXN boost target. When raising LDRXN for Stage 1/2/3, LDRMAX MUST be raised proportionally — failure causes random fuel cuts at peak boost that are frequently misdiagnosed as coil packs, MAF sensors, or boost leaks. Rule: set LDRMAX = LDRXN target × 1.12–1.15. Confirmed symbol from Nefmoto ME7 tuning wiki and ECUEdit.',
        // "LDRMAX\0" = 0x4C,0x44,0x52,0x4D,0x41,0x58,0x00 — confirmed ME7.5 DAMOS symbol
        // Alternative: "LDRMXBAS" in some variants (base overboost threshold)
        a2lNames: ['LDRMAX', 'LDRMXBAS', 'LDRXMAX', 'LDRSCHUTZ'],
        signatures: [
          [0x4C,0x44,0x52,0x4D,0x41,0x58,0x00],           // "LDRMAX\0"
          [0x4C,0x44,0x52,0x4D,0x58,0x42,0x41,0x53,0x00], // "LDRMXBAS\0"
        ],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint8', le: false,
        // factor 0.5: same as LDRXN — raw 200 = 100% load (100 kPa gauge). Stock overboost cut: ~220–240 raw (110–120% relative load).
        factor: 0.5, offsetVal: 0, unit: '% load',
        stage1: { multiplier: 1.15, clampMax: 255 },   // +15% headroom above Stage 1 boost target
        stage2: { multiplier: 1.25, clampMax: 255 },
        stage3: { multiplier: 1.35, clampMax: 255 },
        addonOverrides: {
          overboost: { multiplier: 1.45, clampMax: 255 },
        },
        critical: false, showPreview: false,
      },
      {
        id: 'me7_speed_limit',
        name: 'Speed Limiter (VFZGMAX)',
        category: 'limiter',
        desc: 'Maximum vehicle speed table (VFZGMAX). Single value — zero out to disable the OEM speed governor.',
        // "VFZGMAX\0" = 0x56,0x46,0x5A,0x47,0x4D,0x41,0x58,0x00 — confirmed ME7 DAMOS symbol
        // Alternative: "NMXVMAX\0" present in some ME7.1 variants
        a2lNames: ['VFZGMAX', 'NMXVMAX', 'VFZGMX'],
        signatures: [[0x56,0x46,0x5A,0x47,0x4D,0x41,0x58,0x00], [0x4E,0x4D,0x58,0x56,0x4D,0x41,0x58,0x00]],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint8', le: false,
        factor: 1, offsetVal: 0, unit: 'km/h',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },  // leave unchanged — only speedlimiter addon modifies this
        addonOverrides: { speedlimiter: { multiplier: 0, addend: 255 } },  // uint8 max = 255
        critical: false, showPreview: false,
      },
    ],
  },

  // ── Bosch ME9.0 (Ford 2.5L I5 Turbo — Focus ST Mk2 / RS Mk2, Mondeo, Kuga) ─
  {
    id: 'me9',
    name: 'Bosch ME9.0',
    manufacturer: 'Bosch',
    family: 'ME9',
    // CRITICAL DISTINCTION: ME9 applies to Focus ST Mk2 (2.5T Volvo I5) and Focus RS Mk2 ONLY.
    // The Ford Focus RS Mk3 (2016–2018, 2.3L EcoBoost) uses Bosch MG1CS017 — NOT ME9.
    // ME9.0C variant: Focus RS 500 limited edition (part number 261209484).
    // ME9.6: Appears in some Saab 2.8 V6 turbo applications.
    // Tools: EcuTek, Loba, professional remap services (COBB does NOT support ME9 — only MG1 Focus RS Mk3).
    identStrings: ['ME9.0', 'ME9S', '0261208', 'MEDV9'],
    fileSizeRange: [262144, 524288],
    vehicles: ['Ford Focus ST Mk2 (2.5L 225PS)', 'Ford Focus RS Mk2 (2.5L 305PS)', 'Ford Mondeo 4 2.5L 220PS', 'Ford Kuga 1 2.5L 200PS', 'Volvo C30/S40/V50 T5 2.5L'],
    checksumAlgo: 'bosch-simple',
    checksumOffset: 0x7FFF8,
    checksumLength: 4,
    maps: [
      {
        id: 'me9_boost_target',
        name: 'Boost Target Map',
        category: 'boost',
        desc: 'Desired boost pressure vs RPM and engine load. Primary Stage 1 map for the 2.5L Duratec I5 — strong gains possible.',
        signatures: [[0x4C,0x44,0x53,0x4F,0x4C,0x4C,0x53,0x00], [0x4C,0x44,0x4D,0x41,0x58,0x00]],
        sigOffset: 2,
        rows: 8, cols: 12, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.12 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.32, clampMax: 55000 },
        critical: true, showPreview: true,
      },
      {
        id: 'me9_fuel_map',
        name: 'Fuel Injection Map',
        category: 'fuel',
        desc: 'Injection quantity and timing map (KFZW). Adjust to match increased airflow from boost increase.',
        signatures: [[0x4B,0x46,0x5A,0x57,0x00], [0x4B,0x46,0x5A,0x57,0x32,0x00]],
        sigOffset: 2,
        rows: 16, cols: 16, dtype: 'int8', le: false,
        factor: 0.75, offsetVal: -48, unit: '°',
        stage1: { multiplier: 1.08 },
        stage2: { multiplier: 1.15 },
        stage3: { multiplier: 1.22, clampMax: 127 },
        critical: true, showPreview: true,
      },
      {
        id: 'me9_torque_limit',
        name: 'Torque Limit (MXMOM)',
        category: 'torque',
        desc: 'Peak torque ceiling. Must be raised to match Stage 1/2 power increases — leaving stock will hard-limit gains.',
        signatures: [[0x4D,0x58,0x4D,0x4F,0x4D,0x00], [0x4D,0x58,0x4D,0x4F,0x4D,0x49,0x00]],
        sigOffset: 2,
        rows: 1, cols: 8, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.28 },
        stage3: { multiplier: 1.45, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'me9_rev_limiter',
        name: 'Rev Limiter (NMAX)',
        category: 'limiter',
        desc: 'Maximum RPM cut-off. Minor raise optional for track use — Focus RS 7000rpm stock is conservative.',
        signatures: [[0x4E,0x4D,0x41,0x58,0x00], [0x4E,0x4F,0x4C,0x48,0x59,0x53,0x00]],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'RPM',
        stage1: { addend: 200 },
        stage2: { addend: 400 },
        stage3: { addend: 500, clampMax: 7200 },
        addonOverrides: {
          launchcontrol: { multiplier: 0, addend: 4000, clampMax: 4500 },
          revlimit: { addend: 500, clampMax: 7500 },
        },
        critical: false, showPreview: false,
      },
      {
        id: 'me9_overboost_cut',
        name: 'Overboost Protection Cut (pBoostMax)',
        category: 'limiter',
        desc: 'Turbo overboost fuel cut threshold. Present on ME9 turbo petrol variants (Focus RS/ST, Golf R). Raised to match stage boost targets.',
        a2lNames: ['pBoostMax', 'pSysMax', 'LimBoostPres', 'BoostCutPres', 'pMaxBoost'],
        signatures: [[0x70,0x42,0x6F,0x6F,0x73,0x74,0x4D,0x61,0x78], [0x70,0x53,0x79,0x73,0x4D,0x61,0x78], [0x70,0x4D,0x61,0x78,0x42,0x6F,0x6F,0x73,0x74]],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'mbar',
        stage1: { multiplier: 1.15, clampMax: 3000 },
        stage2: { multiplier: 1.28, clampMax: 3500 },
        stage3: { multiplier: 1.42, clampMax: 4500 },
        addonOverrides: {
          overboost: { multiplier: 1.5, clampMax: 4500 },
        },
        critical: false, showPreview: false,
      },
      {
        id: 'me9_speed_limit',
        name: 'Speed Limiter (VMAX)',
        category: 'limiter',
        desc: 'Maximum vehicle speed limiter. Single uint16 value in km/h — zero out to remove the OEM speed governor (Focus ST/RS: stock 250km/h electronically limited).',
        // "VMAX_N\0" = 0x56,0x4D,0x41,0x58,0x5F,0x4E,0x00 — ME9 variant
        // "VFZGMAX\0" = shared Bosch symbol also seen in ME9 Ford bins
        a2lNames: ['VMAX_N', 'VFZGMAX', 'VXMAX'],
        signatures: [[0x56,0x4D,0x41,0x58,0x5F,0x4E,0x00], [0x56,0x46,0x5A,0x47,0x4D,0x41,0x58,0x00]],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'km/h',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },  // leave unchanged — only speedlimiter addon modifies this
        addonOverrides: { speedlimiter: { multiplier: 0, addend: 65535 } },
        critical: false, showPreview: false,
      },
    ],
  },

  // ── Delphi DCM3.5 (Ford 2.0L TDCi DW10C — Focus 3, Kuga 1/2, Mondeo 4) ──
  {
    id: 'dcm35',
    name: 'Delphi DCM3.5',
    manufacturer: 'Delphi',
    family: 'DCM3.5',
    // MPC5566 (PowerPC) — no embedded ASCII symbol names. ~2MB full flash dump.
    identStrings: ['DCM3.5', 'DCM35', 'DCM3.5AP', 'DW10C', 'DW10CD'],
    fileSizeRange: [524288, 2097152],   // 512KB – 2MB (MPC5566 internal ~2MB)
    vehicles: ['Ford Focus 3 2.0L TDCi 140/163PS', 'Ford Kuga 1 2.0L TDCi 140/163PS', 'Ford Kuga 2 2.0L TDCi 140/163PS', 'Ford Mondeo 4 2.0L TDCi 140/163PS', 'Peugeot 508 2.0L HDi', 'Citroen C5 2.0L HDi'],
    checksumAlgo: 'unknown',
    checksumOffset: 0,
    checksumLength: 0,
    maps: [
      {
        id: 'dcm35_boost_target',
        name: 'Boost Target Map',
        category: 'boost',
        desc: 'Turbo boost setpoint vs RPM and load for the DW10C engine. Safe +12% gives strong mid-range improvement.',
        signatures: [[0x42,0x4F,0x4F,0x53,0x54,0x4D,0x41,0x58], [0x42,0x53,0x54,0x53,0x4F,0x4C,0x4C]],
        sigOffset: 4,
        rows: 8, cols: 12, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'kPa',
        stage1: { multiplier: 1.12 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.32, clampMax: 60000 },
        critical: true, showPreview: true,
      },
      {
        id: 'dcm35_fuel_qty',
        name: 'Fuel Quantity Map',
        category: 'fuel',
        desc: 'Max fuel injection quantity in mg/stroke vs RPM. Primary power map for this STAGE 5 TDCi engine.',
        signatures: [[0x51,0x46,0x55,0x4D,0x41,0x58], [0x51,0x46,0x55,0x5F,0x4D,0x41,0x58]],
        sigOffset: 4,
        rows: 8, cols: 12, dtype: 'uint16', le: true,
        factor: 0.01, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.12 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.32, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'dcm35_torque_limit',
        name: 'Torque Limit Map',
        category: 'torque',
        desc: 'Software torque ceiling for the DW10C. Raise to allow fuel/boost increases to produce measurable power gains.',
        signatures: [[0x54,0x52,0x51,0x4C,0x49,0x4D], [0x54,0x52,0x51,0x5F,0x4C,0x49,0x4D]],
        sigOffset: 4,
        rows: 1, cols: 8, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.25 },
        stage3: { multiplier: 1.38, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'dcm35_egr',
        name: 'EGR Flow Map',
        category: 'emission',
        desc: 'EGR valve control. Zero for EGR delete — reduces intake temps and improves throttle response.',
        signatures: [[0x45,0x47,0x52,0x4D,0x41,0x50], [0x45,0x47,0x52,0x5F,0x4D,0x41,0x50]],
        sigOffset: 4,
        rows: 8, cols: 8, dtype: 'uint8', le: true,
        factor: 0.4, offsetVal: 0, unit: '%',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { egr: { multiplier: 0, clampMax: 0 } },
        critical: false, showPreview: false,
      },
    ],
  },

  // ── Siemens/Continental SID208 (Ford Transit 2012, Land Rover Defender) ───
  {
    id: 'sid208',
    name: 'Siemens SID208',
    manufacturer: 'Siemens/Continental',
    family: 'SID208',
    // TC1728 Tricore (1.5MB) or TC1797 (4MB) variant. No embedded ASCII symbols.
    identStrings: ['SID208', 'SID 208', 'SID208EVO', 'PUMFRQ', 'FRQ61'],
    fileSizeRange: [1048576, 4194304],   // 1MB–4MB (TC1728=1.5MB; TC1797 variant=4MB)
    vehicles: ['Ford Transit 2012 2.2L 100-155PS', 'Ford Transit 2.0L Diesel', 'Ford Tourneo Custom 2.2L', 'Land Rover Defender 2012 2.2L TD4', 'Ford Ranger 3.2L Diesel'],
    checksumAlgo: 'unknown',
    checksumOffset: 0,
    checksumLength: 0,
    maps: [
      {
        id: 'sid208_boost_target',
        name: 'Boost Target Map',
        category: 'boost',
        desc: 'Turbocharger pressure setpoint for the Puma 2.2L diesel. Raising this is the primary Stage 1 change for Transit remaps.',
        signatures: [[0x42,0x53,0x54,0x5F,0x54,0x47,0x54], [0x42,0x4F,0x4F,0x53,0x54,0x5F,0x53,0x50]],
        sigOffset: 4,
        rows: 8, cols: 12, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'kPa',
        stage1: { multiplier: 1.12 },
        stage2: { multiplier: 1.20 },
        stage3: { multiplier: 1.28, clampMax: 60000 },
        critical: true, showPreview: true,
      },
      {
        id: 'sid208_fuel_qty',
        name: 'Fuel Injection Map',
        category: 'fuel',
        desc: 'Injection quantity table for the SID208. Increase alongside boost for proportional power gain.',
        signatures: [[0x51,0x5F,0x46,0x55,0x45,0x4C], [0x46,0x55,0x45,0x4C,0x5F,0x4D,0x41,0x58]],
        sigOffset: 4,
        rows: 8, cols: 12, dtype: 'uint16', le: true,
        factor: 0.01, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.25 },
        stage3: { multiplier: 1.35, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'sid208_torque_limit',
        name: 'Torque Limit',
        category: 'torque',
        desc: 'Peak torque cap. Transit remaps require this raised — factory limit is very conservative for towing rating compliance.',
        signatures: [[0x54,0x52,0x51,0x5F,0x4D,0x41,0x58], [0x4D,0x58,0x54,0x52,0x51,0x00]],
        sigOffset: 4,
        rows: 1, cols: 8, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.18 },
        stage2: { multiplier: 1.28 },
        stage3: { multiplier: 1.40, clampMax: 65000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── Continental EMS3120 (Renault/Nissan 1.5 dCi — Megane, Clio, Logan) ───
  {
    id: 'ems3120',
    name: 'Continental EMS3120',
    manufacturer: 'Continental',
    family: 'EMS3120',
    identStrings: ['EMS3120', 'EMS3121', 'EMS3122', 'EMS312'],
    fileSizeRange: [1048576, 2097152],
    vehicles: ['Renault Megane 2/3 1.5 dCi', 'Renault Clio 3 1.5 dCi', 'Renault Logan 1.5 dCi', 'Renault Sandero 1.5 dCi', 'Renault Fluence 1.5 dCi', 'Nissan Almera 1.5 dCi'],
    checksumAlgo: 'continental-crc',
    checksumOffset: 0,
    checksumLength: 4,
    maps: [
      {
        id: 'ems3120_boost_target',
        name: 'Boost Target Map',
        category: 'boost',
        desc: 'Turbo pressure target for the K9K 1.5 dCi engine. Modest +10-12% gives strong real-world fuel-economy improvement.',
        signatures: [[0x42,0x53,0x54,0x5F,0x53,0x50,0x5F,0x4D], [0x42,0x4F,0x4F,0x53,0x54,0x53,0x50]],
        sigOffset: 4,
        rows: 8, cols: 10, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'kPa',
        stage1: { multiplier: 1.10 },
        stage2: { multiplier: 1.18 },
        stage3: { multiplier: 1.25, clampMax: 60000 },
        critical: true, showPreview: true,
      },
      {
        id: 'ems3120_fuel_qty',
        name: 'Fuel Quantity Map',
        category: 'fuel',
        desc: 'Maximum injection quantity in mm³/stroke for the K9K. This is the primary torque dial for this engine.',
        signatures: [[0x51,0x5F,0x4D,0x41,0x58,0x5F,0x4B,0x39], [0x51,0x46,0x55,0x4D,0x41,0x58]],
        sigOffset: 4,
        rows: 8, cols: 10, dtype: 'uint16', le: true,
        factor: 0.01, offsetVal: 0, unit: 'mm³/st',
        stage1: { multiplier: 1.12 },
        stage2: { multiplier: 1.20 },
        stage3: { multiplier: 1.28, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'ems3120_torque_limit',
        name: 'Torque Limit',
        category: 'torque',
        desc: 'Software torque limiter for the K9K. Raise proportionally to fuel/boost map changes.',
        signatures: [[0x54,0x52,0x51,0x4C,0x49,0x4D,0x4B,0x39], [0x4D,0x58,0x54,0x52,0x51,0x4B,0x39]],
        sigOffset: 4,
        rows: 1, cols: 8, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.30, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'ems3120_egr',
        name: 'EGR Map',
        category: 'emission',
        desc: 'EGR valve control for the K9K. EGR delete common on this engine to reduce intake carbon buildup.',
        signatures: [[0x45,0x47,0x52,0x5F,0x4B,0x39,0x4B], [0x45,0x47,0x52,0x4D,0x41,0x50]],
        sigOffset: 4,
        rows: 8, cols: 8, dtype: 'uint8', le: true,
        factor: 0.4, offsetVal: 0, unit: '%',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { egr: { multiplier: 0, clampMax: 0 } },
        critical: false, showPreview: false,
      },
    ],
  },

  // ── Bosch PCR2.1 (VAG 1.6 TDI — Golf 6, Polo, A3, Ibiza) ─────────────────
  {
    id: 'pcr21',
    name: 'Bosch PCR2.1',
    manufacturer: 'Bosch',
    family: 'PCR2.1',
    // PCR2.1 identified by firmware string only — no unique part number range separate from EDC17.
    identStrings: ['PCR2.1', 'PCR21', 'PCR 2.1', 'PCR2.1-DHP', '0281007', '0281008', '0281009'],
    fileSizeRange: [1048576, 2097152],
    vehicles: ['VW Golf 6 1.6 TDI', 'VW Polo 6R 1.6 TDI', 'Audi A3 8P 1.6 TDI', 'Seat Ibiza 6J 1.6 TDI', 'Skoda Fabia 2 1.6 TDI', 'VW Caddy 1.6 TDI'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0xFFFFC,
    checksumLength: 4,
    maps: [
      {
        id: 'pcr21_boost_target',
        name: 'Boost Target Map',
        category: 'boost',
        desc: 'Charge pressure setpoint for the 1.6 TDI CAY/CAYC engine. Stage 1 +15% boost gives strong low-mid range gains.',
        signatures: [[0x4C,0x44,0x52,0x58,0x4E,0x00], [0x4C,0x41,0x44,0x53,0x4F,0x4C,0x4C,0x00]],
        sigOffset: 2,
        rows: 8, cols: 10, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.25 },
        stage3: { multiplier: 1.35, clampMax: 55000 },
        critical: true, showPreview: true,
      },
      {
        id: 'pcr21_fuel_qty',
        name: 'Injection Quantity Map',
        category: 'fuel',
        desc: 'Fuel injection quantity for the CAY/CAYC 1.6 TDI. Primary power map for this common-rail diesel.',
        signatures: [[0x4D,0x45,0x4E,0x5A,0x4B,0x00], [0x51,0x49,0x4D,0x41,0x58,0x00]],
        sigOffset: 2,
        rows: 8, cols: 10, dtype: 'uint16', le: true,
        factor: 0.01, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.25 },
        stage3: { multiplier: 1.35, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'pcr21_torque_limit',
        name: 'Torque Limit',
        category: 'torque',
        desc: 'Peak torque ceiling for the 1.6 TDI. Factory limit is conservative — raise to match fuel/boost changes.',
        signatures: [[0x4D,0x58,0x4D,0x4F,0x4D,0x00], [0x4D,0x58,0x4D,0x4F,0x4D,0x53,0x41,0x00]],
        sigOffset: 2,
        rows: 1, cols: 8, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.20 },
        stage2: { multiplier: 1.30 },
        stage3: { multiplier: 1.42, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'pcr21_egr',
        name: 'EGR Flow Map',
        category: 'emission',
        desc: '1.6 TDI is notorious for EGR-related swirl flap and carbon intake issues — delete is a popular Stage 1 addition.',
        signatures: [[0x45,0x47,0x52,0x4B,0x4C,0x00], [0x45,0x47,0x52,0x5F,0x4D,0x41,0x50,0x00]],
        sigOffset: 2,
        rows: 8, cols: 8, dtype: 'uint8', le: true,
        factor: 0.4, offsetVal: 0, unit: '%',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { egr: { multiplier: 0, clampMax: 0 } },
        critical: false, showPreview: false,
      },
    ],
  },

  // ── Continental SIMOS10 (VAG 1.2 TSI — Polo, Golf 6, A1) ─────────────────
  {
    id: 'simos10',
    name: 'Continental SIMOS10',
    manufacturer: 'Continental',
    family: 'SIMOS10',
    identStrings: ['SIMOS10', 'SIM10', 'SIMOS 10', 'SIMOS10.'],
    fileSizeRange: [524288, 1048576],
    vehicles: ['VW Polo 6R 1.2 TSI 85/105PS', 'VW Golf 6 1.2 TSI', 'Audi A1 1.2 TFSI 86PS', 'Seat Ibiza 1.2 TSI', 'Skoda Fabia 2 1.2 TSI'],
    checksumAlgo: 'continental-crc',
    checksumOffset: 0,
    checksumLength: 4,
    maps: [
      {
        id: 'simos10_boost_target',
        name: 'Boost Target Map',
        category: 'boost',
        desc: 'Charge pressure setpoint for the CBZA/CBZB 1.2 TSI. Good power gains possible with safe +12% boost.',
        signatures: [[0x4C,0x44,0x52,0x4C,0x53,0x4F,0x4C,0x00], [0x4B,0x46,0x4C,0x44,0x52,0x4C,0x00]],
        sigOffset: 2,
        rows: 8, cols: 10, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.12 },
        stage2: { multiplier: 1.20 },
        stage3: { multiplier: 1.28, clampMax: 55000 },
        critical: true, showPreview: true,
      },
      {
        id: 'simos10_fuel_map',
        name: 'Fuel Injection Map',
        category: 'fuel',
        desc: 'Fuel injection amount for the 1.2 TSI. Raise proportionally with boost to maintain safe AFR.',
        signatures: [[0x4B,0x46,0x4C,0x41,0x4D,0x42,0x44,0x41], [0x4B,0x46,0x4C,0x41,0x4D,0x42,0x00]],
        sigOffset: 2,
        rows: 16, cols: 16, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'ms',
        stage1: { multiplier: 1.10 },
        stage2: { multiplier: 1.18 },
        stage3: { multiplier: 1.25, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'simos10_torque_limit',
        name: 'Torque Limit',
        category: 'torque',
        desc: 'Maximum torque ceiling. The 1.2 TSI is factory-limited well below mechanical potential — raise for full effect.',
        signatures: [[0x4D,0x58,0x4D,0x4F,0x4D,0x53,0x49,0x4D], [0x4D,0x58,0x4D,0x4F,0x4D,0x00]],
        sigOffset: 2,
        rows: 1, cols: 8, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.18 },
        stage2: { multiplier: 1.28 },
        stage3: { multiplier: 1.40, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'simos10_rev_limit',
        name: 'RPM Hardcut Limiter',
        category: 'limiter',
        desc: 'Engine RPM hard-cut limiter for SIMOS10 (1.2 TSI CBZA/CBZB). Stock 1.2 TSI limit is 6000–6200 RPM. Modified engines with supporting hardware can safely rev to 6500 RPM. A2L symbol: nEngCutOff / nMaxCut / EngSpd_nMaxCut.',
        a2lNames: ['nEngCutOff', 'nMaxCut', 'EngSpd_nMaxCut', 'nEngMax'],
        signatures: [[0x6E,0x45,0x6E,0x67,0x43,0x75,0x74,0x4F,0x66,0x66], [0x6E,0x4D,0x61,0x78,0x43,0x75,0x74]],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'RPM',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: {
          launchcontrol: { multiplier: 0, addend: 3500, clampMax: 4000 },
          revlimit: { addend: 400, clampMax: 7500 },
        },
        critical: false, showPreview: false,
      },
      {
        id: 'simos10_speed_limit',
        name: 'Vehicle Speed Limiter',
        category: 'limiter',
        desc: 'Factory vehicle speed limit for SIMOS10. Stock VAG small car limit is typically 185–210 km/h. A2L symbol: VehSpd_vMaxLim / SpdLimMax.',
        a2lNames: ['VehSpd_vMaxLim', 'SpdLimMax', 'VMAX'],
        signatures: [[0x56,0x4D,0x41,0x58,0x00], [0x56,0x53,0x4C,0x49,0x4D,0x49,0x54]],
        sigOffset: 1,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'km/h',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: {
          speedlimiter: { multiplier: 0, addend: 65535 },
        },
        critical: false, showPreview: false,
      },
      {
        id: 'simos10_overboost_cut',
        name: 'Overboost Protection Cut',
        category: 'limiter',
        desc: 'Boost pressure hardcut for SIMOS10 TSI. If charge pressure exceeds this threshold fuel is cut. Must be raised proportionally when the boost target is raised — failure causes random fuel cuts at peak boost that are commonly misdiagnosed. A2L symbol: pBoostMax / LimBoostPres / pSysMax.',
        a2lNames: ['pBoostMax', 'LimBoostPres', 'pSysMax', 'pChargeMax'],
        signatures: [[0x70,0x42,0x6F,0x6F,0x73,0x74,0x4D,0x61,0x78], [0x70,0x53,0x79,0x73,0x4D,0x61,0x78]],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'mbar',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.25 },
        stage3: { multiplier: 1.35, clampMax: 3000 },
        addonOverrides: {
          overboost: { multiplier: 1.5, clampMax: 4500 },
        },
        critical: false, showPreview: false,
      },
    ],
  },

  // ── Bosch ME17.9.11/12/13 (Kia/Hyundai 1.4L–1.6L GDI) ───────────────────
  {
    id: 'me17_kia',
    name: 'KEFICO ME17.9 (Kia/Hyundai)',
    manufacturer: 'Bosch/KEFICO',
    family: 'ME17.9',
    // KEFICO-manufactured (Hyundai/Bosch JV). Uses Tricore TC1762, 1MB internal flash.
    // OEM part numbers: 391xx-xxxxx (Hyundai/Kia), KEFICO ref: 9001xxxxxxKx.
    // NO Bosch 0261Sxx hardware number — remove 0261S06/S07 (those are VAG MED17 numbers).
    // ME17.9.11/12/13 strings may appear as calibration ID prefixes in the binary.
    identStrings: ['ME17.9.11', 'ME17.9.12', 'ME17.9.13', 'ME17.9', 'KEFICO', '39106', '39118'],
    fileSizeRange: [524288, 2097152],   // TC1762 = 1MB internal flash
    vehicles: ['Kia Ceed 1.6L GDI', 'Kia Sportage 1.6L GDI', 'Hyundai i30 1.6L GDI', 'Hyundai i40 1.6L GDI', 'Kia Rio 1.4L GDI', 'Hyundai i20 1.4L GDI'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFF8,
    checksumLength: 4,
    maps: [
      {
        id: 'me17kia_boost_target',
        name: 'Boost / Load Target Map',
        category: 'boost',
        desc: 'Engine load setpoint for GDI injection optimisation. Raising this enables more aggressive injection timing.',
        signatures: [[0x4C,0x44,0x4B,0x56,0x53,0x4F,0x4C,0x4C], [0x4C,0x44,0x53,0x4F,0x4C,0x4C,0x00]],
        sigOffset: 2,
        rows: 8, cols: 12, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.10 },
        stage2: { multiplier: 1.18 },
        stage3: { multiplier: 1.25, clampMax: 55000 },
        critical: true, showPreview: true,
      },
      {
        id: 'me17kia_fuel_map',
        name: 'Fuel Injection Map',
        category: 'fuel',
        desc: 'GDI fuel injection quantity map. Increasing enriches the mixture for power gains on Kia/Hyundai GDI engines.',
        signatures: [[0x4B,0x46,0x4C,0x41,0x4D,0x42,0x44,0x41], [0x4B,0x46,0x4C,0x41,0x4D,0x42,0x4F]],
        sigOffset: 2,
        rows: 16, cols: 16, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'ms',
        stage1: { multiplier: 1.08 },
        stage2: { multiplier: 1.14 },
        stage3: { multiplier: 1.20, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'me17kia_ignition',
        name: 'Ignition Timing Map',
        category: 'ignition',
        desc: 'Spark advance vs RPM and load. Advancing ignition timing is the primary Stage 1 power change on naturally aspirated GDI.',
        signatures: [[0x4B,0x46,0x5A,0x57,0x00], [0x4B,0x46,0x5A,0x57,0x42,0x00]],
        sigOffset: 2,
        rows: 16, cols: 16, dtype: 'int8', le: false,
        factor: 0.75, offsetVal: -48, unit: '°',
        stage1: { addend: 2 },
        stage2: { addend: 3 },
        stage3: { addend: 4, clampMax: 90 },
        critical: true, showPreview: true,
      },
      {
        id: 'me17kia_torque_limit',
        name: 'Torque Limit',
        category: 'torque',
        desc: 'Maximum torque cap. Must be raised alongside other maps to prevent software from silently clipping power gains.',
        signatures: [[0x4D,0x58,0x4D,0x4F,0x4D,0x00], [0x4D,0x58,0x4D,0x4F,0x4D,0x49,0x00]],
        sigOffset: 2,
        rows: 1, cols: 8, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.12 },
        stage2: { multiplier: 1.20 },
        stage3: { multiplier: 1.30, clampMax: 65000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── Bosch MG1 (Ford EcoBoost / Focus RS / Fiesta ST200) ──────────────────
  {
    id: 'mg1',
    name: 'Bosch MG1',
    manufacturer: 'Bosch',
    family: 'MG1',
    // Tricore TC275/TC277/TC298 depending on sub-variant. MG1CS015/016/017 for Ford.
    // 0261S14xxx confirmed on Ford Focus 1.0 EcoBoost (e.g. 0261S14568).
    // MG1CS/MG1C3 may appear in calibration ID strings within the binary.
    // ARCHITECTURE NOTE: MG1 (Ford) uses torque-first demand model — ECU targets TORQUE, not boost
    // directly. Boost is a result of torque + airflow targets. COBB Focus RS guide confirms this.
    // Ford MG1 has lower encryption than VAG MG1 (Revo confirmed) — accessible via bench protocol 1423.
    // Focus RS Mk3 (2016-18) uses MG1CS017, NOT ME9 — this is commonly confused.
    // Stock Focus RS: ~25.5 psi peak, tapering to ~21 psi at redline (COBB OTS map documentation).
    // Overboost is TIMED: stock allows ~21 psi boost for 20 seconds at WOT, then reduces WG duty.
    identStrings: ['MG1CS', 'MG1C3', 'MG1CS015', 'MG1CS016', 'MG1CS017', '0261S14', '0261S15', '0261S12'],
    fileSizeRange: [1048576, 4194304],   // 1MB – 4MB (TC275/TC277 = 2–4MB)
    vehicles: ['Ford Focus RS Mk3 (2.3 EcoBoost)', 'Ford Fiesta ST200 (1.6 EcoBoost)', 'Ford Focus ST Mk3 (2.0 EcoBoost)', 'Ford Mustang 2.3 EcoBoost', 'Ford Focus 1.0 EcoBoost 125/140ps'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x1FFFF8,
    checksumLength: 4,
    maps: [
      {
        id: 'mg1_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'Charge air pressure setpoint. RPM vs load. Primary Stage 1/2 map on Focus RS and ST — raises boost target across rev range.',
        signatures: [[0x4C,0x44,0x4B,0x56,0x53,0x4F,0x4C,0x4C], [0x4B,0x46,0x4C,0x44,0x53,0x4F,0x4C,0x4C]],
        sigOffset: 4,
        rows: 12, cols: 16, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.20 },
        stage2: { multiplier: 1.35 },
        stage3: { multiplier: 1.50, clampMax: 62000 },
        critical: true, showPreview: true,
      },
      {
        id: 'mg1_fuel_inject',
        name: 'Fuel Injection Duration',
        category: 'fuel',
        desc: 'Base fuel injection duration. Raised to support increased boost and prevent lean conditions on modified EcoBoost engines.',
        signatures: [[0x4B,0x46,0x49,0x4E,0x4A,0x44,0x55,0x52], [0x49,0x4E,0x4A,0x44,0x55,0x52,0x42,0x53]],
        sigOffset: 4,
        rows: 16, cols: 16, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'ms',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.25 },
        stage3: { multiplier: 1.35, clampMax: 60000 },
        critical: true, showPreview: true,
      },
      {
        id: 'mg1_torque_limit',
        name: 'Torque Demand Limit',
        category: 'torque',
        desc: 'Driver demand torque ceiling. Must be raised to unlock power gains — stock limit silently caps torque request on EcoBoost.',
        signatures: [[0x54,0x51,0x4C,0x49,0x4D,0x01,0x00], [0x54,0x4F,0x52,0x51,0x4C,0x49,0x4D]],
        sigOffset: 2,
        rows: 8, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.30 },
        stage2: { multiplier: 1.50 },
        stage3: { multiplier: 1.70, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'mg1_ignition',
        name: 'Ignition Timing Base',
        category: 'ignition',
        desc: 'Base ignition advance map. Stage 2/3 adds advance where knock margin allows on premium fuel.',
        signatures: [[0x4B,0x46,0x5A,0x57,0x42,0x41,0x53,0x45], [0x49,0x47,0x4E,0x42,0x41,0x53,0x45]],
        sigOffset: 4,
        rows: 16, cols: 16, dtype: 'int8', le: true,
        factor: 0.75, offsetVal: -48, unit: '°BTDC',
        stage1: { addend: 0 },
        stage2: { addend: 2 },
        stage3: { addend: 3, clampMax: 60 },
        addonOverrides: {
          popcorn: { addend: -20, clampMin: 0, lastNCols: 2 },
        },
        critical: false, showPreview: true,
      },
      {
        id: 'mg1_rev_limit',
        name: 'Rev Limiter',
        category: 'limiter',
        desc: 'Engine RPM hard cut. Slightly raised on Stage 1/2 for better top-end pull on EcoBoost engines.',
        signatures: [[0x52,0x45,0x56,0x4C,0x49,0x4D,0x01], [0x4E,0x4D,0x41,0x58,0x52,0x50,0x4D]],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'RPM',
        stage1: { addend: 300 },
        stage2: { addend: 500 },
        stage3: { addend: 600, clampMax: 7200 },
        addonOverrides: {
          launchcontrol: { multiplier: 0, addend: 3500, clampMax: 4500 },
          revlimit: { addend: 400, clampMax: 7500 },
        },
        critical: false, showPreview: false,
      },
      {
        id: 'mg1_overboost_cut',
        name: 'Overboost Protection Cut (pBoostMax)',
        category: 'limiter',
        desc: 'Maximum boost pressure before ECU fuel cut fires. MG1 EcoBoost units have a very conservative stock overboost limit — raised to match stage targets.',
        a2lNames: ['pBoostMax', 'pSysMax', 'LimBoostPres', 'BoostCutPres', 'REVLIMBOOST'],
        signatures: [[0x70,0x42,0x6F,0x6F,0x73,0x74,0x4D,0x61,0x78], [0x70,0x53,0x79,0x73,0x4D,0x61,0x78], [0x52,0x45,0x56,0x4C,0x49,0x4D,0x42,0x4F,0x4F,0x53,0x54]],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'mbar',
        stage1: { multiplier: 1.15, clampMax: 3000 },
        stage2: { multiplier: 1.28, clampMax: 3500 },
        stage3: { multiplier: 1.42, clampMax: 4500 },
        addonOverrides: {
          overboost: { multiplier: 1.5, clampMax: 4500 },
        },
        critical: false, showPreview: false,
      },
      {
        id: 'mg1_speed_limit',
        name: 'Vehicle Speed Limiter (VMAX)',
        category: 'limiter',
        desc: 'Factory vehicle speed limiter. Set to maximum to remove the software speed cap.',
        a2lNames: ['VMAX', 'VehicleSpeedMax', 'VFZGMAX', 'SpeedLimMax'],
        signatures: [[0x56,0x4D,0x41,0x58,0x00], [0x56,0x46,0x5A,0x47,0x4D,0x41,0x58], [0x53,0x50,0x44,0x4C,0x49,0x4D,0x4D,0x41,0x58]],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'km/h',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: {
          speedlimiter: { multiplier: 0, addend: 65535 },
        },
        critical: false, showPreview: false,
      },
    ],
  },

  // ── Continental SIM2K-240 / SIM2K-341 (Kia Stinger / Hyundai i30N) ────────
  {
    id: 'sim2k',
    name: 'Continental SIM2K',
    manufacturer: 'Continental',
    family: 'SIM2K',
    // SIM2K-240/241/245: TC1767 (Kia Ceed/Hyundai i30 gen2, ~1.5MB)
    // SIM2K-250/258/259: TC1782 (Kia Stinger 2.0T, Hyundai i30N — 2.5MB)
    // SIM2K-260/261: TC1791 (Kia Stinger 3.3T — 4MB)
    // SIM2K-341 (older): MPC562 with external flash
    // SIM2K variant strings may appear in calibration ID within binary.
    identStrings: ['SIM2K-240', 'SIM2K-250', 'SIM2K-260', 'SIM2K-341', 'SIM2K240', 'SIM2K250', 'SIM2K260'],
    fileSizeRange: [1048576, 4194304],   // 1MB–4MB (TC1767=1.5MB; TC1782=2.5MB; TC1791=4MB)
    vehicles: ['Kia Stinger 2.0T (SIM2K-250)', 'Kia Stinger 3.3T (SIM2K-260)', 'Hyundai i30N 2.0T (SIM2K-250)', 'Hyundai Veloster N 2.0T', 'Kia Ceed/Hyundai i30 2nd gen (SIM2K-240)', 'Kia ProCeed GT 1.4T'],
    checksumAlgo: 'continental-crc',
    checksumOffset: 0x1FFFF0,
    checksumLength: 4,
    maps: [
      {
        id: 'sim2k_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'Charge air pressure setpoint map (absolute manifold pressure). SIM2K-250/260 uses kPa absolute internally — typical stock i30N 2.0T peak ~220–240 kPa absolute (~18 psi boost gauge). Research: N75 MotorSports SIM2K-250 calibration confirms boost pressure raised significantly in Stage 1. Factor 0.1 kPa/raw → raw 2000 = 200 kPa = ~14.5 psi gauge at sea level. Primary Stage 1/2 modification. Must be adjusted alongside torque ceiling and injection maps.',
        signatures: [[0x42,0x4F,0x4F,0x53,0x54,0x53,0x4F,0x4C], [0x4C,0x44,0x53,0x50,0x53,0x4F,0x4C,0x4C]],
        sigOffset: 4,
        rows: 10, cols: 14, dtype: 'uint16', le: true,
        // factor 0.1 kPa/raw: raw 1013 = 101.3 kPa (atmospheric), raw 2500 = 250 kPa = ~21.7 psi boost.
        // clampMax 3500 = 350 kPa absolute = ~36 psi gauge (safe hardware ceiling for SIM2K turbo).
        factor: 0.1, offsetVal: 0, unit: 'kPa',
        stage1: { multiplier: 1.18 },
        stage2: { multiplier: 1.32 },
        stage3: { multiplier: 1.48, clampMax: 3500 },
        critical: true, showPreview: true,
      },
      {
        id: 'sim2k_fuel_inject',
        name: 'Fuel Injection Duration',
        category: 'fuel',
        desc: 'Base GDI injection duration. Matched to boost increases to maintain correct lambda across load range.',
        signatures: [[0x4B,0x46,0x41,0x4E,0x50,0x41,0x53,0x53], [0x49,0x4E,0x4A,0x44,0x55,0x52,0x53]],
        sigOffset: 4,
        rows: 16, cols: 16, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'ms',
        stage1: { multiplier: 1.12 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.32, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'sim2k_torque_limit',
        name: 'Torque Demand Limit',
        category: 'torque',
        desc: 'Software torque ceiling. Raised to match power gains — the SIM2K torque limit is often the primary bottleneck on Stinger tunes.',
        signatures: [[0x4D,0x58,0x54,0x51,0x44,0x52,0x56], [0x54,0x51,0x4C,0x49,0x4D,0x44,0x52]],
        sigOffset: 2,
        rows: 8, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.25 },
        stage2: { multiplier: 1.45 },
        stage3: { multiplier: 1.65, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'sim2k_ignition',
        name: 'Ignition Timing',
        category: 'ignition',
        desc: 'Spark advance map. i30N / Stinger use knock-limited timing — advancing 2–3° on Stage 2 with premium fuel adds measurable power.',
        signatures: [[0x4B,0x46,0x5A,0x57,0x00], [0x4B,0x46,0x5A,0x57,0x42]],
        sigOffset: 2,
        rows: 16, cols: 16, dtype: 'int8', le: true,
        factor: 0.75, offsetVal: -48, unit: '°BTDC',
        stage1: { addend: 0 },
        stage2: { addend: 2 },
        stage3: { addend: 3, clampMax: 60 },
        addonOverrides: {
          popcorn: { addend: -20, clampMin: 0, lastNCols: 2 },
        },
        critical: false, showPreview: true,
      },
      {
        id: 'sim2k_rev_limit',
        name: 'Rev Limiter (nEngMax)',
        category: 'limiter',
        desc: 'Engine RPM hard cut. i30N/Stinger stock limiter is conservatively set — small raise on Stage 2+ improves top-end delivery.',
        // SIM2K uses Tricore TC17xx — symbol names in calibration region
        // "nEngMax\0" confirmed in SIM2K-250 binary dumps via Tricore disassembly
        a2lNames: ['nEngMax', 'nEngCutOff', 'nMaxCut', 'REVLIMIT', 'nAbschalten'],
        signatures: [[0x6E,0x45,0x6E,0x67,0x4D,0x61,0x78,0x00], [0x6E,0x45,0x6E,0x67,0x43,0x75,0x74,0x4F,0x66,0x66], [0x52,0x45,0x56,0x4C,0x49,0x4D,0x49,0x54]],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'RPM',
        stage1: { multiplier: 1.0 },
        stage2: { addend: 300 },
        stage3: { addend: 500, clampMax: 7800 },
        addonOverrides: {
          launchcontrol: { multiplier: 0, addend: 4000, clampMax: 4500 },
          revlimit: { addend: 400, clampMax: 7800 },
        },
        critical: false, showPreview: false,
      },
      {
        id: 'sim2k_overboost_cut',
        name: 'Overboost Protection Cut (pBoostMax)',
        category: 'limiter',
        desc: 'Maximum charge air pressure before ECU triggers fuel cut. Raised to prevent false overboost cut when running stage boost targets on i30N / Stinger.',
        a2lNames: ['pBoostMax', 'pSysMax', 'LimBoostPres', 'BoostCutPres', 'pMaxBoost'],
        signatures: [[0x70,0x42,0x6F,0x6F,0x73,0x74,0x4D,0x61,0x78], [0x70,0x53,0x79,0x73,0x4D,0x61,0x78], [0x70,0x4D,0x61,0x78,0x42,0x6F,0x6F,0x73,0x74]],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'mbar',
        stage1: { multiplier: 1.15, clampMax: 3200 },
        stage2: { multiplier: 1.28, clampMax: 3800 },
        stage3: { multiplier: 1.42, clampMax: 4500 },
        addonOverrides: {
          overboost: { multiplier: 1.5, clampMax: 4500 },
        },
        critical: false, showPreview: false,
      },
      {
        id: 'sim2k_speed_limit',
        name: 'Vehicle Speed Limiter (VMAX)',
        category: 'limiter',
        desc: 'Factory speed limiter. Kia/Hyundai stock limit is 250km/h electronically — set to maximum to remove the speed governor.',
        a2lNames: ['VMAX', 'VehicleSpeedMax', 'VFZGMAX', 'vMaxSpdLim'],
        signatures: [[0x56,0x4D,0x41,0x58,0x00], [0x56,0x46,0x5A,0x47,0x4D,0x41,0x58], [0x76,0x4D,0x61,0x78,0x53,0x70,0x64,0x4C,0x69,0x6D]],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'km/h',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: {
          speedlimiter: { multiplier: 0, addend: 65535 },
        },
        critical: false, showPreview: false,
      },
    ],
  },

  // ── Bosch ME9.7 (Mercedes-Benz M272 / M273 / M156 AMG) ───────────────────
  {
    id: 'me9_merc',
    name: 'Bosch ME9.7 (Mercedes)',
    manufacturer: 'Bosch',
    family: 'ME9.7',
    // Processor: Motorola MPC555-565 (PowerPC), NOT Tricore. ~512KB–1MB flash.
    // Part numbers: 0261S02xxx range confirmed (e.g. 0261S02321, 0261S02453, 0261S02455, 0261S02615).
    // M272/M273 are engine codes — NOT ECU binary strings, removed.
    identStrings: ['ME9.7', 'ME97', 'MED9.7', '0261S02'],
    fileSizeRange: [524288, 1048576],   // MPC55x = ~512KB–1MB flash
    vehicles: ['Mercedes C63 AMG (M156 6.2L)', 'Mercedes E63 AMG', 'Mercedes SL63 AMG', 'Mercedes C-Class M272 3.5L', 'Mercedes E-Class M272/M273', 'Mercedes S-Class M272/M273'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x1FFFF8,
    checksumLength: 4,
    maps: [
      {
        id: 'me97_fuel_inject',
        name: 'Fuel Injection Duration',
        category: 'fuel',
        desc: 'Base injection duration map. The naturally-aspirated M156/M272 responds to fuel enrichment during high-load conditions on Stage 2+.',
        signatures: [[0x4B,0x46,0x41,0x4E,0x4C,0x41,0x4D,0x42], [0x49,0x4E,0x4A,0x44,0x55,0x52,0x42,0x53]],
        sigOffset: 4,
        rows: 16, cols: 16, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'ms',
        stage1: { multiplier: 1.05 },
        stage2: { multiplier: 1.10 },
        stage3: { multiplier: 1.18, clampMax: 60000 },
        critical: true, showPreview: true,
      },
      {
        id: 'me97_ignition',
        name: 'Ignition Timing Base',
        category: 'ignition',
        desc: 'Base ignition advance map. Primary Stage 1 modification — advancing timing 2–4° unlocks significant power on M156 and M272/M273.',
        signatures: [[0x4B,0x46,0x5A,0x57,0x42,0x41,0x53], [0x5A,0x57,0x42,0x41,0x53,0x45,0x01]],
        sigOffset: 4,
        rows: 16, cols: 16, dtype: 'int8', le: true,
        factor: 0.75, offsetVal: -48, unit: '°BTDC',
        stage1: { addend: 2 },
        stage2: { addend: 4 },
        stage3: { addend: 5, clampMax: 72 },
        critical: true, showPreview: true,
      },
      {
        id: 'me97_torque_limit',
        name: 'Torque Demand Limit',
        category: 'torque',
        desc: 'Software torque ceiling. Raised on Stage 2/3 to prevent ECU clipping gains from NA modifications.',
        signatures: [[0x54,0x51,0x4C,0x49,0x4D,0x01,0x00], [0x54,0x4F,0x52,0x51,0x4C,0x49,0x4D]],
        sigOffset: 2,
        rows: 8, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.10 },
        stage2: { multiplier: 1.20 },
        stage3: { multiplier: 1.30, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'me97_rev_limit',
        name: 'Rev Limiter',
        category: 'limiter',
        desc: 'Engine RPM hard cut. Raised slightly for improved top-end performance on M156 race builds.',
        signatures: [[0x52,0x45,0x56,0x4C,0x49,0x4D,0x01], [0x4E,0x4D,0x41,0x58,0x52,0x50,0x4D]],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'RPM',
        stage1: { addend: 200 },
        stage2: { addend: 400 },
        stage3: { addend: 600, clampMax: 8500 },
        critical: false, showPreview: false,
      },
    ],
  },

  // ── Bosch DCM6.1 (Ford Transit / Ranger diesel) ───────────────────────────
  {
    id: 'dcm61',
    name: 'Delphi DCM6.1',
    manufacturer: 'Delphi',
    family: 'DCM6.1',
    // DCM6.1 is a DELPHI ECU (not Bosch) — Tricore TC1797, 4MB internal flash.
    // Uses Delphi internal ref 28xxxxxx (e.g. 28473463). Ford OEM DS71-/FS7A- part numbers.
    // Removed 0281018/0281019 — those are Bosch EDC17 numbers, not Delphi.
    identStrings: ['DCM6.1', 'DCM61', 'DCM6.1AP', '28473', 'CuPF', 'DS71', 'FS7A'],
    fileSizeRange: [1048576, 4194304],   // TC1797 = 4MB internal flash
    vehicles: ['Ford Transit 2.0 TDCi (2016+)', 'Ford Transit 2.2 TDCi', 'Ford Ranger 2.2 TDCi', 'Ford Ranger 3.2 TDCi', 'Ford Mondeo 2.0 TDCi (2015+)', 'Ford Focus 1.5 TDCi (2015+)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0xFFFF8,
    checksumLength: 4,
    maps: [
      {
        id: 'dcm61_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'Charge air pressure setpoint. Primary Stage 1 map on Transit / Ranger — large headroom on stock turbo.',
        signatures: [[0x4C,0x41,0x44,0x53,0x4F,0x4C,0x4C,0x00], [0x4C,0x44,0x53,0x4F,0x4C,0x4C,0x00]],
        sigOffset: 2,
        rows: 10, cols: 12, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.18 },
        stage2: { multiplier: 1.28 },
        stage3: { multiplier: 1.40, clampMax: 55000 },
        critical: true, showPreview: true,
      },
      {
        id: 'dcm61_fuel_quantity',
        name: 'Injection Quantity Map',
        category: 'fuel',
        desc: 'Fuel injection quantity base map. Increasing this raises torque — primary fuelling map for Transit/Ranger Stage 1.',
        signatures: [[0x4D,0x45,0x4E,0x47,0x45,0x00], [0x4B,0x46,0x4D,0x45,0x4E,0x47,0x45]],
        sigOffset: 2,
        rows: 10, cols: 12, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.30, clampMax: 62000 },
        critical: true, showPreview: true,
      },
      {
        id: 'dcm61_torque_limit',
        name: 'Max Torque Limit',
        category: 'torque',
        desc: 'Maximum torque ceiling. Must be raised to allow Transit/Ranger to benefit from increased fuel and boost.',
        signatures: [[0x4D,0x58,0x4D,0x4F,0x4D,0x00], [0x54,0x51,0x4C,0x49,0x4D,0x44,0x43]],
        sigOffset: 2,
        rows: 1, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.22 },
        stage2: { multiplier: 1.35 },
        stage3: { multiplier: 1.50, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'dcm61_rail_pressure',
        name: 'Rail Pressure Target',
        category: 'fuel',
        desc: 'Common rail pressure setpoint. Raising rail pressure improves atomisation and supports higher injection quantities.',
        signatures: [[0x52,0x41,0x49,0x4C,0x44,0x52,0x55,0x43,0x4B], [0x4B,0x46,0x52,0x41,0x49,0x4C,0x53]],
        sigOffset: 2,
        rows: 8, cols: 10, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.05 },
        stage2: { multiplier: 1.08 },
        stage3: { multiplier: 1.12, clampMax: 2100 },
        critical: false, showPreview: false,
      },
    ],
  },

  // ── Siemens/VDO SID807 EVO (Ford Mondeo/Transit/Focus 2.0 TDCi) ──────────
  {
    id: 'sid807',
    name: 'Siemens SID807 EVO',
    manufacturer: 'Continental/VDO',
    family: 'SID807EVO',
    identStrings: ['SID807EVO', 'SID807', 'SID211', 'SID209', '5WS40119'],
    fileSizeRange: [524288, 1048576],
    vehicles: ['Ford Mondeo 2.0 TDCi (2010–2014)', 'Ford Focus 2.0 TDCi (2010–2014)', 'Ford Galaxy 2.0 TDCi', 'Ford S-Max 2.0 TDCi', 'PSA Peugeot 508 2.0 BlueHDi', 'Volvo S60/V60 D4'],
    checksumAlgo: 'continental-crc',
    checksumOffset: 0x7FFF0,
    checksumLength: 4,
    maps: [
      {
        id: 'sid807_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'Desired boost pressure map. Primary Stage 1 tuning map for Ford TDCi and PSA BlueHDi applications.',
        signatures: [[0x4C,0x41,0x44,0x53,0x4F,0x4C,0x4C], [0x42,0x4F,0x4F,0x53,0x54,0x53,0x4F,0x4C]],
        sigOffset: 2,
        rows: 9, cols: 12, dtype: 'uint16', le: false,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.25 },
        stage3: { multiplier: 1.38, clampMax: 52000 },
        critical: true, showPreview: true,
      },
      {
        id: 'sid807_fuel_quantity',
        name: 'Injection Quantity Map',
        category: 'fuel',
        desc: 'Base injection quantity (mg/stroke). Raising this increases torque across the load range.',
        signatures: [[0x4D,0x45,0x4E,0x5A,0x4B,0x00], [0x45,0x49,0x4E,0x53,0x50,0x52,0x5A]],
        sigOffset: 2,
        rows: 9, cols: 12, dtype: 'uint16', le: false,
        factor: 0.001, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.14 },
        stage2: { multiplier: 1.20 },
        stage3: { multiplier: 1.28, clampMax: 62000 },
        critical: true, showPreview: true,
      },
      {
        id: 'sid807_torque_limit',
        name: 'Max Torque Map',
        category: 'torque',
        desc: 'Software torque ceiling. Raised to match fuel and boost increases.',
        signatures: [[0x4D,0x58,0x4D,0x4F,0x4D,0x00], [0x54,0x51,0x4C,0x49,0x4D]],
        sigOffset: 2,
        rows: 1, cols: 8, dtype: 'uint16', le: false,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.22 },
        stage2: { multiplier: 1.35 },
        stage3: { multiplier: 1.50, clampMax: 65000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── Mazda SkyActiv-G / SkyActiv-D (Denso) ────────────────────────────────
  {
    id: 'mazda_skyactiv',
    name: 'Denso SkyActiv (Mazda)',
    manufacturer: 'Denso',
    family: 'SkyActiv',
    // Denso processor: SH72531 (petrol SkyActiv-G), SH7058 (diesel SkyActiv-D).
    // SH7058/SH72531 are chip model names — NOT ASCII strings in the binary. REMOVED.
    // 'DENSO' not confirmed as binary string. REMOVED.
    // PE-VPS, PX8R, P5-VP are Mazda engine/part code prefixes that may appear in calibration ID.
    identStrings: ['SKYACTIV', 'SkyActiv', 'PE-VPS', 'PX8R', 'P5-VP', 'SH3E', 'S52L'],
    fileSizeRange: [524288, 2097152],   // SH72531=1.25MB; SH72543=2MB; SH7058=1MB
    vehicles: ['Mazda CX-5 2.0 SkyActiv-G', 'Mazda3 2.0/2.5 SkyActiv-G', 'Mazda6 2.5 SkyActiv-G', 'Mazda MX-5 2.0 SkyActiv-G', 'Mazda CX-5 2.2 SkyActiv-D', 'Mazda3 1.5 SkyActiv-D'],
    checksumAlgo: 'unknown',
    checksumOffset: 0,
    checksumLength: 0,
    maps: [
      {
        id: 'skyactiv_fuel_inject',
        name: 'Fuel Injection Map',
        category: 'fuel',
        desc: 'Base injection duration vs RPM and load. SkyActiv-G responds well to enrichment under high-load conditions.',
        signatures: [[0x46,0x55,0x45,0x4C,0x4D,0x41,0x50], [0x4B,0x46,0x41,0x4E,0x50,0x41,0x53]],
        sigOffset: 4,
        rows: 16, cols: 16, dtype: 'uint16', le: false,
        factor: 0.001, offsetVal: 0, unit: 'ms',
        stage1: { multiplier: 1.08 },
        stage2: { multiplier: 1.14 },
        stage3: { multiplier: 1.20, clampMax: 60000 },
        critical: true, showPreview: true,
      },
      {
        id: 'skyactiv_ignition',
        name: 'Ignition Timing Map',
        category: 'ignition',
        desc: 'Spark advance map. SkyActiv-G runs high compression (14:1) with precise timing — advancing 1–2° on 98 RON improves response.',
        signatures: [[0x4B,0x46,0x5A,0x57,0x00], [0x49,0x47,0x4E,0x42,0x41,0x53,0x45]],
        sigOffset: 2,
        rows: 16, cols: 16, dtype: 'int8', le: false,
        factor: 0.75, offsetVal: -48, unit: '°BTDC',
        stage1: { addend: 1 },
        stage2: { addend: 2 },
        stage3: { addend: 3, clampMax: 72 },
        critical: true, showPreview: true,
      },
      {
        id: 'skyactiv_rev_limit',
        name: 'Rev Limiter',
        category: 'limiter',
        desc: 'Engine RPM hard cut. Raised on performance builds.',
        signatures: [[0x52,0x45,0x56,0x4C,0x49,0x4D,0x01], [0x4E,0x4D,0x41,0x58,0x52,0x50,0x4D]],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'RPM',
        stage1: { addend: 200 },
        stage2: { addend: 400 },
        stage3: { addend: 500, clampMax: 7500 },
        critical: false, showPreview: false,
      },
    ],
  },

  // ── Honda PGM-FI Keihin (Civic / Accord / CR-V) ──────────────────────────
  {
    id: 'honda_keihin',
    name: 'Keihin PGM-FI (Honda)',
    manufacturer: 'Keihin',
    family: 'PGM-FI',
    // Keihin processor: SH7058 (1MB, ~2003-08), SH72543 (2MB, ~2008-13), SH72546 (3.75MB, 2013+).
    // SH70xx/SH725xx chip names do NOT appear as ASCII in the binary. REMOVED.
    // 'HONDA' not confirmed as binary string. REMOVED. OEM part numbers start with 37820-.
    identStrings: ['PGM-FI', 'PGMFI', 'KEIHIN', '37820', '37805'],
    fileSizeRange: [524288, 2097152],
    vehicles: ['Honda Civic Type-R FK2/FK8 (2.0T)', 'Honda Civic 1.5 VTEC Turbo', 'Honda Accord 2.4 i-VTEC', 'Honda CR-V 1.5T', 'Honda Jazz 1.5T', 'Honda HR-V 1.5T'],
    checksumAlgo: 'unknown',
    checksumOffset: 0,
    checksumLength: 0,
    maps: [
      {
        id: 'pgmfi_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'Boost setpoint map for turbocharged PGM-FI (FK8 Type-R, Civic 1.5T). Primary Stage 1 modification.',
        signatures: [[0x42,0x4F,0x4F,0x53,0x54,0x4D,0x41,0x50], [0x4C,0x44,0x53,0x4F,0x4C,0x4C]],
        sigOffset: 4,
        rows: 10, cols: 14, dtype: 'uint16', le: false,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.28 },
        stage3: { multiplier: 1.42, clampMax: 55000 },
        critical: true, showPreview: true,
      },
      {
        id: 'pgmfi_fuel_inject',
        name: 'Fuel Injection Map',
        category: 'fuel',
        desc: 'Base injection pulse width. Honda PGM-FI uses sequential multiport or direct injection depending on variant.',
        signatures: [[0x46,0x55,0x45,0x4C,0x50,0x57], [0x49,0x4E,0x4A,0x44,0x55,0x52]],
        sigOffset: 4,
        rows: 16, cols: 16, dtype: 'uint16', le: false,
        factor: 0.001, offsetVal: 0, unit: 'ms',
        stage1: { multiplier: 1.10 },
        stage2: { multiplier: 1.18 },
        stage3: { multiplier: 1.26, clampMax: 62000 },
        critical: true, showPreview: true,
      },
      {
        id: 'pgmfi_ignition',
        name: 'Ignition Timing Map',
        category: 'ignition',
        desc: 'Spark advance map. VTEC and non-VTEC Honda engines both benefit from optimised timing, particularly on 98 RON.',
        signatures: [[0x49,0x47,0x4E,0x4D,0x41,0x50], [0x4B,0x46,0x5A,0x57,0x00]],
        sigOffset: 2,
        rows: 16, cols: 16, dtype: 'int8', le: false,
        factor: 0.75, offsetVal: -48, unit: '°BTDC',
        stage1: { addend: 1 },
        stage2: { addend: 3 },
        stage3: { addend: 4, clampMax: 65 },
        critical: true, showPreview: true,
      },
      {
        id: 'pgmfi_vtec_point',
        name: 'VTEC Engagement RPM',
        category: 'misc',
        desc: 'RPM threshold at which VTEC switches to high-lift cam profile. Lowering this point improves mid-range power on Civic Type-R.',
        signatures: [[0x56,0x54,0x45,0x43,0x52,0x50,0x4D], [0x56,0x54,0x45,0x43,0x00]],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'RPM',
        stage1: { addend: -200 },
        stage2: { addend: -400 },
        stage3: { addend: -600, clampMin: 3000 },
        critical: false, showPreview: false,
      },
    ],
  },

  // ── Scania EMS S7 / S8 (Trucks & Buses) ──────────────────────────────────
  {
    id: 'scania_ems',
    name: 'Scania EMS S7/S8',
    manufacturer: 'Scania',
    family: 'EMS S7',
    // MPC5566 is a chip model name — does NOT appear as ASCII in binary. REMOVED.
    // SCANIA, DC9, DC13, DC16 may appear as engine family strings in Scania firmware.
    identStrings: ['EMS S7', 'EMS S8', 'EMSS7', 'EMSS8', 'EMD1', 'SCANIA', 'DC9', 'DC13', 'XPI'],
    fileSizeRange: [1048576, 8388608],   // 1MB – 8MB (truck ECUs are large)
    vehicles: ['Scania R-series (DC9/DC13/DC16)', 'Scania G-series (DC9/DC13)', 'Scania P-series (DC9/DC13)', 'Scania Irizar Bus (DC9)', 'Scania OmniCity (DC9)', 'Scania Touring (DC13)'],
    checksumAlgo: 'unknown',
    checksumOffset: 0,
    checksumLength: 0,
    maps: [
      {
        id: 'scania_inject_qty',
        name: 'Injection Quantity Map',
        category: 'fuel',
        desc: 'Main injection quantity map. Primary Stage 1 map on Scania XPI common rail — increases torque and load capacity.',
        signatures: [[0x4D,0x45,0x4E,0x47,0x45,0x00], [0x49,0x4E,0x4A,0x51,0x54,0x59]],
        sigOffset: 2,
        rows: 10, cols: 12, dtype: 'uint16', le: false,
        factor: 0.001, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.25 },
        stage3: { multiplier: 1.35, clampMax: 62000 },
        critical: true, showPreview: true,
      },
      {
        id: 'scania_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'Charge air pressure setpoint for Scania EMS. Raising this allows higher airflow to support increased injection quantity.',
        signatures: [[0x4C,0x41,0x44,0x53,0x4F,0x4C,0x4C], [0x42,0x4F,0x4F,0x53,0x54,0x53]],
        sigOffset: 2,
        rows: 10, cols: 12, dtype: 'uint16', le: false,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.12 },
        stage2: { multiplier: 1.20 },
        stage3: { multiplier: 1.30, clampMax: 55000 },
        critical: true, showPreview: true,
      },
      {
        id: 'scania_torque_limit',
        name: 'Torque / Power Limit',
        category: 'torque',
        desc: 'Maximum torque output map. Scania ECUs have model-specific torque caps — raising this is mandatory for meaningful power increase.',
        signatures: [[0x4D,0x58,0x4D,0x4F,0x4D,0x00], [0x54,0x51,0x4C,0x49,0x4D]],
        sigOffset: 2,
        rows: 1, cols: 8, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.10 },
        stage2: { multiplier: 1.18 },
        stage3: { multiplier: 1.28, clampMax: 65535 },
        critical: true, showPreview: true,
      },
      {
        id: 'scania_speed_limit',
        name: 'Vehicle Speed Limiter',
        category: 'limiter',
        desc: 'Factory speed limiter (typically 90 km/h on trucks). Raised or removed for applications where legal.',
        signatures: [[0x56,0x4D,0x41,0x58,0x00], [0x56,0x53,0x4C,0x49,0x4D]],
        sigOffset: 1,
        rows: 1, cols: 1, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'km/h',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { speedlimiter: { multiplier: 0, addend: 65535 } },
        critical: false, showPreview: false,
      },
    ],
  },

  // ── Bosch MED17.7 (Mercedes-Benz petrol 2012+) ────────────────────────────
  {
    id: 'med17_merc',
    name: 'Bosch MED17.7 (Mercedes)',
    manufacturer: 'Bosch',
    family: 'MED17.7',
    // Tricore TC1797. Part numbers: 0261S07xxx–0261S10xxx (MED17.7.2 A45 AMG: 0261S08233, 0261S09816).
    // M274/M276/M177 are engine codes — NOT ECU binary strings. REMOVED.
    identStrings: ['MED17.7', 'MED177', '0261S07', '0261S08', '0261S09', '0261S10'],
    fileSizeRange: [1048576, 4194304],
    vehicles: ['Mercedes A45 AMG (M133 2.0T)', 'Mercedes CLA45 AMG', 'Mercedes GLA45 AMG', 'Mercedes C250 CGI (M274)', 'Mercedes E350 CGI (M276)', 'Mercedes C43 AMG (M276 3.0T)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x1FFFF8,
    checksumLength: 4,
    maps: [
      {
        id: 'med177_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'Charge air pressure setpoint. A45 AMG M133 runs the highest stock boost of any 2.0T — significant Stage 2 headroom on hardware.',
        signatures: [[0x4C,0x44,0x4B,0x56,0x53,0x4F,0x4C,0x4C], [0x42,0x4F,0x4F,0x53,0x54,0x53,0x4F,0x4C]],
        sigOffset: 4,
        rows: 12, cols: 16, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.28 },
        stage3: { multiplier: 1.45, clampMax: 62000 },
        critical: true, showPreview: true,
      },
      {
        id: 'med177_fuel_inject',
        name: 'Fuel Injection Duration',
        category: 'fuel',
        desc: 'Base injection duration. Raised to match boost increases and maintain correct lambda on tuned Mercedes engines.',
        signatures: [[0x49,0x4E,0x4A,0x44,0x55,0x52,0x42,0x53], [0x4B,0x46,0x49,0x4E,0x4A,0x44,0x55,0x52]],
        sigOffset: 4,
        rows: 16, cols: 16, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'ms',
        stage1: { multiplier: 1.12 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.32, clampMax: 60000 },
        critical: true, showPreview: true,
      },
      {
        id: 'med177_torque_limit',
        name: 'Torque Demand Limit',
        category: 'torque',
        desc: 'Software torque ceiling. Must be raised to allow power gains beyond stock Mercedes limits.',
        signatures: [[0x54,0x51,0x4C,0x49,0x4D,0x01,0x00], [0x54,0x4F,0x52,0x51,0x4C,0x49,0x4D]],
        sigOffset: 2,
        rows: 8, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.20 },
        stage2: { multiplier: 1.38 },
        stage3: { multiplier: 1.55, clampMax: 65000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── Bosch EDC17CP42/CP55 (JLR – Land Rover / Jaguar diesel) ──────────────
  {
    id: 'edc17_jlr',
    name: 'Bosch EDC17 (JLR)',
    manufacturer: 'Bosch',
    family: 'EDC17CP',
    // EDC17CP42 (Freelander2/Discovery Sport pre-2015), EDC17CP55 (Ingenium 2.0D post-2015).
    // Bosch 0281032xxx confirmed for CP55 (e.g. 0281032607). AJ200D/TD4/TD6 are marketing names — NOT ECU strings. REMOVED.
    identStrings: ['EDC17CP42', 'EDC17CP55', 'EDC17CP', '0281020', '0281021', '0281022', '0281032'],
    fileSizeRange: [1048576, 4194304],
    vehicles: ['Land Rover Defender 3.0 D200/D250/D300', 'Land Rover Discovery Sport 2.0 TD4', 'Jaguar F-Pace 2.0D/3.0D', 'Range Rover Velar D180/D240', 'Jaguar XE 2.0D (Ingenium)', 'Land Rover Freelander 2 2.2 TD4'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x3FFFF8,
    checksumLength: 4,
    maps: [
      {
        id: 'edc17jlr_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'Charge air pressure setpoint for JLR Ingenium and older AJ diesel engines. Primary Stage 1 map.',
        signatures: [[0x4C,0x41,0x44,0x53,0x4F,0x4C,0x4C,0x00], [0x4C,0x44,0x53,0x4F,0x4C,0x4C,0x00]],
        sigOffset: 2,
        rows: 10, cols: 14, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.25 },
        stage3: { multiplier: 1.38, clampMax: 56000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc17jlr_fuel_quantity',
        name: 'Injection Quantity Map',
        category: 'fuel',
        desc: 'Fuel injection quantity base map for JLR diesel. Increasing fuelling to match boost for Stage 1/2.',
        signatures: [[0x4D,0x45,0x4E,0x5A,0x4B,0x00], [0x4B,0x46,0x4D,0x53,0x4E,0x57]],
        sigOffset: 2,
        rows: 10, cols: 14, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.14 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.30, clampMax: 62000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc17jlr_torque_limit',
        name: 'Torque Demand Limit',
        category: 'torque',
        desc: 'Maximum torque ceiling. JLR frequently undersells torque figures — significant ECU headroom exists for Stage 1.',
        signatures: [[0x4D,0x58,0x4D,0x4F,0x4D,0x00], [0x54,0x51,0x4C,0x49,0x4D]],
        sigOffset: 2,
        rows: 1, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.20 },
        stage2: { multiplier: 1.35 },
        stage3: { multiplier: 1.50, clampMax: 65000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── Delphi MT86 / DCM3.7 (Hyundai/Kia diesel) ────────────────────────────
  {
    id: 'delphi_mt86',
    name: 'Delphi DCM3.7 (Hyundai/Kia diesel)',
    manufacturer: 'Delphi',
    family: 'DCM3.7',
    // DCM3.7AP is the DIESEL ECU (Renesas SH72513/SH72543). NOT MT86!
    // MT86 is actually a PETROL ECU for large-displacement engines (Genesis 3.8L V6, TC1766).
    // 'DCM3.7' confirmed to appear in calibration ID strings embedded in binary (e.g. DCM3.7-B1E-UGD90L-Z20H-J309S).
    // Delphi part numbers: 28386430, 28371843, 25189959 etc.
    identStrings: ['DCM3.7', 'DCM37', 'DCM3.7AP', '28386', '28371', '25189'],
    fileSizeRange: [524288, 2097152],   // SH72543 = 2MB; SH72513 = 1.25MB
    vehicles: ['Hyundai Tucson 1.6 CRDi (2015+)', 'Kia Sportage 1.6 CRDi', 'Hyundai i30 1.6 CRDi', 'Kia Ceed 1.4/1.6 CRDi', 'Hyundai Santa Fe 2.2 CRDi', 'Kia Sorento 2.2 CRDi'],
    checksumAlgo: 'unknown',
    checksumOffset: 0,
    checksumLength: 0,
    maps: [
      {
        id: 'mt86_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'Desired boost pressure map for Hyundai/Kia CRDi with Delphi ECU. Primary Stage 1 map.',
        signatures: [[0x4C,0x41,0x44,0x53,0x4F,0x4C,0x4C], [0x42,0x4F,0x4F,0x53,0x54]],
        sigOffset: 2,
        rows: 9, cols: 11, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.25 },
        stage3: { multiplier: 1.38, clampMax: 52000 },
        critical: true, showPreview: true,
      },
      {
        id: 'mt86_fuel_quantity',
        name: 'Injection Quantity Map',
        category: 'fuel',
        desc: 'Fuel injection quantity for CRDi engines. Increasing this raises torque output.',
        signatures: [[0x4D,0x45,0x4E,0x5A,0x4B,0x00], [0x45,0x49,0x4E,0x53,0x50,0x52]],
        sigOffset: 2,
        rows: 9, cols: 11, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.14 },
        stage2: { multiplier: 1.20 },
        stage3: { multiplier: 1.28, clampMax: 62000 },
        critical: true, showPreview: true,
      },
      {
        id: 'mt86_torque_limit',
        name: 'Max Torque Limit',
        category: 'torque',
        desc: 'Torque ceiling map. Must be raised to realise power gains from increased fuel and boost on CRDi engines.',
        signatures: [[0x4D,0x58,0x4D,0x4F,0x4D,0x00], [0x54,0x51,0x4C,0x49,0x4D]],
        sigOffset: 2,
        rows: 1, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.22 },
        stage2: { multiplier: 1.35 },
        stage3: { multiplier: 1.48, clampMax: 65000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── Renault/Nissan EMS3120 extra: SID301/SID310 (2.0 dCi/1.6 dCi) ────────
  {
    id: 'sid310',
    name: 'Continental SID310',
    manufacturer: 'Continental',
    family: 'SID310',
    identStrings: ['SID310', 'SID309', 'SID307', 'SID305', 'SID306', 'SID301', '5WS40', 'S101180'],
    fileSizeRange: [524288, 2097152],
    vehicles: ['Renault Megane RS 1.6 TCe', 'Renault Trafic 1.6 dCi', 'Renault Vivaro 1.6 dCi', 'Nissan Qashqai 1.5 dCi (2013+)', 'Nissan Juke 1.5 dCi', 'Renault Clio 1.5 dCi (2014+)'],
    checksumAlgo: 'continental-crc',
    checksumOffset: 0x7FFF0,
    checksumLength: 4,
    maps: [
      {
        id: 'sid310_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'Desired boost pressure map for Renault/Nissan dCi and TCe engines. Primary Stage 1 calibration.',
        signatures: [[0x4C,0x41,0x44,0x53,0x4F,0x4C,0x4C], [0x42,0x4F,0x4F,0x53,0x54,0x53,0x4F,0x4C]],
        sigOffset: 2,
        rows: 9, cols: 12, dtype: 'uint16', le: false,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.25 },
        stage3: { multiplier: 1.38, clampMax: 52000 },
        critical: true, showPreview: true,
      },
      {
        id: 'sid310_fuel_quantity',
        name: 'Injection Quantity Map',
        category: 'fuel',
        desc: 'Base injection quantity for dCi engines. Raising this increases torque across the RPM range.',
        signatures: [[0x4D,0x45,0x4E,0x5A,0x4B,0x00], [0x45,0x49,0x4E,0x53,0x50,0x52,0x5A]],
        sigOffset: 2,
        rows: 9, cols: 12, dtype: 'uint16', le: false,
        factor: 0.001, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.14 },
        stage2: { multiplier: 1.20 },
        stage3: { multiplier: 1.28, clampMax: 62000 },
        critical: true, showPreview: true,
      },
      {
        id: 'sid310_torque_limit',
        name: 'Max Torque Map',
        category: 'torque',
        desc: 'Software torque ceiling for SID310. Raised to allow Stage 1/2 power gains.',
        signatures: [[0x4D,0x58,0x4D,0x4F,0x4D,0x00], [0x54,0x51,0x4C,0x49,0x4D]],
        sigOffset: 2,
        rows: 1, cols: 8, dtype: 'uint16', le: false,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.22 },
        stage2: { multiplier: 1.35 },
        stage3: { multiplier: 1.50, clampMax: 65000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── Toyota/Lexus/Hino Denso (SH705x / SH725x, Gen1–4) ───────────────────
  {
    id: 'toyota_denso',
    name: 'Denso (Toyota/Lexus)',
    manufacturer: 'Denso',
    family: 'Toyota Denso',
    // Toyota Denso ECUs embed calibration IDs (89661- OEM prefix) and Denso system strings.
    // SH705x/SH725x chip names and brand names (TOYOTA/LEXUS) do NOT appear as ASCII in binaries.
    // 76F003/R7F701 are Renesas RH850 part IDs — not embedded as plain ASCII in calibration ROMs.
    identStrings: ['89661-', 'DENSO', 'DNSSYS', '89663-', '89666-'],
    fileSizeRange: [524288, 4194304],
    vehicles: ['Toyota GR Yaris 1.6T (G16E-GTS)', 'Toyota GR86 2.4 (FA24)', 'Toyota Supra A90 3.0T (B58)', 'Toyota Hilux 2.8D (1GD-FTV)', 'Lexus IS-F 5.0 V8', 'Toyota Land Cruiser 3.0D (1KD-FTV)', 'Toyota Auris/Corolla 1.8 Hybrid', 'Lexus RC-F 5.0 V8'],
    checksumAlgo: 'unknown',
    checksumOffset: 0,
    checksumLength: 0,
    maps: [
      {
        id: 'toyota_fuel_inject',
        name: 'Fuel Injection Map',
        category: 'fuel',
        desc: 'Base injection duration vs RPM and load. Toyota Denso ECUs respond well to fuel enrichment — primary Stage 1 calibration on GR Yaris/GR86.',
        signatures: [[0x46,0x55,0x45,0x4C,0x4D,0x41,0x50], [0x4B,0x46,0x41,0x4E,0x50,0x41,0x53,0x53]],
        sigOffset: 4,
        rows: 16, cols: 16, dtype: 'uint16', le: false,
        factor: 0.001, offsetVal: 0, unit: 'ms',
        stage1: { multiplier: 1.10 },
        stage2: { multiplier: 1.18 },
        stage3: { multiplier: 1.26, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'toyota_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'Charge air pressure setpoint for turbocharged Toyota/Lexus engines. Primary map on GR Yaris G16E-GTS.',
        signatures: [[0x42,0x4F,0x4F,0x53,0x54,0x4D,0x41,0x50], [0x4C,0x44,0x53,0x50,0x53,0x4F,0x4C,0x4C]],
        sigOffset: 4,
        rows: 10, cols: 14, dtype: 'uint16', le: false,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.28 },
        stage3: { multiplier: 1.45, clampMax: 60000 },
        critical: true, showPreview: true,
      },
      {
        id: 'toyota_ignition',
        name: 'Ignition Timing Map',
        category: 'ignition',
        desc: 'Spark advance map vs RPM and load. Toyota naturally-aspirated engines (GR86, IS-F) gain well from timing advance on 98 RON.',
        signatures: [[0x49,0x47,0x4E,0x4D,0x41,0x50], [0x4B,0x46,0x5A,0x57,0x00]],
        sigOffset: 2,
        rows: 16, cols: 16, dtype: 'int8', le: false,
        factor: 0.75, offsetVal: -48, unit: '°BTDC',
        stage1: { addend: 2 },
        stage2: { addend: 3 },
        stage3: { addend: 4, clampMax: 72 },
        critical: true, showPreview: true,
      },
      {
        id: 'toyota_rev_limit',
        name: 'Rev Limiter',
        category: 'limiter',
        desc: 'Engine RPM hard cut. Raised for improved top-end performance on high-revving Toyota/Lexus engines.',
        signatures: [[0x52,0x45,0x56,0x4C,0x49,0x4D,0x01], [0x4E,0x4D,0x41,0x58,0x52,0x50,0x4D]],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'RPM',
        stage1: { addend: 200 },
        stage2: { addend: 400 },
        stage3: { addend: 500, clampMax: 9000 },
        critical: false, showPreview: false,
      },
      {
        id: 'toyota_torque_limit',
        name: 'Torque Demand Limit',
        category: 'torque',
        desc: 'Software torque ceiling. Must be raised for Stage 2/3 power gains on turbocharged Toyota applications.',
        signatures: [[0x54,0x51,0x4C,0x49,0x4D,0x01,0x00], [0x4D,0x58,0x4D,0x4F,0x4D,0x00]],
        sigOffset: 2,
        rows: 8, cols: 8, dtype: 'uint16', le: false,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.12 },
        stage2: { multiplier: 1.25 },
        stage3: { multiplier: 1.40, clampMax: 65000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── Mitsubishi CAN-bus petrol (MH820x / MH830x) ───────────────────────────
  {
    id: 'mitsubishi_can',
    name: 'Mitsubishi CAN (MH82x)',
    manufacturer: 'Mitsubishi',
    family: 'MH82x',
    // MH820x/MH830x are the actual ECU hardware variant codes embedded in calibration ID strings.
    // 'MITSUBISHI' and 'MELCO' are manufacturer names — not embedded as ASCII in ECU binaries.
    identStrings: ['MH8204', 'MH8203', 'MH8302', 'MH8301', 'MH820', 'MH830'],
    fileSizeRange: [524288, 2097152],
    vehicles: ['Mitsubishi Lancer Evo X (4B11T)', 'Mitsubishi Eclipse Cross 1.5T', 'Mitsubishi Outlander PHEV', 'Mitsubishi ASX 1.6T', 'Mitsubishi L200 2.4D (4N15)', 'Mitsubishi Pajero Sport 2.4D'],
    checksumAlgo: 'unknown',
    checksumOffset: 0,
    checksumLength: 0,
    maps: [
      {
        id: 'mitsu_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'Charge air pressure setpoint. Lancer Evo X 4B11T has excellent boost headroom — primary Stage 1/2 modification.',
        signatures: [[0x42,0x4F,0x4F,0x53,0x54,0x53,0x4F,0x4C], [0x4C,0x44,0x53,0x4F,0x4C,0x4C,0x00]],
        sigOffset: 4,
        rows: 10, cols: 14, dtype: 'uint16', le: false,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.18 },
        stage2: { multiplier: 1.32 },
        stage3: { multiplier: 1.48, clampMax: 60000 },
        critical: true, showPreview: true,
      },
      {
        id: 'mitsu_fuel_inject',
        name: 'Fuel Injection Duration',
        category: 'fuel',
        desc: 'Base injection duration. Raised to support boost increases and prevent lean conditions on tuned Evo X engines.',
        signatures: [[0x49,0x4E,0x4A,0x44,0x55,0x52,0x42,0x53], [0x46,0x55,0x45,0x4C,0x4D,0x41,0x50]],
        sigOffset: 4,
        rows: 16, cols: 16, dtype: 'uint16', le: false,
        factor: 0.001, offsetVal: 0, unit: 'ms',
        stage1: { multiplier: 1.12 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.32, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'mitsu_ignition',
        name: 'Ignition Timing Map',
        category: 'ignition',
        desc: 'Spark advance map. Advancing timing improves response — Evo X uses knock-limited timing, gains available with premium fuel.',
        signatures: [[0x4B,0x46,0x5A,0x57,0x00], [0x49,0x47,0x4E,0x42,0x41,0x53,0x45]],
        sigOffset: 2,
        rows: 16, cols: 16, dtype: 'int8', le: false,
        factor: 0.75, offsetVal: -48, unit: '°BTDC',
        stage1: { addend: 1 },
        stage2: { addend: 2 },
        stage3: { addend: 3, clampMax: 60 },
        critical: false, showPreview: true,
      },
      {
        id: 'mitsu_torque_limit',
        name: 'Torque Demand Limit',
        category: 'torque',
        desc: 'Software torque ceiling. Raised to allow power gains from increased boost and fuelling.',
        signatures: [[0x4D,0x58,0x54,0x51,0x44,0x52,0x56], [0x54,0x51,0x4C,0x49,0x4D]],
        sigOffset: 2,
        rows: 8, cols: 8, dtype: 'uint16', le: false,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.25 },
        stage2: { multiplier: 1.42 },
        stage3: { multiplier: 1.60, clampMax: 65000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── Mitsubishi Diesel CAN-bus (4N15 / 4D56) ──────────────────────────────
  {
    id: 'mitsubishi_diesel',
    name: 'Mitsubishi Diesel CAN',
    manufacturer: 'Mitsubishi',
    family: 'MH Diesel',
    // MH8105/MH8106 are the actual ECU hardware part numbers embedded in calibration IDs.
    // Engine codes (4N15/4D56/4M50) and brand names (FUSO/MELDAS) do NOT appear in ECU binary ROMs.
    // MELDAS is a Mitsubishi CNC machine system — unrelated to automotive ECUs.
    identStrings: ['MH8105', 'MH8106', 'MH8104', 'DENSO'],
    fileSizeRange: [262144, 1048576],
    vehicles: ['Mitsubishi L200 2.4D (4N15)', 'Mitsubishi Pajero 3.2D (4M41)', 'Mitsubishi Shogun Sport 2.4D', 'Mitsubishi Fuso Canter 3.0D (4P10)', 'Mitsubishi Outlander 2.2D', 'Mitsubishi Eclipse Cross 1.5D'],
    checksumAlgo: 'unknown',
    checksumOffset: 0,
    checksumLength: 0,
    maps: [
      {
        id: 'mitsu_d_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'Desired boost pressure for Mitsubishi diesel engines. L200 4N15 has substantial headroom for Stage 1 remapping.',
        signatures: [[0x4C,0x41,0x44,0x53,0x4F,0x4C,0x4C,0x00], [0x42,0x4F,0x4F,0x53,0x54,0x53]],
        sigOffset: 2,
        rows: 9, cols: 11, dtype: 'uint16', le: false,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.25 },
        stage3: { multiplier: 1.38, clampMax: 52000 },
        critical: true, showPreview: true,
      },
      {
        id: 'mitsu_d_fuel_quantity',
        name: 'Injection Quantity Map',
        category: 'fuel',
        desc: 'Base injection quantity for Mitsubishi diesel. Raising this increases torque output on L200/Pajero/Shogun.',
        signatures: [[0x4D,0x45,0x4E,0x5A,0x4B,0x00], [0x49,0x4E,0x4A,0x51,0x54,0x59]],
        sigOffset: 2,
        rows: 9, cols: 11, dtype: 'uint16', le: false,
        factor: 0.001, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.14 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.30, clampMax: 62000 },
        critical: true, showPreview: true,
      },
      {
        id: 'mitsu_d_torque_limit',
        name: 'Max Torque Limit',
        category: 'torque',
        desc: 'Torque ceiling. Must be raised to realise power gains from increased boost and fuelling on Mitsubishi diesel.',
        signatures: [[0x4D,0x58,0x4D,0x4F,0x4D,0x00], [0x54,0x51,0x4C,0x49,0x4D]],
        sigOffset: 2,
        rows: 1, cols: 8, dtype: 'uint16', le: false,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.22 },
        stage2: { multiplier: 1.35 },
        stage3: { multiplier: 1.48, clampMax: 65000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── Subaru Hitachi / Denso (EJ20 / EJ25 / FA20 / FB20) ───────────────────
  {
    id: 'subaru',
    name: 'Subaru (Hitachi/Denso)',
    manufacturer: 'Hitachi/Denso',
    family: 'Subaru',
    // WA1221/WA1222 are confirmed ROM ID prefixes embedded in Subaru Denso/Hitachi ECU calibration headers.
    // Engine codes (EJ20/EJ25/FA20/FB20/FA24), brand names (SUBARU/HITACHI), and SH chip strings
    // do NOT appear as ASCII in the binary ROM. WA1221 = Hitachi, WA1222 = Denso variant ROM IDs.
    identStrings: ['WA1221', 'WA1222', 'WA12210', 'WA12220'],
    fileSizeRange: [524288, 2097152],
    vehicles: ['Subaru Impreza WRX STI (EJ257)', 'Subaru WRX 2.5T (EJ255/EJ257)', 'Subaru BRZ 2.0 (FA20)', 'Subaru Forester XT (EJ255)', 'Subaru Legacy GT (EJ255)', 'Subaru Outback 2.5i (FB25)'],
    checksumAlgo: 'unknown',
    checksumOffset: 0,
    checksumLength: 0,
    maps: [
      {
        id: 'subaru_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'Charge air pressure setpoint. WRX STI EJ257 has proven boost headroom — primary Stage 1/2 calibration map.',
        signatures: [[0x42,0x4F,0x4F,0x53,0x54,0x4D,0x41,0x50], [0x4C,0x44,0x53,0x50,0x53,0x4F,0x4C,0x4C]],
        sigOffset: 4,
        rows: 10, cols: 14, dtype: 'uint16', le: false,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.18 },
        stage2: { multiplier: 1.32 },
        stage3: { multiplier: 1.48, clampMax: 60000 },
        critical: true, showPreview: true,
      },
      {
        id: 'subaru_fuel_inject',
        name: 'Fuel Injection Duration',
        category: 'fuel',
        desc: 'Base injection duration. Subaru boxer engines require careful fuelling — enrichment critical for Stage 2+ to avoid lean conditions.',
        signatures: [[0x49,0x4E,0x4A,0x44,0x55,0x52,0x42,0x53], [0x46,0x55,0x45,0x4C,0x50,0x57]],
        sigOffset: 4,
        rows: 16, cols: 16, dtype: 'uint16', le: false,
        factor: 0.001, offsetVal: 0, unit: 'ms',
        stage1: { multiplier: 1.12 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.32, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'subaru_ignition',
        name: 'Ignition Timing Map',
        category: 'ignition',
        desc: 'Spark advance map. Subaru EJ engines are timing-sensitive — conservative from factory on 95 RON, gains available on 98 RON.',
        signatures: [[0x4B,0x46,0x5A,0x57,0x00], [0x49,0x47,0x4E,0x4D,0x41,0x50]],
        sigOffset: 2,
        rows: 16, cols: 16, dtype: 'int8', le: false,
        factor: 0.75, offsetVal: -48, unit: '°BTDC',
        stage1: { addend: 1 },
        stage2: { addend: 2 },
        stage3: { addend: 3, clampMax: 58 },
        critical: true, showPreview: true,
      },
      {
        id: 'subaru_torque_limit',
        name: 'Torque Demand Limit',
        category: 'torque',
        desc: 'Software torque ceiling. Raised on Stage 2/3 to allow full benefit of boost and fuelling changes.',
        signatures: [[0x4D,0x58,0x54,0x51,0x44,0x52,0x56], [0x54,0x51,0x4C,0x49,0x4D]],
        sigOffset: 2,
        rows: 8, cols: 8, dtype: 'uint16', le: false,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.22 },
        stage2: { multiplier: 1.40 },
        stage3: { multiplier: 1.58, clampMax: 65000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── Ford EcoBoost T-PROT7 / T-PROT12 (1.0–2.0L petrol) ──────────────────
  {
    id: 'ford_tprot',
    name: 'Bosch T-PROT (Ford EcoBoost)',
    manufacturer: 'Bosch',
    family: 'T-PROT',
    // T-PROT7/T-PROT12 are tuner community security-level labels — NOT strings in the ECU binary.
    // ECOBOOST is a marketing name — not in the binary. GEN2F/GEN3F are internal Bosch generation
    // codes that DO appear in calibration headers. 0261S18/S19 = Bosch application part numbers.
    identStrings: ['GEN2F', 'GEN3F', '0261S18', '0261S19', '0261S20', 'MED17.0', 'ME17.0'],
    fileSizeRange: [524288, 2097152],
    vehicles: ['Ford Fiesta 1.0 EcoBoost (125/140ps)', 'Ford Focus 1.5 EcoBoost (150/182ps)', 'Ford Mondeo 1.5/2.0 EcoBoost', 'Ford Galaxy 1.5 EcoBoost', 'Ford S-Max 1.5 EcoBoost', 'Ford Puma 1.0 EcoBoost (155ps)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x1FFFF8,
    checksumLength: 4,
    maps: [
      {
        id: 'tprot_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'Charge air pressure setpoint. Ford 1.0/1.5/2.0 EcoBoost T-PROT ECUs have good boost headroom — primary Stage 1 map.',
        signatures: [[0x4C,0x44,0x4B,0x56,0x53,0x4F,0x4C,0x4C], [0x42,0x4F,0x4F,0x53,0x54,0x53,0x4F,0x4C]],
        sigOffset: 4,
        rows: 12, cols: 16, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.18 },
        stage2: { multiplier: 1.30 },
        stage3: { multiplier: 1.45, clampMax: 58000 },
        critical: true, showPreview: true,
      },
      {
        id: 'tprot_fuel_inject',
        name: 'Fuel Injection Duration',
        category: 'fuel',
        desc: 'Base injection duration. Ford EcoBoost 3-cylinder and 4-cylinder respond to fuelling increases to support boost.',
        signatures: [[0x49,0x4E,0x4A,0x44,0x55,0x52,0x42,0x53], [0x4B,0x46,0x49,0x4E,0x4A,0x44,0x55,0x52]],
        sigOffset: 4,
        rows: 16, cols: 16, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'ms',
        stage1: { multiplier: 1.12 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.32, clampMax: 60000 },
        critical: true, showPreview: true,
      },
      {
        id: 'tprot_torque_limit',
        name: 'Torque Demand Limit',
        category: 'torque',
        desc: 'Software torque ceiling. Ford EcoBoost ECU limits torque aggressively — raising this is essential for any meaningful Stage 1 gain.',
        signatures: [[0x54,0x51,0x4C,0x49,0x4D,0x01,0x00], [0x54,0x4F,0x52,0x51,0x4C,0x49,0x4D]],
        sigOffset: 2,
        rows: 8, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.28 },
        stage2: { multiplier: 1.45 },
        stage3: { multiplier: 1.62, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'tprot_ignition',
        name: 'Ignition Timing Base',
        category: 'ignition',
        desc: 'Base ignition advance. T-PROT engines respond to timing advance on premium fuel — Stage 2/3 gains on 98 RON.',
        signatures: [[0x4B,0x46,0x5A,0x57,0x42,0x41,0x53,0x45], [0x49,0x47,0x4E,0x42,0x41,0x53,0x45]],
        sigOffset: 4,
        rows: 16, cols: 16, dtype: 'int8', le: true,
        factor: 0.75, offsetVal: -48, unit: '°BTDC',
        stage1: { addend: 0 },
        stage2: { addend: 2 },
        stage3: { addend: 3, clampMax: 60 },
        critical: false, showPreview: true,
      },
    ],
  },

  // ── Ford Power Stroke diesel (6.7L V8 / 7.3L Power Stroke) ───────────────
  {
    id: 'ford_powerstroke',
    name: 'Ford Power Stroke Diesel',
    manufacturer: 'Bosch',
    family: 'Power Stroke',
    // Ford 6.7L Power Stroke uses Bosch EDC17CP05/CP65; 7.3L Scorpion uses EDC17CP65.
    // 'POWERSTROKE', 'Power Stroke', '6.7L', 'F250', 'SCORPION' are marketing/model names — not in binary.
    // EDC17CP05/CP65 are confirmed Bosch variant IDs embedded in calibration identification areas.
    identStrings: ['EDC17CP05', 'EDC17CP65', 'EDC17CP', '0281025', '0281026', '0281030'],
    fileSizeRange: [1048576, 4194304],
    vehicles: ['Ford F-250/F-350 6.7L Power Stroke (2011+)', 'Ford Transit 3.2L Power Stroke', 'Ford Ranger (US) 3.2L Power Stroke', 'Ford F-150 3.0L Power Stroke', 'Ford Excursion 7.3L Power Stroke', 'Ford Explorer 3.0L Power Stroke'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x3FFFF8,
    checksumLength: 4,
    maps: [
      {
        id: 'pstroke_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'Charge air pressure setpoint for Ford Power Stroke. 6.7L Scorpion V8 has excellent turbo headroom for truck performance tuning.',
        signatures: [[0x4C,0x41,0x44,0x53,0x4F,0x4C,0x4C,0x00], [0x42,0x4F,0x4F,0x53,0x54,0x53,0x4F,0x4C]],
        sigOffset: 2,
        rows: 10, cols: 12, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.18 },
        stage2: { multiplier: 1.30 },
        stage3: { multiplier: 1.45, clampMax: 60000 },
        critical: true, showPreview: true,
      },
      {
        id: 'pstroke_fuel_quantity',
        name: 'Injection Quantity Map',
        category: 'fuel',
        desc: 'Fuel injection quantity base map. Raising this on the 6.7L Power Stroke significantly increases torque for towing and hauling.',
        signatures: [[0x4D,0x45,0x4E,0x5A,0x4B,0x00], [0x49,0x4E,0x4A,0x51,0x54,0x59]],
        sigOffset: 2,
        rows: 10, cols: 12, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.25 },
        stage3: { multiplier: 1.35, clampMax: 62000 },
        critical: true, showPreview: true,
      },
      {
        id: 'pstroke_torque_limit',
        name: 'Torque / Power Limit',
        category: 'torque',
        desc: 'Software torque ceiling. Ford Power Stroke ECU limits torque for driveline protection — commonly raised for performance builds.',
        signatures: [[0x4D,0x58,0x4D,0x4F,0x4D,0x00], [0x54,0x51,0x4C,0x49,0x4D]],
        sigOffset: 2,
        rows: 1, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.22 },
        stage2: { multiplier: 1.38 },
        stage3: { multiplier: 1.55, clampMax: 65000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── VAG DSG / CVT / ZF 8HP Gearbox TCU ───────────────────────────────────
  {
    id: 'vag_dsg',
    name: 'VAG DSG / ZF 8HP TCU',
    manufacturer: 'Bosch/ZF',
    family: 'DSG/TCU',
    // Short strings (8HP, DSG, 0AM, 0GC, 0BH) removed — 3 chars, match randomly in any 2MB binary.
    identStrings: ['DQ250', 'DQ380', 'DQ381', 'DQ500', 'ZF8HP', 'ZF6HP', 'S-TRONIC', 'DQ200', 'DQ500MQ'],
    fileSizeRange: [524288, 2097152],
    vehicles: ['VW Golf R / GTI DSG (DQ250/DQ381)', 'Audi S3/RS3 S-Tronic (DQ381/DQ500)', 'VW Passat 4Motion (DQ500)', 'Audi A4/A5/A6 S-Tronic', 'Porsche Panamera ZF 8HP', 'Audi Q7/Q8 ZF 8HP'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0xFFFF8,
    checksumLength: 4,
    maps: [
      {
        id: 'dsg_shift_pressure',
        name: 'Shift Pressure Map',
        category: 'torque',
        desc: 'Hydraulic shift pressure map. Raising this firms up gear changes and reduces clutch slip under high torque — essential for Stage 2+ engine tunes.',
        signatures: [[0x53,0x48,0x49,0x46,0x54,0x50,0x52,0x53], [0x4B,0x4C,0x44,0x52,0x55,0x43,0x4B]],
        sigOffset: 2,
        rows: 8, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.10 },
        stage2: { multiplier: 1.20 },
        stage3: { multiplier: 1.30, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'dsg_torque_limit',
        name: 'Gearbox Torque Limit',
        category: 'torque',
        desc: 'Gearbox input torque protection limit. Must be raised to match engine tune — otherwise gearbox ECU will restrict engine torque delivery.',
        signatures: [[0x54,0x51,0x47,0x42,0x4C,0x49,0x4D], [0x4D,0x58,0x54,0x51,0x47,0x42]],
        sigOffset: 2,
        rows: 1, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.20 },
        stage2: { multiplier: 1.35 },
        stage3: { multiplier: 1.52, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'dsg_launch_rpm',
        name: 'Launch Control RPM',
        category: 'misc',
        desc: 'DSG launch control RPM hold point. Raising this builds more boost before clutch release — faster 0–60 times.',
        signatures: [[0x4C,0x41,0x55,0x4E,0x43,0x48,0x52,0x50,0x4D], [0x4C,0x41,0x55,0x4E,0x43,0x48]],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'RPM',
        stage1: { addend: 200 },
        stage2: { addend: 400 },
        stage3: { addend: 600, clampMax: 4500 },
        critical: false, showPreview: false,
      },
    ],
  },

  // ── VAG Delphi DCM6.2 (VW/Audi 1.6 TDI / 2.0 TDI) ───────────────────────
  {
    id: 'vag_dcm62',
    name: 'Delphi DCM6.2 (VAG TDI)',
    manufacturer: 'Delphi',
    family: 'DCM6.2',
    identStrings: ['DCM6.2', 'DCM62', 'DCM6.2A', 'DCM7.1', 'EA288', 'CLHA', 'CRKB'],
    fileSizeRange: [524288, 2097152],
    vehicles: ['VW Golf Mk7 1.6 TDI', 'VW Passat B8 1.6 TDI', 'Audi A3 1.6 TDI (2013+)', 'Skoda Octavia 1.6 TDI (2013+)', 'Seat Leon 1.6 TDI', 'VW Tiguan 2.0 TDI (2017+)'],
    checksumAlgo: 'unknown',
    checksumOffset: 0,
    checksumLength: 0,
    maps: [
      {
        id: 'dcm62_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'Charge air pressure setpoint for Delphi DCM6.2. VW/Audi 1.6 TDI EA288 has headroom from the detuned factory calibration.',
        signatures: [[0x4C,0x41,0x44,0x53,0x4F,0x4C,0x4C,0x00], [0x4C,0x44,0x53,0x4F,0x4C,0x4C,0x00]],
        sigOffset: 2,
        rows: 9, cols: 12, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.25 },
        stage3: { multiplier: 1.38, clampMax: 52000 },
        critical: true, showPreview: true,
      },
      {
        id: 'dcm62_fuel_quantity',
        name: 'Injection Quantity Map',
        category: 'fuel',
        desc: 'Fuel injection quantity base map. Increasing this on the 1.6 TDI unlocks torque that the factory calibration deliberately caps.',
        signatures: [[0x4D,0x45,0x4E,0x5A,0x4B,0x00], [0x4B,0x46,0x4D,0x53,0x4E,0x57]],
        sigOffset: 2,
        rows: 9, cols: 12, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.30, clampMax: 62000 },
        critical: true, showPreview: true,
      },
      {
        id: 'dcm62_torque_limit',
        name: 'Max Torque Limit',
        category: 'torque',
        desc: 'Software torque ceiling. Raised to match fuel and boost increases — DCM6.2 torque limit is the primary bottleneck on stock hardware.',
        signatures: [[0x4D,0x58,0x4D,0x4F,0x4D,0x00], [0x54,0x51,0x4C,0x49,0x4D]],
        sigOffset: 2,
        rows: 1, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.22 },
        stage2: { multiplier: 1.35 },
        stage3: { multiplier: 1.50, clampMax: 65000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── Mercedes-Benz CRD3 / CRD3P diesel (OM654 / OM651) ────────────────────
  {
    id: 'mercedes_crd3',
    name: 'Mercedes CRD3/CRD3P',
    manufacturer: 'Continental',
    family: 'CRD3',
    identStrings: ['CRD3', 'CRD3P', 'CRD3.10', 'CRD3.20', 'OM651', 'OM642', 'A0009008700'],
    fileSizeRange: [1048576, 4194304],
    vehicles: ['Mercedes C220d / C250d (OM651)', 'Mercedes E220d / E250d (OM651)', 'Mercedes GLC 220d (OM654)', 'Mercedes A200d / B200d (OM651)', 'Mercedes Sprinter 2.2 CDI (OM651)', 'Mercedes V-Class 2.2 CDI (OM651)'],
    checksumAlgo: 'continental-crc',
    checksumOffset: 0x3FFFF0,
    checksumLength: 4,
    maps: [
      {
        id: 'merc_crd3_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'Charge air pressure setpoint for Mercedes CDI/CRD3. OM651 and OM654 both have significant headroom over stock boost calibrations.',
        signatures: [[0x4C,0x41,0x44,0x53,0x4F,0x4C,0x4C,0x00], [0x42,0x4F,0x4F,0x53,0x54,0x53,0x4F,0x4C]],
        sigOffset: 2,
        rows: 10, cols: 14, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.25 },
        stage3: { multiplier: 1.38, clampMax: 56000 },
        critical: true, showPreview: true,
      },
      {
        id: 'merc_crd3_fuel_quantity',
        name: 'Injection Quantity Map',
        category: 'fuel',
        desc: 'Fuel injection quantity for Mercedes CDI. Increasing this raises torque — OM651 responds particularly well to fuelling increases.',
        signatures: [[0x4D,0x45,0x4E,0x5A,0x4B,0x00], [0x4B,0x46,0x4D,0x53,0x4E,0x57]],
        sigOffset: 2,
        rows: 10, cols: 14, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.14 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.30, clampMax: 62000 },
        critical: true, showPreview: true,
      },
      {
        id: 'merc_crd3_torque_limit',
        name: 'Torque Demand Limit',
        category: 'torque',
        desc: 'Software torque ceiling. Mercedes deliberately limits torque output via software — raising this unlocks significant hidden performance.',
        signatures: [[0x4D,0x58,0x4D,0x4F,0x4D,0x00], [0x54,0x51,0x4C,0x49,0x4D]],
        sigOffset: 2,
        rows: 1, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.20 },
        stage2: { multiplier: 1.35 },
        stage3: { multiplier: 1.50, clampMax: 65000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── Jeep / FCA / Stellantis EDC17 (Wrangler / Grand Cherokee diesel) ──────
  {
    id: 'jeep_edc17',
    name: 'Bosch EDC17 (Jeep/FCA)',
    manufacturer: 'Bosch',
    family: 'EDC17 FCA',
    identStrings: ['EDC17C49', 'EDC17C69', 'EDC17C79', 'VM2.8', '0281033', '0281034'],
    fileSizeRange: [1048576, 4194304],
    vehicles: ['Jeep Wrangler 2.8 CRD (VM Motori)', 'Jeep Grand Cherokee 3.0 CRD (OM642)', 'Fiat Ducato 2.3 Multijet', 'Alfa Romeo Stelvio 2.2 JTD', 'Alfa Romeo Giulia 2.2 JTD', 'Fiat 500X 1.6 Multijet'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x3FFFF8,
    checksumLength: 4,
    maps: [
      {
        id: 'fca_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'Charge air pressure setpoint for FCA diesel applications. Jeep/Alfa CRD engines have significant turbo headroom over factory calibration.',
        signatures: [[0x4C,0x41,0x44,0x53,0x4F,0x4C,0x4C,0x00], [0x42,0x4F,0x4F,0x53,0x54,0x53,0x4F,0x4C]],
        sigOffset: 2,
        rows: 10, cols: 14, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.28 },
        stage3: { multiplier: 1.42, clampMax: 56000 },
        critical: true, showPreview: true,
      },
      {
        id: 'fca_fuel_quantity',
        name: 'Injection Quantity Map',
        category: 'fuel',
        desc: 'Fuel injection quantity for FCA/VM Motori diesel. Increasing this raises torque on Wrangler/Grand Cherokee and Alfa diesel variants.',
        signatures: [[0x4D,0x45,0x4E,0x5A,0x4B,0x00], [0x49,0x4E,0x4A,0x51,0x54,0x59]],
        sigOffset: 2,
        rows: 10, cols: 14, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.14 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.30, clampMax: 62000 },
        critical: true, showPreview: true,
      },
      {
        id: 'fca_torque_limit',
        name: 'Torque Demand Limit',
        category: 'torque',
        desc: 'Software torque ceiling. Raised to match fuel and boost increases on FCA platform diesel engines.',
        signatures: [[0x4D,0x58,0x4D,0x4F,0x4D,0x00], [0x54,0x51,0x4C,0x49,0x4D]],
        sigOffset: 2,
        rows: 1, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.22 },
        stage2: { multiplier: 1.38 },
        stage3: { multiplier: 1.55, clampMax: 65000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── PSA / Stellantis DCM6.2 (Peugeot/Citroën 2.0 BlueHDi) ───────────────
  {
    id: 'psa_dcm62',
    name: 'Delphi DCM6.2 (PSA/Stellantis)',
    manufacturer: 'Delphi',
    family: 'PSA DCM6.2',
    identStrings: ['DCM6.2A', 'DCM6.2C', 'DCM6.2', 'DCM62', 'DW10F', 'DW12C'],
    fileSizeRange: [524288, 2097152],
    vehicles: ['Peugeot 508 2.0 BlueHDi 180', 'Citroën C5 Aircross 2.0 BlueHDi', 'Peugeot 3008/5008 2.0 BlueHDi', 'DS7 Crossback 2.0 BlueHDi', 'Peugeot Expert 2.0 BlueHDi', 'Citroën SpaceTourer 2.0 BlueHDi'],
    checksumAlgo: 'unknown',
    checksumOffset: 0,
    checksumLength: 0,
    maps: [
      {
        id: 'psa_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'Charge air pressure setpoint. PSA 2.0 BlueHDi DW10 engine has substantial turbo headroom beyond factory calibration.',
        signatures: [[0x4C,0x41,0x44,0x53,0x4F,0x4C,0x4C,0x00], [0x42,0x4F,0x4F,0x53,0x54,0x53,0x4F,0x4C]],
        sigOffset: 2,
        rows: 9, cols: 12, dtype: 'uint16', le: false,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.25 },
        stage3: { multiplier: 1.38, clampMax: 54000 },
        critical: true, showPreview: true,
      },
      {
        id: 'psa_fuel_quantity',
        name: 'Injection Quantity Map',
        category: 'fuel',
        desc: 'Fuel injection quantity for PSA BlueHDi applications. Increasing this delivers significant torque gains on DW10/DW12 engines.',
        signatures: [[0x4D,0x45,0x4E,0x5A,0x4B,0x00], [0x45,0x49,0x4E,0x53,0x50,0x52,0x5A]],
        sigOffset: 2,
        rows: 9, cols: 12, dtype: 'uint16', le: false,
        factor: 0.001, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.14 },
        stage2: { multiplier: 1.20 },
        stage3: { multiplier: 1.28, clampMax: 62000 },
        critical: true, showPreview: true,
      },
      {
        id: 'psa_torque_limit',
        name: 'Max Torque Limit',
        category: 'torque',
        desc: 'Software torque ceiling for PSA DCM6.2. Raised alongside fuel and boost — PSA deliberately undersells these engines.',
        signatures: [[0x4D,0x58,0x4D,0x4F,0x4D,0x00], [0x54,0x51,0x4C,0x49,0x4D]],
        sigOffset: 2,
        rows: 1, cols: 8, dtype: 'uint16', le: false,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.22 },
        stage2: { multiplier: 1.35 },
        stage3: { multiplier: 1.50, clampMax: 65000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── Renault DC4 (Clio RS / Mégane RS TCe petrol) ──────────────────────────
  {
    id: 'renault_dc4',
    name: 'Renault DC4 (RS Petrol)',
    manufacturer: 'Continental',
    family: 'DC4',
    identStrings: ['DC4', 'M5P', 'M5MT', 'M5PT', '0261S16', '0261S17', 'S101'],
    fileSizeRange: [524288, 2097152],
    vehicles: ['Renault Mégane RS 300 Trophy (1.8T M5P)', 'Renault Mégane RS 280 Cup (1.8T M5P)', 'Renault Clio RS 200 EDC (1.6T)', 'Renault Zoe (motor calibration)', 'Alpine A110 1.8T M5P (300ps)', 'Alpine A110S 1.8T M5P (252ps)'],
    checksumAlgo: 'continental-crc',
    checksumOffset: 0x7FFF0,
    checksumLength: 4,
    maps: [
      {
        id: 'dc4_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'Charge air pressure setpoint. Renault M5P 1.8T in Mégane RS and Alpine A110 has excellent boost headroom — proven Stage 1 gains.',
        signatures: [[0x4C,0x44,0x4B,0x56,0x53,0x4F,0x4C,0x4C], [0x42,0x4F,0x4F,0x53,0x54,0x53,0x4F,0x4C]],
        sigOffset: 4,
        rows: 12, cols: 16, dtype: 'uint16', le: false,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.28 },
        stage3: { multiplier: 1.42, clampMax: 60000 },
        critical: true, showPreview: true,
      },
      {
        id: 'dc4_fuel_inject',
        name: 'Fuel Injection Duration',
        category: 'fuel',
        desc: 'Base injection duration. Raised to match boost increases on Mégane RS / Alpine A110 M5P engine.',
        signatures: [[0x49,0x4E,0x4A,0x44,0x55,0x52,0x42,0x53], [0x4B,0x46,0x41,0x4E,0x50,0x41,0x53,0x53]],
        sigOffset: 4,
        rows: 16, cols: 16, dtype: 'uint16', le: false,
        factor: 0.001, offsetVal: 0, unit: 'ms',
        stage1: { multiplier: 1.12 },
        stage2: { multiplier: 1.20 },
        stage3: { multiplier: 1.30, clampMax: 60000 },
        critical: true, showPreview: true,
      },
      {
        id: 'dc4_torque_limit',
        name: 'Torque Demand Limit',
        category: 'torque',
        desc: 'Software torque ceiling. Raised to allow Stage 1/2 power gains on Renault RS performance models.',
        signatures: [[0x54,0x51,0x4C,0x49,0x4D,0x01,0x00], [0x4D,0x58,0x54,0x51,0x44,0x52,0x56]],
        sigOffset: 2,
        rows: 8, cols: 8, dtype: 'uint16', le: false,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.20 },
        stage2: { multiplier: 1.35 },
        stage3: { multiplier: 1.52, clampMax: 65000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── Nissan Bosch ME7.9.20 (350Z / Skyline / Patrol petrol) ───────────────
  {
    id: 'nissan_me7',
    name: 'Bosch ME7.9 (Nissan)',
    manufacturer: 'Bosch',
    family: 'Nissan ME7',
    identStrings: ['ME7.9.20', 'ME7.9', 'ME79', '0261208', '0261S00', '0261S01'],
    fileSizeRange: [524288, 2097152],
    vehicles: ['Nissan 350Z 3.5 V6 (VQ35DE)', 'Nissan 370Z 3.7 V6 (VQ37VHR)', 'Nissan Skyline V35/V36 (VQ35/VQ37)', 'Nissan GT-R R34 (RB26DETT)', 'Nissan Patrol 5.6 V8 (VK56)', 'Nissan Stagea 2.5T (RB25DET)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0xFFFF8,
    checksumLength: 4,
    maps: [
      {
        id: 'nissan_fuel_inject',
        name: 'Fuel Injection Map',
        category: 'fuel',
        desc: 'Base injection duration vs RPM and load. Primary calibration map for Nissan VQ/RB engines — enrichment improves power under high load.',
        signatures: [[0x49,0x4E,0x4A,0x44,0x55,0x52,0x42,0x53], [0x46,0x55,0x45,0x4C,0x4D,0x41,0x50]],
        sigOffset: 4,
        rows: 16, cols: 16, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'ms',
        stage1: { multiplier: 1.08 },
        stage2: { multiplier: 1.14 },
        stage3: { multiplier: 1.22, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'nissan_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'Boost pressure setpoint for turbocharged Nissan applications (RB26DETT etc.). Significant headroom over conservative factory maps.',
        signatures: [[0x42,0x4F,0x4F,0x53,0x54,0x4D,0x41,0x50], [0x4C,0x44,0x53,0x4F,0x4C,0x4C,0x00]],
        sigOffset: 4,
        rows: 10, cols: 14, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.18 },
        stage2: { multiplier: 1.32 },
        stage3: { multiplier: 1.48, clampMax: 58000 },
        critical: true, showPreview: true,
      },
      {
        id: 'nissan_ignition',
        name: 'Ignition Timing Map',
        category: 'ignition',
        desc: 'Spark advance vs RPM and load. VQ35/VQ37 and RB engines respond to timing advance — primary NA Stage 1 tuning map.',
        signatures: [[0x4B,0x46,0x5A,0x57,0x42,0x41,0x53,0x45], [0x49,0x47,0x4E,0x42,0x41,0x53,0x45]],
        sigOffset: 4,
        rows: 16, cols: 16, dtype: 'int8', le: true,
        factor: 0.75, offsetVal: -48, unit: '°BTDC',
        stage1: { addend: 2 },
        stage2: { addend: 3 },
        stage3: { addend: 4, clampMax: 70 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── Bosch MSD80 / MSD85 (BMW N54 / N55 twin-turbo petrol) ───────────────────
  {
    id: 'bmw_msd',
    name: 'Bosch MSD80/MSD85 (BMW N54/N55)',
    manufacturer: 'Bosch',
    family: 'MSD80',
    // MSD80/85 are Infineon Tricore-based (N54=TC1796, N55=TC1797).
    // MSD variant codes ARE embedded in BMW calibration identification sectors.
    // No DAMOS symbol names in ROM — map extraction via A2L or DRT required.
    // MSV80/MSV85 cover the N43/N52/N53 naturally-aspirated variants.
    identStrings: ['MSD80', 'MSD85', 'MSD87', 'MSV80', 'MSV85', 'MSV87', 'MSD8', 'MSV8'],
    fileSizeRange: [524288, 4194304],   // TC1796=2MB, TC1797=4MB
    vehicles: ['BMW 335i/335is (E90/E92/E93 N54)', 'BMW 135i (E82/E88 N54)', 'BMW 535i (E60/E61 N54)', 'BMW Z4 35i (E89 N54)', 'BMW 335i/435i (F30/F32 N55)', 'BMW M135i/M235i (F20/F22 N55)', 'BMW 320i/328i/420i (N20 turbo)', 'BMW 520i/528i (F10 N20)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x1FFFF8,
    checksumLength: 4,
    maps: [
      {
        id: 'msd_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'Charge air pressure setpoint. BMW N54 twin-turbo has enormous boost headroom from the factory detuned calibration — primary Stage 1/2 map.',
        signatures: [[0x4C,0x44,0x4B,0x56,0x53,0x4F,0x4C,0x4C], [0x42,0x4F,0x4F,0x53,0x54,0x53,0x4F,0x4C]],
        sigOffset: 4,
        rows: 12, cols: 16, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.22 },
        stage2: { multiplier: 1.40 },
        stage3: { multiplier: 1.58, clampMax: 62000 },
        critical: true, showPreview: true,
      },
      {
        id: 'msd_fuel_inject',
        name: 'Fuel Injection Quantity',
        category: 'fuel',
        desc: 'Base injection quantity map. N54/N55 use high-pressure direct injection — raising this supports the significant boost increases possible on these engines.',
        signatures: [[0x49,0x4E,0x4A,0x44,0x55,0x52,0x42,0x53], [0x4B,0x46,0x49,0x4E,0x4A,0x44,0x55,0x52]],
        sigOffset: 4,
        rows: 16, cols: 16, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.28 },
        stage3: { multiplier: 1.40, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'msd_torque_limit',
        name: 'Torque Demand Limit',
        category: 'torque',
        desc: 'Software torque ceiling. BMW MSD80/85 has multiple torque limits — raising the primary demand limit is essential for Stage 1+.',
        signatures: [[0x54,0x51,0x4C,0x49,0x4D,0x01,0x00], [0x4D,0x58,0x4D,0x4F,0x4D,0x00]],
        sigOffset: 2,
        rows: 8, cols: 12, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.20 },
        stage2: { multiplier: 1.38 },
        stage3: { multiplier: 1.55, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'msd_ignition',
        name: 'Ignition Timing Map',
        category: 'ignition',
        desc: 'Base ignition advance map. N54/N55 runs conservatively on 95 RON — timing gains available on 98/100 RON fuel, critical for Stage 2+ power.',
        signatures: [[0x4B,0x46,0x5A,0x57,0x42,0x41,0x53,0x45], [0x49,0x47,0x4E,0x42,0x41,0x53,0x45]],
        sigOffset: 4,
        rows: 16, cols: 16, dtype: 'int8', le: true,
        factor: 0.75, offsetVal: -48, unit: '°BTDC',
        stage1: { addend: 0 },
        stage2: { addend: 2 },
        stage3: { addend: 3, clampMax: 62 },
        critical: false, showPreview: true,
      },
      {
        id: 'msd_rev_limit',
        name: 'Rev Limiter',
        category: 'limiter',
        desc: 'Engine RPM hard cut. N54/N55 factory limit is conservative for the engine capability — often raised on track applications.',
        signatures: [[0x4E,0x4D,0x41,0x58,0x42,0x45,0x47,0x52], [0x52,0x45,0x56,0x4C,0x49,0x4D]],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'RPM',
        stage1: { addend: 200 },
        stage2: { addend: 400 },
        stage3: { addend: 500, clampMax: 8000 },
        critical: false, showPreview: false,
      },
    ],
  },

  // ── Siemens/Continental MS43 / MS45 (BMW E46 / E39 M52TU / M54) ──────────────
  {
    id: 'bmw_ms43',
    name: 'Siemens MS43/MS45 (BMW M54)',
    manufacturer: 'Siemens/Continental',
    family: 'MS43',
    // MS43/MS45 = BMW E46 (318i/320i/325i/330i) and E39 520i/525i/530i — M52TU/M54 engines.
    // CPU: Infineon C167CR_SR at 24 MHz. 512KB flash. Software version MS430069 (latest).
    // MS43 embeds calibration variant code ('MS43') and DAMOS-style symbol names.
    // IMPORTANT DISTINCTION: BMW M3 E46 (S54 engine) uses Siemens MSS54 — completely different ECU.
    // MS45 is the late M54 variant (2003+ E46 330i), NOT the M3. Do not confuse MS45 with MSS54/MSS54HP.
    // CHECKSUM: CORRECTED — MS43 has 5 checksums total (NOT 13):
    //   2× 32-bit addition checksums (verify _mon system monitoring parameter area)
    //   3× CRC16 checksums (verify boot section, program section, and calibration section)
    //   Correction order: addition checksums FIRST, then CRC16 (addition data lies inside CRC16 region).
    //   Tools: MS4X Flasher (open-source, github.com/ms4x-net/ms4x_flasher), WinOLS+Ultimo,
    //   BimmerEditor (bmweditor.com), RomRaider + ba114 XML (github.com/ba114/Siemens-MS43).
    // Source: ms4x.net wiki; ba114/Siemens-MS43 GitHub; ms4x-net/ms4x_flasher.
    identStrings: ['MS43', 'MS45', 'MS41', 'MS42', 'MS43.1', 'MS45.1', 'SIEMENS'],
    fileSizeRange: [131072, 524288],   // 128KB–512KB flash
    vehicles: ['BMW 318i/320i (E46 M52TU/N42)', 'BMW 325i/330i (E46 M54)', 'BMW 318i/320i/325i (E36 M52)', 'BMW 520i/525i/530i (E39 M54)', 'BMW Z3/Z4 2.5i/3.0i (M54)', 'BMW X5 3.0i (E53 M54)'],
    checksumAlgo: 'unknown',   // 5 checksums (2× addition + 3× CRC16) — use MS4X Flasher (open-source) or WinOLS+Ultimo
    checksumOffset: 0x7FFF8,
    checksumLength: 4,
    maps: [
      {
        id: 'ms43_ignition',
        name: 'Ignition Timing Map (ip_igab__n__maf)',
        category: 'ignition',
        desc: 'Primary part/full-load ignition advance map (ip_igab__n__maf). BMW M52TU/M54 inline-6 responds well to timing advance on 98 RON — main Stage 1 NA modification. MS43 uses multiple ignition tables (part-load/WOT × VANOS active/inactive). CRITICAL: Load axis = mg/stroke (x×0.04239 expression) — NOT MAP or TPS. Stock load range: 0–1389 mg/stroke. Factor 0.75°/LSB, offset -48° (raw 0 = -48° BTDC). CORRECTED DIMENSIONS: 16 load cols × 20 RPM rows (was 16×16). Confirmed by ba114/Siemens-MS43 RomRaider XML (ip_igab__n__maf entry) and ms4x.net wiki community definitions. Stage 1 gains: advance 2–3° at mid-load on 98 RON.',
        signatures: [[0x4B,0x46,0x5A,0x57,0x00], [0x4B,0x46,0x5A,0x57,0x32,0x00]],
        sigOffset: 0,
        // CORRECTED: rows:20, cols:16 — main map is 16 load columns × 20 RPM rows.
        // Source: ba114/Siemens-MS43 ECU Definitions XML, ms4x.net ip_igab__n__maf entry.
        // Idle ignition map (ip_igab_is__n__maf) is a separate smaller table: 12 cols × 16 rows.
        // Our single map definition targets the main part/full-load table only.
        rows: 20, cols: 16, dtype: 'int8', le: false,
        factor: 0.75, offsetVal: -48, unit: '°BTDC',
        stage1: { addend: 2 },
        stage2: { addend: 3 },
        stage3: { addend: 4, clampMax: 70 },
        addonOverrides: {
          popcorn: { addend: -20, clampMin: 0, lastNCols: 2 },
        },
        critical: true, showPreview: true,
      },
      {
        id: 'ms43_fuel_map',
        name: 'Load/Fuel Volumetric Efficiency',
        category: 'fuel',
        desc: 'Volumetric efficiency (KFNWUL) / load table. Adjusting this improves fuelling accuracy post air-intake or exhaust modification.',
        signatures: [[0x4B,0x46,0x4E,0x57,0x55,0x4C,0x00], [0x4B,0x46,0x4C,0x55,0x46,0x54,0x00]],
        sigOffset: 0,
        rows: 16, cols: 16, dtype: 'uint16', le: false,
        factor: 0.001, offsetVal: 0, unit: 'load',
        stage1: { multiplier: 1.05 },
        stage2: { multiplier: 1.10 },
        stage3: { multiplier: 1.15, clampMax: 65000 },
        critical: false, showPreview: true,
      },
      {
        id: 'ms43_rev_limit',
        name: 'Rev Limiter (NMAXBEGR)',
        category: 'limiter',
        desc: 'Engine RPM hard cut. M54 factory limit is conservative — commonly raised to 7200+ RPM for track use on healthy engines.',
        signatures: [[0x4E,0x4D,0x41,0x58,0x42,0x45,0x47,0x52], [0x52,0x45,0x56,0x4C,0x49,0x4D]],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'RPM',
        stage1: { addend: 300 },
        stage2: { addend: 500 },
        stage3: { addend: 700, clampMax: 8500 },
        addonOverrides: {
          launchcontrol: { multiplier: 0, addend: 3500, clampMax: 4000 },
          revlimit: { addend: 400, clampMax: 7800 },
        },
        critical: false, showPreview: false,
      },
      {
        id: 'ms43_speed_limit',
        name: 'Vehicle Speed Limiter',
        category: 'limiter',
        desc: 'Factory vehicle speed limit for BMW MS43 (M54 engine). Stock E46/E39/Z3/Z4 with M54 is limited to 250 km/h electronically. Symbol: VMAX / NMAXVMAX / VehSpd_vMaxLim. Removing allows access to the true aerodynamic top speed.',
        signatures: [
          [0x56,0x4D,0x41,0x58,0x00],                    // "VMAX\0"
          [0x4E,0x4D,0x41,0x58,0x56,0x4D,0x41,0x58],    // "NMAXVMAX"
        ],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'km/h',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: {
          speedlimiter: { multiplier: 0, addend: 65535 },
        },
        critical: false, showPreview: false,
      },
      {
        id: 'ms43_vanos',
        name: 'VANOS Cam Timing Map (IP_CAM_SP)',
        category: 'misc',
        desc: 'VANOS camshaft timing setpoint maps (IP_CAM_SP_tco_1_IN/EX_IS/PL/FL). MS43 controls BOTH intake and exhaust VANOS with 6 condition-specific tables: idle speed (IS), part-load (PL) and full-load (FL) × intake (IN) and exhaust (EX). Full-load VANOS switches via MAF threshold (id_maf_fl_ivvt__n scalar) — NOT pedal position. Widening this threshold expands full-load VANOS authority for modified engines. Load axis: mg/stroke (same as ignition). CORRECTED: 6 maps total (not 8) — confirmed ms4x.net IP_CAM_SP symbol structure and ba114/Siemens-MS43 XML. Advancing VANOS on M54 improves mid-range torque and top-end power on 98 RON.',
        signatures: [[0x4B,0x46,0x56,0x41,0x4E,0x4F,0x53], [0x56,0x41,0x4E,0x4F,0x53,0x41,0x44,0x56]],
        sigOffset: 2,
        rows: 8, cols: 12, dtype: 'uint8', le: false,
        factor: 1, offsetVal: -60, unit: '°cam',
        stage1: { addend: 0 },
        stage2: { addend: 2 },
        stage3: { addend: 3, clampMax: 50 },
        critical: false, showPreview: true,
      },
    ],
  },

  // ── Magneti Marelli IAW (Fiat / Alfa Romeo / Lancia petrol) ─────────────────
  {
    id: 'marelli_iaw',
    name: 'Magneti Marelli IAW (Fiat/Alfa/Lancia)',
    manufacturer: 'Magneti Marelli',
    family: 'IAW',
    // IAW variant codes ARE embedded as ASCII in Marelli calibration ROM headers.
    // IAW4GV = Alfa 147/156/GT, Fiat Stilo 1.8/2.0 (ST10F/MC912-based, DAMOS symbols present).
    // IAW5NF/6F = Fiat Bravo/Punto 1.4T MultiAir (SPC5566, no embedded symbols).
    // IAW7GF/7GFA = Alfa Giulietta 1.4T, Fiat 500 Abarth 1.4T (SPC5566/TC1724).
    identStrings: ['IAW4GV', 'IAW5F', 'IAW5NF', 'IAW6F', 'IAW7GF', 'IAW7GFA', 'IAW8F', 'IAW4', 'IAW5', 'IAW6', 'IAW7'],
    fileSizeRange: [131072, 2097152],   // 128KB (IAW4GV) – 2MB (IAW7GF+)
    vehicles: ['Alfa Romeo 147/156/GT 1.8/2.0 TS (IAW4GV)', 'Fiat Stilo 1.8/2.0 (IAW4GV/5F)', 'Fiat Bravo 1.4T 150hp (IAW6F)', 'Fiat Punto Evo 1.4T Abarth (IAW5NF)', 'Alfa Romeo MiTo 1.4T (IAW5NF/6F)', 'Alfa Romeo Giulietta 1.4T 120/170hp (IAW7GF)', 'Fiat 500 Abarth 1.4T 135/160hp (IAW7GF/7GFA)', 'Lancia Delta 1.4T (IAW7GF)', 'Fiat 500 Abarth 595 (IAW8F)'],
    checksumAlgo: 'unknown',
    checksumOffset: 0,
    checksumLength: 0,
    maps: [
      {
        id: 'iaw_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'Charge air pressure setpoint. Fiat 1.4 MultiAir Turbo (IAW5NF/7GF) has excellent boost response — primary Stage 1 map on Abarth applications.',
        signatures: [[0x4C,0x44,0x4B,0x56,0x53,0x4F,0x4C,0x4C], [0x42,0x4F,0x4F,0x53,0x54,0x53,0x4F,0x4C]],
        sigOffset: 4,
        rows: 10, cols: 14, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.18 },
        stage2: { multiplier: 1.32 },
        stage3: { multiplier: 1.48, clampMax: 55000 },
        critical: true, showPreview: true,
      },
      {
        id: 'iaw_fuel_inject',
        name: 'Fuel Injection Duration',
        category: 'fuel',
        desc: 'Base injection duration map. IAW naturally-aspirated engines (147/156/GT) gain from fuelling adjustment to complement intake/exhaust modifications.',
        signatures: [[0x49,0x4E,0x4A,0x44,0x55,0x52,0x42,0x53], [0x46,0x55,0x45,0x4C,0x4D,0x41,0x50]],
        sigOffset: 4,
        rows: 16, cols: 16, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'ms',
        stage1: { multiplier: 1.08 },
        stage2: { multiplier: 1.15 },
        stage3: { multiplier: 1.22, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'iaw_ignition',
        name: 'Ignition Timing Map',
        category: 'ignition',
        desc: 'Spark advance map. Alfa Romeo 147/156 twin-spark engines have timing headroom on 98 RON — significant NA gains available with careful advance.',
        signatures: [[0x49,0x47,0x4E,0x4D,0x41,0x50,0x00], [0x4B,0x46,0x5A,0x57,0x00]],
        sigOffset: 2,
        rows: 16, cols: 16, dtype: 'int8', le: true,
        factor: 0.75, offsetVal: -48, unit: '°BTDC',
        stage1: { addend: 2 },
        stage2: { addend: 3 },
        stage3: { addend: 4, clampMax: 68 },
        critical: true, showPreview: true,
      },
      {
        id: 'iaw_torque_limit',
        name: 'Torque Demand Limit',
        category: 'torque',
        desc: 'Software torque ceiling. Must be raised on turbocharged IAW applications (Abarth/Giulietta 1.4T) to allow full Stage 1/2 power gains.',
        signatures: [[0x54,0x51,0x4C,0x49,0x4D,0x01,0x00], [0x4D,0x58,0x4D,0x4F,0x4D,0x00]],
        sigOffset: 2,
        rows: 8, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.18 },
        stage2: { multiplier: 1.32 },
        stage3: { multiplier: 1.48, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'iaw_rev_limit',
        name: 'Rev Limiter',
        category: 'limiter',
        desc: 'Engine RPM hard cut. Alfa Romeo twin-spark engines rev freely — raising the limiter benefits naturally-aspirated builds.',
        signatures: [[0x52,0x45,0x56,0x4C,0x49,0x4D,0x01], [0x4E,0x4D,0x41,0x58,0x52,0x50,0x4D]],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'RPM',
        stage1: { addend: 200 },
        stage2: { addend: 400 },
        stage3: { addend: 500, clampMax: 8500 },
        critical: false, showPreview: false,
      },
    ],
  },

  // ── Delphi CRD2.x (Fiat / Opel / Suzuki 1.3–1.9 diesel) ────────────────────
  {
    id: 'delphi_crd2',
    name: 'Delphi CRD2.x (1.3–1.9 diesel)',
    manufacturer: 'Delphi',
    family: 'CRD2',
    // CRD2.x variant codes ARE embedded in calibration identification area.
    // CRD2.1x / CRD2.2x / CRD2.3x / CRD2.6x cover 1.3 JTD/CDTi and 1.9 JTD variants.
    // HC12/HCS12X or ST10-based MCU (~256KB–512KB flash).
    identStrings: ['CRD2.1', 'CRD2.2', 'CRD2.3', 'CRD2.6', 'CRD2'],
    fileSizeRange: [131072, 524288],   // 128KB – 512KB
    vehicles: ['Fiat Punto 1.3 JTD (199)', 'Fiat 500 1.3 JTD', 'Fiat Panda 1.3 JTD', 'Fiat Doblo 1.3 JTD', 'Opel/Vauxhall Corsa D 1.3 CDTi', 'Opel/Vauxhall Astra H 1.7 CDTi', 'Suzuki Swift 1.3 DDiS', 'Suzuki SX4 1.9 DDiS', 'Alfa Romeo MiTo 1.3/1.6 JTDm', 'Lancia Ypsilon 1.3 JTD'],
    checksumAlgo: 'unknown',
    checksumOffset: 0,
    checksumLength: 0,
    maps: [
      {
        id: 'crd2_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'Desired boost pressure map. CRD2 turbo diesel engines respond well to boost increases — primary Stage 1 calibration on 1.3/1.9 JTD.',
        signatures: [[0x4C,0x41,0x44,0x53,0x4F,0x4C,0x4C,0x00], [0x42,0x4F,0x4F,0x53,0x54,0x53,0x4F,0x4C]],
        sigOffset: 2,
        rows: 8, cols: 10, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.12 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.32, clampMax: 48000 },
        critical: true, showPreview: true,
      },
      {
        id: 'crd2_fuel_quantity',
        name: 'Injection Quantity Map',
        category: 'fuel',
        desc: 'Base fuel injection quantity. Increasing this on the 1.3 JTD/CDTi unlocks the torque the factory calibration deliberately restricts.',
        signatures: [[0x4D,0x45,0x4E,0x5A,0x4B,0x00], [0x45,0x49,0x4E,0x53,0x50,0x52,0x5A]],
        sigOffset: 2,
        rows: 8, cols: 10, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.28, clampMax: 55000 },
        critical: true, showPreview: true,
      },
      {
        id: 'crd2_torque_limit',
        name: 'Max Torque Limit',
        category: 'torque',
        desc: 'Software torque ceiling. Raised alongside fuel and boost to allow Stage 1 gains on small displacement CRD2 applications.',
        signatures: [[0x4D,0x58,0x4D,0x4F,0x4D,0x00], [0x54,0x51,0x4C,0x49,0x4D]],
        sigOffset: 2,
        rows: 1, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.25 },
        stage3: { multiplier: 1.35, clampMax: 55000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── Delphi CRD3.x (Opel / Ford / Renault 1.6–2.0 diesel) ───────────────────
  {
    id: 'delphi_crd3',
    name: 'Delphi CRD3.x (1.6–2.0 diesel)',
    manufacturer: 'Delphi',
    family: 'CRD3',
    // CRD3.x variant codes ARE embedded in calibration identification area.
    // CRD3.1x / CRD3.3x / CRD3.5x / CRD3.7x cover 1.6 CDTi / 2.0 CDTi variants.
    // MPC5566-based MCU (~1–2MB flash).
    identStrings: ['CRD3.1', 'CRD3.3', 'CRD3.4', 'CRD3.5', 'CRD3.6', 'CRD3.7', 'CRD3'],
    fileSizeRange: [524288, 2097152],   // 512KB – 2MB
    vehicles: ['Opel/Vauxhall Astra J 1.6/2.0 CDTi (A16DTH/A20DTH)', 'Opel/Vauxhall Insignia 2.0 CDTi', 'Opel/Vauxhall Zafira 2.0 CDTi', 'Ford Focus Mk3 1.6/2.0 TDCi', 'Ford Mondeo Mk4 2.0 TDCi', 'Renault Megane 1.9/2.0 dCi', 'Renault Laguna 2.0 dCi', 'Saab 9-3/9-5 2.0 TTiD', 'Chevrolet Cruze 2.0 VCDi'],
    checksumAlgo: 'unknown',
    checksumOffset: 0,
    checksumLength: 0,
    maps: [
      {
        id: 'delphi_crd3_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'Desired boost pressure map. Opel 2.0 CDTi A20DTH responds well to boost — primary Stage 1/2 map on Insignia/Astra.',
        signatures: [[0x4C,0x41,0x44,0x53,0x4F,0x4C,0x4C,0x00], [0x42,0x4F,0x4F,0x53,0x54,0x53,0x4F,0x4C]],
        sigOffset: 2,
        rows: 9, cols: 12, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.28 },
        stage3: { multiplier: 1.40, clampMax: 55000 },
        critical: true, showPreview: true,
      },
      {
        id: 'delphi_crd3_fuel_quantity',
        name: 'Injection Quantity Map',
        category: 'fuel',
        desc: 'Base fuel injection quantity. Raising this on the 2.0 CDTi significantly improves mid-range torque — key Stage 1/2 change.',
        signatures: [[0x4D,0x45,0x4E,0x5A,0x4B,0x00], [0x45,0x49,0x4E,0x53,0x50,0x52,0x5A]],
        sigOffset: 2,
        rows: 9, cols: 12, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.30, clampMax: 62000 },
        critical: true, showPreview: true,
      },
      {
        id: 'delphi_crd3_torque_limit',
        name: 'Max Torque Limit',
        category: 'torque',
        desc: 'Software torque ceiling. Opel CDTi ECU limits torque aggressively from factory — raising this is essential for any meaningful Stage 1 result.',
        signatures: [[0x4D,0x58,0x4D,0x4F,0x4D,0x00], [0x54,0x51,0x4C,0x49,0x4D]],
        sigOffset: 2,
        rows: 1, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.18 },
        stage2: { multiplier: 1.30 },
        stage3: { multiplier: 1.42, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'delphi_crd3_egr',
        name: 'EGR Duty Cycle Map',
        category: 'emission',
        desc: 'EGR valve duty cycle. Reducing this on the 2.0 CDTi lowers intake temps and reduces carbon buildup in the intake manifold.',
        signatures: [[0x45,0x47,0x52,0x44,0x55,0x54,0x59], [0x4B,0x46,0x45,0x47,0x52]],
        sigOffset: 2,
        rows: 8, cols: 10, dtype: 'uint8', le: true,
        factor: 0.4, offsetVal: 0, unit: '%',
        stage1: { multiplier: 0.8 },
        stage2: { multiplier: 0.5 },
        stage3: { multiplier: 0, clampMax: 100 },
        addonOverrides: { egr: { multiplier: 0, clampMax: 0 } },
        critical: false, showPreview: false,
      },
    ],
  },

  // ── Magneti Marelli MJD (Alfa Romeo / Fiat / Jeep diesel) ───────────────────
  {
    id: 'marelli_mjd',
    name: 'Magneti Marelli MJD (Fiat/Alfa diesel)',
    manufacturer: 'Magneti Marelli',
    family: 'MJD',
    // MJD variant codes ARE embedded in calibration identification sectors.
    // MJD6F3 = Alfa 159/Brera 2.0 JTDm, MJD6JF = Jeep/Dodge diesel.
    // MJ8DF/MJ8F3/MJ8F2 = Fiat Bravo/Punto/MiTo 1.6 Multijet, Alfa Giulietta 2.0 JTDm.
    identStrings: ['MJD6F3', 'MJD6JF', 'MJ8DF', 'MJ8F3', 'MJ8F2', 'MJD6', 'MJD8', 'MJ8'],
    fileSizeRange: [262144, 2097152],   // SH7058/SPC564 = 256KB–2MB
    vehicles: ['Alfa Romeo 159 2.0 JTDm 136/170hp', 'Alfa Romeo Brera 2.0 JTDm', 'Alfa Romeo Giulietta 2.0 JTDm 140/170hp', 'Alfa Romeo MiTo 1.3/1.6 JTDm', 'Fiat Bravo 1.6/2.0 Multijet', 'Fiat Punto 1.6 Multijet', 'Fiat Croma 1.9 JTDm', 'Jeep Renegade 1.6/2.0 JTD', 'Jeep Compass 2.0 JTD', 'Lancia Delta 2.0 Multijet'],
    checksumAlgo: 'unknown',
    checksumOffset: 0,
    checksumLength: 0,
    maps: [
      {
        id: 'mjd_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'Charge air pressure setpoint. Alfa 2.0 JTDm 170hp has excellent turbo headroom — primary Stage 1 map on MJD6F3 applications.',
        signatures: [[0x4C,0x41,0x44,0x53,0x4F,0x4C,0x4C,0x00], [0x42,0x4F,0x4F,0x53,0x54,0x53,0x4F,0x4C]],
        sigOffset: 2,
        rows: 9, cols: 12, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.28 },
        stage3: { multiplier: 1.42, clampMax: 55000 },
        critical: true, showPreview: true,
      },
      {
        id: 'mjd_fuel_quantity',
        name: 'Injection Quantity Map',
        category: 'fuel',
        desc: 'Base injection quantity map. Increasing this on Alfa/Fiat JTDm engines significantly boosts torque across the full RPM range.',
        signatures: [[0x4D,0x45,0x4E,0x5A,0x4B,0x00], [0x45,0x49,0x4E,0x53,0x50,0x52,0x5A]],
        sigOffset: 2,
        rows: 9, cols: 12, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.30, clampMax: 62000 },
        critical: true, showPreview: true,
      },
      {
        id: 'mjd_torque_limit',
        name: 'Max Torque Limit',
        category: 'torque',
        desc: 'Software torque ceiling. Must be raised on MJD diesel applications to allow Stage 1/2 gains — especially on the Alfa 159/Giulietta 2.0 JTDm.',
        signatures: [[0x4D,0x58,0x4D,0x4F,0x4D,0x00], [0x54,0x51,0x4C,0x49,0x4D]],
        sigOffset: 2,
        rows: 1, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.18 },
        stage2: { multiplier: 1.30 },
        stage3: { multiplier: 1.42, clampMax: 65000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── Bosch MEVD17.2.x (BMW M2 / M3 / M4 / M5 / M6 / X5M / X6M) ─────────────
  {
    id: 'bmw_mevd17',
    name: 'Bosch MEVD17.2 (BMW M performance)',
    manufacturer: 'Bosch',
    family: 'MEVD17',
    // MEVD17.2 = BMW M performance variant of MED17 (Tricore TC1793/TC1797).
    // MEVD17.2.G/H/P = S55 engine (M2 Comp/M3/M4 F8x).
    // MEVD17.2.3/K = S63 engine (M5/M6/X5M/X6M F-series).
    // MEVD17.2.9/8 = later S63TU/S63B44T4 variants.
    // MSS60/MSS65 = older M5/M6 S85 V10 / S65 V8 (Bosch, pre-TC Tricore).
    identStrings: ['MEVD17', 'MEVD17.2', 'MSS60', 'MSS65', 'MEVD17.2.G', 'MEVD17.2.H', 'MEVD17.2.3', 'MEVD17.2.K', 'MEVD17.2.9'],
    fileSizeRange: [524288, 4194304],   // TC1793=2MB, TC1797=4MB
    vehicles: ['BMW M2 Competition (F87 S55)', 'BMW M3 (F80 S55)', 'BMW M4 / M4 CS / M4 GTS (F82/F83 S55)', 'BMW M5 (F10 S63TU)', 'BMW M6 / M6 Gran Coupé (F12/F06 S63)', 'BMW X5M / X6M (F85/F86 S63)', 'BMW M5 (E60 S85 V10 — MSS60)', 'BMW M6 (E63 S85 V10 — MSS60)', 'BMW M3 (E90/E92 S65 V8 — MSS65)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x3FFFF8,
    checksumLength: 4,
    maps: [
      {
        id: 'mevd17_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'Charge air pressure setpoint. BMW S55 (M3/M4) is famously conservative from factory — significant boost headroom available. Primary Stage 1/2 map.',
        signatures: [[0x4C,0x44,0x4B,0x56,0x53,0x4F,0x4C,0x4C], [0x42,0x4F,0x4F,0x53,0x54,0x53,0x4F,0x4C]],
        sigOffset: 4,
        rows: 12, cols: 16, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.25 },
        stage2: { multiplier: 1.45 },
        stage3: { multiplier: 1.62, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'mevd17_fuel_inject',
        name: 'Fuel Injection Quantity',
        category: 'fuel',
        desc: 'Base injection quantity. S55/S63 use high-pressure direct injection — raising fuelling critical for Stage 2+ on both turbo BMW M engines.',
        signatures: [[0x49,0x4E,0x4A,0x44,0x55,0x52,0x42,0x53], [0x4B,0x46,0x49,0x4E,0x4A,0x44,0x55,0x52]],
        sigOffset: 4,
        rows: 16, cols: 16, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.28 },
        stage3: { multiplier: 1.42, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'mevd17_torque_limit',
        name: 'Torque Demand Limit',
        category: 'torque',
        desc: 'Software torque ceiling. BMW M ECU has multiple torque limit layers — raising primary demand limit is essential for any Stage 1+ on M3/M4/M5.',
        signatures: [[0x54,0x51,0x4C,0x49,0x4D,0x01,0x00], [0x4D,0x58,0x4D,0x4F,0x4D,0x00]],
        sigOffset: 2,
        rows: 8, cols: 12, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.22 },
        stage2: { multiplier: 1.38 },
        stage3: { multiplier: 1.55, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'mevd17_ignition',
        name: 'Ignition Timing Map',
        category: 'ignition',
        desc: 'Base ignition advance. BMW S55 runs conservatively on 95 RON — timing gains on 98/100 RON are the primary NA-style improvement on M3/M4.',
        signatures: [[0x4B,0x46,0x5A,0x57,0x42,0x41,0x53,0x45], [0x49,0x47,0x4E,0x42,0x41,0x53,0x45]],
        sigOffset: 4,
        rows: 16, cols: 16, dtype: 'int8', le: true,
        factor: 0.75, offsetVal: -48, unit: '°BTDC',
        stage1: { addend: 0 },
        stage2: { addend: 2 },
        stage3: { addend: 3, clampMax: 60 },
        critical: false, showPreview: true,
      },
      {
        id: 'mevd17_rev_limit',
        name: 'Rev Limiter',
        category: 'limiter',
        desc: 'Engine RPM hard cut. BMW S55/S63 rev limit raised for high-revving track applications.',
        signatures: [[0x4E,0x4D,0x41,0x58,0x42,0x45,0x47,0x52], [0x52,0x45,0x56,0x4C,0x49,0x4D]],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'RPM',
        stage1: { addend: 200 },
        stage2: { addend: 400 },
        stage3: { addend: 500, clampMax: 8500 },
        critical: false, showPreview: false,
      },
    ],
  },

  // ── Continental EMS24xx (Ford Focus ST / RS / EcoBoost 2.0–2.3T) ────────────
  {
    id: 'ford_ems24',
    name: 'Continental EMS24xx (Ford EcoBoost ST/RS)',
    manufacturer: 'Continental',
    family: 'EMS24',
    // EMS24xx = Continental TC1791-based ECU for modern Ford EcoBoost petrol.
    // EMS2400/EMS2411 = Ford Focus ST Mk3 / Focus RS Mk3 2.0T/2.3T EcoBoost.
    // Also Ford Mondeo/S-Max 2.0T (2014+) and Ford Mustang 2.3 EcoBoost.
    // EMS24 variant code IS embedded in calibration identification area.
    identStrings: ['EMS24', 'EMS2400', 'EMS2411', 'EMS2511', 'EMS3155'],
    fileSizeRange: [524288, 2097152],   // TC1791 = 2MB
    vehicles: ['Ford Focus ST Mk3 2.0T EcoBoost (250ps)', 'Ford Focus RS Mk3 2.3T EcoBoost (350ps)', 'Ford Mondeo Mk5 2.0T EcoBoost (240ps)', 'Ford S-Max 2.0T EcoBoost (240ps)', 'Ford Galaxy 2.0T EcoBoost', 'Ford Mustang 2.3 EcoBoost (2015+)', 'Ford Edge 2.0T EcoBoost', 'Ford Kuga Mk2 2.0T EcoBoost (182ps)'],
    checksumAlgo: 'continental-crc',
    checksumOffset: 0x1FFFF0,
    checksumLength: 4,
    maps: [
      {
        id: 'ems24_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'Charge air pressure setpoint. Ford 2.3T EcoBoost (Focus RS) and 2.0T (Focus ST) both have significant boost headroom — primary Stage 1 map.',
        signatures: [[0x4C,0x44,0x4B,0x56,0x53,0x4F,0x4C,0x4C], [0x42,0x4F,0x4F,0x53,0x54,0x53,0x4F,0x4C]],
        sigOffset: 4,
        rows: 12, cols: 16, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.20 },
        stage2: { multiplier: 1.38 },
        stage3: { multiplier: 1.55, clampMax: 62000 },
        critical: true, showPreview: true,
      },
      {
        id: 'ems24_fuel_inject',
        name: 'Fuel Injection Duration',
        category: 'fuel',
        desc: 'Base fuel injection duration. Ford RS 2.3T uses direct injection — enrichment essential for Stage 2+ to support increased boost and prevent knock.',
        signatures: [[0x49,0x4E,0x4A,0x44,0x55,0x52,0x42,0x53], [0x4B,0x46,0x49,0x4E,0x4A,0x44,0x55,0x52]],
        sigOffset: 4,
        rows: 16, cols: 16, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'ms',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.28 },
        stage3: { multiplier: 1.40, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'ems24_torque_limit',
        name: 'Torque Demand Limit',
        category: 'torque',
        desc: 'Software torque ceiling. Ford EcoBoost ECU limits torque for transmission protection — raising this is mandatory for Stage 1+ on Focus ST/RS.',
        signatures: [[0x54,0x51,0x4C,0x49,0x4D,0x01,0x00], [0x54,0x4F,0x52,0x51,0x4C,0x49,0x4D]],
        sigOffset: 2,
        rows: 8, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.25 },
        stage2: { multiplier: 1.42 },
        stage3: { multiplier: 1.58, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'ems24_ignition',
        name: 'Ignition Timing Base',
        category: 'ignition',
        desc: 'Base ignition advance. Ford 2.3T EcoBoost is conservative on 95 RON — timing gains on 98 RON improve response and top-end on Focus RS.',
        signatures: [[0x4B,0x46,0x5A,0x57,0x42,0x41,0x53,0x45], [0x49,0x47,0x4E,0x42,0x41,0x53,0x45]],
        sigOffset: 4,
        rows: 16, cols: 16, dtype: 'int8', le: true,
        factor: 0.75, offsetVal: -48, unit: '°BTDC',
        stage1: { addend: 0 },
        stage2: { addend: 2 },
        stage3: { addend: 3, clampMax: 62 },
        critical: false, showPreview: true,
      },
    ],
  },

  // ── Delco E87 / E98 (Opel / Vauxhall / Chevrolet / GM petrol turbo) ─────────
  {
    id: 'delco_e87',
    name: 'Delco E87/E98 (Opel/Vauxhall petrol)',
    manufacturer: 'Delphi/ACDelco',
    family: 'E87',
    // E87 (MPC556/TC1797) and E98 (MPC5674F) are ACDelco/Delphi ECUs for GM petrol turbo.
    // 'E87' and 'E98' calibration variant codes ARE embedded in ROM identification sector.
    // E87: Opel Astra J/K 1.4T/2.0T, Insignia 2.0T, Cascada, Meriva B, Mokka 1.4T.
    // E98: Opel Astra K 1.4T/1.6T (B14NET/D14NET) and Chevrolet Cruze/Trax 1.4T.
    identStrings: ['E87MCA', 'E98MCA', 'E87', 'E98', '12622290', '12655908'],
    fileSizeRange: [524288, 4194304],   // MPC556=1MB, TC1797=4MB, MPC5674F=2MB
    vehicles: ['Opel/Vauxhall Astra J 1.4T 140ps (A14NET)', 'Opel/Vauxhall Astra J 2.0T 280ps (A20NFT OPC)', 'Opel/Vauxhall Insignia 2.0T 220/260ps', 'Opel/Vauxhall Cascada 2.0T 220ps', 'Opel/Vauxhall Meriva B 1.4T', 'Opel/Vauxhall Mokka 1.4T 140ps', 'Opel/Vauxhall Astra K 1.4T/1.6T Turbo', 'Chevrolet Cruze 1.4T/1.6T', 'Chevrolet Trax 1.4T'],
    checksumAlgo: 'unknown',
    checksumOffset: 0,
    checksumLength: 0,
    maps: [
      {
        id: 'e87_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'Charge air pressure setpoint. Opel 1.4T and 2.0T engines have significant factory headroom — primary Stage 1/2 map on Astra OPC and Insignia OPC.',
        signatures: [[0x4C,0x44,0x4B,0x56,0x53,0x4F,0x4C,0x4C], [0x42,0x4F,0x4F,0x53,0x54,0x53,0x4F,0x4C]],
        sigOffset: 4,
        rows: 12, cols: 16, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.18 },
        stage2: { multiplier: 1.32 },
        stage3: { multiplier: 1.48, clampMax: 58000 },
        critical: true, showPreview: true,
      },
      {
        id: 'e87_fuel_inject',
        name: 'Fuel Injection Duration',
        category: 'fuel',
        desc: 'Base injection duration. Opel 2.0T A20NFT (OPC) responds significantly to fuelling enrichment — essential for Stage 2+ to support extra boost.',
        signatures: [[0x49,0x4E,0x4A,0x44,0x55,0x52,0x42,0x53], [0x4B,0x46,0x49,0x4E,0x4A,0x44,0x55,0x52]],
        sigOffset: 4,
        rows: 16, cols: 16, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'ms',
        stage1: { multiplier: 1.12 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.32, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'e87_torque_limit',
        name: 'Torque Demand Limit',
        category: 'torque',
        desc: 'Software torque ceiling. ACDelco E87/E98 has aggressive factory torque limits — raising this is the single most important change for any Opel/Vauxhall tune.',
        signatures: [[0x54,0x51,0x4C,0x49,0x4D,0x01,0x00], [0x4D,0x58,0x4D,0x4F,0x4D,0x00]],
        sigOffset: 2,
        rows: 8, cols: 12, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.22 },
        stage2: { multiplier: 1.38 },
        stage3: { multiplier: 1.55, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'e87_ignition',
        name: 'Ignition Timing Map',
        category: 'ignition',
        desc: 'Base ignition advance. Opel A14NET/A20NFT is conservative on 95 RON — timing advance on 98 RON fuel improves response and power on both 1.4T and 2.0T.',
        signatures: [[0x4B,0x46,0x5A,0x57,0x42,0x41,0x53,0x45], [0x49,0x47,0x4E,0x42,0x41,0x53,0x45]],
        sigOffset: 4,
        rows: 16, cols: 16, dtype: 'int8', le: true,
        factor: 0.75, offsetVal: -48, unit: '°BTDC',
        stage1: { addend: 0 },
        stage2: { addend: 2 },
        stage3: { addend: 3, clampMax: 62 },
        critical: false, showPreview: true,
      },
    ],
  },

  // ── Delphi DCM3.4 / Toyota diesel (1KD-FTV / 2KD-FTV Land Cruiser / Hilux) ──
  {
    id: 'toyota_dcm34',
    name: 'Delphi DCM3.4 (Toyota diesel)',
    manufacturer: 'Delphi',
    family: 'DCM3.4',
    // DCM3.4 is a Delphi common-rail diesel ECU on Renesas SH7059 MCU (~512KB flash).
    // 'DCM3.4' calibration variant code IS embedded in Toyota diesel ECU ROM.
    // 1KD-FTV = 3.0L D-4D turbodiesel (166–173ps) in Land Cruiser/Prado/Hilux.
    // 2KD-FTV = 2.5L D-4D turbodiesel (102–144ps) in Hilux/Innova/Fortuner.
    identStrings: ['DCM3.4', 'DCM34', 'DCM3.4AP', '89871-'],
    fileSizeRange: [262144, 524288],   // SH7059 = 256KB–512KB
    vehicles: ['Toyota Land Cruiser 100/200 3.0D (1KD-FTV)', 'Toyota Land Cruiser Prado 3.0D (1KD-FTV)', 'Toyota Hilux 3.0D 163ps (1KD-FTV)', 'Toyota Hilux 2.5D 102/144ps (2KD-FTV)', 'Toyota HiAce 2.5D (2KD-FTV)', 'Toyota Fortuner 2.5D/3.0D', 'Toyota Innova 2.5D (2KD-FTV)', 'Lexus GX470 4.7D'],
    checksumAlgo: 'unknown',
    checksumOffset: 0,
    checksumLength: 0,
    maps: [
      {
        id: 'dcm34_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'Desired boost pressure for the Toyota 1KD/2KD diesel. These engines have good turbo headroom from the factory conservative calibration — primary Stage 1 map.',
        signatures: [[0x4C,0x41,0x44,0x53,0x4F,0x4C,0x4C,0x00], [0x42,0x4F,0x4F,0x53,0x54,0x53,0x4F,0x4C]],
        sigOffset: 2,
        rows: 8, cols: 10, dtype: 'uint16', le: false,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.25 },
        stage3: { multiplier: 1.35, clampMax: 52000 },
        critical: true, showPreview: true,
      },
      {
        id: 'dcm34_fuel_quantity',
        name: 'Injection Quantity Map',
        category: 'fuel',
        desc: 'Base fuel injection quantity. Raising this on the 1KD-FTV 3.0D improves torque significantly — used heavily in Hilux/Land Cruiser off-road builds.',
        signatures: [[0x4D,0x45,0x4E,0x5A,0x4B,0x00], [0x45,0x49,0x4E,0x53,0x50,0x52,0x5A]],
        sigOffset: 2,
        rows: 8, cols: 10, dtype: 'uint16', le: false,
        factor: 0.001, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.28, clampMax: 60000 },
        critical: true, showPreview: true,
      },
      {
        id: 'dcm34_torque_limit',
        name: 'Max Torque Limit',
        category: 'torque',
        desc: 'Software torque ceiling. Toyota diesel ECU has conservative torque limits — raising this allows full use of increased fuel and boost quantities.',
        signatures: [[0x4D,0x58,0x4D,0x4F,0x4D,0x00], [0x54,0x51,0x4C,0x49,0x4D]],
        sigOffset: 2,
        rows: 1, cols: 8, dtype: 'uint16', le: false,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.25 },
        stage3: { multiplier: 1.35, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'dcm34_speed_limit',
        name: 'Vehicle Speed Limit',
        category: 'limiter',
        desc: 'Factory vehicle speed limiter. Often raised or removed on commercial/off-road variants of Hilux and Land Cruiser.',
        signatures: [[0x56,0x4D,0x41,0x58,0x00], [0x53,0x50,0x44,0x4C,0x49,0x4D]],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'km/h',
        stage1: { addend: 20 },
        stage2: { addend: 40 },
        stage3: { addend: 60, clampMax: 280 },
        addonOverrides: { speedlimiter: { multiplier: 0, addend: 65535 } },
        critical: false, showPreview: false,
      },
    ],
  },

  // ── Continental SID803A / SID206 (Ford Focus/Mondeo/C-Max + PSA 2.0 TDCi/HDi) ─
  {
    id: 'ford_sid803',
    name: 'Continental SID803A/SID206 (Ford/PSA diesel)',
    manufacturer: 'Continental',
    family: 'SID803',
    // SID803A (MPC562) and SID206 (MPC563) are Continental diesel ECUs for Ford and PSA.
    // SID803A: Ford Focus Mk2/C-Max/Mondeo Mk4 1.6/2.0 TDCi + Peugeot 307/407/607 2.0 HDi.
    // SID206: Ford Focus/Mondeo/Galaxy/S-Max 1.8/2.0 TDCi (2002–2008).
    // SID802/SID804: older C167-based variants (Ford 1.8 TDCi pre-2005, PSA 1.6/2.0 HDi).
    // SID8xx variant codes ARE embedded in Continental diesel calibration identification area.
    identStrings: ['SID803A', 'SID803', 'SID802', 'SID804'],
    fileSizeRange: [262144, 1048576],   // C167 = 256KB, MPC5xx = 512KB–1MB
    vehicles: ['Ford Focus Mk2 1.6/2.0 TDCi (2004–2011)', 'Ford Mondeo Mk4 1.6/2.0 TDCi (2007–2014)', 'Ford C-Max 1.6/2.0 TDCi (2007–2010)', 'Ford Galaxy/S-Max 2.0 TDCi (2006–2010)', 'Ford Kuga Mk1 2.0 TDCi (2008–2012)', 'Peugeot 307/308 2.0 HDi (DW10)', 'Peugeot 407/607 2.0 HDi', 'Citroën C5/C6 2.0 HDi', 'Citroën Berlingo/Dispatch 2.0 HDi'],
    checksumAlgo: 'continental-crc',
    checksumOffset: 0x7FFF0,
    checksumLength: 4,
    maps: [
      {
        id: 'sid803_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'Desired boost pressure map. Ford 2.0 TDCi DW10 engine has good boost headroom from the conservative factory calibration — primary Stage 1 map.',
        signatures: [[0x4C,0x41,0x44,0x53,0x4F,0x4C,0x4C,0x00], [0x42,0x4F,0x4F,0x53,0x54,0x53,0x4F,0x4C]],
        sigOffset: 2,
        rows: 8, cols: 10, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.12 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.32, clampMax: 52000 },
        critical: true, showPreview: true,
      },
      {
        id: 'sid803_fuel_quantity',
        name: 'Injection Quantity Map',
        category: 'fuel',
        desc: 'Base fuel injection quantity. Ford 2.0 TDCi and PSA 2.0 HDi both respond well to injection increases — significant torque gains available on Stage 1.',
        signatures: [[0x4D,0x45,0x4E,0x5A,0x4B,0x00], [0x45,0x49,0x4E,0x53,0x50,0x52,0x5A]],
        sigOffset: 2,
        rows: 8, cols: 10, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.28, clampMax: 60000 },
        critical: true, showPreview: true,
      },
      {
        id: 'sid803_torque_limit',
        name: 'Max Torque Limit',
        category: 'torque',
        desc: 'Software torque ceiling. Continental SID803A limits torque to protect the 6-speed gearbox — raising this is required for full Stage 1 power delivery.',
        signatures: [[0x4D,0x58,0x4D,0x4F,0x4D,0x00], [0x54,0x51,0x4C,0x49,0x4D]],
        sigOffset: 2,
        rows: 1, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.25 },
        stage3: { multiplier: 1.35, clampMax: 62000 },
        critical: true, showPreview: true,
      },
      {
        id: 'sid803_egr',
        name: 'EGR Duty Cycle Map',
        category: 'emission',
        desc: 'EGR valve duty cycle. Reducing this on Ford TDCi and PSA HDi engines lowers intake temps and reduces carbon buildup in the swirl flaps and inlet manifold.',
        signatures: [[0x45,0x47,0x52,0x44,0x55,0x54,0x59], [0x4B,0x46,0x45,0x47,0x52]],
        sigOffset: 2,
        rows: 8, cols: 10, dtype: 'uint8', le: true,
        factor: 0.4, offsetVal: 0, unit: '%',
        stage1: { multiplier: 0.8 },
        stage2: { multiplier: 0.5 },
        stage3: { multiplier: 0, clampMax: 100 },
        addonOverrides: { egr: { multiplier: 0, clampMax: 0 } },
        critical: false, showPreview: false,
      },
    ],
  },

  // ─── Delphi MT80/MT80.1 (Opel/Vauxhall 2.0 CDTi) ─────────────────────────
  {
    id: 'delphi_mt80',
    name: 'Delphi MT80/MT80.1 (Opel/Vauxhall 2.0 CDTi)',
    manufacturer: 'Delphi',
    family: 'MT80',
    // MT80 and MT80.1 are Delphi diesel ECUs on Renesas SH72543 used in Opel/Vauxhall
    // Zafira B, Astra H/J, and Vectra C 2.0 CDTi (Z20DTH / Z20DTJ engines).
    // "MT80" and "MT80.1" are embedded as ASCII in the calibration identification header
    // of these ECUs — confirmed present in PDFs and known tuning databases.
    identStrings: ['MT80.1', 'MT80', 'MT80A', 'MT80B'],
    fileSizeRange: [524288, 2097152],   // SH72543 = 512KB–2MB flash
    vehicles: [
      'Opel/Vauxhall Zafira B 2.0 CDTi 100/120ps (Z20DTH/Z20DTJ)',
      'Opel/Vauxhall Astra H 2.0 CDTi 100/120ps',
      'Opel/Vauxhall Vectra C 2.0 CDTi 100/120ps',
      'Opel/Vauxhall Signum 2.0 CDTi 120ps',
    ],
    checksumAlgo: 'unknown',
    checksumOffset: 0,
    checksumLength: 0,
    maps: [
      {
        id: 'mt80_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'Desired boost pressure map (turbo setpoint). Delphi MT80 on the 2.0 CDTi has conservative factory boost limits — Stage 1 gains 20–35ps from boost and fuelling increases.',
        signatures: [[0x42,0x4F,0x4F,0x53,0x54,0x54,0x52], [0x4D,0x41,0x50,0x42,0x4F,0x4F]],
        sigOffset: 2,
        rows: 8, cols: 10, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.12 },
        stage2: { multiplier: 1.20 },
        stage3: { multiplier: 1.30, clampMax: 52000 },
        critical: true, showPreview: true,
      },
      {
        id: 'mt80_fuel_quantity',
        name: 'Injection Quantity Map',
        category: 'fuel',
        desc: 'Base fuel injection quantity. The Z20DTH engine on MT80 calibration has significant headroom — fuelling increases yield strong torque gains with minimal smoke.',
        signatures: [[0x49,0x4E,0x4A,0x51,0x54,0x59,0x00], [0x4D,0x41,0x50,0x46,0x55,0x45,0x4C]],
        sigOffset: 2,
        rows: 8, cols: 10, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.12 },
        stage2: { multiplier: 1.20 },
        stage3: { multiplier: 1.28, clampMax: 60000 },
        critical: true, showPreview: true,
      },
      {
        id: 'mt80_torque_limit',
        name: 'Max Torque Limit',
        category: 'torque',
        desc: 'Software torque ceiling. MT80 torque limiting is applied to protect the gearbox — must be raised alongside boost and fuelling for full Stage 1 results.',
        signatures: [[0x4D,0x58,0x54,0x52,0x51,0x00], [0x54,0x51,0x4C,0x49,0x4D,0x53]],
        sigOffset: 2,
        rows: 1, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.25 },
        stage3: { multiplier: 1.35, clampMax: 60000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ─── Bosch PPD1.x (VW/Audi 1.9/2.0 TDI Pumpe Düse) ──────────────────────
  {
    id: 'vag_ppd1',
    name: 'Bosch PPD1.x (VW/Audi TDI Pumpe Düse)',
    manufacturer: 'Bosch',
    family: 'PPD1',
    // PPD1.1, PPD1.2, PPD1.3, PPD1.5 are Bosch ECUs for VW/Audi Pumpe Düse (unit injector)
    // 1.9 TDI and 2.0 TDI engines — NOT common-rail (no EDC16/EDC17). Used in Golf IV/V,
    // Passat B5/B6, Octavia Mk1/Mk2, A3 8P, A4 B5/B6, Seat Leon/Toledo 1.9 TDI (BKD/BXE/BKP/BMR).
    // PPD1.x calibration variant codes ARE embedded as ASCII in the ROM identification header.
    identStrings: ['PPD1.1', 'PPD1.2', 'PPD1.3', 'PPD1.5', 'PPD1'],
    fileSizeRange: [524288, 1048576],
    vehicles: [
      'VW Golf IV/V 1.9 TDI 100/105/130ps (BKD/BXE/AXR)',
      'VW Golf V 2.0 TDI 140ps (BMM/BKD)',
      'VW Passat B5/B6 1.9/2.0 TDI 100/130/140ps',
      'VW Touran 1.9 TDI 105ps / 2.0 TDI 140ps',
      'Skoda Octavia Mk1/Mk2 1.9 TDI 100/105/130ps',
      'Audi A3 8P 2.0 TDI 140ps (BKD)',
      'Audi A4 B6/B7 1.9/2.0 TDI 115/130/140ps',
      'Seat Leon/Toledo 1.9 TDI 100/130ps',
    ],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0,
    checksumLength: 4,
    maps: [
      {
        id: 'ppd1_fuel_quantity',
        name: 'Injection Quantity Map',
        category: 'fuel',
        desc: 'Base fuel injection quantity. Pumpe Düse TDI is highly fuel quantity sensitive — this is the primary Stage 1 map. PD engines respond exceptionally well to injection increases with the right EGR strategy.',
        signatures: [[0x4B,0x4D,0x45,0x4E,0x47,0x00], [0x4D,0x41,0x50,0x4B,0x4D]],
        sigOffset: 2,
        rows: 8, cols: 12, dtype: 'uint16', le: false,
        factor: 0.001, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.25 },
        stage3: { multiplier: 1.35, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'ppd1_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'Turbo setpoint pressure map. PPD TDI uses VNT (variable nozzle turbo) — boost control is critical. The 1.9 TDI BKD/BXE has conservative factory boost allowing significant safe gains.',
        signatures: [[0x4C,0x4C,0x44,0x52,0x55,0x43,0x4B], [0x42,0x4F,0x4F,0x53,0x54,0x53,0x4F]],
        sigOffset: 2,
        rows: 8, cols: 10, dtype: 'uint16', le: false,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.10 },
        stage2: { multiplier: 1.18 },
        stage3: { multiplier: 1.28, clampMax: 50000 },
        critical: true, showPreview: true,
      },
      {
        id: 'ppd1_torque_limit',
        name: 'Max Torque Limit',
        category: 'torque',
        desc: 'Software torque ceiling. PPD1 torque limits protect the mechatronic DSG or 02Q gearbox — must be raised for full Stage 1 power delivery without drivetrain hesitation.',
        signatures: [[0x4D,0x58,0x54,0x52,0x51,0x00], [0x4D,0x4F,0x4D,0x45,0x4E,0x54]],
        sigOffset: 2,
        rows: 1, cols: 8, dtype: 'uint16', le: false,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.18 },
        stage2: { multiplier: 1.28 },
        stage3: { multiplier: 1.40, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'ppd1_egr',
        name: 'EGR Duty Cycle Map',
        category: 'emission',
        desc: 'EGR valve duty cycle. Pumpe Düse TDI heavily benefits from EGR reduction — lower EGR improves combustion efficiency, reduces oil dilution, and raises EGT for regen. Key for EGR delete.',
        signatures: [[0x45,0x47,0x52,0x44,0x55,0x54], [0x41,0x47,0x52,0x52,0x41,0x54]],
        sigOffset: 2,
        rows: 8, cols: 10, dtype: 'uint8', le: false,
        factor: 0.4, offsetVal: 0, unit: '%',
        stage1: { multiplier: 0.75 },
        stage2: { multiplier: 0.4 },
        stage3: { multiplier: 0, clampMax: 100 },
        addonOverrides: { egr: { multiplier: 0, clampMax: 0 } },
        critical: false, showPreview: false,
      },
    ],
  },

  // ─── Denso Volvo petrol (SH705x/SH72543/SH72544/SH72546) ─────────────────
  {
    id: 'volvo_denso',
    name: 'Denso Volvo Petrol (SH72544/SH72546)',
    manufacturer: 'Denso',
    family: 'Volvo Denso',
    // Denso SH-series ECUs used in Volvo petrol engines (not the Bosch ME7/ME9 variants).
    // Calibration ROM headers embed Denso project codes: V40, V46, V50, VD46.1, V46.11, S3000.
    // Used in Volvo S40/V40/V50/C30/S60 T5/T6 D5 petrol variants (B4164T/B5204T/B6324S).
    // PDF confirms: "ECM SH72543 V50", "ECM SH72546 VD46.1", "ECM SH705x V40".
    identStrings: ['VD46.1', 'V46.11', 'VD46', 'S3000'],
    fileSizeRange: [524288, 2097152],
    vehicles: [
      'Volvo S40/V40 2.0T/T5 (B4204T/B5204T2)',
      'Volvo S40/V50/C30 2.4i/T5 (B5244S/B5254T2)',
      'Volvo S60/V70 T5 250ps (B5244T3)',
      'Volvo S60/V70 T6 AWD 272ps (B6294T)',
      'Volvo XC70 2.5T 210ps (B5254T2)',
    ],
    checksumAlgo: 'unknown',
    checksumOffset: 0,
    checksumLength: 0,
    maps: [
      {
        id: 'volvo_denso_boost',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'Turbo setpoint map. Volvo T5/T6 petrol is well-suited for boost increases — conservative from factory. Primary Stage 1 map for Denso Volvo calibrations.',
        signatures: [[0x42,0x4F,0x4F,0x53,0x54,0x4D,0x41], [0x54,0x52,0x42,0x4F,0x4F,0x53]],
        sigOffset: 2,
        rows: 12, cols: 16, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.12 },
        stage2: { multiplier: 1.20 },
        stage3: { multiplier: 1.28, clampMax: 55000 },
        critical: true, showPreview: true,
      },
      {
        id: 'volvo_denso_fuel',
        name: 'Fuel Injection Map',
        category: 'fuel',
        desc: 'Base fuel injection quantity for Volvo petrol Denso ECU. Works in conjunction with boost map for Stage 1 power gains.',
        signatures: [[0x46,0x55,0x45,0x4C,0x4D,0x41,0x50], [0x49,0x4E,0x4A,0x51,0x54,0x59]],
        sigOffset: 2,
        rows: 12, cols: 16, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'ms',
        stage1: { multiplier: 1.08 },
        stage2: { multiplier: 1.14 },
        stage3: { multiplier: 1.20, clampMax: 60000 },
        critical: true, showPreview: true,
      },
      {
        id: 'volvo_denso_torque',
        name: 'Max Torque Limit',
        category: 'torque',
        desc: 'Software torque ceiling. Volvo AWD models use the rear diff torque transfer limit as a secondary ceiling — both must be raised for Stage 2+ AWD tunes.',
        signatures: [[0x4D,0x58,0x54,0x52,0x51,0x56,0x4C], [0x54,0x51,0x4C,0x49,0x4D,0x56]],
        sigOffset: 2,
        rows: 1, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.25 },
        stage3: { multiplier: 1.35, clampMax: 65000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ─── Continental EMS3110/3125/3150/3155 (Renault/Nissan petrol) ───────────
  {
    id: 'renault_ems31',
    name: 'Continental EMS311x/315x (Renault/Nissan petrol)',
    manufacturer: 'Continental',
    family: 'EMS3110',
    // EMS3110, EMS3125, EMS3150, EMS3155 are Continental TC1766/TC1767/TC1782-based petrol ECUs.
    // Used in Renault Clio IV/V RS/RS Trophy, Megane RS IV, Twingo GT, Captur TCe, and Nissan
    // Juke/Qashqai/Note 1.2/1.3/1.6 turbo petrol. Later successor to EMS3120.
    // EMS311x/315x calibration variant codes ARE embedded as ASCII in ROM identification area.
    identStrings: ['EMS3155', 'EMS3150', 'EMS3125', 'EMS3110', 'EMS315', 'EMS311'],
    fileSizeRange: [524288, 2097152],
    vehicles: [
      'Renault Clio IV RS 200/220 Trophy (M5Mt)',
      'Renault Megane RS IV 280/300 Trophy (M5Pt)',
      'Renault Twingo GT 110ps (H4B 0.9 TCe)',
      'Renault Captur 1.2 TCe 120ps (H5Ft)',
      'Renault Kadjar 1.2/1.6 TCe 130/165ps',
      'Nissan Juke 1.6T 190ps DIG-T (MR16DDT)',
      'Nissan Qashqai 1.2/1.6 DIG-T 115/163ps',
      'Nissan Note/Pulsar 1.2T DIG-T 98ps',
    ],
    checksumAlgo: 'continental-crc',
    checksumOffset: 0,
    checksumLength: 4,
    maps: [
      {
        id: 'ems31_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'Boost setpoint map. Renault RS and Nissan DIG-T are very boost-responsive — EMS3155 (Megane RS IV) allows large Stage 1 gains from boost alone without mechanical changes.',
        signatures: [[0x42,0x4F,0x4F,0x53,0x54,0x54,0x47], [0x54,0x52,0x42,0x54,0x47,0x54]],
        sigOffset: 2,
        rows: 12, cols: 16, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.12 },
        stage2: { multiplier: 1.20 },
        stage3: { multiplier: 1.30, clampMax: 55000 },
        critical: true, showPreview: true,
      },
      {
        id: 'ems31_fuel_map',
        name: 'Fuel Injection Map',
        category: 'fuel',
        desc: 'Base fuel injection quantity. Continental EMS315x petrol ECU requires fuel matched to boost — Renault H5Ft and Nissan MR16DDT both respond well on pump fuel.',
        signatures: [[0x46,0x55,0x45,0x4C,0x4D,0x41,0x50], [0x49,0x4E,0x4A,0x42,0x41,0x53,0x45]],
        sigOffset: 2,
        rows: 12, cols: 16, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'ms',
        stage1: { multiplier: 1.08 },
        stage2: { multiplier: 1.14 },
        stage3: { multiplier: 1.20, clampMax: 60000 },
        critical: true, showPreview: true,
      },
      {
        id: 'ems31_torque_limit',
        name: 'Max Torque Limit',
        category: 'torque',
        desc: 'Software torque ceiling. Continental EMS3155 torque limiting on the Megane RS IV 280 is conservative — raising this reveals the engine potential on the EDC16-derived platform.',
        signatures: [[0x4D,0x58,0x54,0x52,0x51,0x52,0x4E], [0x54,0x51,0x4C,0x49,0x4D,0x52,0x4E]],
        sigOffset: 2,
        rows: 1, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.30, clampMax: 65000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ─── Continental SDI9/SDI21 (Porsche petrol) ──────────────────────────────
  {
    id: 'porsche_sdi',
    name: 'Continental SDI9/SDI21 (Porsche)',
    manufacturer: 'Continental',
    family: 'SDI',
    // SDI9 (TC1797) and SDI21/SDI21.1/SDI21.2 (TC1791) are Continental ECUs used exclusively
    // in Porsche vehicles. SDI9: Cayenne S/GTS/Turbo (4.8L), Panamera (3.6/4.8L).
    // SDI21: 911 991 (3.8L flat-six), Macan 2.0/3.0T, Panamera 2.9T, Cayenne 3.0T.
    // SDI calibration variant codes ARE embedded as ASCII in Continental ROM ID area.
    identStrings: ['SDI21.2', 'SDI21.1', 'SDI21', 'SDI9'],
    fileSizeRange: [1048576, 4194304],
    vehicles: [
      'Porsche 911 991 Carrera 3.4/3.8 (H6 flat-six)',
      'Porsche 911 991 Carrera S 3.8 400ps',
      'Porsche Cayenne 3.6/4.8S/GTS/Turbo (92A)',
      'Porsche Panamera 3.6/4.8 S/GTS/Turbo (970)',
      'Porsche Macan 2.0T 245ps / 3.0T S 340ps (95B)',
      'Porsche Panamera 2.9T 440ps (971)',
    ],
    checksumAlgo: 'continental-crc',
    checksumOffset: 0,
    checksumLength: 4,
    maps: [
      {
        id: 'sdi_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'Boost setpoint map. Porsche turbocharged flat-six and V8 are very responsive — SDI21 on the 911 Turbo has significant factory headroom. Primary Stage 1 map.',
        signatures: [[0x42,0x4F,0x4F,0x53,0x54,0x53,0x44], [0x54,0x52,0x42,0x53,0x44,0x49]],
        sigOffset: 2,
        rows: 16, cols: 20, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.10 },
        stage2: { multiplier: 1.18 },
        stage3: { multiplier: 1.26, clampMax: 55000 },
        critical: true, showPreview: true,
      },
      {
        id: 'sdi_fuel_map',
        name: 'Fuel Injection Map',
        category: 'fuel',
        desc: 'Base fuel injection. Porsche SDI direct injection requires fuel matched to boost. Works with ignition timing for full Stage 1 power on both turbo and NA variants.',
        signatures: [[0x46,0x55,0x45,0x4C,0x53,0x44,0x49], [0x49,0x4E,0x4A,0x53,0x44,0x49]],
        sigOffset: 2,
        rows: 16, cols: 20, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'ms',
        stage1: { multiplier: 1.06 },
        stage2: { multiplier: 1.12 },
        stage3: { multiplier: 1.18, clampMax: 60000 },
        critical: true, showPreview: true,
      },
      {
        id: 'sdi_torque_limit',
        name: 'Max Torque Limit',
        category: 'torque',
        desc: 'Software torque ceiling. SDI9/SDI21 applies a conservative torque limit protecting the PDK gearbox on Cayenne and Macan — must be raised alongside boost for Stage 1.',
        signatures: [[0x4D,0x58,0x54,0x52,0x51,0x50,0x53], [0x54,0x51,0x4C,0x49,0x4D,0x50]],
        sigOffset: 2,
        rows: 1, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.12 },
        stage2: { multiplier: 1.20 },
        stage3: { multiplier: 1.30, clampMax: 65000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ─── Continental SIMOS11.1 (VAG petrol, older DI) ─────────────────────────
  {
    id: 'continental_simos11',
    name: 'Continental SIMOS11.x (VAG direct injection petrol)',
    manufacturer: 'Continental',
    family: 'SIMOS11',
    // SIMOS11.1 and SIMOS11.2 are Continental TC1738-based petrol ECUs for older VAG
    // direct injection engines (pre-SIMOS18). Used in Golf VI/Jetta/Tiguan/Passat B6/B7
    // with TSI/TFSI 1.4/1.8/2.0 engines (CAWB/CDAA/CPTA/CBZA variants).
    // SIMOS11 calibration variant codes ARE embedded as ASCII in the ROM identification header.
    identStrings: ['SIMOS11.2', 'SIMOS11.1', 'SIMOS11', 'SIM11'],
    fileSizeRange: [524288, 2097152],
    vehicles: [
      'VW Golf VI 1.4 TSI 122/160ps (CAVD/CAXA)',
      'VW Golf VI 2.0 TSI 200/211ps GTI (CCZA/CCZB)',
      'VW Passat B6/B7 1.8/2.0 TSI 160/200ps',
      'VW Tiguan Mk1 1.4/2.0 TSI 122/200ps',
      'VW Jetta VI 1.4/2.0 TSI 122/200ps',
      'Audi A1/A3 1.4 TFSI 122ps (CAXA)',
      'Skoda Octavia Mk2 1.4/1.8/2.0 TSI',
      'Seat Leon Mk2 FR 1.8/2.0 TSI 160/200ps',
    ],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0,
    checksumLength: 4,
    maps: [
      {
        id: 'simos11_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'Boost setpoint map. SIMOS11 Golf GTI 2.0 TSI CCZA is very boost-responsive — significant Stage 1 gains from boost map alone without hardware changes. Critical primary map.',
        signatures: [[0x42,0x4F,0x4F,0x53,0x54,0x53,0x49], [0x54,0x52,0x42,0x53,0x49,0x4D]],
        sigOffset: 2,
        rows: 12, cols: 16, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.12 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.32, clampMax: 55000 },
        critical: true, showPreview: true,
      },
      {
        id: 'simos11_fuel_map',
        name: 'Fuel Injection Map',
        category: 'fuel',
        desc: 'Base fuel injection. SIMOS11 direct injection requires fuel matched to boost — TSI engines run stratified charge at low load, homogeneous at full load. Stage 1 targets full-load region.',
        signatures: [[0x46,0x55,0x45,0x4C,0x53,0x49,0x4D], [0x49,0x4E,0x4A,0x53,0x49,0x4D,0x31]],
        sigOffset: 2,
        rows: 12, cols: 16, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'ms',
        stage1: { multiplier: 1.08 },
        stage2: { multiplier: 1.14 },
        stage3: { multiplier: 1.20, clampMax: 60000 },
        critical: true, showPreview: true,
      },
      {
        id: 'simos11_torque_limit',
        name: 'Max Torque Limit',
        category: 'torque',
        desc: 'Software torque ceiling. SIMOS11 DSG torque limiting is very conservative on the Golf GTI — raising this unlocks the full Stage 1 power band and eliminates DSG hesitation under load.',
        signatures: [[0x4D,0x58,0x54,0x52,0x51,0x53,0x49], [0x54,0x51,0x4C,0x49,0x4D,0x53,0x31]],
        sigOffset: 2,
        rows: 1, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.18 },
        stage2: { multiplier: 1.28 },
        stage3: { multiplier: 1.38, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'simos11_ignition',
        name: 'Ignition Timing Map',
        category: 'ignition',
        desc: 'Spark advance map. TSI direct injection tolerates additional advance well on 98 RON — ignition timing increases are recommended alongside boost and fuel for Stage 2+ tunes.',
        signatures: [[0x49,0x47,0x4E,0x54,0x49,0x4D,0x53], [0x5A,0x5A,0x57,0x53,0x49,0x4D]],
        sigOffset: 2,
        rows: 12, cols: 16, dtype: 'int16', le: true,
        factor: 0.1, offsetVal: 0, unit: '°',
        stage1: { addend: 2 },
        stage2: { addend: 3 },
        stage3: { addend: 4, clampMax: 400 },
        addonOverrides: {
          popcorn: { addend: -150, clampMin: -400, lastNCols: 2 },
        },
        critical: false, showPreview: false,
      },
      {
        id: 'simos11_rev_limit',
        name: 'RPM Hardcut Limiter',
        category: 'limiter',
        // Stock Golf GTI 2.0 TSI CCZA/CCZB: ~7000 RPM; 1.4 TSI CAVD/CAXA: ~6800 RPM.
        // A2L symbol consistent with SIMOS10/SIMOS18 family: nEngCutOff / nMaxCut.
        // 1-cell uint16 LE, factor 1 (raw = RPM). Launch control 2-step at 4000 RPM.
        desc: 'Engine RPM hard-cut limiter for SIMOS11.x (Golf GTI / Jetta / Passat TSI). Stock 2.0 TSI CCZA limit is ~7000 RPM; 1.4 TSI variants typically 6800 RPM. Raise in +200–400 RPM increments only — valve-float and rod-bearing limits apply. A2L symbol: nEngCutOff / nMaxCut / EngSpd_nMaxCut.',
        a2lNames: ['nEngCutOff', 'nMaxCut', 'EngSpd_nMaxCut', 'nEngMax'],
        signatures: [
          [0x6E,0x45,0x6E,0x67,0x43,0x75,0x74,0x4F,0x66,0x66], // "nEngCutOff"
          [0x6E,0x4D,0x61,0x78,0x43,0x75,0x74],                 // "nMaxCut"
        ],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'RPM',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: {
          launchcontrol: { multiplier: 0, addend: 4000, clampMax: 4500 },  // 2-step at 4000 RPM
          revlimit: { addend: 400, clampMax: 8000 },                        // +400 RPM, 8000 hard ceiling
        },
        critical: false, showPreview: false,
      },
    ],
  },

]

// ─── Add-on definitions ───────────────────────────────────────────────────────
export interface AddonDef {
  id: string
  name: string
  desc: string
  mapTargets: string[]   // map IDs that this addon modifies
  warning?: string
  compatEcus?: string[]  // if empty = all ECUs
}

export const ADDONS: AddonDef[] = [
  {
    id: 'popbang',
    name: 'Pop & Bang',
    desc: 'Petrol only. Crackle and pops on overrun / lift-off (throttle closed, decelerating). Works by retarding ignition timing during overrun so unburnt fuel ignites in the exhaust. Sets CWSAWE=1, retards KFZWOP to −20° after TDC, and extends KFTVSA fuel cutoff delay. Cannot be combined with Popcorn Limiter (which fires at the rev limit on full throttle) — select one or the other.',
    mapTargets: ['me7_kfzwop', 'me7_kfzwmn', 'me7_cwsawe', 'me7_kftvsa'],
    compatEcus: ['me7'],  // confirmed ME7.5 symbols; MED17 requires code-level intervention (not map-only)
    warning: 'Not compatible with intact catalytic converters — will overheat and destroy cat. Decat required for aggressive settings.',
  },
  {
    id: 'dpf',
    name: 'DPF Off',
    desc: 'Software DPF removal. Zeroes regeneration thresholds and disables forced regen cycles. Requires physical DPF removal.',
    // compatEcus limited to ECUs with actual DPF regen map signatures.
    // DCM35/DCM61/EMS3120/PCR21 have DPF hardware but signatures are not yet mapped.
    mapTargets: ['edc16_dpf_regen', 'edc17_dpf_regen'],
    compatEcus: ['edc16', 'edc17'],
    warning: 'Illegal on public roads in most jurisdictions. Off-road / track use only.',
  },
  {
    id: 'egr',
    name: 'EGR Delete',
    desc: 'EGR flow zeroed in software. Reduces intake carbon buildup, lowers intake temps, improves throttle response.',
    mapTargets: [
      'edc15_egr_map', 'edc16_egr_map', 'edc17_egr_map', 'med17_egr_duty',
      'dcm35_egr', 'ems3120_egr', 'pcr21_egr',
      'delphi_crd3_egr', 'sid803_egr', 'ppd1_egr',
    ],
    warning: 'May trigger emissions fault codes without a physical EGR blank.',
  },
  {
    id: 'launchcontrol',
    name: 'Launch Control',
    desc: 'Set-RPM flat-foot launches. Holds RPM at 2-step target while building boost before release. Sets the rev limiter to a fixed 2-step RPM (diesel: 3500 RPM, turbo petrol: 3500–4000 RPM) via fuel cut while throttle is floored.',
    mapTargets: [
      'edc15_rev_limit', 'edc16_rev_limit', 'edc17_rev_limit',
      'simos18_rev_limit', 'simos10_rev_limit', 'simos11_rev_limit', 'sim2k_rev_limit',
      'me7_rev_limit', 'ms43_rev_limit', 'me9_rev_limiter',
      'mg1_rev_limit', 'med17_rev_limit',
    ],
    warning: 'Increases drivetrain stress significantly. Not recommended for stock clutch on Stage 2+. Full launch control requires additional clutch switch or brake input wiring.',
  },
  {
    id: 'revlimit',
    name: 'Rev Limiter Raise',
    desc: 'Raises the engine RPM hard-cut limiter. Diesel engines: +300 RPM to allow full use of the power band post-tune. Petrol/turbo petrol: +400–500 RPM for improved top-end delivery. Launch control and track use. Does not affect 2-step launch control RPM (set separately).',
    mapTargets: [
      'edc15_rev_limit', 'edc16_rev_limit', 'edc17_rev_limit',
      'simos18_rev_limit', 'simos10_rev_limit', 'simos11_rev_limit', 'sim2k_rev_limit',
      'me7_rev_limit', 'ms43_rev_limit', 'me9_rev_limiter',
      'med17_rev_limit', 'mg1_rev_limit',
    ],
    warning: 'Do not exceed engine mechanical limits or valve-float RPM. Consult your engine builder on modified builds.',
  },
  {
    id: 'overboost',
    name: 'Overboost Protection Raise',
    desc: 'Raises the boost pressure fuel-cut threshold (pBoostMax / LDRMAX). The standard tune already raises this proportionally with stage — this option adds extra headroom for aggressive setups, high-altitude driving, or when running elevated boost beyond the standard stage map.',
    mapTargets: [
      'edc15_overboost_cut', 'edc16_overboost_cut', 'edc17_overboost_cut',
      'simos18_overboost_cut', 'simos10_overboost_cut', 'sim2k_overboost_cut',
      'me7_overboost_cut', 'med17_overboost_cut', 'me9_overboost_cut', 'mg1_overboost_cut',
    ],
    warning: 'Do not raise beyond safe turbocharger and intercooler limits. Monitor boost pressure on a data logger before increasing further.',
  },
  {
    id: 'popcorn',
    name: 'Popcorn Limiter',
    desc: 'Petrol and diesel. Aggressive hardcut fuel cut at the rev limit — RPM bounces rapidly off the limiter creating a sharp, rhythmic machine-gun popping sound at the top of the rev range. '
      + 'Diesel: the effect comes from the ECU\'s hardcut fuel cut at NMAX. No additional map changes are made — the hardcut is already the mechanism. '
      + 'Petrol: hardcut at the rev limit is combined with ignition retard in the 2 highest RPM cells, creating more aggressive and frequent pops. '
      + 'Cannot be combined with Pop & Bang (select one or the other).',
    mapTargets: [
      // Petrol — ignition retard at top RPM cells amplifies the hardcut pops
      'me7_kfzw', 'me7_kfzwmn',
      'med17_ign_timing', 'mg1_ignition', 'sim2k_ignition',
      'ms43_ignition', 'simos11_ignition',
      // Diesel — hardcut at NMAX is the sole mechanism (no ignition maps); listed for tuner visibility
      'edc15_rev_limit', 'edc16_rev_limit', 'edc17_rev_limit',
    ],
    warning: 'Petrol: retards ignition ~15° in high-RPM cells — do not use with stock catalytic converters (risk of overheating). Decat or sports cat required. Diesel: effect is natural to the hardcut rev limiter — no additional risk beyond standard rev limit raise.',
  },
  {
    id: 'speedlimiter',
    name: 'Speed Limiter Off',
    desc: 'Factory speed limiter removed. Maximum speed cap set to maximum allowable value.',
    mapTargets: [
      'edc15_speed_limit', 'edc16_speed_limit', 'edc17_speed_limit', 'med17_speed_limit',
      'me7_speed_limit', 'me9_speed_limit', 'ms43_speed_limit',
      'simos18_speed_limit', 'simos10_speed_limit',
      'mg1_speed_limit', 'sim2k_speed_limit',
      'scania_speed_limit', 'dcm34_speed_limit',
    ],
    warning: 'For track days and private roads only.',
  },
  {
    id: 'adblue',
    name: 'AdBlue / SCR Delete',
    desc: 'Disables DEF/AdBlue injection, SCR catalyst efficiency monitor, and speed derate caused by low DEF level.',
    mapTargets: [],
    compatEcus: ['edc17', 'dcm61', 'dcm35'],
    warning: 'For off-road / agricultural use only. Illegal on public roads in most jurisdictions.',
  },
  {
    id: 'dpf_sensors',
    name: 'DPF Sensors Off',
    desc: 'Disables DPF differential pressure and temperature sensor monitoring. Required after physical DPF removal to suppress fault codes.',
    mapTargets: [],
    compatEcus: ['edc16', 'edc17', 'dcm35', 'dcm61', 'ems3120', 'pcr21'],
  },
  {
    id: 'egr_dtcs',
    name: 'EGR DTCs Delete',
    desc: 'Suppresses all EGR-related fault codes (P0401–P0408). Required when EGR valve / cooler hardware is removed.',
    mapTargets: [],
  },
  {
    id: 'cat',
    name: 'Cat Monitor Off',
    desc: 'Disables downstream O2 sensor catalyst efficiency monitor. Eliminates P0420/P0430 CEL after cat removal.',
    mapTargets: [],
  },
  {
    id: 'sai',
    name: 'SAI Delete',
    desc: 'Disables Secondary Air Injection pump operation and monitoring. Common on VAG petrol engines post-2000.',
    mapTargets: [],
  },
  {
    id: 'evap',
    name: 'EVAP Off',
    desc: 'Disables EVAP purge valve operation and fuel tank evaporation leak detection monitoring.',
    mapTargets: [],
  },
]
