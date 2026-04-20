# Embedded Strings — ols.exe / OLS_LangE.dll

This file documents the static-extraction pass over WinOLS's main binary and its English
language resource DLL, and is a companion to `CHECKSUM_FAMILIES.md`.

## TL;DR — the main binary is packed, so symbol names are not recoverable statically

| Binary | Size | Result |
|--------|------|--------|
| `binaries/ols.exe` | 9.5 MB | Obsidium-wrapped. 21 949 ASCII strings pass min-length, almost all are cipher noise. Only the PE metadata (version, cert chain, imports) reads plain. |
| `binaries/OLS_LangE.dll` | 2.5 MB | Same Obsidium wrapper; .rsrc string tables / dialogs / menus are **all** encrypted (printable ratio ≈ 0 in every stringtable block). |

Evidence of the packer:

- Certificate chain embedded in `.rsrc` includes `Obsidium Software CA` at offset `0x002450fe`.
- PE sections of `ols.exe` have no `.text` name at all — 6 anonymous sections, which is an
  Obsidium hallmark.
- `OLS_LangE.dll` has `.adata`, `.data1`, `.reloc1`, `.text1`, `.pdata` beyond the standard
  section set — additional Obsidium bookkeeping.
- Dumping STRINGTABLE (RT_STRING / id 6) resources yields 246 blocks whose printable-char
  ratio is ~0.4 (ols.exe) / 0.0 (OLS_LangE.dll). Decoded as UTF-16LE they are random
  Unicode, e.g. `蓍뇗掀糤塹…` — the strings are decrypted on-demand at runtime.

## What is readable in ols.exe

### PE version info (`RT_VERSION` block at rva `0x24acf14`)

```
CompanyName:      EVC electronic GmbH
FileDescription:  WinOLS
FileVersion:      4.26.00
InternalName:     OLS
OriginalFilename: OLS.EXE
LegalCopyright:   Copyright (C) 2019 EVC electronic GmbH
ProductName:      Anwendung WinOLS
```

### Manifest (`RT_MANIFEST` at rva `0x24ad230`)

`<assemblyIdentity version="1.0.0.0" processorArchitecture="X86" name="WinOLS" type="win32" />`

Targets `http://schemas.microsoft.com/SMI/2016/WindowsSettings` — standard Microsoft DPI manifest.

### Certificate URLs (import / signing metadata)

```
GlobalSign: gsextendcodesignsha2g3 (extended code-signing chain)
Sectigo / COMODO: RSA Time-Stamping
Symantec: sha256-tss-ca
USERTrust RSA root chain
Obsidium Software CA (packer vendor CA)
```

### Imports (plain strings in IAT)

`kernel32.dll`, `user32.dll`, `advapi32.dll`, `comctl32.dll`, plus the usual CRT. No
indication of statically-imported plugin DLL names — those are loaded via `LoadLibrary`
from the `\WinOLS\` install dir at runtime.

## What is readable in OLS_LangE.dll

Just the PE scaffolding:

```
OLS_LangE.dll
KERNEL32.dll / USER32.dll / GDI32.dll / MSVCRT.dll
```

All 242 STRINGTABLE blocks, 264 dialogs, 67 menus — encrypted.

## Implication for the Remap Builder

Targets we hoped to mine from `ols.exe` — Bosch `Kf_*` symbol names, `ecuDefinitions`
architecture tags, checksum algorithm menu text, the "potential maps" UI wording, and
the `ols_sp.cfg` axis-signature-library strings — are **not extractable** without an
Obsidium unpacker or a live-process memory dump. They exist in the binary, but as
encrypted blobs that the packer decrypts into process memory on first reference.

What we DO have that serves the same purpose:

1. **Plugin DLL strings** — every one of the 62 OLSxxx plugins exposes its supported ECU
   family names, sub-variants, and checksum format strings in the pre-packer data
   segment (the Obsidium wrapper on the plugins is less aggressive than on the main
   binary). See `CHECKSUM_FAMILIES.md` for the full table.
2. **Ecus.txt / Modelle.txt** ship unpacked alongside the binary — the complete
   manufacturer/family catalog. See `ecus_full.json` for the merged machine-readable form.
3. **WinOLS_HelpEn_5.74.txt** in the same folder — if map-finder terminology and axis-
   profile vocabulary is required, mine the extracted help PDF text instead of the packed
   executable. That's a separate future pass.

## Recovered evidence from the 62 plugin DLLs (summary)

| Category | Plugins reporting | Example |
|----------|-------------------|---------|
| Explicit plugin self-id (`OLS<nnn>[-sub]: <label>`) | 51 / 62 | `OLS220-6: Bosch CR2 Volvo, XOR1: %X, XOR: %X, AddVal: %X` |
| `CRC32 opt %X: %X, %X` | 21 plugins | Generic CRC32 auto-detect helper |
| `CRC32-Basis` / `CRC32-Gesamt` / `CRC32-Comp` / `CRC32-CompFix` | OLS807 (MED17/EDC17) | Four MED17 variants, with OTP-range `AFAFAFAF` skip |
| Multi-region `CRC32: %X-%X + %X-%X + %X-%X -> %X` | OLS286 (ME9 Volvo/Ford) | Three region sum |
| `RSA-Checksumme` / `invalid rsa range` | OLS285 (EDC16V2), OLS286 (ME9), OLS807 (MED17/EDC17) | Cryptographic signature on calibration data |
| `XOR1 / XOR / AddVal` | OLS220 (TDI CR2 Volvo + bootloader variant) | Word XOR + additive |
| `CRC32 Intel` / `CRC16 Motorola` / `Add8in16 + CRC16` | OLS809 (Delphi DCM3.x, CRD2/3) | Four per-block algorithms |
| `SumAdr / ActAdd / Startwert` | OLS238 (Opel Delco 3), OLS260 (ME7 Fiat) | Running sum with base |
| `EDC7U-Zusatz-Checksumme abgleichen` / `compatibility test checksum` | OLS290 (EDC7) | Multiple sibling checksums per file |
| `Gefundene CRC32-Zeilen, Anzahl %d` + `Suche nach CRC32-Zeilen` / `…CRC16-Zeilen` | OLS550 (Dataareas utility) | Generic CRC line-scanner driver |

Locations (file offsets) for every string are captured in `_tmp_extract/plugins.json`
if a deeper consumer needs to dump the exact byte offsets.

