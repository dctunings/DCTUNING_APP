/**
 * ECU Definitions: Bosch EDC16
 * Auto-generated from ecuDefinitions.ts
 * DO NOT EDIT DIRECTLY — edit the source and regenerate
 */

import type { EcuDef } from '../ecuDefinitions'

export const Bosch_EDC16_DEFINITIONS: EcuDef[] = [
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
  },,
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
  },,
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
  },,
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
  },,
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
  },,
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
  },,
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
  },,
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
  },,
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
  },,
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
  },,
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
  },,
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
]
