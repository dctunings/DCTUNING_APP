# DCTuning Bridge — Releases

Pre-built Windows binaries of the DCTuning Bridge service. Customers download
these to use J2534 hardware (Scanmatik, Tactrix, MagicMotorSport, etc.) from
the web app at `app.dctuning.ie` — no full desktop app required.

## Latest — v0.2.0

**Recommended for end users**:

📦 **[`DCTuningBridge_Setup_v0.2.0.exe`](DCTuningBridge_Setup_v0.2.0.exe)** (26 MB)

Proper Windows installer — wizard, Add/Remove Programs entry, optional
auto-start on Windows boot, hidden console window. Same install experience
as the desktop app.

**For advanced users** (manual extract, no installer):

📦 [`DCTuningBridge-v0.2.0-win-x64.zip`](DCTuningBridge-v0.2.0-win-x64.zip) (26 MB)

ZIP containing the bare `.exe` + helper. Extract anywhere, double-click to run.
No registry entries, no auto-start, no shortcuts — just the binaries.

## Install (Setup.exe — recommended)

1. Download `DCTuningBridge_Setup_v0.2.0.exe` from the link above.
2. **Windows SmartScreen** will warn "Windows protected your PC". Click
   **More info → Run anyway**. (This goes away with code-signing in v0.4.0.)
3. The installer wizard opens. Click through:
   - **License** — DCTuning EULA
   - **Install location** — default `C:\Program Files\DCTuning Bridge`
   - **Components** — three checkboxes:
     - ✅ Bridge service (required, can't uncheck)
     - ✅ Start automatically on Windows login (recommended)
     - ✅ Start Menu shortcut
     - ☐ Desktop shortcut (off by default)
   - Click **Install**
4. On the final wizard page, leave **"Start DCTuning Bridge now"** checked
   and click **Finish**.
5. The bridge starts as a hidden background service. **No console window
   visible** (changed from v0.1.0). You can't see it directly — verify it's
   running by opening `http://127.0.0.1:8765` in any browser:
   ```json
   {"service":"dctuning-bridge","version":"0.2.0","uptime":42,...}
   ```
6. Open `app.dctuning.ie` → ECU Unlock / Cloning / Flash should show the
   green **"Local Bridge Connected"** pill.

From now on, the bridge starts automatically every time Windows logs in.
Customer doesn't have to think about it.

## Uninstall

Standard Windows: **Settings → Apps → Installed apps → DCTuning Bridge →
Uninstall**. Or **Control Panel → Programs and Features → DCTuning Bridge**.
Cleanly removes all files, registry entries, and the auto-start hook.

## Prerequisites

- Windows 10 / 11 (J2534 DLLs are Windows-only)
- Your J2534 device's official driver installed (e.g. Scanmatik 2.21.21/22
  for Scanmatik 2 PRO and PCMTuner clones)
- Chrome / Edge / Brave browser for `app.dctuning.ie`

## Verifying the bridge is up

Open `http://127.0.0.1:8765` in a browser — you should see:

```json
{
  "service": "dctuning-bridge",
  "version": "0.2.0",
  "uptime": 42,
  "endpoint": "ws://127.0.0.1:8765"
}
```

If you don't see this, the bridge isn't running. From the Start Menu launch
**DCTuning Ireland → DCTuning Bridge** to start it manually, or reboot if
auto-start is enabled.

## What's new in v0.2.0 vs v0.1.0

| Change | v0.1.0 | v0.2.0 |
|---|---|---|
| Distribution | bare ZIP | **NSIS installer** (setup wizard) |
| Icon | default Node hex | **DCTuning logo** |
| Console window | visible | **hidden** (subsystem GUI) |
| Auto-start on boot | manual shortcut | **installer checkbox** |
| Add/Remove Programs entry | none | **proper uninstaller** |
| Version metadata in Properties | none | DCTuning Ireland + product info |
| Bundler | pkg | Node SEA + postject + rcedit |

## Known limitations (v0.2.0)

- **Windows SmartScreen warning** on first run — unsigned binary. Fix in
  v0.4.0 with a code-signing cert (~$200/yr).
- **No system tray icon** — bridge runs invisibly. Right now, the only way
  to verify it's running is to hit `http://127.0.0.1:8765` in a browser.
  Tray icon ships in v0.3.0.
- **Logs go nowhere** — with the console hidden, `console.log` output is
  discarded. v0.3.0 will redirect logs to `%LOCALAPPDATA%\DCTuning Bridge\bridge.log`.

## Roadmap

| Version | Improvement |
|---|---|
| v0.1.0 | Single .exe, manual launch, console window, Node icon |
| **v0.2.0 (current)** | NSIS installer, DCTuning icon, hidden console, auto-start option |
| v0.3.0 | System tray icon, log file, status menu |
| v0.4.0 | Code-signed binary (no SmartScreen warning) |
| v0.5.0 | Auto-update from GitHub Releases |

## Build from source

```bash
cd bridge
npm install
npm run package
```

Outputs to `releases/`. Requires NSIS 3.x installed at
`C:\Program Files (x86)\NSIS\makensis.exe` for the installer build.
