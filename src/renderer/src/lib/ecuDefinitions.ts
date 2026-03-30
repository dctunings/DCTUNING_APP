export type DataType = 'uint8' | 'int8' | 'uint16' | 'int16' | 'float32'
export type ChecksumAlgo = 'bosch-crc32' | 'bosch-simple' | 'continental-crc' | 'unknown'
export type MapCategory = 'boost' | 'fuel' | 'torque' | 'ignition' | 'limiter' | 'emission' | 'misc'

export interface StageParams {
  multiplier?: number   // multiply raw values by this
  addend?: number       // add to each value after multiply
  clampMax?: number     // hard ceiling after modification
  clampMin?: number
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
  // Binary location - array of candidate signatures (bytes), map starts sigOffset bytes after match end
  signatures: number[][]
  sigOffset: number
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
    identStrings: ['MED17', 'ME17', '0261S', 'MEDG17', 'MED1750'],
    fileSizeRange: [524288, 2097152],   // 512KB – 2MB
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
        critical: false, showPreview: true,
      },
      {
        id: 'med17_egr_duty',
        name: 'EGR Duty Cycle',
        category: 'emission',
        desc: 'Exhaust gas recirculation duty cycle map. Zeroed for EGR delete add-on.',
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
    identStrings: ['EDC15', 'EDC 15', '0281001', 'EDC-15'],
    fileSizeRange: [262144, 524288],   // 256KB – 512KB
    vehicles: ['Audi A4 1.9 TDI', 'VW Passat 1.9 TDI', 'VW Golf Mk4 1.9 TDI', 'Skoda Octavia 1.9 TDI', 'Seat Leon 1.9 TDI', 'Audi A3 1.9 TDI'],
    checksumAlgo: 'bosch-simple',
    checksumOffset: 0x7FFF0,
    checksumLength: 4,
    maps: [
      {
        id: 'edc15_boost_target',
        name: 'Boost Pressure Target (LADSOLL)',
        category: 'boost',
        desc: 'Desired boost pressure map (LADSOLL). RPM vs load. Primary Stage 1 map for 1.9 TDI — raises charge air pressure target.',
        signatures: [
          [0x4C,0x41,0x44,0x53,0x4F,0x4C,0x4C],          // "LADSOLL"
          [0x4C,0x44,0x52,0x58,0x4E,0x00],                // "LDRXN\0"
          [0x4C,0x41,0x44,0x45,0x44,0x52,0x55,0x43,0x4B], // "LADEDRUCK"
        ],
        sigOffset: 2,
        rows: 9, cols: 11, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.15 },
        stage2: { multiplier: 1.25 },
        stage3: { multiplier: 1.38, clampMax: 52000 },
        critical: true, showPreview: true,
        addonOverrides: {},
      },
      {
        id: 'edc15_fuel_quantity',
        name: 'Injection Quantity Map (MENZK)',
        category: 'fuel',
        desc: 'Fuel injection quantity base map (MENZK). mg/stroke vs RPM and load. Raising this increases torque across the rev range.',
        signatures: [
          [0x4D,0x45,0x4E,0x5A,0x4B,0x00],                // "MENZK\0"
          [0x4B,0x46,0x4D,0x53,0x4E,0x57,0x44,0x4B],      // "KFMSNWDK"
          [0x45,0x49,0x4E,0x53,0x50,0x52,0x5A,0x4B],      // "EINSPRZK"
        ],
        sigOffset: 2,
        rows: 9, cols: 11, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'mg/st',
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
          [0x4D,0x58,0x4D,0x4F,0x4D,0x53,0x41],           // "MXMOMSA"
          [0x54,0x51,0x4C,0x49,0x4D,0x44,0x43],           // "TQLIMDС"
        ],
        sigOffset: 2,
        rows: 1, cols: 8, dtype: 'uint16', le: true,
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
          [0x45,0x47,0x52,0x46,0x4C,0x4F,0x57],           // "EGRFLOW"
        ],
        sigOffset: 2,
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
        id: 'edc15_speed_limit',
        name: 'Vehicle Speed Limiter (VMAX)',
        category: 'limiter',
        desc: 'Factory speed limiter value (VMAX). Set to maximum to remove software speed restriction.',
        signatures: [
          [0x56,0x4D,0x41,0x58,0x00],                     // "VMAX\0"
          [0x56,0x53,0x4C,0x49,0x4D,0x49,0x54],           // "VSLIMIT"
        ],
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

  // ── Bosch EDC16 (VAG TDI 2.0, 3.0 diesel, 2004–2009) ────────────────────
  {
    id: 'edc16',
    name: 'Bosch EDC16',
    manufacturer: 'Bosch',
    family: 'EDC16',
    identStrings: ['EDC16', 'EDC 16', '0281010', '0281011', '0281012'],
    fileSizeRange: [524288, 1048576],   // 512KB – 1MB
    vehicles: ['VW Golf Mk5 2.0 TDI', 'Audi A4 2.0 TDI', 'VW Passat 2.0 TDI', 'Seat Leon 2.0 TDI', 'Skoda Octavia 2.0 TDI', 'Audi A6 3.0 TDI'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFF4,
    checksumLength: 4,
    maps: [
      {
        id: 'edc16_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'Desired charge air pressure vs RPM and load. Key Stage 1 map — safe +18% gives strong mid-range torque without hardware changes.',
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
        addonOverrides: {},
      },
      {
        id: 'edc16_fuel_quantity',
        name: 'Injection Quantity Map',
        category: 'fuel',
        desc: 'Fuel injection quantity map in mg/stroke. Primary diesel power map — raising this increases torque across all RPM.',
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
        addonOverrides: {},
      },
      {
        id: 'edc16_torque_limit',
        name: 'Torque Limitation Map',
        category: 'torque',
        desc: 'Maximum torque ceiling by RPM. Must be raised when increasing fuel/boost to prevent silent power cap.',
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
        addonOverrides: {},
      },
      {
        id: 'edc16_dpf_regen',
        name: 'DPF Regeneration Threshold',
        category: 'emission',
        desc: 'DPF soot load threshold triggering regen. Zeroed for DPF delete.',
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
    ],
  },

  // ── Bosch EDC17 (VAG/BMW diesel) ─────────────────────────────────────────
  {
    id: 'edc17',
    name: 'Bosch EDC17',
    manufacturer: 'Bosch',
    family: 'EDC17',
    identStrings: ['EDC17', 'EDC 17', '0281013', '0281014', '0281015', '0281016', '0281017', 'EDCD17'],
    fileSizeRange: [524288, 2097152],
    vehicles: ['VW Golf GTD Mk6/7', 'Audi A4 2.0 TDI', 'BMW 320d/520d', 'VW Passat TDI', 'Skoda Superb TDI', 'Seat Ibiza TDI'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0x7FFFC,
    checksumLength: 4,
    maps: [
      {
        id: 'edc17_boost_target',
        name: 'Boost Pressure Target',
        category: 'boost',
        desc: 'Desired boost pressure vs RPM and load. Main Stage 1 modification — safe +18% gives significant mid-range torque.',
        signatures: [[0x4C,0x4C,0x53,0x4F,0x4C,0x4C,0x44,0x52], [0x42,0x53,0x54,0x47,0x54,0x44,0x43]],
        sigOffset: 4,
        rows: 12, cols: 16, dtype: 'uint16', le: true,
        factor: 0.001, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.18 },
        stage2: { multiplier: 1.28 },
        stage3: { multiplier: 1.40, clampMax: 55000 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc17_fuel_quantity',
        name: 'Injection Quantity Map',
        category: 'fuel',
        desc: 'Fuel injection quantity in mg/stroke. Primary power map for diesel — raising this increases torque across all RPM.',
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
        id: 'edc17_rail_pressure',
        name: 'Rail Pressure Setpoint',
        category: 'fuel',
        desc: 'Common rail fuel pressure target. Higher pressure enables better atomisation and supports increased injection quantity.',
        signatures: [[0x52,0x41,0x49,0x4C,0x50,0x52,0x53,0x50], [0x43,0x52,0x50,0x52,0x45,0x53,0x53]],
        sigOffset: 4,
        rows: 12, cols: 16, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.08 },
        stage2: { multiplier: 1.14 },
        stage3: { multiplier: 1.20, clampMax: 2200 },
        critical: true, showPreview: true,
      },
      {
        id: 'edc17_torque_limit',
        name: 'Torque Limitation Map',
        category: 'torque',
        desc: 'Maximum torque ceiling by RPM and gear. Raise to match new fuel/boost capability — leaving this stock will silently cap power.',
        signatures: [[0x54,0x51,0x4C,0x49,0x4D,0x44,0x43], [0x54,0x4F,0x52,0x51,0x4C,0x44,0x43,0x01]],
        sigOffset: 2,
        rows: 8, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.28 },
        stage2: { multiplier: 1.45 },
        stage3: { multiplier: 1.65, clampMax: 65000 },
        critical: true, showPreview: true,
      },
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
    checksumAlgo: 'continental-crc',
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
    ],
  },

  // ── Bosch ME7 (classic VAG petrol) ───────────────────────────────────────
  {
    id: 'me7',
    name: 'Bosch ME7.1 / ME7.5',
    manufacturer: 'Bosch',
    family: 'ME7',
    identStrings: ['ME7', '0261204', '0261206', 'BOSCH', 'MEVBOGK'],
    fileSizeRange: [262144, 524288],  // 256KB – 512KB
    vehicles: ['VW Golf GTI Mk4 1.8T', 'Audi TT 1.8T 225', 'Audi A3 1.8T', 'Seat Leon 1.8T', 'VW Bora 1.8T'],
    checksumAlgo: 'bosch-simple',
    checksumOffset: 0x7FF00,
    checksumLength: 2,
    maps: [
      {
        id: 'me7_boost_map',
        name: 'Boost Pressure Map (LDRXN)',
        category: 'boost',
        desc: 'Boost target table (LDRXN). Classic ME7 uses 8x8 map. Primary Stage 1 modification for 1.8T engines.',
        signatures: [[0x4C,0x44,0x52,0x58,0x4E,0x00], [0x4C,0x44,0x52,0x53,0x4F,0x4C,0x4C]],
        sigOffset: 2,
        rows: 8, cols: 8, dtype: 'uint8', le: false,
        factor: 0.02, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.15, clampMax: 220 },
        stage2: { multiplier: 1.25, clampMax: 235 },
        stage3: { multiplier: 1.35, clampMax: 250 },
        critical: true, showPreview: true,
      },
      {
        id: 'me7_fuel_map',
        name: 'Fuel Injection Map (KFZW)',
        category: 'fuel',
        desc: 'Base injection quantity map (KFZW). Enrichment matched to boost increases for safe AFR.',
        signatures: [[0x4B,0x46,0x5A,0x57,0x00], [0x4B,0x46,0x5A,0x57,0x32]],
        sigOffset: 2,
        rows: 16, cols: 16, dtype: 'int8', le: false,
        factor: 0.75, offsetVal: -48, unit: '°',
        stage1: { multiplier: 1.10 },
        stage2: { multiplier: 1.18 },
        stage3: { multiplier: 1.28, clampMax: 127 },
        critical: true, showPreview: true,
      },
      {
        id: 'me7_torque',
        name: 'Torque Limit (MXMOMI)',
        category: 'torque',
        desc: 'Maximum torque table (MXMOMI). Raise to prevent software torque cap from limiting power gains.',
        signatures: [[0x4D,0x58,0x4D,0x4F,0x4D,0x49,0x00], [0x4D,0x58,0x54,0x51,0x4C,0x49,0x4D]],
        sigOffset: 2,
        rows: 1, cols: 8, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.20 },
        stage2: { multiplier: 1.35 },
        stage3: { multiplier: 1.50, clampMax: 65000 },
        critical: true, showPreview: true,
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
    desc: 'Crackle and pops on overrun / lift-off. Delays ignition cut on deceleration to push unburnt fuel into hot exhaust.',
    mapTargets: [],
    warning: 'Not recommended for catalytic converter longevity.',
  },
  {
    id: 'dpf',
    name: 'DPF Off',
    desc: 'Software DPF removal. Zeroes regeneration thresholds and disables forced regen cycles. Requires physical DPF removal.',
    mapTargets: ['edc17_dpf_regen'],
    compatEcus: ['edc17'],
    warning: 'Illegal on public roads in most jurisdictions. Off-road / track use only.',
  },
  {
    id: 'egr',
    name: 'EGR Delete',
    desc: 'EGR flow zeroed in software. Reduces intake carbon buildup, lowers intake temps, improves throttle response.',
    mapTargets: ['med17_egr_duty', 'edc17_egr_map'],
    warning: 'May trigger emissions fault codes without a physical EGR blank.',
  },
  {
    id: 'launchcontrol',
    name: 'Launch Control',
    desc: 'Set-RPM flat-foot launches. Holds RPM at target launch RPM while building boost before release.',
    mapTargets: [],
    warning: 'Increases drivetrain stress. Not recommended for stock clutch on Stage 2+.',
  },
  {
    id: 'speedlimiter',
    name: 'Speed Limiter Off',
    desc: 'Factory speed limiter removed. Maximum speed cap set to maximum allowable value.',
    mapTargets: ['med17_speed_limit'],
    warning: 'For track days and private roads only.',
  },
]
