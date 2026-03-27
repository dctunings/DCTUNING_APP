import { SerialPort } from 'serialport'
import { execSync } from 'child_process'

// ─── ELM327 OBD2 Manager ────────────────────────────────────────────────────

let activePort: SerialPort | null = null
let activePortPath = ''
let buffer = ''

function sendCommand(port: SerialPort, cmd: string, timeoutMs = 2000): Promise<string> {
  return new Promise((resolve, reject) => {
    buffer = ''
    const timer = setTimeout(() => {
      resolve(buffer.trim())
    }, timeoutMs)

    const onData = (data: Buffer) => {
      buffer += data.toString()
      if (buffer.includes('>')) {
        clearTimeout(timer)
        port.removeListener('data', onData)
        resolve(buffer.replace('>', '').trim())
      }
    }

    port.on('data', onData)
    port.write(cmd + '\r')
  })
}

export async function obdConnect(portPath: string): Promise<{ ok: boolean; info: string; error?: string }> {
  try {
    if (activePort?.isOpen) {
      activePort.close()
      activePort = null
    }

    const port = new SerialPort({ path: portPath, baudRate: 38400, autoOpen: false })

    await new Promise<void>((res, rej) => {
      port.open((err) => err ? rej(err) : res())
    })

    // Wait for initial prompt
    await new Promise((r) => setTimeout(r, 500))

    // ELM327 initialisation sequence
    await sendCommand(port, 'ATZ', 2000)       // Reset
    await new Promise((r) => setTimeout(r, 500))
    await sendCommand(port, 'ATE0')             // Echo off
    await sendCommand(port, 'ATL0')             // Linefeeds off
    await sendCommand(port, 'ATS0')             // Spaces off
    await sendCommand(port, 'ATH1')             // Headers on
    await sendCommand(port, 'ATSP0')            // Auto protocol

    const versionRaw = await sendCommand(port, 'ATI')
    const voltsRaw   = await sendCommand(port, 'ATRV')

    activePort = port
    activePortPath = portPath

    return {
      ok:   true,
      info: `${versionRaw} | Battery: ${voltsRaw}`,
    }
  } catch (e: any) {
    return { ok: false, info: '', error: e.message }
  }
}

export function obdDisconnect(): void {
  if (activePort?.isOpen) {
    activePort.close()
  }
  activePort = null
  activePortPath = ''
}

export function obdIsConnected(): boolean {
  return !!(activePort?.isOpen)
}

export async function obdReadVoltage(): Promise<number | null> {
  if (!activePort?.isOpen) return null
  try {
    const raw = await sendCommand(activePort, 'ATRV')
    const match = raw.match(/([\d.]+)\s*V/i)
    return match ? parseFloat(match[1]) : null
  } catch { return null }
}

// ─── DTC parsing ────────────────────────────────────────────────────────────

const DTC_PREFIXES = ['P', 'C', 'B', 'U']

function parseDTCHex(hex: string): string[] {
  const codes: string[] = []
  const clean = hex.replace(/\s+/g, '').replace(/^43/, '') // strip mode 03 response byte
  for (let i = 0; i < clean.length; i += 4) {
    const word = clean.substring(i, i + 4)
    if (word === '0000' || word.length < 4) continue
    const byte1 = parseInt(word.substring(0, 2), 16)
    const byte2 = parseInt(word.substring(2, 4), 16)
    const prefixIdx = (byte1 >> 6) & 0x03
    const digit1 = (byte1 >> 4) & 0x03
    const digit2 = byte1 & 0x0F
    const digit3 = (byte2 >> 4) & 0x0F
    const digit4 = byte2 & 0x0F
    codes.push(`${DTC_PREFIXES[prefixIdx]}${digit1}${digit2.toString(16).toUpperCase()}${digit3.toString(16).toUpperCase()}${digit4.toString(16).toUpperCase()}`)
  }
  return codes
}

export async function obdReadDTCs(): Promise<{ codes: string[]; raw: string; error?: string }> {
  if (!activePort?.isOpen) return { codes: [], raw: '', error: 'Not connected' }
  try {
    const raw = await sendCommand(activePort, '03', 3000)
    const codes = parseDTCHex(raw)
    return { codes, raw }
  } catch (e: any) {
    return { codes: [], raw: '', error: e.message }
  }
}

export async function obdClearDTCs(): Promise<{ ok: boolean; error?: string }> {
  if (!activePort?.isOpen) return { ok: false, error: 'Not connected' }
  try {
    const raw = await sendCommand(activePort, '04', 3000)
    return { ok: raw.includes('44') || raw.toLowerCase().includes('ok') }
  } catch (e: any) {
    return { ok: false, error: e.message }
  }
}

// ─── Live data PIDs ──────────────────────────────────────────────────────────

export const LIVE_PIDS: Record<string, { name: string; unit: string; parse: (bytes: number[]) => number }> = {
  '010C': { name: 'Engine RPM',        unit: 'RPM',  parse: ([a, b]) => ((a * 256 + b) / 4) },
  '010D': { name: 'Vehicle Speed',     unit: 'km/h', parse: ([a]) => a },
  '0105': { name: 'Coolant Temp',      unit: '°C',   parse: ([a]) => a - 40 },
  '010F': { name: 'Intake Air Temp',   unit: '°C',   parse: ([a]) => a - 40 },
  '0104': { name: 'Engine Load',       unit: '%',    parse: ([a]) => Math.round(a * 100 / 255) },
  '010B': { name: 'Intake MAP',        unit: 'kPa',  parse: ([a]) => a },
  '0111': { name: 'Throttle Position', unit: '%',    parse: ([a]) => Math.round(a * 100 / 255) },
  '012F': { name: 'Fuel Level',        unit: '%',    parse: ([a]) => Math.round(a * 100 / 255) },
  '0142': { name: 'Battery Voltage',   unit: 'V',    parse: ([a, b]) => ((a * 256 + b) / 1000) },
  '015C': { name: 'Oil Temp',          unit: '°C',   parse: ([a]) => a - 40 },
}

export async function obdReadPID(pid: string): Promise<{ value: number; unit: string; name: string } | null> {
  if (!activePort?.isOpen) return null
  const pidDef = LIVE_PIDS[pid]
  if (!pidDef) return null
  try {
    const raw = await sendCommand(activePort, pid)
    // Response format: "41 0C 1A F8" (mode 0x41 = response to 0x01, PID, then data bytes)
    const hex = raw.replace(/\s+/g, '')
    const responseMode = hex.substring(0, 2)
    if (responseMode !== '41') return null
    const dataHex = hex.substring(4) // skip mode byte + PID byte
    const bytes: number[] = []
    for (let i = 0; i < dataHex.length; i += 2) {
      bytes.push(parseInt(dataHex.substring(i, i + 2), 16))
    }
    return { value: pidDef.parse(bytes), unit: pidDef.unit, name: pidDef.name }
  } catch { return null }
}

export async function obdReadAllLivePIDs(): Promise<Record<string, { value: number; unit: string; name: string }>> {
  const results: Record<string, { value: number; unit: string; name: string }> = {}
  for (const pid of Object.keys(LIVE_PIDS)) {
    const r = await obdReadPID(pid)
    if (r) results[pid] = r
  }
  return results
}

// ─── J2534 DLL scanner (Windows registry) ───────────────────────────────────

export interface J2534Device {
  name: string
  dll: string
  vendor: string
}

export function scanJ2534Devices(): J2534Device[] {
  const devices: J2534Device[] = []
  if (process.platform !== 'win32') return devices

  const regPaths = [
    'HKLM\\SOFTWARE\\PassThruSupport.04.04',
    'HKLM\\SOFTWARE\\WOW6432Node\\PassThruSupport.04.04',
  ]

  for (const regPath of regPaths) {
    try {
      const output = execSync(`reg query "${regPath}" /s`, { encoding: 'utf8', timeout: 5000 })
      const lines = output.split('\n')
      let currentDevice = ''
      let currentDll = ''
      let currentVendor = ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.startsWith(regPath)) {
          if (currentDevice && currentDll) {
            devices.push({ name: currentDevice, dll: currentDll, vendor: currentVendor })
          }
          currentDevice = trimmed.split('\\').pop() || ''
          currentDll = ''
          currentVendor = ''
        } else if (trimmed.includes('FunctionLibrary')) {
          currentDll = trimmed.split(/\s+/).pop() || ''
        } else if (trimmed.includes('Vendor')) {
          currentVendor = trimmed.split(/\s{2,}/).pop() || ''
        }
      }
      if (currentDevice && currentDll) {
        devices.push({ name: currentDevice, dll: currentDll, vendor: currentVendor })
      }
    } catch {
      // Registry path not found — no J2534 devices installed
    }
  }

  return devices
}
