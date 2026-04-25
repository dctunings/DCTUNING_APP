/**
 * bridgeClient.ts — WebSocket client for the local DCTuning Bridge
 *
 * Connects to ws://127.0.0.1:8765 — the local helper service that bridges
 * the browser to the J2534 PassThru DLL. Lets web users at app.dctuning.ie
 * use J2534 hardware (Scanmatik, Tactrix, etc.) without the full desktop app.
 *
 * Pages use this as a third path alongside Electron IPC and Web Serial:
 *
 *   if (electronApi?.j2534XXX)        → desktop (Electron IPC, full features)
 *   else if (bridge.isAvailable())    → web with bridge installed (full features)
 *   else if (elm327WebSerial)         → ELM327 over Web Serial (limited)
 *   else                              → show "install bridge" CTA
 */

const BRIDGE_URL = 'ws://127.0.0.1:8765'
const HEALTH_URL = 'http://127.0.0.1:8765'
const PROBE_TIMEOUT_MS = 1500
const REQUEST_TIMEOUT_MS = 30000  // covers slow flash reads

type Resolver = (data: unknown) => void
type Rejector = (err: Error) => void

interface PendingRequest {
  resolve: Resolver
  reject: Rejector
  timer: ReturnType<typeof setTimeout>
}

class BridgeClient {
  private ws: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private pending = new Map<string, PendingRequest>()
  private nextId = 1
  private _connected = false
  private _detected: 'unknown' | 'present' | 'absent' = 'unknown'
  private listeners = new Set<(connected: boolean) => void>()

  /** True when the WebSocket is open and ready. */
  isConnected(): boolean { return this._connected }

  /** Has the bridge been detected on this machine via HTTP probe? */
  detected(): 'unknown' | 'present' | 'absent' { return this._detected }

  /** Subscribe to connection-state changes. Returns an unsubscribe fn. */
  onStateChange(cb: (connected: boolean) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  /**
   * One-shot HTTP probe to check if the bridge is installed and running.
   * Faster than opening a WebSocket — used for the "install bridge" CTA.
   * Falls through to absent on any error.
   */
  async probe(): Promise<boolean> {
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS)
      const res = await fetch(HEALTH_URL, { signal: ctrl.signal })
      clearTimeout(timer)
      if (!res.ok) { this._detected = 'absent'; return false }
      const j = await res.json()
      const ok = j?.service === 'dctuning-bridge'
      this._detected = ok ? 'present' : 'absent'
      return ok
    } catch {
      this._detected = 'absent'
      return false
    }
  }

  /** Open the WebSocket. Auto-reconnects with exponential backoff on drop. */
  async connect(): Promise<boolean> {
    if (this._connected || this.ws) return this._connected

    return new Promise<boolean>((resolve) => {
      try {
        const ws = new WebSocket(BRIDGE_URL)
        this.ws = ws
        const openTimer = setTimeout(() => {
          if (!this._connected) {
            try { ws.close() } catch { /* ignore */ }
            resolve(false)
          }
        }, 3000)

        ws.onopen = () => {
          clearTimeout(openTimer)
          this._connected = true
          this._detected = 'present'
          this.listeners.forEach(cb => cb(true))
          resolve(true)
        }

        ws.onmessage = (ev) => this._handleMessage(ev.data)

        ws.onerror = () => { /* onclose will follow */ }

        ws.onclose = () => {
          clearTimeout(openTimer)
          this._connected = false
          this.ws = null
          this.listeners.forEach(cb => cb(false))
          // Reject any pending requests
          for (const [, p] of this.pending) {
            clearTimeout(p.timer)
            p.reject(new Error('Bridge connection closed'))
          }
          this.pending.clear()
          resolve(false)
        }
      } catch {
        this._connected = false
        this.ws = null
        resolve(false)
      }
    })
  }

  disconnect(): void {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null }
    if (this.ws) {
      try { this.ws.close() } catch { /* ignore */ }
      this.ws = null
    }
    this._connected = false
  }

  private _handleMessage(raw: string): void {
    let msg: { id?: string; ok?: boolean; data?: unknown; error?: string; event?: string }
    try {
      msg = JSON.parse(raw)
    } catch {
      console.warn('[bridge] received non-JSON:', raw.slice(0, 80))
      return
    }
    if (msg.event) {
      // Push event — reserved for future progress streaming. No-op for now.
      return
    }
    if (!msg.id) return
    const pending = this.pending.get(msg.id)
    if (!pending) return  // late response after timeout
    this.pending.delete(msg.id)
    clearTimeout(pending.timer)
    if (msg.ok) {
      pending.resolve(msg.data)
    } else {
      pending.reject(new Error(msg.error || 'Bridge error'))
    }
  }

  /**
   * Send a request to the bridge and await the response. Throws on timeout
   * or when the WS is closed.
   */
  async request<T = unknown>(action: string, params?: Record<string, unknown>): Promise<T> {
    if (!this._connected || !this.ws) {
      // Try to (re)connect
      const ok = await this.connect()
      if (!ok) throw new Error('Bridge is not running. Install DCTuning Bridge to use J2534 features in the browser.')
    }
    const id = `req-${this.nextId++}`
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Bridge request timeout: ${action}`))
      }, REQUEST_TIMEOUT_MS)
      this.pending.set(id, {
        resolve: resolve as Resolver,
        reject,
        timer,
      })
      this.ws!.send(JSON.stringify({ id, action, params }))
    })
  }

  // ── Convenience methods mirroring window.api.j2534XXX ────────────────────
  ping() { return this.request('ping') }
  scanDevices() { return this.request<unknown[]>('scan-devices') }
  j2534Open(dllPath: string) { return this.request<{ ok: boolean; deviceId?: number; info?: string; error?: string }>('j2534-open', { dllPath }) }
  j2534Close() { return this.request('j2534-close') }
  j2534IsOpen() { return this.request<{ ok: boolean }>('j2534-is-open') }
  j2534IsConnected() { return this.request<{ ok: boolean }>('j2534-is-connected') }
  j2534Connect(protocol: number, baud: number) { return this.request<{ ok: boolean; channelId?: number; error?: string }>('j2534-connect', { protocol, baud }) }
  j2534UDS(protocol: number, data: number[], timeout?: number) { return this.request<{ ok: boolean; hex?: string; bytes?: number[]; error?: string }>('j2534-uds', { protocol, data, timeout }) }
  j2534ReadDTCs(protocol = 6) { return this.request<{ ok: boolean; responses?: string[]; error?: string }>('j2534-read-dtcs', { protocol }) }
  j2534CalcKey(ecuId: string, seedHex: string, level = 1) {
    return this.request<{ ok: boolean; key?: number[]; error?: string }>('j2534-calc-key', { ecuId, seedHex, level })
  }
  j2534ClearDTCs(protocol = 6) { return this.request<{ ok: boolean; error?: string }>('j2534-clear-dtcs', { protocol }) }
  j2534ReadECUID() { return this.request<{ ok: boolean; id?: Record<string, unknown>; error?: string }>('j2534-read-ecu-id') }
  j2534ReadFlash(startAddr: number, totalLen: number, chunkSize?: number, protocol?: number) {
    return this.request<{ ok: boolean; data?: number[]; bytesRead?: number; error?: string }>(
      'j2534-read-flash',
      { startAddr, totalLen, chunkSize, protocol }
    )
  }
}

export const bridge = new BridgeClient()
export type { BridgeClient }
