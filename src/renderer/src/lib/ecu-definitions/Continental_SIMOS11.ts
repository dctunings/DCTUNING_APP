/**
 * ECU Definitions: Continental SIMOS11
 * Auto-generated from ecuDefinitions.ts
 * DO NOT EDIT DIRECTLY — edit the source and regenerate
 */

import type { EcuDef } from '../ecuDefinitions'

export const Continental_SIMOS11_DEFINITIONS: EcuDef[] = [
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
]
