/**
 * j2534-driver.ts — Bridge to the J2534 helper executable
 *
 * Spawns dctuning-desktop/resources/j2534helper.exe (a compiled 32-bit binary
 * that loads the J2534 DLL via PInvoke). Communicates via JSON-per-line on
 * stdin/stdout. Same protocol the desktop app's main process uses.
 *
 * Architecture:
 *   bridge-server.ts (WebSocket router)
 *     ↓ async function calls
 *   j2534-driver.ts (this file)
 *     ↓ stdin/stdout JSON lines
 *   j2534helper.exe (32-bit native binary)
 *     ↓ PInvoke
 *   sm2j2534.dll (or any J2534 DLL)
 *     ↓ Windows IOCTL
 *   J2534 device (Scanmatik / Tactrix / etc.)
 *
 * The helper exe is reused unchanged from the desktop app — same Windows-side
 * protocol, just wrapped in a different parent (bridge service vs Electron).
 */

import { spawn, ChildProcess } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

interface BridgeState {
  deviceId: number
  channelId: number
  dllPath: string
  process: ChildProcess
  buffer: string
  stderrLog: string
  pendingResolves: Array<(line: string) => void>
}

let bridge: BridgeState | null = null

/**
 * Locate j2534helper.exe. Try (in order):
 *   1. Same directory as the running binary (production install)
 *   2. ../../resources/j2534helper.exe — bridge runs from bridge/dist/, helper
 *      lives in dctuning-desktop/resources/ (dev layout, bridge is sub-project)
 *   3. Older fallback paths
 */
function locateHelperExe(): string | null {
  const candidates = [
    path.join(path.dirname(process.execPath), 'j2534helper.exe'),
    path.join(__dirname, '..', '..', 'resources', 'j2534helper.exe'),
    path.join(__dirname, '..', 'resources', 'j2534helper.exe'),
    path.join(__dirname, '..', '..', '..', 'resources', 'j2534helper.exe'),
  ]
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c } catch { /* skip */ }
  }
  return null
}

function sendBridgeCommand(cmd: object, timeoutMs: number): Promise<string> {
  if (!bridge) return Promise.reject(new Error('Bridge not started'))
  const proc = bridge.process
  if (!proc.stdin || !proc.stdout) return Promise.reject(new Error('Bridge process has no stdio'))

  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      // Remove the resolver from the queue so a late response doesn't fire
      if (bridge) bridge.pendingResolves = bridge.pendingResolves.filter(r => r !== onLine)
      reject(new Error(`Helper command timeout after ${timeoutMs}ms (action=${(cmd as { action?: string }).action})`))
    }, timeoutMs)

    const onLine = (line: string) => {
      clearTimeout(timer)
      resolve(line)
    }

    bridge!.pendingResolves.push(onLine)
    proc.stdin!.write(JSON.stringify(cmd) + '\n')
  })
}

// ── Public API matching the j2534Manager.ts surface ────────────────────────

export interface OpenResult {
  ok: boolean
  deviceId?: number
  info?: string
  error?: string
}

export async function j2534Open(dllPath: string): Promise<OpenResult> {
  // Close any existing bridge before opening a new one
  await j2534Close()

  const helperExe = locateHelperExe()
  if (!helperExe) {
    return { ok: false, error: 'j2534helper.exe not found. Bridge install is incomplete — please re-run the installer.' }
  }
  if (!fs.existsSync(dllPath)) {
    return { ok: false, error: `J2534 DLL not found at ${dllPath}` }
  }

  try {
    const proc = spawn(helperExe, [dllPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })

    bridge = {
      deviceId: 0,
      channelId: 0,
      dllPath,
      process: proc,
      buffer: '',
      stderrLog: '',
      pendingResolves: [],
    }

    proc.stdout!.on('data', (chunk: Buffer) => {
      if (!bridge) return
      bridge.buffer += chunk.toString()
      const lines = bridge.buffer.split('\n')
      bridge.buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        const next = bridge.pendingResolves.shift()
        if (next) next(trimmed)
      }
    })

    proc.stderr!.on('data', (d: Buffer) => {
      const msg = d.toString()
      if (bridge) bridge.stderrLog += msg
      // Limit console spam — keep the first 500 chars per chunk
      console.error('[helper.stderr]', msg.slice(0, 500))
    })

    proc.on('exit', (code) => {
      if (bridge) {
        const stderr = bridge.stderrLog.slice(0, 400).replace(/\r?\n/g, ' | ')
        const errMsg = JSON.stringify({ ok: false, error: `Helper exited (code ${code})${stderr ? ': ' + stderr : ''}` })
        bridge.pendingResolves.forEach(r => r(errMsg))
        bridge = null
      }
    })

    // 25s allowance for Add-Type / DLL load + PassThruOpen
    const result = await sendBridgeCommand({ action: 'open' }, 25000)
    const parsed = JSON.parse(result)
    if (parsed.ok) {
      bridge.deviceId = parsed.deviceId
      return {
        ok: true,
        deviceId: parsed.deviceId,
        info: `FW ${parsed.fw || '?'} | DLL ${parsed.dllVer || '?'} | API ${parsed.api || '?'}`,
      }
    }
    await j2534Close()
    return { ok: false, error: parsed.error || 'PassThruOpen failed' }
  } catch (err) {
    await j2534Close()
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function j2534Close(): Promise<void> {
  if (!bridge) return
  try {
    if (bridge.process.stdin && !bridge.process.stdin.destroyed) {
      await sendBridgeCommand({ action: 'close' }, 3000).catch(() => null)
    }
  } catch { /* ignore */ }
  try { bridge.process.kill() } catch { /* ignore */ }
  bridge = null
}

export function j2534IsOpen(): boolean {
  return bridge !== null && bridge.deviceId > 0
}

export function j2534IsConnected(): boolean {
  return bridge !== null && bridge.channelId > 0
}

export async function j2534Connect(protocol: number, baudRate: number): Promise<{ ok: boolean; channelId?: number; error?: string }> {
  if (!bridge) return { ok: false, error: 'Device not opened' }
  try {
    const result = await sendBridgeCommand({ action: 'connect', protocol, baud: baudRate }, 8000)
    const parsed = JSON.parse(result)
    if (parsed.ok) {
      bridge.channelId = parsed.channelId
      return { ok: true, channelId: parsed.channelId }
    }
    return { ok: false, error: parsed.error }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function j2534SendOBD2(
  protocol: number,
  dataBytes: number[],
  timeout = 2000
): Promise<{ ok: boolean; responses?: string[]; error?: string }> {
  if (!bridge) return { ok: false, error: 'Not connected' }
  try {
    const result = await sendBridgeCommand({ action: 'sendobd2', protocol, data: dataBytes, timeout }, timeout + 2000)
    return JSON.parse(result)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function j2534UDS(
  protocol: number,
  udsBytes: number[],
  timeout = 3000
): Promise<{ ok: boolean; hex?: string; bytes?: number[]; error?: string }> {
  if (!bridge) return { ok: false, error: 'Not connected' }
  try {
    const result = await sendBridgeCommand({ action: 'uds', protocol, data: udsBytes, timeout }, timeout + 2000)
    return JSON.parse(result)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function j2534ReadMem(
  protocol: number,
  address: number,
  length: number
): Promise<{ ok: boolean; hex?: string; count?: number; error?: string }> {
  if (!bridge) return { ok: false, error: 'Not connected' }
  try {
    const result = await sendBridgeCommand({ action: 'readmem', protocol, address, length }, 7000)
    return JSON.parse(result)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function j2534Ping(): Promise<{ ok: boolean; pong?: boolean }> {
  if (!bridge) return { ok: false }
  try {
    const result = await sendBridgeCommand({ action: 'ping' }, 1000)
    return JSON.parse(result)
  } catch {
    return { ok: false }
  }
}

export function getHelperPath(): string | null {
  return locateHelperExe()
}
