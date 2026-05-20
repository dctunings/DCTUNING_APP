/**
 * ECU Definitions: Bosch MED91
 * Auto-generated from ecuDefinitions.ts
 * DO NOT EDIT DIRECTLY — edit the source and regenerate
 */

import type { EcuDef } from '../ecuDefinitions'

export const Bosch_MED91_DEFINITIONS: EcuDef[] = [
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
]
