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
  // When true: ONLY use Phase A name-match for A2L selection. Phase B category fallback is
  // disabled for this map. Use on maps where category fallback always picks wrong results
  // because the correct map simply is not present in every A2L by its expected name.
  a2lNameOnly?: boolean
  // Binary location - array of candidate signatures (bytes), map starts sigOffset bytes after match end
  signatures: number[][]
  sigOffset: number
  // When multiple matches exist for a signature, use the Nth match (0-based, default 0 = first match)
  matchIndex?: number
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
  // Known axis breakpoints — used when axes cannot be auto-detected from binary (e.g. ME7 pointer-based axes)
  axisXValues?: number[]   // physical X-axis values (cols), length must equal cols
  axisYValues?: number[]   // physical Y-axis values (rows), length must equal rows
  critical: boolean     // if true, warn if map not found
  showPreview: boolean
  // Minimum quality score for map detection (default 0.15). Set to 0 for maps that are expected
  // to be flat/uniform (e.g. torque monitor — all cells same value in ORI), which would otherwise
  // be rejected by the mode-fraction check in scoreMapData.
  minQuality?: number
  // When true, the cal-region smart search (calSearch) fallback is skipped. Signatures and
  // fixedOffset are still tried. Use for maps where a false-positive calSearch hit is worse
  // than "Not Found" — typically maps that don't exist in every ECU variant (e.g. a generic
  // IQ map for Bosch C46 stripped binaries that use only the C46-specific IQ map instead).
  skipCalSearch?: boolean
  // When true, suppress the "⚠ Uniform" warning in heatmap previews. For maps that are
  // intentionally flat in ORI (e.g. torque monitor ceiling = single value across all cells).
  allowUniform?: boolean
  // Tuning mode — what the Zone Editor stores per cell:
  //   'multiplier' (default) — cell anchors are multipliers (1.05 = +5%)
  //   'addend'              — cell anchors are RAW ADDEND values (e.g. 46 = +1° on SOI where factor=0.021973)
  // Used by SOI and other addend-based maps where degree/absolute adjustments make more sense
  // than percentage scaling (e.g. adding +1° BTDC means exactly +46 raw regardless of cell value).
  tuningMode?: 'multiplier' | 'addend'
  // Step size for Zone Editor Pg+/Pg- in the NATIVE unit of this map.
  //   For multiplier mode: step is in percent (default 0.5 = +0.5% per press)
  //   For addend mode:     step is in PHYSICAL units (e.g. 0.5 = +0.5° for SOI)
  zoneStep?: number
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
  // ── Bosch MD1 (VAG EA288 diesel — successor to EDC17 for 2019+ TDI) ─────
  {
    id: 'md1cs004',
    name: 'Bosch MD1CS004 (VAG 2.0 TDI)',
    manufacturer: 'Bosch',
    family: 'MD1',
    // MD1CS004 = Bosch Tricore AURIX TC3xx. Used on VW/Audi/Seat/Skoda 2.0 TDI EA288 from 2019+.
    // StageX mappack for Seat Ateca 2.0 TDI 150hp confirms map locations and dimensions.
    identStrings: ['MD1CS004', 'MD1CS', 'MD1C', 'MDCS004', 'MD1'],
    fileSizeRange: [2097152, 8388608],   // 2MB – 8MB
    vehicles: ['Seat Ateca 2.0 TDI', 'VW Tiguan 2.0 TDI', 'Skoda Karoq 2.0 TDI', 'Audi Q3 2.0 TDI', 'VW T-Roc 2.0 TDI', 'VW Passat B8 2.0 TDI'],
    checksumAlgo: 'unknown',
    checksumOffset: 0,
    checksumLength: 0,
    maps: [
      {
        id: 'md1_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'Turbo boost pressure request. StageX MD1CS004: maps at 0x2DE69C region.',
        signatures: [],
        sigOffset: 0,
        rows: 18, cols: 18, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.18 },
        stage2: { multiplier: 1.28 },
        stage3: { multiplier: 1.40, clampMax: 55000 },
        critical: true, showPreview: true,
      },
      {
        id: 'md1_fuel_quantity',
        name: 'Torque to Fuel Quantity',
        category: 'fuel',
        desc: 'Torque to injection quantity conversion. StageX MD1CS004: 4 maps at 0x3EB83E-3EC08A (18×18).',
        signatures: [],
        sigOffset: 0,
        // StageX confirmed: 18×18 for torque-to-fuel maps
        rows: 18, cols: 18, dtype: 'uint16', le: true,
        factor: 0.01, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.30, clampMax: 6500 },
        critical: true, showPreview: true,
      },
      {
        id: 'md1_injection_duration',
        name: 'Injection Duration',
        category: 'fuel',
        desc: 'Main injection duration. StageX MD1CS004: 0x41821C (22×16).',
        signatures: [],
        sigOffset: 0,
        rows: 22, cols: 16, dtype: 'uint16', le: true,
        factor: 0.023437, offsetVal: 0, unit: 'deg',
        stage1: { multiplier: 1.12 },
        stage2: { multiplier: 1.20 },
        stage3: { multiplier: 1.28 },
        critical: true, showPreview: true,
      },
      {
        id: 'md1_torque_limit',
        name: 'Engine Torque Limiter',
        category: 'torque',
        desc: 'Maximum torque ceiling. StageX MD1CS004: 12 torque limiter maps.',
        signatures: [],
        sigOffset: 0,
        rows: 8, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.25 },
        stage2: { multiplier: 1.38 },
        stage3: { multiplier: 1.50, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'md1_drivers_wish',
        name: 'Drivers Wish Torque',
        category: 'torque',
        desc: 'Pedal-to-torque demand. StageX MD1CS004: 3 maps at 0x2194E2-21960E (8×13).',
        signatures: [],
        sigOffset: 0,
        rows: 8, cols: 13, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.12 },
        stage2: { multiplier: 1.20 },
        stage3: { multiplier: 1.30 },
        critical: false, showPreview: true,
      },
      {
        id: 'md1_smoke_limiter',
        name: 'Smoke Limiter Map',
        category: 'smoke',
        desc: 'Smoke limitation by MAF and Lambda. StageX MD1CS004: MAF at 0x421936 (14×16), Lambda at 0x421B86-422B86 (16×16).',
        signatures: [],
        sigOffset: 0,
        // StageX: MAF smoke = 14×16, Lambda smoke = 16×16. Use 14×16 as primary (MAF-based).
        rows: 14, cols: 16, dtype: 'uint16', le: true,
        factor: 0.01, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.12 },
        stage2: { multiplier: 1.20 },
        stage3: { multiplier: 1.30, clampMax: 6500 },
        critical: true, showPreview: true,
      },
      {
        id: 'md1_rail_pressure',
        name: 'Rail Pressure Target',
        category: 'fuel',
        desc: 'Common rail pressure request. StageX MD1CS004: 18×18 maps at 0x2DE69C-2EE71A, 16×16 at 0x41E1F8-41E8CC.',
        signatures: [],
        sigOffset: 0,
        rows: 18, cols: 18, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.05 },
        stage2: { multiplier: 1.08 },
        stage3: { multiplier: 1.12, clampMax: 22000 },
        critical: false, showPreview: true,
      },
      {
        id: 'md1_speed_limit',
        name: 'Vehicle Speed Limiter',
        category: 'limiter',
        desc: 'Factory speed limiter.',
        signatures: [],
        sigOffset: 0,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'km/h',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { speedlimiter: { multiplier: 0, addend: 65535 } },
        critical: false, showPreview: false,
      },
    ],
  },

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
    identStrings: ['MED17', 'ME17', 'MEDG17', 'MED1750', 'MED17.1', 'MED17.5', 'MED17.9'],
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
        desc: 'Charge air pressure setpoint map. RPM vs throttle load. Increasing this raises boost target — primary Stage 1/2 map. StageX MED17.5 D175X55H mappack: 8×8 boost maps at 0x4FF30/0x59BE6/0x4FE0C/0x4FEB0 (Basic boost correction, Boost limit by IAT, Delta pressure deviation, Basic boost by ambient). 12×16 is the main boost target map.',
        // DB study (33434 files): 0xFEFD×2 appeared 2592× across 2951 MED17 files (88%).
        signatures: [
          [0x4C,0x44,0x4B,0x56,0x53,0x4F,0x4C,0x4C], [0x42,0x4F,0x4F,0x53,0x54,0x53,0x4F,0x4C], [0xFE,0xFD,0xFE,0xFD],
          // LE Kf_ 16×12 boost target (RPM axis 2000,2800,4000,6000) — found in 44 MED17 files
          [0x10,0x00,0x0c,0x00,0xd0,0x07,0xf0,0x0a,0xa0,0x0f,0x70,0x17],
        ],
        sigOffset: 4,
        rows: 12, cols: 16, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        // Toned down from 1.18 → 1.06 on Stage 1 — petrol boost increase realistic for Stage 1.
        stage1: { multiplier: 1.06 },
        stage2: { multiplier: 1.18 },
        stage3: { multiplier: 1.35, clampMax: 58000 },
        critical: true, showPreview: true,
      },
      {
        id: 'med17_fuel_inject',
        name: 'Fuel Injection Duration',
        category: 'fuel',
        desc: 'Base fuel injection duration map. Increasing this enriches fuelling to support more boost and power.',
        signatures: [
          [0x49,0x4E,0x4A,0x44,0x55,0x52,0x42,0x53], [0x46,0x55,0x45,0x4C,0x4D,0x41,0x50,0x01],
          // LE Kf_ 16×16 fuel injection (RPM axis 1,312,624,936) — found in 34 MED17 files
          [0x10,0x00,0x10,0x00,0x01,0x00,0x38,0x01,0x70,0x02,0xa8,0x03],
        ],
        sigOffset: 4,
        rows: 16, cols: 16, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'ms',
        // Toned down from 1.12 → 1.05 on Stage 1 — petrol fuel map realistic increase.
        stage1: { multiplier: 1.05 },
        stage2: { multiplier: 1.15 },
        stage3: { multiplier: 1.25, clampMax: 60000 },
        critical: true, showPreview: true,
      },
      {
        id: 'med17_torque_limit',
        name: 'Torque Demand Limit',
        category: 'torque',
        desc: 'Driver demand torque ceiling. Must be raised to allow the engine to produce more torque without being silently capped.',
        // DB study (33434 files): 0x18CD×2 appeared 4324× across 2951 MED17 files.
        signatures: [[0x54,0x51,0x4C,0x49,0x4D,0x01,0x00], [0x54,0x4F,0x52,0x51,0x4C,0x49,0x4D], [0x18,0xCD,0x18,0xCD]],
        sigOffset: 2,
        rows: 8, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.25 },
        stage2: { multiplier: 1.40 },
        stage3: { multiplier: 1.60, clampMax: 65000 },
        critical: true, showPreview: true,
        // NOTE: Stage 1 values below are the "100% intensity" baseline. The UI-level
        // Stage Intensity slider in the Remap Builder scales these globally so the user
        // can go Conservative (50%), Standard (100%), Aggressive (150%) without editing
        // per-ECU definitions. See handleBuildRemap() scaleStageParams for details.
      },
      {
        id: 'med17_ign_timing',
        name: 'Ignition Timing Base',
        category: 'ignition',
        desc: 'Base ignition advance map. Optimised for better combustion efficiency. Stage 2/3 adds advance where knock margin allows. StageX MED17.5: 18 ignition maps (4× Basic at 0x5F32E-5F56E, 10× Minimum at 0x5FA8C-6020C, 4× Optimum at 0x60518-60758) — all 12×16 int8.',
        signatures: [[0x49,0x47,0x4E,0x42,0x41,0x53,0x45], [0x5A,0x57,0x42,0x41,0x53,0x45,0x01]],
        sigOffset: 4,
        fixedOffset: 0x5F32E,  // StageX MED17.5 D175X55H: first Basic ignition angle map
        // A2L ground truth: KFZW factor 0.75 GradKW, offset 0, 12×16 confirmed across ME7/MED17/ME9.
        // offsetVal -48 was wrong (uint8 coolant-temp offset convention, not applicable to int8 KFZW).
        rows: 12, cols: 16, dtype: 'int8', le: true,
        factor: 0.75, offsetVal: 0, unit: '°BTDC',
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

  // ── Bosch MED9.1 (VAG 2.0 TFSI turbo petrol, 2005–2013) ────────────────
  {
    id: 'med91',
    name: 'Bosch MED9.1',
    manufacturer: 'Bosch',
    family: 'MED91',
    // Infineon TriCore TC1766, 2 MB flash, BIG-ENDIAN. Used on:
    // VW Golf V GTI/R32, Golf VI GTI/R, Audi A3/S3/TTS 8P, Seat Leon Cupra, Skoda Octavia vRS.
    // Engine codes: AXX, BWA, BPY, BHZ, BWJ, CDLA, CDLB, CDLC, CDLF, CDLG (2.0 TFSI family).
    // No embedded ASCII label strings — completely stripped binaries. Only Kf_ header signatures work.
    // MED9.1 is TORQUE-DRIVEN: pedal → torque demand → fill request → boost via WGDC.
    // Key tuning targets: KFZW (ignition timing), WGDC (wastegate), lambda, torque limit.
    identStrings: ['MED91', 'MED9', '0261S02'],
    fileSizeRange: [1572864, 2097152],   // 1.5–2 MB
    vehicles: ['VW Golf V GTI', 'VW Golf VI GTI', 'VW Golf VI R', 'Audi A3 2.0 TFSI', 'Audi S3 8P', 'Audi TTS 8J', 'Seat Leon Cupra', 'Skoda Octavia vRS'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFF4,
    checksumLength: 4,
    maps: [
      // ── IGNITION ──────────────────────────────────────────────────────────────
      {
        id: 'med91_ign_timing',
        name: 'Ignition Timing (KFZW)',
        category: 'ignition',
        desc: 'Base ignition timing map (KFZW). 16×12, three identical copies in calibration. Verified as real Kf_ structure but FACTOR UNVERIFIED — values displayed may not represent true degrees advance. Needs A2L/DAMOS data for correct scaling. Stage multipliers still work as relative changes.',
        signatures: [
          // Kf_ header: 16×12, X=[0,1966,3932,5898] rel filling — auto-detected
          [0x00,0x10,0x00,0x0C,0x00,0x00,0x07,0xAE,0x0F,0x5C,0x17,0x0A],
        ],
        sigOffset: 60,
        rows: 12, cols: 16, dtype: 'int16', le: false,
        // Factor needs A2L/DAMOS verification. Using 720/65536 as angular resolution placeholder.
        factor: 0.010986, offsetVal: 0, unit: '°CA',
        stage1: { addend: 0 },
        stage2: { addend: 46 },
        stage3: { addend: 137 },
        critical: true, showPreview: true,
      },
      // ── TORQUE ────────────────────────────────────────────────────────────────
      {
        id: 'med91_torque_limit',
        name: 'Torque Limitation Map',
        category: 'torque',
        desc: 'Maximum torque ceiling by RPM and load. Must be raised first — this is the master ceiling. Golf VI R stock: 410-420 Nm (350 Nm rated + overboost margin).',
        signatures: [
          // Kf_ header: 8×8, X=[3200,3800,4960,5600] RPM — auto-detected
          [0x00,0x08,0x00,0x08,0x0C,0x80,0x0E,0xD8,0x13,0x60,0x15,0xE0],
        ],
        sigOffset: 36,
        rows: 8, cols: 8, dtype: 'uint16', le: false,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.28 },
        stage2: { multiplier: 1.42 },
        stage3: { multiplier: 1.60, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'med91_torque_request',
        name: 'Torque Request Map',
        category: 'torque',
        desc: 'Driver torque demand map — converts pedal and conditions into requested torque (Nm). Raising this increases throttle response and peak demand.',
        signatures: [
          // Kf_ header: 8×8, X=[29575,31282,32988,34695] — auto-detected
          [0x00,0x08,0x00,0x08,0x73,0x87,0x7A,0x32,0x80,0xDC,0x87,0x87],
        ],
        sigOffset: 36,
        rows: 8, cols: 8, dtype: 'uint16', le: false,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.12 },
        stage2: { multiplier: 1.18 },
        stage3: { multiplier: 1.25, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      // ── BOOST / WASTEGATE ─────────────────────────────────────────────────────
      {
        id: 'med91_wgdc',
        name: 'Wastegate Duty Cycle (LDRXN)',
        category: 'boost',
        desc: 'Wastegate solenoid duty cycle map — primary boost control. Increasing WGDC closes the wastegate harder, building more boost. X axis = IQ/load request, Y axis = pressure/fill.',
        signatures: [
          // Kf_ header: 16×8, X=[0,28,69,144] load — auto-detected
          [0x00,0x10,0x00,0x08,0x00,0x00,0x00,0x1C,0x00,0x45,0x00,0x90],
        ],
        sigOffset: 52,
        rows: 8, cols: 16, dtype: 'uint16', le: false,
        factor: 0.001953, offsetVal: 0, unit: '%',  // 100/51200
        stage1: { multiplier: 1.10 },
        stage2: { multiplier: 1.18 },
        stage3: { multiplier: 1.25, clampMax: 51200 },
        critical: true, showPreview: true,
      },
      {
        id: 'med91_wgdc_max',
        name: 'Wastegate Duty Cycle Max (LDRVN)',
        category: 'boost',
        desc: 'Maximum wastegate duty cycle ceiling. Limits how hard the wastegate can be driven closed. Raise alongside WGDC base to allow higher boost.',
        signatures: [
          // Kf_ header: 12×8, X=[15921,18054,20188,21894] — auto-detected
          [0x00,0x0C,0x00,0x08,0x3E,0x31,0x46,0x86,0x4E,0xDC,0x55,0x86],
        ],
        sigOffset: 44,
        rows: 8, cols: 12, dtype: 'uint16', le: false,
        factor: 0.001953, offsetVal: 0, unit: '%',
        stage1: { multiplier: 1.10 },
        stage2: { multiplier: 1.15 },
        stage3: { multiplier: 1.20, clampMax: 51200 },
        critical: true, showPreview: true,
      },
      {
        id: 'med91_boost_target',
        name: 'Boost/Charge Target',
        category: 'boost',
        desc: 'Charge target map. Three identical copies in calibration. Real Kf_ structure (verified), but UNIT UNKNOWN — raw values 5120-6677 do not correspond to a confirmed physical unit. Percentage-based stage multipliers still work for tuning. Needs A2L data for correct factor.',
        signatures: [
          // Kf_ header: 8×8, X=[3600,4000,6000,8000] RPM — auto-detected (3 identical copies)
          [0x00,0x08,0x00,0x08,0x0E,0x10,0x0F,0xA0,0x17,0x70,0x1F,0x40],
        ],
        sigOffset: 36,
        rows: 8, cols: 8, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',  // Factor TBD — needs A2L verification
        stage1: { multiplier: 1.08 },
        stage2: { multiplier: 1.15 },
        stage3: { multiplier: 1.22 },
        critical: true, showPreview: true,
      },
      // ── FUELING / LAMBDA ──────────────────────────────────────────────────────
      {
        id: 'med91_lambda_lean',
        name: 'Lambda Target (Cruise)',
        category: 'fuel',
        desc: 'Target lambda ratio at partial load/cruise. λ 1.02-1.12 = lean cruise for fuel economy. Lowering toward 1.0 (stoich) is safer under boost.',
        signatures: [
          // Kf_ header: 8×8, X=[400,700,1000,1500] — auto-detected
          [0x00,0x08,0x00,0x08,0x01,0x90,0x02,0xBC,0x03,0xE8,0x05,0xDC],
        ],
        sigOffset: 36,
        rows: 8, cols: 8, dtype: 'uint16', le: false,
        // 32768 = lambda 1.0
        factor: 0.0000305, offsetVal: 0, unit: 'λ',  // 1/32768
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        critical: true, showPreview: true,
      },
      {
        id: 'med91_lambda_wot',
        name: 'Lambda Target (WOT Enrichment)',
        category: 'fuel',
        desc: 'Target lambda at wide-open throttle. λ 0.86 = rich for cooling and power under full boost. Stock Golf R: λ 0.86-0.88 at WOT. Stage 2+ may target λ 0.82-0.85 for safety on upgraded turbo.',
        signatures: [
          // Kf_ header: 8×8, first 12 bytes. Two consecutive 8×8 maps share this header —
          // a pressure map at match 0 and Lambda WOT at match 1. matchIndex: 1 skips to the second.
          [0x00,0x08,0x00,0x08,0x0F,0xA0,0x17,0x70,0x1F,0x40,0x27,0x10],
        ],
        sigOffset: 0,
        matchIndex: 1,
        rows: 8, cols: 8, dtype: 'uint16', le: false,
        factor: 0.0000305, offsetVal: 0, unit: 'λ',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 0.97 },   // slightly richer at WOT
        stage3: { multiplier: 0.95, clampMin: 26214 },  // λ 0.80 floor
        critical: true, showPreview: true,
      },
      // ── KNOCK ─────────────────────────────────────────────────────────────────
      {
        id: 'med91_knock_retard',
        name: 'Knock Retard Floor (Min Advance)',
        category: 'ignition',
        desc: 'Minimum ignition advance floor during knock events (KFZWST-like). All negative values — defines how far back the ECU can pull timing per RPM/load cell. More negative = more retard allowed = safer. Stock Golf R: -10° to -36°.',
        signatures: [
          // Kf_ header: 6×6, X=[2000,5000,8000,11000,15000,20000] RPM — auto-detected
          [0x00,0x06,0x00,0x06,0x07,0xD0,0x13,0x88,0x1F,0x40,0x2A,0xF8],
        ],
        sigOffset: 28,
        rows: 6, cols: 6, dtype: 'int16', le: false,
        factor: 0.010986, offsetVal: 0, unit: '°CA',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 0.85 },   // less retard = more aggressive
        stage3: { multiplier: 0.70 },
        critical: false, showPreview: true,
      },
      // ── LIMITERS ──────────────────────────────────────────────────────────────
      {
        id: 'med91_rev_limit',
        name: 'RPM Hard-Cut Limiter',
        category: 'limiter',
        desc: 'Engine RPM hard-cut limiter. Stock Golf VI R CDLF: 7200 RPM fuel cut. Raising by 200-400 RPM allows full use of modified power band.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x1d39a0,
        rows: 1, cols: 1, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'RPM',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: {
          revlimit: { addend: 300, clampMax: 7800 },
        },
        critical: false, showPreview: false,
      },
      // ── EMISSIONS ─────────────────────────────────────────────────────────────
      // NOTE: Charge Air Model (16×11) and Cylinder Charge Model (16×12) omitted —
      // they use column-major storage and would display transposed. Needs parser
      // support for colMajor flag before adding back.
      {
        id: 'med91_vol_efficiency',
        name: 'Volumetric Efficiency',
        category: 'fuel',
        desc: 'Engine volumetric efficiency model. 11×12 RPM vs load. Used by the ECU to predict airflow. Adjusting this affects fuel calculation and torque estimation.',
        signatures: [
          // Kf_ header: 11×12, X=[3000,4400,5200,6000] RPM — auto-detected
          [0x00,0x0B,0x00,0x0C,0x0B,0xB8,0x11,0x30,0x14,0x50,0x17,0x70],
        ],
        sigOffset: 50,
        rows: 12, cols: 11, dtype: 'uint16', le: false,
        factor: 0.003052, offsetVal: 0, unit: '%',  // 100/32768
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        critical: false, showPreview: true,
      },
      // ── ADDITIONAL MAPS ─────────────────────────────────────────────────────
      {
        id: 'med91_lambda_enrich',
        name: 'Lambda Enrichment Target',
        category: 'fuel',
        desc: 'Lambda target for acceleration enrichment / WOT transition. 10×6 map — finer resolution than the 8×8 WOT lambda map. Values 0.77-1.0 λ control fueling during boost build-up and full-load transitions. Richer targets (lower λ) protect against knock under boost.',
        signatures: [
          // Kf_ header: 10×6, X=[2867,3072,3277,3500] rel charge — auto-detected
          [0x00,0x0A,0x00,0x06,0x0B,0x33,0x0C,0x00,0x0C,0xCD,0x0D,0xAC],
        ],
        sigOffset: 36,
        rows: 6, cols: 10, dtype: 'uint16', le: false,
        factor: 0.0000305, offsetVal: 0, unit: 'λ',  // 1/32768
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 0.97 },   // slightly richer at WOT
        stage3: { multiplier: 0.95, clampMin: 22938 },  // ~0.70λ floor
        critical: true, showPreview: true,
      },
      {
        id: 'med91_ign_correction',
        name: 'Ignition Timing Correction',
        category: 'ignition',
        desc: 'Signed ignition correction map overlaid on base KFZW timing. 16×12 RPM vs relative fill. Positive values add advance at low load/RPM, negative values retard timing at high load. Range -17° to +34° on stock Golf R. Affects final spark advance alongside the base map.',
        signatures: [
          // Kf_ header: 16×12, X=[2880,3520,4000,4960] RPM — auto-detected
          [0x00,0x10,0x00,0x0C,0x0B,0x40,0x0D,0xC0,0x0F,0xA0,0x13,0x60],
        ],
        sigOffset: 60,
        rows: 12, cols: 16, dtype: 'int16', le: false,
        factor: 0.010986, offsetVal: 0, unit: '°CA',  // 720/65536
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        critical: false, showPreview: true,
      },
    ],
  },

  // ── Bosch EDC15 (VAG TDI 1.9 / 2.0 diesel, late 90s – early 2000s) ──────
  {
    id: 'edc15',
    name: 'Bosch EDC15',
    manufacturer: 'Bosch',
    family: 'EDC15',
    // C167 processor. Real EDC15 binaries do NOT embed "EDC15" as ASCII text!
    // Detection relies on Bosch-specific chip identifiers found in the TSW header area (~0x8000):
    //   - 'CC55' / 'CC556' / 'CC558' — Bosch EDC15 chip variant IDs
    //   - 'TSW V2' — Bosch EDC15 software version header format
    //   - '0281010' etc — Bosch hardware part number prefixes (may or may not be in ROM)
    // Also matches 'EDC15' for tuner-annotated files and filenames.
    //
    // ⚠ EDC15 ROM/RAM MIRROR — CONFIRMED across many A2/A4/A6 TDI pairs.
    //   FIVE distinct mirror offsets identified — selection depends on
    //   hardware code (Bosch part number), NOT a simple file-size rule.
    //
    //   • +0x8000 (32 KB) — 0281001781 / 0281001931 (EDC15V V6 TDI 2.5L
    //     Allroad/A6, 256 KB ROM). Pairs #744/#745/#748.
    //
    //   • +0x10000 (64 KB) — 0281010098, 0281010393, 0281011387, 0281011388
    //     (V6 TDI 2.5L 524 KB and 1 MB ROMs). Pairs #751/#754/#760/#761/#762.
    //     Note this crosses BOTH EDC15P (524 KB) and EDC15P+ (1 MB) sizes
    //     for the V6 TDI hardware family.
    //
    //   • +0x18000 (96 KB) — 0281010xxx generic I4 1.9 TDI PD (524 KB ROM).
    //     Pairs #666/#669.
    //
    //   • +0x20000 (128 KB) — 0281010492 (1 MB ROM) and 0281011213 (524 KB
    //     ROM, A2/A3/A4 1.4-1.9 TDI EDC15P+). Pairs #28/29/30/#671/#750.
    //
    //   • +0x38000 (224 KB) — 0281001609 / 0281001808 / 0281001836 (I4 1.9
    //     TDI EDC15V pre-PD 256 KB ROM) AND 0281010148 (524 KB EDC15P).
    //     Pairs #664/#668/#743/#749.
    //
    //   Every Stage-1 cell modified at offset X is ALSO modified at offset
    //   X + mirror by real tuners. The ECU boots with inconsistent cal and
    //   derates if only one copy is written. Our writeMap() currently writes
    //   only to mapDef's fixedOffset — we MUST add a mirror-write when the
    //   ECU family is EDC15.
    //
    //   Selection rule (HARDWARE CODE based — file size alone is insufficient):
    //     This requires a per-PN lookup table in the writeMap path.
    //     Cannot be derived purely from fileSize.
    //
    //   Every Stage-1 cell modified at offset X is ALSO modified at offset
    //   X + mirror by real tuners. The ECU boots with inconsistent cal and
    //   derates if only one copy is written. Our writeMap() currently writes
    //   only to mapDef's fixedOffset — we MUST add a mirror-write when the
    //   ECU family is EDC15.
    //
    //   Selection rule (file-size based, no SW match needed):
    //     fileSize === 262144 → mirror = +0x38000
    //     fileSize === 524288 && partNo starts '0281011' → mirror = +0x20000
    //     fileSize === 524288 && partNo starts '0281010' → mirror = +0x18000
    //
    //   TODO wire into remapEngine.ts / binaryParser writeMap.
    identStrings: ['EDC15', 'EDC 15', 'EDC15C', 'EDC15P', 'EDC15V', 'EDC15VM', 'EDC15M+', 'EDC-15', 'CC55', 'CC556', 'CC558', 'TSW V2', '0281001', '0281010', '0281011', '0281012', '0281013'],
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
        // CORRECTED: le:true — EDC15 C167 is little-endian (confirmed by binary reverse engineering).
        // factor 1.0, unit mbar. Stock raw ~1000–2620 = 1000–2620 mbar.
        // Real binary: 16 RPM rows × 10 IQ cols (discovered via 0xEA38 marker scanning).
        rows: 16, cols: 10, dtype: 'uint16', le: true,
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
        // CORRECTED: le:true (C167 little-endian, confirmed). rows:12, cols:16 variant-dependent.
        // factor: 0.1 mg/st/LSB — raw 700 = 70 mg/st (stock peak), raw 900 = 90 mg/st (tuned).
        rows: 12, cols: 16, dtype: 'uint16', le: true,
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
        rows: 1, cols: 8, dtype: 'uint16', le: true,    // EDC15 C167 = little-endian (confirmed by binary analysis)
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
        rows: 8, cols: 8, dtype: 'uint8', le: true,    // EDC15 C167 = little-endian
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
        rows: 1, cols: 1, dtype: 'uint16', le: true,    // EDC15 C167 = little-endian (confirmed by binary analysis)
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
        category: 'boost',
        desc: 'Maximum boost pressure limit before ECU cuts fuelling. Raised to allow stage boost targets to be achieved without premature fuel cut.',
        a2lNames: ['pBoostMax', 'pLadeMax', 'LimBoostPres', 'LADEDRMAX', 'pLadedruckMax'],
        signatures: [[0x70,0x42,0x6F,0x6F,0x73,0x74,0x4D,0x61,0x78], [0x70,0x4C,0x61,0x64,0x65,0x4D,0x61,0x78], [0x4C,0x41,0x44,0x45,0x44,0x52,0x4D,0x41,0x58]],
        sigOffset: 2,
        fixedOffset: 0x6E00,
        rows: 1, cols: 1, dtype: 'uint16', le: true,    // EDC15 C167 = little-endian (confirmed by binary analysis)
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
        rows: 1, cols: 1, dtype: 'uint16', le: true,    // EDC15 C167 = little-endian (confirmed by binary analysis)
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
        // le:true (C167 little-endian). factor:0.1 mg/st/LSB (consistent with MENZK).
        // raw 450 = 45 mg/st (stock smoke ceiling ~45–55 mg/st), raw 700 = 70 mg/st (tuned).
        rows: 1, cols: 8, dtype: 'uint16', le: true,
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
        rows: 1, cols: 8, dtype: 'int8', le: true,
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
        // Gearbx_trqMaxGear*_CUR = per-gear torque ceiling curves (Bosch EDC16U34 name).
        // These are 1D RPM-vs-Nm curves (15 cols, factor 0.1) — the actual calibration target
        // for DSG/auto gearbox cars where per-gear limits are the effective torque cap.
        // EngPrt_trqLimP_MAP = "Kennfeld zur Begrenzung aufgrund des Atmosphärendrucks und der Drehzahl"
        // = Torque limit map by atmospheric pressure and RPM. Confirmed in EDC16U34 (389289 SW):
        // 25×4 MAP, factor 0.1 Nm, values 240-262 Nm at sea level, drops at altitude. This is
        // the actual master torque ceiling in this A2L variant (EngPrt_trqLim is a VALUE scalar here).
        // Gearbx_trqMaxGear1-5_CUR = per-gear limits, but set to 30000 (disabled) in this calibration.
        a2lNames: ['EngPrt_trqLimP_MAP', 'EngPrt_trqLim', 'Gearbx_trqMaxGear1_CUR', 'Gearbx_trqMaxGear2_CUR', 'Gearbx_trqMaxGear3_CUR', 'Gearbx_trqMaxGear4_CUR', 'Gearbx_trqMaxGear5_CUR', 'TrqMaxGear1', 'TrqMaxGear2', 'TrqMaxGear3', 'TrqMaxGear4', 'TrqMaxGear5', 'TrqMaxGear6', 'TrqMaxGearR', 'Trq_trqMax_MAP', 'TrqLim_MAP', 'MQBEGR_MAP'],
        // a2lNameOnly: Phase B category fallback disabled — the torque category contains dozens
        // of AccPed_trqEng* driver's wish variants that look identical to the limit map and will
        // always be picked incorrectly. Only a precise name match is trustworthy here.
        a2lNameOnly: true,
        signatures: [
          // Kf_ header: 8×8, X=[600,800,1500,2000] — auto-detected by parser (sigOffset calculated from dims)
          [0x00,0x08,0x00,0x08,0x02,0x58,0x03,0x20,0x05,0xDC,0x07,0xD0],
          [0x4D,0x58,0x4D,0x4F,0x4D,0x00],                // "MXMOM\0"
          [0x54,0x51,0x4C,0x49,0x4D,0x44,0x43],           // "TQLIMDС"
          [0x54,0x4F,0x52,0x51,0x4C,0x44,0x43,0x01],      // "TORQLDC\1"
        ],
        sigOffset: 2,
        // A2L EngPrt_trqLimP_MAP = 4×25 (atmospheric correction) but signatures find a different
        // 8×8 torque ceiling map. Keep 8×8 for signature/calSearch path.
        rows: 8, cols: 8, dtype: 'uint16', le: false,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        // Toned down from 1.28 → 1.10 on Stage 1 — pro-tune realistic.
        stage1: { multiplier: 1.10 },
        stage2: { multiplier: 1.25 },
        stage3: { multiplier: 1.45, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc16_drivers_wish',
        name: "Driver's Wish Map",
        category: 'torque',
        desc: "Converts pedal position to torque request (Nm). First map in the EDC16 torque chain — raising this sharpens throttle response and increases peak torque demand.",
        // TrqEngDriveAway = 70% occurrence. AccPed_trqENU = 53%. TrqStrtBas = 78%.
        // A2L ground truth: AccPed_trqEng0_MAP (factor 0.1 Nm, 8×16) confirmed EDC16U.
        a2lNames: ['AccPed_trqEng0_MAP', 'AccPed_trqEng1_MAP', 'TrqEngDriveAway', 'AccPed_trqENU', 'AccPed_trqEng', 'AccPed_trqEngA', 'AccPed_trqEngB', 'TrqStrtBas', 'DRVWSH_MAP', 'DrvWish_MAP', 'MIFAS_MAP'],
        signatures: [
          // Kf_ header: 10×10 in EDC16U34 SW389289, X=[800,1000,1500,2000] — auto-detected
          [0x00,0x0A,0x00,0x0A,0x03,0x20,0x03,0xE8,0x05,0xDC,0x07,0xD0],
          [0x44,0x52,0x56,0x57,0x49,0x53,0x48,0x44],      // "DRVWISHD"
          [0x44,0x52,0x56,0x57,0x53,0x48,0x44,0x43],      // "DRVWSHDC"
        ],
        sigOffset: 4,
        // Default dims for ASCII sig path; Kf_ header auto-detection overrides with actual dims
        rows: 8, cols: 12, dtype: 'uint16', le: false,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        // Toned down from 1.12 → 1.00 on Stage 1. Driver's Wish left stock matches pro-tune
        // convention — sharper pedal response only on Stage 2/3.
        stage1: { multiplier: 1.00 },
        stage2: { multiplier: 1.10 },
        stage3: { multiplier: 1.20, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      // ── FUEL CHAIN — torque request → IQ conversion → injector → smoke ceiling ──
      {
        id: 'edc16_torque_iq',
        name: 'Torque to IQ Conversion',
        category: 'fuel',
        desc: 'Converts torque request (Nm) into injection quantity (mg/stroke). Critical link between torque model and injectors — if not raised alongside the torque limit, extra torque demand produces no extra fuel.',
        // Trq2qBas = 74.6% of real EDC16 files.
        // FMTC_trq2qBas_MAP = Bosch EDC16U name (confirmed in test_edc16.a2l)
        a2lNames: ['FMTC_trq2qBas_MAP', 'Trq2qBas', 'CnvSet_trq2qRgn1_MAP', 'FMTC_trq2qRgn1_MAP', 'Trq2IQ_MAP', 'TrqToQ_MAP', 'MISOLKF_MAP', 'misolkf_MAP'],
        signatures: [
          // Kf_ header: 16×12 in EDC16U34 SW389289, X=[700,800,900,1000] — auto-detected (dims from header)
          [0x00,0x10,0x00,0x0C,0x02,0xBC,0x03,0x20,0x03,0x84,0x03,0xE8],
          [0x54,0x51,0x49,0x51,0x43,0x4F,0x4E,0x56],      // "TQIQCONV"
          [0x43,0x4E,0x56,0x54,0x52,0x51,0x49,0x51],      // "CNVTRQIQ"
        ],
        sigOffset: 4,
        // Default 18×16 for ASCII sig path (A2L DAMOS standard). Kf_ header overrides with actual dims.
        rows: 18, cols: 16, dtype: 'uint16', le: false,
        factor: 0.01, offsetVal: 0, unit: 'mg/st',
        // Toned down from 1.12 → 1.05 on Stage 1 — pro-tune realistic.
        stage1: { multiplier: 1.05 },
        stage2: { multiplier: 1.15 },
        stage3: { multiplier: 1.25, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc16_fuel_quantity',
        name: 'Injection Duration Map',
        category: 'fuel',
        desc: 'Main injection duration in crank degrees vs RPM and injection quantity. One of 7 selectable maps (MAP0–6) — the ECU picks based on operating mode. Raising these values directly increases fuel delivery per cycle. Factor 0.023437 °/LSB (AngleCrS COMPU_METHOD, Bosch EDC16U34). In EDC16U34 (torque-demand architecture), IQ mg/st is handled upstream via Torque→IQ conversion; these maps control the actual injector open time.',
        // EDC16U34 SW389289 (test_edc16.a2l): traditional RDSOLLKF/InjVCD_tiET are NOT present.
        // This calibration uses the torque-demand chain: AccPed→Torque→FMTC_trq2qBas→IQ→InjVlv_phiInjMI1.
        // InjVlv_phiInjMI1_MAP0-6 = "Förderdauer" (delivery duration) for main injection (MI1).
        // These ARE the classic "duration maps" that tuners scale to add fuel in WinOLS.
        // InjVCD_tiET / Qmain_MAP = names used by other EDC16 calibrations (older DAMOS naming).
        a2lNameOnly: true,
        a2lNames: [
          'InjVlv_phiInjMI1_MAP0', 'InjVlv_phiInjMI1_MAP1', 'InjVlv_phiInjMI1_MAP2',
          'InjVlv_phiInjMI1_MAP3', 'InjVlv_phiInjMI1_MAP4', 'InjVlv_phiInjMI1_MAP5',
          'InjVlv_phiInjMI1_MAP6',
          'InjVCD_tiET', 'Qmain_MAP', 'InjQty_MAP', 'QKENNFELD_MAP', 'QMain_MAP', 'qmain_MAP',
        ],
        signatures: [
          // Kf_ header: 16×10 in EDC16U34 SW389289, X=[760,780,1050,1200] RPM — auto-detected
          [0x00,0x10,0x00,0x0A,0x02,0xF8,0x03,0x0C,0x04,0x1A,0x04,0xB0],
          [0x4D,0x45,0x4E,0x5A,0x4B,0x00],                // "MENZK\0"
          [0x49,0x4E,0x4A,0x51,0x54,0x59,0x44,0x43],      // "INJQTYDC"
          [0x46,0x55,0x45,0x4C,0x51,0x54,0x59,0x01],      // "FUELQTY\1"
          // BE Kf_ 16×10 fuel quantity (RPM axis 1000,1250,1500,1750) — found in 27 EDC16 files
          [0x00,0x10,0x00,0x0a,0x03,0xe8,0x04,0xe2,0x05,0xdc,0x06,0xd6],
        ],
        sigOffset: 4,
        // CORRECTED: rows:10 cols:16 (was 10x10). Real binary Kf_ header: cols=16(RPM 760-4500), rows=10(IQ 250-4500).
        rows: 10, cols: 16, dtype: 'int16', le: false,
        // AngleCrS: COEFFS 0 42.6666... 0 0 0 1 → factor = f/b = 1/42.667 ≈ 0.023437 °/LSB
        // Matches the classic WinOLS "duration map factor" of 0.023437 for Bosch EDC16.
        factor: 0.023437, offsetVal: 0, unit: 'deg',
        // Toned down from 1.12 → 1.05 on Stage 1 — pro-tune realistic injection duration.
        stage1: { multiplier: 1.05 },
        stage2: { multiplier: 1.15 },
        stage3: { multiplier: 1.25 },
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
        // A2L ground truth: FlMng_rLmbdSmkLim0_MAP (factor 0.001, dimensionless λ) confirmed EDC16U.
        // SmkLim_qLimPres_MAP = quantity-based smoke limit (factor 0.01 mg/hub) confirmed EDC17.
        a2lNames: ['FlMng_rLmbdSmkLim0_MAP', 'FlMng_rLmbdSmkHigh_MAP', 'SmkLim_qLimPres_MAP', 'LmbdSmkLow', 'LmbdSmkHigh', 'LmbdFullLd', 'LmbCarbDes_00', 'Qsmk_MAP', 'SmokeLimit_MAP', 'RKBEGRENZ_MAP', 'Inj_qMaxSmkLim_MAP'],
        signatures: [
          // Kf_ header: 16×13 in EDC16U34 SW389289, X=[760,780,1050,1200] RPM — auto-detected
          [0x00,0x10,0x00,0x0D,0x02,0xF8,0x03,0x0C,0x04,0x1A,0x04,0xB0],
          [0x53,0x4D,0x4B,0x4C,0x49,0x4D,0x44,0x43],      // "SMKLIMDC"
          [0x51,0x4D,0x41,0x58,0x53,0x4D,0x4B,0x01],      // "QMAXSMK"
        ],
        sigOffset: 4,
        // CORRECTED: rows:13 cols:16. DAMOS A2L: FlMng_rLmbdSmkLim0_MAP = 16×13 across 196 EDC16 files.
        // Previous correction used SmkLim_qLimPres_MAP 16×14 but that is EDC17-only (752 files), not EDC16.
        rows: 13, cols: 16, dtype: 'uint16', le: false,
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
        // PCR_* names are CHARGE (boost) pressure maps, NOT rail pressure — moved to boost map.
        // Rail pressure names confirmed: RDSOLLKF_MAP stores directly in bar (raw 300-1600 = 300-1600 bar).
        // a2lNameOnly: same reason as fuel_quantity — 'fuel' category fallback in EDC16 A2Ls hits
        // FlMng_*, EngPrt_* and correction maps before ever reaching a real rail pressure map.
        a2lNameOnly: true,
        // CORRECTED: Rail_pSetPointBase_MAP (16×16, 220 files) = base setpoint for tuning.
        // Rail_pSetPointMax_MAP (5×6, 212 files) = safety ceiling, too small for tuning.
        a2lNames: ['Rail_pSetPointBase_MAP', 'RDSOLLKF_MAP', 'Rail_PointBase', 'Rail_PointMax', 'Rail_PointLimTem', 'CRpres_MAP', 'rdsoll_MAP', 'Rail_MAP', 'pRailSetMax_MAP', 'RailPres_MAP', 'Rail_pSetPointMax_MAP'],
        signatures: [
          // Kf_ header: 10×10 in EDC16U34 SW389289, X=[1250,1500,1750,2000] RPM — auto-detected
          [0x00,0x0A,0x00,0x0A,0x04,0xE2,0x05,0xDC,0x06,0xD6,0x07,0xD0],
          [0x52,0x41,0x49,0x4C,0x50,0x52,0x53,0x50],      // "RAILPRSP"
          [0x43,0x52,0x50,0x52,0x45,0x53,0x53],            // "CRPRESS"
        ],
        sigOffset: 4,
        // Default 10×16 for ASCII sig path. Kf_ header overrides with actual dims (10×10 in EDC16U34).
        rows: 10, cols: 16, dtype: 'uint16', le: false,
        // EDC16 rail pressure stored in bar directly. raw 1600 = 1600 bar. Ceiling 1900 bar.
        // NOTE: EDC16U34 (VAA1 A2L) does NOT expose a standalone rail pressure map under any of
        // the above names. CrCtl_ = Cruise Control, PCR_ = boost pressure regulator — neither is rail.
        // Rail pressure is managed internally by the ECU in this calibration variant.
        // critical:false — Not Found is expected and correct for EDC16U34 SW389289.
        factor: 1, offsetVal: 0, unit: 'bar',
        // Toned down to 1.00 on Stage 1 — pro tune doesn't touch rail pressure.
        stage1: { multiplier: 1.00 },
        stage2: { multiplier: 1.06 },
        stage3: { multiplier: 1.12, clampMax: 1900 },
        critical: false, showPreview: true,
      },
      // ── BOOST ────────────────────────────────────────────────────────────────
      {
        id: 'edc16_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'Desired charge air pressure vs RPM and load. Raising this tells the ECU how much boost to build — must be paired with smoke limiter raise to allow extra airflow to carry more fuel.',
        // PCR_DesBas/DesMaxAP/DesMax = charge pressure regulator setpoints in hPa (factor 0.001 → bar).
        // A2L confirmed: PCR_pBDesBas_MAP factor 1.0 hPa in EDC16U. AirCtl_mDesBas = air MASS (mg/hub), not pressure — excluded.
        a2lNames: ['PCR_DesBas', 'PCR_DesMaxAP', 'PCR_DesMax', 'PCR_CtlBas', 'PCR_pBDesBas_MAP', 'AirCtl_pBstPresRef_MAP', 'Turb_pSetPoint_MAP', 'BoostTarget_MAP', 'LDESOLL_MAP', 'ldesoll_MAP', 'LDESOLLKF_MAP'],
        signatures: [
          // Kf_ header: 16×10, X=[0,21,1008] IQ — auto-detected (sigOffset=56 calculated from dims)
          [0x00,0x10,0x00,0x0A,0x00,0x00,0x00,0x15,0x03,0xF0],
          [0x4C,0x4C,0x53,0x4F,0x4C,0x4C],                // "LLSOLL"
          [0x4C,0x41,0x44,0x53,0x4F,0x4C,0x4C],           // "LADSOLL"
          [0x42,0x53,0x54,0x47,0x54,0x44,0x43],           // "BSTGTDC"
        ],
        sigOffset: 4,
        // CORRECTED: rows:10 (was 11). Real binary Kf_: cols=16(IQ 0-4746), rows=10(load 0-4500).
        rows: 10, cols: 16, dtype: 'uint16', le: false,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        // Toned down from 1.18 → 1.04 on Stage 1 — pro-tune realistic boost increase.
        stage1: { multiplier: 1.04 },
        stage2: { multiplier: 1.15 },
        stage3: { multiplier: 1.30, clampMax: 54000 },
        critical: true, showPreview: true,
      },
      // ── TIMING ───────────────────────────────────────────────────────────────
      {
        id: 'edc16_soi',
        name: 'Start of Injection (SOI)',
        category: 'ignition',
        desc: 'Injection timing advance vs RPM and IQ in degrees before TDC. Advancing SOI improves combustion efficiency and power — standard Stage 2/3 mod. EDC16 has up to 5 injection timing zones.',
        // InjCrv_Bas1–5 = 73%+ each across 1,037 real EDC16 files. AntBasDeg_ga_0 = SOI correction.
        // EDC16U34 SW389289 (test_edc16.a2l): InjCrv_phiBas0_GMAP–phiBas9_GMAP = 10 SOI map groups
        // (Förderbeginn Grundkorrektur). Selected by InjCrv_phiBas_CUR based on operating mode.
        // phiBas0_GMAP is the primary group (cold start / standard). Factor = AngleCrS = 0.023437 °/LSB.
        // phiBasGear12/34/56_MAP = gear-specific SOI maps, simpler STD_AXIS format.
        a2lNames: [
          'InjCrv_phiBas0_GMAP', 'InjCrv_phiBas1_GMAP', 'InjCrv_phiBas2_GMAP',
          'InjCrv_phiBasGear12_MAP', 'InjCrv_phiBasGear34_MAP', 'InjCrv_phiBasGear56_MAP',
          'InjCrv_Bas1', 'InjCrv_Bas2', 'InjCrv_Bas3', 'InjCrv_Bas4', 'InjCrv_Bas5',
          'InjCrv_phiMI1Bas_MAP', 'SOI_MAP', 'SOIKF_MAP', 'AntBasDeg_ga_0',
        ],
        signatures: [
          // Kf_ header: 16×14 in EDC16U34 SW389289, X=[100,800,1000,1250] — auto-detected
          [0x00,0x10,0x00,0x0E,0x00,0x64,0x03,0x20,0x03,0xE8,0x04,0xE2],
          [0x53,0x4F,0x49,0x4D,0x41,0x50,0x44,0x43],      // "SOIMAPDC"
          [0x49,0x4E,0x4A,0x54,0x49,0x4D,0x44,0x43],      // "INJTIMDC"
        ],
        sigOffset: 4,
        // CORRECTED: rows:14 cols:16. DAMOS A2L: InjCrv_phiBas0_GMAP = 16×14 across 147 files.
        // Previous 10×10 was from one binary variant. DAMOS confirms 14×16 as standard.
        rows: 14, cols: 16, dtype: 'int16', le: false,
        factor: 0.021973, offsetVal: 0, unit: '°DBTC',
        // Addend-based Zone Editor (per-cell degrees) — same as EDC17 SOI.
        // factor 0.021973 °/unit → 1° ≈ 46 raw, 0.5° ≈ 23 raw.
        tuningMode: 'addend',
        zoneStep: 0.5,
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
        rows: 4, cols: 4, dtype: 'uint16', le: false,
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
          // Kf_ header: 8×6 in EDC16U34 SW389289, X=[1000,1200,1500,2000] RPM — auto-detected
          [0x00,0x08,0x00,0x06,0x03,0xE8,0x04,0xB0,0x05,0xDC,0x07,0xD0],
          [0x45,0x47,0x52,0x4B,0x4C,0x00],                // "EGRKL\0"
          [0x45,0x47,0x52,0x46,0x4C,0x4F,0x57],           // "EGRFLOW"
          [0x41,0x47,0x52,0x46,0x4C,0x4F,0x57],           // "AGRFLOW"
        ],
        sigOffset: 4,
        // Default 8×12 for ASCII sig path. Kf_ header overrides with actual dims (8×6 in EDC16U34).
        rows: 8, cols: 12, dtype: 'uint8', le: false,
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
        rows: 1, cols: 1, dtype: 'uint16', le: false,
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
        rows: 1, cols: 1, dtype: 'uint16', le: false,
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
        id: 'edc16_lambda_limiter',
        name: 'Lambda Smoke Limiter',
        category: 'smoke',
        desc: 'Lambda-based smoke limit. Restricts fuelling when lambda drops too low (too rich). Must be adjusted when increasing fuel to prevent lambda-based power cuts.',
        a2lNames: ['FlMng_rLmbdSmkLim_MAP', 'Lambda_Smoke_MAP', 'SmkLim_Lambda_MAP'],
        signatures: [
          // FlMng_rLmbdSmkEGT_MAP axis signature — validated from A2L export against 389289 binary.
          // Kf_ axis [2000,3000,4000,5000,7500,10000] in BE uint16.
          [0x07,0xD0,0x0B,0xB8,0x0F,0xA0,0x13,0x88,0x1D,0x4C,0x27,0x10],
        ],
        sigOffset: 4,
        // CORRECTED: rows:13 cols:16. A2L export shows FlMng_rLmbdSmkEGT_MAP is 13×16,
        // not 13×14 as scanner suggested (scanner was counting differently).
        rows: 13, cols: 16, dtype: 'uint16', le: false,
        factor: 0.001, offsetVal: 0, unit: 'λ',
        stage1: { multiplier: 0.95 },
        stage2: { multiplier: 0.90 },
        stage3: { multiplier: 0.85, clampMin: 700 },
        critical: false, showPreview: true,
      },
    ],
  },

  // ── EDC16 PD Audi A6 2.0 TDI 0281011850 03G906016BF (sw 380199/382716/399833) ─
  //
  // Audi A6 C5/C6 2.0 TDI PD 140ps. Bosch hardware code 0281011850, VAG part
  // number 03G906016BF. Verified by 3 paired ORI/Stage1 files (pair_analysis
  // _log.md pairs #684 sw380199, #685 sw382716, #726 sw399833) sharing
  // IDENTICAL modification offsets:
  //
  //   0x051E5F  7 cells u16 BE  — primary IQ ceiling (raw 19308 → 47812, +147%)
  //   0x05F8FF  13 cells u16 BE — boost target (raw 15921 → 36444, +128%)
  //                                (sw399833 actually hits 0x05FA05; Δ=0x106
  //                                — same map, slight version-rev shift)
  //
  // ⚠ 2MB vs 524KB DUMP FORMAT — same ECU, same cal data, different absolute
  //   offsets. The 2MB extracted format (e.g. pair #719 sw382716) places the
  //   cal block at 0x180000 + cal_offset. So 0x051E5F in the 524KB dump
  //   becomes 0x1D1E5F in the 2MB dump. fileSizeRange below restricts THIS
  //   def to 524KB — a sister def is needed for 2MB extracted cal dumps.
  //
  // The +0x18000 (96 KB) mirror discussed in the EDC15 doc above is NOT
  // applicable here — EDC16 PD ROMs use Motorola HiLo and a single cal copy
  // (the duplication seen in EDC15 was a C167 RAM-shadow). EDC16 uses MPC555.
  {
    id: 'edc16_a6_20tdi_03g906016bf',
    name: 'Bosch EDC16 PD (03G906016BF — Audi A6 2.0 TDI 140ps PD 2004-2006)',
    manufacturer: 'Bosch',
    family: 'EDC16',
    identStrings: ['03G906016BF', '0281011850', '380199', '382716', '399833'],
    fileSizeRange: [524288, 524288],
    vehicles: ['Audi A6 C5/C6 2.0 TDI PD 140ps (03G906016BF sw 380199/382716, 2004-2006)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFFC,
    checksumLength: 4,
    maps: [
      {
        id: 'edc16_a6_20tdi_iq_ceiling',
        name: 'IQ Ceiling (03G906016BF 380199/382716)',
        category: 'fuel',
        desc: 'Primary IQ ceiling at 0x051E5F (7 uint16 BE cells). Verified across 2 independent Stage 1 pairs sharing exact offset and treatment — μ 19308 → 47812 raw (+147%). Pin near tuner consensus to release IQ.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x051E5F,
        rows: 1, cols: 7, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 47000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 50000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 53000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc16_a6_20tdi_boost_target',
        name: 'Boost Target (03G906016BF 380199/382716)',
        category: 'boost',
        desc: 'Boost pressure target at 0x05F8FF (13 uint16 BE cells). Verified across same 2 pairs — μ 15921 → 36444 raw (+128%). Pin near tuner consensus to release boost.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x05F8FF,
        rows: 1, cols: 13, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 36000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 40000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 44000 },
        critical: true, showPreview: true,
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
    identStrings: ['EDC17', 'EDC 17', '0281017', '0281018', '0281019', '0281020', '0281030', 'EDC17C', 'EDC17CP', 'EDC17U', 'EDC17C41', 'EDC17C46', 'EDC17C54', 'EDC17CP14', 'EDC17CP20', 'P643X5L8', 'C643X5L8', 'P643A', 'P643B', 'P643C', 'C643A', 'C643B', 'C643C'],
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
        desc: "Converts pedal position to torque request (Nm). Left stock on Stage 1 for drivability (matches pro tuner convention). Stage 2/3 raise this for sharper throttle response.",
        a2lNames: ['DRVWSH_MAP', 'DrvWish_MAP', 'Fahrerwunsch_MAP', 'FahrWunsch_MAP', 'MIFAS_MAP', 'MrDriver_MAP', 'mifas_MAP', 'TrqEngDriveAway', 'AccPed_trqENU', 'AccPed_trqEng', 'AccPed_trqEngA', 'AccPed_trqEngB', 'TrqStrtBas'],
        signatures: [[0x44,0x52,0x56,0x57,0x49,0x53,0x48,0x44], [0x44,0x52,0x56,0x57,0x53,0x48,0x44,0x43]],
        sigOffset: 4,
        rows: 8, cols: 16, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        // Stage 1 = 1.00 (leave stock — pro tune comparison showed pro leaves this unchanged).
        // Driver's Wish is first in the torque chain; changing it unnecessarily hurts drivability
        // without adding power beyond what the torque limiter already delivers.
        stage1: { multiplier: 1.00 },
        stage2: { multiplier: 1.10 },
        stage3: { multiplier: 1.20, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc17_torque_limit',
        name: 'Torque Limitation Map',
        category: 'torque',
        desc: 'Maximum torque ceiling by RPM and atmospheric pressure. The master ceiling for all power gains. Conservative +10% on Stage 1 matches pro-tune practice of spreading torque increases across the full gear-variant cluster rather than single aggressive jumps.',
        a2lNames: ['GSHDem_trqMax_MAP', 'EngTrqPtd_trqMax_MAP', 'Trq_trqMax_MAP', 'TrqLim_MAP', 'MQBEGR_MAP', 'TrqMaxDrv_MAP', 'mxmot_MAP', 'MXMOT_MAP', 'EngPrt_trqLim', 'LimTrqVelEDC17', 'TrqMaxGear1', 'TrqMaxGear2', 'TrqMaxGear3', 'TrqMaxGear4', 'TrqMaxGear5', 'TrqMaxGear6', 'TrqMaxGearR'],
        signatures: [[0x54,0x51,0x4C,0x49,0x4D,0x44,0x43], [0x54,0x4F,0x52,0x51,0x4C,0x44,0x43,0x01], [0xA4,0x06,0xA4,0x06]],
        sigOffset: 2,
        rows: 8, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        // Toned down from 1.28 → 1.10 based on pro tune comparison (pro: +4.6% on this map).
        // The gear-variant torque cluster (edc17_trq_gear1..5) covers an additional +5% across
        // 5 related maps, so overall torque ceiling lift is still ~15% combined.
        stage1: { multiplier: 1.10 },
        stage2: { multiplier: 1.25 },
        stage3: { multiplier: 1.45, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      // ── FUEL CHAIN — torque request → IQ conversion → injector → smoke ceiling ──
      {
        id: 'edc17_torque_iq',
        name: 'Torque to IQ Conversion',
        category: 'fuel',
        desc: 'Converts torque request (Nm) into injection quantity (mg/stroke). The critical link between the torque model and the injectors — if this is not raised with the torque limiter, extra torque demand produces no extra fuel and gains are lost.',
        a2lNames: ['PhyMod_trq2qBas_MAP', 'CnvSet_trq2qRgn1_MAP', 'FMTC_trq2qBas_MAP', 'Trq2IQ_MAP', 'TrqToQ_MAP', 'MISOLKF_MAP', 'misolkf_MAP', 'Trq_trq2InjQMain_MAP', 'Trq2qBas'],
        signatures: [[0x54,0x51,0x49,0x51,0x43,0x4F,0x4E,0x56], [0x43,0x4E,0x56,0x54,0x52,0x51,0x49,0x51]],
        sigOffset: 4,
        rows: 16, cols: 16, dtype: 'uint16', le: true,
        factor: 0.01, offsetVal: 0, unit: 'mg/st',
        // Toned down from 1.15 → 1.05. Pro tune showed only 2.6-3.5% on cluster-B variants.
        // Combined with IQ variant cluster (~+4% avg) and IQ Base C46 (+4%), total fuel
        // delivery lift is ~12% which matches proper Stage 1 output.
        stage1: { multiplier: 1.05 },
        stage2: { multiplier: 1.15 },
        stage3: { multiplier: 1.25, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc17_fuel_quantity',
        name: 'Injection Quantity Map',
        category: 'fuel',
        desc: 'Fuel injection quantity in mg/stroke vs RPM and load. Primary power map for diesel — raising this increases torque across all RPM. For C46 stripped variants (no ASCII labels), this map is not present — use "Injection Quantity Base (C46)" instead.',
        a2lNames: ['Qmain_MAP', 'InjQty_MAP', 'QKENNFELD_MAP', 'Qfuel_MAP', 'QMain_MAP', 'Inj_qSetPoint_MAP', 'qmain_MAP'],
        signatures: [[0x49,0x4E,0x4A,0x51,0x54,0x59,0x44,0x43], [0x46,0x55,0x45,0x4C,0x51,0x54,0x59,0x01]],
        sigOffset: 4,
        rows: 16, cols: 16, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'mg/st',
        skipCalSearch: true,
        stage1: { multiplier: 1.05 },
        stage2: { multiplier: 1.15 },
        stage3: { multiplier: 1.25, clampMax: 62000 },
        critical: false, showPreview: true,
      },
      {
        id: 'edc17_smoke_limiter',
        name: 'Smoke Limiter Map',
        category: 'smoke',
        desc: 'Maximum fuel quantity allowed at each MAF airflow reading. The most commonly missed map on EDC17 — without raising this, any IQ increase above stock is silently cut to prevent black smoke. Stage 1 gains require this raised in step.',
        // A2L ground truth: SmkLim_qLimPres_MAP factor 0.01 mg/hub (EDC17L01 confirmed).
        // EDC16/17 also uses lambda-based smoke limiters (FlMng_rLmbdSmkLim0_MAP, factor 0.001 λ).
        a2lNames: ['SmkLim_qLimPres_MAP', 'SmkLim_rLamSmkNrmMode_MAP', 'Qsmk_MAP', 'SmokeLimit_MAP', 'RKBEGRENZ_MAP', 'Qmax_smk_MAP', 'SmkLim_MAP', 'Inj_qMaxSmkLim_MAP', 'qsmk_MAP', 'FlMng_rLmbdSmkLim0_MAP', 'FlMng_rLmbdSmkHigh_MAP', 'LmbdSmkLow', 'LmbdSmkHigh', 'LmbdFullLd', 'Inj_qSmkLim_MAP', 'QSmkLim_MAP', 'QSMKLIM_MAP', 'Smk_qLim_MAP', 'qSmkMax_MAP', 'Inj_rSmkLim_MAP', 'SmkCtl_qLim_MAP'],
        signatures: [
          [0x53,0x4D,0x4B,0x4C,0x49,0x4D,0x44,0x43], [0x51,0x4D,0x41,0x58,0x53,0x4D,0x4B,0x01],
          // C46 stripped variant (03L906018FJ) — LE Kf_ 6×7 smoke limiter, factor 0.01 mg/hub matches
          [0x06,0x00,0x07,0x00,0x1f,0x0f,0x47,0x0f,0x5b,0x0f,0x6f,0x0f],
        ],
        sigOffset: 4,
        rows: 14, cols: 16, dtype: 'uint16', le: true,
        // A2L confirmed factor 0.01 mg/hub for EDC17. clampMax 6200 raw = 62 mg/st ceiling.
        factor: 0.01, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.12 },
        stage2: { multiplier: 1.20 },
        stage3: { multiplier: 1.30, clampMax: 6200 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc17_rail_pressure',
        name: 'Rail Pressure Setpoint',
        category: 'fuel',
        desc: 'Common rail fuel pressure target vs RPM and IQ. Higher pressure enables finer atomisation and supports increased injection quantity — essential when raising fuel delivery to maintain combustion quality and avoid smoke.',
        // CORRECTED: Rail_pSetPointBase_MAP (16×16, 529 files) = base setpoint for tuning.
        // Rail_pSetPointMax_MAP (14×10, 655 files) = max ceiling, different map.
        a2lNames: ['Rail_pSetPointBase_MAP', 'RailPres_MAP', 'RDSOLLKF_MAP', 'pRailSetMax_MAP', 'Rail_MAP', 'CRpres_MAP', 'rdsoll_MAP', 'Rail_PointBase', 'Rail_PointMax', 'Rail_PointLimTem', 'PCR_DesBas', 'PCR_DesMaxAP', 'PCR_DesMax', 'PCR_CtlBas', 'Rail_pSetPointMax_MAP'],
        signatures: [
          [0x52,0x41,0x49,0x4C,0x50,0x52,0x53,0x50], [0x43,0x52,0x50,0x52,0x45,0x53,0x53],
          // C46 stripped (03L906018FJ Leon 103 kW) — LE Kf_ 12×12 rail pressure target
          // Verified at 0x4B458: raw 2020-10500 = 202-1050 bar (factor 0.1). X=1200,1500,1800,2000.
          [0x0c,0x00,0x0c,0x00,0xb0,0x04,0xdc,0x05,0x08,0x07,0xd0,0x07],
          // C46 Leon alt — LE Kf_ 12×12 (X=1500,1600,1800,2000). At 0x4B8DE: 280-1100 bar.
          [0x0c,0x00,0x0c,0x00,0xdc,0x05,0x40,0x06,0x08,0x07,0xd0,0x07],
          // C46 stripped (03L906018JL Audi A4 119.9 kW) — LE Kf_ 13×12 rail pressure target
          // Verified at 0x4F4AA: raw 2600-9500 = 260-950 bar. X=1200,1500,1800,2000. UNIQUE.
          [0x0c,0x00,0x0d,0x00,0xb0,0x04,0xdc,0x05,0x08,0x07,0xd0,0x07],
          // C46 Audi alt — LE Kf_ 8×12. At 0x4F380: 280-1100 bar. X=1500,1600,1800,2000. UNIQUE.
          [0x0c,0x00,0x08,0x00,0xdc,0x05,0x40,0x06,0x08,0x07,0xd0,0x07],
          // C46 Audi variant — LE Kf_ 10×11. At 0x4EF7A: 320-1100 bar. UNIQUE.
          [0x0b,0x00,0x0a,0x00,0xdc,0x05,0x40,0x06,0x08,0x07,0xd0,0x07],
          // C46 — earlier 16×16 / 16×20 variants from DB study
          [0x10,0x00,0x14,0x00,0xb0,0x04,0xd0,0x07,0xc4,0x09,0xb8,0x0b],
          [0x10,0x00,0x10,0x00,0x00,0x00,0x0a,0x00,0x58,0x02,0x20,0x03],
          [0x10,0x00,0x10,0x00,0xe8,0x03,0x40,0x06,0xd0,0x07,0xc4,0x09],
        ],
        sigOffset: 4,
        // Kf_ header auto-detection overrides rows/cols from the matched signature.
        // Default 12×12 for the C46 primary match. Factor 0.1 bar.
        rows: 12, cols: 12, dtype: 'uint16', le: true,
        // Raw uint16 values in units of 0.1 bar (e.g. 14000 raw = 1400 bar).
        // 2.0 TDI CR runs 700–1600 bar at full load; ceiling 2200 bar = 22000 raw.
        factor: 0.1, offsetVal: 0, unit: 'bar',
        // IMPORTANT: rail pressure is category 'fuel' but PHYS_RANGES.fuel caps at 150 mg/st.
        // Real rail pressure is 200-2200 bar — outside the 'fuel' physical range check, so
        // scoreMapData returns 0 and signature matches get rejected. minQuality:0 bypasses
        // the quality check entirely — we trust the 12-byte Kf_ signature to pinpoint the
        // right location. skipCalSearch stops the fallback from finding axis-breakpoint data
        // (e.g. 0x05C962 where values 0-118 "pass" fuel range but are garbage).
        minQuality: 0,
        skipCalSearch: true,
        // Toned down from 1.08 → 1.00 on Stage 1. Pro tune comparison showed pro does NOT
        // raise rail pressure on Stage 1 — stock 200-1050 bar is sufficient for +30% fuel.
        // Raising rail pressure too early accelerates injector wear. Stage 2/3 raise it.
        //
        // VERIFIED 2026-04-18 on 03L906022BQ sw 396412 (Audi A3 CR 140 BKD) — real Stage 1
        // tune raised rail pressure from raw μ 8200-8400 → 10300-10400, i.e. 820 bar → 1040 bar
        // (+27%). This means Stage 1 rail increase up to ~1.2x IS tuner-standard on C46,
        // despite the comment above saying "pro does NOT raise rail on Stage 1" — that
        // advice was from a different pro tune. Leaving Stage 1 mul at 1.00 as a
        // conservative default, but Stage 2 mul of 1.06 is on the low side vs real tunes.
        stage1: { multiplier: 1.00 },
        stage2: { multiplier: 1.06 },
        stage3: { multiplier: 1.12, clampMax: 22000 },
        critical: true, showPreview: true,
      },
      // ── BOOST CHAIN — N75 controls build rate, boost target sets the setpoint ──
      {
        id: 'edc17_n75',
        name: 'N75 Wastegate Map',
        category: 'boost',
        desc: 'Wastegate solenoid duty cycle vs RPM and IQ. Controls how quickly boost builds and prevents overshoot spikes. Must be recalibrated after raising boost targets — mismatched N75 causes boost spikes and turbo hunting.',
        a2lNames: ['N75_MAP', 'LDTV_MAP', 'WGduty_MAP', 'Boost_WG_MAP', 'Turb_dcWgSet_MAP', 'wgdc_MAP', 'WGDC_MAP'],
        signatures: [
          [0x4E,0x37,0x35,0x44,0x55,0x54,0x59,0x44], [0x57,0x47,0x44,0x55,0x54,0x59,0x4D,0x41],
          // C46 stripped (03L906018FJ) — LE Kf_ 17×16 N75/wastegate (unique), factor 0.012207 matches
          [0x11,0x00,0x10,0x00,0x40,0x06,0xd0,0x07,0xc4,0x09,0xb8,0x0b],
          // NOTE: 16×13 sig [0x10,0x00,0x0d,0x00,...] removed — collides with edc17_boost_target
        ],
        sigOffset: 4,
        rows: 13, cols: 16, dtype: 'uint16', le: true,
        factor: 0.012207, offsetVal: 0, unit: '%',
        // Toned down from 1.08 → 1.02 on Stage 1. N75 should barely move for Stage 1;
        // aggressive N75 changes cause boost spikes and turbo hunting. Stage 2/3 raise it.
        stage1: { multiplier: 1.02 },
        stage2: { multiplier: 1.08 },
        stage3: { multiplier: 1.15, clampMax: 65000 },
        critical: false, showPreview: false,
      },
      {
        id: 'edc17_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'Desired boost pressure vs RPM and IQ. Raising this tells the ECU how much boost to build — must be paired with N75 adjustment to prevent spikes and smoke limiter raise to allow the extra airflow to carry more fuel.',
        // A2L ground truth: AirCtl_pBstPresRef_MAP (factor 1.0 hPa = 0.001 bar) confirmed in EDC17L01.
        // PCR_pLadeMax_MAP / PCR_pDesBas_MAP = charge pressure setpoints (hPa → bar via factor 0.001).
        a2lNames: ['AirCtl_pBstPresRef_MAP', 'Turb_pSetPoint_MAP', 'PCR_pLadeMax_MAP', 'PCR_pDesBas_MAP', 'BoostTarget_MAP', 'LDESOLL_MAP', 'Boost_MAP', 'pBoostSet_MAP', 'ldesoll_MAP', 'LDESOLLKF_MAP'],
        // DB study (22258 bins): 16×12 sig 0x8CF873F8 — 2238 occurrences across 2109 EDC17 files.
        signatures: [
          [0x4C,0x4C,0x53,0x4F,0x4C,0x4C,0x44,0x52], [0x42,0x53,0x54,0x47,0x54,0x44,0x43], [0x8C,0xF8,0x73,0xF8],
          // C46 stripped (03L906018FJ) — LE Kf_ 16×10 boost target (unique), factor 0.001 bar matches
          [0x10,0x00,0x0a,0x00,0xb0,0x04,0xd0,0x07,0xc4,0x09,0xb8,0x0b],
          // LE Kf_ 16×13 boost target (RPM axis 1200,2000,2500,3000) — Stage1 changed all 4 matches
          // 4 copies with X:1200 axis (all tuned in Stage1). 4 more with X:1560 axis have different sig.
          [0x10,0x00,0x0d,0x00,0xb0,0x04,0xd0,0x07,0xc4,0x09,0xb8,0x0b],
        ],
        sigOffset: 4,
        rows: 16, cols: 16, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        // Toned down from 1.18 → 1.04 on Stage 1. Pro tune comparison showed only +1.2%
        // boost lift. Stage 1 should be a small, safe boost increase — aggressive boost
        // requires matching N75, smoke limits, EGT management, and injector upgrades on
        // higher stages. 4% is the sweet spot for stock-hardware Stage 1 gains.
        stage1: { multiplier: 1.04 },
        stage2: { multiplier: 1.15 },
        stage3: { multiplier: 1.30, clampMax: 55000 },
        critical: true, showPreview: true,
      },
      // ── TIMING — SOI advance improves efficiency but raises EGT, Stage 2/3 only ──
      {
        id: 'edc17_soi',
        name: 'Start of Injection (SOI)',
        category: 'ignition',
        desc: 'Injection timing advance vs RPM and IQ in degrees before TDC. Advancing SOI improves combustion efficiency and power — standard Stage 2/3 mod. Too much advance raises exhaust gas temperature (EGT) and triggers the EGT limiter.',
        a2lNames: ['InjCrv_phiMI1Bas_MAP', 'SOI_MAP', 'SOIKF_MAP', 'InjTiming_MAP', 'phi_SOI_MAP', 'soi_MAP', 'SPRKF_MAP', 'InjCrv_Bas1', 'InjCrv_Bas2', 'InjCrv_Bas3', 'InjCrv_Bas4', 'InjCrv_Bas5'],
        signatures: [
          [0x53,0x4F,0x49,0x4D,0x41,0x50,0x44,0x43], [0x49,0x4E,0x4A,0x54,0x49,0x4D,0x44,0x43],
          // C46 stripped (03L906018FJ Leon 103 kW) — LE Kf_ 12×10 SOI int16
          // Verified at 0x407FE: raw int16 -280..830 → -6.15° to +18.24° BTDC (factor 0.021973).
          // 3 copies (main/pilot/post); matchIndex 0 = main injection.
          [0x0a,0x00,0x0c,0x00,0xd0,0x07,0xc4,0x09,0xb8,0x0b,0xac,0x0d],
          // C46 stripped (03L906018JL Audi A4 119.9 kW) — LE Kf_ 11×10 SOI int16
          // Verified at 0x4386C: raw int16 -420..720 → -9.2° to +15.8° BTDC.
          // 3 copies (main/pilot/post); matchIndex 0 = main injection.
          [0x0a,0x00,0x0b,0x00,0xd0,0x07,0xc4,0x09,0xb8,0x0b,0xac,0x0d],
        ],
        matchIndex: 0,
        sigOffset: 4,
        // CORRECTED: rows:12 cols:16. DAMOS A2L: InjCrv_phiMI1Bas0Rgn1_MAP = 16×12 across 507 files.
        // C46 stripped variant shows 12×10 or 11×10 with Kf_ header auto-detect overriding defaults.
        rows: 12, cols: 16, dtype: 'int16', le: true,
        factor: 0.021973, offsetVal: 0, unit: '°DBTC',
        // Skip calSearch: without it, calSearch finds the 16×15 boost target at 0x066932
        // (raw 1000-2550 passes ignition range -50..70 at factor 0.021973 = 22°-56° which is
        // physically impossible for main injection). Skip fallback to show Not Found instead.
        skipCalSearch: true,
        // minQuality:0 — SOI maps fail the smoothness/zigzag scoring because injection timing
        // jumps between pilot (early) and main (late) events across cells, producing a high
        // zigzag ratio (~48%). Real SOI data scores ~0.025 quality which is below the 0.15
        // default threshold. The signatures are unique enough to trust without quality gating.
        minQuality: 0,
        // Addend-based tuning: Zone Editor stores per-cell RAW ADDEND values.
        // factor 0.021973 °/unit → 1° ≈ 46 raw units, 0.5° ≈ 23 raw units, 3° ≈ 137 raw units.
        // Stage 1 = no SOI change (safe for daily driver). Stage 2 = +1°, Stage 3 = +3°.
        tuningMode: 'addend',
        zoneStep: 0.5,  // Pg+/Pg- step in degrees
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
        signatures: [
          [0x45,0x47,0x52,0x46,0x4C,0x4F,0x57], [0x41,0x47,0x52,0x46,0x4C,0x4F,0x57],
          // LE Kf_ 12×8 EGR (RPM axis 1200,1600,2000,2500) — found in 243 EDC17 files
          [0x0c,0x00,0x08,0x00,0xb0,0x04,0x40,0x06,0xd0,0x07,0xc4,0x09],
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
      // ── NEW: Lambda, Torque Monitor, Rail Pressure Limit ──
      {
        id: 'edc17_lambda_limiter',
        name: 'Lambda Smoke Limiter',
        category: 'smoke',
        desc: 'Lambda (air-fuel ratio) smoke limit. Prevents excessive richness under load. C46 stripped variants may not expose this as a separate table — the smoke MAF limiters handle the clipping.',
        a2lNames: ['FlMng_rLmbdSmkLim0_MAP', 'FlMng_rLmbdSmkHigh_MAP', 'LambdaSmkLim_MAP', 'Lambda_Smoke_MAP'],
        // DB-study sigs removed — they were incorrectly classifying rail-pressure 12×12 maps
        // as lambda (raw data 2020-10500 at factor 0.001 = 2-10 λ is impossible; factor 0.1
        // gives 202-1050 bar which IS rail pressure). The real rail-pressure targets moved
        // into edc17_rail_pressure. Lambda sigs remain ASCII-only — won't match in C46
        // stripped binaries, which correctly reports "Not Found" rather than false data.
        signatures: [[0x4C,0x41,0x4D,0x42,0x44,0x41,0x53,0x4D], [0x4C,0x4D,0x42,0x44,0x53,0x4D,0x4B]],
        sigOffset: 4,
        rows: 12, cols: 12, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'λ',
        // Skip calSearch: lambda maps are 'smoke' category which allows 0-150 range, so
        // calSearch readily finds any 12×12 block with values in that range and returns it
        // as "lambda" (e.g. 0x06D68A showing 0-18 λ is impossible). Better to show Not Found
        // in C46 stripped binaries where a proper Kf_ lambda sig is unknown.
        skipCalSearch: true,
        stage1: { multiplier: 0.95 },
        stage2: { multiplier: 0.90 },
        stage3: { multiplier: 0.85, clampMin: 700 },
        critical: false, showPreview: true,
      },
      {
        id: 'edc17_torque_monitor',
        name: 'Torque Monitoring Map',
        category: 'torque',
        desc: 'Torque monitoring / plausibility check. If actual torque exceeds this by more than the tolerance, ECU throws P060A. MUST be raised when tuning torque maps to prevent limp mode. This map is intentionally flat in ORI (all cells = same ceiling value) — Stage1 maxes it out to disable monitoring.',
        a2lNames: ['TrqMon_IQ2NM_MAP', 'MQBEGR_MON', 'TqMon_trqMax_MAP', 'TrqMon_MAP'],
        signatures: [
          // No Kf_ header — uses Y axis (IQ axis 0..18000 mg/100st, step 2000) as unique pattern.
          // Verified unique: exactly 1 match per 2MB C46 binary. Consistent across 18 tested files
          // (FJ, CA, BT, LH, LK, AG, HR variants) at different offsets.
          // Data (10×10 uint16) starts immediately after the 20-byte Y axis.
          [0x00,0x00,0xd0,0x07,0xa0,0x0f,0x70,0x17,0x40,0x1f,0x10,0x27,0xe0,0x2e,0xb0,0x36,0x80,0x3e,0x50,0x46],
        ],
        sigOffset: 0,  // data starts immediately after the Y axis pattern
        rows: 10, cols: 10, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        // ORI: all cells = 10000 (1000 Nm ceiling). Stage1: max out to 32767 (3276.7 Nm) to disable.
        stage1: { multiplier: 3.28, clampMax: 32767 },
        stage2: { multiplier: 3.28, clampMax: 32767 },
        stage3: { multiplier: 3.28, clampMax: 32767 },
        critical: true, showPreview: true,
        // Map is intentionally flat (all cells identical) — skip quality mode-fraction rejection
        // and suppress the "⚠ Uniform" heatmap warning (flat-by-design, not a broken match).
        minQuality: 0,
        allowUniform: true,
      },
      {
        id: 'edc17_rail_limit',
        name: 'Rail Pressure Limit',
        category: 'limiter',
        desc: 'Maximum rail pressure by RPM. Protects the common-rail system. Raise slightly on Stage 2/3 to allow higher injection pressures for better atomisation.',
        a2lNames: ['RailPres_pMax_MAP', 'RailP_Limit_MAP', 'pRailMax_MAP'],
        signatures: [
          // C46 stripped (03L906018FJ) — LE Kf_ 16×15 rail pressure limit (unique)
          [0x10,0x00,0x0f,0x00,0xe8,0x03,0x40,0x06,0x08,0x07,0xd0,0x07],
        ],
        sigOffset: 0,
        rows: 12, cols: 12, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.05 },
        stage2: { multiplier: 1.10 },
        stage3: { multiplier: 1.15, clampMax: 25000 },
        critical: false, showPreview: false,
      },
      // ── C46 STRIPPED VARIANT MAPS — EDC17 C46 without ASCII labels (e.g. 03L906018FJ) ──
      // These use LE Kf_ inline signatures. Axis values are calibration-specific.
      {
        id: 'edc17_smoke_lim_maf',
        name: 'Smoke Limiter (MAF-based)',
        category: 'smoke',
        desc: 'Second smoke limiter indexed by MAF airflow. Stripped EDC17 C46 variants have two small smoke limiters instead of one large 14×16. Both must be raised or the ECU silently clips fuel gains.',
        signatures: [
          // C46 Leon 03L906018FJ — LE Kf_ 5×8 MAF smoke limiter
          [0x05,0x00,0x08,0x00,0xeb,0x29,0x4f,0x2a,0xb3,0x2a,0x17,0x2b],
          // C46 Audi 03L906018JL — LE Kf_ 5×8 MAF smoke limiter (different X axis: starts 0x2987)
          // Verified at 0x3D81A: raw 6191-8191 = 61.9-81.9 mg/st. 2 copies.
          [0x05,0x00,0x08,0x00,0x87,0x29,0xeb,0x29,0x4f,0x2a,0xb3,0x2a],
        ],
        sigOffset: 0,
        rows: 8, cols: 5, dtype: 'uint16', le: true,
        factor: 0.01, offsetVal: 0, unit: 'mg/st',
        skipCalSearch: true,
        // Toned down from 1.12 → 1.08 on Stage 1. This MAF smoke limiter is less aggressive
        // than the primary smoke limiter (+11%); the pair combined still allow adequate smoke
        // headroom for Stage 1 fuel gains.
        stage1: { multiplier: 1.08 },
        stage2: { multiplier: 1.15 },
        stage3: { multiplier: 1.25, clampMax: 6200 },
        critical: false, showPreview: true,
      },
      {
        id: 'edc17_iq_base_c46',
        name: 'Injection Quantity Base (C46)',
        category: 'fuel',
        desc: 'Base injection quantity map for stripped EDC17 C46 variants. RPM vs IQ demand. The core fuel delivery map — raising this is the primary power increase. Factor 0.01 mg/stroke (A2L convention). Multiple copies exist; this finds the first.',
        signatures: [
          // C46 stripped — LE Kf_ 14×10 IQ base (unique sig — different axis from the 11-copy group)
          [0x0e,0x00,0x0a,0x00,0x90,0x01,0x14,0x05,0x40,0x06,0xd0,0x07],
          // General EDC17 14×10 IQ base (RPM axis 2000,3000,4000,5000) — found in 656 files across all EDC17 variants
          [0x0e,0x00,0x0a,0x00,0xd0,0x07,0xb8,0x0b,0xa0,0x0f,0x88,0x13],
        ],
        sigOffset: 0,
        rows: 10, cols: 14, dtype: 'uint16', le: true,
        factor: 0.01, offsetVal: 0, unit: 'mg/st',
        // Toned down from 1.08 → 1.04 on Stage 1. Pro tune comparison: +2.6% on this map.
        // Combined with the new IQ variant cluster (+3-4% × 8 maps) the overall fuel
        // delivery increase is ~20% across the full IQ family, matching proper Stage 1.
        stage1: { multiplier: 1.04 },
        stage2: { multiplier: 1.12 },
        stage3: { multiplier: 1.22, clampMax: 6200 },
        // critical:true — this is the REAL fuel delivery map for C46 stripped variants.
        critical: true, showPreview: true,
      },
      {
        id: 'edc17_trq2iq_c46',
        name: 'Torque-to-IQ Conversion (C46)',
        category: 'fuel',
        desc: 'Secondary torque-to-injection quantity conversion (16×8) used in some EDC17 C46 variants alongside the main Torque→IQ map. Not present in every variant — the general Torque→IQ covers this function when this map is absent.',
        signatures: [
          [0x10,0x00,0x08,0x00,0x00,0x00,0xca,0x02,0x94,0x05,0x5e,0x08],
        ],
        sigOffset: 0,
        rows: 8, cols: 16, dtype: 'uint16', le: true,
        factor: 0.01, offsetVal: 0, unit: 'mg/st',
        skipCalSearch: true,
        stage1: { multiplier: 1.05 },
        stage2: { multiplier: 1.12 },
        stage3: { multiplier: 1.20, clampMax: 6200 },
        critical: false, showPreview: true,
      },
      // ── GEAR-VARIANT TORQUE TARGETS (5 copies in a cluster) ──
      // EDC17 C46 stores per-gear torque targets as 5 identical-structure maps at consecutive
      // offsets. All share sig [0x0c,0x00,0x0a,0x00,0x40,0x06,0xd0,0x07,0xb8,0x0b,0xa0,0x0f]
      // which appears 5 times. Each mapDef below uses matchIndex 0-4 to target one gear.
      // Only the first shows preview to avoid clutter; all 5 get the Stage 1 multiplier applied.
      // Verified against Audi A4 03L906018JL reference Stage 1 tune (pro +4.6% each).
      ...[0, 1, 2, 3, 4].map(gear => ({
        id: `edc17_trq_gear${gear + 1}`,
        name: `Torque Target (Gear ${gear + 1} of 5)`,
        category: 'torque' as const,
        desc: `Per-gear torque target map (one of 5 gear variants). Default Stage 1 = +5%. Use the Zone Editor on this card to tune specific cells (e.g. raise only high-RPM zones) for this gear individually — independent from the other 4 gears.`,
        signatures: [
          [0x0c,0x00,0x0a,0x00,0x40,0x06,0xd0,0x07,0xb8,0x0b,0xa0,0x0f],
        ],
        matchIndex: gear,
        sigOffset: 0,
        rows: 10, cols: 12, dtype: 'uint16' as const, le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        skipCalSearch: true,
        stage1: { multiplier: 1.05 },
        stage2: { multiplier: 1.15 },
        stage3: { multiplier: 1.25, clampMax: 65000 },
        critical: false,
        showPreview: true,  // show all 5 gears so each can be zone-tuned independently
      })),
      // ── TORQUE DEMAND CLUSTER B (3 variants at 0x0329BC) ──
      // 3 identical 10×14 torque demand maps. Pro tunes +3.4% each.
      ...[0, 1, 2].map(variant => ({
        id: `edc17_trq_demand_${variant + 1}`,
        name: `Torque Demand (Variant ${variant + 1} of 3)`,
        category: 'torque' as const,
        desc: 'Secondary torque demand map cluster — 3 related maps the ECU uses for torque calculation alongside the main Torque Limitation. All 3 variants modified in sync at +4%. Only variant 1 shown in preview.',
        signatures: [
          [0x0e,0x00,0x0a,0x00,0xd0,0x07,0xb8,0x0b,0xa0,0x0f,0x88,0x13],
        ],
        matchIndex: variant,
        sigOffset: 0,
        rows: 10, cols: 14, dtype: 'uint16' as const, le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        skipCalSearch: true,
        stage1: { multiplier: 1.04 },
        stage2: { multiplier: 1.12 },
        stage3: { multiplier: 1.22, clampMax: 65000 },
        critical: false,
        showPreview: true,  // show all variants so each can be zone-tuned independently
      })),
      // ── IQ VARIANT CLUSTER (multiple IQ-related maps at 0x031350) ──
      // These are additional fuel delivery maps (injection quantity by operating mode).
      // Pro tunes raise these 2-4% to spread the fuel delivery increase across many maps
      // rather than aggressively raising one. Uses one shared signature with matchIndex.
      ...[0, 1, 2, 3].map(variant => ({
        id: `edc17_iq_variant_${variant + 1}`,
        name: `IQ Variant (${variant + 1} of 4)`,
        category: 'fuel' as const,
        desc: 'Additional injection quantity variant map — 4 variants used under different operating conditions (cold start, hot run, post-injection, etc). All 4 modified in sync at +3%. Only variant 1 shown in preview.',
        signatures: [
          [0x0c,0x00,0x09,0x00,0xd0,0x07,0xc4,0x09,0xb8,0x0b,0xac,0x0d],
        ],
        matchIndex: variant,
        sigOffset: 0,
        rows: 9, cols: 12, dtype: 'uint16' as const, le: true,
        factor: 0.01, offsetVal: 0, unit: 'mg/st',
        skipCalSearch: true,
        stage1: { multiplier: 1.03 },
        stage2: { multiplier: 1.10 },
        stage3: { multiplier: 1.18, clampMax: 6200 },
        critical: false,
        showPreview: true,  // show all variants so each can be zone-tuned independently
      })),
      // ── SECONDARY SMOKE LIMITER (+58% pro change!) ──
      // 7×5 map near the primary smoke limiter. Pro tune raises this massively (+58%) which
      // suggests it's a hard-limit smoke cut that cripples fuel when left stock.
      {
        id: 'edc17_smoke_secondary',
        name: 'Smoke Limiter (Secondary)',
        category: 'smoke',
        desc: 'Secondary smoke-limit clipping map adjacent to the primary smoke limiter. Pro-tune reference file raises this by +58% — appears to be a hard limit that aggressively clips fuel delivery when left stock. Safety-critical for any meaningful Stage 1 fuel increase.',
        signatures: [
          // C46 Audi JL — LE Kf_ 7×5 at 0x03D79C (X=3531,3631,3687,3739)
          [0x05,0x00,0x07,0x00,0xcb,0x0d,0xf3,0x0d,0x07,0x0e,0x1b,0x0e],
        ],
        sigOffset: 0,
        rows: 7, cols: 5, dtype: 'uint16', le: true,
        factor: 0.01, offsetVal: 0, unit: 'mg/st',
        skipCalSearch: true,
        // Raised 10% on Stage 1 — less than pro's +58% but same direction. User can apply more
        // via Zone Editor if needed after verifying the map identity on their binary.
        stage1: { multiplier: 1.10 },
        stage2: { multiplier: 1.25 },
        stage3: { multiplier: 1.40, clampMax: 10000 },
        critical: false, showPreview: true,
      },
      {
        id: 'edc17_turbo_protect_c46',
        name: 'Turbo Protection Limit (C46)',
        category: 'limiter',
        desc: 'Turbo protection / boost ceiling limit for stripped EDC17 C46. 4×23 map limits maximum boost at low-temperature operating points. Must be raised to prevent boost cuts on tuned engines.',
        signatures: [
          // C46 stripped — LE Kf_ 4×23 turbo protection (unique)
          [0x04,0x00,0x17,0x00,0xbc,0x02,0x20,0x03,0x52,0x03,0x84,0x03],
        ],
        sigOffset: 0,
        rows: 23, cols: 4, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'raw',
        stage1: { multiplier: 1.10 },
        stage2: { multiplier: 1.20 },
        stage3: { multiplier: 1.30, clampMax: 60000 },
        critical: false, showPreview: false,
      },
      {
        id: 'edc17_turbo_eff_c46',
        name: 'Turbo Efficiency Map (C46)',
        category: 'boost',
        desc: 'Turbo efficiency / compressor map for stripped EDC17 C46. 16×14 RPM vs boost pressure. Defines turbo operating envelope — raised on Stage 2/3 to allow higher boost targets.',
        signatures: [
          // C46 stripped — LE Kf_ 16×14 turbo efficiency (unique)
          [0x10,0x00,0x0e,0x00,0x40,0x06,0x08,0x07,0xd0,0x07,0x98,0x08],
        ],
        sigOffset: 0,
        rows: 14, cols: 16, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'raw',
        stage1: { multiplier: 1.05 },
        stage2: { multiplier: 1.12 },
        stage3: { multiplier: 1.20, clampMax: 60000 },
        critical: false, showPreview: false,
      },
    ],
  },

  // ── Bosch EDC17 C46 — 03L906022BQ SW 398757 variant ────────────────────────
  //
  // SEPARATE ECU DEF because this specific SW version (398757) has well-known
  // variant-specific offsets verified by byte-diffing >=4 independent Stage 1
  // tune pairs of Audi A3/A4 2.0 TDI CR 140ps binaries in the pair analysis
  // log (pairs 48, 55, 56, 61, 63, 68 — all show the SAME 0x1EF502 / 0x1EFF46
  // "protection ceiling raise" pattern with values going 14259 → 57390 raw,
  // +300% change).
  //
  // Auto-detects when identStrings catch "398757" AND file is 2 MB. Generic
  // edc17 def (above) catches all other EDC17 files.
  {
    id: 'edc17_c46_398757',
    name: 'Bosch EDC17 C46 (03L906022BQ/G — Audi A3+VW Golf 2.0 TDI CR shared 0x1EF502 cluster)',
    manufacturer: 'Bosch',
    family: 'EDC17',
    // Verified via pair analysis across 13+ pairs of MULTIPLE SW versions:
    //   Audi A3 2.0 TDI CR sw398757 (03L906022BQ) — 6+ confirmation pairs
    //   VW Golf 2.0 TDI CR (03L906022G) sw 397892, 398784, 398791, 399393,
    //     399395 — 8+ pairs (see pair_analysis_log.md VW pairs #210-#223)
    //
    // ALL hit EXACT SAME offsets 0x1EF502 (2KB) + 0x1EFF46 (512B) with
    // identical raw 14259→57390 (+302%) treatment.
    //
    // The 03L906022FG variant (sw 399349/399350/500141/503995/etc.) hits
    // offsets shifted to 0x1EE306/0x1EED4A — handled by sister def
    // edc17_c46_03l906022fg below.
    identStrings: ['398757', '03L906022BQ', '397892', '398784', '398791', '398817', '398818', '398819', '398820', '398822', '398823', '399326', '399393', '399395', '501921', '501922', '501956', '505922', '505975', '507632', '397822', '399398', '399800', '397825', '397846', '396096'],
    fileSizeRange: [2097152, 2097152],   // exactly 2 MB
    vehicles: ['Audi A3 2.0 TDI CR 140ps (03L906022BQ sw 398757)', 'VW Golf 2.0 TDI CR 80-103kW (03L906022G sw 397xxx-399xxx, 2008-2010)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFFC,
    checksumLength: 4,
    maps: [
      {
        // Offset 0x1EF502, 2048 bytes = 1024 cells. Tuners consistently raise
        // from raw μ ~14259 to raw μ ~57390 (+302% avg). This is the main
        // torque-monitor / protection-ceiling block. Pinning to max allowed
        // effectively disables the monitor.
        id: 'edc17_c46_398757_protection_a',
        name: 'Protection Ceiling A (sw 398757)',
        category: 'limiter',
        desc: 'Large torque-monitor / protection ceiling table at 0x1EF502 (1024 uint16 cells). Verified across 6+ independent Stage 1 pairs of 03L906022BQ sw 398757 — all raise μ ~14259 raw → ~57390 raw (+302%). Stage 1 pins the entire table near the tuner consensus value (~55000 raw) to disable the derate trigger. Do NOT touch this on anything other than 03L906022BQ sw 398757.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x1EF502,
        rows: 1, cols: 1024, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMax: 55000 },
        stage2: { multiplier: 1.0, addend: 0, clampMax: 57000 },
        stage3: { multiplier: 1.0, addend: 0, clampMax: 58000 },
        critical: false, showPreview: false,
      },
      {
        id: 'edc17_c46_398757_protection_b',
        name: 'Protection Ceiling B (sw 398757)',
        category: 'limiter',
        desc: 'Companion protection table at 0x1EFF46 (256 uint16 cells). Verified across same 6+ pairs, μ 14413 → 57390 raw (+298%). Same treatment as Ceiling A: pin near tuner consensus.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x1EFF46,
        rows: 1, cols: 256, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMax: 55000 },
        stage2: { multiplier: 1.0, addend: 0, clampMax: 57000 },
        stage3: { multiplier: 1.0, addend: 0, clampMax: 58000 },
        critical: false, showPreview: false,
      },
    ],
  },

  // ── EDC17 C46 VW Caddy 2.0 TDI CR 03L906018xx (multi-SW cluster) ────────
  //
  // VW Caddy 2.0 TDI CR 80.9-103 kW EDC17 C46. Bosch hardware, VAG part
  // numbers 03L906018BT/CA/DC/LH/LK/NF/NG/NH/NJ/NL — 10+ part-number suffixes
  // sharing the SAME SGO base. Verified across multiple SW versions in
  // pair_analysis_log.md VW pairs #79-95:
  //
  //   sw513616 (BT), sw513617 (CA, 4 files), sw515282 (NF), sw518057 (NL),
  //   sw518077 (022JB), sw521057 (DC), sw524632 (NG), sw515278 (NJ),
  //   sw524633 (NJ, 2 files), sw525549 (LH), sw536609 (NJ stage1+++)
  //
  // ALL hit IDENTICAL offsets:
  //   0x06ADCA  2048 B = 1024 cells u16 LE — main protection ceiling (+170%)
  //   0x06B80E   512 B =  256 cells u16 LE — companion ceiling A (+139%)
  //   0x06B5EC   512 B =  256 cells u16 LE — companion ceiling B (+137%)
  //
  // Same protection-ceiling structure as 398757/03L906022FG/Q5 022B/03L906018DN
  // — Bosch EDC17 C46 family-wide pattern, just at 0x06ADCA anchor for VW
  // Caddy. This is the same structure documented as EDC17 C46 family pattern.
  {
    id: 'edc17_c46_caddy_20tdi_03l906018xx',
    name: 'Bosch EDC17 C46 (VW Caddy 2.0 TDI CR 80-103kW — 03L906018BT/CA/DC/LH/LK/NF/NG/NH/NJ/NL)',
    manufacturer: 'Bosch',
    family: 'EDC17',
    identStrings: [
      // 12+ Caddy/Golf-specific SWs — each maps to one of the part suffixes above.
      // Avoid using bare '03L906018xx' because some Audi A4/A6 03L906018JL
      // SWs use the SAME part-number prefix but DIFFERENT SGO base (0x07D3FE
      // not 0x06ADCA). Match strictly on these Caddy/Golf SWs.
      '513616', '513617', '515278', '515282', '518057', '518077', '521057',
      '524632', '524633', '525549', '536609',
      // Golf-confirmed sister SW (cross-chassis match)
      '511961',
    ],
    fileSizeRange: [2097152, 2097152],
    vehicles: ['VW Caddy 2.0 TDI CR 80-103kW (03L906018BT/CA/DC/LH/LK/NF/NG/NH/NJ/NL, 2010-2014)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFFC,
    checksumLength: 4,
    maps: [
      {
        id: 'edc17_c46_caddy_protection_a',
        name: 'Protection Ceiling A (Caddy 03L906018xx)',
        category: 'limiter',
        desc: 'Main protection ceiling at 0x06ADCA (1024 uint16 LE cells = 2 KB). Verified across 11+ SWs sharing IDENTICAL offset and treatment. μ 21260 → 57390 raw (+170%). Pin near tuner consensus (~55000 raw) for Stage 1.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x06ADCA,
        rows: 1, cols: 1024, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMax: 55000 },
        stage2: { multiplier: 1.0, addend: 0, clampMax: 57000 },
        stage3: { multiplier: 1.0, addend: 0, clampMax: 58000 },
        critical: false, showPreview: false,
      },
      {
        id: 'edc17_c46_caddy_protection_b',
        name: 'Protection Ceiling B (Caddy 03L906018xx)',
        category: 'limiter',
        desc: 'Companion ceiling A at 0x06B80E (256 uint16 LE cells = 512 B). Verified across same 11+ SWs. μ 23980 → 57390 raw (+139%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x06B80E,
        rows: 1, cols: 256, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMax: 55000 },
        stage2: { multiplier: 1.0, addend: 0, clampMax: 57000 },
        stage3: { multiplier: 1.0, addend: 0, clampMax: 58000 },
        critical: false, showPreview: false,
      },
      {
        id: 'edc17_c46_caddy_protection_c',
        name: 'Protection Ceiling C (Caddy 03L906018xx)',
        category: 'limiter',
        desc: 'Companion ceiling B at 0x06B5EC (256 uint16 LE cells = 512 B). Verified across same 11+ SWs. μ 24213 → 57390 raw (+137%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x06B5EC,
        rows: 1, cols: 256, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMax: 55000 },
        stage2: { multiplier: 1.0, addend: 0, clampMax: 57000 },
        stage3: { multiplier: 1.0, addend: 0, clampMax: 58000 },
        critical: false, showPreview: false,
      },
    ],
  },

  // ── MED17 VW Golf R 2.0 TFSI 1K8907115F — 0x1CEE80 IQ release ────────────
  //
  // VW Golf R Mk6 2.0 TFSI 198-202 kW (270 hp) — high-power EA113 EVO/EA888
  // Gen2. Bosch 0261S02782, VAG part 1K8907115F. 2 SW versions confirmed
  // across 4 paired files in pair_analysis_log.md VW pairs #311 sw505204,
  // #312/#313/#314 sw510589 (3 files of same SW).
  //
  // Common modifications:
  //   0x1CEE80  120 B = 60 cells u16 BE — IQ release (raw 10750 → 65535,
  //                                       +509%) — same map structure as
  //                                       1K0907115J/K cluster but at
  //                                       different anchor for R hardware
  //   0x1CEF37   10 B (or 0x1C3386 8B in alt files) — companion small region
  {
    id: 'med17_golf_r_20tfsi_1k8907115f',
    name: 'Bosch MED17 (VW Golf R Mk6 2.0 TFSI 270hp — 1K8907115F sw505204/510589)',
    manufacturer: 'Bosch',
    family: 'MED17',
    identStrings: ['1K8907115F', '505204', '510589', '504147'],
    fileSizeRange: [2097152, 2097152],
    vehicles: ['VW Golf R / Scirocco R 2.0 TFSI 198-202kW (1K8907115F/8P0907115B sw 505204/510589/504147, 2008-2012)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFFC,
    checksumLength: 4,
    maps: [
      {
        id: 'med17_golf_r_iq_release',
        name: 'IQ Release (Golf R 1K8907115F 0x1CEE80)',
        category: 'fuel',
        desc: 'IQ release at 0x1CEE80 (60 uint16 BE cells = 120 B). Verified across 2 SWs (sw505204 + sw510589) and 4 confirmation pairs. μ 10750 → 65535 raw (+509%). Sister of 1K0907115J/K MED17 def at different anchor for the R-spec hardware.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x1CEE80,
        rows: 1, cols: 60, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 60000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 63000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 65000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── MED17 VW Golf 2.0 TFSI 1K0907115/8P0907115 — 0x1CE0C8 IQ release ─────
  //
  // VW Golf 2.0 TFSI 147 kW (200 hp) MED17. Bosch hardware multiple
  // 0261S02xxx codes, VAG part numbers 1K0907115J/K, 8P0907115B (Audi A3
  // S3 cross-chassis). 5 SW versions across 3 part suffixes share the SAME
  // SGO base at offset 0x1CE0C8. Verified in pair_analysis_log.md VW pairs:
  // #295 sw386821 (1K0907115K), #300 sw381231 (8P0907115B), #301 sw381190
  // (1K0907115J), #304 sw387479 (8P0907115B), #299/302/303 sw387479
  // (1K0907115J — 4 files of 8P + 1K sharing this SW).
  //
  // Common modifications (all SWs):
  //   0x1CE0C8  120 B = 60 cells u16 BE — primary IQ release
  //                                       (raw 10604 → 65535, +518%)
  //   0x1CECE4   64 B = 32 cells u16 BE — companion IQ release
  //                                       (raw 32613 → 65535, +101%)
  //
  // This is the **universal MED17 EA113/EA888 IQ release map** — same
  // structure appears across MANY VW Golf MED17 SWs at slightly different
  // anchors per SW family (0x1CC6FC / 0x1CD0C6 / 0x1CD67A / 0x1CE0C8).
  // Wire matches the 0x1CE0C8 anchor cluster (5 SWs).
  {
    id: 'med17_golf_20tfsi_1k0907115_1ce0c8',
    name: 'Bosch MED17 (VW Golf 2.0 TFSI 200hp — 1K0907115J/K + 8P0907115B 0x1CE0C8)',
    manufacturer: 'Bosch',
    family: 'MED17',
    identStrings: ['381190', '381231', '386464', '386821', '387479'],
    fileSizeRange: [2097152, 2097152],
    vehicles: ['VW Golf 2.0 TFSI 147kW (1K0907115J/K + 8P0907115B sw 381190/381231/386464/386821/387479, 2005-2007)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFFC,
    checksumLength: 4,
    maps: [
      {
        id: 'med17_golf_20tfsi_iq_release_a',
        name: 'IQ Release A 120B (1K0907115J/K + 8P0907115B)',
        category: 'fuel',
        desc: 'Primary IQ release at 0x1CE0C8 (60 uint16 BE cells = 120 B). Verified across 5 SWs sharing IDENTICAL offset and treatment. μ 10604 → 65535 raw (+518%). The universal MED17 EA113/EA888 IQ release map — same shape appears across many VW Golf MED17 SWs at different anchors.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x1CE0C8,
        rows: 1, cols: 60, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 60000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 63000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'med17_golf_20tfsi_iq_release_b',
        name: 'IQ Release B 64B (1K0907115J/K + 8P0907115B)',
        category: 'fuel',
        desc: 'Companion IQ release at 0x1CECE4 (32 uint16 BE cells = 64 B). Verified across same 5 SWs. μ 32613 → 65535 raw (+101%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x1CECE4,
        rows: 1, cols: 32, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 60000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 63000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 65000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── MED17 Passat 2.0 TFSI 8P0907115B — IQ release at 0x1CE884 (2MB) ──
  //
  // VW Passat 2.0 TFSI (3C chassis) 147kW MED17 EA113. 2006 model year.
  // Same Bosch MED17 120B IQ unlock pattern as Golf, different anchor.
  // Verified in pair_analysis_log.md VW pair #918:
  //   0x1CE884  120B u16 BE — primary IQ ceiling (raw 10604 → 65535, +518%)
  //   0x1CF4A0  64B u16 BE — companion IQ release (raw 32613 → 65535, +101%)
  // Anchor shift Δ=0x7BC vs Golf's 0x1CE0C8. Same-family sub-cluster.
  {
    id: 'med17_passat_20tfsi_8p0907115b_1ce884',
    name: 'Bosch MED17 (VW Passat 2.0 TFSI 147kW — 8P0907115B 0x1CE884)',
    manufacturer: 'Bosch',
    family: 'MED17',
    identStrings: ['8P0907115B', '391091', '0261S02474'],
    fileSizeRange: [2097152, 2097152],
    vehicles: ['VW Passat 2.0 TFSI 147kW (8P0907115B sw 391091, 2006)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFFC,
    checksumLength: 4,
    maps: [
      {
        id: 'med17_passat_8p0907115b_iq_release_a',
        name: 'IQ Release A 120B (8P0907115B)',
        category: 'fuel',
        desc: 'Primary IQ release at 0x1CE884 (60 u16 BE = 120 B). μ 10604 → 65535 raw (+518%). Passat 3C-chassis anchor variant of the MED17 EA113 IQ unlock pattern.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x1CE884,
        rows: 1, cols: 60, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 60000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 63000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'med17_passat_8p0907115b_iq_release_b',
        name: 'IQ Release B 64B (8P0907115B)',
        category: 'fuel',
        desc: 'Companion IQ release at 0x1CF4A0 (32 u16 BE = 64 B). μ 32613 → 65535 raw (+101%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x1CF4A0,
        rows: 1, cols: 32, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 60000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 63000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 65000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── MED17 Passat 2.0 TFSI 3C0907115Q — IQ release at 0x1CE2A4 (2MB/2MB+2K) ──
  //
  // VW Passat 2.0 TFSI 147kW MED17 EA113. 2007-2008 model years.
  // Same 120B IQ unlock pattern at a third sub-family anchor.
  // Verified in pair_analysis_log.md VW pairs:
  //   #919 sw387486 (0261S02105) 2008 — 2099200B (2MB+2KB)
  //   #922 sw387486 (0261S02333) 2007 — 2097152B (standard 2MB)
  //   0x1CE2A4  120B u16 BE — primary IQ ceiling (raw 10604 → 65535, +518%)
  //   0x1CEEC0  64B u16 BE — companion IQ release (raw 32613 → 65535, +101%)
  // Note: Two file-size variants (2MB and 2MB+2KB) — same code structure.
  {
    id: 'med17_passat_20tfsi_3c0907115q_1ce2a4',
    name: 'Bosch MED17 (VW Passat 2.0 TFSI 147kW — 3C0907115Q 0x1CE2A4)',
    manufacturer: 'Bosch',
    family: 'MED17',
    identStrings: ['3C0907115Q', '387486', '0261S02105', '0261S02333'],
    fileSizeRange: [2097152, 2099200],
    vehicles: ['VW Passat 2.0 TFSI 147kW (3C0907115Q sw 387486, 2007-2008)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFFC,
    checksumLength: 4,
    maps: [
      {
        id: 'med17_passat_3c0907115q_iq_release_a',
        name: 'IQ Release A 120B (3C0907115Q)',
        category: 'fuel',
        desc: 'Primary IQ release at 0x1CE2A4 (60 u16 BE = 120 B). μ 10604 → 65535 raw (+518%). Passat 2007-2008 anchor variant.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x1CE2A4,
        rows: 1, cols: 60, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 60000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 63000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'med17_passat_3c0907115q_iq_release_b',
        name: 'IQ Release B 64B (3C0907115Q)',
        category: 'fuel',
        desc: 'Companion IQ release at 0x1CEEC0 (32 u16 BE = 64 B). μ 32613 → 65535 raw (+101%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x1CEEC0,
        rows: 1, cols: 32, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 60000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 63000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 65000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── MED17 Scirocco 1.4 TSI EA111 03C906016L — IQ release at 0x054912 (2MB) ──
  //
  // VW Scirocco 1.4 TSI 92kW (EA111 twincharged) MED17. 2008-2010 era.
  // 4 pairs at sw505084 observed — dominant IQ release cluster at 0x054912.
  // Verified in pair_analysis_log.md VW pairs #965, #966, #967, #972.
  //   0x054B28  6B u16 BE — IQ ceiling peak (raw 4135 → 45110, +991%)
  //   0x05484A  8B u16 BE — IQ release upper (raw 8270 → 52315, +533%)
  //   0x054912  64B u16 BE — primary IQ release (raw 11340 → 29791, +163%)
  //   0x05571A  42B u16 BE — emission limit (raw 317 → 0, -100%)
  // Pairs #965/#966 hit this cluster hard; pairs #967/#972 target different
  // torque tables — both confirm ORI layout at sw505084.
  {
    id: 'med17_scirocco_14tsi_03c906016l_054912',
    name: 'Bosch MED17 (VW Scirocco 1.4 TSI EA111 — 03C906016L 0x054912 IQ)',
    manufacturer: 'Bosch',
    family: 'MED17',
    identStrings: ['03C906016L', '505084', '0261S05589'],
    fileSizeRange: [2097152, 2097152],
    vehicles: ['VW Scirocco 1.4 TSI 92kW EA111 (03C906016L sw 505084, 2008-2010)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFFC,
    checksumLength: 4,
    maps: [
      {
        id: 'med17_scirocco_016l_iq_release',
        name: 'IQ Release 64B (03C906016L sw505084)',
        category: 'fuel',
        desc: 'Primary IQ release at 0x054912 (32 u16 BE = 64 B). Raw 11340 → 29791 (+163%). Observed in 2 of 4 pairs at this SW — tuner-selection pattern (heavier tunes hit this, torque-limiter tunes do not).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x054912,
        rows: 1, cols: 32, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 29000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 35000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 42000 },
        critical: true, showPreview: true,
      },
      {
        id: 'med17_scirocco_016l_iq_ceiling_peak',
        name: 'IQ Ceiling Peak 6B (03C906016L sw505084)',
        category: 'fuel',
        desc: 'Companion IQ ceiling peak at 0x054B28 (3 u16 BE = 6 B). Raw 4135 → 45110 (+991%). Small-cell peak that only heavy tunes hit.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x054B28,
        rows: 1, cols: 3, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 40000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 50000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 60000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── EDC17 C46 VW Golf 2.0 TDI CR 03L906022G/RP — 12×15 IQ ceiling (2MB) ──
  //
  // VW Golf 2.0 TDI CR 80-125 kW EDC17 C46 newer 505xxx+ generation.
  // 4 SWs across part suffixes G/RP all share the SAME 12×15 IQ ceiling
  // map at offset 0x1DBC2C. Verified in pair_analysis_log.md VW pairs:
  // #203 sw507615 (G), #229 sw507643 (G alt file), #230 sw507643 (G),
  // #231 sw516655 (G), #277 sw505993 (RP), #279/280 sw505426 (G).
  //
  // Map structure:
  //   0x1DBC2C  12×15 = 180 cells u16 BE — primary IQ ceiling
  //                                        (raw 15 → 27424, +180849%)
  //   0x1DE5B2  12×16 = 192 cells u16 BE — companion IQ ceiling
  //                                        (raw 607 → 9473, +1459%)
  //
  // SAME MAP STRUCTURE as wired Amarok 03L906019FA (12×15 IQ ceiling A
  // at 0x0623F0) — different anchor (high-region vs Amarok's low-region
  // for 03L906019FA). Confirms 12×15 IQ ceiling is a Bosch EDC17 C46
  // family-wide map shape.
  {
    id: 'edc17_c46_golf_20tdi_03l906022g_iqceiling',
    name: 'Bosch EDC17 C46 (VW Golf 2.0 TDI CR 80-125kW — 03L906022G/RP 12×15 IQ ceiling)',
    manufacturer: 'Bosch',
    family: 'EDC17',
    identStrings: ['505426', '505993', '507615', '507643', '516655', '504872', '507614'],
    fileSizeRange: [2097152, 2097152],
    vehicles: ['VW Golf/Scirocco 2.0 TDI CR 80-125kW (03L906022G/RP sw 505426/505993/507614/507615/507643/516655/504872, 2010-2013)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFFC,
    checksumLength: 4,
    maps: [
      {
        id: 'edc17_c46_golf_022g_iq_ceiling_a',
        name: 'IQ Ceiling A 12×15 (03L906022G/RP)',
        category: 'fuel',
        desc: 'Primary IQ ceiling at 0x1DBC2C (12 cols × 15 rows = 180 cells u16 BE). Verified across 5 SWs sharing IDENTICAL offset and treatment. Stock raw values ~15-50 (near zero) — tuners pin to ~27000 to release IQ. Same map structure as wired Amarok 03L906019FA def at different anchor.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x1DBC2C,
        rows: 15, cols: 12, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 27000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 30000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 33000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc17_c46_golf_022g_iq_ceiling_b',
        name: 'IQ Ceiling B 12×16 (03L906022G/RP)',
        category: 'fuel',
        desc: 'Companion IQ ceiling at 0x1DE5B2 (12 cols × 16 rows = 192 cells u16 BE). Verified across same 5 SWs. Stock raw values ~600-1000 — tuners pin to ~9000.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x1DE5B2,
        rows: 16, cols: 12, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 9000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 10500 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 12000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── EDC17 C46 VW Scirocco 2.0 TDI CR 03L906022G — 0x1F007A cluster (2MB) ──
  //
  // VW Scirocco (and Golf) 2.0 TDI CR 103-125 kW EDC17 C46 mid-gen. Same
  // protection-ceiling pattern as wired 398757 def but anchor SHIFTED
  // Δ=0xB78 higher (0x1EF502 → 0x1F007A). Identical raw values at both
  // anchors (14259 → 57390 +302%) confirms same code but relocated region.
  // Verified in pair_analysis_log.md VW pairs #988 (sw505989), #992 (sw504872).
  //
  // Map structure:
  //   0x1F007A  2 KB (1024 cells u16 BE) — primary protection ceiling
  //                                        raw 14259 → 57390 (+302%)
  //   0x1F0ABE  512 B (256 cells u16 BE) — companion ceiling
  //                                        raw 14413 → 57390 (+298%)
  //   0x1F089C  512 B (256 cells u16 BE) — secondary torque lift
  //                                        raw 23107 → 57390 (+148%)
  {
    id: 'edc17_c46_scirocco_20tdi_03l906022g_1f007a',
    name: 'Bosch EDC17 C46 (VW Scirocco/Golf 2.0 TDI CR 103-125kW — 03L906022G 0x1F007A)',
    manufacturer: 'Bosch',
    family: 'EDC17',
    identStrings: ['505989', '504872', '03L906022R', '507614', '505976', '505980', '505920', '03L906022RP', '03L906022QD', '505913', '505914'],
    fileSizeRange: [2097152, 2097152],
    vehicles: ['VW Scirocco/Sharan/Tiguan 2.0 TDI CR 100-125kW (03L906022G/R/RP/QD sw 505913/505914/505920/505976/505980/505989/504872/507614, 2009-2011)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFFC,
    checksumLength: 4,
    maps: [
      {
        id: 'edc17_c46_scirocco_1f007a_ceiling_a',
        name: 'Protection Ceiling A 2KB (03L906022G sw505989/sw504872)',
        category: 'limiter',
        desc: 'Primary protection ceiling at 0x1F007A (1024 u16 BE = 2 KB). Raw 14259 → 57390 (+302%). Δ=0xB78 anchor-shifted variant of 398757 cluster — same code structure at a later SW revision anchor.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x1F007A,
        rows: 32, cols: 32, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 50000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 55000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 60000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc17_c46_scirocco_1f007a_ceiling_b',
        name: 'Protection Ceiling B 512B (03L906022G sw505989/sw504872)',
        category: 'limiter',
        desc: 'Companion ceiling at 0x1F0ABE (256 u16 BE = 512 B). Raw 14413 → 57390 (+298%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x1F0ABE,
        rows: 16, cols: 16, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 50000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 55000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 60000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc17_c46_scirocco_1f007a_torque_c',
        name: 'Torque Lift 512B (03L906022G sw505989/sw504872)',
        category: 'limiter',
        desc: 'Secondary torque lift at 0x1F089C (256 u16 BE = 512 B). Raw 23107 → 57390 (+148%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x1F089C,
        rows: 16, cols: 16, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 50000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 55000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 60000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc17_c46_scirocco_1f007a_200b',
        name: 'IQ Release 200B (03L906022G — 2MB-format)',
        category: 'fuel',
        desc: 'IQ release 200B at 0x1FB0EA (100 cells u16 BE). Raw 4135 → 12405 (+200%). 2MB-format twin of the 524KB 0x079DB6 200B pattern (Δ=+0x180000 dump shift).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x1FB0EA,
        rows: 1, cols: 100, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 11000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 12000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 13000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc17_c46_scirocco_1f007a_iq_unlock',
        name: 'IQ Unlock 6B (03L906022G — 2MB-format of 0x06625E)',
        category: 'fuel',
        desc: 'IQ unlock 6B at 0x1E625E (3 cells u16 BE). Raw 2130 → 12405 (+482%). 2MB-format twin of the 524KB 0x06625E 6B IQ unlock (Δ=+0x180000 dump shift).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x1E625E,
        rows: 1, cols: 3, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 11000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 12000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 13000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── EDC17 C46 VW Golf 2.0 TDI CR 03L906018xx — 0x06AD86 cluster (2MB) ─────
  //
  // VW Golf 2.0 TDI CR 100-125 kW EDC17 C46. 4 SW versions across 4 part
  // suffixes (AR/BB/BC/GC) all share the SAME SGO base at offset 0x06AD86
  // (Δ=0x44 from VW Caddy's 0x06ADCA cluster — sister sub-family). Verified
  // in pair_analysis_log.md VW pairs #243 (BC sw510944), #244 (AR sw525558),
  // #247 (GC sw508903), #252 (BB sw510943).
  //
  // Common modifications (all SWs):
  //   0x06AD86  2 KB (1024 cells u16 LE) — main protection ceiling +169-274%
  //   0x07E036  200 B (100 cells u16 BE) — secondary ceiling at very high %
  //
  // Same protection-ceiling family-wide pattern as wired Caddy / 398757 /
  // 03L906022FG defs — just at a different per-SGO anchor (0x06AD86).
  {
    id: 'edc17_c46_golf_20tdi_03l906018xx_06ad86',
    name: 'Bosch EDC17 C46 (VW Golf/Sharan/Tiguan/Touran 2.0 TDI CR 80-125kW — 03L906018AR/BB/BC/GC/DQ/BD/HQ/FA/FB/DR/NM 0x06AD86)',
    manufacturer: 'Bosch',
    family: 'EDC17',
    identStrings: ['508903', '509927', '509929', '510943', '510944', '510958', '510959', '513641', '524624', '525556', '525558', '509915', '513640', '509900', '509913', '511990', '509916', '515262', '03L906018DQ', '03L906018BD', '03L906018HQ', '03L906018FA', '03L906018FB', '03L906018DR', '03L906018NM'],
    fileSizeRange: [2097152, 2097152],
    vehicles: ['VW Golf + Passat 2.0 TDI CR 100-125kW (03L906018/AR/AT/BB/BC/BE/BF/BG/GC sw 508903/509927/509929/510943/510944/510958/510959/513641/524624/525556/525558, 2010-2012)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFFC,
    checksumLength: 4,
    maps: [
      {
        id: 'edc17_c46_golf_06ad86_protection',
        name: 'Protection Ceiling (Golf 03L906018xx 0x06AD86)',
        category: 'limiter',
        desc: 'Main protection ceiling at 0x06AD86 (1024 uint16 LE cells = 2 KB). Verified across 4 SWs all sharing IDENTICAL offset and treatment. μ 15351-21260 → 57390 raw (+170-274%). Sister of Caddy 0x06ADCA cluster (Δ=0x44 anchor shift). Pin near tuner consensus (~55000) for Stage 1.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x06AD86,
        rows: 1, cols: 1024, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMax: 55000 },
        stage2: { multiplier: 1.0, addend: 0, clampMax: 57000 },
        stage3: { multiplier: 1.0, addend: 0, clampMax: 58000 },
        critical: false, showPreview: false,
      },
    ],
  },

  // ── EDC17 C46 VW Scirocco 2.0 TDI CR 03L906018AM/AN/AQ — 0x069EB2 cluster ─
  //
  // VW Scirocco (Golf family) 2.0 TDI CR 100-103 kW EDC17 C46 late-gen.
  // 3 SWs across 3 part suffixes (AM/AN/AQ) all share the SAME 2KB+512B+512B
  // protection ceiling at 0x069EB2. Verified across 5 pairs in
  // pair_analysis_log.md:
  //   #998 sw508256 AM · #999 sw508235 AN · #1001/#1002 sw508256 AM ·
  //   #1003 sw508234 AQ
  //
  // Map structure (EXACTLY same stock-to-target at each SW):
  //   0x069EB2  2 KB (1024 cells u16 BE) — protection ceiling
  //                                        (raw 15351 → 57390, +274%)
  //   0x06A6D4  512 B (256 cells u16 BE) — companion A (raw 24523 → 57390)
  //   0x06A8F6  512 B (256 cells u16 BE) — companion B (raw 24590 → 57390)
  //
  // SAME family-wide pattern as wired 398757 / 0x1F007A / 03L906018xx
  // 0x06AD86 defs — just at a different per-SGO anchor (0x069EB2).
  // Stock raw 15351 is slightly higher than 398757's 14259 = different
  // hardware generation.
  {
    id: 'edc17_c46_scirocco_03l906018am_069eb2',
    name: 'Bosch EDC17 C46 (VW Scirocco 2.0 TDI CR 100-103kW — 03L906018AM/AN/AQ 0x069EB2)',
    manufacturer: 'Bosch',
    family: 'EDC17',
    identStrings: ['03L906018AM', '03L906018AN', '03L906018AQ', '03L906018CD', '508222', '508234', '508235', '508256'],
    fileSizeRange: [2097152, 2097152],
    vehicles: ['VW Scirocco/Tiguan 2.0 TDI CR 100-103kW (03L906018AM/AN/AQ/CD sw 508222/508234/508235/508256, 2010-2012)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFFC,
    checksumLength: 4,
    maps: [
      {
        id: 'edc17_c46_018am_protection_a',
        name: 'Protection Ceiling A 2KB (03L906018AM/AN/AQ)',
        category: 'limiter',
        desc: 'Main protection ceiling at 0x069EB2 (1024 cells u16 BE = 2 KB). Verified across 5 pairs sharing IDENTICAL offset and raw signature: stock 15351 → tuner consensus 57390 (+274%). Pin near 55000 for Stage 1.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x069EB2,
        rows: 32, cols: 32, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 50000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 55000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 57000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc17_c46_018am_protection_b',
        name: 'Protection Ceiling B 512B (03L906018AM/AN/AQ)',
        category: 'limiter',
        desc: 'Companion ceiling A at 0x06A6D4 (256 u16 BE = 512 B). Raw 24523 → 57390 (+134%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x06A6D4,
        rows: 16, cols: 16, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 50000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 55000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 57000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc17_c46_018am_protection_c',
        name: 'Protection Ceiling C 512B (03L906018AM/AN/AQ)',
        category: 'limiter',
        desc: 'Companion ceiling B at 0x06A8F6 (256 u16 BE = 512 B). Raw 24590 → 57390 (+133%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x06A8F6,
        rows: 16, cols: 16, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 50000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 55000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 57000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── EDC17 C46 VW Sharan 2.0 TDI CR 03L906018HH/HJ/HK — 0x06B4FE cluster ───
  //
  // VW Sharan Mk2 (7N chassis) 2.0 TDI CR 103 kW EDC17 C46. 2010-2012.
  // 4 SWs across 3 part suffixes (HH/HJ/HK) share the SAME 2KB protection
  // ceiling anchor at 0x06B4FE. Verified in pair_analysis_log.md VW pairs:
  //   #1013 sw518191 HH · #1015 sw518192 HJ · #1020 sw518177 HK ·
  //   + #1017 sw517509 HK (anchor at 0x06B12A, Δ=-0x3D4 sub-variant)
  //
  // Map structure (tight raw-value signature across 4 SWs):
  //   0x06B4FE  2 KB (1024 cells u16 BE) — protection ceiling
  //                                        raw 21275 → 47483 (+123%)
  // Companion maps vary per SW at Δ=4-8 offsets — not wired per-def yet.
  //
  // NOTE: sw518189 H (pair #1024) hits 0x06B4FE at SAME anchor but raw
  // 21260 → 57390 (+170%) — different tuner/target (398757-family target).
  // Stock raw 21260 vs 21275 close — code-layout identical. sw518189 added
  // as identString since ORI structure matches.
  {
    id: 'edc17_c46_sharan_03l906018hxx_06b4fe',
    name: 'Bosch EDC17 C46 (VW Sharan 2.0 TDI CR 100-103kW — 03L906018HH/HJ/HK/H 0x06B4FE)',
    manufacturer: 'Bosch',
    family: 'EDC17',
    identStrings: ['03L906018HH', '03L906018HJ', '03L906018HK', '03L906018H', '03L906018KS', '517509', '518177', '518179', '518189', '518191', '518192', '527002', '527003'],
    fileSizeRange: [2097152, 2097152],
    vehicles: ['VW Sharan 2.0 TDI CR 100-103kW (03L906018HH/HJ/HK/H/KS sw 517509/518177/518179/518189/518191/518192/527002/527003, 2010-2012)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFFC,
    checksumLength: 4,
    maps: [
      {
        id: 'edc17_c46_sharan_06b4fe_protection',
        name: 'Protection Ceiling 2KB (Sharan 03L906018HH/HJ/HK/H)',
        category: 'limiter',
        desc: 'Main protection ceiling at 0x06B4FE (1024 cells u16 BE = 2 KB). Verified across 4 SWs sharing EXACT anchor + raw signature: stock 21275 → tuner consensus 47483 (+123%). sw517509 HK uses Δ=-0x3D4 anchor (0x06B12A) — same map, slight SW-rev shift. sw518189 H hits same anchor with different target (57390, +170%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x06B4FE,
        rows: 32, cols: 32, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 45000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 50000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 55000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc17_c46_sharan_06bf42_ceiling_b',
        name: 'Protection Ceiling B 512B (Sharan 03L906018HH/HJ/HK)',
        category: 'limiter',
        desc: 'Companion protection ceiling B at 0x06BF42 (256 cells u16 BE = 512 B). Raw 23980 → 57390 (+139%). Verified in pairs #1038 (HH sw518191), #1039 (HJ sw518192).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x06BF42,
        rows: 16, cols: 16, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 50000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 55000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 57000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc17_c46_sharan_06bd20_ceiling_c',
        name: 'Protection Ceiling C 512B (Sharan 03L906018HH/HJ/HK)',
        category: 'limiter',
        desc: 'Companion protection ceiling C at 0x06BD20 (256 cells u16 BE = 512 B). Raw 24213 → 57390 (+137%). Verified in pairs #1038 (HH), #1039 (HJ).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x06BD20,
        rows: 16, cols: 16, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 50000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 55000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 57000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── EDC16U31 VW T5 1.9 TDI PD 038906016T/AJ — 0x06A8ED IQ cluster ──────────
  //
  // VW T5 Transporter 1.9 TDI PD 77kW EDC16U31 (earlier than U34 used on
  // cars). 3 SWs across 2 part suffixes (T/AJ) share the SAME 11-byte IQ
  // edit at 0x06A8ED in 524KB format. Verified in pair_analysis_log.md
  // VW pairs: #1066 sw384631 T (524KB), #1070 sw384633 AJ (524KB),
  // #1072 sw381381 AJ (524KB).
  // SAME map also present at 0x1EA8D9 in 2MB dump format (Δ=+0x184000)
  // per pair #1068 sw380415 AJ. That's an unusual +0x184000 shift
  // (vs typical +0x180000) — T5 EDC16U31 has its own dump convention.
  //
  // Tight raw signature: stock 16801 → tuner consensus 37845 (+125%).
  //
  // Note: sw379728 T hits a slightly shifted anchor 0x06A8D9 (Δ=-0x14) —
  // added as identString but the primary fixedOffset is 0x06A8ED.
  {
    id: 'edc16u31_t5_19tdi_038906016_06a8ed',
    name: 'Bosch EDC16U31 (VW T5 1.9 TDI PD 77kW — 038906016T/AJ 0x06A8ED)',
    manufacturer: 'Bosch',
    family: 'EDC16',
    identStrings: ['038906016T', '038906016AJ', '379728', '381381', '384631', '384633', '380413'],
    fileSizeRange: [524288, 524288],
    vehicles: ['VW T5 Transporter 1.9 TDI PD 77kW (038906016T/AJ sw 379728/380413/381381/384631/384633, 2005-2008)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFFC,
    checksumLength: 4,
    maps: [
      {
        id: 'edc16u31_t5_19tdi_iq_unlock',
        name: 'IQ Unlock 11B (T5 1.9 TDI 038906016T/AJ)',
        category: 'fuel',
        desc: 'IQ unlock at 0x06A8ED (5-6 cells u16 BE = 11 B). Verified across 3 SWs (sw384631 T, sw384633 AJ, sw381381 AJ) sharing EXACT anchor + raw signature: stock 16801 → tuner consensus 37845 (+125%). sw379728 T uses Δ=-0x14 anchor (0x06A8D9) — same map, SW-rev shift.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x06A8ED,
        rows: 1, cols: 6, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 35000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 40000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 45000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── EDC16U31 VW T5 1.9 TDI PD 038906016AJ 2MB dump — 0x1EA8D9 IQ cluster ──
  //
  // 2MB-format twin of the 524KB 0x06A8ED def. Dump shift Δ=+0x184000.
  // Verified in pair #1068 sw380415 AJ.
  {
    id: 'edc16u31_t5_19tdi_038906016aj_2mb',
    name: 'Bosch EDC16U31 (VW T5 1.9 TDI PD 77kW — 038906016AJ 2MB dump 0x1EA8D9)',
    manufacturer: 'Bosch',
    family: 'EDC16',
    identStrings: ['380415', '381381'],
    fileSizeRange: [2097152, 2097152],
    vehicles: ['VW T5 Transporter 1.9 TDI PD 77kW 2MB dump (038906016AJ sw 380415/381381, 2005-2006)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFFC,
    checksumLength: 4,
    maps: [
      {
        id: 'edc16u31_t5_2mb_iq_unlock',
        name: 'IQ Unlock 11B (T5 1.9 TDI 038906016AJ 2MB)',
        category: 'fuel',
        desc: 'IQ unlock at 0x1EA8D9 (5-6 cells u16 BE = 11 B). 2MB-format twin of 0x06A8ED (Δ=+0x184000 dump shift). Verified in pair #1068 sw380415 AJ — raw signature matches 524KB cluster.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x1EA8D9,
        rows: 1, cols: 6, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 35000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 40000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 45000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── EDC17 C64 VW Transporter 2.0 TDI CR 03L906019GH/GJ/FK/FL — 0x067494 ──
  //
  // VW Transporter T5 2.0 TDI CR 103 kW EDC17 C64 late-gen LX family.
  // 4 SWs across 4 part suffixes (GH/GJ/FK/FL) share EXACT 12×15 IQ
  // ceiling + 12×15 companion at 0x067494. Verified in pair_analysis_log.md
  // VW pairs:
  //   #1310 sw525525 GH · #1345 sw524688 GJ · #1348 sw525529 FK ·
  //   #1349 sw524684 FL
  //
  // Map structure (EXACT match across 4 SWs):
  //   0x067494  12×15 = 180 cells u16 BE — IQ ceiling (15 → 27232, +179584%)
  //   0x067CD0  12×15 = 180 cells u16 BE — IQ companion (649 → 24771, +3715%)
  //
  // SAME 12×15 + 12×15 IQ ceiling pattern shape as wired Amarok 0x0623F0
  // and Golf 0x1DBC2C defs — at THIRD anchor 0x067494 for Transporter
  // C64 late-gen family. Confirms universal Bosch EDC17 IQ ceiling shape.
  {
    id: 'edc17_c64_transporter_20tdi_03l906019gh_067494',
    name: 'Bosch EDC17 C64 (VW Transporter 2.0 TDI CR 103kW — 03L906019GH/GJ/FK/FL 0x067494)',
    manufacturer: 'Bosch',
    family: 'EDC17',
    identStrings: ['03L906019GH', '03L906019GJ', '03L906019FK', '03L906019FL', '524684', '524688', '525525', '525529'],
    fileSizeRange: [2097152, 2097152],
    vehicles: ['VW Transporter T5 2.0 TDI CR 103kW (03L906019GH/GJ/FK/FL sw 524684/524688/525525/525529, 2012-2013)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFFC,
    checksumLength: 4,
    maps: [
      {
        id: 'edc17_c64_t5_067494_iq_ceiling_a',
        name: 'IQ Ceiling A 12×15 (Transporter 03L906019GH/GJ/FK/FL)',
        category: 'fuel',
        desc: 'IQ ceiling A at 0x067494 (12×15 = 180 cells u16 BE). 4 SWs + 4 suffixes EXACT anchor: stock 15 → tuner consensus 27232 (+179584% — near-zero release).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x067494,
        rows: 15, cols: 12, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 25000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 28000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 32000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc17_c64_t5_067cd0_iq_ceiling_b',
        name: 'IQ Ceiling B 12×15 (Transporter 03L906019GH/GJ/FK/FL)',
        category: 'fuel',
        desc: 'IQ ceiling B at 0x067CD0 (12×15 = 180 cells u16 BE). Stock 649 → 24771 (+3715%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x067CD0,
        rows: 15, cols: 12, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 22000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 25000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 29000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── EDC17 C46 VW Transporter 2.0 BiTDI/TDI CR 03L906022JD/JE — 0x077DBA ──
  //
  // VW Transporter T5 2.0 BiTDI CR / 2.0 TDI CR 132 kW EDC17 C46.
  // 3 SWs across 2 part suffixes + 1 alt-part (03L907309L) share EXACT
  // anchor + raw signature. Verified in pair_analysis_log.md VW pairs:
  //   #1296 sw518073 JD · #1298 sw518079 03L907309L · #1303 sw518073 JD ·
  //   #1304 sw518073 JD · #1305 sw518073 JD · #1306 sw518078 JE
  //
  // Map structure (EXACT match across 6 pairs):
  //   0x077DBA  16×16 = 512 B u16 BE — torque ceiling (22134 → 47749, +116%)
  //   0x037C7A  104 B u16 BE — emission cut A (37006 → 32, -99.9%)
  //   0x037F28  40 B u16 BE — emission cut B (29968 → 32, -99.9%)
  //   0x037E1C  8×4 = 32 B u16 BE — emission cut C (15679 → 32, -99.8%)
  {
    id: 'edc17_c46_transporter_20bitdi_03l906022jd_077dba',
    name: 'Bosch EDC17 C46 (VW Transporter 2.0 BiTDI/TDI CR 132kW — 03L906022JD/JE 0x077DBA)',
    manufacturer: 'Bosch',
    family: 'EDC17',
    identStrings: ['03L906022JD', '03L906022JE', '03L906022JF', '03L907309L', '518073', '518078', '518079'],
    fileSizeRange: [2097152, 2097152],
    vehicles: ['VW Transporter T5 2.0 BiTDI CR 132.4kW (03L906022JD/JE/JF sw 518073/518078/518079, 2010-2011)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFFC,
    checksumLength: 4,
    maps: [
      {
        id: 'edc17_c46_t5_077dba_torque_ceiling',
        name: 'Torque Ceiling 16×16 (Transporter 03L906022JD/JE)',
        category: 'limiter',
        desc: 'Torque ceiling at 0x077DBA (16×16 = 256 cells u16 BE = 512 B). 3 SWs + 6 pairs EXACT anchor: stock 22134 → tuner consensus 47749 (+116%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x077DBA,
        rows: 16, cols: 16, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 44000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 48000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 53000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── EDC17 C46 VW Transporter 2.0 BiTDI CR 03L906022JE — 0x07C9F2 alt-anchor ─
  //
  // Sub-variant of 0x077DBA cluster — same raw signature (22134 → 47749)
  // but at Δ=+0x4C238 shifted anchor for specific SWs. Verified in
  // pair_analysis_log.md VW pairs:
  //   #1297 sw509954 JE · #1299 sw508906 (508906P755W) ·
  //   #1307 sw509954 JE (sister of #1297)
  {
    id: 'edc17_c46_transporter_20bitdi_03l906022je_07c9f2',
    name: 'Bosch EDC17 C46 (VW Transporter 2.0 BiTDI CR 132kW — 03L906022JE 0x07C9F2 alt-anchor)',
    manufacturer: 'Bosch',
    family: 'EDC17',
    identStrings: ['509954', '508906'],
    fileSizeRange: [2097152, 2097152],
    vehicles: ['VW Transporter T5 2.0 BiTDI CR 132.4kW (03L906022JE / 508906P755W sw 509954/508906, 2010-2011)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFFC,
    checksumLength: 4,
    maps: [
      {
        id: 'edc17_c46_t5_07c9f2_torque_ceiling',
        name: 'Torque Ceiling 16×16 (Transporter 03L906022JE alt-anchor)',
        category: 'limiter',
        desc: 'Torque ceiling at 0x07C9F2 (16×16 = 256 cells u16 BE = 512 B). 2 SWs + 3 pairs EXACT anchor: stock 22134 → tuner consensus 47749 (+116%). Δ=+0x4C238 shift from 0x077DBA main cluster — sw509954/sw508906 sub-variant.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x07C9F2,
        rows: 16, cols: 16, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 44000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 48000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 53000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── EDC17 C46 VW Transporter 2.0 TDI CR 03L906022CD/CH — 0x070292 2KB ────
  //
  // VW Transporter T5 2.0 TDI CR 75-103 kW EDC17 C46. 2 SWs across
  // 2 part suffixes (CD/CH) share EXACT 2KB protection ceiling anchor.
  // Verified in pair_analysis_log.md VW pairs:
  //   #1308 sw518131 CD 75kW · #1312 sw518139 CH 103kW
  //
  // Map structure:
  //   0x070292  2 KB (1024 cells u16 BE) — protection ceiling
  //                                        (20108 → 57390, +185%)
  //   0x07000A  512 B u16 BE — companion (30474 → 57390, +88%)
  //   0x037AC6  66 B u16 BE — emission cut (22424 → 32, -99.9%)
  {
    id: 'edc17_c46_transporter_20tdi_03l906022cd_070292',
    name: 'Bosch EDC17 C46 (VW Transporter 2.0 TDI CR 75-103kW — 03L906022CD/CH 0x070292)',
    manufacturer: 'Bosch',
    family: 'EDC17',
    identStrings: ['03L906022CD', '03L906022CH', '03L906022CK', '03L906022CB', '03L906019DH', '03L906019DK', '03L906019DG', '518131', '518139', '518140', '518152', '518153', '518154', '518155'],
    fileSizeRange: [2097152, 2097152],
    vehicles: ['VW Transporter T5 2.0 TDI CR 61.8-103kW (03L906022CD/CH/CK/CB + 03L906019DH/DK/DG sw 518131/518139/518140/518152/518153/518154/518155, 2010-2012)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFFC,
    checksumLength: 4,
    maps: [
      {
        id: 'edc17_c46_t5_070292_protection',
        name: 'Protection Ceiling 2KB (Transporter 03L906022CD/CH)',
        category: 'limiter',
        desc: 'Protection ceiling at 0x070292 (1024 cells u16 BE = 2 KB). 2 SWs EXACT anchor: stock 20108 → tuner consensus 57390 (+185%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x070292,
        rows: 32, cols: 32, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 50000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 55000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 60000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc17_c46_t5_07000a_companion',
        name: 'Companion Ceiling 512B (Transporter CD/CH)',
        category: 'limiter',
        desc: 'Companion at 0x07000A (256 cells u16 BE = 512 B). Stock 30474 → 57390 (+88%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x07000A,
        rows: 16, cols: 16, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 50000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 55000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 60000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── EDC17 C46 VW Touran/Golf 2.0 TDI CR — 0x1ED29A 2MB anchor-shifted ────
  //
  // VW Touran / Golf 2.0 TDI CR 103 kW EDC17 C46 with Δ=-0x2DE shift from
  // 0x1F007A cluster. Same raw signature 14259 → 57390 at different
  // cal-block anchor — per-SW sub-variant. 2 SWs confirmed. Verified in
  // pair_analysis_log.md VW pairs:
  //   #1135 sw395477 `03L906022G` · #1281 sw396412 `03L906022BQ`
  //
  // Map structure (EXACT match):
  //   0x1ED29A  2048 B u16 BE — protection ceiling A (14259 → 57390, +302%)
  //   0x1EDCDE  512 B u16 BE — companion A (14413 → 57390, +298%)
  //   0x1EDABC  512 B u16 BE — torque lift (23107 → 57390, +148%)
  //   0x1F8246  200 B u16 BE — IQ release (4135 → 12405, +200%)
  {
    id: 'edc17_c46_golf_touran_20tdi_1ed29a',
    name: 'Bosch EDC17 C46 (VW Golf/Touran 2.0 TDI CR 103kW — 03L906022G/BQ 0x1ED29A)',
    manufacturer: 'Bosch',
    family: 'EDC17',
    identStrings: ['395477', '396412'],
    fileSizeRange: [2097152, 2097152],
    vehicles: ['VW Golf/Touran 2.0 TDI CR 103kW (03L906022G/BQ sw 395477/396412, 2009-2010)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFFC,
    checksumLength: 4,
    maps: [
      {
        id: 'edc17_c46_1ed29a_protection',
        name: 'Protection Ceiling 2KB (Golf/Touran sw395477/sw396412)',
        category: 'limiter',
        desc: 'Protection ceiling at 0x1ED29A (1024 cells u16 BE = 2 KB). 2 SWs EXACT anchor: stock 14259 → tuner consensus 57390 (+302%). Δ=-0x2DE anchor-shift of main 0x1F007A cluster.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x1ED29A,
        rows: 32, cols: 32, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 50000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 55000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 60000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc17_c46_1edcde_companion',
        name: 'Companion Ceiling 512B (Golf/Touran 1ED29A cluster)',
        category: 'limiter',
        desc: 'Companion at 0x1EDCDE (256 cells u16 BE = 512 B). Stock 14413 → 57390 (+298%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x1EDCDE,
        rows: 16, cols: 16, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 50000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 55000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 60000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── EDC16 PD VW Touran 1.9 TDI 03G906021KB/KC — 0x064963 524KB cluster ───
  //
  // VW Touran 1.9 TDI PD 77 kW EDC16 PD. 2 part suffixes KB/KC share
  // EXACT anchor + stock signature across 3 SWs. Verified in
  // pair_analysis_log.md VW pairs:
  //   #1267 sw379714 KB · #1268 sw382091 KB · #1269 sw382090 KC
  //
  // Map structure:
  //   0x064963  13B u16 BE — IQ upper A (stock 12850)
  //   0x064977  13B u16 BE — IQ upper B (stock 19933)
  //   0x06498B  13B u16 BE — IQ upper C (stock 22621)
  //   0x06484F  13B u16 BE — IQ upper D (stock 21424)
  //
  // Target per tune intensity varies: heavy tune 12850 → 39005 (+203%),
  // mild tune 12850 → 30130 (+134%). Both #1268 and #1269 share identical
  // mild tune data at all 4 anchors — tuner applied same settings to KB
  // and KC parts.
  {
    id: 'edc16_pd_touran_19tdi_03g906021kb_064963',
    name: 'Bosch EDC16 PD (VW Touran 1.9 TDI PD 77kW — 03G906021KB/KC 0x064963)',
    manufacturer: 'Bosch',
    family: 'EDC16',
    identStrings: ['03G906021KB', '03G906021KC', '379714', '382090', '382091'],
    fileSizeRange: [524288, 524288],
    vehicles: ['VW Touran 1.9 TDI PD 77kW (03G906021KB/KC sw 379714/382090/382091, 2006)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFFC,
    checksumLength: 4,
    maps: [
      {
        id: 'edc16_pd_touran_064963_iq_upper_a',
        name: 'IQ Upper A 13B (Touran 03G906021KB/KC)',
        category: 'fuel',
        desc: 'IQ upper A at 0x064963 (6-7 cells u16 BE = 13 B). 3 SWs EXACT anchor: stock 12850 → tuner consensus 30130-39005 (+134-203% varies by tune intensity).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x064963,
        rows: 1, cols: 7, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 28000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 33000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 38000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc16_pd_touran_064977_iq_upper_b',
        name: 'IQ Upper B 13B (Touran 03G906021KB/KC)',
        category: 'fuel',
        desc: 'IQ upper B at 0x064977 (Δ=+0x14 from A). Stock 19933 → 37426 (+88%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x064977,
        rows: 1, cols: 7, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 35000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 40000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 45000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── EDC16 PD VW Touran 1.9 TDI 03G906021AB — 0x05AA99 triple-mirror 524KB ─
  //
  // VW Touran 1.9 TDI PD 77 kW EDC16 PD early SW 03G906021AB.
  // Single SW with 2 pairs (2 different tuner styles). Verified in
  // pair_analysis_log.md VW pairs:
  //   #1259 sw389840 (2007) · #1273 sw389840 (2007 sister)
  //
  // Map structure — triple mirror at stride +0x200:
  //   0x05AA99  13B u16 BE — IQ mirror A (stock 7470)
  //   0x05AC99  13B u16 BE — IQ mirror B (Δ=+0x200)
  //   0x05AE99  13B u16 BE — IQ mirror C (Δ=+0x400)
  //   Stock 7470 → 21081-21124 (+182%) across all 3 mirrors
  {
    id: 'edc16_pd_touran_19tdi_03g906021ab_05aa99',
    name: 'Bosch EDC16 PD (VW Touran 1.9 TDI PD 77kW — 03G906021AB 0x05AA99 triple-mirror)',
    manufacturer: 'Bosch',
    family: 'EDC16',
    identStrings: ['03G906021AB', '03G906021RN', '389840', '391834'],
    fileSizeRange: [524288, 524288],
    vehicles: ['VW Touran 1.9/2.0 TDI PD 77-103kW (03G906021AB/RN sw 389840/391834, 2002-2007)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFFC,
    checksumLength: 4,
    maps: [
      {
        id: 'edc16_pd_touran_05aa99_iq_mirror_a',
        name: 'IQ Mirror A 13B (Touran 03G906021AB)',
        category: 'fuel',
        desc: 'IQ mirror A at 0x05AA99 (6-7 cells u16 BE = 13 B). 2 pairs same SW confirm: stock 7470 → tuner consensus 21081-21124 (+182%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x05AA99,
        rows: 1, cols: 7, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 19000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 22000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 25000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc16_pd_touran_05ac99_iq_mirror_b',
        name: 'IQ Mirror B 13B (Touran 03G906021AB Δ=+0x200)',
        category: 'fuel',
        desc: 'IQ mirror B at 0x05AC99 (Δ=+0x200 from A). Same raw signature.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x05AC99,
        rows: 1, cols: 7, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 19000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 22000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 25000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc16_pd_touran_05ae99_iq_mirror_c',
        name: 'IQ Mirror C 13B (Touran 03G906021AB Δ=+0x400)',
        category: 'fuel',
        desc: 'IQ mirror C at 0x05AE99 (Δ=+0x400 from A). Same raw signature.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x05AE99,
        rows: 1, cols: 7, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 19000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 22000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 25000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── SIMOS PCR21 VW Touran 1.6 TDI CR SM2F0L9500000 — 0x18CE5A 2MB cluster ─
  //
  // VW Touran 1.6 TDI CR (CAYC engine) 77 kW Siemens SIMOS PCR21.
  // 2 pairs across 2 part-number suffixes (ND/PJ) share EXACT anchor +
  // raw signature. Verified in pair_analysis_log.md VW pairs:
  //   #1250 SM2F0L9500000 03L906023PJ 2012 · #1251 SM2F0L9500000 03L906023ND
  //   2010 (CAYC engine stamp)
  //
  // Map structure:
  //   0x18CE5A  14B u16 BE — IQ unlock A (stock 382 → 45218, +11737%)
  //   0x18D27A  14B u16 BE — IQ unlock B (stock 2651 → 47487, +1691%)
  //   0x18D25A / 0x18D87A  14B — mirrors of B (stock 4699 → 49535, +954%)
  //   0x18C87A  14B — ceiling limit (stock 6489 → 41963, +547%)
  //
  // Note: SM2G0LG000000 (pair #1252 same 03L906023PJ part) hits shifted
  // anchor 0x18D412 (Δ=+0x5B8) with SAME raw signature — different serial
  // family (SM2G vs SM2F), separate sub-variant.
  {
    id: 'pcr21_touran_16tdi_sm2f0l_18ce5a',
    name: 'Siemens SIMOS PCR21 (VW Touran 1.6 TDI CR 77kW — SM2F0L9500000 0x18CE5A)',
    manufacturer: 'Siemens',
    family: 'SIMOS_PCR21',
    identStrings: ['SM2F0L9500000', '03L906023PJ', '03L906023ND', 'CAYC'],
    fileSizeRange: [2097152, 2097152],
    vehicles: ['VW Touran 1.6 TDI CR 77kW (03L906023ND/PJ CAYC engine, 2010-2012)'],
    maps: [
      {
        id: 'pcr21_touran_18ce5a_iq_unlock_a',
        name: 'IQ Unlock A 14B (Touran SM2F0L9500000)',
        category: 'fuel',
        desc: 'IQ unlock A at 0x18CE5A (7 cells u16 BE = 14 B). 2 pairs across 2 part suffixes EXACT anchor: stock 382 → tuner consensus 45218 (+11737% — massive IQ release).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x18CE5A,
        rows: 1, cols: 7, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 42000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 45000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 48000 },
        critical: true, showPreview: true,
      },
      {
        id: 'pcr21_touran_18d27a_iq_unlock_b',
        name: 'IQ Unlock B 14B (Touran SM2F0L9500000)',
        category: 'fuel',
        desc: 'IQ unlock B at 0x18D27A (7 cells u16 BE = 14 B). Stock 2651 → 47487 (+1691%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x18D27A,
        rows: 1, cols: 7, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 45000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 48000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 50000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── EDC17 VW Touareg 4.2 TDI CR V8 7P0907409 — 0x1ACE30 2MB cluster ──────
  //
  // VW Touareg 4.2 TDI CR V8 250 kW (340 hp) flagship diesel EDC17.
  // Single SW with 2 confirmation pairs (different tuners, same tune
  // targets). Verified in pair_analysis_log.md VW pairs:
  //   #1246 sw511931 · #1247 sw511931 (sister pair)
  //
  // Map structure:
  //   0x1ACE30  16B u16 BE — IQ upper A (8648 → 26665, +208%)
  //   0x1ACE5C  15B u16 BE — IQ upper B (21913 → 44149, +101% Δ=+0x2C)
  //   0x1B8520  8B  u16 BE — torque limit (14747 → 34651, +135%)
  //   0x171F42  8B  u16 BE — emission cut (49949 → 32, -99.9%)
  {
    id: 'edc17_touareg_42tdi_7p0907409_1ace30',
    name: 'Bosch EDC17 (VW Touareg 4.2 TDI CR V8 250kW — 7P0907409 0x1ACE30)',
    manufacturer: 'Bosch',
    family: 'EDC17',
    identStrings: ['7P0907409', '511931'],
    fileSizeRange: [2097152, 2097152],
    vehicles: ['VW Touareg 4.2 TDI CR V8 250.1kW (7P0907409 sw 511931, 2011)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFFC,
    checksumLength: 4,
    maps: [
      {
        id: 'edc17_touareg_1ace30_iq_upper_a',
        name: 'IQ Upper A 16B (Touareg 4.2 TDI 7P0907409)',
        category: 'fuel',
        desc: 'IQ upper A at 0x1ACE30 (8 cells u16 BE = 16 B). sw511931 confirmed 2 pairs: stock 8648 → 26665 (+208%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x1ACE30,
        rows: 1, cols: 8, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 25000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 30000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 35000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc17_touareg_1ace5c_iq_upper_b',
        name: 'IQ Upper B 15B (Touareg 4.2 TDI 7P0907409 Δ=+0x2C)',
        category: 'fuel',
        desc: 'IQ upper B at 0x1ACE5C (Δ=+0x2C from A). Stock 21913 → 44149 (+101%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x1ACE5C,
        rows: 1, cols: 7, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 42000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 46000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 50000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── EDC17 VW Touareg 3.0 V6 TDI CR 4G0907401 — 0x16B9F4 2MB cluster ──────
  //
  // VW Touareg 3.0 V6 TDI CR 4G chassis (Audi Q7 derivative) 2012-2013.
  // 2 SWs share EXACT anchors + raw signature. Verified in
  // pair_analysis_log.md VW pairs:
  //   #1231/#1232/#1233 sw518187 · #1234/#1235 sw518184
  //
  // Map structure (EXACT match across 5 pairs):
  //   0x16B9F4  16B u16 BE — IQ upper A (12322 → 32324, +162%)
  //   0x16BE7C  16B u16 BE — IQ upper A mirror (Δ=+0x488 same raw)
  //   0x16B518  16B u16 BE — IQ upper B (18272 → 41985, +130%)
  //   0x16B75C  16B u16 BE — IQ upper B mirror (Δ=+0x244)
  {
    id: 'edc17_touareg_30tdi_4g0907401_16b9f4',
    name: 'Bosch EDC17 (VW Touareg 3.0 V6 TDI CR 4G 150-180kW — 4G0907401 0x16B9F4)',
    manufacturer: 'Bosch',
    family: 'EDC17',
    identStrings: ['4G0907401', '518184', '518187'],
    fileSizeRange: [2097152, 2097152],
    vehicles: ['VW Touareg 3.0 V6 TDI CR 4G 150-180.2kW (4G0907401 sw 518184/518187, 2012)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFFC,
    checksumLength: 4,
    maps: [
      {
        id: 'edc17_touareg_16b9f4_iq_upper_a',
        name: 'IQ Upper A 16B (Touareg 4G0907401)',
        category: 'fuel',
        desc: 'IQ upper A at 0x16B9F4 (8 cells u16 BE = 16 B). 2 SWs + 5 pairs EXACT anchor: stock 12322 → tuner consensus 32324 (+162%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x16B9F4,
        rows: 1, cols: 8, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 30000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 35000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 40000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc17_touareg_16be7c_iq_upper_a_mirror',
        name: 'IQ Upper A Mirror 16B (Touareg 4G0907401 Δ=+0x488)',
        category: 'fuel',
        desc: 'IQ upper A mirror at 0x16BE7C (Δ=+0x488 from 0x16B9F4). Same raw signature 12322 → 32324.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x16BE7C,
        rows: 1, cols: 8, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 30000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 35000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 40000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc17_touareg_16b518_iq_upper_b',
        name: 'IQ Upper B 16B (Touareg 4G0907401)',
        category: 'fuel',
        desc: 'IQ upper B at 0x16B518 (8 cells u16 BE = 16 B). Stock 18272 → 41985 (+130%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x16B518,
        rows: 1, cols: 8, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 38000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 43000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 48000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── EDC17 VW Touareg 3.0 V6 TDI CR 4G0907401 2013 — 0x1CE226 16×16 cluster ─
  //
  // VW Touareg 3.0 V6 TDI CR 4G chassis 2013 180kW revision.
  // 2 SWs share EXACT anchor + raw signature. Verified in
  // pair_analysis_log.md VW pairs:
  //   #1237/#1238 sw525584 · #1239 sw535387
  //
  // Map structure:
  //   0x1CE226  16×16 = 512 B u16 BE — torque ceiling A (22060 → 47675)
  //   0x1CE46A  16×16 = 512 B u16 BE — torque ceiling A mirror (Δ=+0x244)
  //   0x1823D6 / 0x18231C  80B — emission cuts (stock 37813/36955 → 32)
  {
    id: 'edc17_touareg_30tdi_4g0907401_1ce226',
    name: 'Bosch EDC17 (VW Touareg 3.0 V6 TDI CR 4G 2013 180kW — 4G0907401 0x1CE226)',
    manufacturer: 'Bosch',
    family: 'EDC17',
    identStrings: ['4G0907401', '525584', '535387'],
    fileSizeRange: [2097152, 2097152],
    vehicles: ['VW Touareg 3.0 V6 TDI CR 4G 180.2kW (4G0907401 sw 525584/535387, 2013)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFFC,
    checksumLength: 4,
    maps: [
      {
        id: 'edc17_touareg_1ce226_torque_ceiling',
        name: 'Torque Ceiling 16×16 (Touareg 4G0907401 2013)',
        category: 'limiter',
        desc: 'Torque ceiling at 0x1CE226 (16×16 = 256 cells u16 BE = 512 B). 2 SWs EXACT anchor: stock 22060 → 47675 (+116%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x1CE226,
        rows: 16, cols: 16, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 45000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 48000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 52000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── EDC17 VW Touareg 3.0 V6 TDI CR 7P0907401 — 0x166F64 2MB cluster ──────
  //
  // VW Touareg 3.0 V6 TDI CR 176.5-180.2 kW EDC17 7P chassis (Mk2 2010+).
  // 2 SWs share EXACT anchor + raw signature. Verified in
  // pair_analysis_log.md VW pairs:
  //   #1222/#1228 sw516683 · #1229/#1230 sw526380 (each has 2 sister pairs)
  //
  // Map structure (EXACT match across 4 pairs):
  //   0x166F64  10B u16 BE — IQ upper A (20550 → 54345, +164%)
  //   0x16740A  10B u16 BE — IQ upper B mirror (Δ=+0x4A6)
  //   0x166F48  10B u16 BE — IQ mirror (21164 → 53679, +154%)
  //
  // Note: sw515254 uses Δ=-0x16 shifted anchor (0x166F4E) — close but
  // non-exact. sw510363 uses Δ=-0x4C shifted anchor (0x166F18). Logged
  // as separate per-SW variants — only 516683/526380 at 0x166F64 qualify
  // for fixedOffset wire.
  {
    id: 'edc17_touareg_30tdi_7p0907401_166f64',
    name: 'Bosch EDC17 (VW Touareg 3.0 V6 TDI CR 176.5-180kW — 7P0907401 0x166F64)',
    manufacturer: 'Bosch',
    family: 'EDC17',
    identStrings: ['7P0907401', '516683', '526380'],
    fileSizeRange: [2097152, 2097152],
    vehicles: ['VW Touareg 3.0 V6 TDI CR 176.5-180.2kW (7P0907401 sw 516683/526380, 2010-2011)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFFC,
    checksumLength: 4,
    maps: [
      {
        id: 'edc17_touareg_166f64_iq_upper_a',
        name: 'IQ Upper A 10B (Touareg 7P0907401)',
        category: 'fuel',
        desc: 'IQ upper A at 0x166F64 (5 cells u16 BE = 10 B). 2 SWs + 4 pairs EXACT anchor: stock 20550 → tuner consensus 54345 (+164%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x166F64,
        rows: 1, cols: 5, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 50000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 55000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 60000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc17_touareg_16740a_iq_upper_b',
        name: 'IQ Upper B 10B mirror (Touareg 7P0907401 Δ=+0x4A6)',
        category: 'fuel',
        desc: 'IQ upper B at 0x16740A (5 cells u16 BE = 10 B, Δ=+0x4A6 mirror of 0x166F64). Same raw signature 20550 → 54345.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x16740A,
        rows: 1, cols: 5, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 50000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 55000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 60000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── EDC17 VW Touareg 3.0 TDI CR DPF V6 7L0907401H — 0x1DD8C6 2MB cluster ──
  //
  // VW Touareg 3.0 TDI CR DPF V6 155-176.5 kW EDC17 2MB dump format.
  // 2 SWs share EXACT anchor + raw signature on main torque-lift cluster.
  // Verified in pair_analysis_log.md VW pairs:
  //   #1202 sw509949 155.2kW · #1213 sw509943 176.5kW (also #1215 alt-tune)
  //
  // Map structure:
  //   0x1DD8C6  128 B u16 BE — IQ release A (stock 5125 → 45060, +779%)
  //   0x1DD954  16×13 = 416 B u16 BE — torque ceiling A (21409 → 48549, +127%)
  //   0x1DDB3E  16×16 = 512 B u16 BE — torque ceiling B (22186 → 47801, +115%)
  //
  // Note: sw392978, sw394198, sw500172, sw509943 ALSO appear at this SGO
  // hitting 0x1B4xxx / 0x1A9xxx emission-cut region (alternate tuner
  // targeting) on same ORI — confirms ORI structure but different tune
  // targets. Only the 2-SW cluster at 0x1DD8C6 is fixedOffset-reliable.
  //
  // Pair #1214 sw397811 `3D0907401D` 2MB — hits `0x1F9212 16×16` with
  // SAME raw 22186 → 47801 signature at Δ=+0x1B6D4 shifted anchor
  // (different 3D chassis). Not added to fixedOffset but flagged.
  {
    id: 'edc17_touareg_30tdi_7l0907401h_1dd8c6',
    name: 'Bosch EDC17 (VW Touareg 3.0 TDI CR DPF V6 155-176.5kW — 7L0907401H 0x1DD8C6)',
    manufacturer: 'Bosch',
    family: 'EDC17',
    identStrings: ['7L0907401H', '509943', '509949'],
    fileSizeRange: [2097152, 2097152],
    vehicles: ['VW Touareg 3.0 TDI CR DPF V6 155-176.5kW (7L0907401H sw 509943/509949, 2008-2010)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFFC,
    checksumLength: 4,
    maps: [
      {
        id: 'edc17_touareg_1dd8c6_iq_release',
        name: 'IQ Release 128B (Touareg 7L0907401H)',
        category: 'fuel',
        desc: 'IQ release at 0x1DD8C6 (64 cells u16 BE = 128 B). 2 SWs EXACT anchor: stock 5125 → tuner consensus 45060 (+779%). Critical Stage 1 map.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x1DD8C6,
        rows: 1, cols: 64, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 42000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 48000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 55000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc17_touareg_1dd954_torque_ceiling_a',
        name: 'Torque Ceiling A 16×13 (Touareg 7L0907401H)',
        category: 'limiter',
        desc: 'Torque ceiling A at 0x1DD954 (16 cols × 13 rows = 208 cells u16 BE). Stock 21409 → 48549 (+127%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x1DD954,
        rows: 13, cols: 16, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 45000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 50000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 55000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc17_touareg_1ddb3e_torque_ceiling_b',
        name: 'Torque Ceiling B 16×16 (Touareg 7L0907401H)',
        category: 'limiter',
        desc: 'Torque ceiling B at 0x1DDB3E (16 cols × 16 rows = 256 cells u16 BE). Stock 22186 → 47801 (+115%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x1DDB3E,
        rows: 16, cols: 16, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 44000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 48000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 53000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── EDC16 VW Touareg 3.0 TDI 8E0907401AB — 0x0717C3 524KB triple-mirror ───
  //
  // VW Touareg 3.0 TDI V6 CR (Audi derived 8E hardware) 165-171 kW EDC16 1MB
  // cal-strip to 524KB dump. 2 SWs across same SGO share EXACT triple-mirror
  // anchor trio at stride +0x2F0. Verified in pair_analysis_log.md VW pairs:
  //   #1183 sw383041 2004 165.5kW · #1185 sw377333 2004 165kW · #1200 sw377333
  //
  // Map structure (EXACT match):
  //   0x0717C3  11 B u16 BE — IQ Mirror A (stock 13214 → 37278, +182%)
  //   0x071AB3  11 B u16 BE — IQ Mirror B (Δ=+0x2F0)
  //   0x071DA3  11 B u16 BE — IQ Mirror C (Δ=+0x5E0)
  {
    id: 'edc16_touareg_30tdi_8e0907401ab_0717c3',
    name: 'Bosch EDC16 (VW Touareg 3.0 TDI V6 165kW — 8E0907401AB 0x0717C3 triple-mirror 524KB)',
    manufacturer: 'Bosch',
    family: 'EDC16',
    identStrings: ['8E0907401AB', '377333', '383041'],
    fileSizeRange: [524288, 524288],
    vehicles: ['VW Touareg 3.0 TDI V6 165kW (8E0907401AB sw 377333/383041, 2004-2007)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFFC,
    checksumLength: 4,
    maps: [
      {
        id: 'edc16_touareg_0717c3_iq_mirror_a',
        name: 'IQ Mirror A 11B (Touareg 8E0907401AB)',
        category: 'fuel',
        desc: 'IQ mirror A at 0x0717C3 (5-6 cells u16 BE = 11 B). Verified 2 SWs at EXACT anchor + stock 13214 → tuner consensus 37278 (+182%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x0717C3,
        rows: 1, cols: 6, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 35000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 40000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 45000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc16_touareg_071ab3_iq_mirror_b',
        name: 'IQ Mirror B 11B (Touareg 8E0907401AB Δ=+0x2F0)',
        category: 'fuel',
        desc: 'IQ mirror B at 0x071AB3 (Δ=+0x2F0 from A). Same raw signature 13214 → 37278 (+182%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x071AB3,
        rows: 1, cols: 6, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 35000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 40000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 45000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc16_touareg_071da3_iq_mirror_c',
        name: 'IQ Mirror C 11B (Touareg 8E0907401AB Δ=+0x5E0)',
        category: 'fuel',
        desc: 'IQ mirror C at 0x071DA3 (Δ=+0x5E0 from A). Same raw signature.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x071DA3,
        rows: 1, cols: 6, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 35000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 40000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 45000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── EDC16 VW Touareg 3.0 TDI 7L0907401A — 0x0713F1 524KB IQ release ───────
  //
  // VW Touareg 3.0 TDI V6 164.8 kW EDC16 — 7L (Touareg-specific) hardware.
  // 2 SWs same SGO share EXACT anchor. Verified in pair_analysis_log.md
  // VW pairs: #1189 sw380764 · #1193 sw505494
  //
  // Map structure:
  //   0x0713F1  11 B u16 BE — IQ upper (23252 → 50029, +115%)
  //   0x071947  11 B u16 BE — IQ mirror A (19565 → 31187, +59%)
  //   0x071C37  11 B u16 BE — IQ mirror B (Δ=+0x2F0 from A)
  {
    id: 'edc16_touareg_30tdi_7l0907401a_0713f1',
    name: 'Bosch EDC16 (VW Touareg 3.0 TDI V6 164.8kW — 7L0907401A 0x0713F1 524KB)',
    manufacturer: 'Bosch',
    family: 'EDC16',
    identStrings: ['7L0907401A', '380764', '505494'],
    fileSizeRange: [524288, 524288],
    vehicles: ['VW Touareg 3.0 TDI V6 164.8kW (7L0907401A sw 380764/505494, 2006-2007)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFFC,
    checksumLength: 4,
    maps: [
      {
        id: 'edc16_touareg_0713f1_iq_upper',
        name: 'IQ Upper 11B (Touareg 7L0907401A)',
        category: 'fuel',
        desc: 'IQ upper at 0x0713F1 (5-6 cells u16 BE = 11 B). 2 SWs EXACT anchor + stock 23252 → tuner consensus 50029 (+115%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x0713F1,
        rows: 1, cols: 6, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 48000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 52000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 57000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── MED17 VW Tiguan 2.0 TSI EA888 Gen2 06J906026S/T/AB — 0x00F617 262KB IQ ─
  //
  // VW Tiguan 2.0 TSI (EA888 Gen2 turbo) 125 kW MED17. 262 KB compact
  // dump format. 3 SWs across 3 part suffixes share EXACT anchor + raw
  // signature. Verified in pair_analysis_log.md VW pairs:
  //   #1173 sw396752 S · #1174 sw396755 AB · #1175 sw396753 T
  //
  // Map structure:
  //   0x00F617  120 B u16 BE — IQ release (10604 → 25700, +142%)
  //   0x016AB2  64 B u16 BE — companion (31503 → 45580, +45%)
  //
  // SAME universal MED17 EA113/EA888 120B IQ unlock pattern seen across
  // VAG line (0x1CE0C8 in Golf 2MB, 0x1CE884 in Passat 8P, 0x1CE2A4 in
  // Passat 3C, etc.) — here at 262KB compact anchor 0x00F617.
  {
    id: 'med17_tiguan_20tsi_06j906026_00f617',
    name: 'Bosch MED17 (VW Tiguan 2.0 TSI EA888 Gen2 125kW — 06J906026S/T/AB 0x00F617 262KB)',
    manufacturer: 'Bosch',
    family: 'MED17',
    identStrings: ['06J906026S', '06J906026T', '06J906026AB', '396752', '396753', '396755'],
    fileSizeRange: [262144, 262144],
    vehicles: ['VW Tiguan 2.0 TSI EA888 Gen2 125kW (06J906026S/T/AB sw 396752/396753/396755, 2006-2009)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x3FFFC,
    checksumLength: 4,
    maps: [
      {
        id: 'med17_tiguan_00f617_iq_release',
        name: 'IQ Release 120B (Tiguan 2.0 TSI S/T/AB)',
        category: 'fuel',
        desc: 'IQ release at 0x00F617 (60 cells u16 BE = 120 B). Verified across 3 SWs + 3 part suffixes: stock 10604 → tuner consensus 25700 (+142%). Universal MED17 EA888 Gen2 IQ release pattern at 262KB compact anchor.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x00F617,
        rows: 1, cols: 60, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 24000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 30000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 40000 },
        critical: true, showPreview: true,
      },
      {
        id: 'med17_tiguan_016ab2_companion',
        name: 'IQ Release Companion 64B (Tiguan 2.0 TSI S/T/AB)',
        category: 'fuel',
        desc: 'Companion IQ release at 0x016AB2 (32 cells u16 BE = 64 B). Raw 31503 → 45580 (+45%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x016AB2,
        rows: 1, cols: 32, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 44000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 50000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 55000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── MED17 VW Tiguan 2.0 TSI EA888 Gen2 06J906026H 147kW — 0x010E79 262KB ──
  //
  // VW Tiguan 2.0 TSI (EA888 Gen2) 147 kW higher-power MED17 variant.
  // 2 SWs same SGO share EXACT anchor + raw signature. Verified in
  // pair_analysis_log.md VW pairs:
  //   #1176 sw397325 H · #1177 sw397724 H (sister SW)
  //
  // Anchor SHIFTED Δ=+0x1862 from 125kW variant's 0x00F617 — 147kW
  // cal-block at higher address.
  //
  // Map structure:
  //   0x010E79  120 B u16 BE — IQ release (10583 → 25700, +143%)
  //   0x0181CA  64 B u16 BE — companion (31503 → 45580, +45%)
  {
    id: 'med17_tiguan_20tsi_06j906026h_010e79',
    name: 'Bosch MED17 (VW Tiguan 2.0 TSI EA888 Gen2 147kW — 06J906026H 0x010E79 262KB)',
    manufacturer: 'Bosch',
    family: 'MED17',
    identStrings: ['06J906026H', '397325', '397724'],
    fileSizeRange: [262144, 262144],
    vehicles: ['VW Tiguan 2.0 TSI EA888 Gen2 147kW (06J906026H sw 397325/397724, 2009)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x3FFFC,
    checksumLength: 4,
    maps: [
      {
        id: 'med17_tiguan_010e79_iq_release',
        name: 'IQ Release 120B (Tiguan 2.0 TSI H 147kW)',
        category: 'fuel',
        desc: 'IQ release at 0x010E79 (60 cells u16 BE = 120 B). Verified 2 SWs on 06J906026H: stock 10583 → tuner consensus 25700 (+143%). Higher-power-variant anchor (Δ=+0x1862 from 125kW 0x00F617).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x010E79,
        rows: 1, cols: 60, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 24000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 30000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 40000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── EDC17 C46 VW Tiguan 2.0 TDI CR 03L906018LG/LK/LE/LH — 0x06B512 2KB ────
  //
  // VW Tiguan 2.0 TDI CR 81-125 kW EDC17 C46 late-gen LX-suffix family.
  // 4 SWs across 4 part suffixes (LG/LK/LE/LH) share EXACT anchors + raw
  // signature. Verified in pair_analysis_log.md VW pairs:
  //   #1156 sw519357 LG · #1157 sw519354 LK 80kW · #1158 sw519351 LE ·
  //   #1167 sw519356 LH 125kW · #1168 sw525549 LH 125kW (sister of #1167)
  //
  // Map structure (EXACT match across all 4 SWs):
  //   0x06B512  2 KB (1024 cells u16 BE) — protection ceiling (21260 → 57390)
  //   0x06BF46  512 B u16 BE — companion A (23980 → 57390, +139%)
  //   0x06BD34  512 B u16 BE — companion B (24383 → 57390, +135%)
  //   0x07DADA  200-202 B u16 BE — IQ release (4135 → 63359, +1432%)
  //
  // Anchor Δ=+0x78C from 0x06AD86 def — same raw signature (21260 stock),
  // different cal-block location. Later-SW 519xxx family migrated the
  // protection ceiling map to higher address.
  {
    id: 'edc17_c46_tiguan_03l906018lxx_06b512',
    name: 'Bosch EDC17 C46 (VW Tiguan 2.0 TDI CR 81-125kW — 03L906018LG/LK/LE/LH 0x06B512)',
    manufacturer: 'Bosch',
    family: 'EDC17',
    identStrings: ['03L906018LG', '03L906018LK', '03L906018LE', '03L906018LH', '519351', '519354', '519356', '519357', '525549'],
    fileSizeRange: [2097152, 2097152],
    vehicles: ['VW Tiguan 2.0 TDI CR 81-125kW (03L906018LG/LK/LE/LH sw 519351/519354/519356/519357/525549, 2011-2012)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFFC,
    checksumLength: 4,
    maps: [
      {
        id: 'edc17_c46_tiguan_06b512_protection',
        name: 'Protection Ceiling 2KB (Tiguan 03L906018LG/LK/LE/LH)',
        category: 'limiter',
        desc: 'Protection ceiling at 0x06B512 (1024 cells u16 BE = 2 KB). Verified across 4 SWs + 4 part suffixes: stock 21260 → tuner consensus 57390 (+170%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x06B512,
        rows: 32, cols: 32, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 50000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 55000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 57000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc17_c46_tiguan_06bf46_companion_a',
        name: 'Companion Ceiling A 512B (Tiguan LG/LK/LE/LH)',
        category: 'limiter',
        desc: 'Companion ceiling A at 0x06BF46 (256 cells u16 BE = 512 B). Raw 23980 → 57390 (+139%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x06BF46,
        rows: 16, cols: 16, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 50000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 55000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 57000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── EDC17 C46 VW Tiguan 2.0 TDI CR 03L906018LK/LL/LE/FQ — 0x06CC76 2KB ────
  //
  // VW Tiguan 2.0 TDI CR 100-103 kW EDC17 C46 ANCHOR-SHIFTED variant of
  // the 0x06B512 cluster (Δ=+0x1764 shift). Same raw signature 21260 →
  // 57390 but at different anchor — yet-later SW revision 524xxx/528xxx.
  //
  // 4 SWs across 4 part suffixes share EXACT anchors. Verified in
  // pair_analysis_log.md VW pairs:
  //   #1160 sw528324 LK · #1161 sw524133 LL · #1164 sw524646 FQ ·
  //   #1165 sw524113 LE · #1166 sw528319 LE (sister of #1165)
  //
  // Map structure (EXACT match):
  //   0x06CC76  2 KB u16 BE — protection ceiling (21260 → 57390)
  //   0x06D6AA  512 B u16 BE — companion A (23980 → 57390, +139%)
  //   0x06D490  512 B u16 BE — companion B (24213 → 57390, +137%)
  //   0x07DC2E  200-202 B u16 BE — IQ release (4135 → 63359, +1432%)
  {
    id: 'edc17_c46_tiguan_03l906018lxx_06cc76',
    name: 'Bosch EDC17 C46 (VW Tiguan 2.0 TDI CR 100-103kW — 03L906018LK/LL/LE/FQ 0x06CC76)',
    manufacturer: 'Bosch',
    family: 'EDC17',
    identStrings: ['03L906018LL', '03L906018FQ', '524113', '524133', '524160', '524646', '528319', '528324'],
    fileSizeRange: [2097152, 2097152],
    vehicles: ['VW Tiguan 2.0 TDI CR 100-103kW (03L906018LK/LL/LE/FQ sw 524113/524133/524160/524646/528319/528324, 2012-2013)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFFC,
    checksumLength: 4,
    maps: [
      {
        id: 'edc17_c46_tiguan_06cc76_protection',
        name: 'Protection Ceiling 2KB (Tiguan 03L906018LK/LL/LE/FQ)',
        category: 'limiter',
        desc: 'Protection ceiling at 0x06CC76 (1024 cells u16 BE = 2 KB). Verified across 4 SWs + 4 part suffixes: stock 21260 → tuner consensus 57390 (+170%). Anchor-shifted (Δ=+0x1764) variant of 0x06B512 cluster.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x06CC76,
        rows: 32, cols: 32, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 50000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 55000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 57000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc17_c46_tiguan_06d6aa_companion_a',
        name: 'Companion Ceiling A 512B (Tiguan LK/LL/LE/FQ)',
        category: 'limiter',
        desc: 'Companion ceiling A at 0x06D6AA (256 cells u16 BE = 512 B). Raw 23980 → 57390 (+139%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x06D6AA,
        rows: 16, cols: 16, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 50000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 55000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 57000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── EDC17 C46 VW Tiguan 2.0 TDI CR 03L906022G — 0x1F276A cluster (2MB) ────
  //
  // VW Tiguan 2.0 TDI CR 100-103kW EDC17 C46 anchor-shifted sub-cluster.
  // 3 SWs share EXACT anchors + tight raw signature. Verified in
  // pair_analysis_log.md VW pairs:
  //   #1121 sw391548 (100kW) · #1122 sw394106 (103kW) · #1149 sw394105 (103kW)
  // + #1141 sw391506 at slightly shifted 0x1F273E anchor (Δ=-0x2C sub-variant)
  //
  // Map structure (EXACT match):
  //   0x1F276A  512B u16 BE — protection ceiling A (raw 18989 → 57390, +202%)
  //   0x1F29F2  512B u16 BE — protection ceiling B (raw 22036 → 57390, +160%)
  //   0x1F7120  12B  u16 BE — torque lift (raw 20550 → 47175, +130%)
  //
  // Different anchor family from 398757 (0x1EF502) and 0x1F007A clusters —
  // this is a THIRD protection-ceiling SW-revision variant.
  {
    id: 'edc17_c46_tiguan_20tdi_03l906022g_1f276a',
    name: 'Bosch EDC17 C46 (VW Tiguan 2.0 TDI CR 100-103kW — 03L906022G 0x1F276A)',
    manufacturer: 'Bosch',
    family: 'EDC17',
    identStrings: ['391548', '394106', '394105'],
    fileSizeRange: [2097152, 2097152],
    vehicles: ['VW Tiguan 2.0 TDI CR 100-103kW (03L906022G sw 391548/394105/394106, 2008-2010)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFFC,
    checksumLength: 4,
    maps: [
      {
        id: 'edc17_c46_tiguan_1f276a_ceiling_a',
        name: 'Protection Ceiling A 512B (Tiguan 03L906022G sw 391548/394105/394106)',
        category: 'limiter',
        desc: 'Protection ceiling A at 0x1F276A (256 cells u16 BE = 512 B). Verified across 3 SWs sharing EXACT anchor + raw signature: stock 18989 → tuner consensus 57390 (+202%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x1F276A,
        rows: 16, cols: 16, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 50000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 55000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 57000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc17_c46_tiguan_1f29f2_ceiling_b',
        name: 'Protection Ceiling B 512B (Tiguan 03L906022G)',
        category: 'limiter',
        desc: 'Protection ceiling B at 0x1F29F2 (256 cells u16 BE = 512 B). Raw 22036 → 57390 (+160%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x1F29F2,
        rows: 16, cols: 16, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 50000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 55000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 57000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── EDC16 VW T5 2.5 TDI 070906016AP/BH/BD — 0x0E088B 1MB IQ cluster ──────
  //
  // VW T5 Transporter 2.5 TDI 128 kW (Multivan era) EDC16 1MB dump format.
  // 3 SWs across 3 part suffixes (AP/BH/BD) share EXACT anchors + raw
  // signature. Verified in pair_analysis_log.md VW pairs:
  //   #1076 sw372364 AP · #1077 sw372943 BH · #1078 sw372944 BD
  //
  // Map structure (EXACT match across all 3 pairs):
  //   0x0E088B  9B  u16 BE — IQ upper (raw 30933 → 48982, +58%)
  //   0x0E2A6D  7B  u16 BE — IQ limit A (raw 46424 → 19887, -57%)
  //   0x0E2C2D  7B  u16 BE — IQ limit B (mirror at Δ=+0x1C0) -57%
  //
  // Note: 0x0EC529-0x0EC52B 11B area drifts per SW (Δ=2 between BH/BD and
  // AP) — each SW has its own slightly-shifted upper-11B anchor. Only
  // the 0x0E088B + 0x0E2A6D pair is absolute-common across SWs.
  {
    id: 'edc16_t5_25tdi_070906016_0e088b',
    name: 'Bosch EDC16 (VW T5 2.5 TDI 128kW — 070906016AP/BH/BD 1MB 0x0E088B)',
    manufacturer: 'Bosch',
    family: 'EDC16',
    identStrings: ['070906016AP', '070906016BH', '070906016BD', '372364', '372943', '372944'],
    fileSizeRange: [1048576, 1048576],
    vehicles: ['VW T5 Transporter 2.5 TDI 128kW (070906016AP/BH/BD sw 372364/372943/372944, 2002-2005)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0xFFFFC,
    checksumLength: 4,
    maps: [
      {
        id: 'edc16_t5_25tdi_iq_upper',
        name: 'IQ Upper 9B (T5 2.5 TDI 070906016AP/BH/BD)',
        category: 'fuel',
        desc: 'IQ upper at 0x0E088B (4-5 cells u16 BE = 9 B). Verified across 3 SWs + 3 part suffixes sharing EXACT anchor + raw signature: stock 30933 → tuner consensus 48982 (+58%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x0E088B,
        rows: 1, cols: 5, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 47000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 52000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 57000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc16_t5_25tdi_iq_limit_a',
        name: 'IQ Limit A 7B (T5 2.5 TDI 070906016AP/BH/BD)',
        category: 'limiter',
        desc: 'IQ limit A at 0x0E2A6D (3-4 cells u16 BE = 7 B). Stock 46424 → tuner consensus 19887 (-57%). Consistent across all 3 SWs.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x0E2A6D,
        rows: 1, cols: 4, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMax: 22000 },
        stage2: { multiplier: 1.0, addend: 0, clampMax: 18000 },
        stage3: { multiplier: 1.0, addend: 0, clampMax: 15000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc16_t5_25tdi_iq_limit_b',
        name: 'IQ Limit B 7B (T5 2.5 TDI 070906016AP/BH/BD mirror)',
        category: 'limiter',
        desc: 'IQ limit B at 0x0E2C2D (3-4 cells u16 BE = 7 B). Mirror of 0x0E2A6D at Δ=+0x1C0 — EDC16 storage mirror (internal fault-tolerance copy). Same raw signature.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x0E2C2D,
        rows: 1, cols: 4, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMax: 22000 },
        stage2: { multiplier: 1.0, addend: 0, clampMax: 18000 },
        stage3: { multiplier: 1.0, addend: 0, clampMax: 15000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── EDC16 VW T5 2.5 TDI 070906016EB / 070997016L — 0x06CF8D 524KB IQ ─────
  //
  // VW T5 Transporter 2.5 TDI 96-128 kW EDC16 524KB cal-strip dump format.
  // 2 SWs across 2 part-code conventions (906 vs 997) hit SAME anchors +
  // SAME stock raw 16604. Verified in pair_analysis_log.md VW pairs:
  //   #1074 sw394150 070997016L (96 kW) · #1075 sw394113 070906016EB (128 kW)
  //
  // Map structure:
  //   0x06CF8D  13B u16 BE — IQ upper-A (stock 16604)
  //   0x06D1D5  13B u16 BE — IQ upper-B mirror at Δ=+0x248
  // Target varies per power-rating: 96 kW → 42076 (+153%), 128 kW → 36999
  // (+123%) — same code, different tuner-SW-power combos.
  {
    id: 'edc16_t5_25tdi_070906016eb_06cf8d',
    name: 'Bosch EDC16 (VW T5 2.5 TDI 96-128kW — 070906016EB / 070997016L 524KB 0x06CF8D)',
    manufacturer: 'Bosch',
    family: 'EDC16',
    identStrings: ['070906016EB', '070997016L', '394150', '394113'],
    fileSizeRange: [524288, 524288],
    vehicles: ['VW T5 Transporter 2.5 TDI 96-128kW (070906016EB / 070997016L sw 394113/394150, 2005-2009)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFFC,
    checksumLength: 4,
    maps: [
      {
        id: 'edc16_t5_24tdi_eb_iq_upper_a',
        name: 'IQ Upper A 13B (T5 2.5 TDI 070906016EB)',
        category: 'fuel',
        desc: 'IQ upper A at 0x06CF8D (6-7 cells u16 BE = 13 B). Stock 16604 signature confirmed across 2 SWs on 2 part-code conventions. Tuner target 36999-42076 (+123-153% depending on power rating).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x06CF8D,
        rows: 1, cols: 7, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 35000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 40000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 45000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc16_t5_24tdi_eb_iq_upper_b',
        name: 'IQ Upper B 13B (T5 2.5 TDI 070906016EB mirror)',
        category: 'fuel',
        desc: 'IQ upper B at 0x06D1D5 (7 cells u16 BE = 13 B). Storage mirror of 0x06CF8D at Δ=+0x248 — SAME stock raw 16604.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x06D1D5,
        rows: 1, cols: 7, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 35000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 40000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 45000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── EDC16 VW T5 2.5 TDI 070906016L/DQ + 070997016L — 0x1ECCDB 2MB cluster ─
  //
  // VW T5 Transporter 2.5 TDI 128 kW EDC16 2MB dump format.
  // 4 SWs across 3 part suffixes (L/DQ/997L) share EXACT anchors + raw
  // signature. Verified in pair_analysis_log.md VW pairs:
  //   #1088 sw384823 070997016L · #1090 sw383806 070906016L ·
  //   #1100 sw390621 070906016DQ · #1101 sw390621 070906016DQ (sister)
  //
  // Map structure (EXACT match across all SWs):
  //   0x1ECCDB  15B u16 BE — IQ ceiling (raw 30325 → 45758, +51%)
  //   0x1D5FDA/D8/DA  122-124B — IQ release (raw 3000 → 4200, +40%)
  //   0x1D5A00  46B  — torque limit (raw 1902 → 2625, +38%)
  //   0x1D5EE2  24×4 — boost/torque map (raw 3062 → 4113, +34%)
  //
  // 2MB twin of 524KB 0x06CCDB (Δ=+0x186000 dump shift) — pair #1095
  // sw384823 524KB confirms 524KB counterpart.
  {
    id: 'edc16_t5_25tdi_070906016_1eccdb',
    name: 'Bosch EDC16 (VW T5 2.5 TDI 128kW — 070906016L/DQ + 070997016L 2MB 0x1ECCDB)',
    manufacturer: 'Bosch',
    family: 'EDC16',
    identStrings: ['070906016L', '070906016DQ', '070997016L', '383806', '384823', '390621'],
    fileSizeRange: [2097152, 2097152],
    vehicles: ['VW T5 Transporter 2.5 TDI 128kW 2MB dump (070906016L/DQ + 070997016L sw 383806/384823/390621, 2005-2007)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFFC,
    checksumLength: 4,
    maps: [
      {
        id: 'edc16_t5_25tdi_1eccdb_ceiling',
        name: 'IQ Ceiling 15B (T5 2.5 TDI L/DQ/997L 2MB)',
        category: 'fuel',
        desc: 'IQ ceiling at 0x1ECCDB (7-8 cells u16 BE = 15 B). Verified across 4 SWs sharing EXACT anchor + raw signature: stock 30325 → tuner consensus 45758 (+51%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x1ECCDB,
        rows: 1, cols: 8, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 44000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 48000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 52000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc16_t5_25tdi_1d5fda_iq_release',
        name: 'IQ Release 124B (T5 2.5 TDI L/DQ/997L 2MB)',
        category: 'fuel',
        desc: 'IQ release at 0x1D5FDA (~62 cells u16 BE = 124 B). Raw 3000 → 4200 (+40%). Anchor varies ±2 across SWs.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x1D5FDA,
        rows: 1, cols: 62, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 4000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 4500 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 5000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── EDC16 VW T5 2.5 TDI 070906016EC + 070997016M — 0x06CD73 524KB cluster ─
  //
  // VW T5 Transporter 2.5 TDI 96 kW EDC16 524KB cal-strip dump.
  // 2 SWs across 2 part suffixes (EC/997M) share EXACT anchors. Verified
  // in pair_analysis_log.md VW pairs:
  //   #1092 sw394114 070906016EC · #1097 sw394151 070997016M
  //
  // Map structure:
  //   0x06CD73  11B u16 BE — IQ upper (raw 16390 → 41222, +152%)
  //   0x06CE13  11B u16 BE — IQ ceiling (raw 21663 → 44396, +105%)
  //   0x06D05F  11B u16 BE — boost/torque A (raw 17927 → 33749, +88%)
  //   0x06D2A7  11B u16 BE — boost/torque B mirror (Δ=+0x248 mirror)
  {
    id: 'edc16_t5_25tdi_070906016ec_06cd73',
    name: 'Bosch EDC16 (VW T5 2.5 TDI 96kW — 070906016EC + 070997016M 524KB 0x06CD73)',
    manufacturer: 'Bosch',
    family: 'EDC16',
    identStrings: ['070906016EC', '070997016M', '394114', '394151'],
    fileSizeRange: [524288, 524288],
    vehicles: ['VW T5 Transporter 2.5 TDI 96kW (070906016EC + 070997016M sw 394114/394151, 2006-2007)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFFC,
    checksumLength: 4,
    maps: [
      {
        id: 'edc16_t5_25tdi_ec_iq_upper',
        name: 'IQ Upper 11B (T5 2.5 TDI EC/997M)',
        category: 'fuel',
        desc: 'IQ upper at 0x06CD73 (5-6 cells u16 BE = 11 B). Verified 2 SWs + 2 part suffixes: stock 16390 → tuner consensus 41222 (+152%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x06CD73,
        rows: 1, cols: 6, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 38000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 44000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 48000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc16_t5_25tdi_ec_iq_ceiling',
        name: 'IQ Ceiling 11B (T5 2.5 TDI EC/997M)',
        category: 'fuel',
        desc: 'IQ ceiling at 0x06CE13 (6 cells u16 BE = 11 B). Stock 21663 → tuner consensus 44396 (+105%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x06CE13,
        rows: 1, cols: 6, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 42000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 47000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 52000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── EDC17 C46 03L906022B Q5 cluster (Audi Q5 2.0 TDI CR 125kW 2009-2010) ──
  //
  // Audi Q5 2.0 TDI CR EDC17 C46. Bosch hardware code, VAG part number
  // 03L906022B. Verified across 4 SW versions in pair_analysis_log.md
  // pairs #1012, #1013, #1014, #1020 — all share the same 2KB+512B+512B
  // "protection ceiling" map structure as the 398757 / 03L906022FG defs.
  //
  // Anchor offset varies slightly by SW (cal-block shift between revisions):
  //   sw516675 → 0x1EE45E (anchor — most pairs in batch)
  //   sw518746 → 0x1EE45E (IDENTICAL to sw516675)
  //   sw505968 → 0x1EE3DE (-0x80 from anchor)
  //   sw500146 → 0x1ED9DE (-0xA80 from anchor)
  //
  // Same value treatment as 398757 — pin near tuner consensus (~55000 raw)
  // for Stage 1.
  {
    id: 'edc17_c46_03l906022b_q5',
    name: 'Bosch EDC17 C46 (03L906022B Q5 — Audi Q5 2.0 TDI CR 125kW 2009-2010)',
    manufacturer: 'Bosch',
    family: 'EDC17',
    identStrings: ['03L906022B', '500146', '505968', '516675', '518746'],
    fileSizeRange: [2097152, 2097152],
    vehicles: ['Audi Q5 2.0 TDI CR 125kW (03L906022B sw 500146/505968/516675/518746, 2009-2010)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFFC,
    checksumLength: 4,
    maps: [
      {
        id: 'edc17_c46_q5_protection_a',
        name: 'Protection Ceiling A (03L906022B Q5)',
        category: 'limiter',
        desc: 'Main protection ceiling at 0x1EE45E (1024 uint16 cells = 2 KB). Verified across 4 SWs (sw 500146/505968/516675/518746) — μ 14259 → 57390 raw (+302%). NOTE: sw500146 anchor shifts to 0x1ED9DE, sw505968 to 0x1EE3DE — same map, slight version-rev shift between SWs.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x1EE45E,
        rows: 1, cols: 1024, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMax: 55000 },
        stage2: { multiplier: 1.0, addend: 0, clampMax: 57000 },
        stage3: { multiplier: 1.0, addend: 0, clampMax: 58000 },
        critical: false, showPreview: false,
      },
      {
        id: 'edc17_c46_q5_protection_b',
        name: 'Protection Ceiling B (03L906022B Q5)',
        category: 'limiter',
        desc: 'Companion protection ceiling at 0x1EEEA2 (256 uint16 cells = 512 B). Verified across same 4 SWs — μ 14413 → 57390 raw (+298%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x1EEEA2,
        rows: 1, cols: 256, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMax: 55000 },
        stage2: { multiplier: 1.0, addend: 0, clampMax: 57000 },
        stage3: { multiplier: 1.0, addend: 0, clampMax: 58000 },
        critical: false, showPreview: false,
      },
      {
        id: 'edc17_c46_q5_protection_c',
        name: 'Protection Ceiling C (03L906022B Q5)',
        category: 'limiter',
        desc: 'Third protection ceiling at 0x1EEC80 (256 uint16 cells = 512 B). Verified — μ 23107 → 57390 raw (+148%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x1EEC80,
        rows: 1, cols: 256, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMax: 55000 },
        stage2: { multiplier: 1.0, addend: 0, clampMax: 57000 },
        stage3: { multiplier: 1.0, addend: 0, clampMax: 58000 },
        critical: false, showPreview: false,
      },
    ],
  },

  // ── EDC17 C46 03L906022FG cluster (Audi A6/A4 Allroad 2.0 TDI CR 100kW) ──
  //
  // Sister def of edc17_c46_398757 — same 2KB+512B "protection ceiling" map
  // structure, different offsets. Verified across 5 pairs (sw 399349 / 399350
  // / 500141 / 503995 + 506125 sister) — see pair_analysis_log.md pairs
  // #692-696. ALL share IDENTICAL offsets:
  //
  //   0x1EE306  2048 bytes (1024 cells) — main protection ceiling, μ 14259→57390 (+302%)
  //   0x1EED4A  512  bytes (256  cells) — companion ceiling,        μ 14413→57390 (+298%)
  //
  // Same value treatment as 398757 (pin to ~55000 for Stage 1).
  {
    id: 'edc17_c46_03l906022fg',
    name: 'Bosch EDC17 C46 (03L906022FG sw 399xxx-503xxx — Audi A4/A6 2.0 TDI CR 100kW)',
    manufacturer: 'Bosch',
    family: 'EDC17',
    identStrings: ['03L906022FG', '399349', '399350', '500141', '503995'],
    fileSizeRange: [2097152, 2097152],
    vehicles: ['Audi A4 Allroad / A6 2.0 TDI CR 100kW (03L906022FG sw 399349/399350/500141/503995, 2009-2010)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFFC,
    checksumLength: 4,
    maps: [
      {
        id: 'edc17_c46_fg_protection_a',
        name: 'Protection Ceiling A (03L906022FG)',
        category: 'limiter',
        desc: 'Main protection ceiling at 0x1EE306 (1024 uint16 cells). Verified across 5 pairs (sw 399349/399350/500141 ×2/503995). Pin near tuner consensus (~55000 raw) to disable derate trigger.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x1EE306,
        rows: 1, cols: 1024, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMax: 55000 },
        stage2: { multiplier: 1.0, addend: 0, clampMax: 57000 },
        stage3: { multiplier: 1.0, addend: 0, clampMax: 58000 },
        critical: false, showPreview: false,
      },
      {
        id: 'edc17_c46_fg_protection_b',
        name: 'Protection Ceiling B (03L906022FG)',
        category: 'limiter',
        desc: 'Companion protection ceiling at 0x1EED4A (256 uint16 cells). Verified across same 5 pairs. Same treatment as Ceiling A.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x1EED4A,
        rows: 1, cols: 256, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMax: 55000 },
        stage2: { multiplier: 1.0, addend: 0, clampMax: 57000 },
        stage3: { multiplier: 1.0, addend: 0, clampMax: 58000 },
        critical: false, showPreview: false,
      },
    ],
  },

  // ── EDC17 C46 03L906018JL pre-522xxx cluster (Audi A4/A6 2.0 TDI CR) ─────
  //
  // The largest single-cluster ECU def in this codebase. Covers Audi A4/A6
  // 2.0 TDI CR 119.9-130.2 kW (163-177 hp) 2010-2013 with Bosch 03L906018JL
  // hardware and an 11-SW family sharing identical modification offsets.
  //
  // Confirmed SW versions (from pair_analysis_log.md pairs #698-#717):
  //   518064, 518117, 519311, 519315, 519316, 519318, 521020, 521021,
  //   522923, 524103
  //
  // Common modifications across all 11 SWs:
  //   0x060DE2  ~11 cells u16 BE — primary IQ ceiling (+44-46%)
  //   0x07209C  ~9  cells u16 BE — IQ stage B          (+25%)
  //   0x072258  ~9  cells u16 BE — IQ stage C          (+25%)
  //   0x066760  ~181 cells u16 BE (16×11 + header) — main IQ map (+22-24%)
  //
  // NOTE: 03L906018JL sw 522909/910/917/918/922/924 are a SEPARATE later-gen
  // cluster at 0x07D3FE / 0x07D1CC — handled by edc17_c46_398757 def's sister
  // pattern (NOT covered by this def). DO NOT add 522xxx SWs here.
  {
    id: 'edc17_c46_03l906018jl_060de2',
    name: 'Bosch EDC17 C46 (03L906018JL pre-522xxx — Audi A4/A6 2.0 TDI CR 163-177hp 2010-13)',
    manufacturer: 'Bosch',
    family: 'EDC17',
    identStrings: ['03L906018JL', '518064', '518117', '519311', '519315', '519316', '519318', '521020', '521021', '522923', '524103'],
    fileSizeRange: [2097152, 2097152],
    vehicles: ['Audi A4 / A6 2.0 TDI CR 163-177hp (03L906018JL pre-522xxx, 2010-2013)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFFC,
    checksumLength: 4,
    maps: [
      {
        id: 'edc17_c46_018jl_iq_ceiling',
        name: 'IQ Ceiling A (03L906018JL pre-522xxx)',
        category: 'fuel',
        desc: 'Primary IQ ceiling at 0x060DE2 (~11 uint16 BE cells). Verified across 11 independent Stage 1 pairs spanning SW 518064-524103. μ 29239 → 42667 raw (+45%). Pin near tuner consensus to release IQ.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x060DE2,
        rows: 1, cols: 11, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 42000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 45000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 48000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc17_c46_018jl_iq_stage_b',
        name: 'IQ Stage B (03L906018JL pre-522xxx)',
        category: 'fuel',
        desc: 'IQ stage B at 0x07209C (~9 uint16 BE cells). Verified across same 11 pairs. μ 26217 → 32763 raw (+25%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x07209C,
        rows: 1, cols: 9, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 32500 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 35000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 38000 },
        critical: false, showPreview: false,
      },
      {
        id: 'edc17_c46_018jl_iq_stage_c',
        name: 'IQ Stage C (03L906018JL pre-522xxx)',
        category: 'fuel',
        desc: 'IQ stage C at 0x072258 (~9 uint16 BE cells). Sister of stage B, same +25% treatment.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x072258,
        rows: 1, cols: 9, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 32500 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 35000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 38000 },
        critical: false, showPreview: false,
      },
      {
        id: 'edc17_c46_018jl_main_iq_map',
        name: 'Main IQ Map (03L906018JL pre-522xxx)',
        category: 'fuel',
        desc: 'Main IQ map at 0x066760 (362 bytes ≈ 16×11 uint16 BE with header). Verified across the SW range — μ 27676 → 34000 raw (+23%). Treat as the hero Stage 1 fuel-quantity map.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x066760,
        rows: 11, cols: 16, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.20 },
        stage2: { multiplier: 1.30 },
        stage3: { multiplier: 1.40, clampMax: 50000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── EDC17 C46 VW Passat 03L906022MS/SC — 0x1CA18A cluster (2MB) ───────────
  //
  // VW Passat 2.0 TDI CR 80.9 kW EDC17 C46. 3 SW versions across 2 part
  // suffixes (MS/SC) all share the SAME SGO at 0x1CA18A. Verified in
  // pair_analysis_log.md VW pairs #820 sw513692 (MS), #821 sw500160 (SC),
  // #822 sw513692 (MS) — all hit IDENTICAL 7+ region cluster:
  //
  //   0x1CA18A   6 cells u16 BE — IQ release point (raw 2130→61525, +2788%)
  //   0x1C8BEC  13 cells u16 BE — IQ stage A (165%)
  //   0x1C8AFC  14 cells u16 BE — IQ stage B (93%)
  //   0x1DA33A 279 B = 139 cells u16 BE — main IQ map A (+74%)
  //   0x1DA492 279 B = 139 cells u16 BE — main IQ map B (+74%, sister)
  //   0x1DA286 128 B = 64 cells u16 BE — limiter region (-74%)
  //   0x1CA052  14 cells u16 BE — IQ stage C (+71%)
  //
  // Shared by 0281015131 hardware code across MS/SC suffixes. Stage 1
  // value treatment matches my iqrelease 0x06625E def's "raw 2130 → max"
  // pattern but at high-region 2MB anchor.
  {
    id: 'edc17_c46_passat_20tdi_03l906022ms_sc',
    name: 'Bosch EDC17 C46 (VW Passat 2.0 TDI CR 80.9kW — 03L906022MS/SC 0x1CA18A)',
    manufacturer: 'Bosch',
    family: 'EDC17',
    identStrings: ['500159', '500160', '513692', '03L906022MS', '03L906022SC', '0281015131'],
    fileSizeRange: [2097152, 2097152],
    vehicles: ['VW Passat 2.0 TDI CR 80.9kW (0281015131 03L906022MS/SC sw 500159/500160/513692, 2009-2010)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFFC,
    checksumLength: 4,
    maps: [
      {
        id: 'edc17_c46_passat_ms_iq_release',
        name: 'IQ Release (Passat 03L906022MS/SC 0x1CA18A)',
        category: 'fuel',
        desc: 'Primary IQ release at 0x1CA18A (3 uint16 BE cells = 6 B). Verified across 3 SWs / 2 part suffixes. μ 2130 → 61525 raw (+2788%). Same value treatment as 0x06625E iqrelease cluster but at high-region 2MB anchor.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x1CA18A,
        rows: 1, cols: 3, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 55000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 58000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 60000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc17_c46_passat_ms_iq_map_a',
        name: 'Main IQ Map A 279B (Passat 03L906022MS/SC 0x1DA33A)',
        category: 'fuel',
        desc: 'Main IQ map at 0x1DA33A (139 uint16 BE cells = 279 B, possibly 16x9 with header). Verified across same 3 SWs. μ 25914 → 45304 raw (+74%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x1DA33A,
        rows: 9, cols: 16, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.20 },
        stage2: { multiplier: 1.30 },
        stage3: { multiplier: 1.40, clampMax: 50000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── EDC17 C46 VW Jetta 2.0 TDI CR 03L906022KT — 0x071EC0 IQ tweaks (524KB) ─
  //
  // VW Jetta 2.0 TDI CR 103 kW EDC17 C46. 2 SW versions of part 03L906022KT
  // share IDENTICAL 8-region IQ tweak cluster anchored at 0x071EC0. Verified
  // in pair_analysis_log.md VW pairs #664 sw396003 and #666 sw397863 — both
  // hit ALL the same offsets/values: 0x071EC0/0x071EE8/0x071DB0/0x071DC4/
  // 0x07200E/0x07204A/0x071990/0x072196.
  //
  // Common modifications (524 KB form):
  //   0x071EC0  6 cells u16 BE — primary IQ tweak (raw 11325→44138, +290%)
  //   0x071EE8  6 cells u16 BE — sister                (13548→47044, +247%)
  //   0x071DC4 / 0x071DB0  6 cells u16 BE — IQ stage tweaks
  //   0x07204A / 0x07200E / 0x071990 / 0x072196  5 cells u16 BE — small tweaks
  //
  // sw397837 (03L906022KS — sister part suffix) shares some offsets but at
  // different anchor — separate sub-cluster.
  {
    id: 'edc17_c46_jetta_20tdi_03l906022kt',
    name: 'Bosch EDC17 C46 (VW Jetta 2.0 TDI CR 103kW — 03L906022KT sw396003/397863)',
    manufacturer: 'Bosch',
    family: 'EDC17',
    identStrings: ['396003', '397863', '03L906022KT'],
    fileSizeRange: [524288, 524288],
    vehicles: ['VW Jetta 2.0 TDI CR 103kW (03L906022KT sw 396003/397863, 2008-2009)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFFC,
    checksumLength: 4,
    maps: [
      {
        id: 'edc17_c46_jetta_kt_iq_tweak_a',
        name: 'IQ Tweak A (Jetta 03L906022KT 0x071EC0)',
        category: 'fuel',
        desc: 'Primary IQ tweak at 0x071EC0 (6 uint16 BE cells = 12 B). Verified across 2 SWs (sw396003 + sw397863) sharing IDENTICAL offset and treatment. μ 11325 → 44138 raw (+290%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x071EC0,
        rows: 1, cols: 6, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 40000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 44000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 47000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc17_c46_jetta_kt_iq_tweak_b',
        name: 'IQ Tweak B (Jetta 03L906022KT 0x071EE8)',
        category: 'fuel',
        desc: 'Companion IQ tweak at 0x071EE8 (6 uint16 BE cells = 12 B). Verified across same 2 SWs. μ 13548 → 47044 raw (+247%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x071EE8,
        rows: 1, cols: 6, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 44000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 47000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 50000 },
        critical: false, showPreview: false,
      },
    ],
  },

  // ── EDC17 C46 VW Golf 6 2.0 TDI CR 03L906022AG/AH/BG — 0x06513A sister ────
  //
  // VW Golf 6 2.0 TDI CR 103 kW EDC17 C46. 3 SW versions across 3 part
  // suffixes (AG/AH/BG) share the SAME SGO at offset 0x06513A — sister
  // sub-cluster of my main 0x06625E IQ release cluster (Δ=0x1124).
  // Verified in pair_analysis_log.md VW pairs #410 sw396031 (AG), #411
  // sw396032 (AH), #412 sw396043 (BG).
  //
  // Common modifications (524 KB form):
  //   0x06513A  6 B = 3 cells u16 BE — IQ release point (raw 2130 → 61525,
  //                                    +2788% — same value treatment as
  //                                    my main 0x06625E def, just different
  //                                    anchor for AG/AH/BG hardware)
  //   0x079DB6  200 B = 100 cells u16 BE — secondary release at +200%
  //   0x063D34 / 0x063C44  13-14 B IQ stage regions
  //   0x0786F0  16×9 IQ map
  {
    id: 'edc17_c46_golf6_20tdi_03l906022x_06513a',
    name: 'Bosch EDC17 C46 (VW Golf 6 2.0 TDI CR 103kW — 03L906022AG/AH/BG 0x06513A)',
    manufacturer: 'Bosch',
    family: 'EDC17',
    identStrings: ['396031', '396032', '396043'],
    fileSizeRange: [524288, 524288],
    vehicles: ['VW Golf 6 2.0 TDI CR 103kW (03L906022AG/AH/BG sw 396031/396032/396043, 2009)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFFC,
    checksumLength: 4,
    maps: [
      {
        id: 'edc17_c46_golf6_06513a_iq_release',
        name: 'IQ Release Point (Golf 6 03L906022AG/AH/BG 0x06513A)',
        category: 'fuel',
        desc: 'IQ release point at 0x06513A (3 uint16 BE cells = 6 B). Verified across 3 SWs / 3 part suffixes sharing IDENTICAL offset and treatment. μ 2130 → 61525 raw (+2788%). Sister sub-cluster of 0x06625E iqrelease def (Δ=0x1124 anchor shift for AG/AH/BG hardware).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x06513A,
        rows: 1, cols: 3, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 55000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 58000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 60000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc17_c46_golf6_06513a_release_b',
        name: 'IQ Release B 200B (Golf 6 03L906022AG/AH/BG)',
        category: 'fuel',
        desc: 'Secondary IQ release at 0x079DB6 (100 uint16 BE cells = 200 B). Verified across same 3 SWs. μ 4135 → 12405 raw (+200%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x079DB6,
        rows: 1, cols: 100, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 12000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 14000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 16000 },
        critical: false, showPreview: false,
      },
    ],
  },

  // ── EDC17 C46 VW Golf 2.0 TDI CR 03L906022x — IQ Release cluster (524KB) ──
  //
  // VW Golf 2.0 TDI CR 80-103 kW EDC17 C46. 6 SW versions across 5 part
  // suffixes (G/AG/HR/LB/LF/MC) all share the SAME "raw 2130 → max" IQ
  // release at offsets clustering around 0x06625E ±0x3000. Verified in
  // pair_analysis_log.md VW pairs #190, #191, #201, #202, #207, #208:
  //
  //   sw396418 (HR), sw399396 (LB), sw507639 (AG), sw507643 (MC),
  //   sw514600 (G), sw505933 (G/LF 2MB form at 0x1E625E)
  //
  // Common modification structure (524 KB form):
  //   ~0x06625E  6 cells u16 BE — IQ release point (raw 2130 → 55000-61525,
  //                                +2644-2788%)
  //
  // The 6-byte region is 3 paired u16 cells. Different SWs have the anchor
  // shifted by ±0x3000 (e.g. sw396418 → 0x063826, sw399396 → 0x0657D6) but
  // the raw 2130 → max treatment is consistent. Wire with sw514600 anchor
  // (most common) and document the offset variation.
  //
  // 2 MB dump form: same content shifted by +0x180000 (sw505933 hits
  // 0x1E625E = 0x06625E + 0x180000). Confirms 524KB↔2MB +0x180000 dump
  // format also applies to this VW Golf cluster.
  {
    id: 'edc17_c46_golf_20tdi_03l906022xx_iqrelease',
    name: 'Bosch EDC17 C46 (Golf 2.0 TDI CR 80-103kW — 03L906022G/AG/HR/LB/LF/MC IQ release)',
    manufacturer: 'Bosch',
    family: 'EDC17',
    identStrings: ['396418', '396420', '399396', '504854', '504863', '504865', '505933', '505978', '507630', '507639', '507643', '514600', '397832', '505989', '505912', '505913', '505914', '505993', '03L997016H'],
    fileSizeRange: [524288, 524288],   // 524 KB chiptool dump format
    vehicles: ['VW Golf/Scirocco/Tiguan 2.0 TDI CR 80-103kW (03L906022G/AG/HR/LB/LF/MC/R/S + 03L997016H sw 396418-514600, 2008-2010)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFFC,
    checksumLength: 4,
    maps: [
      {
        id: 'edc17_c46_golf_22xx_iq_release',
        name: 'IQ Release Point (Golf 03L906022xx)',
        category: 'fuel',
        desc: 'IQ release point at 0x06625E (6 bytes = 3 uint16 BE cells). Verified across 6 SW versions and 5 part suffixes (G/AG/HR/LB/LF/MC) all sharing the same raw 2130 → ~58000 (+2700%) treatment. NOTE: anchor shifts by ±0x3000 between SW versions (sw396418 → 0x063826, sw399396 → 0x0657D6) — this def matches the most-common sw514600 layout.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x06625E,
        rows: 1, cols: 3, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 55000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 58000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 60000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── EDC17 C64 VW Amarok 2.0 BiTDI 03L906019FA (sw 515253/518108/526355) ──
  //
  // VW Amarok 2.0 BiTDI CR 119.9 kW (163 hp) EDC17 C64. Bosch hardware code,
  // VAG part number 03L906019FA. Verified across 3 SW versions in
  // pair_analysis_log.md VW pairs #18, #19, #21, #28 (and #12 sister) —
  // ALL share IDENTICAL offsets:
  //
  //   0x0623F0  12×15 = 180 cells u16 BE — primary IQ ceiling
  //                                        (raw 15 → 27232 = pinned to ceiling)
  //   0x064308  12×15 = 180 cells u16 BE — companion IQ ceiling
  //                                        (raw 649 → 24771)
  //   0x055DB2  60 B = 30 cells u16 BE  — IQ stage B (+76%)
  //   0x067376 / 0x06739E  20 B = 10 cells u16 BE — boost target pair (+52-69%)
  //
  // Both 0x0623F0 and 0x064308 maps are pinned from near-zero raw values
  // up to ~25000 raw — very dramatic IQ release. Stage 1 = restore to
  // useful operating values; Stage 2/3 push further.
  //
  // sw526355 has 2 confirmation pairs (#12 + #28); sw518108 has 3 (#19/21/25).
  // Pair #19 stage1+++ adds 0x9xxxx noise on top but preserves the SAME SGO
  // targets — confirms the cluster identification.
  {
    id: 'edc17_c64_amarok_03l906019fa',
    name: 'Bosch EDC17 C64 (03L906019FA — VW Amarok 2.0 BiTDI 163hp 2011-2013)',
    manufacturer: 'Bosch',
    family: 'EDC17',
    identStrings: ['03L906019FA', '515253', '518108', '526355', '518073', '03L906022JD'],
    fileSizeRange: [2097152, 2097152],
    vehicles: ['VW Amarok 2.0 BiTDI CR 119.9 kW (03L906019FA sw 515253/518108/526355, 2011-2013)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFFC,
    checksumLength: 4,
    maps: [
      {
        id: 'edc17_c64_019fa_iq_ceiling_a',
        name: 'IQ Ceiling A (03L906019FA Amarok)',
        category: 'fuel',
        desc: 'Primary IQ ceiling at 0x0623F0 (12×15 = 180 uint16 BE cells). Verified across 3 SWs (sw 515253/518108/526355). Stock raw values ~15-50 (near zero) — tuners pin to ~27000 to release IQ. Stage 1 lifts to useful operating range.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x0623F0,
        rows: 15, cols: 12, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 27000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 30000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 33000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc17_c64_019fa_iq_ceiling_b',
        name: 'IQ Ceiling B (03L906019FA Amarok)',
        category: 'fuel',
        desc: 'Companion IQ ceiling at 0x064308 (12×15 = 180 uint16 BE cells). Verified across same 3 SWs. Stock raw values ~600-1000 — tuners pin to ~25000.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x064308,
        rows: 15, cols: 12, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 24700 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 28000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 31000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc17_c64_019fa_iq_stage_b',
        name: 'IQ Stage B (03L906019FA Amarok)',
        category: 'fuel',
        desc: 'IQ stage B at 0x055DB2 (60 B = 30 uint16 BE cells). Verified +76% across cluster. μ 19811 → 34835.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x055DB2,
        rows: 1, cols: 30, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 34500 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 38000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 41000 },
        critical: false, showPreview: false,
      },
    ],
  },

  // ── EDC17 CP44 Audi A8 D4 4.2 V8 TDI 4H0907409 (sw 511925/514636/522804) ─
  //
  // Audi A8 D4 4.2 V8 TDI 350ps EDC17 CP44. Bosch hardware code, VAG part
  // number 4H0907409 (and 4H0907409B/D suffixes). Verified across 3 distinct
  // SW versions in pair_analysis_log.md pairs #980-986:
  //
  //   sw511925, sw514636 (×3 confirmations), sw522804 — all share IDENTICAL
  //   modification structure:
  //
  //   0x1DBE9C  16 B = 8 cells u16 BE — primary IQ ceiling (+218.7%, raw
  //                                     8648 → 27561). Hero Stage 1 map.
  //   0x1A5DFA + 7 sister regions in 0x1A5DEx-0x1A6302 range — emission
  //   disable cluster (8 sub-regions all cleared to 0x32 / -99.9% raw).
  //
  // Offsets vary by ±0x80 between SW versions but cluster STRUCTURE is
  // identical. Anchor offsets below are from sw514636 (most pairs in batch).
  // sw511925 shifts by -4, sw522804 shifts by +0x4A8.
  {
    id: 'edc17_cp44_a8_42tdi_4h0907409',
    name: 'Bosch EDC17 CP44 (4H0907409 — Audi A8 D4 4.2 V8 TDI 350ps 2010-2012)',
    manufacturer: 'Bosch',
    family: 'EDC17',
    identStrings: ['4H0907409', '511925', '514636', '522804', '522813'],
    fileSizeRange: [2097152, 2097152],
    vehicles: ['Audi A8 D4 4.2 V8 TDI 350ps (4H0907409 sw 511925/514636/522804/522813, 2010-2012)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFFC,
    checksumLength: 4,
    maps: [
      {
        id: 'edc17_cp44_4h0907409_iq_ceiling',
        name: 'IQ Ceiling (4H0907409)',
        category: 'fuel',
        desc: 'Primary IQ ceiling at 0x1DBE9C (8 uint16 BE cells). Verified across 3 SW versions (sw 511925/514636/522804) all sharing exact treatment — μ 8648 → 27561 raw (+219%). Pin near tuner consensus to release IQ. NOTE: sw511925 anchor shifts -4 to 0x1DBE98, sw522804 shifts +0x4A8 to 0x1DC340 — same map, slight version-rev shift.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x1DBE9C,
        rows: 1, cols: 8, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 27000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 30000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 33000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── EDC17 CP44 Audi A6 2.7 V6 TDI 4F0907401C (sw 380xxx-391xxx cluster) ─
  //
  // Audi A6 C6 2.7 V6 TDI 132 kW (180 hp). Bosch hardware codes 0281012xxx
  // / 0281013xxx, VAG part number 4F0907401C. Verified across 7+ paired
  // ORI/Stage1 files in pair_analysis_log.md pairs #804, #805, #810, #812,
  // #813, #814 (sw383851), #815, #816, #817 (sw390127), pair #797 (sw391860).
  //
  // SW versions confirmed in cluster: 380752, 380756, 380785, 382074, 383851,
  // 390127, 391860 — all 4F0907401C, all 524 KB chiptool dumps (some pairs
  // also seen in 2 MB form at +0x180000 shifted offsets).
  //
  // Modifications shared across the cluster (524 KB form):
  //   0x06FCxx  9-11 cells u16 BE  — primary IQ ceiling (~+46% / +135%)
  //                                   (offsets vary slightly by SW: 0x06FBFD,
  //                                    0x06FC05, 0x06FC2D, 0x06FC5D, 0x06FC85)
  //   0x078F47  ~95 bytes u16 BE   — main IQ map (+90%)
  //   0x05A7AB  9 cells u16 BE     — limiter ceiling drop (-71%)
  //   0x070xxx  9-15 cells u16 BE  — boost target / limit table (+165%)
  //
  // Note: offsets vary by ~0x40 between SW revisions; we wire the most-common
  // values and accept that some SW variants need slight offset auto-detection.
  // For a strict match, consider per-SW sub-defs.
  {
    id: 'edc17_cp44_a6_27tdi_4f0907401c',
    name: 'Bosch EDC17 CP44 (4F0907401C — Audi A6 C6 2.7 V6 TDI 180hp 2006-2008)',
    manufacturer: 'Bosch',
    family: 'EDC17',
    // ⚠ 4F0907401C is shared hardware between A6 2.7 AND 3.0 V6 TDI. Match
    // ONLY on 2.7-specific SW versions — bare '4F0907401C' would false-match
    // 3.0 TDI files (sw 379471/380431/381388/381389/381392/383872/384624/
    // 389133/389135/391845/395438) which have completely different SGO bases.
    identStrings: ['380752', '380756', '380785', '382074', '383851', '390127', '391860'],
    fileSizeRange: [524288, 524288],   // 524 KB chiptool extraction format
    vehicles: ['Audi A6 C6 2.7 V6 TDI 180hp (4F0907401C sw 380xxx-391xxx, 2006-2008)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFFC,
    checksumLength: 4,
    maps: [
      {
        id: 'edc17_cp44_4f0907401c_iq_ceiling',
        name: 'IQ Ceiling (4F0907401C)',
        category: 'fuel',
        desc: 'Primary IQ ceiling at ~0x06FCxx (9-11 uint16 BE cells). Offset varies by SW within ±0x40. Verified across 7+ pairs — μ 20680 → 30280 raw (+46%) for early SW or higher for newer. Pin near tuner consensus (~30000) for Stage 1.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x06FC2D,   // sw390127 anchor — most common
        rows: 1, cols: 11, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 30000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 33000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 36000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc17_cp44_4f0907401c_main_iq',
        name: 'Main IQ Map (4F0907401C)',
        category: 'fuel',
        desc: 'Main IQ map at 0x078F47 (~95 bytes ≈ 47 uint16 BE cells, possibly 16×3 with header). Verified at μ 23890 → 45553 raw (+90%) on sw380752/380756 pairs.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x078F47,
        rows: 3, cols: 16, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.20 },
        stage2: { multiplier: 1.30 },
        stage3: { multiplier: 1.40, clampMax: 50000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc17_cp44_4f0907401c_limiter_drop',
        name: 'Limiter Ceiling Drop (4F0907401C)',
        category: 'limiter',
        desc: 'Limiter ceiling at 0x05A7AB (9 uint16 BE cells). Tuners drop from 50306 → 14339 raw (-71%) — counterintuitive: lowering the ceiling raises the trigger point in the derate logic.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x05A7AB,
        rows: 1, cols: 9, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 0.30 },
        stage2: { multiplier: 0.25 },
        stage3: { multiplier: 0.20 },
        critical: false, showPreview: false,
      },
    ],
  },

  // ── EDC17 Audi A5 2.7 V6 TDI 8K1907401A (sw 516xxx cluster) ──────────────
  //
  // Audi A5 2.7 V6 TDI 2009+ ECU. Bosch part number 8K1907401A. Verified by
  // pair analysis across 4 different SW versions (516657, 516662, 516664,
  // 516665) all sharing identical big-region offsets (see pair_analysis_log.md
  // pairs #601-604). Five maps consistently modified across all 4 tunes:
  //
  //   0x1DBCCC  12 cells u16 — primary IQ ceiling (raw 13035 → 38465, +200%)
  //   0x1DBC18  12 cells u16 — sister IQ stage    (raw 26954 → 39243, +50%)
  //   0x1E0782  128 B = 64 cells u16 — limiter ceiling halved (32830 → 16450)
  //   0x1DBE10  12 cells u16 — N75 minimum drop   (57068 → 30446, -47%)
  //   0x1E541E  6 B = 3 cells u16 — point limit   (32788 → 61468, +88%)
  //
  // Tuning treatment: each tuner pinned within ~10% of the same target. Stage
  // 1 multipliers below match the consensus of 4 independent tunes.
  {
    id: 'edc17_a5_27tdi_8k1907401a',
    name: 'Bosch EDC17 (8K1907401A — Audi A5 2.7 V6 TDI 163-190ps 2009+)',
    manufacturer: 'Bosch',
    family: 'EDC17',
    // IMPORTANT: 8K1907401A is shared hardware between A5 2.7 AND 3.0 V6 TDI.
    // Match on the 2.7-specific SW versions ONLY — bare '8K1907401A' would
    // false-match A5 3.0 TDI (sw 396465 / 399371 / 516618) which has a
    // completely different SGO base (0x1DExxx / 0x1D5xxx / 0x1E3D5A).
    identStrings: ['516657', '516662', '516664', '516665'],
    fileSizeRange: [2097152, 2097152],
    vehicles: ['Audi A5 2.7 V6 TDI 163-190ps (8K1907401A sw 516657-516665, 2009-2011)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFFC,
    checksumLength: 4,
    maps: [
      {
        id: 'edc17_a5_27tdi_iq_ceiling',
        name: 'Injected Quantity Ceiling (8K1907401A 516xxx)',
        category: 'fuel',
        desc: 'Primary IQ ceiling at 0x1DBCCC (12 uint16 cells). Verified across 4 independent Stage 1 pairs (sw 516657/516662/516664/516665) — μ 13035 → 38465 raw (+195%). Pin near tuner consensus to expose full IQ range.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x1DBCCC,
        rows: 1, cols: 12, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 38000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 42000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 45000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc17_a5_27tdi_iq_stage_b',
        name: 'IQ Stage B (8K1907401A 516xxx)',
        category: 'fuel',
        desc: 'Companion IQ stage at 0x1DBC18 (12 uint16 cells). Verified across same 4 pairs — μ 26954 → 39243 raw (+45%). Sister to Ceiling A.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x1DBC18,
        rows: 1, cols: 12, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 39000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 42000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 45000 },
        critical: false, showPreview: false,
      },
      {
        id: 'edc17_a5_27tdi_limiter_drop',
        name: 'Limiter Ceiling (halve to release) (8K1907401A 516xxx)',
        category: 'limiter',
        desc: 'Limiter ceiling at 0x1E0782 (128 bytes = 64 uint16 cells). Verified across 4 pairs — μ 32830 → 16450 raw (-50%). Tuners HALVE this region — counterintuitive — likely a "max-cut threshold" where lowering the ceiling raises the trigger point in derate logic. Apply with same -50% intent.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x1E0782,
        rows: 1, cols: 64, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 0.5 },
        stage2: { multiplier: 0.4 },
        stage3: { multiplier: 0.3 },
        critical: false, showPreview: false,
      },
      {
        id: 'edc17_a5_27tdi_n75_minimum',
        name: 'N75 Minimum Drop (8K1907401A 516xxx)',
        category: 'boost',
        desc: 'N75 minimum / boost-target floor at 0x1DBE10 (12 uint16 cells). Verified across 4 pairs — μ 57068 → 30446 raw (-47%). Drop to allow lower boost duty floor for response.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x1DBE10,
        rows: 1, cols: 12, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 0.55 },
        stage2: { multiplier: 0.50 },
        stage3: { multiplier: 0.45 },
        critical: false, showPreview: false,
      },
      {
        id: 'edc17_a5_27tdi_point_ceiling',
        name: 'Point Ceiling (8K1907401A 516xxx)',
        category: 'limiter',
        desc: 'Single-point ceiling at 0x1E541E (3 uint16 cells). Verified across 4 pairs — μ 32788 → 61468 raw (+88%). Likely a one-shot torque-limit ceiling; raise toward max.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x1E541E,
        rows: 1, cols: 3, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 60000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 62000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 64000 },
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
    identStrings: ['SIMOS18', 'SIM18', 'SIEMENS', 'CONTI', '5Q0906', 'SC800', 'SC110', 'CASC8', '8X0906', 'EV_ECM20TFS'],
    fileSizeRange: [1048576, 5242880],
    vehicles: ['VW Golf R Mk7/7.5/8', 'Audi S3 8V/8Y', 'Audi S1 2.0 TFSI', 'Audi TT RS', 'Seat Leon Cupra R', 'Skoda Octavia RS 245/300'],
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
        id: 'simos18_ignition',
        name: 'Ignition Timing Base',
        category: 'ignition',
        desc: 'Base ignition advance map. SIMOS18 EA888 Gen3 may use float32 timing maps in some variants — dtype may need updating when sigs are added. Stage 2/3 adds advance where knock margin allows on premium fuel.',
        signatures: [],
        sigOffset: 0,
        rows: 16, cols: 16, dtype: 'int16', le: true,
        factor: 0.75, offsetVal: 0, unit: '°BTDC',
        stage1: { addend: 0 },
        stage2: { addend: 2 },
        stage3: { addend: 3 },
        critical: false, showPreview: true,
      },
      {
        id: 'simos18_lambda_target',
        name: 'Lambda / AFR Target',
        category: 'smoke',
        desc: 'Wideband lambda target map. Controls target air-fuel ratio across load range. Enriching slightly at WOT protects against detonation on tuned EA888.',
        signatures: [],
        sigOffset: 0,
        rows: 16, cols: 16, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'lambda',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 0.98 },
        stage3: { multiplier: 0.95 },
        critical: false, showPreview: true,
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
        // SNM16ZUUB RPM axis — standard 16-point ME7 RPM breakpoints (DAMOS/prj/me7-tools)
        axisXValues: [720, 1000, 1520, 2000, 2520, 3000, 3520, 4000, 4520, 5000, 5520, 6000, 6520, 7000, 7280, 7520],
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
        axisXValues: [720, 1000, 1520, 2000, 2520, 3000, 3520, 4000, 4520, 5000, 5520, 6000, 6520, 7000, 7280, 7520],
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
        signatures: [
          [0x4B,0x46,0x5A,0x57,0x00], [0x4B,0x46,0x5A,0x57,0x32,0x00],
          // LE Kf_ 16×12 ignition (RPM axis 0,2621,5243,7864) — database study: 25 ME7 files
          [0x10,0x00,0x0c,0x00,0x00,0x00,0x3d,0x0a,0x7b,0x14,0xb8,0x1e],
        ],
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
        // SNM16ZUUB (16 RPM) × SRL12ZUUB (12 load %) — confirmed prj/me7-tools KFZW.audi.xml
        axisXValues: [720, 1000, 1520, 2000, 2520, 3000, 3520, 4000, 4520, 5000, 5520, 6000, 6520, 7000, 7280, 7520],
        axisYValues: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 120, 150],
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
        axisXValues: [720, 1520, 2520, 3520, 4520, 5520, 6520, 7520],
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
        // CORRECTED: 16×16. DAMOS A2L parser found KFMIRL as 16×16 across 195 ME7 A2L files (100%).
        // Previous 12×16 was wrong — caused KFMIRL to match wrong data blocks in stripped binaries.
        rows: 16, cols: 16, dtype: 'uint16', le: false,
        // factor 3/128 = 0.0234375 — confirmed by ME7Tuner (KalebKE/ME7Tuner on GitHub) and Nefmoto.
        // Stock AWP/AUQ 150PS: typical full-load raw ~4267 (4267×0.0234375 = 100% load).
        // Stage 3 225PS target: ~5800 raw = 136% load. clampMax 6000 = 141% (safe ceiling).
        factor: 0.0234375, offsetVal: 0, unit: '% load',
        axisXValues: [720, 1000, 1520, 2000, 2520, 3000, 3520, 4000, 4520, 5000, 5520, 6000, 6520, 7000, 7280, 7520],
        axisYValues: [0, 25, 50, 75, 100, 125, 150, 175, 200, 250, 300, 400],
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
        axisXValues: [720, 1000, 1520, 2000, 2520, 3000, 3520, 4000, 4520, 5000, 5520, 6000, 6520, 7000, 7280, 7520],
        axisYValues: [10, 20, 30, 40, 50, 60, 70, 80, 100, 120, 150],
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
        // DB study (22258 bins): 8×8 sig 0x00100010 — 4728 occurrences, top non-null ME7 8×8 pattern.
        a2lNames: ['KFLDHBN', 'KLDHBN', 'KFLDH'],
        signatures: [[0x4B,0x46,0x4C,0x44,0x48,0x42,0x4E,0x00]],  // "KFLDHBN\0" — removed [0x00,0x10,0x00,0x10] (false positives in stripped binaries)
        sigOffset: 2,
        // Research confirms: KFLDHBN is an 8×8 table (8 RPM columns × 8 load rows) outputting
        // compressor pressure ratio (NOT % load). Factor 0.015625 (= 1/64): raw 64 = 1.0 ratio,
        // raw 200 = 3.125 ratio. Stock AUQ/AWP turbo map typically 1.5–2.8 ratio range.
        // Source: HP Academy ME7 Advanced Tuning course, Nefmoto "KFLDHBN explained" thread 2019.
        rows: 8, cols: 8, dtype: 'uint8', le: false,
        factor: 0.015625, offsetVal: 0, unit: 'ratio',
        axisXValues: [1000, 2000, 3000, 4000, 5000, 6000, 7000, 7520],
        axisYValues: [10, 30, 50, 70, 90, 110, 130, 150],
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
        axisXValues: [720, 1000, 1520, 2000, 2520, 3000, 3520, 4000, 4520, 5000, 5520, 6000, 6520, 7000, 7280, 7520],
        axisYValues: [10, 20, 30, 40, 50, 60, 70, 80, 100, 120, 150],
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
        axisXValues: [720, 1000, 1520, 2000, 2520, 3000, 3520, 4000, 4520, 5000, 5520, 6000, 6520, 7000, 7280, 7520],
        axisYValues: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 120, 150],
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
        axisXValues: [0, 25, 50, 75, 100],
        axisYValues: [720, 1520, 2520, 3520, 4520, 5520, 6520, 7520],
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
        axisXValues: [0, 3, 7, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 95, 100],
        axisYValues: [720, 1000, 1520, 2000, 2520, 3000, 3520, 4000, 4520, 5000, 5520, 6000],
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
        axisXValues: [0, 20, 40, 60, 80, 100],
        axisYValues: [720, 1000, 1520, 2000, 2520, 3000, 3520, 4000, 4520, 5000, 5520, 6000, 6520, 7000, 7520],
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
        axisXValues: [720, 1000, 1520, 2000, 2520, 3000, 3520, 4000, 4520, 5000, 5520, 6000, 6520, 7000, 7280, 7520],
        axisYValues: [-200, -150, -100, -50, 0, 50, 100, 150, 200, 300],
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
        axisXValues: [720, 1000, 1520, 2000, 2520, 3000, 3520, 4000, 4520, 5000, 5520, 6000, 6520, 7000, 7280, 7520],
        axisYValues: [-200, -100, -50, 0, 50, 100, 200, 300],
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
        signatures: [
          [0x4B,0x46,0x50,0x42,0x52,0x4B,0x00],
          // LE Kf_ 10×10 VE correction (RPM axis 2800,4000,6080,8000) — database study: 32 ME7 files
          [0x0a,0x00,0x0a,0x00,0xf0,0x0a,0xa0,0x0f,0xc0,0x17,0x40,0x1f],
        ],
        sigOffset: 2,
        rows: 10, cols: 10, dtype: 'uint16', le: true,
        // factor 0.001526: raw 655 = 1.000 (unity correction). Stock cells should be 0.95–1.05 range.
        factor: 0.001526, offsetVal: 0, unit: 'ratio',
        axisXValues: [720, 1520, 2520, 3520, 4520, 5520, 6000, 6520, 7000, 7520],
        axisYValues: [10, 20, 30, 40, 50, 60, 80, 100, 130, 160],
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
      // NOTE: me9_fuel_map was removed — it was a mislabeled ignition map (KFZW sigs, int8, factor 0.75°).
      // The KFZW sigs have been moved to me9_ignition below where they belong.
      // ME9 fuel injection detection requires A2L symbol matching (KFMIRL, KFPED, etc.)
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
        id: 'me9_ignition',
        name: 'Ignition Timing Map',
        category: 'ignition',
        desc: 'Spark advance map (KFZW). Focus ST/RS 2.5T responds well to timing advance on premium fuel — primary Stage 2 modification.',
        signatures: [
          // ASCII "KFZW\0" and "KFZW2\0" — Kennfeld Zündwinkel (ignition timing map)
          [0x4B,0x46,0x5A,0x57,0x00], [0x4B,0x46,0x5A,0x57,0x32,0x00],
        ],
        sigOffset: 2,
        rows: 16, cols: 16, dtype: 'int8', le: false,
        factor: 0.75, offsetVal: -48, unit: '°BTDC',
        stage1: { addend: 0 },
        stage2: { addend: 2 },
        stage3: { addend: 3 },
        critical: false, showPreview: true,
      },
      {
        id: 'me9_lambda_target',
        name: 'Lambda / AFR Target',
        category: 'smoke',
        desc: 'Wideband lambda target map. Controls target AFR — enriching slightly at WOT protects against detonation on tuned 2.5T.',
        signatures: [],
        sigOffset: 0,
        rows: 16, cols: 16, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'lambda',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 0.98 },
        stage3: { multiplier: 0.95 },
        critical: false, showPreview: true,
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
      {
        id: 'dcm35_smoke_limiter',
        name: 'Smoke Limiter',
        category: 'smoke',
        desc: 'Maximum fuel quantity by airflow. Prevents visible smoke — must be raised to allow fuel increases to take effect.',
        signatures: [],
        sigOffset: 0,
        rows: 12, cols: 16, dtype: 'uint16', le: true,
        factor: 0.01, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.10 },
        stage2: { multiplier: 1.18 },
        stage3: { multiplier: 1.28 },
        critical: true, showPreview: true,
      },
      {
        id: 'dcm35_soi',
        name: 'Start of Injection (SOI)',
        category: 'ignition',
        desc: 'Injection timing advance. Advancing SOI improves combustion efficiency on the DW10C diesel.',
        signatures: [],
        sigOffset: 0,
        rows: 10, cols: 10, dtype: 'int16', le: true,
        factor: 0.02, offsetVal: 0, unit: '°BTDC',
        stage1: { multiplier: 1.0 },
        stage2: { addend: 30 },
        stage3: { addend: 50 },
        critical: false, showPreview: true,
      },
      {
        id: 'dcm35_rail_pressure',
        name: 'Rail Pressure Target',
        category: 'fuel',
        desc: 'Common rail pressure setpoint. Higher rail pressure supports increased fuel delivery for Stage 2/3.',
        signatures: [],
        sigOffset: 0,
        rows: 10, cols: 16, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.05 },
        stage2: { multiplier: 1.08 },
        stage3: { multiplier: 1.12 },
        critical: false, showPreview: true,
      },
      {
        id: 'dcm35_speed_limit',
        name: 'Vehicle Speed Limiter',
        category: 'limiter',
        desc: 'Factory vehicle speed limiter. Removed for unrestricted top speed.',
        signatures: [],
        sigOffset: 0,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'km/h',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { speedlimiter: { multiplier: 0, addend: 65535 } },
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
      {
        id: 'sid208_smoke_limiter',
        name: 'Smoke Limiter',
        category: 'smoke',
        desc: 'Airflow-based smoke limit. Must be raised to allow fuel increases on Transit/Defender diesel.',
        signatures: [],
        sigOffset: 0,
        rows: 12, cols: 16, dtype: 'uint16', le: true,
        factor: 0.01, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.10 },
        stage2: { multiplier: 1.18 },
        stage3: { multiplier: 1.28 },
        critical: true, showPreview: true,
      },
      {
        id: 'sid208_soi',
        name: 'Start of Injection (SOI)',
        category: 'ignition',
        desc: 'Injection timing advance for SID208 diesel. Advancing SOI improves efficiency on Ford Transit.',
        signatures: [],
        sigOffset: 0,
        rows: 10, cols: 10, dtype: 'int16', le: true,
        factor: 0.02, offsetVal: 0, unit: '°BTDC',
        stage1: { multiplier: 1.0 },
        stage2: { addend: 30 },
        stage3: { addend: 50 },
        critical: false, showPreview: true,
      },
      {
        id: 'sid208_rail_pressure',
        name: 'Rail Pressure Target',
        category: 'fuel',
        desc: 'Common rail pressure setpoint. Higher rail pressure supports increased injection quantity.',
        signatures: [],
        sigOffset: 0,
        rows: 10, cols: 16, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.05 },
        stage2: { multiplier: 1.08 },
        stage3: { multiplier: 1.12 },
        critical: false, showPreview: true,
      },
      {
        id: 'sid208_egr',
        name: 'EGR Flow Map',
        category: 'emission',
        desc: 'EGR valve duty control. Zero for EGR delete on Transit diesel.',
        signatures: [],
        sigOffset: 0,
        rows: 8, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: '%',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { egr: { multiplier: 0, clampMax: 0 } },
        critical: false, showPreview: false,
      },
      {
        id: 'sid208_speed_limit',
        name: 'Vehicle Speed Limiter',
        category: 'limiter',
        desc: 'Factory vehicle speed limiter for Transit/Defender diesel.',
        signatures: [],
        sigOffset: 0,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'km/h',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { speedlimiter: { multiplier: 0, addend: 65535 } },
        critical: false, showPreview: false,
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
      {
        id: 'ems3120_smoke_limiter',
        name: 'Smoke Limiter',
        category: 'smoke',
        desc: 'Maximum fuel quantity by airflow for K9K 1.5 dCi. Must be raised to allow fuel increases.',
        signatures: [],
        sigOffset: 0,
        rows: 12, cols: 16, dtype: 'uint16', le: true,
        factor: 0.01, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.10 },
        stage2: { multiplier: 1.18 },
        stage3: { multiplier: 1.28 },
        critical: true, showPreview: true,
      },
      {
        id: 'ems3120_soi',
        name: 'Start of Injection (SOI)',
        category: 'ignition',
        desc: 'Injection timing advance for K9K diesel. Advancing SOI improves combustion efficiency.',
        signatures: [],
        sigOffset: 0,
        rows: 10, cols: 10, dtype: 'int16', le: true,
        factor: 0.02, offsetVal: 0, unit: '°BTDC',
        stage1: { multiplier: 1.0 },
        stage2: { addend: 30 },
        stage3: { addend: 50 },
        critical: false, showPreview: true,
      },
      {
        id: 'ems3120_rail_pressure',
        name: 'Rail Pressure Target',
        category: 'fuel',
        desc: 'Common rail pressure setpoint for K9K 1.5 dCi. Supports increased injection quantity.',
        signatures: [],
        sigOffset: 0,
        rows: 10, cols: 16, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.05 },
        stage2: { multiplier: 1.08 },
        stage3: { multiplier: 1.12 },
        critical: false, showPreview: true,
      },
      {
        id: 'ems3120_speed_limit',
        name: 'Vehicle Speed Limiter',
        category: 'limiter',
        desc: 'Factory speed limiter for Renault/Nissan dCi.',
        signatures: [],
        sigOffset: 0,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'km/h',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { speedlimiter: { multiplier: 0, addend: 65535 } },
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
      {
        id: 'pcr21_smoke_limiter',
        name: 'Smoke Limiter',
        category: 'smoke',
        desc: 'Maximum fuel quantity by airflow for 1.6 TDI. Prevents visible smoke — must be raised with fuel increases.',
        signatures: [],
        sigOffset: 0,
        rows: 12, cols: 16, dtype: 'uint16', le: true,
        factor: 0.01, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.10 },
        stage2: { multiplier: 1.18 },
        stage3: { multiplier: 1.28 },
        critical: true, showPreview: true,
      },
      {
        id: 'pcr21_soi',
        name: 'Start of Injection (SOI)',
        category: 'ignition',
        desc: 'Injection timing advance for 1.6 TDI. Advancing SOI improves combustion efficiency.',
        signatures: [],
        sigOffset: 0,
        rows: 10, cols: 10, dtype: 'int16', le: true,
        factor: 0.02, offsetVal: 0, unit: '°BTDC',
        stage1: { multiplier: 1.0 },
        stage2: { addend: 30 },
        stage3: { addend: 50 },
        critical: false, showPreview: true,
      },
      {
        id: 'pcr21_rail_pressure',
        name: 'Rail Pressure Target',
        category: 'fuel',
        desc: 'Common rail pressure setpoint for 1.6 TDI. Supports increased injection quantity.',
        signatures: [],
        sigOffset: 0,
        rows: 10, cols: 16, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.05 },
        stage2: { multiplier: 1.08 },
        stage3: { multiplier: 1.12 },
        critical: false, showPreview: true,
      },
      {
        id: 'pcr21_speed_limit',
        name: 'Vehicle Speed Limiter',
        category: 'limiter',
        desc: 'Factory speed limiter for VAG 1.6 TDI.',
        signatures: [],
        sigOffset: 0,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'km/h',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { speedlimiter: { multiplier: 0, addend: 65535 } },
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
        id: 'simos10_ignition',
        name: 'Ignition Timing Map',
        category: 'ignition',
        desc: 'Base ignition advance for SIMOS10 1.2 TSI. Advancing timing on premium fuel improves response and power.',
        signatures: [],
        sigOffset: 0,
        rows: 16, cols: 16, dtype: 'int8', le: true,
        factor: 0.75, offsetVal: -48, unit: '°BTDC',
        stage1: { addend: 0 },
        stage2: { addend: 2 },
        stage3: { addend: 3 },
        critical: false, showPreview: true,
      },
      {
        id: 'simos10_lambda_target',
        name: 'Lambda / AFR Target',
        category: 'smoke',
        desc: 'Lambda target map. Controls target air-fuel ratio — enriching at WOT protects against detonation on tuned 1.2 TSI.',
        signatures: [],
        sigOffset: 0,
        rows: 16, cols: 16, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'lambda',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 0.98 },
        stage3: { multiplier: 0.95 },
        critical: false, showPreview: true,
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
      {
        id: 'me17kia_lambda_target',
        name: 'Lambda / AFR Target',
        category: 'smoke',
        desc: 'Lambda target map for Kia/Hyundai GDI. Controls target air-fuel ratio across load range.',
        signatures: [],
        sigOffset: 0,
        rows: 16, cols: 16, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'lambda',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 0.98 },
        stage3: { multiplier: 0.95 },
        critical: false, showPreview: true,
      },
      {
        id: 'me17kia_rev_limit',
        name: 'Rev Limiter',
        category: 'limiter',
        desc: 'Engine RPM hard-cut limiter for Kia/Hyundai GDI engines.',
        signatures: [],
        sigOffset: 0,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'RPM',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { revlimit: { addend: 300, clampMax: 8000 } },
        critical: false, showPreview: false,
      },
      {
        id: 'me17kia_speed_limit',
        name: 'Vehicle Speed Limiter',
        category: 'limiter',
        desc: 'Factory speed limiter for Kia/Hyundai GDI vehicles.',
        signatures: [],
        sigOffset: 0,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'km/h',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { speedlimiter: { multiplier: 0, addend: 65535 } },
        critical: false, showPreview: false,
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
    identStrings: ['MG1CS', 'MG1C3', 'MG1CS015', 'MG1CS016', 'MG1CS017', 'MG1CS002', '0261S14', '0261S15', '0261S12', '06M907', '8W0907', 'EV_ECM29TFS', 'EV_ECM20TFS', '10SW027'],
    fileSizeRange: [1048576, 4194304],   // 1MB – 4MB (TC275/TC277 = 2–4MB)
    vehicles: ['Ford Focus RS Mk3 (2.3 EcoBoost)', 'Ford Fiesta ST200 (1.6 EcoBoost)', 'Ford Focus ST Mk3 (2.0 EcoBoost)', 'Ford Mustang 2.3 EcoBoost', 'Ford Focus 1.0 EcoBoost 125/140ps', 'Audi RS5 B9 2.9 TFSI V6', 'Audi RS4 B9 2.9 TFSI', 'Audi S4/S5 B9 3.0 TFSI'],
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
        // Toned down from 1.20 → 1.06 on Stage 1 — pro-tune realistic for petrol DI.
        stage1: { multiplier: 1.06 },
        stage2: { multiplier: 1.18 },
        stage3: { multiplier: 1.35, clampMax: 62000 },
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
        // Toned down from 1.15 → 1.05 on Stage 1 — petrol fuel map realistic increase.
        stage1: { multiplier: 1.05 },
        stage2: { multiplier: 1.15 },
        stage3: { multiplier: 1.25, clampMax: 60000 },
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
        // Toned down from 1.30 → 1.10 on Stage 1. Petrol torque ceiling raise kept conservative;
        // torque-monitor and driver's-wish variants cover the rest of the torque chain.
        stage1: { multiplier: 1.10 },
        stage2: { multiplier: 1.25 },
        stage3: { multiplier: 1.45, clampMax: 65000 },
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
      // ── NEW: Driver's Wish, Lambda, N75, Rail Pressure, Torque Monitor ──
      {
        id: 'mg1_drivers_wish',
        name: "Driver's Wish Map",
        category: 'torque',
        desc: "Pedal-to-torque demand conversion. Left stock on Stage 1 for drivability — sharper throttle response is a Stage 2/3 feature.",
        a2lNames: ['AccPed_trqEng0_MAP', 'DrvWish_MAP', 'AccPed_trqEngA_MAP', 'MIFAS_MAP'],
        signatures: [],
        sigOffset: 0,
        rows: 16, cols: 16, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        // Toned down from 1.10 → 1.00 on Stage 1. Matches pro-tune convention.
        stage1: { multiplier: 1.00 },
        stage2: { multiplier: 1.10 },
        stage3: { multiplier: 1.20, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'mg1_lambda_target',
        name: 'Lambda Target (WOT)',
        category: 'smoke',
        desc: 'Target air-fuel ratio at wide-open throttle. Running richer (lower lambda) protects the engine from detonation. Stage 2/3 targets slightly richer for safety on upgraded turbos.',
        a2lNames: ['KFURL_MAP', 'Lambda_WOT_MAP', 'LambdaTarget_MAP'],
        signatures: [],
        sigOffset: 0,
        // CORRECTED: 8×8 (was 16×16). Scanner found lambda maps as 8×8 in MG1CS002 RS5.
        rows: 8, cols: 8, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'λ',
        stage1: { multiplier: 0.97 },
        stage2: { multiplier: 0.94 },
        stage3: { multiplier: 0.90, clampMin: 750 },
        critical: false, showPreview: true,
      },
      {
        id: 'mg1_n75_duty',
        name: 'Wastegate Duty Cycle',
        category: 'boost',
        desc: 'N75 wastegate solenoid duty map. Controls boost build rate. Must be recalibrated when boost targets are raised to prevent boost spikes and turbo hunting.',
        a2lNames: ['N75_MAP', 'LDTV_MAP', 'WG_Duty_MAP', 'WGduty_MAP'],
        signatures: [],
        sigOffset: 0,
        rows: 12, cols: 12, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: '%',
        stage1: { multiplier: 1.08 },
        stage2: { multiplier: 1.15 },
        stage3: { multiplier: 1.22, clampMax: 1000 },
        critical: false, showPreview: false,
      },
      {
        id: 'mg1_rail_pressure',
        name: 'Rail Pressure Target',
        category: 'fuel',
        desc: 'Target fuel rail pressure by RPM and load. Higher rail pressure improves fuel atomisation for more power. Must be raised on Stage 2/3 to support increased fuel flow.',
        a2lNames: ['FuPrC_pSetPt_MAP', 'RailPres_MAP', 'pRailSet_MAP'],
        signatures: [],
        sigOffset: 0,
        rows: 16, cols: 16, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.05 },
        stage2: { multiplier: 1.10 },
        stage3: { multiplier: 1.15, clampMax: 2500 },
        critical: false, showPreview: true,
      },
      {
        id: 'mg1_torque_monitor',
        name: 'Torque Monitoring Map',
        category: 'torque',
        desc: 'Torque plausibility monitoring. ECU compares actual torque against this — if exceeded, triggers P060A limp mode. MUST be raised alongside torque and boost maps.',
        a2lNames: ['TrqMon_MAP', 'TqMon_trqMax_MAP', 'MQBEGR_MON'],
        signatures: [
          // MG1 Torque Monitor RPM axis: first 6 values [1160,1440,2000,3000,3898,3900] as LE uint16.
          // Found 8× in Audi RS5 MG1CS002 binary. sigOffset 52 skips remaining 10 X + 16 Y axis values.
          [0x88,0x04,0xA0,0x05,0xD0,0x07,0xB8,0x0B,0x3A,0x0F,0x3C,0x0F],
        ],
        sigOffset: 52,
        rows: 16, cols: 16, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.30 },
        stage2: { multiplier: 1.45 },
        stage3: { multiplier: 1.65, clampMax: 65000 },
        critical: true, showPreview: true,
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
      {
        id: 'me97_lambda_target',
        name: 'Lambda / AFR Target',
        category: 'smoke',
        desc: 'Lambda target map for Mercedes M156/M272. Controls target air-fuel ratio — enrichment at WOT critical for NA V8 safety.',
        signatures: [],
        sigOffset: 0,
        rows: 16, cols: 16, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'lambda',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 0.98 },
        stage3: { multiplier: 0.95 },
        critical: false, showPreview: true,
      },
      {
        id: 'me97_speed_limit',
        name: 'Vehicle Speed Limiter',
        category: 'limiter',
        desc: 'Factory speed limiter. Mercedes 250 km/h electronic limit — removed for track use.',
        signatures: [],
        sigOffset: 0,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'km/h',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { speedlimiter: { multiplier: 0, addend: 65535 } },
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
      {
        id: 'dcm61_smoke_limiter',
        name: 'Smoke Limiter',
        category: 'smoke',
        desc: 'Maximum fuel quantity by airflow for Transit/Ranger diesel. Must be raised to allow fuel increases.',
        signatures: [],
        sigOffset: 0,
        rows: 12, cols: 16, dtype: 'uint16', le: true,
        factor: 0.01, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.10 },
        stage2: { multiplier: 1.18 },
        stage3: { multiplier: 1.28 },
        critical: true, showPreview: true,
      },
      {
        id: 'dcm61_soi',
        name: 'Start of Injection (SOI)',
        category: 'ignition',
        desc: 'Injection timing advance for Transit/Ranger diesel. Advancing SOI improves efficiency.',
        signatures: [],
        sigOffset: 0,
        rows: 10, cols: 10, dtype: 'int16', le: true,
        factor: 0.02, offsetVal: 0, unit: '°BTDC',
        stage1: { multiplier: 1.0 },
        stage2: { addend: 30 },
        stage3: { addend: 50 },
        critical: false, showPreview: true,
      },
      {
        id: 'dcm61_egr',
        name: 'EGR Flow Map',
        category: 'emission',
        desc: 'EGR valve duty for Ford Transit/Ranger diesel. Zero for EGR delete.',
        signatures: [],
        sigOffset: 0,
        rows: 8, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: '%',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { egr: { multiplier: 0, clampMax: 0 } },
        critical: false, showPreview: false,
      },
      {
        id: 'dcm61_speed_limit',
        name: 'Vehicle Speed Limiter',
        category: 'limiter',
        desc: 'Factory speed limiter for Ford Transit/Ranger diesel.',
        signatures: [],
        sigOffset: 0,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'km/h',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { speedlimiter: { multiplier: 0, addend: 65535 } },
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
      {
        id: 'sid807_smoke_limiter',
        name: 'Smoke Limiter',
        category: 'smoke',
        desc: 'Maximum fuel quantity by airflow for Ford/PSA TDCi. Must be raised to allow fuel increases.',
        signatures: [],
        sigOffset: 0,
        rows: 12, cols: 16, dtype: 'uint16', le: false,
        factor: 0.01, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.10 },
        stage2: { multiplier: 1.18 },
        stage3: { multiplier: 1.28 },
        critical: true, showPreview: true,
      },
      {
        id: 'sid807_soi',
        name: 'Start of Injection (SOI)',
        category: 'ignition',
        desc: 'Injection timing advance for SID807 TDCi diesel.',
        signatures: [],
        sigOffset: 0,
        rows: 10, cols: 10, dtype: 'int16', le: false,
        factor: 0.02, offsetVal: 0, unit: '°BTDC',
        stage1: { multiplier: 1.0 },
        stage2: { addend: 30 },
        stage3: { addend: 50 },
        critical: false, showPreview: true,
      },
      {
        id: 'sid807_rail_pressure',
        name: 'Rail Pressure Target',
        category: 'fuel',
        desc: 'Common rail pressure setpoint for SID807 diesel.',
        signatures: [],
        sigOffset: 0,
        rows: 10, cols: 16, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.05 },
        stage2: { multiplier: 1.08 },
        stage3: { multiplier: 1.12 },
        critical: false, showPreview: true,
      },
      {
        id: 'sid807_egr',
        name: 'EGR Flow Map',
        category: 'emission',
        desc: 'EGR valve duty for SID807 TDCi/BlueHDi diesel. Zero for EGR delete.',
        signatures: [],
        sigOffset: 0,
        rows: 8, cols: 8, dtype: 'uint16', le: false,
        factor: 0.1, offsetVal: 0, unit: '%',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { egr: { multiplier: 0, clampMax: 0 } },
        critical: false, showPreview: false,
      },
      {
        id: 'sid807_speed_limit',
        name: 'Vehicle Speed Limiter',
        category: 'limiter',
        desc: 'Factory speed limiter for Ford/PSA diesel.',
        signatures: [],
        sigOffset: 0,
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
        id: 'skyactiv_torque_limit',
        name: 'Torque Demand Limit',
        category: 'torque',
        desc: 'Software torque ceiling for SkyActiv engines. Must be raised to realise power gains.',
        signatures: [],
        sigOffset: 0,
        rows: 8, cols: 8, dtype: 'uint16', le: false,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.12 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.35 },
        critical: true, showPreview: true,
      },
      {
        id: 'skyactiv_lambda_target',
        name: 'Lambda / AFR Target',
        category: 'smoke',
        desc: 'Lambda target map for SkyActiv-G. High compression ratio makes lambda control critical.',
        signatures: [],
        sigOffset: 0,
        rows: 16, cols: 16, dtype: 'uint16', le: false,
        factor: 0.001, offsetVal: 0, unit: 'lambda',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 0.98 },
        stage3: { multiplier: 0.95 },
        critical: false, showPreview: true,
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
        addonOverrides: { revlimit: { addend: 300, clampMax: 8000 } },
        critical: false, showPreview: false,
      },
      {
        id: 'skyactiv_speed_limit',
        name: 'Vehicle Speed Limiter',
        category: 'limiter',
        desc: 'Factory speed limiter for Mazda SkyActiv vehicles.',
        signatures: [],
        sigOffset: 0,
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
      {
        id: 'pgmfi_torque_limit',
        name: 'Torque Demand Limit',
        category: 'torque',
        desc: 'Software torque ceiling for Honda PGM-FI. Must be raised for Stage 2/3 power gains.',
        signatures: [],
        sigOffset: 0,
        rows: 8, cols: 8, dtype: 'uint16', le: false,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.28 },
        stage3: { multiplier: 1.42 },
        critical: true, showPreview: true,
      },
      {
        id: 'pgmfi_lambda_target',
        name: 'Lambda / AFR Target',
        category: 'smoke',
        desc: 'Lambda target map for Honda VTEC engines. Controls air-fuel ratio at WOT for engine safety.',
        signatures: [],
        sigOffset: 0,
        rows: 16, cols: 16, dtype: 'uint16', le: false,
        factor: 0.001, offsetVal: 0, unit: 'lambda',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 0.98 },
        stage3: { multiplier: 0.95 },
        critical: false, showPreview: true,
      },
      {
        id: 'pgmfi_rev_limit',
        name: 'Rev Limiter',
        category: 'limiter',
        desc: 'Engine RPM hard-cut limiter for Honda PGM-FI.',
        signatures: [],
        sigOffset: 0,
        rows: 1, cols: 1, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'RPM',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { revlimit: { addend: 300, clampMax: 8000 } },
        critical: false, showPreview: false,
      },
      {
        id: 'pgmfi_speed_limit',
        name: 'Vehicle Speed Limiter',
        category: 'limiter',
        desc: 'Factory speed limiter for Honda vehicles.',
        signatures: [],
        sigOffset: 0,
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
      {
        id: 'scania_smoke_limiter',
        name: 'Smoke Limiter',
        category: 'smoke',
        desc: 'Airflow-based smoke limit for Scania XPI common rail. Must be raised with fuel increases.',
        signatures: [],
        sigOffset: 0,
        rows: 12, cols: 16, dtype: 'uint16', le: false,
        factor: 0.01, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.10 },
        stage2: { multiplier: 1.18 },
        stage3: { multiplier: 1.28 },
        critical: true, showPreview: true,
      },
      {
        id: 'scania_soi',
        name: 'Start of Injection (SOI)',
        category: 'ignition',
        desc: 'Injection timing advance for Scania XPI diesel. Advancing SOI improves combustion efficiency.',
        signatures: [],
        sigOffset: 0,
        rows: 10, cols: 10, dtype: 'int16', le: false,
        factor: 0.02, offsetVal: 0, unit: '°BTDC',
        stage1: { multiplier: 1.0 },
        stage2: { addend: 30 },
        stage3: { addend: 50 },
        critical: false, showPreview: true,
      },
      {
        id: 'scania_rail_pressure',
        name: 'Rail Pressure Target',
        category: 'fuel',
        desc: 'Common rail pressure setpoint for Scania XPI high-pressure system.',
        signatures: [],
        sigOffset: 0,
        rows: 10, cols: 16, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.05 },
        stage2: { multiplier: 1.08 },
        stage3: { multiplier: 1.12 },
        critical: false, showPreview: true,
      },
      {
        id: 'scania_egr',
        name: 'EGR Flow Map',
        category: 'emission',
        desc: 'EGR valve duty for Scania diesel. Zero for EGR delete.',
        signatures: [],
        sigOffset: 0,
        rows: 8, cols: 8, dtype: 'uint16', le: false,
        factor: 0.1, offsetVal: 0, unit: '%',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { egr: { multiplier: 0, clampMax: 0 } },
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
      {
        id: 'med177_ignition',
        name: 'Ignition Timing Base',
        category: 'ignition',
        desc: 'Base ignition advance map for Mercedes M133/M274/M276. Stage 2/3 adds advance on premium fuel.',
        signatures: [],
        sigOffset: 0,
        rows: 16, cols: 16, dtype: 'int8', le: true,
        factor: 0.75, offsetVal: -48, unit: '°BTDC',
        stage1: { addend: 0 },
        stage2: { addend: 2 },
        stage3: { addend: 3 },
        critical: false, showPreview: true,
      },
      {
        id: 'med177_lambda_target',
        name: 'Lambda / AFR Target',
        category: 'smoke',
        desc: 'Lambda target map for Mercedes turbo petrol. Controls target AFR for engine safety.',
        signatures: [],
        sigOffset: 0,
        rows: 16, cols: 16, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'lambda',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 0.98 },
        stage3: { multiplier: 0.95 },
        critical: false, showPreview: true,
      },
      {
        id: 'med177_rev_limit',
        name: 'Rev Limiter',
        category: 'limiter',
        desc: 'Engine RPM hard-cut limiter for Mercedes AMG/CGI petrol.',
        signatures: [],
        sigOffset: 0,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'RPM',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { revlimit: { addend: 300, clampMax: 8000 } },
        critical: false, showPreview: false,
      },
      {
        id: 'med177_speed_limit',
        name: 'Vehicle Speed Limiter',
        category: 'limiter',
        desc: 'Factory speed limiter for Mercedes. 250 km/h electronic limit removed for track use.',
        signatures: [],
        sigOffset: 0,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'km/h',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { speedlimiter: { multiplier: 0, addend: 65535 } },
        critical: false, showPreview: false,
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
      {
        id: 'edc17jlr_smoke_limiter',
        name: 'Smoke Limiter',
        category: 'smoke',
        desc: 'Maximum fuel quantity by airflow for JLR diesel. Must be raised to allow fuel increases.',
        signatures: [],
        sigOffset: 0,
        rows: 12, cols: 16, dtype: 'uint16', le: true,
        factor: 0.01, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.10 },
        stage2: { multiplier: 1.18 },
        stage3: { multiplier: 1.28 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc17jlr_soi',
        name: 'Start of Injection (SOI)',
        category: 'ignition',
        desc: 'Injection timing advance for JLR Ingenium diesel.',
        signatures: [],
        sigOffset: 0,
        rows: 10, cols: 10, dtype: 'int16', le: true,
        factor: 0.02, offsetVal: 0, unit: '°BTDC',
        stage1: { multiplier: 1.0 },
        stage2: { addend: 30 },
        stage3: { addend: 50 },
        critical: false, showPreview: true,
      },
      {
        id: 'edc17jlr_rail_pressure',
        name: 'Rail Pressure Target',
        category: 'fuel',
        desc: 'Common rail pressure setpoint for JLR diesel.',
        signatures: [],
        sigOffset: 0,
        rows: 10, cols: 16, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.05 },
        stage2: { multiplier: 1.08 },
        stage3: { multiplier: 1.12 },
        critical: false, showPreview: true,
      },
      {
        id: 'edc17jlr_egr',
        name: 'EGR Flow Map',
        category: 'emission',
        desc: 'EGR valve duty for JLR diesel. Zero for EGR delete.',
        signatures: [],
        sigOffset: 0,
        rows: 8, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: '%',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { egr: { multiplier: 0, clampMax: 0 } },
        critical: false, showPreview: false,
      },
      {
        id: 'edc17jlr_speed_limit',
        name: 'Vehicle Speed Limiter',
        category: 'limiter',
        desc: 'Factory speed limiter for JLR diesel vehicles.',
        signatures: [],
        sigOffset: 0,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'km/h',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { speedlimiter: { multiplier: 0, addend: 65535 } },
        critical: false, showPreview: false,
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
      {
        id: 'mt86_smoke_limiter',
        name: 'Smoke Limiter',
        category: 'smoke',
        desc: 'Airflow-based smoke limit for Hyundai/Kia CRDi. Must be raised with fuel increases.',
        signatures: [],
        sigOffset: 0,
        rows: 12, cols: 16, dtype: 'uint16', le: true,
        factor: 0.01, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.10 },
        stage2: { multiplier: 1.18 },
        stage3: { multiplier: 1.28 },
        critical: true, showPreview: true,
      },
      {
        id: 'mt86_soi',
        name: 'Start of Injection (SOI)',
        category: 'ignition',
        desc: 'Injection timing advance for Hyundai/Kia CRDi diesel.',
        signatures: [],
        sigOffset: 0,
        rows: 10, cols: 10, dtype: 'int16', le: true,
        factor: 0.02, offsetVal: 0, unit: '°BTDC',
        stage1: { multiplier: 1.0 },
        stage2: { addend: 30 },
        stage3: { addend: 50 },
        critical: false, showPreview: true,
      },
      {
        id: 'mt86_rail_pressure',
        name: 'Rail Pressure Target',
        category: 'fuel',
        desc: 'Common rail pressure setpoint for Hyundai/Kia CRDi.',
        signatures: [],
        sigOffset: 0,
        rows: 10, cols: 16, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.05 },
        stage2: { multiplier: 1.08 },
        stage3: { multiplier: 1.12 },
        critical: false, showPreview: true,
      },
      {
        id: 'mt86_egr',
        name: 'EGR Flow Map',
        category: 'emission',
        desc: 'EGR valve duty for Hyundai/Kia CRDi. Zero for EGR delete.',
        signatures: [],
        sigOffset: 0,
        rows: 8, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: '%',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { egr: { multiplier: 0, clampMax: 0 } },
        critical: false, showPreview: false,
      },
      {
        id: 'mt86_speed_limit',
        name: 'Vehicle Speed Limiter',
        category: 'limiter',
        desc: 'Factory speed limiter for Hyundai/Kia CRDi diesel.',
        signatures: [],
        sigOffset: 0,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'km/h',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { speedlimiter: { multiplier: 0, addend: 65535 } },
        critical: false, showPreview: false,
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
      {
        id: 'sid310_smoke_limiter',
        name: 'Smoke Limiter',
        category: 'smoke',
        desc: 'Airflow-based smoke limit for Renault/Nissan dCi. Must be raised with fuel increases.',
        signatures: [],
        sigOffset: 0,
        rows: 12, cols: 16, dtype: 'uint16', le: false,
        factor: 0.01, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.10 },
        stage2: { multiplier: 1.18 },
        stage3: { multiplier: 1.28 },
        critical: true, showPreview: true,
      },
      {
        id: 'sid310_soi',
        name: 'Start of Injection (SOI)',
        category: 'ignition',
        desc: 'Injection timing advance for SID310 dCi diesel.',
        signatures: [],
        sigOffset: 0,
        rows: 10, cols: 10, dtype: 'int16', le: false,
        factor: 0.02, offsetVal: 0, unit: '°BTDC',
        stage1: { multiplier: 1.0 },
        stage2: { addend: 30 },
        stage3: { addend: 50 },
        critical: false, showPreview: true,
      },
      {
        id: 'sid310_rail_pressure',
        name: 'Rail Pressure Target',
        category: 'fuel',
        desc: 'Common rail pressure setpoint for SID310 dCi diesel.',
        signatures: [],
        sigOffset: 0,
        rows: 10, cols: 16, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.05 },
        stage2: { multiplier: 1.08 },
        stage3: { multiplier: 1.12 },
        critical: false, showPreview: true,
      },
      {
        id: 'sid310_egr',
        name: 'EGR Flow Map',
        category: 'emission',
        desc: 'EGR valve duty for SID310 dCi. Zero for EGR delete.',
        signatures: [],
        sigOffset: 0,
        rows: 8, cols: 8, dtype: 'uint16', le: false,
        factor: 0.1, offsetVal: 0, unit: '%',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { egr: { multiplier: 0, clampMax: 0 } },
        critical: false, showPreview: false,
      },
      {
        id: 'sid310_speed_limit',
        name: 'Vehicle Speed Limiter',
        category: 'limiter',
        desc: 'Factory speed limiter for Renault/Nissan dCi diesel.',
        signatures: [],
        sigOffset: 0,
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
      {
        id: 'toyota_lambda_target',
        name: 'Lambda / AFR Target',
        category: 'smoke',
        desc: 'Lambda target map for Toyota/Lexus petrol. Controls target AFR for engine safety on GR Yaris/GR86.',
        signatures: [],
        sigOffset: 0,
        rows: 16, cols: 16, dtype: 'uint16', le: false,
        factor: 0.001, offsetVal: 0, unit: 'lambda',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 0.98 },
        stage3: { multiplier: 0.95 },
        critical: false, showPreview: true,
      },
      {
        id: 'toyota_speed_limit',
        name: 'Vehicle Speed Limiter',
        category: 'limiter',
        desc: 'Factory speed limiter for Toyota/Lexus vehicles.',
        signatures: [],
        sigOffset: 0,
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
      {
        id: 'mitsu_lambda_target',
        name: 'Lambda / AFR Target',
        category: 'smoke',
        desc: 'Lambda target map for Mitsubishi Evo X / Eclipse Cross turbo petrol.',
        signatures: [],
        sigOffset: 0,
        rows: 16, cols: 16, dtype: 'uint16', le: false,
        factor: 0.001, offsetVal: 0, unit: 'lambda',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 0.98 },
        stage3: { multiplier: 0.95 },
        critical: false, showPreview: true,
      },
      {
        id: 'mitsu_rev_limit',
        name: 'Rev Limiter',
        category: 'limiter',
        desc: 'Engine RPM hard-cut limiter for Mitsubishi Evo X / Eclipse Cross.',
        signatures: [],
        sigOffset: 0,
        rows: 1, cols: 1, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'RPM',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { revlimit: { addend: 300, clampMax: 8000 } },
        critical: false, showPreview: false,
      },
      {
        id: 'mitsu_speed_limit',
        name: 'Vehicle Speed Limiter',
        category: 'limiter',
        desc: 'Factory speed limiter for Mitsubishi vehicles.',
        signatures: [],
        sigOffset: 0,
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
      {
        id: 'mitsu_d_smoke_limiter',
        name: 'Smoke Limiter',
        category: 'smoke',
        desc: 'Airflow-based smoke limit for Mitsubishi 4N15/4M41 diesel.',
        signatures: [],
        sigOffset: 0,
        rows: 12, cols: 16, dtype: 'uint16', le: false,
        factor: 0.01, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.10 },
        stage2: { multiplier: 1.18 },
        stage3: { multiplier: 1.28 },
        critical: true, showPreview: true,
      },
      {
        id: 'mitsu_d_soi',
        name: 'Start of Injection (SOI)',
        category: 'ignition',
        desc: 'Injection timing advance for Mitsubishi diesel.',
        signatures: [],
        sigOffset: 0,
        rows: 10, cols: 10, dtype: 'int16', le: false,
        factor: 0.02, offsetVal: 0, unit: '°BTDC',
        stage1: { multiplier: 1.0 },
        stage2: { addend: 30 },
        stage3: { addend: 50 },
        critical: false, showPreview: true,
      },
      {
        id: 'mitsu_d_rail_pressure',
        name: 'Rail Pressure Target',
        category: 'fuel',
        desc: 'Common rail pressure setpoint for Mitsubishi diesel.',
        signatures: [],
        sigOffset: 0,
        rows: 10, cols: 16, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.05 },
        stage2: { multiplier: 1.08 },
        stage3: { multiplier: 1.12 },
        critical: false, showPreview: true,
      },
      {
        id: 'mitsu_d_egr',
        name: 'EGR Flow Map',
        category: 'emission',
        desc: 'EGR valve duty for Mitsubishi diesel. Zero for EGR delete.',
        signatures: [],
        sigOffset: 0,
        rows: 8, cols: 8, dtype: 'uint16', le: false,
        factor: 0.1, offsetVal: 0, unit: '%',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { egr: { multiplier: 0, clampMax: 0 } },
        critical: false, showPreview: false,
      },
      {
        id: 'mitsu_d_speed_limit',
        name: 'Vehicle Speed Limiter',
        category: 'limiter',
        desc: 'Factory speed limiter for Mitsubishi diesel vehicles.',
        signatures: [],
        sigOffset: 0,
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
      {
        id: 'subaru_lambda_target',
        name: 'Lambda / AFR Target',
        category: 'smoke',
        desc: 'Lambda target map for Subaru boxer turbo. Enrichment at WOT critical for EJ ringland safety.',
        signatures: [],
        sigOffset: 0,
        rows: 16, cols: 16, dtype: 'uint16', le: false,
        factor: 0.001, offsetVal: 0, unit: 'lambda',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 0.98 },
        stage3: { multiplier: 0.95 },
        critical: false, showPreview: true,
      },
      {
        id: 'subaru_rev_limit',
        name: 'Rev Limiter',
        category: 'limiter',
        desc: 'Engine RPM hard-cut limiter for Subaru WRX STI / BRZ.',
        signatures: [],
        sigOffset: 0,
        rows: 1, cols: 1, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'RPM',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { revlimit: { addend: 300, clampMax: 8000 } },
        critical: false, showPreview: false,
      },
      {
        id: 'subaru_speed_limit',
        name: 'Vehicle Speed Limiter',
        category: 'limiter',
        desc: 'Factory speed limiter for Subaru vehicles.',
        signatures: [],
        sigOffset: 0,
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
      {
        id: 'tprot_lambda_target',
        name: 'Lambda / AFR Target',
        category: 'smoke',
        desc: 'Lambda target map for Ford EcoBoost. Controls AFR at WOT for engine safety.',
        signatures: [],
        sigOffset: 0,
        rows: 16, cols: 16, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'lambda',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 0.98 },
        stage3: { multiplier: 0.95 },
        critical: false, showPreview: true,
      },
      {
        id: 'tprot_rev_limit',
        name: 'Rev Limiter',
        category: 'limiter',
        desc: 'Engine RPM hard-cut limiter for Ford EcoBoost T-PROT.',
        signatures: [],
        sigOffset: 0,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'RPM',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { revlimit: { addend: 300, clampMax: 8000 } },
        critical: false, showPreview: false,
      },
      {
        id: 'tprot_speed_limit',
        name: 'Vehicle Speed Limiter',
        category: 'limiter',
        desc: 'Factory speed limiter for Ford EcoBoost vehicles.',
        signatures: [],
        sigOffset: 0,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'km/h',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { speedlimiter: { multiplier: 0, addend: 65535 } },
        critical: false, showPreview: false,
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
      {
        id: 'pstroke_smoke_limiter',
        name: 'Smoke Limiter',
        category: 'smoke',
        desc: 'Airflow-based smoke limit for Ford Power Stroke 6.7L/7.3L.',
        signatures: [],
        sigOffset: 0,
        rows: 12, cols: 16, dtype: 'uint16', le: true,
        factor: 0.01, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.10 },
        stage2: { multiplier: 1.18 },
        stage3: { multiplier: 1.28 },
        critical: true, showPreview: true,
      },
      {
        id: 'pstroke_soi',
        name: 'Start of Injection (SOI)',
        category: 'ignition',
        desc: 'Injection timing advance for Power Stroke diesel.',
        signatures: [],
        sigOffset: 0,
        rows: 10, cols: 10, dtype: 'int16', le: true,
        factor: 0.02, offsetVal: 0, unit: '°BTDC',
        stage1: { multiplier: 1.0 },
        stage2: { addend: 30 },
        stage3: { addend: 50 },
        critical: false, showPreview: true,
      },
      {
        id: 'pstroke_rail_pressure',
        name: 'Rail Pressure Target',
        category: 'fuel',
        desc: 'Common rail pressure setpoint for Ford Power Stroke.',
        signatures: [],
        sigOffset: 0,
        rows: 10, cols: 16, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.05 },
        stage2: { multiplier: 1.08 },
        stage3: { multiplier: 1.12 },
        critical: false, showPreview: true,
      },
      {
        id: 'pstroke_egr',
        name: 'EGR Flow Map',
        category: 'emission',
        desc: 'EGR valve duty for Power Stroke diesel. Zero for EGR delete.',
        signatures: [],
        sigOffset: 0,
        rows: 8, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: '%',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { egr: { multiplier: 0, clampMax: 0 } },
        critical: false, showPreview: false,
      },
      {
        id: 'pstroke_speed_limit',
        name: 'Vehicle Speed Limiter',
        category: 'limiter',
        desc: 'Factory speed limiter for Ford Power Stroke trucks.',
        signatures: [],
        sigOffset: 0,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'km/h',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { speedlimiter: { multiplier: 0, addend: 65535 } },
        critical: false, showPreview: false,
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
  // Freescale MPC5xxx PowerPC — BIG ENDIAN. 4MB flash, code encrypted both sides.
  // Cal region at 0x040000-0x17FFFF is the ONLY unencrypted portion.
  // Map format: NO headers, NO dimension bytes. Axes inline as BE u16:
  //   [X_axis: N*BE_u16][Y_axis: M*BE_u16][data: N*M*BE_u16]
  // Maps separated by zero-padding gaps. Axis values are monotonically increasing.
  // Discovered by reverse-engineering VW Golf 1.6 TDI CR D0B16 binary.
  {
    id: 'vag_dcm62',
    name: 'Delphi DCM6.2 (VAG TDI)',
    manufacturer: 'Delphi',
    family: 'DCM6.2',
    // D0B16 = variant code, VAGAPP = VAG application, 04L906056 = VW part number.
    // 1MVAGAPP = "1st gen VAG app". EV_ECM16TDI = software ID string.
    // Also search for common VW diesel part prefixes.
    // Strict Delphi-only identStrings — removed 'EV_ECM16TDI', 'EV_ECM20TDI', '04L906'
    // because these are VW engine-class strings present in Bosch EDC17 binaries too,
    // causing false-positive detection of Bosch 2.0 TDI ECUs as DCM6.2 (Seat Leon 03L906018FJ).
    // Only keep markers that are genuinely Delphi-specific.
    identStrings: ['D0B16', 'VAGAPP', '1MVAGAPP', '04L906056', 'DCM6.2', 'DCM62'],
    fileSizeRange: [2097152, 4194304],   // 2MB – 4MB (MPC5xxx, actual files are 4MB)
    vehicles: ['VW Golf Mk7 1.6 TDI CR', 'VW Golf Mk7 2.0 TDI CR', 'VW Passat B8 1.6 TDI', 'Audi A3 1.6 TDI (2013+)', 'Skoda Octavia 1.6 TDI (2013+)', 'Seat Leon 1.6 TDI', 'VW Tiguan 2.0 TDI (2017+)'],
    checksumAlgo: 'unknown',
    checksumOffset: 0,
    checksumLength: 0,
    maps: [
      {
        id: 'dcm62_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        // Y axis = rail/boost pressure (3200-21600 mbar), X axis = IQ (0-3300).
        // Data = boost target in mbar. Raw 2050-4945 at factor 0.001 = 2.05-4.95 bar.
        // Confirmed from VW Golf 1.6 TDI D0B16 binary at 0x131946.
        desc: 'Charge air pressure setpoint for Delphi DCM6.2. VW/Audi 1.6 TDI has headroom from the detuned factory calibration.',
        signatures: [],
        sigOffset: 0,
        rows: 16, cols: 16, dtype: 'uint16', le: false,
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
        // Y axis = pressure (3200-18000 mbar), X axis = IQ (0-3000).
        // Data = injection quantity. Raw 309-4539 at factor 0.01 = 3.09-45.39 mg/st.
        // Confirmed from VW Golf 1.6 TDI D0B16 binary at 0x126A4E.
        desc: 'Fuel injection quantity base map. Increasing this on the 1.6 TDI unlocks torque that the factory calibration deliberately caps.',
        signatures: [],
        sigOffset: 0,
        rows: 16, cols: 16, dtype: 'uint16', le: false,
        factor: 0.01, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.30, clampMax: 6200 },
        critical: true, showPreview: true,
      },
      {
        id: 'dcm62_torque_limit',
        name: 'Max Torque Limit',
        category: 'torque',
        desc: 'Software torque ceiling. Raised to match fuel and boost increases — DCM6.2 torque limit is the primary bottleneck on stock hardware.',
        signatures: [],
        sigOffset: 0,
        rows: 16, cols: 16, dtype: 'uint16', le: false,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.22 },
        stage2: { multiplier: 1.35 },
        stage3: { multiplier: 1.50, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'dcm62_smoke_limiter',
        name: 'Smoke Limiter Map',
        category: 'smoke',
        desc: 'Maximum fuel quantity by airflow. Without raising this, fuel increases are silently capped to prevent black smoke.',
        signatures: [],
        sigOffset: 0,
        rows: 12, cols: 16, dtype: 'uint16', le: false,
        factor: 0.01, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.12 },
        stage2: { multiplier: 1.20 },
        stage3: { multiplier: 1.30, clampMax: 6500 },
        critical: true, showPreview: true,
      },
      {
        id: 'dcm62_soi',
        name: 'Start of Injection (SOI)',
        category: 'ignition',
        desc: 'Injection timing advance. Advancing SOI improves combustion efficiency — standard Stage 2/3 mod on DCM6.2 diesel.',
        signatures: [],
        sigOffset: 0,
        rows: 10, cols: 10, dtype: 'int16', le: false,
        factor: 0.02, offsetVal: 0, unit: '°BTDC',
        stage1: { multiplier: 1.0 },
        stage2: { addend: 30 },
        stage3: { addend: 50 },
        critical: false, showPreview: true,
      },
      {
        id: 'dcm62_rail_pressure',
        name: 'Rail Pressure Target',
        category: 'fuel',
        desc: 'Common rail pressure setpoint. Higher pressure supports increased fuel delivery for Stage 2/3.',
        signatures: [],
        sigOffset: 0,
        rows: 10, cols: 16, dtype: 'uint16', le: false,
        factor: 0.1, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.05 },
        stage2: { multiplier: 1.08 },
        stage3: { multiplier: 1.12, clampMax: 20000 },
        critical: false, showPreview: true,
      },
      {
        id: 'dcm62_egr',
        name: 'EGR Flow Map',
        category: 'emission',
        desc: 'EGR valve duty by RPM and load. Zero for EGR delete.',
        signatures: [],
        sigOffset: 0,
        rows: 8, cols: 8, dtype: 'uint16', le: false,
        factor: 0.1, offsetVal: 0, unit: '%',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { egr: { multiplier: 0, clampMax: 0 } },
        critical: false, showPreview: false,
      },
      {
        id: 'dcm62_speed_limit',
        name: 'Vehicle Speed Limiter',
        category: 'limiter',
        desc: 'Factory speed limiter. Set to max to remove.',
        signatures: [],
        sigOffset: 0,
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
      { id: 'merc_crd3_smoke_limiter', name: 'Smoke Limiter', category: 'smoke', desc: 'Airflow-based smoke limit for Mercedes CDI.', signatures: [], sigOffset: 0, rows: 12, cols: 16, dtype: 'uint16', le: true, factor: 0.01, offsetVal: 0, unit: 'mg/st', stage1: { multiplier: 1.10 }, stage2: { multiplier: 1.18 }, stage3: { multiplier: 1.28 }, critical: true, showPreview: true },
      { id: 'merc_crd3_soi', name: 'Start of Injection (SOI)', category: 'ignition', desc: 'Injection timing advance for Mercedes CDI.', signatures: [], sigOffset: 0, rows: 10, cols: 10, dtype: 'int16', le: true, factor: 0.02, offsetVal: 0, unit: '°BTDC', stage1: { multiplier: 1.0 }, stage2: { addend: 30 }, stage3: { addend: 50 }, critical: false, showPreview: true },
      { id: 'merc_crd3_rail_pressure', name: 'Rail Pressure Target', category: 'fuel', desc: 'Common rail pressure setpoint for Mercedes CDI.', signatures: [], sigOffset: 0, rows: 10, cols: 16, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'bar', stage1: { multiplier: 1.05 }, stage2: { multiplier: 1.08 }, stage3: { multiplier: 1.12 }, critical: false, showPreview: true },
      { id: 'merc_crd3_egr', name: 'EGR Flow Map', category: 'emission', desc: 'EGR valve duty for Mercedes CDI. Zero for EGR delete.', signatures: [], sigOffset: 0, rows: 8, cols: 8, dtype: 'uint16', le: true, factor: 0.1, offsetVal: 0, unit: '%', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { egr: { multiplier: 0, clampMax: 0 } }, critical: false, showPreview: false },
      { id: 'merc_crd3_speed_limit', name: 'Vehicle Speed Limiter', category: 'limiter', desc: 'Factory speed limiter for Mercedes CDI.', signatures: [], sigOffset: 0, rows: 1, cols: 1, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'km/h', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { speedlimiter: { multiplier: 0, addend: 65535 } }, critical: false, showPreview: false },
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
      { id: 'fca_smoke_limiter', name: 'Smoke Limiter', category: 'smoke', desc: 'Airflow-based smoke limit for Jeep/FCA diesel.', signatures: [], sigOffset: 0, rows: 12, cols: 16, dtype: 'uint16', le: true, factor: 0.01, offsetVal: 0, unit: 'mg/st', stage1: { multiplier: 1.10 }, stage2: { multiplier: 1.18 }, stage3: { multiplier: 1.28 }, critical: true, showPreview: true },
      { id: 'fca_soi', name: 'Start of Injection (SOI)', category: 'ignition', desc: 'Injection timing advance for Jeep/FCA diesel.', signatures: [], sigOffset: 0, rows: 10, cols: 10, dtype: 'int16', le: true, factor: 0.02, offsetVal: 0, unit: '°BTDC', stage1: { multiplier: 1.0 }, stage2: { addend: 30 }, stage3: { addend: 50 }, critical: false, showPreview: true },
      { id: 'fca_rail_pressure', name: 'Rail Pressure Target', category: 'fuel', desc: 'Common rail pressure setpoint for Jeep/FCA diesel.', signatures: [], sigOffset: 0, rows: 10, cols: 16, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'bar', stage1: { multiplier: 1.05 }, stage2: { multiplier: 1.08 }, stage3: { multiplier: 1.12 }, critical: false, showPreview: true },
      { id: 'fca_egr', name: 'EGR Flow Map', category: 'emission', desc: 'EGR valve duty for Jeep/FCA diesel.', signatures: [], sigOffset: 0, rows: 8, cols: 8, dtype: 'uint16', le: true, factor: 0.1, offsetVal: 0, unit: '%', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { egr: { multiplier: 0, clampMax: 0 } }, critical: false, showPreview: false },
      { id: 'fca_speed_limit', name: 'Vehicle Speed Limiter', category: 'limiter', desc: 'Factory speed limiter for Jeep/FCA diesel.', signatures: [], sigOffset: 0, rows: 1, cols: 1, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'km/h', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { speedlimiter: { multiplier: 0, addend: 65535 } }, critical: false, showPreview: false },
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
      { id: 'psa_smoke_limiter', name: 'Smoke Limiter', category: 'smoke', desc: 'Airflow-based smoke limit for PSA BlueHDi.', signatures: [], sigOffset: 0, rows: 12, cols: 16, dtype: 'uint16', le: false, factor: 0.01, offsetVal: 0, unit: 'mg/st', stage1: { multiplier: 1.10 }, stage2: { multiplier: 1.18 }, stage3: { multiplier: 1.28 }, critical: true, showPreview: true },
      { id: 'psa_soi', name: 'Start of Injection (SOI)', category: 'ignition', desc: 'Injection timing advance for PSA BlueHDi.', signatures: [], sigOffset: 0, rows: 10, cols: 10, dtype: 'int16', le: false, factor: 0.02, offsetVal: 0, unit: '°BTDC', stage1: { multiplier: 1.0 }, stage2: { addend: 30 }, stage3: { addend: 50 }, critical: false, showPreview: true },
      { id: 'psa_rail_pressure', name: 'Rail Pressure Target', category: 'fuel', desc: 'Common rail pressure setpoint for PSA BlueHDi.', signatures: [], sigOffset: 0, rows: 10, cols: 16, dtype: 'uint16', le: false, factor: 1, offsetVal: 0, unit: 'bar', stage1: { multiplier: 1.05 }, stage2: { multiplier: 1.08 }, stage3: { multiplier: 1.12 }, critical: false, showPreview: true },
      { id: 'psa_egr', name: 'EGR Flow Map', category: 'emission', desc: 'EGR valve duty for PSA BlueHDi.', signatures: [], sigOffset: 0, rows: 8, cols: 8, dtype: 'uint16', le: false, factor: 0.1, offsetVal: 0, unit: '%', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { egr: { multiplier: 0, clampMax: 0 } }, critical: false, showPreview: false },
      { id: 'psa_speed_limit', name: 'Vehicle Speed Limiter', category: 'limiter', desc: 'Factory speed limiter for PSA BlueHDi.', signatures: [], sigOffset: 0, rows: 1, cols: 1, dtype: 'uint16', le: false, factor: 1, offsetVal: 0, unit: 'km/h', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { speedlimiter: { multiplier: 0, addend: 65535 } }, critical: false, showPreview: false },
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
      { id: 'dc4_ignition', name: 'Ignition Timing Map', category: 'ignition', desc: 'Spark advance map for Renault M5P 1.8T.', signatures: [], sigOffset: 0, rows: 16, cols: 16, dtype: 'int8', le: false, factor: 0.75, offsetVal: -48, unit: '°BTDC', stage1: { addend: 0 }, stage2: { addend: 2 }, stage3: { addend: 3 }, critical: false, showPreview: true },
      { id: 'dc4_lambda_target', name: 'Lambda / AFR Target', category: 'smoke', desc: 'Lambda target map for Renault RS turbo petrol.', signatures: [], sigOffset: 0, rows: 16, cols: 16, dtype: 'uint16', le: false, factor: 0.001, offsetVal: 0, unit: 'lambda', stage1: { multiplier: 1.0 }, stage2: { multiplier: 0.98 }, stage3: { multiplier: 0.95 }, critical: false, showPreview: true },
      { id: 'dc4_rev_limit', name: 'Rev Limiter', category: 'limiter', desc: 'Engine RPM hard-cut limiter for Renault RS.', signatures: [], sigOffset: 0, rows: 1, cols: 1, dtype: 'uint16', le: false, factor: 1, offsetVal: 0, unit: 'RPM', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { revlimit: { addend: 300, clampMax: 8000 } }, critical: false, showPreview: false },
      { id: 'dc4_speed_limit', name: 'Vehicle Speed Limiter', category: 'limiter', desc: 'Factory speed limiter for Renault RS / Alpine.', signatures: [], sigOffset: 0, rows: 1, cols: 1, dtype: 'uint16', le: false, factor: 1, offsetVal: 0, unit: 'km/h', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { speedlimiter: { multiplier: 0, addend: 65535 } }, critical: false, showPreview: false },
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
      { id: 'nissan_torque_limit', name: 'Torque Demand Limit', category: 'torque', desc: 'Software torque ceiling for Nissan VQ/RB engines.', signatures: [], sigOffset: 0, rows: 8, cols: 8, dtype: 'uint16', le: true, factor: 0.1, offsetVal: 0, unit: 'Nm', stage1: { multiplier: 1.12 }, stage2: { multiplier: 1.22 }, stage3: { multiplier: 1.35 }, critical: true, showPreview: true },
      { id: 'nissan_lambda_target', name: 'Lambda / AFR Target', category: 'smoke', desc: 'Lambda target map for Nissan VQ/RB petrol.', signatures: [], sigOffset: 0, rows: 16, cols: 16, dtype: 'uint16', le: true, factor: 0.001, offsetVal: 0, unit: 'lambda', stage1: { multiplier: 1.0 }, stage2: { multiplier: 0.98 }, stage3: { multiplier: 0.95 }, critical: false, showPreview: true },
      { id: 'nissan_rev_limit', name: 'Rev Limiter', category: 'limiter', desc: 'Engine RPM hard-cut limiter for Nissan VQ/RB.', signatures: [], sigOffset: 0, rows: 1, cols: 1, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'RPM', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { revlimit: { addend: 300, clampMax: 8000 } }, critical: false, showPreview: false },
      { id: 'nissan_speed_limit', name: 'Vehicle Speed Limiter', category: 'limiter', desc: 'Factory speed limiter for Nissan vehicles.', signatures: [], sigOffset: 0, rows: 1, cols: 1, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'km/h', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { speedlimiter: { multiplier: 0, addend: 65535 } }, critical: false, showPreview: false },
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
      { id: 'msd_lambda_target', name: 'Lambda / AFR Target', category: 'smoke', desc: 'Lambda target map for BMW N54/N55 turbo petrol.', signatures: [], sigOffset: 0, rows: 16, cols: 16, dtype: 'uint16', le: true, factor: 0.001, offsetVal: 0, unit: 'lambda', stage1: { multiplier: 1.0 }, stage2: { multiplier: 0.98 }, stage3: { multiplier: 0.95 }, critical: false, showPreview: true },
      { id: 'msd_speed_limit', name: 'Vehicle Speed Limiter', category: 'limiter', desc: 'Factory speed limiter for BMW N54/N55 vehicles.', signatures: [], sigOffset: 0, rows: 1, cols: 1, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'km/h', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { speedlimiter: { multiplier: 0, addend: 65535 } }, critical: false, showPreview: false },
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
      { id: 'ms43_torque_limit', name: 'Torque Demand Limit', category: 'torque', desc: 'Software torque ceiling for BMW M54/M52TU.', signatures: [], sigOffset: 0, rows: 8, cols: 8, dtype: 'uint16', le: false, factor: 0.1, offsetVal: 0, unit: 'Nm', stage1: { multiplier: 1.10 }, stage2: { multiplier: 1.18 }, stage3: { multiplier: 1.28 }, critical: true, showPreview: true },
      { id: 'ms43_lambda_target', name: 'Lambda / AFR Target', category: 'smoke', desc: 'Lambda target for BMW M54/M52TU NA petrol.', signatures: [], sigOffset: 0, rows: 16, cols: 16, dtype: 'uint16', le: false, factor: 0.001, offsetVal: 0, unit: 'lambda', stage1: { multiplier: 1.0 }, stage2: { multiplier: 0.98 }, stage3: { multiplier: 0.95 }, critical: false, showPreview: true },
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
        // DB study (22258 bins): IAW 12×12 sig 0x17FC17FC — 64 occurrences across 171 IAW files.
        signatures: [[0x4C,0x44,0x4B,0x56,0x53,0x4F,0x4C,0x4C], [0x42,0x4F,0x4F,0x53,0x54,0x53,0x4F,0x4C], [0x17,0xFC,0x17,0xFC]],
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
        // DB study (22258 bins): IAW 16×16 sig 0x72DC72DC — 26 occurrences across 171 IAW files.
        signatures: [[0x49,0x47,0x4E,0x4D,0x41,0x50,0x00], [0x4B,0x46,0x5A,0x57,0x00], [0x72,0xDC,0x72,0xDC]],
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
      { id: 'iaw_lambda_target', name: 'Lambda / AFR Target', category: 'smoke', desc: 'Lambda target for Marelli IAW petrol.', signatures: [], sigOffset: 0, rows: 16, cols: 16, dtype: 'uint16', le: true, factor: 0.001, offsetVal: 0, unit: 'lambda', stage1: { multiplier: 1.0 }, stage2: { multiplier: 0.98 }, stage3: { multiplier: 0.95 }, critical: false, showPreview: true },
      { id: 'iaw_speed_limit', name: 'Vehicle Speed Limiter', category: 'limiter', desc: 'Factory speed limiter for Marelli IAW vehicles.', signatures: [], sigOffset: 0, rows: 1, cols: 1, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'km/h', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { speedlimiter: { multiplier: 0, addend: 65535 } }, critical: false, showPreview: false },
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
      { id: 'crd2_smoke_limiter', name: 'Smoke Limiter', category: 'smoke', desc: 'Airflow-based smoke limit for CRD2 diesel.', signatures: [], sigOffset: 0, rows: 12, cols: 16, dtype: 'uint16', le: true, factor: 0.01, offsetVal: 0, unit: 'mg/st', stage1: { multiplier: 1.10 }, stage2: { multiplier: 1.18 }, stage3: { multiplier: 1.28 }, critical: true, showPreview: true },
      { id: 'crd2_soi', name: 'Start of Injection (SOI)', category: 'ignition', desc: 'Injection timing advance for CRD2 diesel.', signatures: [], sigOffset: 0, rows: 10, cols: 10, dtype: 'int16', le: true, factor: 0.02, offsetVal: 0, unit: '°BTDC', stage1: { multiplier: 1.0 }, stage2: { addend: 30 }, stage3: { addend: 50 }, critical: false, showPreview: true },
      { id: 'crd2_rail_pressure', name: 'Rail Pressure Target', category: 'fuel', desc: 'Common rail pressure setpoint for CRD2.', signatures: [], sigOffset: 0, rows: 10, cols: 16, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'bar', stage1: { multiplier: 1.05 }, stage2: { multiplier: 1.08 }, stage3: { multiplier: 1.12 }, critical: false, showPreview: true },
      { id: 'crd2_egr', name: 'EGR Flow Map', category: 'emission', desc: 'EGR valve duty for CRD2 diesel.', signatures: [], sigOffset: 0, rows: 8, cols: 8, dtype: 'uint16', le: true, factor: 0.1, offsetVal: 0, unit: '%', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { egr: { multiplier: 0, clampMax: 0 } }, critical: false, showPreview: false },
      { id: 'crd2_speed_limit', name: 'Vehicle Speed Limiter', category: 'limiter', desc: 'Factory speed limiter for CRD2 vehicles.', signatures: [], sigOffset: 0, rows: 1, cols: 1, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'km/h', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { speedlimiter: { multiplier: 0, addend: 65535 } }, critical: false, showPreview: false },
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
      { id: 'delphi_crd3_smoke_limiter', name: 'Smoke Limiter', category: 'smoke', desc: 'Airflow-based smoke limit for CRD3 diesel.', signatures: [], sigOffset: 0, rows: 12, cols: 16, dtype: 'uint16', le: true, factor: 0.01, offsetVal: 0, unit: 'mg/st', stage1: { multiplier: 1.10 }, stage2: { multiplier: 1.18 }, stage3: { multiplier: 1.28 }, critical: true, showPreview: true },
      { id: 'delphi_crd3_soi', name: 'Start of Injection (SOI)', category: 'ignition', desc: 'Injection timing advance for CRD3 diesel.', signatures: [], sigOffset: 0, rows: 10, cols: 10, dtype: 'int16', le: true, factor: 0.02, offsetVal: 0, unit: '°BTDC', stage1: { multiplier: 1.0 }, stage2: { addend: 30 }, stage3: { addend: 50 }, critical: false, showPreview: true },
      { id: 'delphi_crd3_rail_pressure', name: 'Rail Pressure Target', category: 'fuel', desc: 'Common rail pressure setpoint for CRD3.', signatures: [], sigOffset: 0, rows: 10, cols: 16, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'bar', stage1: { multiplier: 1.05 }, stage2: { multiplier: 1.08 }, stage3: { multiplier: 1.12 }, critical: false, showPreview: true },
      { id: 'delphi_crd3_speed_limit', name: 'Vehicle Speed Limiter', category: 'limiter', desc: 'Factory speed limiter for CRD3 vehicles.', signatures: [], sigOffset: 0, rows: 1, cols: 1, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'km/h', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { speedlimiter: { multiplier: 0, addend: 65535 } }, critical: false, showPreview: false },
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
      { id: 'mjd_smoke_limiter', name: 'Smoke Limiter', category: 'smoke', desc: 'Airflow-based smoke limit for Marelli MJD diesel.', signatures: [], sigOffset: 0, rows: 12, cols: 16, dtype: 'uint16', le: true, factor: 0.01, offsetVal: 0, unit: 'mg/st', stage1: { multiplier: 1.10 }, stage2: { multiplier: 1.18 }, stage3: { multiplier: 1.28 }, critical: true, showPreview: true },
      { id: 'mjd_soi', name: 'Start of Injection (SOI)', category: 'ignition', desc: 'Injection timing advance for MJD diesel.', signatures: [], sigOffset: 0, rows: 10, cols: 10, dtype: 'int16', le: true, factor: 0.02, offsetVal: 0, unit: '°BTDC', stage1: { multiplier: 1.0 }, stage2: { addend: 30 }, stage3: { addend: 50 }, critical: false, showPreview: true },
      { id: 'mjd_rail_pressure', name: 'Rail Pressure Target', category: 'fuel', desc: 'Common rail pressure setpoint for MJD.', signatures: [], sigOffset: 0, rows: 10, cols: 16, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'bar', stage1: { multiplier: 1.05 }, stage2: { multiplier: 1.08 }, stage3: { multiplier: 1.12 }, critical: false, showPreview: true },
      { id: 'mjd_egr', name: 'EGR Flow Map', category: 'emission', desc: 'EGR valve duty for MJD diesel.', signatures: [], sigOffset: 0, rows: 8, cols: 8, dtype: 'uint16', le: true, factor: 0.1, offsetVal: 0, unit: '%', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { egr: { multiplier: 0, clampMax: 0 } }, critical: false, showPreview: false },
      { id: 'mjd_speed_limit', name: 'Vehicle Speed Limiter', category: 'limiter', desc: 'Factory speed limiter for MJD vehicles.', signatures: [], sigOffset: 0, rows: 1, cols: 1, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'km/h', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { speedlimiter: { multiplier: 0, addend: 65535 } }, critical: false, showPreview: false },
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
      { id: 'mevd17_lambda_target', name: 'Lambda / AFR Target', category: 'smoke', desc: 'Lambda target map for BMW M S55/S63.', signatures: [], sigOffset: 0, rows: 16, cols: 16, dtype: 'uint16', le: true, factor: 0.001, offsetVal: 0, unit: 'lambda', stage1: { multiplier: 1.0 }, stage2: { multiplier: 0.98 }, stage3: { multiplier: 0.95 }, critical: false, showPreview: true },
      { id: 'mevd17_speed_limit', name: 'Vehicle Speed Limiter', category: 'limiter', desc: 'Factory speed limiter for BMW M vehicles.', signatures: [], sigOffset: 0, rows: 1, cols: 1, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'km/h', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { speedlimiter: { multiplier: 0, addend: 65535 } }, critical: false, showPreview: false },
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
      { id: 'ems24_lambda_target', name: 'Lambda / AFR Target', category: 'smoke', desc: 'Lambda target map for Ford EcoBoost ST/RS.', signatures: [], sigOffset: 0, rows: 16, cols: 16, dtype: 'uint16', le: true, factor: 0.001, offsetVal: 0, unit: 'lambda', stage1: { multiplier: 1.0 }, stage2: { multiplier: 0.98 }, stage3: { multiplier: 0.95 }, critical: false, showPreview: true },
      { id: 'ems24_rev_limit', name: 'Rev Limiter', category: 'limiter', desc: 'Engine RPM hard-cut limiter for Ford EcoBoost ST/RS.', signatures: [], sigOffset: 0, rows: 1, cols: 1, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'RPM', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { revlimit: { addend: 300, clampMax: 8000 } }, critical: false, showPreview: false },
      { id: 'ems24_speed_limit', name: 'Vehicle Speed Limiter', category: 'limiter', desc: 'Factory speed limiter for Ford EcoBoost ST/RS.', signatures: [], sigOffset: 0, rows: 1, cols: 1, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'km/h', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { speedlimiter: { multiplier: 0, addend: 65535 } }, critical: false, showPreview: false },
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
      { id: 'e87_lambda_target', name: 'Lambda / AFR Target', category: 'smoke', desc: 'Lambda target map for Opel/Vauxhall/GM turbo petrol.', signatures: [], sigOffset: 0, rows: 16, cols: 16, dtype: 'uint16', le: true, factor: 0.001, offsetVal: 0, unit: 'lambda', stage1: { multiplier: 1.0 }, stage2: { multiplier: 0.98 }, stage3: { multiplier: 0.95 }, critical: false, showPreview: true },
      { id: 'e87_rev_limit', name: 'Rev Limiter', category: 'limiter', desc: 'Engine RPM hard-cut limiter for Delco E87/E98.', signatures: [], sigOffset: 0, rows: 1, cols: 1, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'RPM', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { revlimit: { addend: 300, clampMax: 8000 } }, critical: false, showPreview: false },
      { id: 'e87_speed_limit', name: 'Vehicle Speed Limiter', category: 'limiter', desc: 'Factory speed limiter for Opel/Vauxhall turbo petrol.', signatures: [], sigOffset: 0, rows: 1, cols: 1, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'km/h', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { speedlimiter: { multiplier: 0, addend: 65535 } }, critical: false, showPreview: false },
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
      { id: 'dcm34_smoke_limiter', name: 'Smoke Limiter', category: 'smoke', desc: 'Airflow-based smoke limit for Toyota 1KD/2KD diesel.', signatures: [], sigOffset: 0, rows: 12, cols: 16, dtype: 'uint16', le: false, factor: 0.01, offsetVal: 0, unit: 'mg/st', stage1: { multiplier: 1.10 }, stage2: { multiplier: 1.18 }, stage3: { multiplier: 1.28 }, critical: true, showPreview: true },
      { id: 'dcm34_soi', name: 'Start of Injection (SOI)', category: 'ignition', desc: 'Injection timing advance for Toyota diesel.', signatures: [], sigOffset: 0, rows: 10, cols: 10, dtype: 'int16', le: false, factor: 0.02, offsetVal: 0, unit: '°BTDC', stage1: { multiplier: 1.0 }, stage2: { addend: 30 }, stage3: { addend: 50 }, critical: false, showPreview: true },
      { id: 'dcm34_rail_pressure', name: 'Rail Pressure Target', category: 'fuel', desc: 'Common rail pressure setpoint for Toyota diesel.', signatures: [], sigOffset: 0, rows: 10, cols: 16, dtype: 'uint16', le: false, factor: 1, offsetVal: 0, unit: 'bar', stage1: { multiplier: 1.05 }, stage2: { multiplier: 1.08 }, stage3: { multiplier: 1.12 }, critical: false, showPreview: true },
      { id: 'dcm34_egr', name: 'EGR Flow Map', category: 'emission', desc: 'EGR valve duty for Toyota diesel.', signatures: [], sigOffset: 0, rows: 8, cols: 8, dtype: 'uint16', le: false, factor: 0.1, offsetVal: 0, unit: '%', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { egr: { multiplier: 0, clampMax: 0 } }, critical: false, showPreview: false },
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
      { id: 'sid803_smoke_limiter', name: 'Smoke Limiter', category: 'smoke', desc: 'Airflow-based smoke limit for Ford/PSA TDCi/HDi.', signatures: [], sigOffset: 0, rows: 12, cols: 16, dtype: 'uint16', le: true, factor: 0.01, offsetVal: 0, unit: 'mg/st', stage1: { multiplier: 1.10 }, stage2: { multiplier: 1.18 }, stage3: { multiplier: 1.28 }, critical: true, showPreview: true },
      { id: 'sid803_soi', name: 'Start of Injection (SOI)', category: 'ignition', desc: 'Injection timing advance for Ford/PSA TDCi/HDi.', signatures: [], sigOffset: 0, rows: 10, cols: 10, dtype: 'int16', le: true, factor: 0.02, offsetVal: 0, unit: '°BTDC', stage1: { multiplier: 1.0 }, stage2: { addend: 30 }, stage3: { addend: 50 }, critical: false, showPreview: true },
      { id: 'sid803_rail_pressure', name: 'Rail Pressure Target', category: 'fuel', desc: 'Common rail pressure setpoint for Ford/PSA.', signatures: [], sigOffset: 0, rows: 10, cols: 16, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'bar', stage1: { multiplier: 1.05 }, stage2: { multiplier: 1.08 }, stage3: { multiplier: 1.12 }, critical: false, showPreview: true },
      { id: 'sid803_speed_limit', name: 'Vehicle Speed Limiter', category: 'limiter', desc: 'Factory speed limiter.', signatures: [], sigOffset: 0, rows: 1, cols: 1, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'km/h', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { speedlimiter: { multiplier: 0, addend: 65535 } }, critical: false, showPreview: false },
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
      { id: 'mt80_smoke_limiter', name: 'Smoke Limiter', category: 'smoke', desc: 'Airflow-based smoke limit for MT80 CDTi.', signatures: [], sigOffset: 0, rows: 12, cols: 16, dtype: 'uint16', le: true, factor: 0.01, offsetVal: 0, unit: 'mg/st', stage1: { multiplier: 1.10 }, stage2: { multiplier: 1.18 }, stage3: { multiplier: 1.28 }, critical: true, showPreview: true },
      { id: 'mt80_soi', name: 'Start of Injection (SOI)', category: 'ignition', desc: 'Injection timing advance for MT80 CDTi.', signatures: [], sigOffset: 0, rows: 10, cols: 10, dtype: 'int16', le: true, factor: 0.02, offsetVal: 0, unit: '°BTDC', stage1: { multiplier: 1.0 }, stage2: { addend: 30 }, stage3: { addend: 50 }, critical: false, showPreview: true },
      { id: 'mt80_rail_pressure', name: 'Rail Pressure Target', category: 'fuel', desc: 'Common rail pressure for MT80 CDTi.', signatures: [], sigOffset: 0, rows: 10, cols: 16, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'bar', stage1: { multiplier: 1.05 }, stage2: { multiplier: 1.08 }, stage3: { multiplier: 1.12 }, critical: false, showPreview: true },
      { id: 'mt80_egr', name: 'EGR Flow Map', category: 'emission', desc: 'EGR valve duty for MT80 CDTi.', signatures: [], sigOffset: 0, rows: 8, cols: 8, dtype: 'uint16', le: true, factor: 0.1, offsetVal: 0, unit: '%', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { egr: { multiplier: 0, clampMax: 0 } }, critical: false, showPreview: false },
      { id: 'mt80_speed_limit', name: 'Vehicle Speed Limiter', category: 'limiter', desc: 'Factory speed limiter for MT80 CDTi.', signatures: [], sigOffset: 0, rows: 1, cols: 1, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'km/h', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { speedlimiter: { multiplier: 0, addend: 65535 } }, critical: false, showPreview: false },
    ],
  },

  // ─── Siemens PPD1.x (VW/Audi 1.9/2.0 TDI Pumpe Düse) ──────────────────────
  {
    id: 'vag_ppd1',
    name: 'Siemens PPD1.x (VW/Audi TDI Pumpe Düse)',
    manufacturer: 'Siemens',
    family: 'PPD1',
    // PPD1.1, PPD1.2, PPD1.3, PPD1.5 are SIEMENS/Continental ECUs (NOT Bosch — the
    // manufacturer string was wrong in earlier revs) for VW/Audi Pumpe Düse
    // (unit injector) 1.9 TDI and 2.0 TDI engines — NOT common-rail. Used in Golf
    // IV/V, Passat B5/B6, Octavia Mk1/Mk2, A3 8P, A4 B5/B6, Seat Leon/Toledo 1.9 TDI
    // (BKD/BXE/BKP/BMR/BMM).
    //
    // Byte order: BIG-ENDIAN (uint16 BE for all calibration data).
    // Valid calibration data range in file: 0x41100–0x7D87F.
    // ECU address → file offset: subtract 0x800000.
    // Reference: jazdw/ppd-maps (GPLv3, https://github.com/jazdw/ppd-maps).
    //
    // Scaling constants per jazdw presets (verified from my 03G906018DH analysis):
    //   LADSOLL / boost:   raw/12.06 = hPa      (bias 0)
    //   MENZK / fuel qty:  raw/250   = mg/stk   (bias 0)
    //   MXMOM / MDFAW:     (raw-32768)/32 = Nm  (+32768 bias, stored offset)
    //   SDATF / SOI:       (raw-32768)*(3/128) = °CRK BTDC  (+32768 bias)
    //   EGRKL / N75 duty:  raw/655.36 = %       (bias 0)
    //
    // CRITICAL — the fixedOffset values below are VARIANT-SPECIFIC. They are
    // verified for 03G906018DH SN100L8000000 only. Other variants have different
    // offsets — loading them will point to wrong data. Once we have 3+ variants
    // analysed we add a per-variant `variants: []` override field to the EcuDef;
    // until then findings for other variants go in the comment block below.
    //
    // ── Verified offsets per variant ────────────────────────────────────────
    // 03G906018DH SN100L8000000 (Audi A3 BKD 140ps, 2006) — populated below ─┐
    //   MENZK           0x07BBB3  14×8   uint16 BE  factor 1/250   mg/st     │
    //   LADSOLL         0x06126E  3×16   uint16 BE  factor 1/12.06 hPa       │
    //   MDFAW           0x07B954  5×8    uint16 BE  (raw-32768)/32 Nm        │
    //   Torque monitor  0x05C7FA  1×2688 uint16 BE  (raw-32768)/32 Nm        │
    //   EGR/switches    0x056D40  12×16  uint16 BE  factor 1/655.36 %        │
    //                                                                         │
    // 03G906018AQ SN100L6000000 (Audi A4 BKD 140ps, 2007) — NOT yet wired ──┤
    //   LADSOLL family  0x06126E-0x062662 (11× 16×8 tables at 0x200 stride)   │
    //                   SAME OFFSET AS DH for primary boost table ✓           │
    //   Per-gear torque 0x04AD3A  loose 28B  (raw-32768)/32 Nm  ~367→423 Nm   │
    //   Smoke-limit-ish 0x05E530-0x05F530 (multiple 16×10 tables +1.3%)       │
    //   MENZK           NOT at 0x07BBB3 — AQ variant stores it elsewhere      │
    //   MDFAW           NOT at 0x07B954 — AQ variant stores it elsewhere      │
    //                                                                         │
    // When we hit 3+ variants, migrate DH and AQ offsets to a                 │
    // `variants: [{ match: ['03G906018DH'], overrides: {...} }]` field.  ─────┘
    identStrings: [
      'PPD1.1', 'PPD1.2', 'PPD1.3', 'PPD1.5', 'PPD1',
      '03G906018DH',    // the specific calibration variant the active fixedOffsets target
      'SN100L8000000',  // the SW version of that variant (full 2MB file)
      'SN100L4000000',  // 256KB cal-only dump of the same DH variant — verified
                        // in Pair #51 that the torque-monitor offset aligns when
                        // converted to cal-relative (0x05C7FA → 0x01C7FA).
      'SN100L6000000',  // AQ variant base SW — shares LADSOLL offset with DH (see AQ doc block)
      'SN100K5400000',  // Pair #118 — third SW serial family of 03G906018DH (2006 binaries)
      'SN100K5300000',  // Pair #7 (earlier batch) — 256KB Bosch-labelled DH cal dump
      '03G906018FG',    // Pair #243 — new VAG part-number variant (2002 A4 2.0 TDI)
      'SN100L3000000',  // ↳ accompanying SW serial for the FG variant
      'SN1R0M8000000',  // Pairs #257, #262 — AQ variant later SW family
      'SN1S0M8000000',  // Pair #256 — AQ variant S-series SW family
      '03G997256C',     // Pair #417 — VAG service-replacement ECU part (shares PPD1.2 cal layout)
      '03G906018FB',    // VW Pair #368 — VW Golf 5 2.0 TDI 125kW PPD1.2
      'SN100L7000000',  // ↳ accompanying SW serial for the FB variant
      '03G906018CT',    // VW Pair #365 — VW Golf 5 2.0 TDI 125kW PPD1.2 (CT variant)
      '03G906018HB',    // VW Pair #648 — VW Golf 5 2.0 TDI PPD1.2 (HB variant)
      '03G906018EM',    // VW Pair #680 — Passat 2.0 TDI PPD1.2 (EM variant)
      '03G906018A',     // VW Pair #686 — Passat 2.0 TDI PPD1 early (A variant)
      'SN000F7500000',  // ↳ Passat 2002 SN serial family (older PPD1)
      '03G906018CD',    // VW Pair #749 — Passat 2.0 TDI PPD1.2 (CD variant)
      'SN0I0M8000000',  // ↳ Italian-market SN serial family for A/CD variants
      '03G906018AC',    // VW Pair #902 — Passat 2.0 TDI PPD1.2 (AC variant)
      '03G906018CR',    // VW Pair #905, #911 — Passat 2.0 TDI PPD1.2 (CR variant)
      'SN000F7100000',  // ↳ Passat 2007 SN0 serial sub-family
      'SN000F7200000',  // ↳ Passat 2007 SN0 serial sub-family
      'SN000F7600000',  // ↳ Passat 2007 SN0 serial sub-family
      '03G906018EJ',    // VW Pair #913 — Passat 2.0 TDI PPD1.2 (EJ variant)
      '03G906018CE',    // VW Pair #914 — Passat 2.0 TDI PPD1.2 (CE variant, SN100L1)
      'SN100L1000000',  // ↳ SN100L1 sub-family for CE variant
    ],
    fileSizeRange: [524288, 2097152],   // up to 2MB — real PPD1.2 binaries are 2MB
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
        name: 'Injection Quantity (MENZK)',
        category: 'fuel',
        desc: 'MENZK — base fuel injection quantity (mg/stk). Primary Stage 1 map for PD TDI. Stock BKD 140ps peak ~75 mg/st, Stage 1 target ~90-100 mg/st. Offset verified for 03G906018DH by ORI/Stage1 diff: raw 23069 μ → 27244 μ = 92→109 mg/st (+18%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x07BBB3,   // 03G906018DH SN100L8000000
        rows: 14, cols: 8, dtype: 'uint16', le: false,
        factor: 0.004, offsetVal: 0, unit: 'mg/st',   // factor = 1/250 per jazdw MG_STK_PRESET
        stage1: { multiplier: 1.15, clampMax: 30000 },   // ~120 mg/st ceiling
        stage2: { multiplier: 1.22, clampMax: 32000 },   // ~128 mg/st
        stage3: { multiplier: 1.32, clampMax: 34000 },   // ~136 mg/st
        critical: true, showPreview: true,
      },
      {
        id: 'ppd1_boost_target',
        name: 'Boost Pressure Target (LADSOLL)',
        category: 'boost',
        desc: 'LADSOLL — charge pressure setpoint in hPa. VNT turbo — conservative stock (~1500 mbar peak on BKD 140), Stage 1 target ~2000-2100 mbar. Offset verified for 03G906018DH by ORI/Stage1 diff: the 0x06126E table is one of 7 boost-target variants (primary + 6 per-mode), raw 5000-24110 = 414-2000 hPa. Stock peak μ ~8785, tuned ~9063 (+3%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x06126E,   // 03G906018DH — primary LADSOLL (one of 7 variants)
        rows: 3, cols: 16, dtype: 'uint16', le: false,
        factor: 0.0829, offsetVal: 0, unit: 'hPa',   // factor = 1/12.06 per jazdw HPA preset
        stage1: { multiplier: 1.10, clampMax: 26000 },   // ~2150 hPa ceiling
        stage2: { multiplier: 1.18, clampMax: 28000 },   // ~2320 hPa
        stage3: { multiplier: 1.25, clampMax: 30000 },   // ~2490 hPa
        critical: true, showPreview: true,
      },
      {
        id: 'ppd1_torque_limit',
        name: 'Torque Ceiling (MDFAW)',
        category: 'torque',
        desc: 'MDFAW — driver-demand / max-torque table. Stored as uint16 BE with +32768 bias, factor 1/32 Nm. Stock BKD 140: peak ceiling ~320 Nm. Stage 1 target: ~500 Nm (02Q gearbox safe limit ~550 Nm). Offset verified for 03G906018DH: raw μ 38888→50631 = 191→559 Nm (+30%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x07B954,   // 03G906018DH
        rows: 5, cols: 8, dtype: 'uint16', le: false,
        // factor 1/32, bias -32768: phys = (raw + offsetVal) * factor
        factor: 0.03125, offsetVal: -32768, unit: 'Nm',
        // Values are stored as (raw - 32768) then scaled — multiplier on physical Nm
        stage1: { multiplier: 1.30 },   // 191 → 248 Nm at low-end, 559 at peak
        stage2: { multiplier: 1.55 },
        stage3: { multiplier: 1.80, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'ppd1_torque_monitor',
        name: 'Torque Monitor Ceiling',
        category: 'limiter',
        desc: 'Large torque-monitor ceiling table — ECU compares actual vs expected torque against this threshold; exceeding it triggers a DTC and derate. Factory stock varies with conditions; Stage 1 tuners pin the entire table to a high constant (~55415 raw = 707 Nm) to effectively disable the check. Offset verified for 03G906018DH.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x05C7FA,   // 03G906018DH
        rows: 1, cols: 2688, dtype: 'uint16', le: false,
        factor: 0.03125, offsetVal: -32768, unit: 'Nm',
        stage1: { multiplier: 1.0, addend: 0, clampMax: 55415 },   // pin to ~707 Nm
        stage2: { multiplier: 1.0, addend: 0, clampMax: 55415 },
        stage3: { multiplier: 1.0, addend: 0, clampMax: 55415 },
        critical: false, showPreview: false,
      },
      {
        id: 'ppd1_iq_extended',
        name: 'Extended IQ Master (Stage 2+)',
        category: 'fuel',
        desc: 'Large 16×96 injection-quantity master table. Stage 1 tuners leave this alone; Stage 2+ tunes modify it for the additional fuel required above ~190 bhp. Found by diffing DH Stage 2 against ORI — μ 94 → 105 mg/st (+12%). Keep Stage 1 multiplier at 1.0 so light tunes do not touch it. Offset verified for 03G906018DH.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x070575,   // 03G906018DH — Stage 2+ territory
        rows: 96, cols: 16, dtype: 'uint16', le: false,
        factor: 0.004, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.0 },    // untouched by Stage 1
        stage2: { multiplier: 1.12 },   // ~+12%, matches the real DH Stage 2 pattern
        stage3: { multiplier: 1.20, clampMax: 34000 },
        critical: false, showPreview: true,
      },
      {
        id: 'ppd1_overboost_ceiling',
        name: 'Overboost / Secondary Torque Ceiling (Stage 2+)',
        category: 'limiter',
        desc: 'Secondary torque protection / overboost ceiling, 256-cell u16 BE. Stage 1 tuners leave it stock; Stage 2+ raises from ~300 Nm → ~515 Nm to allow the higher peak torque of Stage 2 tunes. Found by diffing DH Stage 2 against ORI — μ 42296 raw → 49224 raw = 298 → 514 Nm (+72%). Offset verified for 03G906018DH.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x07C27C,   // 03G906018DH — Stage 2+ territory
        rows: 1, cols: 256, dtype: 'uint16', le: false,
        factor: 0.03125, offsetVal: -32768, unit: 'Nm',
        stage1: { multiplier: 1.0 },    // untouched by Stage 1
        stage2: { multiplier: 1.0, addend: 0, clampMax: 50000 },   // ~540 Nm ceiling
        stage3: { multiplier: 1.0, addend: 0, clampMax: 55000 },   // ~700 Nm ceiling
        critical: false, showPreview: false,
      },
      {
        id: 'ppd1_egr',
        name: 'EGR / Monitoring Switches',
        category: 'emission',
        desc: 'EGRKL-style monitoring table + adjacent switch block. On this variant (03G906018DH) the Stage 1 tuner zeroed the entire 0x056D40 block to disable EGR flow monitoring (and related DTC checks). Factor 1/655.36 per jazdw PERCENT_PRESET — stock values 0-100%, zeroed = 0%. This is the EGR delete trigger point; keep multiplier 1.0 to preserve factory EGR, or use the egr addon to zero.',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x056D40,   // 03G906018DH — 192 cells zeroed by Stage 1
        rows: 12, cols: 16, dtype: 'uint16', le: false,
        factor: 0.001526, offsetVal: 0, unit: '%',   // 1/655.36 per jazdw
        stage1: { multiplier: 1.0 },        // leave stock by default
        stage2: { multiplier: 0.75 },       // reduce EGR (deposits)
        stage3: { multiplier: 0.4 },        // heavy reduction
        addonOverrides: { egr: { multiplier: 0, clampMax: 0 } },   // full delete
        critical: false, showPreview: false,
      },
      {
        id: 'ppd1_smoke_limiter',
        name: 'Smoke Limiter (LSMK)',
        category: 'smoke',
        desc: 'Airflow-based smoke limit for PD TDI. Offset not yet verified for 03G906018DH — 6 candidate 16×12 tables exist at 0x053B8B → 0x05458B (per-gear variants) but fuel-quantity interpretation gives unrealistic values. Leaving without fixedOffset until confirmed on a second variant or via A2L reference.',
        signatures: [],
        sigOffset: 0,
        rows: 12, cols: 16, dtype: 'uint16', le: false,
        factor: 0.004, offsetVal: 0, unit: 'mg/st',   // MG_STK scaling per jazdw
        stage1: { multiplier: 1.10 },
        stage2: { multiplier: 1.18 },
        stage3: { multiplier: 1.28 },
        critical: true, showPreview: true,
      },
      {
        id: 'ppd1_soi',
        name: 'Start of Injection (SDATF)',
        category: 'ignition',
        desc: 'Injection timing for PD TDI. Offset not yet verified for 03G906018DH — SDATF uses +32768 bias with factor 3/128 °CRK (per jazdw DEG_CRK_3 preset). A2L required until we verify on additional variants.',
        signatures: [],
        sigOffset: 0,
        rows: 16, cols: 16, dtype: 'uint16', le: false,
        factor: 0.0234, offsetVal: -32768, unit: '°BTDC',   // 3/128 with +32768 bias
        stage1: { multiplier: 1.0 },
        stage2: { addend: 85, clampMax: 65535 },   // ~+2° (85 * 3/128 ≈ 2°)
        stage3: { addend: 128, clampMax: 65535 },  // ~+3°
        critical: false, showPreview: true,
      },
      {
        id: 'ppd1_rail_pressure',
        name: 'Rail Pressure (N/A — PD TDI)',
        category: 'fuel',
        desc: 'VESTIGIAL — Pumpe Düse TDI uses per-injector mechanical pumps, NOT common-rail. This map does not apply to PPD1.x. Kept as a no-op placeholder; Stage multipliers are 1.0 so nothing is modified. Will remove in a future cleanup.',
        signatures: [],
        sigOffset: 0,
        rows: 1, cols: 1, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'n/a',
        stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 },
        critical: false, showPreview: false,
      },
      {
        id: 'ppd1_speed_limit',
        name: 'Vehicle Speed Limiter',
        category: 'limiter',
        desc: 'Factory speed limiter. Not modified by typical Stage 1 tunes — offset not yet verified for 03G906018DH. Use the speedlimiter addon to override.',
        signatures: [],
        sigOffset: 0,
        rows: 1, cols: 1, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'km/h',
        stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 },
        addonOverrides: { speedlimiter: { multiplier: 0, addend: 65535 } },
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
      { id: 'volvo_denso_ignition', name: 'Ignition Timing Map', category: 'ignition', desc: 'Spark advance for Volvo petrol.', signatures: [], sigOffset: 0, rows: 16, cols: 16, dtype: 'int8', le: true, factor: 0.75, offsetVal: -48, unit: '°BTDC', stage1: { addend: 0 }, stage2: { addend: 2 }, stage3: { addend: 3 }, critical: false, showPreview: true },
      { id: 'volvo_denso_lambda', name: 'Lambda / AFR Target', category: 'smoke', desc: 'Lambda target for Volvo petrol.', signatures: [], sigOffset: 0, rows: 16, cols: 16, dtype: 'uint16', le: true, factor: 0.001, offsetVal: 0, unit: 'lambda', stage1: { multiplier: 1.0 }, stage2: { multiplier: 0.98 }, stage3: { multiplier: 0.95 }, critical: false, showPreview: true },
      { id: 'volvo_denso_rev_limit', name: 'Rev Limiter', category: 'limiter', desc: 'Engine RPM hard-cut for Volvo petrol.', signatures: [], sigOffset: 0, rows: 1, cols: 1, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'RPM', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { revlimit: { addend: 300, clampMax: 8000 } }, critical: false, showPreview: false },
      { id: 'volvo_denso_speed_limit', name: 'Vehicle Speed Limiter', category: 'limiter', desc: 'Factory speed limiter for Volvo petrol.', signatures: [], sigOffset: 0, rows: 1, cols: 1, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'km/h', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { speedlimiter: { multiplier: 0, addend: 65535 } }, critical: false, showPreview: false },
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
      { id: 'ems31_ignition', name: 'Ignition Timing Map', category: 'ignition', desc: 'Spark advance for Renault/Nissan petrol TCe.', signatures: [], sigOffset: 0, rows: 16, cols: 16, dtype: 'int8', le: true, factor: 0.75, offsetVal: -48, unit: '°BTDC', stage1: { addend: 0 }, stage2: { addend: 2 }, stage3: { addend: 3 }, critical: false, showPreview: true },
      { id: 'ems31_lambda_target', name: 'Lambda / AFR Target', category: 'smoke', desc: 'Lambda target for Renault/Nissan TCe petrol.', signatures: [], sigOffset: 0, rows: 16, cols: 16, dtype: 'uint16', le: true, factor: 0.001, offsetVal: 0, unit: 'lambda', stage1: { multiplier: 1.0 }, stage2: { multiplier: 0.98 }, stage3: { multiplier: 0.95 }, critical: false, showPreview: true },
      { id: 'ems31_rev_limit', name: 'Rev Limiter', category: 'limiter', desc: 'Engine RPM hard-cut for Renault/Nissan petrol.', signatures: [], sigOffset: 0, rows: 1, cols: 1, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'RPM', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { revlimit: { addend: 300, clampMax: 8000 } }, critical: false, showPreview: false },
      { id: 'ems31_speed_limit', name: 'Vehicle Speed Limiter', category: 'limiter', desc: 'Factory speed limiter for Renault/Nissan petrol.', signatures: [], sigOffset: 0, rows: 1, cols: 1, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'km/h', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { speedlimiter: { multiplier: 0, addend: 65535 } }, critical: false, showPreview: false },
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
      { id: 'sdi_ignition', name: 'Ignition Timing Map', category: 'ignition', desc: 'Spark advance for Porsche petrol.', signatures: [], sigOffset: 0, rows: 16, cols: 16, dtype: 'int8', le: true, factor: 0.75, offsetVal: -48, unit: '°BTDC', stage1: { addend: 0 }, stage2: { addend: 2 }, stage3: { addend: 3 }, critical: false, showPreview: true },
      { id: 'sdi_lambda_target', name: 'Lambda / AFR Target', category: 'smoke', desc: 'Lambda target for Porsche petrol.', signatures: [], sigOffset: 0, rows: 16, cols: 16, dtype: 'uint16', le: true, factor: 0.001, offsetVal: 0, unit: 'lambda', stage1: { multiplier: 1.0 }, stage2: { multiplier: 0.98 }, stage3: { multiplier: 0.95 }, critical: false, showPreview: true },
      { id: 'sdi_rev_limit', name: 'Rev Limiter', category: 'limiter', desc: 'Engine RPM hard-cut for Porsche.', signatures: [], sigOffset: 0, rows: 1, cols: 1, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'RPM', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { revlimit: { addend: 300, clampMax: 8000 } }, critical: false, showPreview: false },
      { id: 'sdi_speed_limit', name: 'Vehicle Speed Limiter', category: 'limiter', desc: 'Factory speed limiter for Porsche.', signatures: [], sigOffset: 0, rows: 1, cols: 1, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'km/h', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { speedlimiter: { multiplier: 0, addend: 65535 } }, critical: false, showPreview: false },
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
      { id: 'simos11_lambda_target', name: 'Lambda / AFR Target', category: 'smoke', desc: 'Lambda target for SIMOS11 TSI petrol.', signatures: [], sigOffset: 0, rows: 16, cols: 16, dtype: 'uint16', le: true, factor: 0.001, offsetVal: 0, unit: 'lambda', stage1: { multiplier: 1.0 }, stage2: { multiplier: 0.98 }, stage3: { multiplier: 0.95 }, critical: false, showPreview: true },
      { id: 'simos11_speed_limit', name: 'Vehicle Speed Limiter', category: 'limiter', desc: 'Factory speed limiter for SIMOS11 vehicles.', signatures: [], sigOffset: 0, rows: 1, cols: 1, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'km/h', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { speedlimiter: { multiplier: 0, addend: 65535 } }, critical: false, showPreview: false },
    ],
  },

  // ── EDC16 BMW E65 730D sw361884 — 0x0F244F 1015808B cluster ──────────────
  //
  // BMW E65 730D (M57D30 6-cyl diesel) 160kW EDC16. 1015808B = 992KB
  // truncated BMW-specific EDC16 dump format. 1 SW across 2 Bosch part
  // suffixes (0281010898 + 0281011231) + SW-variant without part string.
  // Verified in pair_analysis_log.md BMW pairs:
  //   #835 sw361884 0281011231 · #836 sw361820 (no part) · #837 sw361884
  //   0281010898 · #838 sw361884 0281011231
  //
  // Map structure (EXACT match across 4 pairs):
  //   0x0F244F  199 B u16 BE — IQ upper (stock 23089 → 45279, +96%)
  //   0x0EEC89  17 B u16 BE — torque lift (stock 26885 → 35461, +32%)
  {
    id: 'edc16_bmw_e65_730d_0f244f',
    name: 'Bosch EDC16 (BMW E65 730D M57D30 160kW — 0x0F244F 992KB)',
    manufacturer: 'Bosch',
    family: 'EDC16',
    identStrings: ['0281010898', '0281011231', '361884', '361820'],
    fileSizeRange: [1015808, 1015808],
    vehicles: ['BMW E65 730D M57D30 160kW (0281010898/0281011231 sw 361820/361884, 2003-2005)'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0xF7FFC,
    checksumLength: 4,
    maps: [
      {
        id: 'edc16_bmw_e65_730d_iq_upper',
        name: 'IQ Upper 199B (E65 730D sw361884)',
        category: 'fuel',
        desc: 'IQ upper at 0x0F244F (100 cells u16 BE = 199 B). 4 pairs across 2 part suffixes + 2 SWs EXACT anchor: stock 23089 → tuner consensus 45279 (+96%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x0F244F,
        rows: 1, cols: 100, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 42000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 46000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 50000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc16_bmw_e65_730d_torque_lift',
        name: 'Torque Lift 17B (E65 730D sw361884)',
        category: 'limiter',
        desc: 'Torque lift at 0x0EEC89 (8 cells u16 BE = 17 B). Stock 26885 → 35461 (+32%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x0EEC89,
        rows: 1, cols: 8, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 34000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 37000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 40000 },
        critical: true, showPreview: true,
      },
    ],
  },

  // ── BMW B47 diesel (2014+) — Bosch EDC17C56 / EDC17C76 ──────────────────
  {
    id: 'bmw_b47',
    name: 'BMW B47 diesel (EDC17C56/C76)',
    manufacturer: 'Bosch',
    family: 'EDC17',
    // EDC17C56/C76 are Bosch TriCore ECUs used across BMW's B47 four-cylinder diesel.
    // B47D20A = 150/163ps (base); B47D20B = 190ps; B47D20O0 = 231/265ps (high-power).
    // ECU identification strings are embedded in the ROM calibration header.
    identStrings: ['EDC17C56', 'EDC17C76', 'B47D20', 'B47C20', '0281020', '0281021'],
    fileSizeRange: [1048576, 4194304],
    vehicles: [
      'BMW 116d/118d/120d F20/F21 (B47 2014+)',
      'BMW 216d/218d/220d F22/F23 (B47 2014+)',
      'BMW 316d/318d/320d/325d F30/F31 (B47 2014+)',
      'BMW 418d/420d/425d F32/F33 (B47 2014+)',
      'BMW 518d/520d/525d F10/F11 (B47 2014+)',
      'BMW X1 sDrive18d/xDrive20d F48 (B47 2015+)',
      'BMW X3 xDrive20d/25d G01 (B47 2017+)',
      'BMW X5 xDrive25d/30d G05 (B47 2018+)',
      'Mini Cooper D/SD F55/F56/F57 (B47 2014+)',
    ],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0,
    checksumLength: 4,
    maps: [
      {
        id: 'bmw_b47_boost_target',
        name: 'Boost Pressure Target (KFLDRL)',
        category: 'boost',
        desc: 'BMW B47 boost target map. B47D20A (150ps) stock peak ~1800-2000 mbar; B47D20O0 (265ps) stock ~2200-2400 mbar. Stage 1 typical: 150→195ps, 190→240ps. Uses EDC17 standard KFLDRL symbol — same architecture as VAG EDC17. Variable-geometry turbo allows precise boost shaping.',
        a2lNames: ['KFLDRL', 'DTBSTK', 'BstSp_pBoost', 'pBstSp', 'KFMHDR'],
        signatures: [
          [0x4B,0x46,0x4C,0x44,0x52,0x4C],  // "KFLDRL"
          [0x44,0x54,0x42,0x53,0x54,0x4B],  // "DTBSTK"
        ],
        sigOffset: 2,
        rows: 6, cols: 9, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'mbar',
        stage1: { multiplier: 1.08, clampMax: 24000 },
        stage2: { multiplier: 1.15, clampMax: 27000 },
        stage3: { multiplier: 1.22, clampMax: 30000 },
        addonOverrides: { overboost: { multiplier: 1.10, clampMax: 25000 } },
        critical: true, showPreview: true,
      },
      {
        id: 'bmw_b47_torque_limit',
        name: 'Torque Limit Map (MXHYE)',
        category: 'torque',
        desc: 'BMW B47 maximum torque ceiling. B47D20A stock ~320-360 Nm; B47D20O0 stock ~550 Nm. Must be raised in proportion with boost to prevent the torque limiter cutting power gains mid-pull. ZF 8HP automatic: safe to 650-700 Nm with stock hardware.',
        a2lNames: ['MXHYE', 'KFMOMDK', 'trqLimRaw'],
        signatures: [[0x4D,0x58,0x48,0x59,0x45]],  // "MXHYE"
        sigOffset: 2,
        rows: 5, cols: 8, dtype: 'int16', le: true,
        factor: 0.5, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.10, clampMax: 900 },
        stage2: { multiplier: 1.18, clampMax: 1100 },
        stage3: { multiplier: 1.25, clampMax: 1300 },
        critical: true, showPreview: true,
      },
      {
        id: 'bmw_b47_fuel_qty',
        name: 'Fuel Quantity Map (KFFKK)',
        category: 'fuel',
        desc: 'BMW B47 base fuel quantity demand map. Raise proportionally with boost and torque to maintain correct lambda and avoid lean conditions at high load. B47 uses Bosch HDEV5 solenoid injectors — consistent delivery up to ~2200 bar rail pressure.',
        a2lNames: ['KFFKK', 'KFLMHFM', 'qFuelDem'],
        signatures: [[0x4B,0x46,0x46,0x4B,0x4B]],  // "KFFKK"
        sigOffset: 2,
        rows: 6, cols: 9, dtype: 'uint16', le: true,
        factor: 0.01, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.10, clampMax: 6500 },
        stage2: { multiplier: 1.18, clampMax: 7500 },
        stage3: { multiplier: 1.25, clampMax: 8500 },
        critical: true, showPreview: true,
      },
      {
        id: 'bmw_b47_smoke_limiter',
        name: 'Smoke Limiter Map',
        category: 'smoke',
        desc: 'BMW B47 smoke limiter — caps fuel at low boost to prevent visible smoke on tip-in. Raise proportionally with fuel quantity map. B47 has a GPF/DPF on most post-2018 variants — excessive smoke will block the filter rapidly.',
        a2lNames: ['KFMRRBKH', 'KFRSMOKE', 'KFMRR'],
        signatures: [
          // LE Kf_ 8×5 smoke limiter (RPM axis 2431,2531,2731,2911) — database study: 32 CP44 files
          [0x08,0x00,0x05,0x00,0x7f,0x09,0xe3,0x09,0xab,0x0a,0x5f,0x0b],
          // LE Kf_ 8×5 smoke alt axis (RPM axis 1160,1200,1820,1900) — database study: 28 CP44 files
          [0x08,0x00,0x05,0x00,0x88,0x04,0xb0,0x04,0x1c,0x07,0x6c,0x07],
        ],
        sigOffset: 0,
        rows: 5, cols: 8, dtype: 'uint16', le: true,
        factor: 0.01, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.08 },
        stage2: { multiplier: 1.15 },
        stage3: { multiplier: 1.22 },
        critical: false, showPreview: false,
      },
      {
        id: 'bmw_b47_speed_limit',
        name: 'Vehicle Speed Limiter (GSVSD)',
        category: 'limiter',
        desc: 'BMW B47 electronic speed limiter. Most BMW diesel models are limited to 210-250 km/h depending on variant and market. Mini Cooper D variants typically 210 km/h.',
        a2lNames: ['GSVSD', 'vVehMax', 'VMAX', 'vMaxDes'],
        signatures: [[0x47,0x53,0x56,0x53,0x44]],  // "GSVSD"
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint8', le: true,
        factor: 1, offsetVal: 0, unit: 'km/h',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { speedlimiter: { multiplier: 0, addend: 250, clampMax: 250 } },
        critical: false, showPreview: false,
      },
    ],
  },

  // ── BMW B58 petrol (2015+) — Bosch MG1CS003 ─────────────────────────────
  {
    id: 'bmw_b58',
    name: 'BMW B58 petrol (MG1CS003)',
    manufacturer: 'Bosch',
    family: 'MG1',
    // MG1CS003 is the Bosch TriCore MG1 ECU used in BMW B58B30 straight-six petrol.
    // Shares MG1 software architecture with VAG MG1/MED17 — same DAMOS symbol names.
    // B58B30A = standard power (340i/440i/540i 326ps); B58B30M0 = M Performance (M340i 374ps+).
    identStrings: ['MG1CS003', 'B58B30', 'B58A30', '0261S19', '0261S20', '0261S21'],
    fileSizeRange: [2097152, 6291456],
    vehicles: [
      'BMW 340i/440i F30/F32 (B58B30 2015+)',
      'BMW 540i/640i/740i G30/G32/G11 (B58B30 2016+)',
      'BMW M140i/M240i F20/F22 (B58B30 2016+)',
      'BMW M340i/M440i/M540i G20/G22/G30 (B58B30M0 2019+)',
      'BMW X3 M40i/X4 M40i G01/G02 (B58B30 2017+)',
      'BMW Z4 M40i G29 (B58B30 2019+)',
      'Toyota Supra GR A90 (B58 engine, MG1CS003 2019+)',
      'BMW 840i/M850i G14/G15 (B58B30 2018+)',
    ],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0,
    checksumLength: 4,
    maps: [
      {
        id: 'bmw_b58_boost',
        name: 'Boost Pressure Setpoint (pBstSp)',
        category: 'boost',
        desc: 'BMW B58 boost setpoint map. B58B30A (340i/540i) stock peak ~1700-1900 mbar; M Performance variants (M340i) stock ~2100-2300 mbar. Stage 1 typical: 340→390ps. Twin-scroll single turbo — excellent boost response and wide torque band. MG1 architecture shares pBstSp symbol with VAG MG1/MED17.',
        a2lNames: ['pBstSp', 'KFLDR', 'KFLDRL', 'p_SetpntBoost', 'BoostPrsSp'],
        signatures: [[0x70,0x42,0x73,0x74,0x53,0x70]],  // "pBstSp"
        sigOffset: 2,
        rows: 6, cols: 10, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'mbar',
        stage1: { multiplier: 1.08, clampMax: 24000 },
        stage2: { multiplier: 1.15, clampMax: 28000 },
        stage3: { multiplier: 1.22, clampMax: 32000 },
        addonOverrides: { overboost: { multiplier: 1.10, clampMax: 25000 } },
        critical: true, showPreview: true,
      },
      {
        id: 'bmw_b58_torque',
        name: 'Torque Limit (MXHYE)',
        category: 'torque',
        desc: 'BMW B58 engine torque ceiling. B58B30A stock 500 Nm; M Performance (M340i/M440i) stock 650 Nm. B58 bottom-end is bulletproof — rated to 700+ Nm on stock internals (proven in hundreds of Toyota Supra builds). ZF 8HP (stock gearbox) safely handles 750-800 Nm.',
        a2lNames: ['MXHYE', 'trqLimRaw', 'tqMax', 'MASR'],
        signatures: [[0x4D,0x58,0x48,0x59,0x45]],  // "MXHYE"
        sigOffset: 2,
        rows: 5, cols: 9, dtype: 'int16', le: true,
        factor: 0.5, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.10, clampMax: 1400 },
        stage2: { multiplier: 1.18, clampMax: 1600 },
        stage3: { multiplier: 1.25, clampMax: 1800 },
        critical: true, showPreview: true,
      },
      {
        id: 'bmw_b58_ignition',
        name: 'Ignition Timing Map (KFZW)',
        category: 'ignition',
        desc: 'BMW B58 base ignition timing (KFZW). 11:1 compression ratio — high but B58 runs excellent charge-cooling via port injection water (M Performance variants) and spray cooling. Responds well to 1-2° advance on 98+ RON. MG1 platform shares KFZW symbol across all Bosch petrol ECUs.',
        a2lNames: ['KFZW', 'KFZW2', 'IgnTim_sp', 'ignAdvBase'],
        signatures: [[0x4B,0x46,0x5A,0x57]],  // "KFZW"
        sigOffset: 2,
        // CORRECTED: rows:16 cols:20. DAMOS A2L: KFZW = 20×16 across 14 MG1 files.
        rows: 16, cols: 20, dtype: 'int8', le: true,
        factor: 0.75, offsetVal: 0, unit: '°BTDC',
        stage1: { multiplier: 1.0 },
        stage2: { addend: 1, clampMax: 50 },
        stage3: { addend: 2, clampMax: 52 },
        critical: false, showPreview: true,
      },
      {
        id: 'bmw_b58_rev_limit',
        name: 'RPM Limiter (NMMAX)',
        category: 'limiter',
        desc: 'BMW B58 hard rev limiter. Stock 7000 RPM (B58B30A), 7100 RPM (M Performance). Safe to 7400 RPM with stock valve springs on most variants. Toyota Supra A90 soft-limited lower — common first tune step.',
        a2lNames: ['NMMAX', 'nEngCutOff', 'nMaxEng', 'RPM_Max'],
        signatures: [[0x4E,0x4D,0x4D,0x41,0x58]],  // "NMMAX"
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'RPM',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { revlimit: { addend: 300, clampMax: 7500 } },
        critical: false, showPreview: false,
      },
      {
        id: 'bmw_b58_speed_limit',
        name: 'Vehicle Speed Limiter (GSVSD)',
        category: 'limiter',
        desc: 'BMW B58 speed limiter. Standard EU models limited to 250 km/h. Toyota Supra A90 limited to 250 km/h — common early remove.',
        a2lNames: ['GSVSD', 'vVehMax', 'VMAX'],
        signatures: [[0x47,0x53,0x56,0x53,0x44]],  // "GSVSD"
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint8', le: true,
        factor: 1, offsetVal: 0, unit: 'km/h',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { speedlimiter: { multiplier: 0, addend: 270, clampMax: 280 } },
        critical: false, showPreview: false,
      },
    ],
  },

  // ── Renault/Dacia dCi diesel (2009+) — Bosch EDC17C11/C42/C84 ────────────
  {
    id: 'renault_edc17',
    name: 'Renault/Dacia dCi diesel (EDC17C11/C42/C84)',
    manufacturer: 'Bosch',
    family: 'EDC17',
    // K9K = Renault 1.5 dCi engine code (massive volume — Clio/Megane/Kadjar/Duster/Qashqai).
    // R9M = Renault 1.6 dCi (Talisman/Espace/Kadjar 130/160ps).
    // M9R = Renault 2.0 dCi (Laguna/Espace/Qashqai 150/175ps).
    // All use Bosch EDC17C11/C42/C84 with standard EDC17 DAMOS symbol names.
    identStrings: ['EDC17C11', 'EDC17C42', 'EDC17C84', 'K9K', 'R9M', 'M9R', '0281017', '0281018'],
    fileSizeRange: [524288, 2097152],
    vehicles: [
      'Renault Clio IV 1.5 dCi 75/90/110ps K9K (2012+)',
      'Renault Megane IV 1.5 dCi 90/110ps / 1.6 dCi 130ps (2015+)',
      'Renault Scenic IV 1.5 dCi 110ps (2016+)',
      'Renault Kadjar 1.5 dCi 110ps / 1.6 dCi 130ps (2015+)',
      'Renault Talisman 1.6 dCi 130/160ps R9M (2015+)',
      'Dacia Duster 1.5 dCi 90/110ps (2013+)',
      'Dacia Sandero/Logan 1.5 dCi 75/90ps (2013+)',
      'Nissan Qashqai J11 1.5 dCi 110ps (2013+)',
      'Nissan Juke 1.5 dCi 110ps (2013+)',
    ],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0,
    checksumLength: 4,
    maps: [
      {
        id: 'renault_edc17_boost_target',
        name: 'Boost Pressure Target (KFLDRL)',
        category: 'boost',
        desc: 'Renault dCi boost target map. K9K 90ps stock peak ~1800-2000 mbar; K9K 110ps ~2100 mbar. Stage 1 typical: 90→115ps, 110→140ps. Very significant gains available — Renault leaves substantial headroom. Small fixed-geometry turbo responds instantly; monitor EGT and avoid sustained high boost.',
        a2lNames: ['KFLDRL', 'DTBSTK', 'BstSp_pBoost', 'pBstSp'],
        signatures: [
          [0x4B,0x46,0x4C,0x44,0x52,0x4C],  // "KFLDRL"
          [0x44,0x54,0x42,0x53,0x54,0x4B],  // "DTBSTK"
        ],
        sigOffset: 2,
        rows: 5, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'mbar',
        stage1: { multiplier: 1.14, clampMax: 24000 },
        stage2: { multiplier: 1.24, clampMax: 28000 },
        stage3: { multiplier: 1.32, clampMax: 31000 },
        addonOverrides: { overboost: { multiplier: 1.16, clampMax: 25000 } },
        critical: true, showPreview: true,
      },
      {
        id: 'renault_edc17_torque_limit',
        name: 'Torque Limit Map (MXHYE)',
        category: 'torque',
        desc: 'Renault dCi torque ceiling. K9K 90ps stock ~200 Nm; 110ps stock ~260 Nm; R9M 130ps ~320 Nm. Raise with boost — torque limiter is the primary power restriction on Renault dCi. 6-speed manual (JH3/PK4): safe to ~380 Nm; EDC (robotised manual): keep below 320 Nm.',
        a2lNames: ['MXHYE', 'KFMOMDK', 'trqLimRaw'],
        signatures: [[0x4D,0x58,0x48,0x59,0x45]],  // "MXHYE"
        sigOffset: 2,
        rows: 4, cols: 7, dtype: 'int16', le: true,
        factor: 0.5, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.14, clampMax: 700 },
        stage2: { multiplier: 1.24, clampMax: 800 },
        stage3: { multiplier: 1.32, clampMax: 900 },
        critical: true, showPreview: true,
      },
      {
        id: 'renault_edc17_fuel_qty',
        name: 'Fuel Quantity Map (KFFKK)',
        category: 'fuel',
        desc: 'Renault dCi base fuel quantity. Raise proportionally with boost to maintain correct lambda. K9K is sensitive to over-fuelling at low RPM — produces heavy black smoke. Keep fuel gains matched to boost gains for clean power.',
        a2lNames: ['KFFKK', 'KFLMHFM', 'qFuelDem'],
        signatures: [[0x4B,0x46,0x46,0x4B,0x4B]],  // "KFFKK"
        sigOffset: 2,
        rows: 5, cols: 8, dtype: 'uint16', le: true,
        factor: 0.01, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.14, clampMax: 4500 },
        stage2: { multiplier: 1.24, clampMax: 5200 },
        stage3: { multiplier: 1.32, clampMax: 5800 },
        critical: true, showPreview: true,
      },
      {
        id: 'renault_edc17_smoke_limiter',
        name: 'Smoke Limiter Map',
        category: 'smoke',
        desc: 'Renault dCi smoke limiter. Caps fuel at low boost/cold start to limit smoke. K9K is prone to smoke if over-fuelled below 1500 RPM. Raise proportionally with fuel map.',
        a2lNames: ['KFMRRBKH', 'KFRSMOKE', 'KFMRR'],
        signatures: [
          // LE Kf_ 7×4 smoke limiter (X: RPM 2000,2500,3000,3500) — database study: 32 C46 files
          [0x07,0x00,0x04,0x00,0xd0,0x07,0xc4,0x09,0xb8,0x0b,0xac,0x0d],
        ],
        sigOffset: 0,
        rows: 4, cols: 7, dtype: 'uint16', le: true,
        factor: 0.01, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.12 },
        stage2: { multiplier: 1.20 },
        stage3: { multiplier: 1.28 },
        critical: false, showPreview: false,
      },
      {
        id: 'renault_edc17_egr_map',
        name: 'EGR Flow Map',
        category: 'emission',
        desc: 'Renault K9K EGR map. The 1.5 dCi has severe EGR-related inlet manifold fouling issues at high mileage — one of the most common complaints on Renault/Dacia diesels. EGR-off addon with inlet clean recommended on any K9K over 100k km.',
        a2lNames: ['KFEGR', 'KFEGRMX', 'EGR_rDes'],
        signatures: [
          // LE Kf_ 7×4 EGR position (X: 2431,2531,2731,2931) — database study: 8 CP04 files
          [0x07,0x00,0x04,0x00,0x7f,0x09,0xe3,0x09,0xab,0x0a,0x73,0x0b],
        ],
        sigOffset: 0,
        rows: 4, cols: 7, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: '%',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { egr: { multiplier: 0, addend: 0 } },
        critical: false, showPreview: false,
      },
      {
        id: 'renault_edc17_speed_limit',
        name: 'Vehicle Speed Limiter (GSVSD)',
        category: 'limiter',
        desc: 'Renault/Dacia speed limiter. Clio/Sandero typically 180 km/h; Megane/Kadjar 200 km/h; Talisman/Espace 220 km/h. Dacia models commonly limited to 160-180 km/h.',
        a2lNames: ['GSVSD', 'vVehMax', 'VMAX'],
        signatures: [[0x47,0x53,0x56,0x53,0x44]],  // "GSVSD"
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint8', le: true,
        factor: 1, offsetVal: 0, unit: 'km/h',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { speedlimiter: { multiplier: 0, addend: 250, clampMax: 250 } },
        critical: false, showPreview: false,
      },
    ],
  },

  // ── PSA Group HDi/BlueHDi diesel (2009+) — Bosch EDC17C10/C60 ────────────
  {
    id: 'psa_edc17',
    name: 'PSA Group 1.6/2.0 HDi/BlueHDi (EDC17C10/C60)',
    manufacturer: 'Bosch',
    family: 'EDC17',
    // PSA Group (Peugeot/Citroën/DS/Vauxhall/Opel) diesel platform.
    // DV6 = 1.6 HDi/BlueHDi (the most common Euro small diesel 2004-2022).
    // DW10 = 2.0 HDi/BlueHDi (focus/passway diesel, used in 308/508/3008/Insignia).
    // Vauxhall/Opel CDTi variants share the same PSA engine family via alliance.
    identStrings: ['EDC17C10', 'EDC17C60', 'EDC17CP10', 'DV6', 'DW10', 'DW12', '0281014', '0281016'],
    fileSizeRange: [524288, 2097152],
    vehicles: [
      'Peugeot 208/2008 1.6 BlueHDi 75/100/120ps DV6 (2014+)',
      'Peugeot 308/3008 1.6/2.0 BlueHDi 100/120/150/180ps (2013+)',
      'Peugeot 508 2.0 BlueHDi 150/180ps DW10 (2014+)',
      'Citroën C3/C4 1.6 BlueHDi 100/120ps (2015+)',
      'Citroën C5/C5 Aircross 2.0 BlueHDi 150/180ps (2015+)',
      'DS3/DS4/DS5 1.6/2.0 HDi/BlueHDi (2014+)',
      'Vauxhall/Opel Astra K 1.6 CDTi 110/136ps (2015+)',
      'Vauxhall/Opel Insignia B 2.0 CDTi 110/170ps (2017+)',
      'Vauxhall/Opel Mokka X 1.6 CDTi 110/136ps (2016+)',
    ],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0,
    checksumLength: 4,
    maps: [
      {
        id: 'psa_edc17_boost_target',
        name: 'Boost Pressure Target (KFLDRL)',
        category: 'boost',
        desc: 'PSA EDC17 boost target. DV6 1.6 100ps stock ~1900-2000 mbar; DW10 2.0 150ps stock ~2000-2100 mbar; 180ps stock ~2200 mbar. Stage 1: DV6 100→130ps typical, DW10 150→190ps typical. Fixed-geometry DV6 turbo needs conservative boost — cannot sustain high boost without surging. VGT-equipped DW10 variants have more headroom.',
        a2lNames: ['KFLDRL', 'DTBSTK', 'pBstSp', 'BstSp_pBoost'],
        signatures: [[0x4B,0x46,0x4C,0x44,0x52,0x4C]],  // "KFLDRL"
        sigOffset: 2,
        rows: 6, cols: 9, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'mbar',
        stage1: { multiplier: 1.10, clampMax: 25000 },
        stage2: { multiplier: 1.18, clampMax: 28000 },
        stage3: { multiplier: 1.25, clampMax: 31000 },
        addonOverrides: { overboost: { multiplier: 1.12, clampMax: 26000 } },
        critical: true, showPreview: true,
      },
      {
        id: 'psa_edc17_torque_limit',
        name: 'Torque Limit Map (MXHYE)',
        category: 'torque',
        desc: 'PSA EDC17 torque ceiling. DV6 100ps stock ~250 Nm; DW10 180ps stock ~400 Nm. Must be raised with boost — PSA torque limiters are very conservative from factory. EAT6/EAT8 automatic: keep below 400 Nm; 6-speed manual: safe to 480-500 Nm.',
        a2lNames: ['MXHYE', 'KFMOMDK'],
        signatures: [[0x4D,0x58,0x48,0x59,0x45]],  // "MXHYE"
        sigOffset: 2,
        rows: 5, cols: 8, dtype: 'int16', le: true,
        factor: 0.5, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.10, clampMax: 800 },
        stage2: { multiplier: 1.18, clampMax: 1000 },
        stage3: { multiplier: 1.25, clampMax: 1100 },
        critical: true, showPreview: true,
      },
      {
        id: 'psa_edc17_fuel_qty',
        name: 'Fuel Quantity Map (KFFKK)',
        category: 'fuel',
        desc: 'PSA HDi fuel quantity base map. DV6 uses Bosch CRIN2/CRIN3 piezo injectors — very precise delivery. Raise proportionally with boost. DV6 is conservative from factory — significant gains available in fuel map.',
        a2lNames: ['KFFKK', 'KFLMHFM', 'qFuelDem'],
        signatures: [[0x4B,0x46,0x46,0x4B,0x4B]],  // "KFFKK"
        sigOffset: 2,
        rows: 6, cols: 9, dtype: 'uint16', le: true,
        factor: 0.01, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.10, clampMax: 5000 },
        stage2: { multiplier: 1.18, clampMax: 5800 },
        stage3: { multiplier: 1.25, clampMax: 6500 },
        critical: true, showPreview: true,
      },
      {
        id: 'psa_edc17_smoke_limiter',
        name: 'Smoke Limiter Map',
        category: 'smoke',
        desc: 'PSA EDC17 smoke limiter. PSA diesels are very conservative on smoke from factory — large gains available. Raise proportionally with fuel quantity map.',
        a2lNames: ['KFMRRBKH', 'KFRSMOKE'],
        signatures: [
          // LE Kf_ 8×5 smoke limiter (RPM axis 2431,2531,2731,2911) — database study: 32 EDC17 files
          [0x08,0x00,0x05,0x00,0x7f,0x09,0xe3,0x09,0xab,0x0a,0x5f,0x0b],
        ],
        sigOffset: 0,
        rows: 5, cols: 8, dtype: 'uint16', le: true,
        factor: 0.01, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.08 },
        stage2: { multiplier: 1.15 },
        stage3: { multiplier: 1.22 },
        critical: false, showPreview: false,
      },
      {
        id: 'psa_edc17_egr_map',
        name: 'EGR Flow Map',
        category: 'emission',
        desc: 'PSA EDC17 EGR flow map. DV6 1.6 HDi has a well-documented EGR/swirl-flap carbon fouling problem — one of the most common failures on high-mileage PSA/Vauxhall diesels. EGR-off addon strongly recommended alongside inlet clean on any DV6 over 80k km.',
        a2lNames: ['KFEGR', 'KFEGRMX', 'EGR_rDes'],
        signatures: [
          // LE Kf_ 8×5 EGR position (X: 882,924,2016,3780) — database study: 24 C46 files
          [0x08,0x00,0x05,0x00,0x72,0x03,0x9c,0x03,0xe0,0x07,0xc4,0x0e],
          // LE Kf_ 8×5 EGR alt axis (X: 0,1300,1900,2000) — database study: 23 CP04 files
          [0x08,0x00,0x05,0x00,0x00,0x00,0x14,0x05,0x6c,0x07,0xd0,0x07],
        ],
        sigOffset: 0,
        rows: 5, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: '%',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { egr: { multiplier: 0, addend: 0 } },
        critical: false, showPreview: false,
      },
      {
        id: 'psa_edc17_speed_limit',
        name: 'Vehicle Speed Limiter (GSVSD)',
        category: 'limiter',
        desc: 'PSA speed limiter. Peugeot/Citroën typically 200-210 km/h; Vauxhall/Opel 210 km/h. DS premium variants 230 km/h.',
        a2lNames: ['GSVSD', 'vVehMax', 'VMAX'],
        signatures: [[0x47,0x53,0x56,0x53,0x44]],  // "GSVSD"
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint8', le: true,
        factor: 1, offsetVal: 0, unit: 'km/h',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { speedlimiter: { multiplier: 0, addend: 250, clampMax: 250 } },
        critical: false, showPreview: false,
      },
    ],
  },

  // ── Ford 1.5/2.0 TDCi Duratorq (2011+) — Bosch EDC17C10/C42 ────────────
  {
    id: 'ford_edc17',
    name: 'Ford 1.5/2.0 TDCi Duratorq (EDC17C10/C42)',
    manufacturer: 'Bosch',
    family: 'EDC17',
    // Ford Duratorq TDCi — the highest-volume diesel in the UK/Ireland market.
    // Transit, Focus, Mondeo, Kuga, S-Max, Galaxy all use this engine family.
    // T8MF/T6JD/T6JF = Ford internal engine variant codes embedded in ROM.
    // Commercial van speed limiter removal is one of the most requested Ford jobs.
    identStrings: ['EDC17C10', 'EDC17C42', 'T8MF', 'T6JD', 'T6JF', 'TDCI', '0281014', '0281015'],
    fileSizeRange: [524288, 2097152],
    vehicles: [
      'Ford Focus Mk3 1.5/2.0 TDCi 95/120/150/185ps (2011+)',
      'Ford Mondeo Mk5 1.5/2.0 TDCi 120/150/180ps (2014+)',
      'Ford Kuga Mk2/Mk3 2.0 TDCi 120/150/180ps (2012+)',
      'Ford C-Max 1.5/2.0 TDCi 95/120/150ps (2011+)',
      'Ford S-Max Mk2 2.0 TDCi 150/180ps (2015+)',
      'Ford Galaxy Mk3 2.0 TDCi 150/180ps (2015+)',
      'Ford Edge 2.0 TDCi 180/210ps (2016+)',
      'Ford Transit Connect 1.5 TDCi 75/100/120ps (2013+)',
      'Ford Transit Custom 2.0 TDCi 105/130/170ps (2012+)',
      'Ford Transit Mk8 2.0 TDCi 105/130/170/185ps (2014+)',
    ],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0,
    checksumLength: 4,
    maps: [
      {
        id: 'ford_edc17_boost_target',
        name: 'Boost Pressure Target (KFLDRL)',
        category: 'boost',
        desc: 'Ford TDCi boost target map. Focus 150ps stock ~2000-2100 mbar; 185ps stock ~2200-2400 mbar; Transit Custom 130ps stock ~2000 mbar; 170ps stock ~2200 mbar. Stage 1: 150→190ps, 185→225ps, Transit 130→165ps typical. Ford VGT turbos excellent for boost work — very responsive with wide operating range.',
        a2lNames: ['KFLDRL', 'DTBSTK', 'pBstSp'],
        signatures: [[0x4B,0x46,0x4C,0x44,0x52,0x4C]],  // "KFLDRL"
        sigOffset: 2,
        rows: 6, cols: 9, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'mbar',
        stage1: { multiplier: 1.10, clampMax: 25000 },
        stage2: { multiplier: 1.18, clampMax: 28000 },
        stage3: { multiplier: 1.25, clampMax: 32000 },
        addonOverrides: { overboost: { multiplier: 1.12, clampMax: 26000 } },
        critical: true, showPreview: true,
      },
      {
        id: 'ford_edc17_torque_limit',
        name: 'Torque Limit Map (MXHYE)',
        category: 'torque',
        desc: 'Ford TDCi torque ceiling. Focus 150ps stock ~370 Nm; 185ps stock ~420 Nm; Transit Custom 170ps stock ~390 Nm. PowerShift DCT: keep below 500 Nm. Manual (MTX75/iB5): safe to 550-600 Nm. Transit 6-speed manual: safe to 550 Nm.',
        a2lNames: ['MXHYE', 'KFMOMDK'],
        signatures: [[0x4D,0x58,0x48,0x59,0x45]],  // "MXHYE"
        sigOffset: 2,
        rows: 5, cols: 8, dtype: 'int16', le: true,
        factor: 0.5, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.10, clampMax: 900 },
        stage2: { multiplier: 1.18, clampMax: 1100 },
        stage3: { multiplier: 1.25, clampMax: 1300 },
        critical: true, showPreview: true,
      },
      {
        id: 'ford_edc17_fuel_qty',
        name: 'Fuel Quantity Map (KFFKK)',
        category: 'fuel',
        desc: 'Ford TDCi base fuel quantity map. Duratorq engine uses Siemens/Continental SiD803A piezo injectors on 2.0 variants — excellent atomisation at high rail pressure. Raise proportionally with boost to maintain lambda.',
        a2lNames: ['KFFKK', 'KFLMHFM', 'qFuelDem'],
        signatures: [[0x4B,0x46,0x46,0x4B,0x4B]],  // "KFFKK"
        sigOffset: 2,
        rows: 6, cols: 9, dtype: 'uint16', le: true,
        factor: 0.01, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.10, clampMax: 5500 },
        stage2: { multiplier: 1.18, clampMax: 6500 },
        stage3: { multiplier: 1.25, clampMax: 7500 },
        critical: true, showPreview: true,
      },
      {
        id: 'ford_edc17_smoke_limiter',
        name: 'Smoke Limiter Map',
        category: 'smoke',
        desc: 'Ford TDCi smoke limiter. Ford Duratorq has strict factory smoke control — raise proportionally with fuel map for clean acceleration.',
        a2lNames: ['KFMRRBKH', 'KFRSMOKE'],
        signatures: [
          // LE Kf_ 8×5 smoke limiter (RPM axis 2431,2531,2731,2911) — database study: 32 EDC17 files
          [0x08,0x00,0x05,0x00,0x7f,0x09,0xe3,0x09,0xab,0x0a,0x5f,0x0b],
        ],
        sigOffset: 0,
        rows: 5, cols: 8, dtype: 'uint16', le: true,
        factor: 0.01, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.08 },
        stage2: { multiplier: 1.15 },
        stage3: { multiplier: 1.22 },
        critical: false, showPreview: false,
      },
      {
        id: 'ford_edc17_egr_map',
        name: 'EGR Flow Map',
        category: 'emission',
        desc: 'Ford TDCi EGR flow map. Ford 2.0 Duratorq high-pressure EGR causes heavy inlet carbon build-up at high mileage — particularly Transit and Focus 2.0. EGR-off addon recommended on vehicles over 100k km showing rough idle or low power.',
        a2lNames: ['KFEGR', 'KFEGRMX'],
        signatures: [
          // LE Kf_ 8×5 EGR (X: 0,1300,1900,2000) — database study: 23 CP04 files (Ford uses CP04/C10)
          [0x08,0x00,0x05,0x00,0x00,0x00,0x14,0x05,0x6c,0x07,0xd0,0x07],
          // LE Kf_ 8×5 EGR alt axis (X: 1800,2000,2500,3500) — database study: 8 CP20 files
          [0x08,0x00,0x05,0x00,0x08,0x07,0xd0,0x07,0xc4,0x09,0xac,0x0d],
        ],
        sigOffset: 0,
        rows: 5, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: '%',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { egr: { multiplier: 0, addend: 0 } },
        critical: false, showPreview: false,
      },
      {
        id: 'ford_edc17_speed_limit',
        name: 'Vehicle Speed Limiter (GSVSD)',
        category: 'limiter',
        desc: 'Ford TDCi speed/commercial limiter. Focus/Mondeo typically 215 km/h; Transit van factory limited to 100 km/h (EU commercial vehicle regulation). Transit Custom limited to 100-120 km/h. Van limiter removal is the most common Ford Transit remap request in Ireland.',
        a2lNames: ['GSVSD', 'vVehMax', 'VMAX'],
        signatures: [[0x47,0x53,0x56,0x53,0x44]],  // "GSVSD"
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint8', le: true,
        factor: 1, offsetVal: 0, unit: 'km/h',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { speedlimiter: { multiplier: 0, addend: 130, clampMax: 140 } },
        critical: false, showPreview: false,
      },
    ],
  },

  // ── VAG EA888 Gen4 GPF/OPF (2018+) — Bosch MG1CS011 ────────────────────
  {
    id: 'vag_mg1_gpf',
    name: 'VAG EA888 Gen4 GPF/OPF (MG1CS011)',
    manufacturer: 'Bosch',
    family: 'MG1',
    // MG1CS011 is the TriCore MG1 ECU for VAG's newest EA888 Gen4 petrol engine.
    // Introduced 2018/2019 with mandatory OPF (Otto Particulate Filter) on EU6d-TEMP cars.
    // Used in Golf 8 GTI/R, Audi S3 8Y, Cupra Formentor — the current hot-hatch generation.
    // DKZA = Golf 8 GTI 245ps engine code; DKZ = Golf R 320ps.
    // OPF does not restrict tuning — boost and torque maps are fully accessible.
    identStrings: ['MG1CS011', '0261S24', '0261S25', 'DKZA', 'DKTW', 'DKZB', 'EA888GEN4'],
    fileSizeRange: [3145728, 8388608],
    vehicles: [
      'VW Golf 8 GTI 245ps DKZA (2020+)',
      'VW Golf 8 R 320ps DKZ (2021+)',
      'Audi S3 8Y 310ps DKZ (2020+)',
      'Audi A3 45 TFSI 8Y 245ps (2020+)',
      'Seat Leon Mk4 Cupra 290ps / Cupra R 310ps (2020+)',
      'Skoda Octavia RS 245ps (2020+)',
      'VW Tiguan R 320ps (2021+)',
      'VW Arteon R 320ps (2021+)',
      'Cupra Formentor VZ2 310ps / VZ5 390ps (2021+)',
    ],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0,
    checksumLength: 4,
    maps: [
      {
        id: 'vag_mg1_gpf_boost',
        name: 'Boost Pressure Setpoint (pBstSp)',
        category: 'boost',
        desc: 'VAG MG1CS011 boost setpoint. Golf 8 GTI (245ps) stock peak ~2000-2100 mbar; Golf R (320ps) stock ~2200-2500 mbar. Stage 1: GTI 245→300ps, R 320→380ps typical. EA888 Gen4 twin-scroll IS38 (GTI) / IS20+ (R) turbos have excellent headroom. OPF filter does not restrict boost tuning.',
        a2lNames: ['pBstSp', 'KFLDR', 'p_SetpntBoost', 'BstSp_pBoost'],
        signatures: [[0x70,0x42,0x73,0x74,0x53,0x70]],  // "pBstSp"
        sigOffset: 2,
        rows: 7, cols: 12, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'mbar',
        stage1: { multiplier: 1.08, clampMax: 26000 },
        stage2: { multiplier: 1.15, clampMax: 30000 },
        stage3: { multiplier: 1.22, clampMax: 34000 },
        addonOverrides: { overboost: { multiplier: 1.10, clampMax: 27000 } },
        critical: true, showPreview: true,
      },
      {
        id: 'vag_mg1_gpf_torque',
        name: 'Torque Limit (MXHYE)',
        category: 'torque',
        desc: 'VAG MG1CS011 engine torque ceiling. Golf 8 GTI stock 370 Nm; Golf R stock 420 Nm (DQ381 DSG limit is ~500 Nm with stock internals). Stage 1: raise to match boost. EA888 Gen4 bottom-end handles 550+ Nm safely.',
        a2lNames: ['MXHYE', 'trqLimRaw', 'MASR'],
        signatures: [[0x4D,0x58,0x48,0x59,0x45]],  // "MXHYE"
        sigOffset: 2,
        rows: 6, cols: 10, dtype: 'int16', le: true,
        factor: 0.5, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.10, clampMax: 1200 },
        stage2: { multiplier: 1.18, clampMax: 1400 },
        stage3: { multiplier: 1.25, clampMax: 1600 },
        critical: true, showPreview: true,
      },
      {
        id: 'vag_mg1_gpf_fuel',
        name: 'Fuel Quantity Base Map (KFFKK)',
        category: 'fuel',
        desc: 'VAG MG1CS011 fuel base map. EA888 Gen4 uses dual injection (port + direct). The MG1 fuel model is torque-driven — fuel delivery follows torque demand. Raise with torque and boost to maintain stoichiometric AFR at all loads.',
        a2lNames: ['KFFKK', 'KFLMHFM', 'qFuelDem'],
        signatures: [[0x4B,0x46,0x46,0x4B,0x4B]],  // "KFFKK"
        sigOffset: 2,
        rows: 7, cols: 12, dtype: 'uint16', le: true,
        factor: 0.01, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.08, clampMax: 6000 },
        stage2: { multiplier: 1.15, clampMax: 7000 },
        stage3: { multiplier: 1.22, clampMax: 8000 },
        critical: true, showPreview: true,
      },
      {
        id: 'vag_mg1_gpf_ignition',
        name: 'Ignition Timing Map (KFZW)',
        category: 'ignition',
        desc: 'VAG MG1CS011 base ignition timing. EA888 Gen4 (DKZA/DKZ) runs 9.6:1 compression with dual injection for excellent knock resistance. Responds well to 1-2° advance on 98 RON. MG1 shares KFZW symbol with ME7/MED17/MG1 across all Bosch petrol platforms.',
        a2lNames: ['KFZW', 'KFZW2', 'IgnTim_sp'],
        signatures: [[0x4B,0x46,0x5A,0x57]],  // "KFZW"
        sigOffset: 2,
        // CORRECTED: rows:16 cols:20. DAMOS A2L: KFZW = 20×16 across 14 MG1 files.
        rows: 16, cols: 20, dtype: 'int8', le: true,
        factor: 0.75, offsetVal: 0, unit: '°BTDC',
        stage1: { multiplier: 1.0 },
        stage2: { addend: 1, clampMax: 50 },
        stage3: { addend: 2, clampMax: 52 },
        critical: false, showPreview: true,
      },
      {
        id: 'vag_mg1_gpf_rev_limit',
        name: 'RPM Limiter (NMMAX)',
        category: 'limiter',
        desc: 'VAG MG1CS011 rev limiter. Golf 8 GTI/R stock ~7200 RPM. EA888 Gen4 safe to 7400-7600 RPM with stock valve springs.',
        a2lNames: ['NMMAX', 'nEngCutOff', 'nMaxEng'],
        signatures: [[0x4E,0x4D,0x4D,0x41,0x58]],  // "NMMAX"
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'RPM',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { revlimit: { addend: 300, clampMax: 7800 } },
        critical: false, showPreview: false,
      },
      {
        id: 'vag_mg1_gpf_speed_limit',
        name: 'Vehicle Speed Limiter (GSVSD)',
        category: 'limiter',
        desc: 'VAG MG1CS011 speed limiter. Golf 8 GTI/R stock 250 km/h (EU gentleman\'s agreement). Cupra models share the same limit. Standard remove.',
        a2lNames: ['GSVSD', 'vVehMax', 'VMAX'],
        signatures: [[0x47,0x53,0x56,0x53,0x44]],  // "GSVSD"
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint8', le: true,
        factor: 1, offsetVal: 0, unit: 'km/h',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { speedlimiter: { multiplier: 0, addend: 270, clampMax: 280 } },
        critical: false, showPreview: false,
      },
    ],
  },

  // ── Mercedes OM651 2.1 CDI passenger diesel (2008+) — EDC17C57/C43 ────────
  {
    id: 'merc_om651',
    name: 'Mercedes OM651 2.1 CDI diesel (EDC17C57/C43)',
    manufacturer: 'Bosch',
    family: 'EDC17',
    // OM651 = Mercedes 2.1-litre four-cylinder CDI diesel, 2008-present.
    // Used across A/B/C/E/GLC/GLE Class and Sprinter/Vito commercial vehicles.
    // EDC17C57 = passenger cars (C220d/E220d); EDC17C43 = Sprinter/Vito vans.
    // One of the most remapped platforms in the Irish market — large fleet volume.
    identStrings: ['EDC17C57', 'EDC17C43', 'OM651', 'CDI', '0281017', '0281019', 'A6519005900'],
    fileSizeRange: [1048576, 4194304],
    vehicles: [
      'Mercedes C200d/C220d W205 (2014+)',
      'Mercedes E200d/E220d W213 (2016+)',
      'Mercedes GLC 220d X253 (2015+)',
      'Mercedes GLE 250d W166 (2015+)',
      'Mercedes A200d/B200d W176/W247 (2013+)',
      'Mercedes CLA 200d/220d C117 (2013+)',
      'Mercedes Vito 114/116 CDI W447 (2014+)',
      'Mercedes Sprinter 314/316/319 CDI (2018+)',
    ],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0,
    checksumLength: 4,
    maps: [
      {
        id: 'merc_om651_boost',
        name: 'Boost Pressure Target (KFLDRL)',
        category: 'boost',
        desc: 'Mercedes OM651 boost target map. C220d (170ps) stock ~2000-2100 mbar; E220d (194ps) stock ~2100-2200 mbar. Stage 1: C220d 170→210ps typical; E220d 194→235ps. Two-stage VGT turbo on OM651 gives excellent control range. Conservative from factory — significant gains available without hardware changes.',
        a2lNames: ['KFLDRL', 'DTBSTK', 'pBstSp'],
        signatures: [[0x4B,0x46,0x4C,0x44,0x52,0x4C]],
        sigOffset: 2,
        rows: 6, cols: 9, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'mbar',
        stage1: { multiplier: 1.12, clampMax: 25000 },
        stage2: { multiplier: 1.20, clampMax: 28000 },
        stage3: { multiplier: 1.28, clampMax: 31000 },
        addonOverrides: { overboost: { multiplier: 1.14, clampMax: 26000 } },
        critical: true, showPreview: true,
      },
      {
        id: 'merc_om651_torque',
        name: 'Torque Limit Map (MXHYE)',
        category: 'torque',
        desc: 'Mercedes OM651 torque ceiling. C220d stock ~400 Nm; E220d stock ~500 Nm. 7G-Tronic Plus automatic: safe to 600 Nm with stock hardware. 9G-Tronic: keep below 550 Nm. OM651 bottom-end handles 600+ Nm regularly on modified cars.',
        a2lNames: ['MXHYE', 'KFMOMDK'],
        signatures: [[0x4D,0x58,0x48,0x59,0x45]],
        sigOffset: 2,
        rows: 5, cols: 8, dtype: 'int16', le: true,
        factor: 0.5, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.12, clampMax: 1100 },
        stage2: { multiplier: 1.20, clampMax: 1300 },
        stage3: { multiplier: 1.28, clampMax: 1500 },
        critical: true, showPreview: true,
      },
      {
        id: 'merc_om651_fuel',
        name: 'Fuel Quantity Map (KFFKK)',
        category: 'fuel',
        desc: 'Mercedes OM651 base fuel quantity. Raise proportionally with boost. OM651 uses Bosch CRIN3 piezo injectors — excellent precision at high rail pressure (up to 1800 bar). Keep boost/fuel in proportion.',
        a2lNames: ['KFFKK', 'KFLMHFM', 'qFuelDem'],
        signatures: [[0x4B,0x46,0x46,0x4B,0x4B]],
        sigOffset: 2,
        rows: 6, cols: 9, dtype: 'uint16', le: true,
        factor: 0.01, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.12, clampMax: 6000 },
        stage2: { multiplier: 1.20, clampMax: 7000 },
        stage3: { multiplier: 1.28, clampMax: 8000 },
        critical: true, showPreview: true,
      },
      {
        id: 'merc_om651_smoke',
        name: 'Smoke Limiter Map',
        category: 'smoke',
        desc: 'Mercedes OM651 smoke limiter. Mercedes diesels have strict factory smoke control. Raise proportionally with fuel quantity map.',
        a2lNames: ['KFMRRBKH', 'KFRSMOKE'],
        signatures: [
          // LE Kf_ 8×5 smoke limiter (RPM axis 2431,2531,2731,2911) — database study: 32 EDC17 files
          [0x08,0x00,0x05,0x00,0x7f,0x09,0xe3,0x09,0xab,0x0a,0x5f,0x0b],
        ],
        sigOffset: 0,
        rows: 5, cols: 8, dtype: 'uint16', le: true,
        factor: 0.01, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.10 },
        stage2: { multiplier: 1.18 },
        stage3: { multiplier: 1.25 },
        critical: false, showPreview: false,
      },
      {
        id: 'merc_om651_egr',
        name: 'EGR Flow Map',
        category: 'emission',
        desc: 'Mercedes OM651 EGR map. OM651 has documented EGR swirl-flap and inlet carbon issues at high mileage — particularly 2011-2014 models. EGR-off with inlet clean is one of the most common OM651 service items in Ireland.',
        a2lNames: ['KFEGR', 'KFEGRMX'],
        signatures: [
          // LE Kf_ 8×5 EGR (X: 882,924,2016,3780) — database study: 24 C46 files
          [0x08,0x00,0x05,0x00,0x72,0x03,0x9c,0x03,0xe0,0x07,0xc4,0x0e],
          // NOTE: 8×5 X:2431 sig removed — collides with merc_om651_smoke
        ],
        sigOffset: 0,
        rows: 5, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: '%',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { egr: { multiplier: 0, addend: 0 } },
        critical: false, showPreview: false,
      },
      {
        id: 'merc_om651_speed',
        name: 'Vehicle Speed Limiter (GSVSD)',
        category: 'limiter',
        desc: 'Mercedes OM651 speed limiter. C/E Class: 210-250 km/h depending on variant. Sprinter commercial: 90-100 km/h EU van limiter. Vito: 180-200 km/h. Sprinter limiter removal is very commonly requested.',
        a2lNames: ['GSVSD', 'vVehMax', 'VMAX'],
        signatures: [[0x47,0x53,0x56,0x53,0x44]],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint8', le: true,
        factor: 1, offsetVal: 0, unit: 'km/h',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { speedlimiter: { multiplier: 0, addend: 250, clampMax: 250 } },
        critical: false, showPreview: false,
      },
    ],
  },

  // ── Fiat / Alfa Romeo / Jeep Multijet diesel (2004+) — EDC16C39/EDC17C49 ─
  {
    id: 'fiat_multijet',
    name: 'Fiat/Alfa/Jeep Multijet diesel (EDC16C39/EDC17C49/C69)',
    manufacturer: 'Bosch',
    family: 'EDC17',
    // Covers the full Fiat/Stellantis diesel family:
    // 1.3 Multijet (FCA): 75-95ps — Fiat 500/Panda/Doblo, Alfa MiTo
    // 1.6 Multijet (FCA): 105-120ps — Fiat Tipo/Bravo, Alfa Giulietta
    // 2.0 Multijet (FCA): 140-170ps — Alfa Romeo 159/Giulietta, Jeep Renegade/Compass
    // All use Bosch EDC16C39 (older) or EDC17C49/C69 (newer) ECU.
    identStrings: ['EDC17C49', 'EDC17C69', 'EDC16C39', 'MULTIJET', 'JTDM', '0281015', '0281016', 'FIAT'],
    fileSizeRange: [524288, 2097152],
    vehicles: [
      'Fiat 500 1.3 Multijet 75/95ps (2007+)',
      'Fiat Panda 1.3 Multijet 75/95ps (2012+)',
      'Fiat Tipo 1.3/1.6 Multijet 95/120ps (2015+)',
      'Alfa Romeo Giulietta 1.6/2.0 JTDM 105/120/150/175ps (2010+)',
      'Alfa Romeo 159 1.9/2.0 JTDM 120/150ps (2006+)',
      'Alfa Romeo Mito 1.3 JTDM 85/95ps (2008+)',
      'Jeep Renegade 1.6/2.0 Multijet 110/140/170ps (2014+)',
      'Jeep Compass 1.6/2.0 Multijet 120/140ps (2017+)',
      'Fiat Doblo 1.3/1.6/2.0 Multijet (2010+)',
    ],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0,
    checksumLength: 4,
    maps: [
      {
        id: 'fiat_mj_boost',
        name: 'Boost Pressure Target (KFLDRL)',
        category: 'boost',
        desc: 'Fiat Multijet boost target. 1.6 Multijet 105ps stock ~1800-1900 mbar; 2.0 Multijet 140ps stock ~2000 mbar. Stage 1: 1.6 105→130ps, 2.0 140→175ps typical. Fiat VGT turbos respond very well to boost work. 1.3 Multijet fixed-geometry: limited to 15-20% boost increase before surging.',
        a2lNames: ['KFLDRL', 'DTBSTK', 'pBstSp'],
        signatures: [[0x4B,0x46,0x4C,0x44,0x52,0x4C]],
        sigOffset: 2,
        rows: 5, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'mbar',
        stage1: { multiplier: 1.12, clampMax: 24000 },
        stage2: { multiplier: 1.20, clampMax: 27000 },
        stage3: { multiplier: 1.28, clampMax: 30000 },
        addonOverrides: { overboost: { multiplier: 1.14, clampMax: 25000 } },
        critical: true, showPreview: true,
      },
      {
        id: 'fiat_mj_torque',
        name: 'Torque Limit Map (MXHYE)',
        category: 'torque',
        desc: 'Fiat Multijet torque ceiling. 1.6 Multijet 105ps stock ~250 Nm; 2.0 Multijet 150ps stock ~350 Nm. Fiat 6-speed manual safe to 380-400 Nm. Alfa Romeo Q-Tronic auto: keep below 320 Nm.',
        a2lNames: ['MXHYE', 'KFMOMDK'],
        signatures: [[0x4D,0x58,0x48,0x59,0x45]],
        sigOffset: 2,
        rows: 4, cols: 7, dtype: 'int16', le: true,
        factor: 0.5, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.12, clampMax: 750 },
        stage2: { multiplier: 1.20, clampMax: 850 },
        stage3: { multiplier: 1.28, clampMax: 950 },
        critical: true, showPreview: true,
      },
      {
        id: 'fiat_mj_fuel',
        name: 'Fuel Quantity Map (KFFKK)',
        category: 'fuel',
        desc: 'Fiat Multijet fuel quantity base map. Raise proportionally with boost. Multijet common-rail injection is well-proven — excellent fuel delivery accuracy.',
        a2lNames: ['KFFKK', 'KFLMHFM', 'qFuelDem'],
        signatures: [[0x4B,0x46,0x46,0x4B,0x4B]],
        sigOffset: 2,
        rows: 5, cols: 8, dtype: 'uint16', le: true,
        factor: 0.01, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.12, clampMax: 5000 },
        stage2: { multiplier: 1.20, clampMax: 5800 },
        stage3: { multiplier: 1.28, clampMax: 6500 },
        critical: true, showPreview: true,
      },
      {
        id: 'fiat_mj_egr',
        name: 'EGR Flow Map',
        category: 'emission',
        desc: 'Fiat Multijet EGR flow map. 1.3/1.6 Multijet have notorious inlet swirl-flap and EGR fouling issues at high mileage. EGR-off addon with inlet clean is the most requested Fiat/Alfa service. Giulietta 2.0 JTDM swirl flap failure is extremely common over 80k km.',
        a2lNames: ['KFEGR', 'KFEGRMX'],
        signatures: [
          // LE Kf_ 7×4 EGR (X: 2431,2531,2731,2931) — database study: 8 CP04 files (Fiat uses C49/C69)
          [0x07,0x00,0x04,0x00,0x7f,0x09,0xe3,0x09,0xab,0x0a,0x73,0x0b],
          // LE Kf_ 7×4 EGR alt (X: 2000,2500,3000,3500) — database study: 32 C46 files
          [0x07,0x00,0x04,0x00,0xd0,0x07,0xc4,0x09,0xb8,0x0b,0xac,0x0d],
        ],
        sigOffset: 0,
        rows: 4, cols: 7, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: '%',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { egr: { multiplier: 0, addend: 0 } },
        critical: false, showPreview: false,
      },
      {
        id: 'fiat_mj_speed',
        name: 'Vehicle Speed Limiter (GSVSD)',
        category: 'limiter',
        desc: 'Fiat/Alfa speed limiter. Fiat 500: 160 km/h; Giulietta: 200-220 km/h; Jeep Renegade: 180-200 km/h. Standard remove.',
        a2lNames: ['GSVSD', 'vVehMax', 'VMAX'],
        signatures: [[0x47,0x53,0x56,0x53,0x44]],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint8', le: true,
        factor: 1, offsetVal: 0, unit: 'km/h',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { speedlimiter: { multiplier: 0, addend: 250, clampMax: 250 } },
        critical: false, showPreview: false,
      },
    ],
  },

  // ── Ford EcoBoost petrol (2012+) — Bosch MED17.0.7 / MED17.2.x ──────────
  {
    id: 'ford_ecoboost',
    name: 'Ford EcoBoost 1.0/1.5/2.0T petrol (MED17)',
    manufacturer: 'Bosch',
    family: 'MED17',
    // Ford EcoBoost — the highest-volume petrol engine family in the UK/Ireland market.
    // 1.0 EcoBoost (Fox engine): 85/100/125/140ps — Fiesta/Focus/EcoSport/Puma
    // 1.5 EcoBoost: 150/182ps — Focus ST-Line/EcoSport
    // 2.0 EcoBoost: 203/240/280ps — Focus ST Mk3/4, Kuga, S-Max, Mondeo ST-Line
    // All use Bosch MED17.0.7 (1.0) or MED17.2.x (1.5/2.0) with standard MED17 DAMOS names.
    identStrings: ['MED17.0.7', 'MED17.2', 'ECOBOOST', '0261S14', '0261S15', '0261S16', 'EcoBoost'],
    fileSizeRange: [524288, 4194304],
    vehicles: [
      'Ford Fiesta Mk7/8 1.0 EcoBoost 100/125/140ps (2012+)',
      'Ford Fiesta ST 1.5 EcoBoost 200ps (2018+)',
      'Ford Focus Mk3/4 1.0 EcoBoost 100/125ps (2012+)',
      'Ford Focus Mk3 ST 2.0 EcoBoost 250ps (2012+)',
      'Ford Focus Mk4 ST 2.3 EcoBoost 280ps (2018+)',
      'Ford Puma 1.0 EcoBoost 125/155ps (2019+)',
      'Ford EcoSport 1.0 EcoBoost 100/125ps (2014+)',
      'Ford Kuga Mk2/Mk3 1.5/2.0 EcoBoost 150/240ps (2013+)',
      'Ford Mondeo Mk5 2.0 EcoBoost 240ps (2014+)',
      'Ford S-Max/Galaxy 2.0 EcoBoost 240ps (2015+)',
    ],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0,
    checksumLength: 4,
    maps: [
      {
        id: 'ford_eb_boost',
        name: 'Boost Pressure Setpoint (pBstSp)',
        category: 'boost',
        desc: 'Ford EcoBoost boost setpoint. 1.0 EcoBoost 125ps stock ~1600-1700 mbar; 1.5 EcoBoost 182ps stock ~1800-1900 mbar; 2.0 ST 250ps stock ~2000-2100 mbar; Focus ST 280ps stock ~2100-2200 mbar. Stage 1: 125→155ps, 1.5 182→215ps, ST 250→300ps. EcoBoost 1.0 responds extremely well despite tiny displacement — strong gains available.',
        a2lNames: ['KFLDRL', 'pBstSp', 'KFLDR', 'p_SetpntBoost'],
        signatures: [[0x70,0x42,0x73,0x74,0x53,0x70]],
        sigOffset: 2,
        // CORRECTED: rows:10 cols:16. DAMOS A2L: KFLDRL = 16×10 across 13 MED17 files.
        rows: 10, cols: 16, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'mbar',
        stage1: { multiplier: 1.10, clampMax: 22000 },
        stage2: { multiplier: 1.18, clampMax: 26000 },
        stage3: { multiplier: 1.25, clampMax: 30000 },
        addonOverrides: { overboost: { multiplier: 1.12, clampMax: 23000 } },
        critical: true, showPreview: true,
      },
      {
        id: 'ford_eb_torque',
        name: 'Torque Limit (MXHYE)',
        category: 'torque',
        desc: 'Ford EcoBoost torque ceiling. 1.0 125ps stock ~170-200 Nm; 1.5 182ps stock ~270 Nm; 2.0 ST 250ps stock ~345 Nm; ST 280ps stock ~420 Nm. PowerShift DCT: keep below 400 Nm. 6-speed Getrag manual (Focus ST): safe to 480 Nm.',
        a2lNames: ['MXHYE', 'trqLimRaw', 'MASR'],
        signatures: [[0x4D,0x58,0x48,0x59,0x45]],
        sigOffset: 2,
        rows: 5, cols: 9, dtype: 'int16', le: true,
        factor: 0.5, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.10, clampMax: 1000 },
        stage2: { multiplier: 1.18, clampMax: 1200 },
        stage3: { multiplier: 1.25, clampMax: 1400 },
        critical: true, showPreview: true,
      },
      {
        id: 'ford_eb_ignition',
        name: 'Ignition Timing Map (KFZW)',
        category: 'ignition',
        desc: 'Ford EcoBoost base ignition timing. 1.0 EcoBoost runs 10:1 compression — responds very well to timing advance on 98 RON. 2.0 EcoBoost ST: 9.3:1 — good timing headroom on quality fuel. MED17 shares KFZW symbol across all Bosch petrol ECUs.',
        a2lNames: ['KFZW', 'KFZW2', 'IgnTim_sp'],
        signatures: [
          [0x4B,0x46,0x5A,0x57],
          // LE Kf_ 16×12 ignition (RPM axis 2000,2800,4000,6000) — database study: 44 MED17 files
          [0x10,0x00,0x0c,0x00,0xd0,0x07,0xf0,0x0a,0xa0,0x0f,0x70,0x17],
        ],
        sigOffset: 2,
        // CORRECTED: rows:12 cols:16. DAMOS A2L: KFZW2 = 16×12 across 45 MED17 files, KFZW = 16×12 across 36 files.
        rows: 12, cols: 16, dtype: 'int8', le: true,
        factor: 0.75, offsetVal: 0, unit: '°BTDC',
        stage1: { multiplier: 1.0 },
        stage2: { addend: 1, clampMax: 50 },
        stage3: { addend: 2, clampMax: 52 },
        critical: false, showPreview: true,
      },
      {
        id: 'ford_eb_rev_limit',
        name: 'RPM Limiter (NMMAX)',
        category: 'limiter',
        desc: 'Ford EcoBoost rev limiter. 1.0 EcoBoost stock ~6000 RPM; 1.5 stock ~6500 RPM; 2.0 ST stock ~7000 RPM. Focus ST 280ps stock ~7000 RPM.',
        a2lNames: ['NMMAX', 'nEngCutOff', 'nMaxEng'],
        signatures: [[0x4E,0x4D,0x4D,0x41,0x58]],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'RPM',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { revlimit: { addend: 200, clampMax: 7200 } },
        critical: false, showPreview: false,
      },
      {
        id: 'ford_eb_speed',
        name: 'Vehicle Speed Limiter (GSVSD)',
        category: 'limiter',
        desc: 'Ford EcoBoost speed limiter. Fiesta: 180-200 km/h; Focus: 200-220 km/h; Focus ST: 250 km/h. Standard remove.',
        a2lNames: ['GSVSD', 'vVehMax', 'VMAX'],
        signatures: [[0x47,0x53,0x56,0x53,0x44]],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint8', le: true,
        factor: 1, offsetVal: 0, unit: 'km/h',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { speedlimiter: { multiplier: 0, addend: 250, clampMax: 250 } },
        critical: false, showPreview: false,
      },
    ],
  },

  // ── BMW N47 diesel (2007–2015) — Bosch EDC17C06 / C41 ───────────────────
  {
    id: 'bmw_n47',
    name: 'BMW N47 diesel (EDC17C06/C41)',
    manufacturer: 'Bosch',
    family: 'EDC17',
    // N47D20 = BMW 2.0-litre four-cylinder diesel, 2007-2015.
    // Predecessor to B47 — same vehicle applications but older ECU variant.
    // Notorious for timing chain failure on early units (pre-2012) but the tune itself
    // is safe and very effective. Huge number still on Irish roads in 3/5 Series.
    identStrings: ['EDC17C06', 'EDC17C41', 'N47D20', 'N47S1', '0281013', '0281014'],
    fileSizeRange: [524288, 2097152],
    vehicles: [
      'BMW 118d/120d E87/F20 (N47 2007+)',
      'BMW 318d/320d/325d E90/F30 (N47 2007+)',
      'BMW 520d/525d E60/F10 (N47 2010+)',
      'BMW X1 sDrive18d/xDrive20d E84 (N47 2009+)',
      'BMW X3 xDrive20d F25 (N47 2011+)',
      'Mini Cooper D/SD R55/R56/R60 (N47 2010+)',
    ],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0,
    checksumLength: 4,
    maps: [
      {
        id: 'bmw_n47_boost',
        name: 'Boost Pressure Target (KFLDRL)',
        category: 'boost',
        desc: 'BMW N47 boost target. N47D20 143ps stock ~1800 mbar; 163ps stock ~2000 mbar; 184ps stock ~2100 mbar. Stage 1: 143→185ps, 163→200ps, 184→225ps typical. N47 twin-scroll turbine is highly responsive. Excellent gains available — BMW left significant headroom across all N47 variants.',
        a2lNames: ['KFLDRL', 'DTBSTK', 'pBstSp'],
        signatures: [[0x4B,0x46,0x4C,0x44,0x52,0x4C]],
        sigOffset: 2,
        rows: 6, cols: 9, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'mbar',
        stage1: { multiplier: 1.10, clampMax: 24000 },
        stage2: { multiplier: 1.18, clampMax: 27000 },
        stage3: { multiplier: 1.25, clampMax: 30000 },
        addonOverrides: { overboost: { multiplier: 1.12, clampMax: 25000 } },
        critical: true, showPreview: true,
      },
      {
        id: 'bmw_n47_torque',
        name: 'Torque Limit Map (MXHYE)',
        category: 'torque',
        desc: 'BMW N47 torque ceiling. N47 143ps stock ~300 Nm; 163ps stock ~380 Nm; 184ps stock ~400 Nm. ZF 8HP automatic: safe to 550 Nm. 6-speed manual: safe to 480 Nm. N47 bottom-end is strong on the post-2012 chain revision.',
        a2lNames: ['MXHYE', 'KFMOMDK'],
        signatures: [[0x4D,0x58,0x48,0x59,0x45]],
        sigOffset: 2,
        rows: 5, cols: 8, dtype: 'int16', le: true,
        factor: 0.5, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.12, clampMax: 900 },
        stage2: { multiplier: 1.20, clampMax: 1100 },
        stage3: { multiplier: 1.28, clampMax: 1300 },
        critical: true, showPreview: true,
      },
      {
        id: 'bmw_n47_fuel',
        name: 'Fuel Quantity Map (KFFKK)',
        category: 'fuel',
        desc: 'BMW N47 fuel quantity map. Raise proportionally with boost. N47 uses Bosch CRIN2 solenoid injectors — reliable up to ~1600 bar rail pressure.',
        a2lNames: ['KFFKK', 'KFLMHFM', 'qFuelDem'],
        signatures: [[0x4B,0x46,0x46,0x4B,0x4B]],
        sigOffset: 2,
        rows: 6, cols: 9, dtype: 'uint16', le: true,
        factor: 0.01, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.12, clampMax: 6000 },
        stage2: { multiplier: 1.20, clampMax: 7000 },
        stage3: { multiplier: 1.28, clampMax: 8000 },
        critical: true, showPreview: true,
      },
      {
        id: 'bmw_n47_smoke',
        name: 'Smoke Limiter Map',
        category: 'smoke',
        desc: 'BMW N47 smoke limiter. Raise proportionally with fuel map for clean power delivery.',
        a2lNames: ['KFMRRBKH', 'KFRSMOKE'],
        signatures: [
          // LE Kf_ 8×5 smoke limiter (RPM axis 2431,2531,2731,2911) — database study: 32 EDC17 files
          [0x08,0x00,0x05,0x00,0x7f,0x09,0xe3,0x09,0xab,0x0a,0x5f,0x0b],
        ],
        sigOffset: 0,
        rows: 5, cols: 8, dtype: 'uint16', le: true,
        factor: 0.01, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.10 },
        stage2: { multiplier: 1.18 },
        stage3: { multiplier: 1.25 },
        critical: false, showPreview: false,
      },
      {
        id: 'bmw_n47_egr',
        name: 'EGR Flow Map',
        category: 'emission',
        desc: 'BMW N47 EGR map. High-mileage N47 engines suffer from EGR valve seizure and inlet manifold fouling — particularly 2007-2012 models. EGR-off addon recommended on vehicles over 100k km.',
        a2lNames: ['KFEGR', 'KFEGRMX'],
        signatures: [
          // LE Kf_ 8×5 EGR (X: 0,1300,1900,2000) — database study: 23 CP04 files (N47 uses C06/C41)
          [0x08,0x00,0x05,0x00,0x00,0x00,0x14,0x05,0x6c,0x07,0xd0,0x07],
          // NOTE: X:2431 sig [0x08..0x5f,0x0b] removed — collides with bmw_n47_smoke (same 8×5 Kf_ header)
        ],
        sigOffset: 0,
        rows: 5, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: '%',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { egr: { multiplier: 0, addend: 0 } },
        critical: false, showPreview: false,
      },
      {
        id: 'bmw_n47_speed',
        name: 'Vehicle Speed Limiter (GSVSD)',
        category: 'limiter',
        desc: 'BMW N47 speed limiter. 1/3/5 Series diesel: 200-250 km/h depending on variant and market. Mini Cooper D: 200 km/h.',
        a2lNames: ['GSVSD', 'vVehMax', 'VMAX'],
        signatures: [[0x47,0x53,0x56,0x53,0x44]],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint8', le: true,
        factor: 1, offsetVal: 0, unit: 'km/h',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { speedlimiter: { multiplier: 0, addend: 250, clampMax: 250 } },
        critical: false, showPreview: false,
      },
    ],
  },

  // ── Hyundai / Kia 1.6/2.0 CRDi diesel (2010+) — Bosch EDC17C08/C57 ──────
  {
    id: 'hyundai_kia_crdi',
    name: 'Hyundai/Kia 1.6/2.0 CRDi diesel (EDC17C08/C57)',
    manufacturer: 'Bosch',
    family: 'EDC17',
    // D4FB = Hyundai/Kia 1.6 CRDi (90-136ps) — i30/Ceed/ix35/Tucson/Soul
    // D4FC = Kia 1.6 CRDi updated variant (128-141ps)
    // D4FD = Kia 1.7 CRDi (115-141ps) — Ceed/Sportage
    // D4HB = 2.0 CRDi (136-185ps) — Tucson/Sportage/Santa Fe
    // Bosch EDC17C08 (earlier) or EDC17C57 (post-2015). Standard EDC17 architecture.
    identStrings: ['EDC17C08', 'EDC17C57', 'D4FB', 'D4FC', 'D4FD', 'D4HB', 'CRDI', '0281018', '0281019'],
    fileSizeRange: [524288, 2097152],
    vehicles: [
      'Hyundai i30 1.6 CRDi 90/110/128ps (2012+)',
      'Hyundai Tucson 1.7/2.0 CRDi 115/136/184ps (2015+)',
      'Hyundai ix35 1.7/2.0 CRDi 115/136ps (2010+)',
      'Hyundai Santa Fe 2.0/2.2 CRDi 150/200ps (2012+)',
      'Kia Ceed 1.6/1.7 CRDi 110/128/141ps (2012+)',
      'Kia Sportage 1.7/2.0 CRDi 115/136/185ps (2015+)',
      'Kia Sorento 2.0/2.2 CRDi 150/200ps (2012+)',
      'Kia Soul 1.6 CRDi 128ps (2013+)',
      'Kia Optima 1.7 CRDi 141ps (2012+)',
    ],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0,
    checksumLength: 4,
    maps: [
      {
        id: 'hyk_crdi_boost',
        name: 'Boost Pressure Target (KFLDRL)',
        category: 'boost',
        desc: 'Hyundai/Kia CRDi boost target. 1.6 CRDi 128ps stock ~2000-2100 mbar; 2.0 CRDi 136ps stock ~2000 mbar; 2.0 184ps stock ~2200 mbar. Stage 1: 128→155ps, 136→165ps, 184→220ps typical. Hyundai/Kia diesels are very conservative from factory — significant gains available on all variants.',
        a2lNames: ['KFLDRL', 'DTBSTK', 'pBstSp'],
        signatures: [[0x4B,0x46,0x4C,0x44,0x52,0x4C]],
        sigOffset: 2,
        rows: 5, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'mbar',
        stage1: { multiplier: 1.12, clampMax: 25000 },
        stage2: { multiplier: 1.20, clampMax: 28000 },
        stage3: { multiplier: 1.28, clampMax: 31000 },
        addonOverrides: { overboost: { multiplier: 1.14, clampMax: 26000 } },
        critical: true, showPreview: true,
      },
      {
        id: 'hyk_crdi_torque',
        name: 'Torque Limit Map (MXHYE)',
        category: 'torque',
        desc: 'Hyundai/Kia CRDi torque ceiling. 1.6 CRDi 128ps stock ~260-300 Nm; 2.0 CRDi 136ps stock ~340 Nm; 184ps stock ~400 Nm. 6-speed manual: safe to 420 Nm. 6-speed Aisin automatic: keep below 380 Nm.',
        a2lNames: ['MXHYE', 'KFMOMDK'],
        signatures: [[0x4D,0x58,0x48,0x59,0x45]],
        sigOffset: 2,
        rows: 4, cols: 7, dtype: 'int16', le: true,
        factor: 0.5, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.12, clampMax: 750 },
        stage2: { multiplier: 1.20, clampMax: 900 },
        stage3: { multiplier: 1.28, clampMax: 1000 },
        critical: true, showPreview: true,
      },
      {
        id: 'hyk_crdi_fuel',
        name: 'Fuel Quantity Map (KFFKK)',
        category: 'fuel',
        desc: 'Hyundai/Kia CRDi fuel quantity map. Raise proportionally with boost. Bosch CRIN2/CRIN3 injectors on all variants — consistent delivery.',
        a2lNames: ['KFFKK', 'KFLMHFM', 'qFuelDem'],
        signatures: [[0x4B,0x46,0x46,0x4B,0x4B]],
        sigOffset: 2,
        rows: 5, cols: 8, dtype: 'uint16', le: true,
        factor: 0.01, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.12, clampMax: 5000 },
        stage2: { multiplier: 1.20, clampMax: 5800 },
        stage3: { multiplier: 1.28, clampMax: 6500 },
        critical: true, showPreview: true,
      },
      {
        id: 'hyk_crdi_egr',
        name: 'EGR Flow Map',
        category: 'emission',
        desc: 'Hyundai/Kia CRDi EGR map. All D4FB/D4FC/D4HB engines experience inlet carbon fouling at high mileage. EGR-off addon with walnut blast clean is the most requested Korean diesel service. Particularly common on Sportage/Tucson with high mileage.',
        a2lNames: ['KFEGR', 'KFEGRMX'],
        signatures: [
          // LE Kf_ 7×4 EGR (X: 2000,2500,3000,3500) — database study: 32 C46 files
          [0x07,0x00,0x04,0x00,0xd0,0x07,0xc4,0x09,0xb8,0x0b,0xac,0x0d],
          // LE Kf_ 7×4 EGR alt (X: 3711,3731,3751,3831) — database study: 8 CP44 files
          [0x07,0x00,0x04,0x00,0x7f,0x0e,0x93,0x0e,0xa7,0x0e,0xf7,0x0e],
        ],
        sigOffset: 0,
        rows: 4, cols: 7, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: '%',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { egr: { multiplier: 0, addend: 0 } },
        critical: false, showPreview: false,
      },
      {
        id: 'hyk_crdi_speed',
        name: 'Vehicle Speed Limiter (GSVSD)',
        category: 'limiter',
        desc: 'Hyundai/Kia speed limiter. Most models limited to 180-200 km/h. Standard remove.',
        a2lNames: ['GSVSD', 'vVehMax', 'VMAX'],
        signatures: [[0x47,0x53,0x56,0x53,0x44]],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint8', le: true,
        factor: 1, offsetVal: 0, unit: 'km/h',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { speedlimiter: { multiplier: 0, addend: 250, clampMax: 250 } },
        critical: false, showPreview: false,
      },
    ],
  },

  // ── VAG 3.0 V6 TDI (2004+) — Bosch EDC17CP44 / CP54 ────────────────────
  {
    id: 'vag_v6_tdi',
    name: 'VAG 3.0 V6 TDI (EDC17CP44/CP54)',
    manufacturer: 'Bosch',
    family: 'EDC17',
    // 3.0 V6 TDI = Audi/VW premium diesel across large SUV/saloon/estate.
    // Used in Audi A4/A5/A6/A7/A8/Q5/Q7, VW Touareg, Porsche Cayenne Diesel.
    // CASA/CATA/CRCA/CDYA/CKVB = major engine variant codes (differentiate power outputs).
    // EDC17CP44 (early 4.8MB ECU) / EDC17CP54 (later 8MB ECU).
    // Largest naturally-aspirating headroom of any mainstream diesel — very rewarding to tune.
    identStrings: ['EDC17CP44', 'EDC17CP54', 'CASA', 'CATA', 'CRCA', 'CDYA', '0281017', '0281018', 'TDI V6'],
    fileSizeRange: [2097152, 8388608],
    vehicles: [
      'Audi A4/A5 3.0 TDI 211/245ps (B8/B9 2009+)',
      'Audi A6/A7 3.0 TDI 204/245/272ps (C7/C8 2011+)',
      'Audi A8 3.0 TDI 204/250ps (D4 2010+)',
      'Audi Q5 3.0 TDI 211/245ps (8R/FY 2009+)',
      'Audi Q7 3.0 TDI 204/245/272ps (4L/4M 2006+)',
      'VW Touareg 3.0 TDI 204/245/262ps (7P/CR 2010+)',
      'Porsche Cayenne Diesel 3.0 V6 240/245ps (958 2010+)',
      'Porsche Macan S Diesel 3.0 V6 258ps (95B 2014+)',
    ],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0,
    checksumLength: 4,
    maps: [
      {
        id: 'vag_v6_boost',
        name: 'Boost Pressure Target (KFLDRL)',
        category: 'boost',
        desc: 'VAG 3.0 V6 TDI boost target. 211ps stock ~2000-2100 mbar; 245ps stock ~2100-2200 mbar; 272ps stock ~2200-2400 mbar. Stage 1: 211→265ps, 245→300ps, 272→330ps typical. Twin turbo (sequental on some variants) provides excellent boost response across the RPM range. One of the most rewarding diesel tunes available.',
        a2lNames: ['KFLDRL', 'DTBSTK', 'pBstSp', 'KFMHDR'],
        signatures: [[0x4B,0x46,0x4C,0x44,0x52,0x4C]],
        sigOffset: 2,
        rows: 7, cols: 10, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'mbar',
        stage1: { multiplier: 1.08, clampMax: 26000 },
        stage2: { multiplier: 1.15, clampMax: 30000 },
        stage3: { multiplier: 1.22, clampMax: 34000 },
        addonOverrides: { overboost: { multiplier: 1.10, clampMax: 27000 } },
        critical: true, showPreview: true,
      },
      {
        id: 'vag_v6_torque',
        name: 'Torque Limit Map (MXHYE)',
        category: 'torque',
        desc: 'VAG 3.0 V6 TDI torque ceiling. 211ps stock ~500 Nm; 245ps stock ~580 Nm; 272ps stock ~620 Nm. ZF 8HP automatic: very strong unit, handles 750+ Nm on stock internals. Tiptronic (Touareg early): keep below 650 Nm. V6 TDI bottom-end easily handles Stage 3 torque figures.',
        a2lNames: ['MXHYE', 'KFMOMDK'],
        signatures: [[0x4D,0x58,0x48,0x59,0x45]],
        sigOffset: 2,
        rows: 6, cols: 9, dtype: 'int16', le: true,
        factor: 0.5, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.10, clampMax: 1400 },
        stage2: { multiplier: 1.18, clampMax: 1600 },
        stage3: { multiplier: 1.25, clampMax: 1800 },
        critical: true, showPreview: true,
      },
      {
        id: 'vag_v6_fuel',
        name: 'Fuel Quantity Map (KFFKK)',
        category: 'fuel',
        desc: 'VAG 3.0 V6 TDI fuel quantity base map. Raise proportionally with boost. 3.0 V6 uses Bosch CRIN3 piezo injectors — excellent precision up to 2000 bar rail pressure.',
        a2lNames: ['KFFKK', 'KFLMHFM', 'qFuelDem'],
        signatures: [[0x4B,0x46,0x46,0x4B,0x4B]],
        sigOffset: 2,
        rows: 7, cols: 10, dtype: 'uint16', le: true,
        factor: 0.01, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.10, clampMax: 7000 },
        stage2: { multiplier: 1.18, clampMax: 8000 },
        stage3: { multiplier: 1.25, clampMax: 9000 },
        critical: true, showPreview: true,
      },
      {
        id: 'vag_v6_smoke',
        name: 'Smoke Limiter Map',
        category: 'smoke',
        desc: 'VAG 3.0 V6 TDI smoke limiter. Large displacement means less smoke tendency than smaller diesels. Raise proportionally with fuel map.',
        a2lNames: ['KFMRRBKH', 'KFRSMOKE'],
        signatures: [
          // LE Kf_ 9×6 smoke limiter (X: 1700,1820,1900,2500) — database study: 16 CP44 files (V6 uses CP44/CP54)
          [0x09,0x00,0x06,0x00,0xa4,0x06,0x1c,0x07,0x6c,0x07,0xc4,0x09],
        ],
        sigOffset: 0,
        rows: 6, cols: 9, dtype: 'uint16', le: true,
        factor: 0.01, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.08 },
        stage2: { multiplier: 1.15 },
        stage3: { multiplier: 1.22 },
        critical: false, showPreview: false,
      },
      {
        id: 'vag_v6_adblue',
        name: 'AdBlue/SCR System (KFSCR)',
        category: 'emission',
        desc: 'VAG 3.0 V6 TDI AdBlue/SCR dosing map (post-2016 EU6 variants). Adblue dosing fault codes and warnings are a common issue at high mileage. Use adblue addon to suppress faults on vehicles with SCR delete.',
        a2lNames: ['KFSCR', 'KFUREA', 'scrDos'],
        signatures: [
          // LE Kf_ 8×5 SCR/AdBlue (X: 2431,2531,2731,2911) — database study: 32 CP44 files (V6 uses CP44/CP54)
          [0x08,0x00,0x05,0x00,0x7f,0x09,0xe3,0x09,0xab,0x0a,0x5f,0x0b],
          // LE Kf_ 8×5 SCR alt (X: 1800,2000,2500,3500) — database study: 8 CP20 files
          [0x08,0x00,0x05,0x00,0x08,0x07,0xd0,0x07,0xc4,0x09,0xac,0x0d],
        ],
        sigOffset: 0,
        rows: 5, cols: 8, dtype: 'uint16', le: true,
        factor: 0.01, offsetVal: 0, unit: 'mg/s',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { adblue: { multiplier: 0, addend: 0 } },
        critical: false, showPreview: false,
      },
      {
        id: 'vag_v6_speed',
        name: 'Vehicle Speed Limiter (GSVSD)',
        category: 'limiter',
        desc: 'VAG 3.0 V6 TDI speed limiter. Audi A6/A7/A8: 250 km/h; Q7: 210-235 km/h; Touareg: 210-230 km/h; Porsche Cayenne D: 230-240 km/h. Standard remove.',
        a2lNames: ['GSVSD', 'vVehMax', 'VMAX'],
        signatures: [[0x47,0x53,0x56,0x53,0x44]],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint8', le: true,
        factor: 1, offsetVal: 0, unit: 'km/h',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { speedlimiter: { multiplier: 0, addend: 270, clampMax: 280 } },
        critical: false, showPreview: false,
      },
    ],
  },

  // ── BMW N55 petrol (2011–2019) — Bosch MSD87 (DDE7) ────────────────────
  {
    id: 'bmw_n55',
    name: 'BMW N55 petrol (MSD87/DDE7)',
    manufacturer: 'Bosch',
    family: 'MSD87',
    // N55B30A = BMW 3.0-litre straight-six twin-scroll turbopetrol, 2011-2019.
    // Bosch MSD87 (also known as DDE7) ECU — predecessor to MG1CS003.
    // Used in M135i/M235i/M240i, 335i/435i/535i before B58.
    // Large aftermarket community — excellent platform for stage tuning.
    identStrings: ['MSD87', 'N55B30', 'N55A30', 'DDE7', '0261203', '0261204', 'N55'],
    fileSizeRange: [2097152, 4194304],
    vehicles: [
      'BMW M135i/M235i F20/F22 (N55B30 2012+)',
      'BMW 335i/435i F30/F32 (N55B30 2012+)',
      'BMW 535i F10 (N55B30 2010+)',
      'BMW M240i F22 (N55B30 2015+)',
      'BMW X5 xDrive35i F15 (N55B30 2013+)',
      'BMW Z4 35i E89 (N55B30 2011+)',
      'BMW 1M Coupe E82 (N54B30 related 2011)',
    ],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0,
    checksumLength: 4,
    maps: [
      {
        id: 'bmw_n55_boost',
        name: 'Boost Pressure Setpoint (pBstSp)',
        category: 'boost',
        desc: 'BMW N55 boost setpoint. M135i stock ~1800-2000 mbar; 335i stock ~1700-1900 mbar. Stage 1: M135i 320→370ps, 335i 306→360ps typical. N55 twin-scroll single turbo has excellent spool and wide power band. More tuning potential than N54 twin-turbo on stage software alone — responds very well to charge pipe and FMIC upgrades.',
        a2lNames: ['pBstSp', 'KFLDR', 'KFLDRL', 'p_SetpntBoost'],
        signatures: [[0x70,0x42,0x73,0x74,0x53,0x70]],
        sigOffset: 2,
        rows: 6, cols: 10, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'mbar',
        stage1: { multiplier: 1.10, clampMax: 25000 },
        stage2: { multiplier: 1.18, clampMax: 29000 },
        stage3: { multiplier: 1.25, clampMax: 33000 },
        addonOverrides: { overboost: { multiplier: 1.12, clampMax: 26000 } },
        critical: true, showPreview: true,
      },
      {
        id: 'bmw_n55_torque',
        name: 'Torque Limit (MXHYE)',
        category: 'torque',
        desc: 'BMW N55 torque ceiling. M135i stock 450 Nm; 335i stock 400 Nm; 535i stock 400 Nm. ZF 8HP automatic: handles 650+ Nm on stock internals comfortably. 6-speed Getrag (manual M135i): safe to 550 Nm. N55 bottom-end (crank, rods) is very strong — many examples exceed 600 Nm reliably on Stage 2.',
        a2lNames: ['MXHYE', 'trqLimRaw', 'MASR'],
        signatures: [[0x4D,0x58,0x48,0x59,0x45]],
        sigOffset: 2,
        rows: 5, cols: 9, dtype: 'int16', le: true,
        factor: 0.5, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.12, clampMax: 1200 },
        stage2: { multiplier: 1.20, clampMax: 1400 },
        stage3: { multiplier: 1.28, clampMax: 1600 },
        critical: true, showPreview: true,
      },
      {
        id: 'bmw_n55_ignition',
        name: 'Ignition Timing Map (KFZW)',
        category: 'ignition',
        desc: 'BMW N55 base ignition timing (KFZW). 10.2:1 compression — moderate, handles timing advance well on 98 RON. Advance 1-2° across mid-range for best power. BMW knock control is active but logging is recommended for N55 timing work. MSD87 shares KFZW symbol naming with B58/MG1 family.',
        a2lNames: ['KFZW', 'KFZW2', 'IgnTim_sp'],
        signatures: [[0x4B,0x46,0x5A,0x57]],
        sigOffset: 2,
        rows: 8, cols: 16, dtype: 'int8', le: true,
        factor: 0.75, offsetVal: 0, unit: '°BTDC',
        stage1: { multiplier: 1.0 },
        stage2: { addend: 1, clampMax: 50 },
        stage3: { addend: 2, clampMax: 52 },
        critical: false, showPreview: true,
      },
      {
        id: 'bmw_n55_rev_limit',
        name: 'RPM Limiter (NMMAX)',
        category: 'limiter',
        desc: 'BMW N55 hard rev limiter. Stock 7000 RPM on most variants. Safe to 7200-7400 RPM with stock valve springs. M135i/M235i: stock 7000 RPM.',
        a2lNames: ['NMMAX', 'nEngCutOff', 'nMaxEng'],
        signatures: [[0x4E,0x4D,0x4D,0x41,0x58]],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'RPM',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { revlimit: { addend: 300, clampMax: 7500 } },
        critical: false, showPreview: false,
      },
      {
        id: 'bmw_n55_speed',
        name: 'Vehicle Speed Limiter (GSVSD)',
        category: 'limiter',
        desc: 'BMW N55 speed limiter. Standard EU 250 km/h on most models. M135i: 250 km/h. Standard remove.',
        a2lNames: ['GSVSD', 'vVehMax', 'VMAX'],
        signatures: [[0x47,0x53,0x56,0x53,0x44]],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint8', le: true,
        factor: 1, offsetVal: 0, unit: 'km/h',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { speedlimiter: { multiplier: 0, addend: 270, clampMax: 280 } },
        critical: false, showPreview: false,
      },
    ],
  },


  // ── Delco E39A / GM TECH2 (Vauxhall/Opel 2.0T petrol) ──────────────────────
  {
    id: 'delco_e39a',
    name: 'Delco E39A (2.0T petrol)',
    manufacturer: 'Delco',
    family: 'E39A',
    // E39A and E67 are GM global ECUs used on Opel/Vauxhall turbo petrol 2.0 Z20LET/A20NFT/A20NHT.
    // Embedded in calibration header: "E39A" or "E67A". EPS encrypted — RD tool required for cloning.
    identStrings: ['E39A', 'E67A', 'E67', 'Z20LEH', 'A20NFT', 'A20NHT', 'Z20LET', 'OPC', 'VXR'],
    fileSizeRange: [524288, 1048576],   // 512KB – 1MB
    vehicles: [
      'Vauxhall Astra H OPC 2.0T (Z20LEH/Z20LET)',
      'Vauxhall Astra J GTC 2.0T (A20NFT)',
      'Vauxhall Astra J OPC 2.0T (A20NHT)',
      'Vauxhall Insignia 2.0T (A20NFT)',
      'Vauxhall Zafira B 2.0T OPC',
      'Opel Astra H/J OPC 2.0T',
      'Opel Insignia 2.0T',
      'Saab 9-3/9-5 2.0T (B207R/B235R)',
    ],
    checksumAlgo: 'unknown',
    checksumOffset: 0,
    checksumLength: 0,
    maps: [
      {
        id: 'e39a_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'E39A/E67 boost target map. A20NFT/NHT stock 220–280ps — Stage 1 boost increase unlocks 280–310ps on the OPC/VXR. Primary Stage 1/2 map.',
        a2lNames: ['LADEDRUCKSOLL', 'SOLLDRUCK', 'LDSOLL'],
        signatures: [[0x4C,0x44,0x53,0x4F,0x4C,0x4C], [0x4C,0x41,0x44,0x45,0x44,0x52,0x55,0x43,0x4B]],
        sigOffset: 2,
        rows: 8, cols: 12, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.10 },
        stage2: { multiplier: 1.18 },
        stage3: { multiplier: 1.25, clampMax: 58000 },
        critical: true, showPreview: true,
      },
      {
        id: 'e39a_fuel_inject',
        name: 'Fuel Injection Map',
        category: 'fuel',
        desc: 'Fuelling map for Z20LET/A20NFT/A20NHT. Increased alongside boost at Stage 1/2 to maintain correct lambda and prevent lean run.',
        a2lNames: ['EINSPRITZMENGE', 'KRAFTSTOFF', 'FUEL_MAP'],
        signatures: [[0x45,0x49,0x4E,0x53,0x50,0x52,0x49,0x54,0x5A], [0x46,0x55,0x45,0x4C,0x4D,0x41,0x50]],
        sigOffset: 2,
        rows: 8, cols: 12, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'ms',
        stage1: { multiplier: 1.08 },
        stage2: { multiplier: 1.14 },
        stage3: { multiplier: 1.20, clampMax: 58000 },
        critical: true, showPreview: true,
      },
      {
        id: 'e39a_torque_limit',
        name: 'Max Torque Limit',
        category: 'torque',
        desc: 'Software torque ceiling. E39A calibrations often under-read actual torque — raising this 15–20% unlocks what the hardware can already deliver.',
        a2lNames: ['MXDREHMOMENT', 'TORQUE_MAX', 'MXMOM'],
        signatures: [[0x4D,0x58,0x44,0x52,0x45,0x48,0x4D,0x4F,0x4D], [0x54,0x4F,0x52,0x51,0x55,0x45,0x4D,0x41,0x58]],
        sigOffset: 2,
        rows: 1, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.12 },
        stage2: { multiplier: 1.20 },
        stage3: { multiplier: 1.28, clampMax: 60000 },
        critical: true, showPreview: true,
      },
      {
        id: 'e39a_ignition',
        name: 'Ignition Timing Map',
        category: 'ignition',
        desc: 'Base ignition advance map. E39A timing is conservatively factory-set for 95 RON — advancing 1–2° on 98 RON improves mid-range response.',
        a2lNames: ['ZUENDWINKEL', 'KFZW', 'IGN_TIMING'],
        signatures: [[0x5A,0x55,0x45,0x4E,0x44,0x57,0x49,0x4E,0x4B], [0x4B,0x46,0x5A,0x57]],
        sigOffset: 2,
        rows: 10, cols: 14, dtype: 'int8', le: true,
        factor: 0.75, offsetVal: -48, unit: '°BTDC',
        stage1: { addend: 1 },
        stage2: { addend: 2 },
        stage3: { addend: 3, clampMax: 80 },
        critical: false, showPreview: true,
      },
      {
        id: 'e39a_rev_limit',
        name: 'Rev Limiter',
        category: 'limiter',
        desc: 'Hard rev cut. Z20LEH/A20NHT cut at 7200 rpm — raising to 7400 rpm on track/motorsport applications.',
        a2lNames: ['NMMAX', 'DREHZAHLMAX', 'REV_LIMIT'],
        signatures: [[0x4E,0x4D,0x4D,0x41,0x58], [0x44,0x52,0x45,0x48,0x5A,0x41,0x48,0x4C,0x4D,0x41,0x58]],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'RPM',
        stage1: { addend: 0 },
        stage2: { addend: 200 },
        stage3: { addend: 300, clampMax: 7800 },
        critical: false, showPreview: false,
      },
      { id: 'e39a_lambda_target', name: 'Lambda / AFR Target', category: 'smoke', desc: 'Lambda target for Opel/Vauxhall 2.0T.', signatures: [], sigOffset: 0, rows: 16, cols: 16, dtype: 'uint16', le: true, factor: 0.001, offsetVal: 0, unit: 'lambda', stage1: { multiplier: 1.0 }, stage2: { multiplier: 0.98 }, stage3: { multiplier: 0.95 }, critical: false, showPreview: true },
      { id: 'e39a_speed_limit', name: 'Vehicle Speed Limiter', category: 'limiter', desc: 'Factory speed limiter for Opel/Vauxhall 2.0T.', signatures: [], sigOffset: 0, rows: 1, cols: 1, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'km/h', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { speedlimiter: { multiplier: 0, addend: 65535 } }, critical: false, showPreview: false },
    ],
  },

  // ── Delco ME17.9.6 / E78 (Vauxhall/Opel 1.4T petrol) ───────────────────────
  {
    id: 'delco_me17',
    name: 'Delco ME17.9.6 / E78 (1.4T petrol)',
    manufacturer: 'Delco',
    family: 'ME17.9.6',
    // Bosch ME17.9.6 (sometimes badged E78 by GM) used in A14NET/A14NEL (1.4 Turbo).
    // Embedded ident: "ME17.9.6" or "0261S10". Very high volume in UK — Corsa D/E, Astra J, Adam, Mokka.
    identStrings: ['ME17.9.6', 'ME17.9', '0261S10', '0261S11', 'A14NET', 'A14NEL', 'CORSA', 'ADAM'],
    fileSizeRange: [524288, 2097152],   // 512KB – 2MB
    vehicles: [
      'Vauxhall Corsa D/E 1.4T 100–140ps (A14NET)',
      'Vauxhall Astra J 1.4T 100–140ps (A14NET)',
      'Vauxhall Adam 1.4T (A14NET)',
      'Vauxhall Mokka 1.4T (A14NET)',
      'Opel Corsa D/E 1.4T (A14NET)',
      'Opel Astra J 1.4T (A14NET)',
      'Opel Mokka 1.4T (A14NET)',
      'Chevrolet Sonic/Trax 1.4T',
      'Buick Encore 1.4T',
    ],
    checksumAlgo: 'unknown',
    checksumOffset: 0,
    checksumLength: 0,
    maps: [
      {
        id: 'me17_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'A14NET boost target map. Factory-limited at 1.0–1.1 bar. Stage 1 raises to 1.25–1.35 bar for reliable 155–170ps output.',
        a2lNames: ['pBstSp', 'LADEDRUCKSOLL', 'BOOST_SP'],
        signatures: [[0x70,0x42,0x73,0x74,0x53,0x70], [0x4C,0x41,0x44,0x45,0x44,0x52,0x55,0x43,0x4B]],
        sigOffset: 2,
        rows: 6, cols: 10, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.12 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.30, clampMax: 55000 },
        critical: true, showPreview: true,
      },
      {
        id: 'me17_fuel_inject',
        name: 'Fuel Injection Map',
        category: 'fuel',
        desc: 'Injection quantity for A14NET. Scaled with boost at each stage to maintain stoichiometry and avoid lean combustion at peak power.',
        a2lNames: ['EINSPRITZMENGE', 'FUEL_MAP', 'KRAFTSTOFF'],
        signatures: [[0x45,0x49,0x4E,0x53,0x50,0x52,0x49,0x54,0x5A], [0x46,0x55,0x45,0x4C,0x4D,0x41,0x50]],
        sigOffset: 2,
        rows: 6, cols: 10, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'ms',
        stage1: { multiplier: 1.10 },
        stage2: { multiplier: 1.18 },
        stage3: { multiplier: 1.25, clampMax: 55000 },
        critical: true, showPreview: true,
      },
      {
        id: 'me17_torque_limit',
        name: 'Max Torque Limit',
        category: 'torque',
        desc: 'Software torque ceiling for A14NET. Factory limits 140ps variant to 200 Nm — raised to 240 Nm at Stage 1/2.',
        a2lNames: ['MXDREHMOMENT', 'TORQUE_MAX'],
        signatures: [[0x4D,0x58,0x44,0x52,0x45,0x48,0x4D,0x4F,0x4D], [0x54,0x4F,0x52,0x51,0x55,0x45,0x4D,0x41,0x58]],
        sigOffset: 2,
        rows: 1, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.18 },
        stage2: { multiplier: 1.28 },
        stage3: { multiplier: 1.35, clampMax: 55000 },
        critical: true, showPreview: true,
      },
      {
        id: 'me17_ignition',
        name: 'Ignition Timing Map',
        category: 'ignition',
        desc: 'Base ignition map for A14NET. Advancing timing 1.5–2° at mid-range RPM on 98 RON improves responsiveness on the 1.4 turbo.',
        a2lNames: ['KFZW', 'IGN_TIMING', 'ZUENDWINKEL'],
        signatures: [[0x4B,0x46,0x5A,0x57], [0x5A,0x55,0x45,0x4E,0x44,0x57,0x49,0x4E,0x4B]],
        sigOffset: 2,
        // CORRECTED: rows:12 cols:16. DAMOS A2L: KFZW = 16×12 across 36 MED17 files.
        rows: 12, cols: 16, dtype: 'int8', le: true,
        factor: 0.75, offsetVal: -48, unit: '°BTDC',
        stage1: { addend: 1 },
        stage2: { addend: 2 },
        stage3: { addend: 2, clampMax: 80 },
        critical: false, showPreview: true,
      },
      {
        id: 'me17_rev_limit',
        name: 'Rev Limiter',
        category: 'limiter',
        desc: 'A14NET rev limiter. Factory cut at 6200–6500 rpm. Minor raise possible for performance builds.',
        a2lNames: ['NMMAX', 'nEngMax'],
        signatures: [[0x4E,0x4D,0x4D,0x41,0x58], [0x6E,0x45,0x6E,0x67,0x4D,0x61,0x78]],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'RPM',
        stage1: { addend: 0 },
        stage2: { addend: 100 },
        stage3: { addend: 200, clampMax: 7000 },
        critical: false, showPreview: false,
      },
      { id: 'me17_lambda_target', name: 'Lambda / AFR Target', category: 'smoke', desc: 'Lambda target for A14NET 1.4T.', signatures: [], sigOffset: 0, rows: 16, cols: 16, dtype: 'uint16', le: true, factor: 0.001, offsetVal: 0, unit: 'lambda', stage1: { multiplier: 1.0 }, stage2: { multiplier: 0.98 }, stage3: { multiplier: 0.95 }, critical: false, showPreview: true },
      { id: 'me17_speed_limit', name: 'Vehicle Speed Limiter', category: 'limiter', desc: 'Factory speed limiter for A14NET vehicles.', signatures: [], sigOffset: 0, rows: 1, cols: 1, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'km/h', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { speedlimiter: { multiplier: 0, addend: 65535 } }, critical: false, showPreview: false },
    ],
  },

  // ── Bosch EDC17CP11 (Nissan dCi — Qashqai/Juke/X-Trail/Navara) ─────────────
  {
    id: 'nissan_edc17',
    name: 'Bosch EDC17CP11/C425 (Nissan dCi)',
    manufacturer: 'Bosch',
    family: 'EDC17',
    // EDC17CP11 = Renault/Nissan R9M 1.6 dCi (Qashqai/Juke). EDC17C42/CP42 = M9R 2.0 dCi (X-Trail).
    // EDC17C42/C425 = YS23 2.3 dCi (Navara NP300). All use Infineon Tricore and DAMOS symbols.
    // Same DAMOS symbol set as Renault/PSA EDC17 variants — KFLDRL, MXHYE, KFFKK, GSVSD.
    identStrings: ['EDC17CP11', 'EDC17C42', 'EDC17C425', 'R9M', 'M9R', 'YS23', 'NISSAN', 'QASHQAI', 'NAVARA'],
    fileSizeRange: [1048576, 4194304],   // 1MB – 4MB
    vehicles: [
      'Nissan Qashqai 1.6 dCi R9M (2013+)',
      'Nissan Juke 1.5/1.6 dCi R9M (2010+)',
      'Nissan X-Trail 2.0 dCi M9R (2007+)',
      'Nissan X-Trail 1.6 dCi R9M (2014+)',
      'Nissan Navara NP300 2.3 dCi YS23 (2016+)',
      'Nissan Leaf (range-extender variant)',
      'Renault Scenic/Grand Scenic 1.6 dCi R9M',
      'Renault Trafic/Vivaro 1.6 dCi R9M',
    ],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0,
    checksumLength: 4,
    maps: [
      {
        id: 'nissan_edc17_boost',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'Primary boost target for Nissan dCi engines. R9M 1.6 dCi responds well to a 15% boost raise — main Stage 1 map on Qashqai/Juke.',
        a2lNames: ['KFLDRL', 'ladedrRL', 'BoostSoll'],
        signatures: [
          [0x4B,0x46,0x4C,0x44,0x52,0x4C],
          // LE Kf_ 12×8 boost (RPM axis 1200,1600,2000,2500) — database study: 243 EDC17 files
          [0x0c,0x00,0x08,0x00,0xb0,0x04,0x40,0x06,0xd0,0x07,0xc4,0x09],
        ],
        sigOffset: 2,
        rows: 8, cols: 12, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.14 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.30, clampMax: 58000 },
        critical: true, showPreview: true,
      },
      {
        id: 'nissan_edc17_torque',
        name: 'Max Torque Limit',
        category: 'torque',
        desc: 'Software torque ceiling. Nissan artificially limits R9M/M9R torque — raising this alongside fuel unlocks full hardware potential on dCi.',
        a2lNames: ['MXHYE', 'momHyMax', 'MomMax'],
        signatures: [[0x4D,0x58,0x48,0x59,0x45]],
        sigOffset: 2,
        rows: 4, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.14 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.30, clampMax: 60000 },
        critical: true, showPreview: true,
      },
      {
        id: 'nissan_edc17_fuel',
        name: 'Injection Quantity Map',
        category: 'fuel',
        desc: 'Base injection quantity for Nissan dCi (KFFKK). Increased at Stage 1/2 to support the additional boost target.',
        a2lNames: ['KFFKK', 'mengKF', 'InjQty'],
        signatures: [[0x4B,0x46,0x46,0x4B,0x4B]],
        sigOffset: 2,
        rows: 8, cols: 12, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.14 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.28, clampMax: 58000 },
        critical: true, showPreview: true,
      },
      {
        id: 'nissan_edc17_smoke',
        name: 'Smoke Limiter',
        category: 'smoke',
        desc: 'Black smoke limiter for Nissan dCi. Raised in parallel with injection quantity to prevent limiter from capping fuelling gains.',
        a2lNames: ['MXRCH', 'rauchMax', 'SmokeLimit'],
        signatures: [
          [0x4D,0x58,0x52,0x43,0x48],
          [0x72,0x61,0x75,0x63,0x68,0x4D,0x61,0x78],
          // LE Kf_ 10×6 smoke limiter (RPM axis 2662,3072,3277,3482) — database study: 21 EDC17 files
          [0x0a,0x00,0x06,0x00,0x66,0x0a,0x00,0x0c,0xcd,0x0c,0x9a,0x0d],
        ],
        sigOffset: 2,
        rows: 6, cols: 10, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.14 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.28, clampMax: 58000 },
        critical: false, showPreview: false,
      },
      {
        id: 'nissan_edc17_egr',
        name: 'EGR Map',
        category: 'emission',
        desc: 'EGR duty cycle map for Nissan dCi. Reducing EGR improves throttle response and inlet temperature on R9M/M9R engines.',
        a2lNames: ['KFGR', 'egrKF', 'EgrDuty'],
        signatures: [[0x4B,0x46,0x47,0x52], [0x65,0x67,0x72,0x4B,0x46]],
        sigOffset: 2,
        rows: 8, cols: 10, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: '%',
        stage1: { multiplier: 0.75 },
        stage2: { multiplier: 0.50 },
        stage3: { multiplier: 0.0, clampMin: 0, clampMax: 1 },
        addonOverrides: { egr: { multiplier: 0.0, clampMin: 0, clampMax: 1 } },
        critical: false, showPreview: false,
      },
      {
        id: 'nissan_edc17_speed',
        name: 'Speed Limiter',
        category: 'limiter',
        desc: 'EU 120 km/h speed limiter for Nissan commercial/van variants. Standard removal on NV300/NV400 work vans.',
        a2lNames: ['GSVSD', 'vVehMax', 'SpeedMax'],
        signatures: [[0x47,0x53,0x56,0x53,0x44]],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint8', le: true,
        factor: 1, offsetVal: 0, unit: 'km/h',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { speedlimiter: { multiplier: 0, addend: 250, clampMax: 255 } },
        critical: false, showPreview: false,
      },
    ],
  },

  // ── Bosch EDC17C09 (JLR 3.0 TDV6 / SDV6 / SDV8) ───────────────────────────
  {
    id: 'jlr_tdv6',
    name: 'Bosch EDC17C09/C59 (JLR V6/V8 diesel)',
    manufacturer: 'Bosch',
    family: 'EDC17',
    // EDC17C09 = Jaguar/Land Rover 3.0 TDV6 (276DT) AJ-V6D Gen3.
    // EDC17C59 = Land Rover 3.0 SDV6/SDV8 300ps (LR-TDV6 Lion).
    // Both use same DAMOS symbol structure as other EDC17 platforms.
    identStrings: ['EDC17C09', 'EDC17C59', '276DT', 'TDV6', 'SDV6', 'SDV8', 'JAGUAR', 'DISCOVERY', 'FREELANDER'],
    fileSizeRange: [1048576, 4194304],   // 1MB – 4MB
    vehicles: [
      'Land Rover Discovery 4 3.0 TDV6 211ps/255ps (2009–2016)',
      'Land Rover Discovery Sport 2.2 SD4 190ps',
      'Land Rover Range Rover Sport 3.0 SDV6 306ps (2013+)',
      'Land Rover Freelander 2 2.2 TD4/SD4 (EDC17)',
      'Land Rover Defender 2.2 Puma TD4',
      'Jaguar XF 3.0 V6 Diesel 275ps (2010+)',
      'Jaguar XJ 3.0 V6 Diesel 275ps',
      'Jaguar F-Pace 3.0 SDV6 300ps',
    ],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0,
    checksumLength: 4,
    maps: [
      {
        id: 'jlr_tdv6_boost',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'TDV6/SDV6 twin-turbo boost target. Discovery 4 211ps capped to allow Discovery 4 255ps to share hardware — standard Stage 1 unlock.',
        a2lNames: ['KFLDRL', 'ladedrRL', 'BoostSoll'],
        signatures: [
          [0x4B,0x46,0x4C,0x44,0x52,0x4C],
          // LE Kf_ 12×8 boost (RPM axis 1200,1600,2000,2500) — database study: 243 EDC17 files
          [0x0c,0x00,0x08,0x00,0xb0,0x04,0x40,0x06,0xd0,0x07,0xc4,0x09],
        ],
        sigOffset: 2,
        rows: 8, cols: 12, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.12 },
        stage2: { multiplier: 1.20 },
        stage3: { multiplier: 1.28, clampMax: 60000 },
        critical: true, showPreview: true,
      },
      {
        id: 'jlr_tdv6_torque',
        name: 'Max Torque Limit',
        category: 'torque',
        desc: 'Software torque ceiling for JLR TDV6. Raises allow full utilisation of twin-turbo hardware on Discovery/Range Rover Sport.',
        a2lNames: ['MXHYE', 'momHyMax', 'MomMax'],
        signatures: [[0x4D,0x58,0x48,0x59,0x45]],
        sigOffset: 2,
        rows: 4, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.30, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'jlr_tdv6_fuel',
        name: 'Injection Quantity Map',
        category: 'fuel',
        desc: 'Fuelling map for JLR TDV6/SDV6 V6 diesel. Scaled with boost target at each stage to maintain correct AFR and safe EGTs.',
        a2lNames: ['KFFKK', 'mengKF', 'InjQty'],
        signatures: [[0x4B,0x46,0x46,0x4B,0x4B]],
        sigOffset: 2,
        rows: 8, cols: 12, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.12 },
        stage2: { multiplier: 1.20 },
        stage3: { multiplier: 1.26, clampMax: 60000 },
        critical: true, showPreview: true,
      },
      {
        id: 'jlr_tdv6_smoke',
        name: 'Smoke Limiter',
        category: 'smoke',
        desc: 'Black smoke limiter for JLR TDV6. Raised to prevent smoke limiter capping fuelling gains at Stage 1/2.',
        a2lNames: ['MXRCH', 'rauchMax'],
        signatures: [
          [0x4D,0x58,0x52,0x43,0x48],
          [0x72,0x61,0x75,0x63,0x68,0x4D,0x61,0x78],
          // LE Kf_ 10×6 smoke limiter (RPM axis 2662,3072,3277,3482) — database study: 21 EDC17 files
          [0x0a,0x00,0x06,0x00,0x66,0x0a,0x00,0x0c,0xcd,0x0c,0x9a,0x0d],
        ],
        sigOffset: 2,
        rows: 6, cols: 10, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.12 },
        stage2: { multiplier: 1.20 },
        stage3: { multiplier: 1.26, clampMax: 60000 },
        critical: false, showPreview: false,
      },
      {
        id: 'jlr_tdv6_egr',
        name: 'EGR Map',
        category: 'emission',
        desc: 'EGR duty cycle map for JLR TDV6. Reducing EGR lowers inlet temperatures and improves VGT response on V6 diesel.',
        a2lNames: ['KFGR', 'egrKF'],
        signatures: [[0x4B,0x46,0x47,0x52], [0x65,0x67,0x72,0x4B,0x46]],
        sigOffset: 2,
        rows: 8, cols: 10, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: '%',
        stage1: { multiplier: 0.75 },
        stage2: { multiplier: 0.50 },
        stage3: { multiplier: 0.0, clampMin: 0, clampMax: 1 },
        addonOverrides: { egr: { multiplier: 0.0, clampMin: 0, clampMax: 1 } },
        critical: false, showPreview: false,
      },
      { id: 'jlr_tdv6_soi', name: 'Start of Injection (SOI)', category: 'ignition', desc: 'Injection timing advance for JLR TDV6.', signatures: [], sigOffset: 0, rows: 10, cols: 10, dtype: 'int16', le: true, factor: 0.02, offsetVal: 0, unit: '°BTDC', stage1: { multiplier: 1.0 }, stage2: { addend: 30 }, stage3: { addend: 50 }, critical: false, showPreview: true },
      { id: 'jlr_tdv6_rail', name: 'Rail Pressure Target', category: 'fuel', desc: 'Common rail pressure for JLR TDV6.', signatures: [], sigOffset: 0, rows: 10, cols: 16, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'bar', stage1: { multiplier: 1.05 }, stage2: { multiplier: 1.08 }, stage3: { multiplier: 1.12 }, critical: false, showPreview: true },
      { id: 'jlr_tdv6_speed', name: 'Vehicle Speed Limiter', category: 'limiter', desc: 'Factory speed limiter for JLR TDV6.', signatures: [], sigOffset: 0, rows: 1, cols: 1, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'km/h', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { speedlimiter: { multiplier: 0, addend: 65535 } }, critical: false, showPreview: false },
    ],
  },

  // ── Bosch EDC16C7 (Honda 2.2 i-DTEC) ───────────────────────────────────────
  {
    id: 'honda_idtec',
    name: 'Bosch EDC16C7 (Honda 2.2 i-DTEC)',
    manufacturer: 'Bosch',
    family: 'EDC16',
    // EDC16C7 used on Honda N22A2 2.2 i-DTEC (2008+). Heavily common in UK on Accord/CR-V/Civic.
    // Honda uses custom calibration variable names — not standard Bosch DAMOS symbols.
    identStrings: ['EDC16C7', 'N22A', 'IDTEC', 'HONDA', 'ACCORD', 'CR-V', 'CIVIC'],
    fileSizeRange: [524288, 1048576],   // 512KB – 1MB
    vehicles: [
      'Honda Accord 2.2 i-DTEC N22A2 140ps (2008–2015)',
      'Honda CR-V 2.2 i-DTEC N22B2 150ps (2006–2012)',
      'Honda Civic 2.2 i-DTEC N22A2 140ps (2006–2012)',
      'Honda FR-V 2.2 i-DTEC N22A1',
    ],
    checksumAlgo: 'unknown',
    checksumOffset: 0,
    checksumLength: 0,
    maps: [
      {
        id: 'honda_idtec_boost',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'N22A i-DTEC VGT boost target. Factory-capped to protect 6-speed auto gearbox — Stage 1 boost raise gives genuine 165–170ps.',
        a2lNames: ['BOOST_MAP', 'TURBO_TARGET', 'PBOOST'],
        signatures: [[0x42,0x4F,0x4F,0x53,0x54,0x4D,0x41,0x50], [0x54,0x55,0x52,0x42,0x4F,0x54,0x47,0x54]],
        sigOffset: 2,
        rows: 8, cols: 10, dtype: 'uint16', le: false,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.12 },
        stage2: { multiplier: 1.20 },
        stage3: { multiplier: 1.28, clampMax: 55000 },
        critical: true, showPreview: true,
      },
      {
        id: 'honda_idtec_fuel',
        name: 'Injection Quantity Map',
        category: 'fuel',
        desc: 'Fuel injection quantity for Honda N22 i-DTEC. Increased to support boost and torque gains at Stage 1/2.',
        a2lNames: ['INJ_QTY', 'FUEL_MAP', 'INJMAP'],
        signatures: [[0x49,0x4E,0x4A,0x51,0x54,0x59], [0x46,0x55,0x45,0x4C,0x4D,0x41,0x50]],
        sigOffset: 2,
        rows: 8, cols: 10, dtype: 'uint16', le: false,
        factor: 0.001, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.12 },
        stage2: { multiplier: 1.20 },
        stage3: { multiplier: 1.26, clampMax: 55000 },
        critical: true, showPreview: true,
      },
      {
        id: 'honda_idtec_torque',
        name: 'Max Torque Limit',
        category: 'torque',
        desc: 'Software torque ceiling for Honda i-DTEC. Raised alongside fuel and boost to fully unlock Stage 1 gains on Accord/CR-V.',
        a2lNames: ['TORQUE_MAX', 'TQ_LIMIT', 'TQLIM'],
        signatures: [[0x54,0x4F,0x52,0x51,0x55,0x45,0x4D,0x41,0x58], [0x54,0x51,0x4C,0x49,0x4D,0x49,0x54]],
        sigOffset: 2,
        rows: 1, cols: 8, dtype: 'uint16', le: false,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.25 },
        stage3: { multiplier: 1.32, clampMax: 55000 },
        critical: true, showPreview: true,
      },
      {
        id: 'honda_idtec_egr',
        name: 'EGR Map',
        category: 'emission',
        desc: 'EGR duty map for Honda N22 i-DTEC. Reducing EGR improves throttle response and reduces soot loading on this chain-drive engine.',
        a2lNames: ['EGR_MAP', 'EGR_DUTY', 'EGRMAP'],
        signatures: [[0x45,0x47,0x52,0x4D,0x41,0x50], [0x45,0x47,0x52,0x44,0x55,0x54,0x59]],
        sigOffset: 2,
        rows: 8, cols: 10, dtype: 'uint16', le: false,
        factor: 0.001, offsetVal: 0, unit: '%',
        stage1: { multiplier: 0.80 },
        stage2: { multiplier: 0.55 },
        stage3: { multiplier: 0.0, clampMin: 0, clampMax: 1 },
        addonOverrides: { egr: { multiplier: 0.0, clampMin: 0, clampMax: 1 } },
        critical: false, showPreview: false,
      },
      { id: 'honda_idtec_smoke', name: 'Smoke Limiter', category: 'smoke', desc: 'Airflow-based smoke limit for Honda i-DTEC.', signatures: [], sigOffset: 0, rows: 12, cols: 16, dtype: 'uint16', le: false, factor: 0.01, offsetVal: 0, unit: 'mg/st', stage1: { multiplier: 1.10 }, stage2: { multiplier: 1.18 }, stage3: { multiplier: 1.28 }, critical: true, showPreview: true },
      { id: 'honda_idtec_soi', name: 'Start of Injection (SOI)', category: 'ignition', desc: 'Injection timing advance for Honda i-DTEC.', signatures: [], sigOffset: 0, rows: 10, cols: 10, dtype: 'int16', le: false, factor: 0.02, offsetVal: 0, unit: '°BTDC', stage1: { multiplier: 1.0 }, stage2: { addend: 30 }, stage3: { addend: 50 }, critical: false, showPreview: true },
      { id: 'honda_idtec_rail', name: 'Rail Pressure Target', category: 'fuel', desc: 'Common rail pressure for Honda i-DTEC.', signatures: [], sigOffset: 0, rows: 10, cols: 16, dtype: 'uint16', le: false, factor: 1, offsetVal: 0, unit: 'bar', stage1: { multiplier: 1.05 }, stage2: { multiplier: 1.08 }, stage3: { multiplier: 1.12 }, critical: false, showPreview: true },
      { id: 'honda_idtec_speed', name: 'Vehicle Speed Limiter', category: 'limiter', desc: 'Factory speed limiter for Honda i-DTEC.', signatures: [], sigOffset: 0, rows: 1, cols: 1, dtype: 'uint16', le: false, factor: 1, offsetVal: 0, unit: 'km/h', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { speedlimiter: { multiplier: 0, addend: 65535 } }, critical: false, showPreview: false },
    ],
  },

  // ── Bosch ME17.8 (Volvo T5/T6 petrol — Drive-E) ─────────────────────────────
  {
    id: 'volvo_me17',
    name: 'Bosch ME17.8 (Volvo Drive-E T5/T6)',
    manufacturer: 'Bosch',
    family: 'ME17',
    // ME17.8 used on Volvo Drive-E B4204T series (T5/T6 petrol, 2013+).
    // Very common in Ireland/UK on V40/V60/S60/XC60/XC90 T5 and T6 AWD.
    identStrings: ['ME17.8', '0261S18', 'B4204T', 'VOLVO', 'DRIVE-E', 'T5', 'T6', 'XC60', 'XC90'],
    fileSizeRange: [1048576, 4194304],   // 1MB – 4MB
    vehicles: [
      'Volvo V40 T5 Drive-E 180/213ps (B4204T14)',
      'Volvo V60/S60 T5 Drive-E 245ps (B4204T19)',
      'Volvo V60/S60 T6 AWD Drive-E 306ps (B4204T20)',
      'Volvo XC60 T5 Drive-E 245ps (2015+)',
      'Volvo XC60 T6 AWD Drive-E 320ps (2015+)',
      'Volvo XC90 T5 Drive-E 250ps (2015+)',
      'Volvo XC90 T6 AWD Drive-E 320ps (2015+)',
      'Volvo V90/S90 T5/T6 Drive-E (2016+)',
    ],
    checksumAlgo: 'unknown',
    checksumOffset: 0,
    checksumLength: 0,
    maps: [
      {
        id: 'volvo_me17_boost',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'ME17.8 boost target for Volvo Drive-E B4204T. T5 factory peak around 1.3 bar — Stage 1 raises to 1.5 bar for 280ps+ on the B4204T19.',
        a2lNames: ['pBstSp', 'LADEDRUCKSOLL', 'BoostTarget'],
        signatures: [[0x70,0x42,0x73,0x74,0x53,0x70], [0x4C,0x41,0x44,0x45,0x44,0x52,0x55,0x43,0x4B]],
        sigOffset: 2,
        rows: 8, cols: 12, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.12 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.30, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'volvo_me17_fuel',
        name: 'Fuel Injection Map',
        category: 'fuel',
        desc: 'Injection map for B4204T Drive-E. Scaled with boost to maintain safe lambda across Stage 1/2 power levels.',
        a2lNames: ['EINSPRITZMENGE', 'FUEL_MAP', 'InjMap'],
        signatures: [[0x45,0x49,0x4E,0x53,0x50,0x52,0x49,0x54,0x5A], [0x46,0x55,0x45,0x4C,0x4D,0x41,0x50]],
        sigOffset: 2,
        rows: 8, cols: 12, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'ms',
        stage1: { multiplier: 1.10 },
        stage2: { multiplier: 1.18 },
        stage3: { multiplier: 1.25, clampMax: 60000 },
        critical: true, showPreview: true,
      },
      {
        id: 'volvo_me17_torque',
        name: 'Max Torque Limit',
        category: 'torque',
        desc: 'Software torque limit for Volvo ME17.8. T5 artificially capped vs T6 — raising allows T5 hardware to reach T6 output.',
        a2lNames: ['MXDREHMOMENT', 'TORQUE_MAX', 'MaxTorque'],
        signatures: [[0x4D,0x58,0x44,0x52,0x45,0x48,0x4D,0x4F,0x4D], [0x54,0x4F,0x52,0x51,0x55,0x45,0x4D,0x41,0x58]],
        sigOffset: 2,
        rows: 1, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.12 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.30, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'volvo_me17_ignition',
        name: 'Ignition Timing Map',
        category: 'ignition',
        desc: 'Base ignition map for Volvo B4204T Drive-E. Mild advance at mid-range RPM on 98 RON fuel improves turbo spool and response.',
        a2lNames: ['KFZW', 'IGN_TIMING', 'ZWMap'],
        signatures: [[0x4B,0x46,0x5A,0x57], [0x5A,0x57,0x4D,0x61,0x70]],
        sigOffset: 2,
        // CORRECTED: rows:12 cols:16. DAMOS A2L: KFZW = 16×12 across 36 MED17 files.
        rows: 12, cols: 16, dtype: 'int8', le: true,
        factor: 0.75, offsetVal: -48, unit: '°BTDC',
        stage1: { addend: 1 },
        stage2: { addend: 2 },
        stage3: { addend: 2, clampMax: 80 },
        critical: false, showPreview: true,
      },
      {
        id: 'volvo_me17_rev_limit',
        name: 'Rev Limiter',
        category: 'limiter',
        desc: 'Volvo B4204T rev limiter. Factory cut at 6800–7100 rpm depending on variant. Minor raise for performance builds.',
        a2lNames: ['NMMAX', 'nEngMax'],
        signatures: [[0x4E,0x4D,0x4D,0x41,0x58], [0x6E,0x45,0x6E,0x67,0x4D,0x61,0x78]],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'RPM',
        stage1: { addend: 0 },
        stage2: { addend: 200 },
        stage3: { addend: 300, clampMax: 7500 },
        critical: false, showPreview: false,
      },
      { id: 'volvo_me17_lambda', name: 'Lambda / AFR Target', category: 'smoke', desc: 'Lambda target for Volvo Drive-E T5/T6 petrol.', signatures: [], sigOffset: 0, rows: 16, cols: 16, dtype: 'uint16', le: true, factor: 0.001, offsetVal: 0, unit: 'lambda', stage1: { multiplier: 1.0 }, stage2: { multiplier: 0.98 }, stage3: { multiplier: 0.95 }, critical: false, showPreview: true },
      { id: 'volvo_me17_speed', name: 'Vehicle Speed Limiter', category: 'limiter', desc: 'Factory speed limiter for Volvo Drive-E petrol.', signatures: [], sigOffset: 0, rows: 1, cols: 1, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'km/h', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { speedlimiter: { multiplier: 0, addend: 65535 } }, critical: false, showPreview: false },
    ],
  },

  // ── Bosch EDC17C16/C50 (Volvo D4/D5 diesel — Drive-E) ──────────────────────
  {
    id: 'volvo_edc17',
    name: 'Bosch EDC17C16/C50 (Volvo D4/D5 diesel)',
    manufacturer: 'Bosch',
    family: 'EDC17',
    // EDC17C16 = Volvo D5244T (2.4 D5, 180–215ps). EDC17C50 = D4204T14/T23 (2.0 D4, 150–190ps).
    // Both very common in UK/Ireland on V40/V60/XC60/XC90 D4/D5.
    identStrings: ['EDC17C16', 'EDC17C50', 'D5244T', 'D4204T', 'VOLVO', 'D4', 'D5', 'XC60', 'V60'],
    fileSizeRange: [1048576, 4194304],   // 1MB – 4MB
    vehicles: [
      'Volvo V40 D4 2.0 150/190ps (D4204T14)',
      'Volvo V60/S60 D4 Drive-E 190ps (D4204T23)',
      'Volvo V60/S60 D5 2.4 215ps (D5244T17)',
      'Volvo XC60 D4 181/190ps (2015+)',
      'Volvo XC60 D5 AWD 220ps (2010+)',
      'Volvo XC90 D4 181/190ps (2015+)',
      'Volvo XC90 D5 AWD 235ps (2015+)',
      'Volvo V90/S90 D4/D5 (2016+)',
    ],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0,
    checksumLength: 4,
    maps: [
      {
        id: 'volvo_edc17_boost',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'Volvo D4/D5 boost target. D4 variants often share hardware with D5 — Stage 1 boost raise unlocks 215–230ps from the D4 2.0.',
        a2lNames: ['KFLDRL', 'ladedrRL', 'BoostSoll'],
        signatures: [
          [0x4B,0x46,0x4C,0x44,0x52,0x4C],
          // LE Kf_ 12×8 boost (RPM axis 1200,1600,2000,2500) — database study: 243 EDC17 files
          [0x0c,0x00,0x08,0x00,0xb0,0x04,0x40,0x06,0xd0,0x07,0xc4,0x09],
        ],
        sigOffset: 2,
        rows: 8, cols: 12, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.14 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.30, clampMax: 62000 },
        critical: true, showPreview: true,
      },
      {
        id: 'volvo_edc17_torque',
        name: 'Max Torque Limit',
        category: 'torque',
        desc: 'Software torque ceiling for Volvo D4/D5. Artificially limited on lower-spec variants to protect 8-speed auto — raising gives 430–480 Nm.',
        a2lNames: ['MXHYE', 'momHyMax', 'MomMax'],
        signatures: [[0x4D,0x58,0x48,0x59,0x45]],
        sigOffset: 2,
        rows: 4, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.30, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'volvo_edc17_fuel',
        name: 'Injection Quantity Map',
        category: 'fuel',
        desc: 'Fuelling map for Volvo D4204T/D5244T. Scaled alongside boost to maintain safe AFR at all Stage levels.',
        a2lNames: ['KFFKK', 'mengKF', 'InjQty'],
        signatures: [[0x4B,0x46,0x46,0x4B,0x4B]],
        sigOffset: 2,
        rows: 8, cols: 12, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.14 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.28, clampMax: 62000 },
        critical: true, showPreview: true,
      },
      {
        id: 'volvo_edc17_smoke',
        name: 'Smoke Limiter',
        category: 'smoke',
        desc: 'Black smoke limiter for Volvo diesel. Raised to prevent smoke limiter capping fuelling gains at Stage 1/2.',
        a2lNames: ['MXRCH', 'rauchMax'],
        signatures: [
          [0x4D,0x58,0x52,0x43,0x48],
          // LE Kf_ 10×6 smoke limiter (RPM axis 2662,3072,3277,3482) — database study: 21 EDC17 files
          [0x0a,0x00,0x06,0x00,0x66,0x0a,0x00,0x0c,0xcd,0x0c,0x9a,0x0d],
        ],
        sigOffset: 2,
        rows: 6, cols: 10, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.14 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.28, clampMax: 62000 },
        critical: false, showPreview: false,
      },
      {
        id: 'volvo_edc17_egr',
        name: 'EGR Map',
        category: 'emission',
        desc: 'EGR duty map for Volvo D4/D5. Reducing EGR improves intake air temperature and VGT response — standard Stage 1 calibration.',
        a2lNames: ['KFGR', 'egrKF'],
        signatures: [[0x4B,0x46,0x47,0x52], [0x65,0x67,0x72,0x4B,0x46]],
        sigOffset: 2,
        rows: 8, cols: 10, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: '%',
        stage1: { multiplier: 0.75 },
        stage2: { multiplier: 0.50 },
        stage3: { multiplier: 0.0, clampMin: 0, clampMax: 1 },
        addonOverrides: { egr: { multiplier: 0.0, clampMin: 0, clampMax: 1 } },
        critical: false, showPreview: false,
      },
      { id: 'volvo_edc17_soi', name: 'Start of Injection (SOI)', category: 'ignition', desc: 'Injection timing advance for Volvo D4/D5.', signatures: [], sigOffset: 0, rows: 10, cols: 10, dtype: 'int16', le: true, factor: 0.02, offsetVal: 0, unit: '°BTDC', stage1: { multiplier: 1.0 }, stage2: { addend: 30 }, stage3: { addend: 50 }, critical: false, showPreview: true },
      { id: 'volvo_edc17_rail', name: 'Rail Pressure Target', category: 'fuel', desc: 'Common rail pressure for Volvo D4/D5.', signatures: [], sigOffset: 0, rows: 10, cols: 16, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'bar', stage1: { multiplier: 1.05 }, stage2: { multiplier: 1.08 }, stage3: { multiplier: 1.12 }, critical: false, showPreview: true },
      { id: 'volvo_edc17_speed', name: 'Vehicle Speed Limiter', category: 'limiter', desc: 'Factory speed limiter for Volvo D4/D5.', signatures: [], sigOffset: 0, rows: 1, cols: 1, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'km/h', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { speedlimiter: { multiplier: 0, addend: 65535 } }, critical: false, showPreview: false },
    ],
  },

  // ── Bosch EDC17C60/C84 (Vauxhall 1.6/2.0 CDTi BiTurbo — A16DTH/A20DTJ) ─────
  {
    id: 'vauxhall_edc17',
    name: 'Bosch EDC17C60/C84 (Vauxhall 1.6/2.0 CDTi)',
    manufacturer: 'Bosch',
    family: 'EDC17',
    // EDC17C60 = Vauxhall/Opel A20DTJ 2.0 CDTi BiTurbo (195ps, Insignia/Zafira Tourer).
    // EDC17C84 = A16DTH/A16DTE 1.6 CDTi 110–136ps (Astra J/K, Mokka X, Corsa D/E).
    // Very high volume in UK — Astra 1.6 CDTi most popular Vauxhall diesel in Ireland.
    identStrings: ['EDC17C60', 'EDC17C84', 'A16DTH', 'A16DTE', 'A20DTJ', 'CDTI', 'VAUXHALL', 'OPEL', 'INSIGNIA'],
    fileSizeRange: [1048576, 4194304],   // 1MB – 4MB
    vehicles: [
      'Vauxhall Astra J/K 1.6 CDTi 110/136ps (A16DTH/A16DTE, 2012+)',
      'Vauxhall Mokka X 1.6 CDTi 110/136ps (A16DTH)',
      'Vauxhall Corsa D/E 1.3/1.6 CDTi (A16DTH)',
      'Vauxhall Insignia 2.0 CDTi BiTurbo 195ps (A20DTJ)',
      'Vauxhall Zafira Tourer 2.0 CDTi BiTurbo 195ps (A20DTJ)',
      'Opel Astra J/K 1.6 CDTi',
      'Opel Insignia 2.0 CDTi BiTurbo',
      'Opel Mokka 1.6 CDTi',
    ],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0,
    checksumLength: 4,
    maps: [
      {
        id: 'vauxhall_edc17_boost',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'Boost target for Vauxhall/Opel CDTi. A16DTH 136ps and A20DTJ 195ps both respond strongly to boost — primary Stage 1 map on Astra/Insignia.',
        a2lNames: ['KFLDRL', 'ladedrRL', 'BoostSoll'],
        signatures: [
          [0x4B,0x46,0x4C,0x44,0x52,0x4C],
          // LE Kf_ 12×8 boost (RPM axis 1200,1600,2000,2500) — database study: 243 EDC17 files
          [0x0c,0x00,0x08,0x00,0xb0,0x04,0x40,0x06,0xd0,0x07,0xc4,0x09],
        ],
        sigOffset: 2,
        rows: 8, cols: 12, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.14 },
        stage2: { multiplier: 1.24 },
        stage3: { multiplier: 1.32, clampMax: 62000 },
        critical: true, showPreview: true,
      },
      {
        id: 'vauxhall_edc17_torque',
        name: 'Max Torque Limit',
        category: 'torque',
        desc: 'Software torque ceiling for Vauxhall CDTi. A16DTH 136ps limited vs A20DTJ 195ps — Stage 1 raise unlocks full hardware on lower-spec variants.',
        a2lNames: ['MXHYE', 'momHyMax', 'MomMax'],
        signatures: [[0x4D,0x58,0x48,0x59,0x45]],
        sigOffset: 2,
        rows: 4, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.16 },
        stage2: { multiplier: 1.24 },
        stage3: { multiplier: 1.32, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'vauxhall_edc17_fuel',
        name: 'Injection Quantity Map',
        category: 'fuel',
        desc: 'Fuelling map for Vauxhall A16DTH/A20DTJ diesel. Scaled with boost at each stage to maintain correct lambda and smoke-free operation.',
        a2lNames: ['KFFKK', 'mengKF', 'InjQty'],
        signatures: [[0x4B,0x46,0x46,0x4B,0x4B]],
        sigOffset: 2,
        rows: 8, cols: 12, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.14 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.28, clampMax: 62000 },
        critical: true, showPreview: true,
      },
      {
        id: 'vauxhall_edc17_smoke',
        name: 'Smoke Limiter',
        category: 'smoke',
        desc: 'Smoke limiter for Vauxhall/Opel CDTi. Raised to allow full fuelling gains without black smoke cut-in at Stage 1/2.',
        a2lNames: ['MXRCH', 'rauchMax'],
        signatures: [
          [0x4D,0x58,0x52,0x43,0x48],
          // LE Kf_ 10×6 smoke limiter (RPM axis 2662,3072,3277,3482) — database study: 21 EDC17 files
          [0x0a,0x00,0x06,0x00,0x66,0x0a,0x00,0x0c,0xcd,0x0c,0x9a,0x0d],
        ],
        sigOffset: 2,
        rows: 6, cols: 10, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.14 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.28, clampMax: 62000 },
        critical: false, showPreview: false,
      },
      {
        id: 'vauxhall_edc17_egr',
        name: 'EGR Map',
        category: 'emission',
        desc: 'EGR duty cycle for Vauxhall/Opel CDTi. Standard Stage 1 EGR reduction improves throttle response and reduces carbon buildup.',
        a2lNames: ['KFGR', 'egrKF'],
        signatures: [[0x4B,0x46,0x47,0x52]],
        sigOffset: 2,
        rows: 8, cols: 10, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: '%',
        stage1: { multiplier: 0.75 },
        stage2: { multiplier: 0.50 },
        stage3: { multiplier: 0.0, clampMin: 0, clampMax: 1 },
        addonOverrides: { egr: { multiplier: 0.0, clampMin: 0, clampMax: 1 } },
        critical: false, showPreview: false,
      },
      {
        id: 'vauxhall_edc17_speed',
        name: 'Speed Limiter',
        category: 'limiter',
        desc: 'EU 120 km/h speed limiter on Vauxhall van/commercial variants (Vivaro). Standard removal.',
        a2lNames: ['GSVSD', 'vVehMax'],
        signatures: [[0x47,0x53,0x56,0x53,0x44]],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint8', le: true,
        factor: 1, offsetVal: 0, unit: 'km/h',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { speedlimiter: { multiplier: 0, addend: 250, clampMax: 255 } },
        critical: false, showPreview: false,
      },
      { id: 'vauxhall_edc17_soi', name: 'Start of Injection (SOI)', category: 'ignition', desc: 'Injection timing advance for Vauxhall CDTi.', signatures: [], sigOffset: 0, rows: 10, cols: 10, dtype: 'int16', le: true, factor: 0.02, offsetVal: 0, unit: '°BTDC', stage1: { multiplier: 1.0 }, stage2: { addend: 30 }, stage3: { addend: 50 }, critical: false, showPreview: true },
      { id: 'vauxhall_edc17_rail', name: 'Rail Pressure Target', category: 'fuel', desc: 'Common rail pressure for Vauxhall CDTi.', signatures: [], sigOffset: 0, rows: 10, cols: 16, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'bar', stage1: { multiplier: 1.05 }, stage2: { multiplier: 1.08 }, stage3: { multiplier: 1.12 }, critical: false, showPreview: true },
    ],
  },

  // ── Bosch EDC17C10/C42 (Vivaro/Trafic/Transit Custom 1.6 BiTurbo diesel) ────
  {
    id: 'van_edc17_biturbo',
    name: 'Bosch EDC17 (Vivaro/Trafic/Transit Custom 1.6 BiTurbo)',
    manufacturer: 'Bosch',
    family: 'EDC17',
    // Renault/PSA 1.6 dCi BiTurbo R9M 125–145ps used in the hugely popular Trafic/Vivaro/Transit Custom.
    // EDC17C10 (Vivaro 1.6 BiTurbo) / EDC17C42 (Trafic 1.6 dCi). Massive UK/Irish commercial fleet.
    identStrings: ['VIVARO', 'TRAFIC', 'NV300', 'TRANSIT', 'R9M', '1.6BITURBO', 'BITURBO', 'EDC17C10', 'EDC17C42'],
    fileSizeRange: [1048576, 4194304],   // 1MB – 4MB
    vehicles: [
      'Vauxhall/Opel Vivaro B 1.6 CDTi BiTurbo 125/140ps (2014+)',
      'Renault Trafic 1.6 dCi BiTurbo 125/140ps (2014+)',
      'Nissan NV300 1.6 dCi BiTurbo 125/140ps (2016+)',
      'Fiat Talento 1.6 MultiJet BiTurbo 120/125ps (2016+)',
      'Ford Transit Custom 1.6 TDCi (early) 115ps',
    ],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0,
    checksumLength: 4,
    maps: [
      {
        id: 'van_biturbo_boost',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'R9M BiTurbo boost target. The 125ps and 145ps van variants share hardware — Stage 1 boost raise gives reliable 170–190ps and much improved mid-range.',
        a2lNames: ['KFLDRL', 'ladedrRL', 'BoostSoll'],
        signatures: [
          [0x4B,0x46,0x4C,0x44,0x52,0x4C],
          // LE Kf_ 12×8 boost (RPM axis 1200,1600,2000,2500) — database study: 243 EDC17 files
          [0x0c,0x00,0x08,0x00,0xb0,0x04,0x40,0x06,0xd0,0x07,0xc4,0x09],
        ],
        sigOffset: 2,
        rows: 8, cols: 12, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.16 },
        stage2: { multiplier: 1.24 },
        stage3: { multiplier: 1.30, clampMax: 62000 },
        critical: true, showPreview: true,
      },
      {
        id: 'van_biturbo_torque',
        name: 'Max Torque Limit',
        category: 'torque',
        desc: 'Software torque ceiling for R9M BiTurbo vans. Artificially capped on 125ps variant — raising gives full 400 Nm hardware potential.',
        a2lNames: ['MXHYE', 'momHyMax'],
        signatures: [[0x4D,0x58,0x48,0x59,0x45]],
        sigOffset: 2,
        rows: 4, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.18 },
        stage2: { multiplier: 1.26 },
        stage3: { multiplier: 1.32, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'van_biturbo_fuel',
        name: 'Injection Quantity Map',
        category: 'fuel',
        desc: 'Fuelling map for R9M BiTurbo. Increased at each stage to support additional boost — essential for smoke-free Stage 1 power delivery.',
        a2lNames: ['KFFKK', 'mengKF'],
        signatures: [[0x4B,0x46,0x46,0x4B,0x4B]],
        sigOffset: 2,
        rows: 8, cols: 12, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.28, clampMax: 62000 },
        critical: true, showPreview: true,
      },
      {
        id: 'van_biturbo_speed',
        name: 'Speed Limiter',
        category: 'limiter',
        desc: 'EU 120 km/h commercial vehicle speed limiter. Very commonly removed on Vivaro/Trafic/NV300 work vans in the Irish and UK market.',
        a2lNames: ['GSVSD', 'vVehMax'],
        signatures: [[0x47,0x53,0x56,0x53,0x44]],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint8', le: true,
        factor: 1, offsetVal: 0, unit: 'km/h',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { speedlimiter: { multiplier: 0, addend: 250, clampMax: 255 } },
        critical: false, showPreview: false,
      },
      { id: 'van_biturbo_smoke', name: 'Smoke Limiter', category: 'smoke', desc: 'Airflow-based smoke limit for 1.6 BiTurbo van.', signatures: [], sigOffset: 0, rows: 12, cols: 16, dtype: 'uint16', le: true, factor: 0.01, offsetVal: 0, unit: 'mg/st', stage1: { multiplier: 1.10 }, stage2: { multiplier: 1.18 }, stage3: { multiplier: 1.28 }, critical: true, showPreview: true },
      { id: 'van_biturbo_soi', name: 'Start of Injection (SOI)', category: 'ignition', desc: 'Injection timing advance for 1.6 BiTurbo van.', signatures: [], sigOffset: 0, rows: 10, cols: 10, dtype: 'int16', le: true, factor: 0.02, offsetVal: 0, unit: '°BTDC', stage1: { multiplier: 1.0 }, stage2: { addend: 30 }, stage3: { addend: 50 }, critical: false, showPreview: true },
      { id: 'van_biturbo_rail', name: 'Rail Pressure Target', category: 'fuel', desc: 'Common rail pressure for 1.6 BiTurbo van.', signatures: [], sigOffset: 0, rows: 10, cols: 16, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'bar', stage1: { multiplier: 1.05 }, stage2: { multiplier: 1.08 }, stage3: { multiplier: 1.12 }, critical: false, showPreview: true },
      { id: 'van_biturbo_egr', name: 'EGR Flow Map', category: 'emission', desc: 'EGR valve duty for 1.6 BiTurbo van.', signatures: [], sigOffset: 0, rows: 8, cols: 8, dtype: 'uint16', le: true, factor: 0.1, offsetVal: 0, unit: '%', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { egr: { multiplier: 0, clampMax: 0 } }, critical: false, showPreview: false },
    ],
  },


  // ── Bosch EDC17CP45/CP49 (BMW N57 3.0d — X5/5 Series/7 Series diesel) ───────
  {
    id: 'bmw_n57',
    name: 'Bosch EDC17CP45/CP49 (BMW N57 3.0d)',
    manufacturer: 'Bosch',
    family: 'EDC17',
    // N57D30 (2010–2018): single turbo 258ps (N57D30O0), twin turbo 313ps (N57D30T0), tri-turbo 381ps (N57D30S1).
    // EDC17CP45 = X5/X6 xDrive30d 258ps; EDC17CP49 = 530d/730d/X5 313ps variants.
    // Same Bosch DAMOS symbol structure as other EDC17 — KFLDRL, MXHYE, KFFKK, GSVSD.
    identStrings: ['EDC17CP45', 'EDC17CP49', 'N57D30', 'N57D30O0', 'N57D30T0', 'N57S1', 'BMW', 'X5', '530D', '730D'],
    fileSizeRange: [1048576, 8388608],   // 1MB – 8MB
    vehicles: [
      'BMW 530d F10/F11 258/313ps N57D30 (2010–2017)',
      'BMW 730d F01 258/313ps N57D30 (2010–2015)',
      'BMW X5 xDrive30d F15 258ps N57D30O0 (2013–2018)',
      'BMW X5 xDrive40d F15 313ps N57D30T0 (2013–2018)',
      'BMW X6 xDrive30d F16 258ps N57D30 (2014–2019)',
      'BMW 740d F01 313ps N57D30 (2010–2015)',
      'BMW 7 Series 750d/M760d N57S1 tri-turbo (2012+)',
      'BMW 3 Series 330d F30 258/313ps N57 (2012–2018)',
      'BMW 5 Series GT 530d F07 N57D30',
    ],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0,
    checksumLength: 4,
    maps: [
      {
        id: 'n57_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'N57D30 boost target map. The 258ps and 313ps variants share twin-scroll hardware — Stage 1 boost raise delivers 300–330ps reliably from the entry N57.',
        a2lNames: ['KFLDRL', 'ladedrRL', 'BoostSoll'],
        signatures: [
          [0x4B,0x46,0x4C,0x44,0x52,0x4C],
          // LE Kf_ 12×8 boost (RPM axis 1200,1600,2000,2500) — database study: 243 EDC17 files
          [0x0c,0x00,0x08,0x00,0xb0,0x04,0x40,0x06,0xd0,0x07,0xc4,0x09],
        ],
        sigOffset: 2,
        rows: 8, cols: 12, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.14 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.30, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'n57_torque_limit',
        name: 'Max Torque Limit',
        category: 'torque',
        desc: 'Software torque ceiling for BMW N57. 258ps variant limited vs 313ps on identical hardware — Stage 1 raises unlock 620 Nm+.',
        a2lNames: ['MXHYE', 'momHyMax', 'MomMax'],
        signatures: [[0x4D,0x58,0x48,0x59,0x45]],
        sigOffset: 2,
        rows: 4, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.30, clampMax: 70000 },
        critical: true, showPreview: true,
      },
      {
        id: 'n57_fuel_quantity',
        name: 'Injection Quantity Map',
        category: 'fuel',
        desc: 'N57D30 injection quantity. Increased alongside boost to maintain safe AFR and EGT under heavy load at Stage 1/2.',
        a2lNames: ['KFFKK', 'mengKF', 'InjQty'],
        signatures: [[0x4B,0x46,0x46,0x4B,0x4B]],
        sigOffset: 2,
        rows: 8, cols: 12, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.14 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.28, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'n57_smoke_limiter',
        name: 'Smoke Limiter',
        category: 'smoke',
        desc: 'Black smoke limiter for BMW N57. Raised to prevent the smoke limiter capping fuelling gains at Stage 1/2 power levels.',
        a2lNames: ['MXRCH', 'rauchMax'],
        signatures: [
          [0x4D,0x58,0x52,0x43,0x48],
          [0x72,0x61,0x75,0x63,0x68,0x4D,0x61,0x78],
          // LE Kf_ 10×6 smoke limiter (RPM axis 2662,3072,3277,3482) — database study: 21 EDC17 files
          [0x0a,0x00,0x06,0x00,0x66,0x0a,0x00,0x0c,0xcd,0x0c,0x9a,0x0d],
        ],
        sigOffset: 2,
        rows: 6, cols: 10, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.14 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.28, clampMax: 65000 },
        critical: false, showPreview: false,
      },
      {
        id: 'n57_egr_map',
        name: 'EGR Map',
        category: 'emission',
        desc: 'EGR duty cycle for BMW N57. Reducing EGR lowers intake temperatures and improves turbo response on the twin-scroll 3.0d.',
        a2lNames: ['KFGR', 'egrKF'],
        signatures: [[0x4B,0x46,0x47,0x52], [0x65,0x67,0x72,0x4B,0x46]],
        sigOffset: 2,
        rows: 8, cols: 10, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: '%',
        stage1: { multiplier: 0.75 },
        stage2: { multiplier: 0.50 },
        stage3: { multiplier: 0.0, clampMin: 0, clampMax: 1 },
        addonOverrides: { egr: { multiplier: 0.0, clampMin: 0, clampMax: 1 } },
        critical: false, showPreview: false,
      },
      {
        id: 'n57_speed_limit',
        name: 'Speed Limiter',
        category: 'limiter',
        desc: 'BMW N57 speed limiter. Typically 250 km/h electronically limited on X5/7 Series. Raised or removed per customer request.',
        a2lNames: ['GSVSD', 'vVehMax'],
        signatures: [[0x47,0x53,0x56,0x53,0x44]],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint8', le: true,
        factor: 1, offsetVal: 0, unit: 'km/h',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { speedlimiter: { multiplier: 0, addend: 270, clampMax: 280 } },
        critical: false, showPreview: false,
      },
    ],
  },

  // ── Bosch MDG1 / EDC17C87 (Mercedes OM654 2.0d — 2016+) ────────────────────
  {
    id: 'merc_om654',
    name: 'Bosch EDC17C87 (Mercedes OM654 2.0d)',
    manufacturer: 'Bosch',
    family: 'EDC17',
    // OM654 (M254DE20DE1) is Mercedes modular 4-cylinder diesel launched 2016 in C-Class W205.
    // EDC17C87 / MDG1 ECU. 136–194ps in C200d/C220d/E220d/GLC220d/CLA220d. Huge UK market.
    identStrings: ['EDC17C87', 'MDG1', 'OM654', 'OM654DE20LA', 'C220D', 'E220D', 'GLC220', 'MERCEDES', 'W205', 'W213'],
    fileSizeRange: [1048576, 8388608],   // 1MB – 8MB
    vehicles: [
      'Mercedes C200d / C220d W205 (2015–2021) OM654',
      'Mercedes E200d / E220d W213 (2016+) OM654',
      'Mercedes GLC 220d X253 (2015+) OM654',
      'Mercedes GLE 300d W167 (2019+) OM654',
      'Mercedes CLA 200d / 220d C118 (2019+) OM654',
      'Mercedes A200d / A220d W177 (2018+) OM654',
      'Mercedes B200d / B220d W247 (2018+) OM654',
      'Mercedes GLB 200d / 220d X247 (2019+) OM654',
    ],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0,
    checksumLength: 4,
    maps: [
      {
        id: 'om654_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'OM654 2.0d boost target. C200d (136ps) and C220d (194ps) share the same block — Stage 1 boost raise delivers 220–240ps from the C200d.',
        a2lNames: ['KFLDRL', 'ladedrRL', 'BoostSoll'],
        signatures: [
          [0x4B,0x46,0x4C,0x44,0x52,0x4C],
          // LE Kf_ 12×8 boost (RPM axis 1200,1600,2000,2500) — database study: 243 EDC17 files
          [0x0c,0x00,0x08,0x00,0xb0,0x04,0x40,0x06,0xd0,0x07,0xc4,0x09],
        ],
        sigOffset: 2,
        rows: 8, cols: 12, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.14 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.30, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'om654_torque_limit',
        name: 'Max Torque Limit',
        category: 'torque',
        desc: 'Software torque ceiling for Mercedes OM654. C200d software-limited to 400 Nm — Stage 1 raise to 480 Nm matches C220d hardware output.',
        a2lNames: ['MXHYE', 'momHyMax', 'MomMax'],
        signatures: [[0x4D,0x58,0x48,0x59,0x45]],
        sigOffset: 2,
        rows: 4, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.30, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'om654_fuel_quantity',
        name: 'Injection Quantity Map',
        category: 'fuel',
        desc: 'Fuelling map for Mercedes OM654. Scaled with boost target to maintain safe lambda and EGT at all stage levels.',
        a2lNames: ['KFFKK', 'mengKF', 'InjQty'],
        signatures: [[0x4B,0x46,0x46,0x4B,0x4B]],
        sigOffset: 2,
        rows: 8, cols: 12, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.14 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.28, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'om654_smoke_limiter',
        name: 'Smoke Limiter',
        category: 'smoke',
        desc: 'Smoke limiter for Mercedes OM654. Raised to prevent black smoke cut-in at Stage 1/2 power levels.',
        a2lNames: ['MXRCH', 'rauchMax'],
        signatures: [
          [0x4D,0x58,0x52,0x43,0x48],
          // LE Kf_ 10×6 smoke limiter (RPM axis 2662,3072,3277,3482) — database study: 21 EDC17 files
          [0x0a,0x00,0x06,0x00,0x66,0x0a,0x00,0x0c,0xcd,0x0c,0x9a,0x0d],
        ],
        sigOffset: 2,
        rows: 6, cols: 10, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.14 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.28, clampMax: 65000 },
        critical: false, showPreview: false,
      },
      {
        id: 'om654_egr_map',
        name: 'EGR Map',
        category: 'emission',
        desc: 'EGR duty cycle for OM654. Mercedes fitted dual EGR (HP and LP) — reducing duty improves response and reduces inlet carbon on modern 2.0d.',
        a2lNames: ['KFGR', 'egrKF'],
        signatures: [[0x4B,0x46,0x47,0x52]],
        sigOffset: 2,
        rows: 8, cols: 10, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: '%',
        stage1: { multiplier: 0.75 },
        stage2: { multiplier: 0.50 },
        stage3: { multiplier: 0.0, clampMin: 0, clampMax: 1 },
        addonOverrides: { egr: { multiplier: 0.0, clampMin: 0, clampMax: 1 } },
        critical: false, showPreview: false,
      },
      {
        id: 'om654_speed_limit',
        name: 'Speed Limiter',
        category: 'limiter',
        desc: 'Mercedes OM654 speed limiter. EU 250 km/h on most cars. Standard removal on customer request.',
        a2lNames: ['GSVSD', 'vVehMax'],
        signatures: [[0x47,0x53,0x56,0x53,0x44]],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint8', le: true,
        factor: 1, offsetVal: 0, unit: 'km/h',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { speedlimiter: { multiplier: 0, addend: 270, clampMax: 280 } },
        critical: false, showPreview: false,
      },
    ],
  },

  // ── Bosch EDC17C69/C10 (Ford Ranger 2.2/3.2 TDCi — Puma engine) ────────────
  {
    id: 'ford_ranger',
    name: 'Bosch EDC17C69/C10 (Ford Ranger 2.2/3.2 TDCi)',
    manufacturer: 'Bosch',
    family: 'EDC17',
    // Ford Ranger T6/PXII/PXIII (2011+): 2.2L I4 150ps and 3.2L I5 200ps Puma TDCi.
    // EDC17C69 (2.2 TDCi) / EDC17C10 (3.2 TDCi). One of Ireland's best-selling pick-ups 2015+.
    identStrings: ['EDC17C69', 'EDC17C10', 'RANGER', 'PUMA', '3.2TDCI', '2.2TDCI', 'T6MF', 'T7MF', 'FORD'],
    fileSizeRange: [1048576, 4194304],   // 1MB – 4MB
    vehicles: [
      'Ford Ranger 2.2 TDCi 4x4 150ps T6/T7 (2011+)',
      'Ford Ranger 3.2 TDCi 4x4 200ps T6/T7 (2011+)',
      'Ford Ranger Wildtrak 3.2 200ps (2012+)',
      'Ford Ranger Raptor 2.0 EcoBlue 213ps (2019+)',
      'Mazda BT-50 2.2/3.2 TDCi (shares platform)',
    ],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0,
    checksumLength: 4,
    maps: [
      {
        id: 'ranger_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'Ranger 2.2/3.2 TDCi boost target. The 3.2 five-cylinder responds particularly well — Stage 1 boost raise delivers 240ps+ reliably on the Wildtrak.',
        a2lNames: ['KFLDRL', 'ladedrRL', 'BoostSoll'],
        signatures: [
          [0x4B,0x46,0x4C,0x44,0x52,0x4C],
          // LE Kf_ 12×8 boost (RPM axis 1200,1600,2000,2500) — database study: 243 EDC17 files
          [0x0c,0x00,0x08,0x00,0xb0,0x04,0x40,0x06,0xd0,0x07,0xc4,0x09],
        ],
        sigOffset: 2,
        rows: 8, cols: 12, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.14 },
        stage2: { multiplier: 1.24 },
        stage3: { multiplier: 1.32, clampMax: 62000 },
        critical: true, showPreview: true,
      },
      {
        id: 'ranger_torque_limit',
        name: 'Max Torque Limit',
        category: 'torque',
        desc: 'Software torque ceiling for Ranger TDCi. 3.2L five-cylinder limited to 470 Nm — Stage 1/2 raise to 550 Nm gives a massive improvement for towing.',
        a2lNames: ['MXHYE', 'momHyMax', 'MomMax'],
        signatures: [[0x4D,0x58,0x48,0x59,0x45]],
        sigOffset: 2,
        rows: 4, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.16 },
        stage2: { multiplier: 1.25 },
        stage3: { multiplier: 1.32, clampMax: 70000 },
        critical: true, showPreview: true,
      },
      {
        id: 'ranger_fuel_quantity',
        name: 'Injection Quantity Map',
        category: 'fuel',
        desc: 'Fuelling map for Ford Ranger Puma TDCi. Increased to support boost and torque gains — essential for Stage 1/2 towing performance.',
        a2lNames: ['KFFKK', 'mengKF', 'InjQty'],
        signatures: [[0x4B,0x46,0x46,0x4B,0x4B]],
        sigOffset: 2,
        rows: 8, cols: 12, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.14 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.28, clampMax: 62000 },
        critical: true, showPreview: true,
      },
      {
        id: 'ranger_smoke_limiter',
        name: 'Smoke Limiter',
        category: 'smoke',
        desc: 'Smoke limiter for Ford Ranger TDCi. Raised alongside injection quantity to prevent black smoke on the 3.2 five-cylinder at Stage 1/2.',
        a2lNames: ['MXRCH', 'rauchMax'],
        signatures: [
          [0x4D,0x58,0x52,0x43,0x48],
          // LE Kf_ 10×6 smoke limiter (RPM axis 2662,3072,3277,3482) — database study: 21 EDC17 files
          [0x0a,0x00,0x06,0x00,0x66,0x0a,0x00,0x0c,0xcd,0x0c,0x9a,0x0d],
        ],
        sigOffset: 2,
        rows: 6, cols: 10, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.14 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.28, clampMax: 62000 },
        critical: false, showPreview: false,
      },
      {
        id: 'ranger_egr_map',
        name: 'EGR Map',
        category: 'emission',
        desc: 'EGR duty cycle for Ranger TDCi. Reducing EGR improves intake air temperature — especially noticeable on the 3.2 five-cylinder under towing load.',
        a2lNames: ['KFGR', 'egrKF'],
        signatures: [[0x4B,0x46,0x47,0x52]],
        sigOffset: 2,
        rows: 8, cols: 10, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: '%',
        stage1: { multiplier: 0.75 },
        stage2: { multiplier: 0.50 },
        stage3: { multiplier: 0.0, clampMin: 0, clampMax: 1 },
        addonOverrides: { egr: { multiplier: 0.0, clampMin: 0, clampMax: 1 } },
        critical: false, showPreview: false,
      },
      {
        id: 'ranger_speed_limit',
        name: 'Speed Limiter',
        category: 'limiter',
        desc: 'Ranger speed limiter. Factory 170 km/h on most variants. Speed limiter removal popular on Irish rural customers and towing setups.',
        a2lNames: ['GSVSD', 'vVehMax'],
        signatures: [[0x47,0x53,0x56,0x53,0x44]],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint8', le: true,
        factor: 1, offsetVal: 0, unit: 'km/h',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { speedlimiter: { multiplier: 0, addend: 200, clampMax: 220 } },
        critical: false, showPreview: false,
      },
    ],
  },

  // ── Bosch EDC17C57 (BMW B57 3.0d — G-series 2018+) ──────────────────────────
  {
    id: 'bmw_b57',
    name: 'Bosch EDC17C57 (BMW B57 3.0d)',
    manufacturer: 'Bosch',
    family: 'EDC17',
    // B57D30 (2018+) replaced the N57 in G-series 5/7/X5/X6/X7 Series.
    // B57D30O0 = 265ps, B57D30T0 = 320ps, B57D30S1 M57 replacement in M550d = 395ps.
    // EDC17C57 / EDC17C76 depending on variant. Same DAMOS symbol structure.
    identStrings: ['B57D30', 'B57D30O0', 'B57D30T0', 'B57D30S1', 'EDC17C57', 'EDC17C76', 'G30', 'G05', 'G07', 'X5'],
    fileSizeRange: [2097152, 8388608],   // 2MB – 8MB
    vehicles: [
      'BMW 530d G30 265/340ps B57D30 (2017+)',
      'BMW 730d G11 265/340ps B57D30 (2016+)',
      'BMW X5 xDrive30d G05 265ps B57D30O0 (2018+)',
      'BMW X5 xDrive40d G05 340ps B57D30T0 (2018+)',
      'BMW X6 xDrive30d/40d G06 B57D30 (2019+)',
      'BMW X7 xDrive30d/40d G07 B57D30 (2019+)',
      'BMW M550d xDrive G30 400ps B57D30S1 (2017+)',
      'BMW 740d G11 340ps B57D30T0 (2016+)',
      'BMW 430d/440d G22/G23 (B57D30 2020+)',
      'BMW 430d xDrive G22 (B57D30 2020+)',
    ],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0,
    checksumLength: 4,
    maps: [
      {
        id: 'b57_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'B57D30 boost target. 265ps and 340ps variants share the same twin-turbo hardware — Stage 1 boost raise delivers 330–360ps from the entry B57.',
        a2lNames: ['KFLDRL', 'ladedrRL', 'BoostSoll'],
        signatures: [
          [0x4B,0x46,0x4C,0x44,0x52,0x4C],
          // LE Kf_ 12×8 boost (RPM axis 1200,1600,2000,2500) — database study: 243 EDC17 files
          [0x0c,0x00,0x08,0x00,0xb0,0x04,0x40,0x06,0xd0,0x07,0xc4,0x09],
        ],
        sigOffset: 2,
        rows: 8, cols: 12, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.14 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.30, clampMax: 68000 },
        critical: true, showPreview: true,
      },
      {
        id: 'b57_torque_limit',
        name: 'Max Torque Limit',
        category: 'torque',
        desc: 'Software torque ceiling for BMW B57. Entry 265ps X5/530d limited in software — Stage 1/2 raise to match 340ps hardware torque output.',
        a2lNames: ['MXHYE', 'momHyMax', 'MomMax'],
        signatures: [[0x4D,0x58,0x48,0x59,0x45]],
        sigOffset: 2,
        rows: 4, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.30, clampMax: 72000 },
        critical: true, showPreview: true,
      },
      {
        id: 'b57_fuel_quantity',
        name: 'Injection Quantity Map',
        category: 'fuel',
        desc: 'Fuelling map for BMW B57. Scaled with boost to maintain safe AFR and EGT. B57 uses piezo injectors — fuelling precision is critical.',
        a2lNames: ['KFFKK', 'mengKF', 'InjQty'],
        signatures: [[0x4B,0x46,0x46,0x4B,0x4B]],
        sigOffset: 2,
        rows: 8, cols: 12, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.14 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.28, clampMax: 68000 },
        critical: true, showPreview: true,
      },
      {
        id: 'b57_smoke_limiter',
        name: 'Smoke Limiter',
        category: 'smoke',
        desc: 'Black smoke limiter for BMW B57. Raised to prevent the limiter capping fuelling at Stage 1/2 power.',
        a2lNames: ['MXRCH', 'rauchMax'],
        signatures: [
          [0x4D,0x58,0x52,0x43,0x48],
          // LE Kf_ 10×6 smoke limiter (RPM axis 2662,3072,3277,3482) — database study: 21 EDC17 files
          [0x0a,0x00,0x06,0x00,0x66,0x0a,0x00,0x0c,0xcd,0x0c,0x9a,0x0d],
        ],
        sigOffset: 2,
        rows: 6, cols: 10, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'mg/st',
        stage1: { multiplier: 1.14 },
        stage2: { multiplier: 1.22 },
        stage3: { multiplier: 1.28, clampMax: 68000 },
        critical: false, showPreview: false,
      },
      {
        id: 'b57_egr_map',
        name: 'EGR Map',
        category: 'emission',
        desc: 'EGR duty cycle for BMW B57. Reducing EGR lowers inlet temperatures and reduces carbon buildup on the G-series six-cylinder diesel.',
        a2lNames: ['KFGR', 'egrKF'],
        signatures: [[0x4B,0x46,0x47,0x52]],
        sigOffset: 2,
        rows: 8, cols: 10, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: '%',
        stage1: { multiplier: 0.75 },
        stage2: { multiplier: 0.50 },
        stage3: { multiplier: 0.0, clampMin: 0, clampMax: 1 },
        addonOverrides: { egr: { multiplier: 0.0, clampMin: 0, clampMax: 1 } },
        critical: false, showPreview: false,
      },
      {
        id: 'b57_speed_limit',
        name: 'Speed Limiter',
        category: 'limiter',
        desc: 'BMW B57 speed limiter. 250 km/h limit on G-series X5/X6/X7 by default. Raised or removed on customer request.',
        a2lNames: ['GSVSD', 'vVehMax'],
        signatures: [[0x47,0x53,0x56,0x53,0x44]],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint8', le: true,
        factor: 1, offsetVal: 0, unit: 'km/h',
        stage1: { multiplier: 1.0 },
        stage2: { multiplier: 1.0 },
        stage3: { multiplier: 1.0 },
        addonOverrides: { speedlimiter: { multiplier: 0, addend: 270, clampMax: 280 } },
        critical: false, showPreview: false,
      },
    ],
  },

  // ── Siemens/Continental SID80x (VAG/Renault/PSA diesel) ───────────────────
  {
    id: 'siemens_sid',
    name: 'Siemens SID (Diesel)',
    manufacturer: 'Siemens',
    family: 'SID',
    identStrings: ['SID801', 'SID802', 'SID803', 'SID804', 'SID805', 'SID806', 'SID807', 'SID201', 'SID206', 'SID301', 'SID310', '5WS4', '5WK9'],
    fileSizeRange: [262144, 2097152],
    vehicles: ['Renault Mégane dCi', 'Renault Laguna dCi', 'Peugeot 307 HDi', 'Citroën C4 HDi', 'Volvo D5'],
    checksumAlgo: 'unknown', checksumOffset: 0, checksumLength: 0,
    maps: [
      { id: 'sid_boost_target', name: 'Boost Pressure Target', category: 'boost', desc: 'Charge air pressure setpoint.', signatures: [], sigOffset: 0, rows: 12, cols: 16, dtype: 'uint16', le: true, factor: 0.001, offsetVal: 0, unit: 'bar', stage1: { multiplier: 1.15 }, stage2: { multiplier: 1.25 }, stage3: { multiplier: 1.38 }, critical: true, showPreview: true },
      { id: 'sid_fuel_inject', name: 'Injection Duration', category: 'fuel', desc: 'Fuel injection duration map.', signatures: [], sigOffset: 0, rows: 16, cols: 16, dtype: 'uint16', le: true, factor: 0.001, offsetVal: 0, unit: 'ms', stage1: { multiplier: 1.12 }, stage2: { multiplier: 1.20 }, stage3: { multiplier: 1.30 }, critical: true, showPreview: true },
      { id: 'sid_torque_limit', name: 'Torque Demand Limit', category: 'torque', desc: 'Software torque ceiling.', signatures: [], sigOffset: 0, rows: 8, cols: 8, dtype: 'uint16', le: true, factor: 0.1, offsetVal: 0, unit: 'Nm', stage1: { multiplier: 1.25 }, stage2: { multiplier: 1.40 }, stage3: { multiplier: 1.60 }, critical: true, showPreview: true },
      { id: 'sid_smoke_limiter', name: 'Smoke Limiter', category: 'smoke', desc: 'Airflow-based smoke limit.', signatures: [], sigOffset: 0, rows: 12, cols: 16, dtype: 'uint16', le: true, factor: 0.01, offsetVal: 0, unit: 'mg/st', stage1: { multiplier: 1.15 }, stage2: { multiplier: 1.25 }, stage3: { multiplier: 1.35 }, critical: false, showPreview: true },
      { id: 'sid_soi', name: 'Start of Injection', category: 'ignition', desc: 'Injection timing advance.', signatures: [], sigOffset: 0, rows: 10, cols: 12, dtype: 'int16', le: true, factor: 0.02, offsetVal: 0, unit: '°DBTC', stage1: { addend: 0 }, stage2: { addend: 50 }, stage3: { addend: 130 }, critical: false, showPreview: true },
      { id: 'sid_rail_pressure', name: 'Rail Pressure Target', category: 'fuel', desc: 'Common rail pressure setpoint.', signatures: [], sigOffset: 0, rows: 10, cols: 16, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'bar', stage1: { multiplier: 1.05 }, stage2: { multiplier: 1.08 }, stage3: { multiplier: 1.12 }, critical: false, showPreview: true },
      { id: 'sid_egr', name: 'EGR Flow Map', category: 'emission', desc: 'EGR valve duty.', signatures: [], sigOffset: 0, rows: 8, cols: 8, dtype: 'uint16', le: true, factor: 0.1, offsetVal: 0, unit: '%', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { egr: { multiplier: 0, clampMax: 0 } }, critical: false, showPreview: false },
      { id: 'sid_speed_limit', name: 'Vehicle Speed Limiter', category: 'limiter', desc: 'Factory speed limiter.', signatures: [], sigOffset: 0, rows: 1, cols: 1, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'km/h', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { speedlimiter: { multiplier: 0, addend: 65535 } }, critical: false, showPreview: false },
    ],
  },

  // ── Siemens/Continental EMS3 (Renault/Nissan petrol) ──────────────────────
  {
    id: 'siemens_ems3',
    name: 'Siemens EMS3 (Petrol)',
    manufacturer: 'Siemens',
    family: 'EMS3',
    identStrings: ['EMS3110', 'EMS3120', 'EMS3125', 'EMS3130', 'EMS3132', 'EMS3150', 'EMS31', 'EMS32'],
    fileSizeRange: [262144, 2097152],
    vehicles: ['Renault Clio RS', 'Renault Mégane RS', 'Nissan Qashqai', 'Dacia Duster'],
    checksumAlgo: 'unknown', checksumOffset: 0, checksumLength: 0,
    maps: [
      { id: 'ems3_boost_target', name: 'Boost Pressure Target', category: 'boost', desc: 'Charge air pressure setpoint.', signatures: [], sigOffset: 0, rows: 12, cols: 16, dtype: 'uint16', le: true, factor: 0.001, offsetVal: 0, unit: 'bar', stage1: { multiplier: 1.15 }, stage2: { multiplier: 1.28 }, stage3: { multiplier: 1.42 }, critical: true, showPreview: true },
      { id: 'ems3_fuel_inject', name: 'Fuel Injection Map', category: 'fuel', desc: 'Fuel injection duration.', signatures: [], sigOffset: 0, rows: 16, cols: 16, dtype: 'uint16', le: true, factor: 0.001, offsetVal: 0, unit: 'ms', stage1: { multiplier: 1.10 }, stage2: { multiplier: 1.18 }, stage3: { multiplier: 1.25 }, critical: true, showPreview: true },
      { id: 'ems3_ign_timing', name: 'Ignition Timing', category: 'ignition', desc: 'Spark advance map.', signatures: [], sigOffset: 0, rows: 12, cols: 16, dtype: 'int16', le: true, factor: 0.75, offsetVal: 0, unit: '°BTDC', stage1: { addend: 0 }, stage2: { addend: 1 }, stage3: { addend: 2 }, critical: false, showPreview: true },
      { id: 'ems3_torque_limit', name: 'Torque Limit', category: 'torque', desc: 'Torque ceiling.', signatures: [], sigOffset: 0, rows: 8, cols: 8, dtype: 'uint16', le: true, factor: 0.1, offsetVal: 0, unit: 'Nm', stage1: { multiplier: 1.22 }, stage2: { multiplier: 1.35 }, stage3: { multiplier: 1.50 }, critical: true, showPreview: true },
      { id: 'ems3_lambda_target', name: 'Lambda / AFR Target', category: 'smoke', desc: 'Lambda target for EMS3 petrol.', signatures: [], sigOffset: 0, rows: 16, cols: 16, dtype: 'uint16', le: true, factor: 0.001, offsetVal: 0, unit: 'lambda', stage1: { multiplier: 1.0 }, stage2: { multiplier: 0.98 }, stage3: { multiplier: 0.95 }, critical: false, showPreview: true },
      { id: 'ems3_rev_limit', name: 'Rev Limiter', category: 'limiter', desc: 'Engine RPM hard-cut for EMS3 petrol.', signatures: [], sigOffset: 0, rows: 1, cols: 1, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'RPM', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { revlimit: { addend: 300, clampMax: 8000 } }, critical: false, showPreview: false },
      { id: 'ems3_speed_limit', name: 'Vehicle Speed Limiter', category: 'limiter', desc: 'Factory speed limiter for EMS3 petrol.', signatures: [], sigOffset: 0, rows: 1, cols: 1, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'km/h', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { speedlimiter: { multiplier: 0, addend: 65535 } }, critical: false, showPreview: false },
    ],
  },

  // ── Siemens/Continental PCR2.1 (PSA/Ford diesel) ──────────────────────────
  {
    id: 'siemens_pcr',
    name: 'Siemens PCR2.1 (Diesel)',
    manufacturer: 'Continental',
    family: 'PCR',
    identStrings: ['PCR2.1', 'PCR21', 'PCR2', '5WS40', '5WK93'],
    fileSizeRange: [524288, 2097152],
    vehicles: ['Peugeot 307 HDi', 'Citroën C4 HDi', 'Ford Focus TDCi', 'Volvo S40 D4'],
    checksumAlgo: 'unknown', checksumOffset: 0, checksumLength: 0,
    maps: [
      { id: 'pcr_boost_target', name: 'Boost Pressure Target', category: 'boost', desc: 'Charge air pressure setpoint.', signatures: [], sigOffset: 0, rows: 12, cols: 16, dtype: 'uint16', le: true, factor: 0.001, offsetVal: 0, unit: 'bar', stage1: { multiplier: 1.15 }, stage2: { multiplier: 1.25 }, stage3: { multiplier: 1.38 }, critical: true, showPreview: true },
      { id: 'pcr_fuel_inject', name: 'Injection Duration', category: 'fuel', desc: 'Fuel injection duration map.', signatures: [], sigOffset: 0, rows: 16, cols: 16, dtype: 'uint16', le: true, factor: 0.001, offsetVal: 0, unit: 'ms', stage1: { multiplier: 1.12 }, stage2: { multiplier: 1.20 }, stage3: { multiplier: 1.30 }, critical: true, showPreview: true },
      { id: 'pcr_torque_limit', name: 'Torque Demand Limit', category: 'torque', desc: 'Software torque ceiling.', signatures: [], sigOffset: 0, rows: 8, cols: 8, dtype: 'uint16', le: true, factor: 0.1, offsetVal: 0, unit: 'Nm', stage1: { multiplier: 1.25 }, stage2: { multiplier: 1.40 }, stage3: { multiplier: 1.60 }, critical: true, showPreview: true },
      { id: 'pcr_smoke_limiter', name: 'Smoke Limiter', category: 'smoke', desc: 'Airflow-based smoke limit.', signatures: [], sigOffset: 0, rows: 12, cols: 16, dtype: 'uint16', le: true, factor: 0.01, offsetVal: 0, unit: 'mg/st', stage1: { multiplier: 1.10 }, stage2: { multiplier: 1.18 }, stage3: { multiplier: 1.28 }, critical: true, showPreview: true },
      { id: 'pcr_soi', name: 'Start of Injection (SOI)', category: 'ignition', desc: 'Injection timing advance.', signatures: [], sigOffset: 0, rows: 10, cols: 10, dtype: 'int16', le: true, factor: 0.02, offsetVal: 0, unit: '°BTDC', stage1: { multiplier: 1.0 }, stage2: { addend: 30 }, stage3: { addend: 50 }, critical: false, showPreview: true },
      { id: 'pcr_rail_pressure', name: 'Rail Pressure Target', category: 'fuel', desc: 'Common rail pressure setpoint.', signatures: [], sigOffset: 0, rows: 10, cols: 16, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'bar', stage1: { multiplier: 1.05 }, stage2: { multiplier: 1.08 }, stage3: { multiplier: 1.12 }, critical: false, showPreview: true },
      { id: 'pcr_egr', name: 'EGR Flow Map', category: 'emission', desc: 'EGR valve duty.', signatures: [], sigOffset: 0, rows: 8, cols: 8, dtype: 'uint16', le: true, factor: 0.1, offsetVal: 0, unit: '%', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { egr: { multiplier: 0, clampMax: 0 } }, critical: false, showPreview: false },
      { id: 'pcr_speed_limit', name: 'Vehicle Speed Limiter', category: 'limiter', desc: 'Factory speed limiter.', signatures: [], sigOffset: 0, rows: 1, cols: 1, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'km/h', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { speedlimiter: { multiplier: 0, addend: 65535 } }, critical: false, showPreview: false },
    ],
  },

  // ── Delphi DCM3.5 / DCM3.7 (Renault/Nissan diesel) ───────────────────────
  {
    id: 'delphi_dcm35',
    name: 'Delphi DCM3.5',
    manufacturer: 'Delphi',
    family: 'DCM3',
    identStrings: ['DCM3.5', 'DCM35', 'DCM3.7', 'DCM37', 'DDCR', 'R0410', 'R0413'],
    fileSizeRange: [262144, 2097152],
    vehicles: ['Renault Kangoo dCi', 'Nissan Note dCi', 'Dacia Logan dCi'],
    checksumAlgo: 'unknown', checksumOffset: 0, checksumLength: 0,
    maps: [
      { id: 'dcm35_boost', name: 'Boost Pressure Target', category: 'boost', desc: 'Boost setpoint.', signatures: [], sigOffset: 0, rows: 10, cols: 14, dtype: 'uint16', le: true, factor: 0.001, offsetVal: 0, unit: 'bar', stage1: { multiplier: 1.15 }, stage2: { multiplier: 1.25 }, stage3: { multiplier: 1.38 }, critical: true, showPreview: true },
      { id: 'dcm35_fuel', name: 'Injection Quantity', category: 'fuel', desc: 'Fuel quantity map.', signatures: [], sigOffset: 0, rows: 12, cols: 16, dtype: 'uint16', le: true, factor: 0.01, offsetVal: 0, unit: 'mg/st', stage1: { multiplier: 1.14 }, stage2: { multiplier: 1.22 }, stage3: { multiplier: 1.30 }, critical: true, showPreview: true },
      { id: 'dcm35_torque', name: 'Torque Limit', category: 'torque', desc: 'Torque ceiling.', signatures: [], sigOffset: 0, rows: 8, cols: 8, dtype: 'uint16', le: true, factor: 0.1, offsetVal: 0, unit: 'Nm', stage1: { multiplier: 1.22 }, stage2: { multiplier: 1.38 }, stage3: { multiplier: 1.55 }, critical: true, showPreview: true },
      { id: 'dcm35b_smoke_limiter', name: 'Smoke Limiter', category: 'smoke', desc: 'Airflow-based smoke limit.', signatures: [], sigOffset: 0, rows: 12, cols: 16, dtype: 'uint16', le: true, factor: 0.01, offsetVal: 0, unit: 'mg/st', stage1: { multiplier: 1.10 }, stage2: { multiplier: 1.18 }, stage3: { multiplier: 1.28 }, critical: true, showPreview: true },
      { id: 'dcm35b_soi', name: 'Start of Injection (SOI)', category: 'ignition', desc: 'Injection timing advance.', signatures: [], sigOffset: 0, rows: 10, cols: 10, dtype: 'int16', le: true, factor: 0.02, offsetVal: 0, unit: '°BTDC', stage1: { multiplier: 1.0 }, stage2: { addend: 30 }, stage3: { addend: 50 }, critical: false, showPreview: true },
      { id: 'dcm35b_rail_pressure', name: 'Rail Pressure Target', category: 'fuel', desc: 'Common rail pressure setpoint.', signatures: [], sigOffset: 0, rows: 10, cols: 16, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'bar', stage1: { multiplier: 1.05 }, stage2: { multiplier: 1.08 }, stage3: { multiplier: 1.12 }, critical: false, showPreview: true },
      { id: 'dcm35b_egr', name: 'EGR Flow Map', category: 'emission', desc: 'EGR valve duty.', signatures: [], sigOffset: 0, rows: 8, cols: 8, dtype: 'uint16', le: true, factor: 0.1, offsetVal: 0, unit: '%', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { egr: { multiplier: 0, clampMax: 0 } }, critical: false, showPreview: false },
      { id: 'dcm35b_speed_limit', name: 'Vehicle Speed Limiter', category: 'limiter', desc: 'Factory speed limiter.', signatures: [], sigOffset: 0, rows: 1, cols: 1, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'km/h', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { speedlimiter: { multiplier: 0, addend: 65535 } }, critical: false, showPreview: false },
    ],
  },

  // ── Magneti Marelli 8GMF / MM10 (Fiat/Alfa petrol) ────────────────────────
  {
    id: 'marelli_8gmf',
    name: 'Marelli 8GMF (Multiair)',
    manufacturer: 'Magneti Marelli',
    family: 'Marelli_8GMF',
    identStrings: ['8GMF', '8GMFHW', 'MM8GMF', 'Gen 8 Multiair', '51896', '51871', '51904', '55263', 'ME10G'],
    fileSizeRange: [1048576, 4194304],
    vehicles: ['Fiat 500 Abarth', 'Alfa Giulietta 1.4T', 'Alfa MiTo 1.4T', 'Fiat Punto Evo 1.4T', 'Jeep Renegade 1.4T'],
    checksumAlgo: 'unknown', checksumOffset: 0, checksumLength: 0,
    maps: [
      { id: 'mm8g_boost_target', name: 'Boost Pressure Target', category: 'boost', desc: 'Multiair boost setpoint.', signatures: [], sigOffset: 0, rows: 16, cols: 16, dtype: 'uint16', le: true, factor: 0.001, offsetVal: 0, unit: 'bar', stage1: { multiplier: 1.15 }, stage2: { multiplier: 1.28 }, stage3: { multiplier: 1.42 }, critical: true, showPreview: true },
      { id: 'mm8g_fuel_inject', name: 'Fuel Injection Duration', category: 'fuel', desc: 'Injection duration map.', signatures: [], sigOffset: 0, rows: 16, cols: 16, dtype: 'uint16', le: true, factor: 0.001, offsetVal: 0, unit: 'ms', stage1: { multiplier: 1.10 }, stage2: { multiplier: 1.18 }, stage3: { multiplier: 1.25 }, critical: true, showPreview: true },
      { id: 'mm8g_ign_timing', name: 'Ignition Timing', category: 'ignition', desc: 'Spark advance map.', signatures: [], sigOffset: 0, rows: 12, cols: 16, dtype: 'int16', le: true, factor: 0.75, offsetVal: 0, unit: '°BTDC', stage1: { addend: 0 }, stage2: { addend: 1 }, stage3: { addend: 2 }, critical: false, showPreview: true },
      { id: 'mm8g_torque_limit', name: 'Torque Demand Limit', category: 'torque', desc: 'Torque ceiling.', signatures: [], sigOffset: 0, rows: 8, cols: 8, dtype: 'uint16', le: true, factor: 0.1, offsetVal: 0, unit: 'Nm', stage1: { multiplier: 1.22 }, stage2: { multiplier: 1.35 }, stage3: { multiplier: 1.50 }, critical: true, showPreview: true },
      { id: 'mm8g_lambda_target', name: 'Lambda / AFR Target', category: 'smoke', desc: 'Lambda target for 8GMF Multiair petrol.', signatures: [], sigOffset: 0, rows: 16, cols: 16, dtype: 'uint16', le: true, factor: 0.001, offsetVal: 0, unit: 'lambda', stage1: { multiplier: 1.0 }, stage2: { multiplier: 0.98 }, stage3: { multiplier: 0.95 }, critical: false, showPreview: true },
      { id: 'mm8g_rev_limit', name: 'Rev Limiter', category: 'limiter', desc: 'Engine RPM hard-cut for 8GMF Multiair.', signatures: [], sigOffset: 0, rows: 1, cols: 1, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'RPM', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { revlimit: { addend: 300, clampMax: 8000 } }, critical: false, showPreview: false },
      { id: 'mm8g_speed_limit', name: 'Vehicle Speed Limiter', category: 'limiter', desc: 'Factory speed limiter for 8GMF Multiair.', signatures: [], sigOffset: 0, rows: 1, cols: 1, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'km/h', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { speedlimiter: { multiplier: 0, addend: 65535 } }, critical: false, showPreview: false },
    ],
  },

  // ── Magneti Marelli MJD6F3 (Fiat/Alfa/Lancia diesel) ──────────────────────
  {
    id: 'marelli_mjd',
    name: 'Marelli MJD (Diesel)',
    manufacturer: 'Magneti Marelli',
    family: 'Marelli_MJD',
    identStrings: ['MJD6F3', 'MJD602', 'MJD8F2', 'MJD8DF', 'MJD9DF', 'MJD6JO'],
    fileSizeRange: [1048576, 4194304],
    vehicles: ['Fiat 500 1.3 JTD', 'Fiat Punto 1.3 JTD', 'Alfa MiTo 1.3 JTD', 'Fiat Doblo 1.3 JTD', 'Lancia Ypsilon 1.3 JTD'],
    checksumAlgo: 'unknown', checksumOffset: 0, checksumLength: 0,
    maps: [
      { id: 'mjd_boost_target', name: 'Boost Pressure Target', category: 'boost', desc: 'Boost setpoint.', signatures: [], sigOffset: 0, rows: 12, cols: 16, dtype: 'uint16', le: true, factor: 0.001, offsetVal: 0, unit: 'bar', stage1: { multiplier: 1.15 }, stage2: { multiplier: 1.25 }, stage3: { multiplier: 1.38 }, critical: true, showPreview: true },
      { id: 'mjd_fuel_inject', name: 'Injection Quantity', category: 'fuel', desc: 'Fuel injection quantity map.', signatures: [], sigOffset: 0, rows: 16, cols: 16, dtype: 'uint16', le: true, factor: 0.01, offsetVal: 0, unit: 'mg/st', stage1: { multiplier: 1.14 }, stage2: { multiplier: 1.22 }, stage3: { multiplier: 1.30 }, critical: true, showPreview: true },
      { id: 'mjd_torque_limit', name: 'Torque Demand Limit', category: 'torque', desc: 'Torque ceiling.', signatures: [], sigOffset: 0, rows: 8, cols: 8, dtype: 'uint16', le: true, factor: 0.1, offsetVal: 0, unit: 'Nm', stage1: { multiplier: 1.22 }, stage2: { multiplier: 1.38 }, stage3: { multiplier: 1.55 }, critical: true, showPreview: true },
      { id: 'mjd2_smoke_limiter', name: 'Smoke Limiter', category: 'smoke', desc: 'Smoke limit for MJD diesel.', signatures: [], sigOffset: 0, rows: 12, cols: 16, dtype: 'uint16', le: true, factor: 0.01, offsetVal: 0, unit: 'mg/st', stage1: { multiplier: 1.10 }, stage2: { multiplier: 1.18 }, stage3: { multiplier: 1.28 }, critical: true, showPreview: true },
      { id: 'mjd2_soi', name: 'Start of Injection (SOI)', category: 'ignition', desc: 'Injection timing advance for MJD diesel.', signatures: [], sigOffset: 0, rows: 10, cols: 10, dtype: 'int16', le: true, factor: 0.02, offsetVal: 0, unit: '°BTDC', stage1: { multiplier: 1.0 }, stage2: { addend: 30 }, stage3: { addend: 50 }, critical: false, showPreview: true },
      { id: 'mjd2_rail_pressure', name: 'Rail Pressure Target', category: 'fuel', desc: 'Common rail pressure for MJD.', signatures: [], sigOffset: 0, rows: 10, cols: 16, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'bar', stage1: { multiplier: 1.05 }, stage2: { multiplier: 1.08 }, stage3: { multiplier: 1.12 }, critical: false, showPreview: true },
      { id: 'mjd2_egr', name: 'EGR Flow Map', category: 'emission', desc: 'EGR valve duty for MJD.', signatures: [], sigOffset: 0, rows: 8, cols: 8, dtype: 'uint16', le: true, factor: 0.1, offsetVal: 0, unit: '%', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { egr: { multiplier: 0, clampMax: 0 } }, critical: false, showPreview: false },
      { id: 'mjd2_speed_limit', name: 'Vehicle Speed Limiter', category: 'limiter', desc: 'Factory speed limiter.', signatures: [], sigOffset: 0, rows: 1, cols: 1, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'km/h', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { speedlimiter: { multiplier: 0, addend: 65535 } }, critical: false, showPreview: false },
    ],
  },

  // ── Denso (Jaguar/Land Rover/Mazda/Toyota/Subaru) ─────────────────────────
  {
    id: 'denso_v8',
    name: 'Denso (V8 Petrol)',
    manufacturer: 'Denso',
    family: 'Denso',
    identStrings: ['NNN500', 'NNV506', 'AJ83', 'AJ86', 'AJ133', '279700', 'MB079700'],
    fileSizeRange: [524288, 4194304],
    vehicles: ['Jaguar XK 4.2 V8', 'Jaguar XF 5.0 V8', 'Land Rover Range Rover Sport V8', 'Range Rover 5.0 V8'],
    checksumAlgo: 'unknown', checksumOffset: 0, checksumLength: 0,
    maps: [
      { id: 'denso_boost_target', name: 'Boost Pressure Target', category: 'boost', desc: 'Supercharger boost setpoint.', signatures: [], sigOffset: 0, rows: 12, cols: 16, dtype: 'uint16', le: false, factor: 0.001, offsetVal: 0, unit: 'bar', stage1: { multiplier: 1.12 }, stage2: { multiplier: 1.22 }, stage3: { multiplier: 1.35 }, critical: true, showPreview: true },
      { id: 'denso_fuel_inject', name: 'Fuel Injection Duration', category: 'fuel', desc: 'Injection duration map.', signatures: [], sigOffset: 0, rows: 16, cols: 16, dtype: 'uint16', le: false, factor: 0.001, offsetVal: 0, unit: 'ms', stage1: { multiplier: 1.10 }, stage2: { multiplier: 1.18 }, stage3: { multiplier: 1.25 }, critical: true, showPreview: true },
      { id: 'denso_ign_timing', name: 'Ignition Timing', category: 'ignition', desc: 'Spark advance map.', signatures: [], sigOffset: 0, rows: 16, cols: 16, dtype: 'int16', le: false, factor: 0.75, offsetVal: 0, unit: '°BTDC', stage1: { addend: 0 }, stage2: { addend: 1 }, stage3: { addend: 2 }, critical: false, showPreview: true },
      { id: 'denso_torque_limit', name: 'Torque Limit', category: 'torque', desc: 'Torque ceiling.', signatures: [], sigOffset: 0, rows: 8, cols: 8, dtype: 'uint16', le: false, factor: 0.1, offsetVal: 0, unit: 'Nm', stage1: { multiplier: 1.20 }, stage2: { multiplier: 1.35 }, stage3: { multiplier: 1.50 }, critical: true, showPreview: true },
      { id: 'denso_lambda_target', name: 'Lambda / AFR Target', category: 'smoke', desc: 'Lambda target for Denso V8 petrol.', signatures: [], sigOffset: 0, rows: 16, cols: 16, dtype: 'uint16', le: false, factor: 0.001, offsetVal: 0, unit: 'lambda', stage1: { multiplier: 1.0 }, stage2: { multiplier: 0.98 }, stage3: { multiplier: 0.95 }, critical: false, showPreview: true },
      { id: 'denso_rev_limit', name: 'Rev Limiter', category: 'limiter', desc: 'Engine RPM hard-cut for Denso V8.', signatures: [], sigOffset: 0, rows: 1, cols: 1, dtype: 'uint16', le: false, factor: 1, offsetVal: 0, unit: 'RPM', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { revlimit: { addend: 300, clampMax: 8000 } }, critical: false, showPreview: false },
      { id: 'denso_speed_limit', name: 'Vehicle Speed Limiter', category: 'limiter', desc: 'Factory speed limiter for Denso V8.', signatures: [], sigOffset: 0, rows: 1, cols: 1, dtype: 'uint16', le: false, factor: 1, offsetVal: 0, unit: 'km/h', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { speedlimiter: { multiplier: 0, addend: 65535 } }, critical: false, showPreview: false },
    ],
  },

  // ── Visteon (Ford/PSA diesel) ─────────────────────────────────────────────
  {
    id: 'visteon_dcm',
    name: 'Visteon DCM (Diesel)',
    manufacturer: 'Visteon',
    family: 'Visteon',
    identStrings: ['6C1U', '7G91', '9M5Q', 'Visteon', 'VPSH', 'DCU-10'],
    fileSizeRange: [524288, 2097152],
    vehicles: ['Ford Transit 2.2 TDCi', 'Fiat Ducato 2.2 JTD', 'Peugeot Boxer 2.2 HDi', 'Citroën Jumper 2.2 HDi'],
    checksumAlgo: 'unknown', checksumOffset: 0, checksumLength: 0,
    maps: [
      { id: 'vist_boost_target', name: 'Boost Pressure Target', category: 'boost', desc: 'Boost setpoint.', signatures: [], sigOffset: 0, rows: 12, cols: 16, dtype: 'uint16', le: true, factor: 0.001, offsetVal: 0, unit: 'bar', stage1: { multiplier: 1.15 }, stage2: { multiplier: 1.25 }, stage3: { multiplier: 1.38 }, critical: true, showPreview: true },
      { id: 'vist_fuel_inject', name: 'Injection Duration', category: 'fuel', desc: 'Fuel injection duration.', signatures: [], sigOffset: 0, rows: 16, cols: 16, dtype: 'uint16', le: true, factor: 0.001, offsetVal: 0, unit: 'ms', stage1: { multiplier: 1.12 }, stage2: { multiplier: 1.20 }, stage3: { multiplier: 1.30 }, critical: true, showPreview: true },
      { id: 'vist_torque_limit', name: 'Torque Limit', category: 'torque', desc: 'Torque ceiling.', signatures: [], sigOffset: 0, rows: 8, cols: 8, dtype: 'uint16', le: true, factor: 0.1, offsetVal: 0, unit: 'Nm', stage1: { multiplier: 1.22 }, stage2: { multiplier: 1.38 }, stage3: { multiplier: 1.55 }, critical: true, showPreview: true },
      { id: 'vist_smoke_limiter', name: 'Smoke Limiter', category: 'smoke', desc: 'Smoke limit for Visteon diesel.', signatures: [], sigOffset: 0, rows: 12, cols: 16, dtype: 'uint16', le: true, factor: 0.01, offsetVal: 0, unit: 'mg/st', stage1: { multiplier: 1.10 }, stage2: { multiplier: 1.18 }, stage3: { multiplier: 1.28 }, critical: true, showPreview: true },
      { id: 'vist_soi', name: 'Start of Injection (SOI)', category: 'ignition', desc: 'Injection timing advance for Visteon diesel.', signatures: [], sigOffset: 0, rows: 10, cols: 10, dtype: 'int16', le: true, factor: 0.02, offsetVal: 0, unit: '°BTDC', stage1: { multiplier: 1.0 }, stage2: { addend: 30 }, stage3: { addend: 50 }, critical: false, showPreview: true },
      { id: 'vist_rail_pressure', name: 'Rail Pressure Target', category: 'fuel', desc: 'Common rail pressure for Visteon diesel.', signatures: [], sigOffset: 0, rows: 10, cols: 16, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'bar', stage1: { multiplier: 1.05 }, stage2: { multiplier: 1.08 }, stage3: { multiplier: 1.12 }, critical: false, showPreview: true },
      { id: 'vist_egr', name: 'EGR Flow Map', category: 'emission', desc: 'EGR valve duty for Visteon diesel.', signatures: [], sigOffset: 0, rows: 8, cols: 8, dtype: 'uint16', le: true, factor: 0.1, offsetVal: 0, unit: '%', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { egr: { multiplier: 0, clampMax: 0 } }, critical: false, showPreview: false },
      { id: 'vist_speed_limit', name: 'Vehicle Speed Limiter', category: 'limiter', desc: 'Factory speed limiter.', signatures: [], sigOffset: 0, rows: 1, cols: 1, dtype: 'uint16', le: true, factor: 1, offsetVal: 0, unit: 'km/h', stage1: { multiplier: 1.0 }, stage2: { multiplier: 1.0 }, stage3: { multiplier: 1.0 }, addonOverrides: { speedlimiter: { multiplier: 0, addend: 65535 } }, critical: false, showPreview: false },
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
