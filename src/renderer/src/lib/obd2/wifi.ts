/**
 * WiFi OBD2 Adapter
 *
 * Connects to WiFi-based ELM327 OBD2 adapters (e.g. Vgate iCar Pro WiFi,
 * OBDLink MX+ WiFi). These adapters create their own WiFi access point
 * (usually 192.168.0.10:35000 or 192.168.4.1:35000) that the laptop or
 * phone must join before connecting.
 *
 * Browser implementation strategy:
 *   1. Electron main process: native TCP via window.electron.tcpSocket IPC.
 *      Best path for the desktop app.
 *   2. Webapp / mobile: requires the local bridge daemon to relay TCP via
 *      WebSocket. Will be added to bridgeClient in a follow-up. For now,
 *      isAvailable() returns false in pure browser contexts.
 */

import type {
  OBD2Adapter, ConnectResult, DTCResult, LiveData, ConnectOptions, TransportKind,
} from './types'

const LIVE_PIDS: Array<{ pid: string; name: string; unit: string; decode: (b: number[]) => number }> = [
  { pid: '010C', name: 'Engine RPM',        unit: 'rpm',  decode: ([a, b]) => ((a * 256 + b) / 4) },
  { pid: '010D', name: 'Vehicle Speed',     unit: 'km/h', decode: ([a]) => a },
  { pid: '0105', name: 'Coolant Temp',      unit: '°C',   decode: ([a]) => a - 40 },
  { pid: '010F', name: 'Intake Air Temp',   unit: '°C',   decode: ([a]) => a - 40 },
  { pid: '0104', name: 'Engine Load',       unit: '%',    decode: ([a]) => Math.round(a * 100 / 255) },
  { pid: '0111', name: 'Throttle Position', unit: '%',    decode: ([a]) => Math.round(a * 100 / 255) },
  { pid: '010B', name: 'Intake MAP',        unit: 'kPa',  decode: ([a]) => a },
  { pid: '0110', name: 'MAF Air Flow',      unit: 'g/s',  decode: ([a, b]) => parseFloat(((a * 256 + b) / 100).toFixed(2)) },
  { pid: '012F', name: 'Fuel Level',        unit: '%',    decode: ([a]) => Math.round(a * 100 / 255) },
  { pid: '0142', name: 'Control Voltage',   unit: 'V',    decode: ([a, b]) => parseFloat(((a * 256 + b) / 1000).toFixed(2)) },
]

function parseDTCBytes(b1: number, b2: number): string | null {
  if (b1 === 0 && b2 === 0) return null
  const prefix = ['P', 'C', 'B', 'U'][(b1 >> 6) & 0x03]
  const d1 = (b1 >> 4) & 0x03
  const d2 = b1 & 0x0f
  const d3 = (b2 >> 4) & 0x0f
  const d4 = b2 & 0x0f
  return `${prefix}${d1}${d2.toString(16).toUpperCase()}${d3.toString(16).toUpperCase()}${d4.toString(16).toUpperCase()}`
}

// Electron IPC bridge (set by preload.ts in a follow-up if not present)
interface ElectronTcp {
  open: (host: string, port: number) => Promise<{ id: string; ok: boolean; error?: string }>
  write: (id: string, data: string) => Promise<{ ok: boolean; error?: string }>
  onData: (id: string, cb: (data: string) => void) => () => void
  close: (id: string) => Promise<void>
}

function getElectronTcp(): ElectronTcp | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { electron?: { tcp?: ElectronTcp } }
  return w.electron?.tcp ?? null
}

class WiFiOBD2Adapter implements OBD2Adapter {
  readonly kind: TransportKind = 'wifi'
  private socketId: string | null = null
  private offData: (() => void) | null = null
  private listeners = new Set<(c: boolean) => void>()
  private rxBuffer = ''
  private resolveResponse: ((data: string) => void) | null = null
  private responseTimer: ReturnType<typeof setTimeout> | null = null
  private _info = ''
  private _portLabel = ''

  isAvailable(): boolean {
    return getElectronTcp() !== null
  }

  isConnected(): boolean {
    return this.socketId !== null
  }

  onStateChange(cb: (connected: boolean) => void): () => void {
    this.listeners.add(cb)
    return () => { this.listeners.delete(cb) }
  }

  private emit(connected: boolean): void {
    this.listeners.forEach(cb => { try { cb(connected) } catch { /* ignore */ } })
  }

  getInfo(): string { return this._info }
  getPortLabel(): string { return this._portLabel }

  async connect(opts?: ConnectOptions): Promise<ConnectResult> {
    const tcp = getElectronTcp()
    if (!tcp) {
      return {
        ok: false,
        error: 'WiFi OBD2 requires the Electron desktop app or local bridge. Use Web Bluetooth or Web Serial in the browser instead.',
      }
    }

    const hostPort = (opts?.wifiHost ?? '192.168.0.10:35000').split(':')
    const host = hostPort[0]
    const port = parseInt(hostPort[1] || '35000', 10)

    try {
      const r = await tcp.open(host, port)
      if (!r.ok) return { ok: false, error: r.error || 'TCP connect failed' }
      this.socketId = r.id
      this._portLabel = `${host}:${port}`

      this.offData = tcp.onData(this.socketId, (chunk) => {
        this.rxBuffer += chunk
        if (this.rxBuffer.includes('>')) {
          const data = this.rxBuffer.replace(/>/g, '').trim()
          this.rxBuffer = ''
          if (this.resolveResponse) {
            const resolve = this.resolveResponse
            this.resolveResponse = null
            if (this.responseTimer) clearTimeout(this.responseTimer)
            resolve(data)
          }
        }
      })

      // ELM327 init sequence
      await this.send('ATZ')
      await new Promise(rs => setTimeout(rs, 800))
      await this.send('ATE0')
      await this.send('ATL0')
      await this.send('ATS0')
      await this.send('ATH1')
      await this.send('ATSP0')
      const v = await this.send('ATI')
      this._info = v.trim()

      this.emit(true)
      return { ok: true, info: this._info, portLabel: this._portLabel }
    } catch (e) {
      this.socketId = null
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  async disconnect(): Promise<void> {
    const tcp = getElectronTcp()
    if (this.offData) { try { this.offData() } catch { /* ignore */ } this.offData = null }
    if (tcp && this.socketId) { try { await tcp.close(this.socketId) } catch { /* ignore */ } }
    this.socketId = null
    this.emit(false)
  }

  private async send(cmd: string, timeoutMs = 2000): Promise<string> {
    const tcp = getElectronTcp()
    if (!tcp || !this.socketId) throw new Error('Not connected')
    return new Promise<string>((resolve, reject) => {
      this.resolveResponse = resolve
      this.responseTimer = setTimeout(() => {
        this.resolveResponse = null
        reject(new Error(`Timeout waiting for: ${cmd}`))
      }, timeoutMs)
      tcp.write(this.socketId!, cmd + '\r').then(r => {
        if (!r.ok) {
          this.resolveResponse = null
          if (this.responseTimer) clearTimeout(this.responseTimer)
          reject(new Error(r.error || 'Write failed'))
        }
      }).catch(err => {
        this.resolveResponse = null
        if (this.responseTimer) clearTimeout(this.responseTimer)
        reject(err)
      })
    })
  }

  async readVoltage(): Promise<number | null> {
    try {
      const r = await this.send('ATRV')
      const m = r.match(/(\d+\.?\d*)\s*V/i)
      return m ? parseFloat(m[1]) : null
    } catch { return null }
  }

  async readDTCs(): Promise<DTCResult> {
    try {
      const r = await this.send('03', 4000)
      const clean = r.replace(/\s+/g, '').toUpperCase()
      const idx = clean.indexOf('43')
      if (idx < 0) return { ok: true, codes: [] }
      const data = clean.slice(idx + 4)
      const codes: string[] = []
      for (let i = 0; i + 4 <= data.length; i += 4) {
        const b1 = parseInt(data.slice(i, i + 2), 16)
        const b2 = parseInt(data.slice(i + 2, i + 4), 16)
        const c = parseDTCBytes(b1, b2)
        if (c) codes.push(c)
      }
      return { ok: true, codes }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  async clearDTCs(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.send('04', 3000)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  async readPID(pidCmd: string): Promise<number[] | null> {
    try {
      const r = await this.send(pidCmd)
      const clean = r.replace(/\s+/g, '').toUpperCase()
      const expectMarker = '4' + pidCmd.charAt(1) + pidCmd.slice(2, 4)
      const idx = clean.indexOf(expectMarker)
      if (idx < 0) return null
      const data = clean.slice(idx + 4)
      const bytes: number[] = []
      for (let i = 0; i + 2 <= data.length; i += 2) {
        bytes.push(parseInt(data.slice(i, i + 2), 16))
      }
      return bytes
    } catch { return null }
  }

  async readAllLivePIDs(): Promise<Record<string, LiveData>> {
    const out: Record<string, LiveData> = {}
    const now = Date.now()
    for (const def of LIVE_PIDS) {
      const bytes = await this.readPID(def.pid)
      if (bytes && bytes.length > 0) {
        try {
          out[def.pid] = {
            pid: def.pid,
            name: def.name,
            value: def.decode(bytes),
            unit: def.unit,
            timestamp: now,
          }
        } catch { /* skip bad decode */ }
      }
    }
    return out
  }
}

export const wifiAdapter = new WiFiOBD2Adapter()
