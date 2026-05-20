/**
 * ECU Definitions: Bosch/ZF DSG/TCU
 * Auto-generated from ecuDefinitions.ts
 * DO NOT EDIT DIRECTLY — edit the source and regenerate
 */

import type { EcuDef } from '../ecuDefinitions'

export const Bosch/ZF_DSG_TCU_DEFINITIONS: EcuDef[] = [
  {
    id: 'vag_dsg',
    name: 'VAG DSG / ZF 8HP TCU',
    manufacturer: 'Bosch/ZF',
    family: 'DSG/TCU',
    // Short strings (8HP, DSG, 0AM, 0GC, 0BH) removed — 3 chars, match randomly in any 2MB binary.
    identStrings: ['DQ250', 'DQ380', 'DQ381', 'DQ500', 'ZF8HP', 'ZF6HP', 'S-TRONIC', 'DQ200', 'DQ500MQ'],
    fileSizeRange: [524288, 2097152],
    vehicles: ['VW Golf R / GTI DSG (DQ250/DQ381)', 'Audi S3/RS3 S-Tronic (DQ381/DQ500)', 'VW Passat 4Motion (DQ500)', 'Audi A4/A5/A6 S-Tronic', 'Audi Q7/Q8 ZF 8HP'],
    checksumAlgo: 'bosch-crc32',
    checksumOffset: 0xFFFF8,
    checksumLength: 4,
    maps: [
      {
        id: 'dsg_shift_pressure',
        name: 'Shift Pressure Map',
        category: 'torque',
        desc: 'Hydraulic shift pressure map. Raising this firms up gear changes and reduces clutch slip under high torque — essential for Stage 2+ engine tunes.',
        signatures: [[0x53,0x48,0x49,0x46,0x54,0x50,0x52,0x53], [0x4B,0x4C,0x44,0x52,0x55,0x43,0x4B]],
        sigOffset: 2,
        rows: 8, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'bar',
        stage1: { multiplier: 1.10 },
        stage2: { multiplier: 1.20 },
        stage3: { multiplier: 1.30, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'dsg_torque_limit',
        name: 'Gearbox Torque Limit',
        category: 'torque',
        desc: 'Gearbox input torque protection limit. Must be raised to match engine tune — otherwise gearbox ECU will restrict engine torque delivery.',
        signatures: [[0x54,0x51,0x47,0x42,0x4C,0x49,0x4D], [0x4D,0x58,0x54,0x51,0x47,0x42]],
        sigOffset: 2,
        rows: 1, cols: 8, dtype: 'uint16', le: true,
        factor: 0.1, offsetVal: 0, unit: 'Nm',
        stage1: { multiplier: 1.20 },
        stage2: { multiplier: 1.35 },
        stage3: { multiplier: 1.52, clampMax: 65000 },
        critical: true, showPreview: true,
      },
      {
        id: 'dsg_launch_rpm',
        name: 'Launch Control RPM',
        category: 'misc',
        desc: 'DSG launch control RPM hold point. Raising this builds more boost before clutch release — faster 0–60 times.',
        signatures: [[0x4C,0x41,0x55,0x4E,0x43,0x48,0x52,0x50,0x4D], [0x4C,0x41,0x55,0x4E,0x43,0x48]],
        sigOffset: 2,
        rows: 1, cols: 1, dtype: 'uint16', le: true,
        factor: 1, offsetVal: 0, unit: 'RPM',
        stage1: { addend: 200 },
        stage2: { addend: 400 },
        stage3: { addend: 600, clampMax: 4500 },
        critical: false, showPreview: false,
      },
    ],
  },
]
