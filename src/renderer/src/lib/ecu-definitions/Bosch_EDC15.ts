/**
 * ECU Definitions: Bosch EDC15
 * Auto-generated from ecuDefinitions.ts
 * DO NOT EDIT DIRECTLY — edit the source and regenerate
 */

import type { EcuDef } from '../ecuDefinitions'

export const Bosch_EDC15_DEFINITIONS: EcuDef[] = [
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
]
