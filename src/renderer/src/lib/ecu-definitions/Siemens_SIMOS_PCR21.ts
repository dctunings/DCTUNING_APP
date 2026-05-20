/**
 * ECU Definitions: Siemens SIMOS_PCR21
 * Auto-generated from ecuDefinitions.ts
 * DO NOT EDIT DIRECTLY — edit the source and regenerate
 */

import type { EcuDef } from '../ecuDefinitions'

export const Siemens_SIMOS_PCR21_DEFINITIONS: EcuDef[] = [
  {
    id: 'pcr21_touran_16tdi_sm2f0l_18ce5a',
    name: 'Siemens SIMOS PCR21 (VW Touran 1.6 TDI CR 77kW — SM2F0L9500000 0x18CE5A)',
    manufacturer: 'Siemens',
    family: 'SIMOS_PCR21',
    identStrings: ['SM2F0L9500000', '03L906023PJ', '03L906023ND', 'CAYC'],
    fileSizeRange: [2097152, 2097152],
    vehicles: ['VW Touran 1.6 TDI CR 77kW (03L906023ND/PJ CAYC engine, 2010-2012)'],
    // Checksum: PCR21 uses a complex Siemens scheme not reverse-engineered in this codebase.
    // Passing through unchanged is safer than writing garbage. Flash via VW_Flash / boot-mode
    // tool that handles PCR21 checksum repair externally (same pattern used for SIMOS18).
    checksumAlgo: 'none',
    checksumOffset: 0,
    checksumLength: 0,
    maps: [
      {
        id: 'pcr21_touran_18ce5a_iq_unlock_a',
        name: 'IQ Unlock A 14B (Touran SM2F0L9500000)',
        category: 'fuel',
        desc: 'IQ unlock A at 0x18CE5A (7 cells u16 BE = 14 B). 2 pairs across 2 part suffixes EXACT anchor: stock 382 → tuner consensus 45218 (+11737% — massive IQ release).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x18CE5A,
        rows: 1, cols: 7, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 42000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 45000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 48000 },
        critical: true, showPreview: true,
      },
      {
        id: 'pcr21_touran_18d27a_iq_unlock_b',
        name: 'IQ Unlock B 14B (Touran SM2F0L9500000)',
        category: 'fuel',
        desc: 'IQ unlock B at 0x18D27A (7 cells u16 BE = 14 B). Stock 2651 → 47487 (+1691%).',
        signatures: [],
        sigOffset: 0,
        fixedOffset: 0x18D27A,
        rows: 1, cols: 7, dtype: 'uint16', le: false,
        factor: 1, offsetVal: 0, unit: 'raw',
        skipCalSearch: true,
        stage1: { multiplier: 1.0, addend: 0, clampMin: 45000 },
        stage2: { multiplier: 1.0, addend: 0, clampMin: 48000 },
        stage3: { multiplier: 1.0, addend: 0, clampMin: 50000 },
        critical: true, showPreview: true,
      },
    ],
  },
]
