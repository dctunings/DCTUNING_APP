/**
 * ECU Definitions: Siemens PPD1
 * Auto-generated from ecuDefinitions.ts
 * DO NOT EDIT DIRECTLY — edit the source and regenerate
 */

import type { EcuDef } from '../ecuDefinitions'

export const Siemens_PPD1_DEFINITIONS: EcuDef[] = [
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
]
