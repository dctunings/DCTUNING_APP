# DCTuning Bridge — Releases

Pre-built Windows binaries of the DCTuning Bridge service. Customers download
these to use J2534 hardware (Scanmatik, Tactrix, MagicMotorSport, etc.) from
the web app at `app.dctuning.ie` — no full desktop app required.

## Latest

**`DCTuningBridge-v0.1.0-win-x64.zip`** (14.5 MB)

Contents (extract both files to the same folder):

| File | Size | Purpose |
|---|---|---|
| `DCTuningBridge.exe` | 38 MB | Bridge service (Node + bridge code, single file) |
| `j2534helper.exe`    | 13 KB | 32-bit J2534 DLL loader (PInvoke into PassThruXxx) |

## Install (end users)

1. Download the ZIP from
   `https://raw.githubusercontent.com/dctunings/DCTUNING_APP/main/dctuning-desktop/bridge/releases/DCTuningBridge-v0.1.0-win-x64.zip`
2. Extract anywhere — Desktop, Documents, wherever (~38 MB)
3. Double-click `DCTuningBridge.exe`
4. A console window opens showing:
   ```
   DCTuning Bridge v0.1.0
   Listening on ws://127.0.0.1:8765
   Helper: <path>/j2534helper.exe
   ```
5. Open `app.dctuning.ie` in Chrome / Edge / Brave
6. Visit ECU Unlock / Cloning / Flash — green pill says
   **"Local Bridge Connected"**

The bridge must stay running while you use J2534 features. Close the console
window when you're done.

## Prerequisites

- Windows 10 / 11 (the J2534 DLLs are Windows-only)
- Your J2534 device's official driver installed (e.g. Scanmatik 2.21.21/22 for
  Scanmatik 2 PRO and PCMTuner clones)
- Chrome / Edge / Brave browser

## Auto-start on boot (optional, until v0.2.0 ships an installer)

To make the bridge start automatically when Windows logs in:

1. Press `Win+R`, type `shell:startup`, press Enter
2. Right-click → New → Shortcut
3. Target: full path to `DCTuningBridge.exe`
4. Name it "DCTuning Bridge"

Now it runs every login. Right-click the console window → Properties → Layout
to make it minimise on start if you don't want it visible.

## Verifying the bridge is up

Open `http://127.0.0.1:8765` in a browser — you should see:

```json
{
  "service": "dctuning-bridge",
  "version": "0.1.0",
  "uptime": 42,
  "endpoint": "ws://127.0.0.1:8765"
}
```

If you don't see this, the bridge isn't running. Restart it.

## Roadmap

| Version | Improvement |
|---|---|
| v0.1.0 (current) | Single .exe, manual launch, console window |
| v0.2.0 | NSIS installer, system tray icon, hide console |
| v0.3.0 | Auto-update from GitHub Releases |
| v0.4.0 | Code-signed binary (no Windows SmartScreen warning) |

## Build from source

See parent README: `../README.md`. Run `npm run package` to rebuild the .exe
and the ZIP.
