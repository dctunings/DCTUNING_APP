/**
 * ECU Definitions: Bosch MG1
 * Auto-generated from ecuDefinitions.ts
 * DO NOT EDIT DIRECTLY — edit the source and regenerate
 */

import type { EcuDef } from '../ecuDefinitions'

export const Bosch_MG1_DEFINITIONS: EcuDef[] = [
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
]
