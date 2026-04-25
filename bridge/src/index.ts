/**
 * index.ts — Entry point for the DCTuning Bridge service
 *
 * Runs as a background process. Hosts a WebSocket server on localhost:8765
 * that lets the web app at app.dctuning.ie talk to local J2534 hardware
 * (Scanmatik, Tactrix, etc.) without needing the full desktop app.
 *
 * v0.1.0 ships as a console process. Tray icon + auto-start service
 * registration come in v0.2.0.
 */

import { startBridgeServer } from './bridge-server'

if (process.platform !== 'win32') {
  console.error('DCTuning Bridge is Windows-only — J2534 PassThru DLLs require Windows.')
  process.exit(1)
}

startBridgeServer()
