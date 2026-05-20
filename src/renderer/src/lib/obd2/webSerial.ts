/**
 * Web Serial OBD2 Adapter
 *
 * Thin wrapper around the existing elm327WebSerial.ts singleton, exposing
 * the unified OBD2Adapter interface so it can be swapped with WiFi/Bluetooth
 * adapters interchangeably.
 */

import { elm327 } from '../elm327WebSerial'
import type { OBD2Adapter, ConnectResult, DTCResult, LiveData, ConnectOptions, TransportKind } from './types'

class WebSerialOBD2Adapter implements OBD2Adapter {
  readonly kind: TransportKind = 'webserial'
  private listeners = new Set<(c: boolean) => void>()
  private lastState = false

  isAvailable(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator
  }

  isConnected(): boolean {
    return elm327.isConnected()
  }

  onStateChange(cb: (connected: boolean) => void): () => void {
    this.listeners.add(cb)
    return () => { this.listeners.delete(cb) }
  }

  private emit(connected: boolean): void {
    if (this.lastState === connected) return
    this.lastState = connected
    this.listeners.forEach(cb => { try { cb(connected) } catch { /* ignore */ } })
  }

  async connect(opts?: ConnectOptions): Promise<ConnectResult> {
    const baudRate = opts?.baudRate ?? 38400
    const r = await elm327.connect(baudRate)
    if (r.ok) this.emit(true)
    return {
      ok: r.ok,
      error: r.error,
      info: r.info,
      portLabel: elm327.getPortLabel(),
    }
  }

  async disconnect(): Promise<void> {
    await elm327.disconnect()
    this.emit(false)
  }

  async readVoltage(): Promise<number | null> {
    return elm327.readVoltage()
  }

  async readDTCs(): Promise<DTCResult> {
    const r = await elm327.readDTCs()
    return {
      ok: !r.error,
      codes: r.codes,
      error: r.error,
    }
  }

  async clearDTCs(): Promise<{ ok: boolean; error?: string }> {
    try {
      const result = await (elm327 as unknown as { clearDTCs?: () => Promise<unknown> }).clearDTCs?.()
      if (result === undefined) return { ok: false, error: 'clearDTCs not supported by adapter' }
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  async readAllLivePIDs(): Promise<Record<string, LiveData>> {
    const raw = await elm327.readAllLivePIDs()
    const out: Record<string, LiveData> = {}
    const now = Date.now()
    for (const [pid, data] of Object.entries(raw)) {
      out[pid] = {
        pid,
        name: data.name,
        value: data.value,
        unit: data.unit,
        timestamp: now,
      }
    }
    return out
  }

  async readPID(pidCmd: string): Promise<number[] | null> {
    return elm327.readPID(pidCmd)
  }

  getInfo(): string {
    return elm327.getInfo()
  }

  getPortLabel(): string {
    return elm327.getPortLabel()
  }
}

export const webSerialAdapter = new WebSerialOBD2Adapter()
