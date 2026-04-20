# WinOLS Plugin → ECU Family / Checksum Reference

Generated from static string extraction over the 62 OLSxxx plugin DLLs in
`docs/winols/extracted/dlls/`. This is the source-of-truth for which OLS plugin
covers which ECU family, and which checksum algorithm(s) each one references.

Conventions:

- **OLS plugin id** — WinOLS's internal checksum-plugin number
  (also the filename stem, e.g. `OLS220` → `OLS220_Bosch_TDI.dll`).
- **Sub** — sub-variant id declared by the plugin (e.g. `OLS220-1b`, `-2`, …),
  when present.
- **ECU family label** — exactly as the plugin self-reports it (verbatim from the DLL).
- **Checksum hint** — inferred from format strings embedded in the DLL
  (e.g. `XOR1: %X, XOR: %X, AddVal: %X` ⇒ word XOR + additive).
  Absent ⇒ plugin leaks only generic `Checksumme OLS<nnn>` markers, the algorithm
  itself lives in the packed code section (Obsidium-wrapped).

Every plugin DLL is wrapped with **Obsidium**, so the actual code is encrypted.
What we extracted here is the *pre-packer* data segment: format-string literals,
German/English user-facing messages, and the plugin self-id table.

## Agriculture / Truck (mixed)

| Plugin | File | Sub-variants → ECU family label | Checksum hint |
|--------|------|---------------------------------|----------------|
| OLS289 | `OLS289_CASE.dll` | OLS289: SISU EEM2<br>OLS289: Siemens CLAAS/Mercury Line1= %05X, Line2= %05X, suchStart=%05X<br>OLS289: Motorola CM570-3<br>OLS289: Motorola CM850-1<br>OLS289: Motorola CM850-2<br>OLS289: Motorola CM850-3<br>OLS289: Motorola CM850-4<br>OLS289: Motorola CM876<br>OLS289: Deutz-gemeinsam<br>OLS289: Deutz-4<br>OLS289: Deutz-4b<br>OLS289: VDO-FMGR<br>OLS289: VDO-ECS<br>OLS289: Liebherr<br>OLS289: Caterpillar ADEM3<br>OLS289: Caterpillar ADEM4/5<br>OLS289: Caterpillar PCMFP<br>OLS289: Charger | CRC32 opt (generic WinOLS CRC32 detector) |

## Bosch

| Plugin | File | Sub-variants → ECU family label | Checksum hint |
|--------|------|---------------------------------|----------------|
| OLS220 | `OLS220_Bosch_TDI.dll` | OLS220: Bosch TDI V3.1<br>OLS220: Bosch TDI V3.1 Volvo<br>OLS220-1b: Bosch TDI V2.0<br>OLS220-2: Bosch TDI CR1.0 / P1.0<br>OLS220-3: Bosch TDI V4.1 / 2002 Version<br>OLS220-3: Bosch TDI V4.1 / 2002 Version-2002 Version<br>OLS220-6: falsche ID => OLS261<br>OLS220-4: Bosch TDI CR2<br>OLS220-5: Bosch CR2 BMW / Audi-V8 / Nissan<br>OLS220-6: Bosch CR2 Volvo, XOR1: %X, XOR: %X, AddVal: %X<br>OLS220-6: Bosch CR2 Volvo, Bootloader, XOR1:%X, XOR:%X, AddVal:%X | CRC32 opt (generic WinOLS CRC32 detector)<br>XOR1+XOR+AddVal (16-bit word XOR + additive) |
| OLS223 | `OLS223_Bosch_ME7_BMW.dll` | OLS223: Bosch ME7 BMW, Offset %X, FullFile %d | — |
| OLS224 | `OLS224_Bosch_CR10.dll` | OLS224: Bosch CR1.0 | — |
| OLS225 | `OLS225_Bosch_ME7_Volvo.dll` | *(plugin ID not found in plain text — self-identifies via `Die Checksumme OLSxxx` only)* | — |
| OLS226 | `OLS226_Bosch_ME20.dll` | *(plugin ID not found in plain text — self-identifies via `Die Checksumme OLSxxx` only)* | — |
| OLS228 | `OLS228_Bosch_CR2_BMW.dll` | OLS228: Id gefunden auf %X | — |
| OLS231 | `OLS231_Bosch_M5x.dll` | OLS231: Bosch M5.2<br>OLS231: Bosch M2.x/M5.x Porsche (Helper) | CRC32 opt (generic WinOLS CRC32 detector) |
| OLS232 | `OLS232G_Bosch_ME7.dll` | OLS232: 1. Bedingung erf | — |
| OLS233 | `OLS233_Bosch_V41.dll` | OLS233: abgewiesen | — |
| OLS234 | `OLS234_Bosch_V31_Volvo.dll` | OLS234: Bosch V3.1 Volvo | — |
| OLS235 | `OLS235_Bosch_CR2.dll` | OLS235: falsche ID => OLS261 | — |
| OLS236 | `OLS236_Bosch_M521.dll` | OLS236: Bosch M5.2.1 | — |
| OLS241 | `OLS241_Bosch_ME27_28.dll` | OLS241: Bosch ME2.7/ME2.8 | — |
| OLS243 | `OLS243_Bosch_Smart.dll` | *(plugin ID not found in plain text — self-identifies via `Die Checksumme OLSxxx` only)* | — |
| OLS250 | `OLS250_Bosch_ME7_Peugeot.dll` | OLS250: Bosch ME7 Renault/Peugeot/Citroen, Offset %X, CRCneu %d<br>OLS250: Bosch MP7.2/MP7.3 Renault/Peugeot/Citroen<br>OLS250: Bosch MED7 Alfa<br>OLS250: Bosch ME7 Maserati, Offset %X<br>OLS250: Bosch ME7 Ferrari<br>OLS250: Bosch ME7.4.5, Offset:%X<br>OLS250: Bosch ME7.4.5<br>OLS250: Bosch M7.9.x, Ident: %d, L<br>OLS250: Bosch MP3.2 Renault/Peugeot/Citroen | — |
| OLS254 | `OLS254_Bosch_CR2_Volvo.dll` | OLS254: Bosch CR2 Volvo | — |
| OLS255 | `OLS255_Bosch_MS6x.dll` | OLS255: Bosch MAN Bus<br>OLS255: Bosch MAN/Scania-Scania<br>OLS255: Bosch MAN/Scania-MAN<br>OLS255: Bosch MAN/Scania-Neoplan<br>OLS255: Bosch MAN/Scania-John Deere | — |
| OLS260 | `OLS260_Bosch_ME7_Fiat.dll` | OLS260: Bosch ME7 Fiat<br>OLS260: Bosch ME7.9.10 Fiat | Running byte/word sum with base (Opel/ME7-Fiat style) |
| OLS262 | `OLS262_Bosch_ME7_2002.dll` | *(plugin ID not found in plain text — self-identifies via `Die Checksumme OLSxxx` only)* | — |
| OLS264 | `OLS264_Bosch_V41_2002.dll` | OLS264: Bosch TDI V4.1-2002 | — |
| OLS266 | `OLS266_Bosch_ME9_BMW.dll` | OLS266: Bosch ME9-1 BMW<br>OLS266: Bosch ME9-2 BMW | — |
| OLS270 | `OLS270_Bosch_DME_DDE.dll` | OLS270: Bosch DDE-VW<br>OLS270: Bosch DDE-MAN<br>OLS270: Bosch DDE-BMW | — |
| OLS286 | `OLS286_Bosch_ME9_Volvo.dll` | OLS286: Bosch ME9 Ford/Volvo | CRC32<br>RSA signature (Bosch ME9/EDC17) |
| OLS288 | `OLS288_Bosch_MED9_VAG.dll` | OLS288: Bosch MED9 VAG | CRC32 opt (generic WinOLS CRC32 detector)<br>EEPROM checksum block |
| OLS290 | `OLS290_Bosch_EDC7.dll` | OLS290: Bosch EDC7C1/3<br>OLS290: Bosch EDC7C1/3 FB-1<br>OLS290: Bosch EDC7C1/3 FB-2<br>OLS290: Bosch EDC7C1/3 FB-3<br>OLS290: Bosch EDC7C1/3 FB-4<br>OLS290: Bosch EDC7U-1, Offset = %X<br>OLS290: Bosch EDC7U-2, Offset = %X<br>OLS290: Bosch EDC7U-3, Offset = %X<br>OLS290: Bosch EDC7-EEprom - EEprom<br>OLS290: Bosch EDC7+, Offset %X<br>OLS290: Bosch EDC7-DAF | Compatibility-test checksum (Bosch MED17)<br>EDC7U additional checksum<br>EEPROM checksum block |
| OLS291 | `OLS291_Bosch_ME9_MB.dll` | OLS291: Bosch ME9 MB | — |
| OLS807 | `OLS807_Bosch_MED17.dll` | OLS807: MED17/EDC17 erkannt<br>OLS807: Warning: One checksum was calculated, but not written! (bSet=%li, checkMode=%li, %lX)<br>OLS807: Warnung: Eine Checksumme konnte nicht vollst<br>OLS807: Warning: One checksum couldn't be calculated completely! | CRC32<br>CRC32 base / total / comp blocks (Bosch MED17 style)<br>Compatibility-test checksum (Bosch MED17)<br>EEPROM checksum block<br>RSA signature (Bosch ME9/EDC17) |

## Delphi

| Plugin | File | Sub-variants → ECU family label | Checksum hint |
|--------|------|---------------------------------|----------------|
| OLS267 | `OLS267_Delphi_DCI.dll` | OLS267: Delphi DCI, Teil 1, Offset %X<br>OLS267: Delphi DCI, Teil 2, Offset %X<br>OLS267: Delco USA-1<br>OLS267: Delco USA-2<br>OLS267: Delphi HDI-3<br>OLS267: Delco Isuzu-1<br>OLS267: Delco Isuzu-2<br>OLS267: Delco Isuzu-3, Ende: %X<br>OLS267: Delco Daewoo<br>OLS267: Delco MPC | — |
| OLS284 | `OLS284_Delphi_Ford.dll` | OLS284: Delphi Ford<br>OLS284: Delphi Ford 2 Eprom<br>OLS284: Delphi Ford 2 Eprom+Proc in one element<br>OLS284: Delphi Korea | — |
| OLS809 | `OLS809_Delphi_DCM3.dll` | OLS809: Delphi DCM3.2, Sorte:%d<br>OLS809: Delphi DCM3.2, Prozessor:1, Eprom:%d<br>OLS809: Delphi DCM3.4, Offset:%X<br>OLS809: Delphi DCM3.4- SH7059-V1, Offset:%X<br>OLS809: Delphi DCM3.4- SH7059-V1b, Offset:%X<br>OLS809: Delphi DCM3.4- SH7059-V2, Offset:%X<br>OLS809: Delphi CRD2 MB, nur Prozessor<br>OLS809: Delphi DCM3.5 PSA, nur Prozessor-V1<br>OLS809: Delphi DCM3.7, nur Prozessor, Offset %X, bAdr[0]: %X, bAdr[1]: %X<br>OLS809: Delphi DCM3.7- SH7059-V4, Offset:%X<br>OLS809: Delphi CRD3 MB, Zwei Bereiche %X<br>OLS809: Delphi DCM3.3 | Add8-in-16 + CRC16<br>CRC16 Motorola block<br>CRC16-only block<br>CRC32<br>CRC32 Intel block<br>CRC32 opt (generic WinOLS CRC32 detector) |
| OLS810 | `OLS810_Delphi_Truck.dll` | OLS810: Delphi Truck, ID auf %X, CMD-Datei: %d<br>OLS810: Delphi Truck-2<br>OLS810: Delphi Truck-3<br>OLS810: Delphi Truck-4<br>OLS810: Metatron MF3 | — |

## Denso

| Plugin | File | Sub-variants → ECU family label | Checksum hint |
|--------|------|---------------------------------|----------------|
| OLS293 | `OLS293_Denso.dll` | OLS293: Denso-Suzuki<br>OLS293: Denso-Renault, Opel, Saab<br>OLS293: Denso-Mazda 6 kurz<br>OLS293: Denso-Mazda MX5 BP5,B6MM<br>OLS293: Denso-Mazda MX5 BP4W<br>OLS293: Denso-Mazda MX5 BP6,7<br>OLS293: Denso-Mazda MX5 BP8<br>OLS293: Denso-Nissan<br>OLS293: Denso-Mazda 6 lang<br>OLS293: Denso-Isuzu<br>OLS293: Denso-Isuzu2<br>OLS293: Denso Toyota-Toyota-1, Base %X: %s, CSAdr: %X | CRC32 opt (generic WinOLS CRC32 detector) |

## EVC — utility

| Plugin | File | Sub-variants → ECU family label | Checksum hint |
|--------|------|---------------------------------|----------------|
| OLS1006 | `OLS1006_ODX.dll` | *(plugin ID not found in plain text — self-identifies via `Die Checksumme OLSxxx` only)* | — |
| OLS521 | `OLS521_DamosImport.dll` | *(no plain-text ID — Obsidium-wrapped)* | — |
| OLS550 | `OLS550_Dataareas.dll` | *(plugin ID not found in plain text — self-identifies via `Die Checksumme OLSxxx` only)* | CRC32<br>CRC32 opt (generic WinOLS CRC32 detector) |

## Ford / Visteon

| Plugin | File | Sub-variants → ECU family label | Checksum hint |
|--------|------|---------------------------------|----------------|
| OLS269 | `OLS269_Ford_TDCI.dll` | OLS269: 0x180 Byte Batei gefunden<br>OLS269: 0x38000 Byte Datei gefunden<br>OLS269: 0x40000 Byte Batei gefunden<br>OLS269: Ford EECV-L | — |
| OLS811 | `OLS811_Visteon_ST10_Tricore.dll` | OLS811: Visteon ST10 gefunden auf %X<br>OLS811: Visteon ST10/Tricore gefunden<br>OLS811: Visteon ST10/Tricore-V2 gefunden | CRC32 opt (generic WinOLS CRC32 detector) |

## Lucas

| Plugin | File | Sub-variants → ECU family label | Checksum hint |
|--------|------|---------------------------------|----------------|
| OLS275 | `OLS275_LUCAS_Volvo.dll` | OLS275: Lucas Hyundai<br>OLS275: Lucas Fiat | — |

## Marelli

| Plugin | File | Sub-variants → ECU family label | Checksum hint |
|--------|------|---------------------------------|----------------|
| OLS259 | `OLS259_Marelli.dll` | OLS259: Marelli-49FB9<br>OLS259: Marelli-P8<br>OLS259: Marelli-1AF17<br>OLS259: Marelli-MM1AP<br>OLS259: Marelli-MM48P<br>OLS259: Marelli-4MP11<br>OLS259: Marelli-M<br>OLS259: Marelli-MM48P2<br>OLS259: Marelli-MM6LP, Offset:%X<br>OLS259: Marelli-Polo4<br>OLS259: Marelli-8P40<br>OLS259: Marelli-Maserati 1<br>OLS259: Marelli-Maserati 2<br>OLS259: Marelli-Polo 1.6<br>OLS259: Marelli-Alfa146<br>OLS259: Marelli-VAG-lang<br>OLS259: Marelli-Opel CDTI<br>OLS259: Marelli-Seat Arosa<br>OLS259: Marelli-5SM Ducati, Offset %X<br>OLS259: Marelli-IAW16C4, Offset %X | CRC32 opt (generic WinOLS CRC32 detector) |

## Motorola / Cummins

| Plugin | File | Sub-variants → ECU family label | Checksum hint |
|--------|------|---------------------------------|----------------|
| OLS287 | `OLS287_Motorola.dll` | OLS287: Motorola MEMS3<br>OLS287: Motorola MEMS3-2 | — |

## Opel / GM (mixed)

| Plugin | File | Sub-variants → ECU family label | Checksum hint |
|--------|------|---------------------------------|----------------|
| OLS238 | `OLS238_SDB.dll` | OLS238: Opel Simtec56<br>OLS238: Opel Delco<br>OLS238: Opel Siemens<br>OLS238: Opel Bosch-1<br>OLS238: Opel Bosch-2<br>OLS238: Opel Bosch ME1.5.5/3.1.1:ME1.5<br>OLS238: Opel Bosch ME1.5.5/3.1.1:ME3.1.1<br>OLS238: Opel Delco DTI:Y17DT<br>OLS238: Opel Delco DTI:Y17DIT<br>OLS238: Opel Delco DTI:Y30DT<br>OLS238: Opel Delco 2<br>OLS238: Opel Delco 2-Y16XE<br>OLS238: Opel GMPT-1<br>OLS238: Opel GMPT-2<br>OLS238: Opel GMPT-2b<br>OLS238: Opel GMPT-3<br>OLS238: Opel Bosch ME7.6.2/7.9.9, offset=%X, addCS=%d<br>OLS238: Opel Bosch ME7.6.1/7.9.6<br>OLS238: Opel Delco 3, Offset = %X, cksAdr = %X<br>OLS238: Opel Delco 3<br>OLS238: Opel Delco 4 | Running byte/word sum with base (Opel/ME7-Fiat style) |

## Other / Mixed

| Plugin | File | Sub-variants → ECU family label | Checksum hint |
|--------|------|---------------------------------|----------------|
| OLS285 | `OLS285_EDC16_RSA.dll` | OLS285: Bosch EDC16V2 | Compatibility-test checksum (Bosch MED17)<br>EEPROM checksum block |

## Saab / Trionic

| Plugin | File | Sub-variants → ECU family label | Checksum hint |
|--------|------|---------------------------------|----------------|
| OLS258 | `OLS258_Saab.dll` | *(plugin ID not found in plain text — self-identifies via `Die Checksumme OLSxxx` only)* | — |
| OLS804 | `OLS804_Trionic_8.dll` | OLS804: Trionic 8 | — |

## Sagem / Valeo

| Plugin | File | Sub-variants → ECU family label | Checksum hint |
|--------|------|---------------------------------|----------------|
| OLS283 | `OLS283_Sagem.dll` | OLS283: Sagem<br>OLS283: Sagem 2000<br>OLS283: Sagem 3000-V1, Offset %X<br>OLS283: Sagem 3000-V2, Offset %X<br>OLS283: Sagem 3000-V3<br>OLS283: Sagem S2000PM2<br>OLS283: Valeo - MemStart %X, MemEnd %X, Offset %X, Swap %d | CRC32 opt (generic WinOLS CRC32 detector) |

## Scania / HPI

| Plugin | File | Sub-variants → ECU family label | Checksum hint |
|--------|------|---------------------------------|----------------|
| OLS278 | `OLS278_Scania_HPI.dll` | OLS278: Scania HPI-V1<br>OLS278: Scania HPI-V2<br>OLS278: Scania HPI EMS S7<br>OLS278: Scania HPI EMS S8 | — |

## Siemens / Continental

| Plugin | File | Sub-variants → ECU family label | Checksum hint |
|--------|------|---------------------------------|----------------|
| OLS222 | `OLS222_Siemens_MS4x.dll` | *(plugin ID not found in plain text — self-identifies via `Die Checksumme OLSxxx` only)* | CRC32 opt (generic WinOLS CRC32 detector) |
| OLS237 | `OLS237_Siemens_MSS52.dll` | OLS237: Siemens MSS50<br>OLS237: Siemens MSS52/3<br>OLS237: Siemens MSS54, Offset = %X | — |
| OLS242 | `OLS242_Siemens_SIM4LE.dll` | OLS242: Siemens SIM4LE<br>OLS242: Siemens SIM4KLE, Offset %X | CRC32 opt (generic WinOLS CRC32 detector) |
| OLS244 | `OLS244_SB_VAG.dll` | OLS244: Siemens Simos4s<br>OLS244: Siemens SimosV2<br>OLS244: Siemens Simos2/3/71/9x<br>OLS244: Bosch M7.9.7.1, L | CRC32 opt (generic WinOLS CRC32 detector) |
| OLS248 | `OLS248_Siemens_Volvo_Renault.dll` | OLS248: Siemens SH705x | CRC32 opt (generic WinOLS CRC32 detector) |
| OLS253 | `OLS253_Siemens_HDI.dll` | OLS253: Siemens HDI, datBase:%X, offset:%X | CRC32 opt (generic WinOLS CRC32 detector) |
| OLS277 | `OLS277_Siemens_MS45.dll` | OLS277: Siemens MS45<br>OLS277: Siemens MS45-SPI | — |
| OLS280 | `OLS280_Siemens_SID803.dll` | OLS280: Siemens SID803-Prozessor<br>OLS280: Siemens SID803-Prozessor+Eprom aus VBF<br>OLS280: Siemens SID803- 9MB-OBD-Tuning-Datei<br>OLS280: Siemens SID201/204<br>OLS280: Siemens SID201/204-Prozessor+Eprom aus VBF<br>OLS280: Siemens SID201/204-Prozessor+Eprom+Eprom2 aus VBF<br>OLS280: Siemens SID803A/30x-Eprom<br>OLS280: Siemens SID202-1<br>OLS280: Siemens SID202-2a<br>OLS280: Siemens SID202-2b<br>OLS280: Siemens SID202-3<br>OLS280: Siemens SID202-4<br>OLS280: Siemens SIDxxx<br>OLS280: Siemens SID9xx<br>OLS280: Siemens EasyU | CRC32 opt (generic WinOLS CRC32 detector) |
| OLS297 | `OLS297_Siemens_MSS65.dll` | OLS297: %s<br>OLS297: seriell<br>OLS297: seriell OptiCAN<br>OLS297: seriell NewGenius | — |
| OLS298 | `OLS298_Siemens_Simos.dll` | OLS298: Siemens Simos 6.x-seriell<br>OLS298: Siemens Simos 6.x-Eprom<br>OLS298: Siemens Simos HMC-Eprom<br>OLS298: Siemens Simos SIM266-Eprom seriell<br>OLS298: Siemens Simos SIM266-Eprom | — |
| OLS299 | `OLS299_Siemens_PPD.dll` | OLS299: Siemens PPD, volle L<br>OLS299: Siemens PPD, 40000h/3D000h L | — |
| OLS800 | `OLS800_Siemens_MSV70.dll` | OLS800: Siemens MSV70/MSD70-Eprom | — |

## TRW

| Plugin | File | Sub-variants → ECU family label | Checksum hint |
|--------|------|---------------------------------|----------------|
| OLS805 | `OLS805_TRW_Volvo.dll` | OLS805: TRW Volvo Truck EMS2/2.2 EMS2, Offset %X<br>OLS805: TRW Volvo Truck EMS2/2.2 EMS2.2, kein Offset<br>OLS805: TRW Volvo Truck EMS2/2.2 EMS2.2, Hexdatei<br>OLS805: TRW Volvo Truck EMS2.3, Kennfeldbereich auf %X | CRC32 opt (generic WinOLS CRC32 detector) |

## Temic

| Plugin | File | Sub-variants → ECU family label | Checksum hint |
|--------|------|---------------------------------|----------------|
| OLS276 | `OLS276_TEMIC_Truck.dll` | *(plugin ID not found in plain text — self-identifies via `Die Checksumme OLSxxx` only)* | — |
| OLS824 | `OLS824_TEMIC_Truck2.dll` | *(plugin ID not found in plain text — self-identifies via `Die Checksumme OLSxxx` only)* | CRC32 opt (generic WinOLS CRC32 detector) |

## Boilerplate (present in every non-utility plugin)

These German/English strings appear in every plugin and do **not** identify a
specific algorithm — they are the WinOLS checksum-result UI boilerplate:

- `Die Checksumme OLS<nnn> benötigt mindestens WinOLS Version X.Y` —
  minimum-version gate.
- `Es scheint, dass es Probleme für die Checksumme gibt und kontaktieren Sie ggf. EVC.` —
  fallback error.
- `Not all of the expected checksums were found. The correction may be incomplete.` —
  partial-cover warning.
- `Patch: %s - Block %d not found` — missing-patch error.
- `Can't place NOREAD/SPI/BDM tag. Checksum may not work or may not be protected from reading.` —
  dump-quality warning.
- `Checksum DLL` — checkmark panel label.

## Consumer pointers

`checksumEngine.ts` can use the per-plugin hint column above to map a customer file to
a candidate algorithm. The highlighted plugins of immediate interest are:

- **Bosch EDC16 (OLS285)** → CRC32 blocks + RSA signature hint.
- **Bosch MED17 / EDC17 (OLS807)** → CRC32-Basis / CRC32-Gesamt / CRC32-Comp / CRC32-CompFix
  (four variants) and OTP-range exclusion marker `AFAFAFAF`.
- **Bosch ME9 Volvo/Ford (OLS286)** → combined CRC32 multi-region + RSA signature.
- **Bosch EDC7 truck (OLS290)** → classical + "zusatz" (additional) + compat-test checksum.
- **Delphi DCM3 (OLS809)** → Intel-vs-Motorola byte order CRC32 + CRC16 + Add8-in-16.
- **Bosch TDI CR2 Volvo (OLS220-6)** → XOR1 + XOR + AddVal (word + additive), plus a
  separate bootloader variant.
- **CRC32 opt** format string appears across 20+ plugins — that's WinOLS's generic
  CRC32 *auto-detection* helper (scans arbitrary regions); the concrete polynomial is
  in the packed code.

