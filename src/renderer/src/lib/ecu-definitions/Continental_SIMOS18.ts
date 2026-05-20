/**
 * ECU Definitions: Continental SIMOS18
 * Auto-generated from ecuDefinitions.ts
 * DO NOT EDIT DIRECTLY — edit the source and regenerate
 */

import type { EcuDef } from '../ecuDefinitions'

export const Continental_SIMOS18_DEFINITIONS: EcuDef[] = [
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
]
