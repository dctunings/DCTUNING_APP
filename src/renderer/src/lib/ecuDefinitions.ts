export type DataType = 'uint8' | 'int8' | 'uint16' | 'int16' | 'float32'
export type ChecksumAlgo = 'bosch-crc32' | 'bosch-me7' | 'bosch-simple' | 'continental-crc' | 'ppd1-crc32' | 'none' | 'unknown'
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

  {
    id: 'edc16',
    name: 'Bosch EDC16',
    manufacturer: 'Bosch',
    family: 'EDC16',
    // EDC16 uses MPC561/MPC562 PowerPC — DAMOS symbol names embedded as ASCII in most variants.
    // Part numbers: 0281014xxx (transitional), 0281015xxx (main EDC16), 0281016xxx (late/EDC16+).
    // 1,037 real-world DRT files analysed — top DAMOS names confirmed at 70–91% occurrence.
    // "BOSCHFCMCLCFCMDIAP" + "FCMCLCFCMDIAP" are the Bosch diagnostic/calibration
    // header marker embedded in EDC16 PowerPC binaries — appears in virtually ALL
    // VW/Audi/Seat/Skoda 1.9/2.0 TDI PD EDC16 dumps, even when the literal text
    // "EDC16" is not present in flash (e.g. sw 389289 Golf test binary).
    // "03G906021QJ" is the EDC16U34 PD Golf part number (sw 389289 — primary test binary).
    identStrings: ['EDC16', 'EDC 16', '0281014', '0281015', '0281016', 'EDC16C', 'EDC16U', 'EDC16CP', 'EDC16C3', 'EDC16C8', 'EDC16C34', 'EDC16U31', 'EDC16U34', 'BOSCHFCMCLCFCMDIAP', 'FCMCLCFCMDIAP', '03G906021QJ'],
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

  {
    id: 'edc17',
    name: 'Bosch EDC17',
    manufacturer: 'Bosch',
    family: 'EDC17',
    // EDC17 uses Infineon Tricore TC1796/TC1797 — NO embedded ASCII symbol names.
    // Part numbers: 0281017xxx+ uniquely identify EDC17 (0281030xxx+ = later variants).
    identStrings: ['EDC17', 'EDC 17', '0281017', '0281018', '0281019', '0281020', '0281030', 'EDC17C', 'EDC17CP', 'EDC17U', 'EDC17C41', 'EDC17C46', 'EDC17C54', 'EDC17CP14', 'EDC17CP20', 'P643X5L8', 'C643X5L8', 'P643A', 'P643B', 'P643C', 'C643A', 'C643B', 'C643C'],
    fileSizeRange: [524288, 4194304],   // 512KB – 4MB (TC1796=2MB, TC1797=4MB)
    vehicles: ['VW Golf GTD Mk6/7', 'Audi A4 2.0 TDI', 'VW Passat TDI', 'Skoda Superb TDI', 'Seat Ibiza TDI'],
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

  {
    id: 'edc16_pd_touran_19tdi_03g906021ab_05aa99',
    name: 'Bosch EDC16 PD (VW Touran 1.9 TDI PD 77kW — 03G906021AB 0x05AA99 triple-mirror)',
    manufacturer: 'Bosch',
    family: 'EDC16',
    // SW-only identStrings. Dropped '03G906021AB' / '03G906021RN' because they
    // appear as predecessor-reference strings in many unrelated VW 1.9 TDI PD
    // binaries (e.g. Golf sw 389289 contains 03G906021AB literal text in its
    // Bosch metadata even though it's a different ECU). The 389840/391834 SW
    // numbers are unique to this specific Touran AB/RN variant.
    identStrings: ['389840', '391834'],
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
    // v3.11.13 CHECKSUM STATUS: verified via probe of 5G0906259B.bin (DAMOS-2021-2022 sample) that
    //   the on-disk ORI file has AES-encrypted ASW blocks (first 256 bytes high-entropy noise, CBOOT
    //   at 0x080000 high-entropy, ASW1 at 0x100000 mixed) — only CAL zone (~0x200000+) is plaintext.
    //   We cannot recompute the ASW CRC/RSA from the encrypted-on-disk form. The correct architecture:
    //     1. DCTuning edits CAL zone bytes in the ORI file (plaintext region)
    //     2. Export modified file
    //     3. Flash via VW_Flash (open source MIT, bri3d/VW_Flash) — handles CBOOT exploit + cal CRC
    //   A future version could add cal-zone-only CRC32 (poly 0x04C11DB7 per existing comment above)
    //   once we have a SIMOS18 ORI+Stage1 pair to verify the algorithm/range against stored csum.
    // Intentional: checksumAlgo: 'none' → file passed through unchanged (safe for VW_Flash workflow).
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

  {
    id: 'vag_dsg',
    name: 'VAG DSG / ZF 8HP TCU',
    manufacturer: 'Bosch/ZF',
    family: 'DSG/TCU',
    // Short strings (8HP, DSG, 0AM, 0GC, 0BH) removed — 3 chars, match randomly in any 2MB binary.
    identStrings: ['DQ250', 'DQ380', 'DQ381', 'DQ500', 'ZF8HP', 'ZF6HP', 'S-TRONIC', 'DQ200', 'DQ500MQ'],
    fileSizeRange: [524288, 2097152],
    vehicles: ['VW Golf R / GTI DSG (DQ250/DQ381)', 'Audi S3/RS3 S-Tronic (DQ381/DQ500)', 'VW Passat 4Motion (DQ500)', 'Audi A4/A5/A6 S-Tronic', 'Audi Q7/Q8 ZF 8HP'],
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
    // PPD1 header checksum — verified v3.11.13 via ORI/Stage1 diff across 4 pairs:
    //   CRC32 forward (poly 0x04C11DB7, init=0, xorOut=0) over the 5 flash blocks
    //   listed in the descriptor table at 0x0402C8. Stored big-endian at 0x0402C4.
    //   Block table layout: [csum:u32 BE][count:u32 BE][start:u32 BE, end:u32 BE]×count
    //   Flash base = 0x00800000 (file offset = addr - 0x00800000).
    //   Test vector (03G906018DH SN100L8 BC52.ori): stored=0x0C1D2D63 ✓
    checksumAlgo: 'ppd1-crc32',
    checksumOffset: 0x0402C4,
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
        // Bosch encoding: phys = (raw - 32768) / 32. Converted to forward form
        // (phys = raw * factor + offsetVal) for the decode engine:
        //   factor = 1/32 = 0.03125
        //   offsetVal = -32768 * 0.03125 = -1024 (in Nm, phys-space)
        // Verify: raw 38888 → 38888*0.03125 + (-1024) = 1215.25 - 1024 = 191.25 Nm ✓
        factor: 0.03125, offsetVal: -1024, unit: 'Nm',
        // Stage multipliers apply to RAW values (before factor/offset), so they stay
        // the same under either convention. clampMax 65000 is raw-space (~1007 Nm).
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
        // Bosch (raw-32768)/32 Nm. Forward form: factor 1/32, offsetVal -32768*1/32 = -1024.
        factor: 0.03125, offsetVal: -1024, unit: 'Nm',
        stage1: { multiplier: 1.0, addend: 0, clampMax: 55415 },   // pin to ~707 Nm (raw-space)
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
        // Bosch (raw-32768)/32 Nm. Forward form: factor 1/32, offsetVal -32768*1/32 = -1024.
        factor: 0.03125, offsetVal: -1024, unit: 'Nm',
        stage1: { multiplier: 1.0 },    // untouched by Stage 1
        stage2: { multiplier: 1.0, addend: 0, clampMax: 50000 },   // ~540 Nm ceiling (raw-space)
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
        // Bosch (raw-32768)*(3/128) °BTDC. Forward form: factor = 3/128 = 0.0234375 (exact),
        // offsetVal = -32768 * 3/128 = -768 (°BTDC, phys-space).
        // Old values factor=0.0234 (approximate) + offsetVal=-32768 (raw-space) were both wrong.
        // Verify: raw 32768 → 32768*0.0234375 + (-768) = 768 - 768 = 0° (stock TDC) ✓
        factor: 0.0234375, offsetVal: -768, unit: '°BTDC',
        stage1: { multiplier: 1.0 },
        stage2: { addend: 85, clampMax: 65535 },   // ~+2° (85 * 3/128 ≈ 2°) — addend is raw-space
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
    // v3.11.13 CHECKSUM STATUS: MG1CS011 is RSA-signed (same security class as SIMOS18).
    // Verified via probe of two MG1 pairs (ORI + tuned):
    //   1. A3 MG1CS011 8MB OBD dump — first 4K is 99.1% non-fill bytes = AES-encrypted.
    //      MG1CS plaintext string only appears at 0x3A7DD4 (deep in file, cal zone).
    //   2. RS5 MG1CS002 2MB bench dump — first 4K is 100% 0xFF = partial cal-only slice
    //      (ECU-memory snippet, not full flash).
    // Neither form exposes a block descriptor table with computable CRCs. No isolated
    // small byte cluster exists in the ORI→Stage1 diff that looks like a stored checksum.
    // Meaning: MG1 tuning requires external flasher (MG-Flasher, KESS v2, Autotuner) —
    //   • OBD: exploit-based flash, flasher recomputes all checksums/signatures
    //   • Bench: boot-mode flash, checksum bypass handled by the bench tool's bootloader
    // Like SIMOS18, DCTuning's role is: edit cal bytes → export → flash via external tool.
    // Setting 'none' prevents writing a wrong checksum that would brick the ECU.
    // A future version could implement cal-zone CRC for bench-dump workflow once we have
    // a confirmed ORI+Stage1 bench pair with a visible stored-csum field to validate against.
    checksumAlgo: 'none',
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
    vehicles: ['Audi A4/A5 3.0 TDI 211/245ps (B8/B9 2009+)', 'Audi A6/A7 3.0 TDI 204/245/272ps (C7/C8 2011+)', 'Audi A8 3.0 TDI 204/250ps (D4 2010+)', 'Audi Q5 3.0 TDI 211/245ps (8R/FY 2009+)', 'Audi Q7 3.0 TDI 204/245/272ps (4L/4M 2006+)', 'VW Touareg 3.0 TDI 204/245/262ps (7P/CR 2010+)'],
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
  }
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
