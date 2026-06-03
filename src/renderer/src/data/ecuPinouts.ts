/**
 * ECU Bench Pinout Database — PCMTuner Module 71 (Bosch MEDC17 Bootloader)
 * Extracted from PCMTuner ECU PINOUT PDF (163 pages, all variants).
 * Source: tuner-box.com v.2 2022-05-12
 *
 * Each entry: ECU name, Tricore chip, vehicle make(s), connector types,
 * and pin assignments for +12V, GND, CAN-L, CAN-H, GPT0, GPT1.
 */

export interface EcuPinout {
  ecu: string
  tc: string
  make: string
  conn: string[]
  v12: string
  gnd: string
  canl: string
  canh: string
  gpt: string
  note?: string
}

export const ECU_PINOUTS: EcuPinout[] = [
  // ── MED17 / ME17 Petrol ECUs ──────────────────────────────────────────────
  { ecu: 'MED17.0', tc: 'TC1767', make: 'VOLVO', conn: ['T96','T58'], v12: 'T58: 5, 15', gnd: 'T58: 1', canl: 'T58: 41', canh: 'T58: 54', gpt: 'T96: 80, 45' },
  { ecu: 'MEDG17.0', tc: 'TC1797', make: 'FORD', conn: ['T95','T103'], v12: 'T103: 102, 48', gnd: 'T103: 96', canl: 'T103: 68', canh: 'T103: 69', gpt: 'T103: 8, T95: 27' },
  { ecu: 'MED17.0.1', tc: 'TC1767', make: 'FORD', conn: ['A','B'], v12: 'A: 48, 103', gnd: 'A: 97', canl: 'A: 68', canh: 'A: 69', gpt: 'B: 36, 48' },
  { ecu: 'MED17.1', tc: 'TC1796', make: 'VAG', conn: ['T60','T94'], v12: 'T94: 5, 87, 92', gnd: 'T94: 1', canl: 'T94: 67', canh: 'T94: 68', gpt: 'T60: 37, 54' },
  { ecu: 'MED17.1.1', tc: 'TC1797', make: 'VAG', conn: ['T105','T91'], v12: 'T91: 5, 50', gnd: 'T91: 1', canl: 'T91: 80', canh: 'T91: 79', gpt: 'T105: 18, 36', note: 'Audi: T105:18,36 / VW: T105:34,36' },
  { ecu: 'MED17.1.6', tc: 'TC1797', make: 'VAG', conn: ['T60','T94'], v12: 'T94: 5, 87', gnd: 'T94: 1', canl: 'T94: 67', canh: 'T94: 68', gpt: 'T60: 44, 59', note: 'Porsche: +12V T94:6,87 / GPT T60:44,36' },
  { ecu: 'MED17.1.10', tc: 'TC1793', make: 'AUDI', conn: ['T105','T91'], v12: 'T91: 5, 50', gnd: 'T91: 1', canl: 'T91: 80', canh: 'T91: 79', gpt: 'T105: 100, 58' },
  { ecu: 'MED17.1.21', tc: 'TC1793', make: 'VAG', conn: ['T60','T94'], v12: 'T94: 5, 87', gnd: 'T94: 1', canl: 'T94: 67', canh: 'T94: 68', gpt: 'T60: 51, 6', note: 'v2: GPT T60:21,51' },
  { ecu: 'MED17.1.27', tc: 'TC1793', make: 'VAG', conn: ['T60','T94'], v12: 'T94: 3, 87', gnd: 'T94: 2', canl: 'T94: 67', canh: 'T94: 68', gpt: 'T60: 42, 43' },
  { ecu: 'MED17.1.62', tc: 'TC1793', make: 'VAG', conn: ['T105','T91'], v12: 'T91: 5, 50', gnd: 'T91: 1', canl: 'T91: 30', canh: 'T91: 31', gpt: 'T105: 61, 89' },
  { ecu: 'ME17.2', tc: 'TC1797', make: 'BMW', conn: ['T96','T58'], v12: 'T58: 6, 52', gnd: 'T58: 3', canl: 'T58: 42', canh: 'T58: 55', gpt: 'T96: 14, T58: 15' },
  { ecu: 'MED17.2', tc: 'TC1796', make: 'MINI', conn: ['T1','T2','T3'], v12: 'T3: 16, 19', gnd: 'T3: 3', canl: 'T3: 52', canh: 'T3: 40', gpt: 'T1: A2, D2', note: 'v2: GPT T1:B2,A2' },
  { ecu: 'MEV17.2', tc: 'TC1796', make: 'BMW', conn: ['T96','T58'], v12: 'T58: 1, 7', gnd: 'T58: 6', canl: 'T58: 33', canh: 'T58: 46', gpt: 'T96: 22, 23' },
  { ecu: 'MEVD17.2', tc: 'TC1797', make: 'BMW', conn: ['T1-T6'], v12: 'T4: 42, 46', gnd: 'T2: 3', canl: 'T4: 45', canh: 'T4: 44', gpt: 'T6: 51, T5: 6' },
  { ecu: 'ME(V)17.2.1', tc: 'TC1796', make: 'BMW', conn: ['T86','T58'], v12: 'T58: 1, 1', gnd: 'T58: 6', canl: 'T58: 1', canh: 'T58: 14', gpt: 'T86: 29, 11' },
  { ecu: 'MEV17.2.2', tc: 'TC1767', make: 'BMW', conn: ['T1','T2','T3'], v12: 'T3: 5, 19', gnd: 'T3: 4', canl: 'T3: 52', canh: 'T3: 40', gpt: 'T1: A2, T3: 26' },
  { ecu: 'MEVD17.2.2', tc: 'TC1797', make: 'MINI', conn: ['T1','T2','T3'], v12: 'T3: 19, 29', gnd: 'T3: 3', canl: 'T3: 52', canh: 'T3: 40', gpt: 'T2: 40, T1: G2' },
  { ecu: 'MEVD17.2.3', tc: 'TC1793', make: 'BMW', conn: ['T1-T6'], v12: 'T6: 22, 1', gnd: 'T2: 4', canl: 'T6: 44', canh: 'T6: 43', gpt: 'T5: 54, T4: 49' },
  { ecu: 'ME17.2.4', tc: 'TC1793', make: 'BMW', conn: ['T96','T58'], v12: 'T58: 6, 52', gnd: 'T58: 3', canl: 'T58: 42', canh: 'T58: 55', gpt: 'T96: 34, 39' },
  { ecu: 'MEVD17.2.4', tc: 'TC1797', make: 'BMW', conn: ['T1-T6'], v12: 'T4: 1, 22', gnd: 'T6: 2', canl: 'T4: 44', canh: 'T4: 43', gpt: 'T5: 43, T6: 43' },
  { ecu: 'MEVD17.2.5', tc: 'TC1797', make: 'BMW', conn: ['T1-T6'], v12: 'T4: 22, 1', gnd: 'T4: 10', canl: 'T4: 44', canh: 'T4: 43', gpt: 'T6: 16, T5: 43' },
  { ecu: 'MEVD17.2.6', tc: 'TC1797', make: 'BMW', conn: ['T1-T6'], v12: 'T4: 42, 46', gnd: 'T4: 30', canl: 'T4: 7', canh: 'T4: 8', gpt: 'T5: 6, T6: 51' },
  { ecu: 'MEVD17.2.7', tc: 'TC1797', make: 'MINI', conn: ['T1','T2','T3'], v12: 'T3: 19, 29', gnd: 'T3: 3', canl: 'T3: 52', canh: 'T3: 40', gpt: 'T2: 40, T1: G2' },
  { ecu: 'MEVD17.2.8 / 17.2.9', tc: 'TC1797', make: 'BMW', conn: ['T1-T6'], v12: 'T4: 40, 22, 1', gnd: 'T6: 2', canl: 'T4: 13', canh: 'T4: 28', gpt: 'T6: 43, T5: 43' },
  { ecu: 'MEVD17.2.G', tc: 'TC1797', make: 'BMW', conn: ['T1-T6'], v12: 'T4: 42, 46', gnd: 'T4: 35', canl: 'T4: 45', canh: 'T4: 44', gpt: 'T6: 51, T5: 6' },
  { ecu: 'MEVD17.2.H', tc: 'TC1797', make: 'BMW', conn: ['T1-T6'], v12: 'T4: 1, 22, 40', gnd: 'T4: 27', canl: 'T4: 44', canh: 'T4: 43', gpt: 'T5: 43, T6: 43' },
  { ecu: 'ME17.3', tc: 'TC1724', make: 'FIAT / OPEL', conn: ['T1','T2'], v12: 'T1: 49, 46', gnd: 'T1: 53', canl: 'T1: 32', canh: 'T1: 44', gpt: 'T2: 36, 13', note: 'Opel: GPT T2:36,1' },
  { ecu: 'MED17.3.1', tc: 'TC1766', make: 'LANCIA', conn: ['T60','T94'], v12: 'T94: 3, 87', gnd: 'T94: 1', canl: 'T94: 67', canh: 'T94: 68', gpt: 'T60: 53, 43' },
  { ecu: 'MED17.3.5', tc: 'TC1793', make: 'FERRARI', conn: ['T105','T91'], v12: 'T91: 5, 50', gnd: 'T91: 1', canl: 'T91: 63', canh: 'T91: 62', gpt: 'T105: 74, 13' },
  { ecu: 'MED/MEV17.4', tc: 'TC1766', make: 'PSA', conn: ['T1','T2','T3'], v12: 'T3: 16, 19', gnd: 'T3: 3', canl: 'T3: 52', canh: 'T3: 40', gpt: 'T1: A2, B2' },
  { ecu: 'MED/MEV(D)17.4.2', tc: 'TC1767', make: 'PSA', conn: ['T1','T2','T3'], v12: 'T3: 5, 19', gnd: 'T3: 3', canl: 'T3: 52', canh: 'T3: 40', gpt: 'T1: A2, T3: 26' },
  { ecu: 'MED17.4.4', tc: 'TC1793', make: 'CITROEN', conn: ['T1','T2'], v12: 'T1: 52, 3', gnd: 'T1: 4', canl: 'T1: 33', canh: 'T1: 49', gpt: 'T2: 99, 30' },
  { ecu: 'ME(V)17.4.5', tc: 'TC1796', make: 'BMW', conn: ['T86','T58'], v12: 'T58: 1, 1', gnd: 'T58: 6', canl: 'T58: 1', canh: 'T58: 14', gpt: 'T86: 11, 29' },
  { ecu: 'ME17.5', tc: 'TC1766', make: 'VAG', conn: ['T60','T94'], v12: 'T94: 5, 87', gnd: 'T94: 1', canl: 'T94: 67', canh: 'T94: 68', gpt: 'T60: 6, 51' },
  { ecu: 'MED17.5.2', tc: 'TC1767', make: 'VAG', conn: ['T60','T94'], v12: 'T94: 5, 87', gnd: 'T94: 1', canl: 'T94: 67', canh: 'T94: 68', gpt: 'T60: 53, 36' },
  { ecu: 'MED17.5.5', tc: 'TC1767', make: 'VAG', conn: ['T60','T94'], v12: 'T94: 5, 87', gnd: 'T94: 1', canl: 'T94: 67', canh: 'T94: 68', gpt: 'T60: 44, 59' },
  { ecu: 'MED17.5.20', tc: 'TC1766', make: 'VAG', conn: ['T60','T94'], v12: 'T94: 5, 87', gnd: 'T94: 1', canl: 'T94: 67', canh: 'T94: 68', gpt: 'T60: 39, 54' },
  { ecu: 'ME17.5.22', tc: 'TC1724', make: 'VAG', conn: ['T60','T94'], v12: 'T94: 6, 87', gnd: 'T94: 2', canl: 'T94: 67', canh: 'T94: 68', gpt: 'T60: 7, 5' },
  { ecu: 'MED17.5.25', tc: 'TC1782', make: 'SKODA', conn: ['T60','T94'], v12: 'T94: 3, 87', gnd: 'T94: 2', canl: 'T94: 67', canh: 'T94: 68', gpt: 'T60: 21, 7' },
  { ecu: 'ME17.7', tc: 'TC1796', make: 'MB', conn: ['T96','T58'], v12: 'T58: 5, 15', gnd: 'T58: 2', canl: 'T58: 54', canh: 'T58: 41', gpt: 'T96: 81, 55' },
  { ecu: 'MED17.7.2', tc: 'TC1797', make: 'MB / INFINITI', conn: ['T96','T58'], v12: 'T58: 5, 15', gnd: 'T58: 2', canl: 'T58: 54', canh: 'T58: 41', gpt: 'T96: 81, 58' },
  { ecu: 'MED17.7.3.1', tc: 'TC1797', make: 'MB', conn: ['T96','T58'], v12: 'T58: 5, 15', gnd: 'T58: 2', canl: 'T58: 54', canh: 'T58: 41', gpt: 'T96: 83, 58' },
  { ecu: 'ME17.8.5', tc: 'TC1762', make: 'ROTAX', conn: ['T1','T2'], v12: 'T1: M4, D1', gnd: 'T1: M2', canl: 'T1: C2', canh: 'T2: C1', gpt: 'T1: F4, T2: E2' },
  { ecu: 'ME17.8.32', tc: 'TC1797', make: 'MCLAREN', conn: ['T105','T91'], v12: 'T91: 5, 50', gnd: 'T91: 1', canl: 'T91: 80', canh: 'T91: 79', gpt: 'T105: 74, 13' },
  { ecu: 'MED17.8.32', tc: 'TC1793', make: 'JLR', conn: ['T105','T91'], v12: 'T91: 5, 50', gnd: 'T91: 1', canl: 'T91: 80', canh: 'T91: 79', gpt: 'T105: 13, 74' },
  { ecu: 'MEDC17.9', tc: 'TC1793', make: 'JLR', conn: ['T105','T91'], v12: 'T91: 5, 67', gnd: 'T91: 1', canl: 'T91: 81', canh: 'T91: 82', gpt: 'T105: 81, 102' },
  { ecu: 'MED17.9.3', tc: 'TC1793', make: 'HONDA', conn: ['T96','T58'], v12: 'T58: 1, 15', gnd: 'T58: 6', canl: 'T58: 41', canh: 'T58: 54', gpt: 'T96: 35, 57' },
  { ecu: 'ME17.9.7', tc: 'TC1762', make: 'VAZ / UAZ', conn: ['T1','T2'], v12: 'T1: 56, 16', gnd: 'T1: 54', canl: 'T1: 44', canh: 'T1: 32', gpt: 'T2: 1, 31', note: 'VAZ: GPT T2:32,31' },
  { ecu: 'MED17.9.8', tc: 'TC1767', make: 'KIA / HYUNDAI', conn: ['T60','T94'], v12: 'T94: 5, 29', gnd: 'T94: 1', canl: 'T94: 63', canh: 'T94: 85', gpt: 'T94: 46, 87', note: '2 versions: v1 GPT T94:46,87 / v2 GPT T94:46,65' },
  { ecu: 'MEDG17.9.8', tc: 'TC1767', make: 'KIA / HYUNDAI', conn: ['T105','T91'], v12: 'T91: 3, 68', gnd: 'T91: 1', canl: 'T91: 77', canh: 'T91: 60', gpt: 'T105: 66, 79', note: '3 versions: v2 T105:66,47 / v3 T105:66,64' },
  { ecu: 'MEG17.9.12', tc: 'TC1762', make: 'KIA / HYUNDAI', conn: ['T60','T94'], v12: 'T94: 5, 18', gnd: 'T94: 3', canl: 'T94: 79', canh: 'T94: 57', gpt: 'T94: 17, 39', note: 'v2: GPT T94:17,15' },
  { ecu: 'ME17.9.20', tc: 'TC1782', make: 'BRABUS / RENAULT / SMART', conn: ['T2','T3'], v12: 'T3: D1, G1', gnd: 'T3: H4', canl: 'T2: A2', canh: 'T2: A1', gpt: 'T2: H2, J3', note: 'Renault: CAN-L T3:A3, CAN-H T3:A4' },
  { ecu: 'ME17.9.51', tc: 'TC1762', make: 'SUZUKI', conn: ['T1','T2'], v12: 'T1: 56, 48, 5', gnd: 'T1: 13', canl: 'T1: 2', canh: 'T1: 1', gpt: 'T2: 9, 8' },
  { ecu: 'MED17.9.63', tc: 'TC1793', make: 'SUZUKI', conn: ['T60','T94'], v12: 'T94: 5, 92', gnd: 'T94: 2', canl: 'T94: 61', canh: 'T94: 83', gpt: 'T60: 20, 50' },
  { ecu: 'ME17.9.64', tc: 'TC1724', make: 'SUZUKI', conn: ['T1','T2'], v12: 'T1: 1, 43, 56', gnd: 'T2: 50', canl: 'T2: 2', canh: 'T2: 3', gpt: 'T2: 39, 40' },
  { ecu: 'ME17.9.71', tc: 'TC1724', make: 'NIVA / UAZ', conn: ['T1','T2'], v12: 'T1: 56, 16', gnd: 'T1: 54', canl: 'T1: 44', canh: 'T1: 32', gpt: 'T2: 31, 32', note: 'Unlock: read stock, write it down. Check "unblock" box.' },

  // ── EDC17 Diesel ECUs ─────────────────────────────────────────────────────
  { ecu: 'EDC17C10', tc: 'TC1797', make: 'PSA / FORD', conn: ['T1','T2','T3'], v12: 'T3: 2, 19', gnd: 'T3: 4', canl: 'T3: 52', canh: 'T3: 40', gpt: 'T1: J1, D3', note: 'Ford: +12V T3:5,36' },
  { ecu: 'EDC17C11', tc: 'TC1766', make: 'VAG', conn: ['T60','T94'], v12: 'T94: 5, 87', gnd: 'T94: 2', canl: 'T94: 67', canh: 'T94: 68', gpt: 'T60: 42, 58' },
  { ecu: 'EDC17C18', tc: 'TC1766', make: 'OPEL', conn: ['T60','T94'], v12: 'T94: 5, 46', gnd: 'T94: 2', canl: 'T94: 65', canh: 'T94: 66', gpt: 'T60: 42, 58' },
  { ecu: 'EDC17C42', tc: 'TC1767', make: 'RENAULT / DACIA', conn: ['T2','T3'], v12: 'T2: Q4, T3: D1', gnd: 'T3: H1', canl: 'T2: A2', canh: 'T2: A1', gpt: 'T2: H2, H4', note: 'Dacia: GPT T2:M2,K3' },
  { ecu: 'EDC17C43', tc: 'TC1797', make: 'MB', conn: ['T96','T58'], v12: 'T58: 1, 15', gnd: 'T58: 4', canl: 'T58: 54', canh: 'T58: 41', gpt: 'T96: 39, 67' },
  { ecu: 'EDC17C45', tc: 'TC1767', make: 'NISSAN', conn: ['T96','T58'], v12: 'T58: 5, 56, 19', gnd: 'T58: 2', canl: 'T58: 50', canh: 'T58: 49', gpt: 'T96: 67, T58: 11' },
  { ecu: 'EDC17C46', tc: 'TC1767', make: 'VAG', conn: ['T60','T94'], v12: 'T94: 5, 87', gnd: 'T94: 2', canl: 'T94: 67', canh: 'T94: 68', gpt: 'T60: 44, 52' },
  { ecu: 'EDC17C50', tc: 'TC1797', make: 'BMW', conn: ['T96','T58'], v12: 'T58: 1, 18', gnd: 'T58: 2', canl: 'T58: 55', canh: 'T58: 56', gpt: 'T96: 89, 92' },
  { ecu: 'EDC17C53', tc: 'TC1767', make: 'VAG', conn: ['T60','T94'], v12: 'T94: 5, 87', gnd: 'T94: 2', canl: 'T94: 67', canh: 'T94: 68', gpt: 'T60: 43, 59' },
  { ecu: 'EDC17C54', tc: 'TC1797', make: 'VAG', conn: ['T60','T94'], v12: 'T94: 5, 87', gnd: 'T94: 1', canl: 'T94: 67', canh: 'T94: 68', gpt: 'T60: 43, 59' },
  { ecu: 'EDC17C56', tc: 'TC1793', make: 'VAG', conn: ['T60','T94'], v12: 'T94: 5, 87', gnd: 'T94: 1', canl: 'T94: 67', canh: 'T94: 68', gpt: 'T60: 43, 59' },
  { ecu: 'EDC17C58', tc: 'TC1793', make: 'HONDA', conn: ['T96','T58'], v12: 'T58: 3, 15', gnd: 'T58: 4', canl: 'T58: 41', canh: 'T58: 54', gpt: 'T96: 35, 39' },
  { ecu: 'EDC17C60', tc: 'TC1793', make: 'PSA', conn: ['T1','T2'], v12: 'T1: 52, 3', gnd: 'T1: 4', canl: 'T1: 33', canh: 'T1: 49', gpt: 'T1: 24, T2: 82' },
  { ecu: 'EDC17C66', tc: 'TC1793', make: 'MB', conn: ['T96','T58'], v12: 'T58: 3, 15', gnd: 'T58: 2', canl: 'T58: 54', canh: 'T58: 41', gpt: 'T96: 35, 39' },
  { ecu: 'EDC17C70', tc: 'TC1793', make: 'FORD', conn: ['A','B'], v12: 'A: 62, 102', gnd: 'A: 97', canl: 'A: 67', canh: 'A: 68', gpt: 'B: 67, 52' },
  { ecu: 'EDC17C79', tc: 'TC1797', make: 'DODGE / JEEP / IVECO', conn: ['T60','T94'], v12: 'T94: 5, 54', gnd: 'T60: 44, T94: 2', canl: 'T94: 25', canh: 'T94: 24', gpt: 'T60: 14, 59', note: 'Install 10uF cap on pin 59 GPT line. Maserati: +12V T94:3,54 / CAN-L T94:47 / CAN-H T94:46' },
  { ecu: 'EDC17C81', tc: 'TC1782', make: 'MAZ', conn: ['T60','T94'], v12: 'T94: 5, 46', gnd: 'T94: 2', canl: 'T94: 87', canh: 'T94: 66', gpt: 'T60: 14, 57' },
  { ecu: 'EDC17C84', tc: 'TC1782', make: 'NISSAN / OPEL / RENAULT', conn: ['T2','T3'], v12: 'T2: Q4, T3: D1', gnd: 'T3: H1', canl: 'T2: A2', canh: 'T2: A1', gpt: 'T2: M2, K3' },
  { ecu: 'EDC17CP02', tc: 'TC1766', make: 'BMW', conn: ['T96','T58'], v12: 'T58: 1, 7', gnd: 'T58: 2', canl: 'T58: 33', canh: 'T58: 46', gpt: 'T96: 62, 87' },
  { ecu: 'EDC17CP06', tc: 'TC1796', make: 'HONDA', conn: ['T96','T58'], v12: 'T58: 1, 15, 16', gnd: 'T58: 6', canl: 'T58: 41', canh: 'T58: 54', gpt: 'T96: 34, 78' },
  { ecu: 'EDC17CP09', tc: 'TC1796', make: 'BMW', conn: ['M1-M5'], v12: 'M2: 8, M3: 13', gnd: 'M2: 5', canl: 'M3: 19', canh: 'M3: 20', gpt: 'M4: 22, 19' },
  { ecu: 'EDC17CP10', tc: 'TC1796', make: 'MB', conn: ['T96','T58'], v12: 'T58: 1, 15', gnd: 'T58: 4', canl: 'T58: 54', canh: 'T58: 41', gpt: 'T96: 35, 39' },
  { ecu: 'EDC17CP11', tc: 'TC1796', make: 'JLR', conn: ['T96','T58'], v12: 'T58: 3, 15', gnd: 'T58: 6', canl: 'T58: 53', canh: 'T58: 40', gpt: 'T96: 41, 44' },
  { ecu: 'EDC17CP14', tc: 'TC1796', make: 'VAG / KIA / HYUNDAI', conn: ['T60','T94'], v12: 'T94: 5, 87', gnd: 'T94: 1', canl: 'T94: 67', canh: 'T94: 68', gpt: 'T60: 52, 44', note: 'v2: GPT T60:37,44' },
  { ecu: 'EDC17CP16', tc: 'TC1796', make: 'HONDA', conn: ['T96','T58'], v12: 'T58: 1, 15, 16', gnd: 'T58: 2', canl: 'T58: 41', canh: 'T58: 54', gpt: 'T96: 7, 35', note: 'v2: GPT T96:39,35' },
  { ecu: 'EDC17CP20', tc: 'TC1796', make: 'VAG', conn: ['T60','T94'], v12: 'T94: 6, 87', gnd: 'T94: 2', canl: 'T94: 67', canh: 'T94: 68', gpt: 'T60: 52, 44' },
  { ecu: 'EDC17CP22', tc: 'TC1796', make: 'VOLVO', conn: ['T96','T58'], v12: 'T58: 1, 15, 16', gnd: 'T96: 2', canl: 'T58: 41', canh: 'T58: 54', gpt: 'T96: 35, 7' },
  { ecu: 'EDC17CP27', tc: 'TC1796', make: 'JEEP', conn: ['T96','T58'], v12: 'T58: 3, 15', gnd: 'T58: 2', canl: 'T58: 54', canh: 'T58: 41', gpt: 'T96: 35, 39' },
  { ecu: 'EDC17CP37', tc: 'TC1766', make: 'TOYOTA', conn: ['T1','T2'], v12: 'T1: 4, 61, 77', gnd: 'T1: 2', canl: 'T1: 80', canh: 'T1: 81', gpt: 'T2: 98, 106' },
  { ecu: 'EDC17CP44', tc: 'TC1797', make: 'VAG', conn: ['T105','T91'], v12: 'T91: 5, 50', gnd: 'T91: 1', canl: 'T91: 80', canh: 'T91: 79', gpt: 'T105: 18, 21' },
  { ecu: 'EDC17CP48', tc: 'TC1797', make: 'VOLVO', conn: ['T96','T58'], v12: 'T58: 1, 46, 54', gnd: 'T58: 2', canl: 'T58: 53', canh: 'T58: 40', gpt: 'T96: 43, 40' },
  { ecu: 'EDC17CP54', tc: 'TC1793', make: 'AUDI', conn: ['K','A1','A2','A3','A4'], v12: 'K: 6, 50', gnd: 'K: 2', canl: 'K: 80', canh: 'K: 79', gpt: 'A4: 20, A1: 52' },
  { ecu: 'EDC17CP57', tc: 'TC1793', make: 'MB', conn: ['T96','T58'], v12: 'T58: 3, 15', gnd: 'T58: 2', canl: 'T58: 54', canh: 'T58: 41', gpt: 'T96: 35, 39', note: 'v2: +12V T58:3,15,16 / GPT T96:87,38' },
  { ecu: 'EDC17CP68', tc: 'TC1797', make: 'VOLVO', conn: ['T96','T58'], v12: 'T58: 1, 46, 54', gnd: 'T58: 4', canl: 'T58: 53', canh: 'T58: 40', gpt: 'T96: 43, 40' },
  { ecu: 'EDC17CV44', tc: 'TC1767', make: 'FAW', conn: ['T60','T94'], v12: 'T94: 1, 88', gnd: 'T94: 2', canl: 'T94: 76', canh: 'T94: 54', gpt: 'T60: 37, 39' },
  { ecu: 'EDC17CV52', tc: 'TC1797', make: 'FAW', conn: ['T60','T94'], v12: 'T94: 1, 88', gnd: 'T94: 2', canl: 'T94: 76', canh: 'T94: 54', gpt: 'T60: 37, 39' },
  { ecu: 'EDC17CV54', tc: 'TC1767', make: 'FAW', conn: ['T60','T94'], v12: 'T94: 1, 88', gnd: 'T94: 2', canl: 'T94: 76', canh: 'T94: 54', gpt: 'T60: 37, 39' },
  { ecu: 'EDC17U01', tc: 'TC1766', make: 'TOYOTA', conn: ['T1','T2'], v12: 'T1: 4, 61, 77', gnd: 'T1: 2', canl: 'T1: 80', canh: 'T1: 81', gpt: 'T2: 98, 106' },
  { ecu: 'EDC17U05', tc: 'TC1766', make: 'TOYOTA', conn: ['T1','T2'], v12: 'T1: 4, 61, 77', gnd: 'T1: 2', canl: 'T1: 80', canh: 'T1: 81', gpt: 'T2: 98, 106' },
  { ecu: 'DCU17HD01', tc: 'TC1766', make: 'HINO', conn: ['T86','T53'], v12: 'T53: 9, 52', gnd: 'T53: 3', canl: 'T53: 15', canh: 'T53: 14', gpt: 'T86: 71, 51' },
]
