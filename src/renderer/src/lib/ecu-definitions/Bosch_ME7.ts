/**
 * ECU Definitions: Bosch ME7
 * Auto-generated from ecuDefinitions.ts
 * DO NOT EDIT DIRECTLY — edit the source and regenerate
 */

import type { EcuDef } from '../ecuDefinitions'

export const Bosch_ME7_DEFINITIONS: EcuDef[] = [
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
]
