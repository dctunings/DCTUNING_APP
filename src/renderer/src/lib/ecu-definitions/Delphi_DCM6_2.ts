/**
 * ECU Definitions: Delphi DCM6.2
 * Auto-generated from ecuDefinitions.ts
 * DO NOT EDIT DIRECTLY — edit the source and regenerate
 */

import type { EcuDef } from '../ecuDefinitions'

export const Delphi_DCM6_2_DEFINITIONS: EcuDef[] = [
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
]
