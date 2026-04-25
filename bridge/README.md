# DCTuning Bridge

Local J2534 WebSocket service that lets the DCTuning web app at `app.dctuning.ie`
talk to J2534 PassThru hardware (Scanmatik, Tactrix, MagicMotorSport, Mongoose,
etc.) without requiring the full desktop app.

## Why this exists

The Scanmatik 2.21.21/22 driver registers the device under a custom Windows
device class (`SCANMATIK`) — not as a virtual COM port. This means the browser's
**Web Serial API cannot see it**. Browsers fundamentally cannot load Windows
DLLs (sandbox limitation), so they can't speak J2534 directly.

The bridge solves this with a tiny native helper: the browser connects via
WebSocket to `localhost:8765`, the bridge loads the J2534 DLL on its behalf
(reusing the existing `j2534helper.exe` from the desktop app), and forwards
results back over the WebSocket.

```
┌─ Browser tab (app.dctuning.ie) ──────────────────────────────┐
│                                                              │
│  ECU Cloning page → bridgeClient.j2534ReadECUID()            │
│                                                              │
└──────────────────────────────┬───────────────────────────────┘
                               │ WebSocket (ws://127.0.0.1:8765)
                               │ JSON request: {id, action, params}
                               ▼
┌─ DCTuning Bridge (this service) ─────────────────────────────┐
│                                                              │
│  bridge-server.ts → routes to driver                         │
│  j2534-driver.ts  → spawns helper, JSON over stdin/stdout    │
│                                                              │
└──────────────────────────────┬───────────────────────────────┘
                               │ stdin/stdout (JSON-per-line)
                               ▼
┌─ j2534helper.exe (12.8 KB native binary) ────────────────────┐
│                                                              │
│  PInvoke → sm2j2534.dll → Scanmatik device                   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## Build

```bash
npm install
npm run build         # TypeScript → dist/
npm run start         # run from source for dev/debug
npm run package       # produce build/DCTuningBridge.exe (single binary)
```

The `package` script uses [pkg](https://github.com/vercel/pkg) to bundle Node +
the compiled JS into a standalone Windows `.exe`. Resulting exe is ~30-40 MB
(vs ~250 MB for the full Electron desktop app).

## Distribution

The bundled `DCTuningBridge.exe` needs to ship alongside the existing
`j2534helper.exe` from `dctuning-desktop/resources/`. The driver's
`locateHelperExe()` looks in:

1. Same directory as the bridge exe (production install)
2. `../resources/j2534helper.exe` (dev within bridge folder)
3. `../../dctuning-desktop/resources/j2534helper.exe` (sibling layout)
4. `../../../dctuning-desktop/resources/j2534helper.exe`

For production, the installer should drop both into `%ProgramFiles%/DCTuning Bridge/`.

## Security

- Bound to `127.0.0.1` only — never network-accessible
- Origin header validated on WebSocket upgrade — only accepts:
  - `https://app.dctuning.ie`
  - `https://www.dctuning.ie`
  - localhost variants (development)
- Browsers allow `ws://localhost` from `https://` pages (special spec rule for
  loopback addresses), so app.dctuning.ie works without TLS on the bridge

## Protocol

WebSocket messages are JSON, one per frame.

**Request** (browser → bridge):
```json
{ "id": "req-1", "action": "j2534-read-ecu-id", "params": { } }
```

**Response** (bridge → browser):
```json
{ "id": "req-1", "ok": true, "data": { "id": { "partNumber": "03L906023..." } } }
```

**Error response**:
```json
{ "id": "req-1", "ok": false, "error": "Device not opened" }
```

Supported actions are listed in `src/types.ts → BridgeAction`.

## Status

**v0.1.0 — Console process.** Run from terminal. Helper exe must be reachable.

Next on the roadmap:
- v0.2.0: System tray icon (using `systray` npm)
- v0.3.0: Windows installer (NSIS or MSI), auto-start on login
- v0.4.0: Auto-update from GitHub releases
- v0.5.0: Optional progress streaming for long ops (flash read/write)
