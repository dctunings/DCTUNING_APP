/**
 * Web Bluetooth OBD2 Adapter
 *
 * Connects to BLE-based ELM327 OBD2 adapters (e.g. Vgate iCar Pro BLE 4.0,
 * HM-10 / HM-11 modules) using the Web Bluetooth API.
 *
 * Note: Classic Bluetooth SPP ELM327 dongles are NOT supported — only BLE.
 * Many cheap dongles labelled "Bluetooth" are Classic SPP and won't work.
 *
 * Supported on:
 *   - Chrome / Edge on Windows / Mac / Android
 *   - NOT on iOS Safari (Apple blocks Web Bluetooth)
 */

import type {
  OBD2Adapter, ConnectResult, DTCResult, LiveData, ConnectOptions, TransportKind,
} from './types'

// Common ELM327 BLE service/characteristic UUIDs
const HM10_SERVICE = 0xffe0
const HM10_CHAR = 0xffe1
const NUS_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e'
const NUS_RX = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'  // write
const NUS_TX = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'  // notify

const LIVE_PIDS: Array<{
  pid: string
  name: string
  unit: string
  decode: (b: number[]) => number
}> = [
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

class WebBluetoothOBD2Adapter implements OBD2Adapter {
  readonly kind: TransportKind = 'webbluetooth'
  private device: BluetoothDevice | null = null
  private writeChar: BluetoothRemoteGATTCharacteristic | null = null
  private notifyChar: BluetoothRemoteGATTCharacteristic | null = null
  private listeners = new Set<(c: boolean) => void>()
  private rxBuffer = ''
  private resolveResponse: ((data: string) => void) | null = null
  private responseTimer: ReturnType<typeof setTimeout> | null = null
  private _info = ''
  private _portLabel = ''
  private encoder = new TextEncoder()

  isAvailable(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator
  }

  isConnected(): boolean {
    return this.device !== null && this.writeChar !== null
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

  async connect(_opts?: ConnectOptions): Promise<ConnectResult> {
    try {
      if (!this.isAvailable()) {
        return { ok: false, error: 'Web Bluetooth not supported. Use Chrome on Windows/Mac/Android.' }
      }

      const bt = (navigator as { bluetooth: { requestDevice: (opts: unknown) => Promise<BluetoothDevice> } }).bluetooth
      this.device = await bt.requestDevice({
        filters: [
          { services: [HM10_SERVICE] },
          { services: [NUS_SERVICE] },
          { namePrefix: 'OBDII' },
          { namePrefix: 'OBD' },
          { namePrefix: 'Vgate' },
          { namePrefix: 'iCar' },
        ],
        optionalServices: [HM10_SERVICE, NUS_SERVICE],
      })

      if (!this.device) return { ok: false, error: 'No device selected.' }
      this._portLabel = this.device.name || 'BLE OBD2'

      this.device.addEventListener('gattserverdisconnected', () => {
        this.writeChar = null
        this.notifyChar = null
        this.emit(false)
      })

      const server = await this.device.gatt!.connect()

      // Try HM-10 first, fall back to NUS
      let writeChar: BluetoothRemoteGATTCharacteristic | null = null
      let notifyChar: BluetoothRemoteGATTCharacteristic | null = null
      try {
        const svc = await server.getPrimaryService(HM10_SERVICE)
        const ch = await svc.getCharacteristic(HM10_CHAR)
        writeChar = ch
        notifyChar = ch  // HM-10 uses same characteristic for write+notify
      } catch {
        const svc = await server.getPrimaryService(NUS_SERVICE)
        writeChar = await svc.getCharacteristic(NUS_RX)
        notifyChar = await svc.getCharacteristic(NUS_TX)
      }

      this.writeChar = writeChar
      this.notifyChar = notifyChar

      await notifyChar.startNotifications()
      notifyChar.addEventListener('characteristicvaluechanged', (ev) => {
        const target = ev.target as BluetoothRemoteGATTCharacteristic
        if (!target.value) return
        const decoder = new TextDecoder()
        const chunk = decoder.decode(target.value)
        this.rxBuffer += chunk
        if (this.rxBuffer.includes('>')) {
          const data = this.rxBuffer.replace(/>/g, '').trim()
          this.rxBuffer = ''
          if (this.resolveResponse) {
            const r = this.resolveResponse
            this.resolveResponse = null
            if (this.responseTimer) clearTimeout(this.responseTimer)
            r(data)
          }
        }
      })

      // ELM327 init sequence
      await this.send('ATZ')      // reset
      await new Promise(r => setTimeout(r, 800))
      await this.send('ATE0')     // echo off
      await this.send('ATL0')     // linefeeds off
      await this.send('ATS0')     // spaces off
      await this.send('ATH1')     // headers on (helps DTC parsing)
      await this.send('ATSP0')    // auto protocol
      const v = await this.send('ATI')
      this._info = v.trim()

      this.emit(true)
      return { ok: true, info: this._info, portLabel: this._portLabel }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.notifyChar) {
        try { await this.notifyChar.stopNotifications() } catch { /* ignore */ }
      }
      if (this.device?.gatt?.connected) this.device.gatt.disconnect()
    } catch { /* ignore */ }
    this.writeChar = null
    this.notifyChar = null
    this.device = null
    this.emit(false)
  }

  private async send(cmd: string, timeoutMs = 2000): Promise<string> {
    if (!this.writeChar) throw new Error('Not connected')
    const data = this.encoder.encode(cmd + '\r')
    return new Promise<string>((resolve, reject) => {
      this.resolveResponse = resolve
      this.responseTimer = setTimeout(() => {
        this.resolveResponse = null
        reject(new Error(`Timeout waiting for: ${cmd}`))
      }, timeoutMs)
      this.writeChar!.writeValue(data).catch(err => {
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
      // Strip header bytes; search for 43 marker (mode 03 response)
      const idx = clean.indexOf('43')
      if (idx < 0) return { ok: true, codes: [] }
      const data = clean.slice(idx + 4)  // after '43XX' byte count
      const codes: string[] = []
      for (let i = 0; i + 4 <= data.length; i += 4) {
        const b1 = parseInt(data.slice(i, i + 2), 16)
        const b2 = parseInt(data.slice(i + 2, i + 4), 16)
        const code = parseDTCBytes(b1, b2)
        if (code) codes.push(code)
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
      // Mode 01 response starts with 41XX (XX=PID)
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

export const webBluetoothAdapter = new WebBluetoothOBD2Adapter()
