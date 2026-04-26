/**
 * bridge-server.ts — WebSocket server + message router
 *
 * Listens on localhost:8765 (ws://) and dispatches incoming JSON messages to
 * the j2534-driver. One WebSocket = one logical client. Concurrent clients
 * share the same J2534 device state (i.e. only one device can be opened at
 * a time across the bridge — same as the desktop app).
 *
 * Security model:
 *   - Bound to 127.0.0.1 only (NOT network-accessible)
 *   - Origin header validated on upgrade — only accepts the allowlisted
 *     production domain + localhost dev origins
 *   - No long-lived auth tokens — origin check is sufficient because the bridge
 *     is loopback-only and origin can't be spoofed by a real browser
 *
 * Browsers automatically allow ws://localhost from https:// pages (special
 * case in the mixed-content spec for loopback addresses), so app.dctuning.ie
 * can connect without any TLS setup on the bridge side.
 */

import { WebSocketServer, WebSocket } from 'ws'
import * as http from 'http'
import * as driver from './j2534-driver'
import { scanJ2534Devices } from './registry-scan'
import { calculateKey } from './ecuSeedKey'
import type { BridgeRequest, BridgeResponse, BridgeEvent, PingResponse } from './types'

// Origins allowed to connect. Localhost variants are for development only.
const ALLOWED_ORIGINS = new Set([
  'https://app.dctuning.ie',
  'https://www.dctuning.ie',
  'http://localhost:5173',         // vite dev server (electron-vite)
  'http://localhost:4173',         // vite preview
  'http://127.0.0.1:5173',
])

const PORT = 8765
const VERSION = '0.2.0'
const startedAt = Date.now()

function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return false
  return ALLOWED_ORIGINS.has(origin.toLowerCase())
}

// ── Action dispatcher ──────────────────────────────────────────────────────
//
// Each action returns a Promise<unknown>. The router wraps the result into a
// BridgeResponse with the matching request id. Errors get turned into
// `{ ok: false, error }`.

async function dispatch(req: BridgeRequest): Promise<unknown> {
  const action = req.action
  const params = (req.params || {}) as Record<string, unknown>

  switch (action) {
    case 'ping': {
      const helperPath = driver.getHelperPath()
      const resp: PingResponse = {
        version: VERSION,
        hasPowerShell: process.platform === 'win32',
        bridgeReady: helperPath !== null,
        uptime: Math.floor((Date.now() - startedAt) / 1000),
      }
      return resp
    }

    case 'scan-devices':
      return scanJ2534Devices()

    case 'j2534-open': {
      const dllPath = String(params.dllPath || '')
      if (!dllPath) throw new Error('dllPath is required')
      return await driver.j2534Open(dllPath)
    }

    case 'j2534-close':
      await driver.j2534Close()
      return { ok: true }

    case 'j2534-is-open':
      return { ok: driver.j2534IsOpen() }

    case 'j2534-is-connected':
      return { ok: driver.j2534IsConnected() }

    case 'j2534-connect': {
      const protocol = Number(params.protocol)
      const baud = Number(params.baud)
      if (!Number.isFinite(protocol) || !Number.isFinite(baud)) throw new Error('protocol and baud are required')
      return await driver.j2534Connect(protocol, baud)
    }

    case 'j2534-disconnect':
      // Note: helper exe doesn't expose a separate Disconnect — closing the
      // helper closes the channel. Repurposed as a soft close here.
      await driver.j2534Close()
      return { ok: true }

    case 'j2534-uds': {
      const protocol = Number(params.protocol)
      const data = params.data as number[]
      const timeout = Number(params.timeout || 3000)
      if (!Number.isFinite(protocol) || !Array.isArray(data)) throw new Error('protocol and data array required')
      return await driver.j2534UDS(protocol, data, timeout)
    }

    case 'j2534-read-dtcs': {
      const protocol = Number(params.protocol || 6)
      const data = protocol === 6 ? [0x00, 0x00, 0x07, 0xdf, 0x03] : [0x03]
      return await driver.j2534SendOBD2(protocol, data, 3000)
    }

    case 'j2534-clear-dtcs': {
      const protocol = Number(params.protocol || 6)
      const data = protocol === 6 ? [0x00, 0x00, 0x07, 0xdf, 0x04] : [0x04]
      return await driver.j2534SendOBD2(protocol, data, 3000)
    }

    case 'j2534-read-ecu-id': {
      // Read VW/Audi DIDs in sequence: F187 (part), F189 (sw), F191 (hw), F190 (vin)
      const protocol = 6
      const dids = [
        { name: 'partNumber', did: [0xf1, 0x87] },
        { name: 'swVersion',  did: [0xf1, 0x89] },
        { name: 'hwVersion',  did: [0xf1, 0x91] },
        { name: 'vin',        did: [0xf1, 0x90] },
        { name: 'systemName', did: [0xf1, 0x97] },
      ]
      const result: Record<string, string | undefined> = {}
      const raw: Record<string, string> = {}
      for (const { name, did } of dids) {
        const r = await driver.j2534UDS(protocol, [0x22, ...did], 1500)
        if (r.ok && r.bytes && r.bytes.length >= 3) {
          // Strip 0x62 (positive response) + DID echo (2 bytes)
          const payload = r.bytes.slice(3)
          const ascii = payload
            .filter(b => b >= 0x20 && b <= 0x7e)
            .map(b => String.fromCharCode(b))
            .join('')
            .trim()
          result[name] = ascii || undefined
          raw[name] = r.hex || ''
        }
      }
      return { ok: true, id: { ...result, ecuPart: result.partNumber, raw } }
    }

    case 'j2534-calc-key': {
      // SecurityAccess seed → key. Pure JS, no hardware needed. Lets the
      // browser do the full unlock flow: requestSeed → calc-key (here) →
      // sendKey, all over the bridge.
      const ecuId = String(params.ecuId || '')
      const seedHex = String(params.seedHex || '')
      const level = Number(params.level || 1)
      if (!ecuId) throw new Error('ecuId is required')
      // Accept seed as either hex string ("12 34 AB CD") or array of bytes
      let seedBytes: number[]
      if (Array.isArray(params.seedBytes)) {
        seedBytes = params.seedBytes as number[]
      } else if (seedHex) {
        seedBytes = seedHex.replace(/\s+/g, '').match(/.{2}/g)?.map(h => parseInt(h, 16)) ?? []
      } else {
        throw new Error('seedHex or seedBytes is required')
      }
      return calculateKey(ecuId, seedBytes, level)
    }

    case 'j2534-read-flash': {
      // Chunked UDS 0x23 (ReadMemoryByAddress).
      const startAddr = Number(params.startAddr)
      const totalLen  = Number(params.totalLen)
      const chunkSize = Number(params.chunkSize || 256)
      const protocol  = Number(params.protocol || 6)
      if (!Number.isFinite(startAddr) || !Number.isFinite(totalLen)) throw new Error('startAddr and totalLen required')

      const out: number[] = []
      let pos = 0
      while (pos < totalLen) {
        const len = Math.min(chunkSize, totalLen - pos)
        const r = await driver.j2534ReadMem(protocol, startAddr + pos, len)
        if (!r.ok || !r.hex) {
          return { ok: false, error: r.error || `Read failed at offset 0x${(startAddr + pos).toString(16)}` }
        }
        const matched = r.hex.match(/.{2}/g) || []
        for (const h of matched) out.push(parseInt(h, 16))
        pos += len
      }
      return { ok: true, data: out, bytesRead: out.length }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}

// ── Connection lifecycle ───────────────────────────────────────────────────

function broadcast(_clients: Set<WebSocket>, _evt: BridgeEvent): void {
  // Reserved for future progress events. The helper exe doesn't currently emit
  // streaming progress, so this is a no-op stub for now.
}

export function startBridgeServer(): void {
  const httpServer = http.createServer((req, res) => {
    // CORS — browsers at https://app.dctuning.ie probe http://127.0.0.1:8765
    // to detect the bridge. The health endpoint returns only public bridge
    // metadata (no secrets), so allowing the request is safe. The WebSocket
    // itself still enforces a strict origin allowlist on upgrade.
    const origin = req.headers.origin
    if (origin && isOriginAllowed(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin)
    } else {
      res.setHeader('Access-Control-Allow-Origin', '*')
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    // Chrome's Private Network Access (PNA) — required when an HTTPS page on
    // the public internet hits a private IP (127.0.0.1). Without this header,
    // recent Chrome versions block the request before even checking CORS.
    res.setHeader('Access-Control-Allow-Private-Network', 'true')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    // Health endpoint — browser client uses this to detect bridge is up
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({
      service: 'dctuning-bridge',
      version: VERSION,
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      endpoint: `ws://127.0.0.1:${PORT}`,
    }))
  })

  const wss = new WebSocketServer({
    server: httpServer,
    verifyClient: (info, callback) => {
      const origin = info.req.headers.origin
      if (!isOriginAllowed(origin)) {
        console.warn(`[bridge] rejected connection from origin: ${origin}`)
        callback(false, 403, 'Forbidden origin')
        return
      }
      callback(true)
    },
  })

  const clients = new Set<WebSocket>()

  wss.on('connection', (ws, req) => {
    clients.add(ws)
    const origin = req.headers.origin
    console.log(`[bridge] client connected from ${origin}`)

    ws.on('message', async (raw) => {
      let req: BridgeRequest
      try {
        req = JSON.parse(raw.toString())
      } catch {
        ws.send(JSON.stringify({ id: 'malformed', ok: false, error: 'Invalid JSON' }))
        return
      }
      if (!req.id || !req.action) {
        ws.send(JSON.stringify({ id: req.id || 'malformed', ok: false, error: 'id and action required' }))
        return
      }

      try {
        const data = await dispatch(req)
        const resp: BridgeResponse = { id: req.id, ok: true, data }
        ws.send(JSON.stringify(resp))
      } catch (err) {
        const resp: BridgeResponse = {
          id: req.id,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        }
        ws.send(JSON.stringify(resp))
      }
    })

    ws.on('close', () => {
      clients.delete(ws)
      console.log('[bridge] client disconnected')
    })

    ws.on('error', (err) => {
      console.error('[bridge] socket error:', err.message)
    })
  })

  // Bind to loopback ONLY — never expose this on the network
  httpServer.listen(PORT, '127.0.0.1', () => {
    console.log('━'.repeat(56))
    console.log(`  DCTuning Bridge v${VERSION}`)
    console.log(`  Listening on ws://127.0.0.1:${PORT}`)
    console.log(`  Health check: http://127.0.0.1:${PORT}`)
    console.log(`  Allowed origins: ${[...ALLOWED_ORIGINS].join(', ')}`)
    console.log(`  Helper: ${driver.getHelperPath() || 'NOT FOUND — bridge will fail on j2534-open'}`)
    console.log('━'.repeat(56))
  })

  // Graceful shutdown — close the helper subprocess so it doesn't outlive us
  const cleanup = async () => {
    console.log('\n[bridge] shutting down...')
    await driver.j2534Close().catch(() => null)
    httpServer.close()
    process.exit(0)
  }
  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)
}

// Touch broadcast so unused-warning doesn't fire (it's reserved for future use)
void broadcast
