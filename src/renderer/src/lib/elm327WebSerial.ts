/**
 * elm327WebSerial.ts
 * Web Serial API driver for ELM327-based OBD2 adapters.
 * Works in Chrome/Edge/Brave without Electron — direct browser <-> USB serial.
 *
 * Usage:
 *   import { elm327 } from './elm327WebSerial'
 *   await elm327.connect()
 *   const v = await elm327.readVoltage()
 */

export interface OBD2LiveData {
  name: string
  value: number
  unit: string
}

export interface DTCResult {
  codes: string[]
  raw: string
  error?: string
}

export interface ConnectResult {
  ok: boolean
  info?: string
  error?: string
}

// ── DTC byte-pair → code string ───────────────────────────────────────────────
// Each DTC is encoded as 2 bytes:
// Byte1 high nibble: 0=P, 1=C, 2=B, 3=U
// Byte1 low nibble + Byte2 = remaining 3 digits
function parseDTCBytes(b1: number, b2: number): string | null {
  if (b1 === 0 && b2 === 0) return null  // empty slot
  const prefix = ['P', 'C', 'B', 'U'][(b1 >> 6) & 0x03]
  const digit1 = (b1 >> 4) & 0x03
  const digit2 = b1 & 0x0f
  const digit3 = (b2 >> 4) & 0x0f
  const digit4 = b2 & 0x0f
  return `${prefix}${digit1}${digit2.toString(16).toUpperCase()}${digit3.toString(16).toUpperCase()}${digit4.toString(16).toUpperCase()}`
}

// ── OBD2 mode 01 PID definitions ─────────────────────────────────────────────
const LIVE_PIDS: Array<{
  pid: string
  name: string
  unit: string
  decode: (bytes: number[]) => number
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
  { pid: '0133', name: 'Barometric Pres.',  unit: 'kPa',  decode: ([a]) => a },
  { pid: '015C', name: 'Oil Temperature',   unit: '°C',   decode: ([a]) => a - 40 },
  { pid: '0142', name: 'Control Voltage',   unit: 'V',    decode: ([a, b]) => parseFloat(((a * 256 + b) / 1000).toFixed(2)) },
]

// ── ELM327 class ─────────────────────────────────────────────────────────────

class ELM327 {
  private port: SerialPort | null = null
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null
  private _info = ''
  private _portLabel = ''

  isConnected(): boolean {
    return this.port !== null && this.writer !== null
  }

  getInfo(): string { return this._info }
  getPortLabel(): string { return this._portLabel }

  /** Ask user to select a serial port and initialise the ELM327. */
  async connect(baudRate = 38400): Promise<ConnectResult> {
    try {
      if (!('serial' in navigator)) {
        return { ok: false, error: 'Web Serial API not supported. Use Chrome, Edge, or Brave.' }
      }

      // Prompt user to pick a port (browser security requirement)
      this.port = await (navigator as any).serial.requestPort()
      if (!this.port) return { ok: false, error: 'No port selected.' }

      await this.port.open({ baudRate })

      this.writer = this.port.writable!.getWriter()
      this.reader = this.port.readable!.getReader()

      // Init ELM327
      await this._send('ATZ')       // reset — wait up to 2s
      await this._readUntilPrompt(2000)

      await this._cmd('ATE0')       // echo off
      await this._cmd('ATL0')       // linefeeds off
      await this._cmd('ATH0')       // headers off
      await this._cmd('ATS0')       // spaces off
      await this._cmd('ATSP0')      // auto-detect protocol

      // Get device description
      const ati = await this._cmd('ATI', 1000)
      this._info = ati.trim() || 'ELM327'

      // Get battery voltage
      const atrv = await this._cmd('ATRV', 1000)
      const vMatch = atrv.match(/(\d+\.\d+)V/i)
      if (vMatch) this._info += ` | Battery: ${vMatch[1]}V`

      // Guess port label from port info
      try {
        const info = await (this.port as any).getInfo()
        if (info.usbVendorId) {
          this._portLabel = `USB (VID:${info.usbVendorId.toString(16).toUpperCase()})`
        }
      } catch { this._portLabel = 'Web Serial Port' }

      return { ok: true, info: this._info }
    } catch (err: unknown) {
      await this._cleanup()
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('No port selected') || msg.includes('cancelled')) {
        return { ok: false, error: 'Port selection cancelled.' }
      }
      return { ok: false, error: msg }
    }
  }

  /** Close the serial port. */
  async disconnect(): Promise<void> {
    await this._cleanup()
  }

  // ── High-level OBD2 commands ────────────────────────────────────────────────

  /** Read battery voltage via ATRV. Returns number (e.g. 12.4) or null. */
  async readVoltage(): Promise<number | null> {
    try {
      const resp = await this._cmd('ATRV', 1000)
      const m = resp.match(/(\d+\.\d+)/)
      return m ? parseFloat(m[1]) : null
    } catch { return null }
  }

  /** Read stored DTCs (mode 03). */
  async readDTCs(): Promise<DTCResult> {
    try {
      const raw = await this._cmd('03', 2000)
      if (!raw || raw.includes('NO DATA') || raw.includes('UNABLE')) {
        return { codes: [], raw, error: raw.includes('NO DATA') ? 'No faults stored' : undefined }
      }
      const codes: string[] = []
      // Response lines like: 43 01 43 00 00 00 00
      const lines = raw.split(/[\r\n]+/).filter(l => /^43/i.test(l.trim()))
      for (const line of lines) {
        const hex = line.trim().replace(/\s+/g, '')
        // skip leading "43"
        for (let i = 2; i + 3 < hex.length; i += 4) {
          const b1 = parseInt(hex.slice(i, i + 2), 16)
          const b2 = parseInt(hex.slice(i + 2, i + 4), 16)
          const code = parseDTCBytes(b1, b2)
          if (code) codes.push(code)
        }
      }
      return { codes, raw }
    } catch (err: unknown) {
      return { codes: [], raw: '', error: err instanceof Error ? err.message : 'Read failed' }
    }
  }

  /** Clear DTCs (mode 04). */
  async clearDTCs(): Promise<{ ok: boolean; error?: string }> {
    try {
      const resp = await this._cmd('04', 3000)
      return { ok: resp.includes('44') || resp.trim() !== '' }
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : 'Clear failed' }
    }
  }

  /** Read a single OBD2 mode-01 PID. Returns data bytes as hex string or null. */
  async readPID(pidCmd: string): Promise<number[] | null> {
    try {
      const resp = await this._cmd(pidCmd, 1000)
      if (!resp || resp.includes('NO DATA') || resp.includes('?')) return null
      const modeCode = '4' + pidCmd[1]
      const pidByte = pidCmd.slice(2)
      const pattern = new RegExp(modeCode + pidByte + '([0-9A-Fa-f]+)', 'i')
      const m = resp.replace(/\s+/g, '').match(pattern)
      if (!m) return null
      const bytes: number[] = []
      for (let i = 0; i < m[1].length; i += 2) {
        bytes.push(parseInt(m[1].slice(i, i + 2), 16))
      }
      return bytes
    } catch { return null }
  }

  /** Read all supported live PIDs. Returns a map of pid → { name, value, unit }. */
  async readAllLivePIDs(): Promise<Record<string, OBD2LiveData>> {
    const result: Record<string, OBD2LiveData> = {}
    for (const def of LIVE_PIDS) {
      try {
        const bytes = await this.readPID(def.pid)
        if (bytes && bytes.length > 0) {
          result[def.pid] = {
            name: def.name,
            value: def.decode(bytes),
            unit: def.unit,
          }
        }
      } catch { /* skip unsupported PID */ }
    }
    return result
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  private async _cmd(cmd: string, timeout = 1500): Promise<string> {
    await this._send(cmd)
    return this._readUntilPrompt(timeout)
  }

  private async _send(cmd: string): Promise<void> {
    if (!this.writer) throw new Error('Not connected')
    const enc = new TextEncoder()
    await this.writer.write(enc.encode(cmd + '\r'))
  }

  private async _readUntilPrompt(timeout = 1500): Promise<string> {
    if (!this.reader) throw new Error('Not connected')
    const dec = new TextDecoder()
    let buf = ''
    const deadline = Date.now() + timeout

    while (Date.now() < deadline) {
      const timeLeft = deadline - Date.now()
      if (timeLeft <= 0) break

      const timer = new Promise<{ done: true; value?: never }>(res =>
        setTimeout(() => res({ done: true }), timeLeft)
      )
      const read = this.reader.read()
      const result = await Promise.race([read, timer])

      if ((result as any).done && !(result as any).value) break
      const chunk = dec.decode((result as ReadableStreamReadResult<Uint8Array>).value, { stream: true })
      buf += chunk
      if (buf.includes('>')) {
        buf = buf.replace('>', '').trim()
        break
      }
    }
    return buf.trim()
  }

  private async _cleanup(): Promise<void> {
    try { this.reader?.releaseLock() } catch { /* ignore */ }
    try { this.writer?.releaseLock() } catch { /* ignore */ }
    try { await this.port?.close() } catch { /* ignore */ }
    this.reader = null
    this.writer = null
    this.port = null
    this._info = ''
    this._portLabel = ''
  }
}

// ── Singleton export ──────────────────────────────────────────────────────────
export const elm327 = new ELM327()
