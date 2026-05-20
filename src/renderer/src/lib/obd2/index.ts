/**
 * Unified OBD2 Connection Layer
 *
 * Single entry point for OBD2 telemetry across all transports:
 *   - Web Serial (USB ELM327 on desktop)
 *   - Web Bluetooth (BLE ELM327 on desktop + Android)
 *   - WiFi TCP (Electron desktop app)
 *
 * Usage:
 *   import { obd2 } from './lib/obd2'
 *
 *   const transports = obd2.availableTransports()  // list selectable transports
 *   obd2.setTransport('webbluetooth')
 *   const r = await obd2.connect()
 *   const live = await obd2.readAllLivePIDs()
 *   await obd2.disconnect()
 */

import { webSerialAdapter } from './webSerial'
import { webBluetoothAdapter } from './webBluetooth'
import { wifiAdapter } from './wifi'
import type {
  OBD2Adapter, ConnectResult, DTCResult, LiveData, ConnectOptions, TransportKind,
} from './types'

export type { TransportKind, ConnectResult, DTCResult, LiveData, ConnectOptions, OBD2Adapter } from './types'

export interface TransportInfo {
  kind: TransportKind
  label: string
  description: string
  available: boolean
}

class OBD2Manager {
  private current: OBD2Adapter = webSerialAdapter
  private listeners = new Set<(c: boolean) => void>()
  private offCurrent: (() => void) | null = null

  constructor() {
    this.subscribeCurrent()
  }

  private subscribeCurrent(): void {
    if (this.offCurrent) { this.offCurrent(); this.offCurrent = null }
    this.offCurrent = this.current.onStateChange((c) => {
      this.listeners.forEach(cb => { try { cb(c) } catch { /* ignore */ } })
    })
  }

  /** All transports with availability flags for the current platform */
  availableTransports(): TransportInfo[] {
    return [
      {
        kind: 'webserial',
        label: 'USB Serial',
        description: 'ELM327 USB cable. Desktop browsers (Chrome/Edge/Brave) only.',
        available: webSerialAdapter.isAvailable(),
      },
      {
        kind: 'webbluetooth',
        label: 'Bluetooth (BLE)',
        description: 'BLE ELM327 dongle (Vgate iCar Pro BLE, HM-10). Laptops + Android. iOS not supported.',
        available: webBluetoothAdapter.isAvailable(),
      },
      {
        kind: 'wifi',
        label: 'WiFi',
        description: 'WiFi ELM327 (Vgate iCar Pro WiFi, OBDLink WiFi). Requires desktop app.',
        available: wifiAdapter.isAvailable(),
      },
    ]
  }

  /** Currently selected transport kind */
  getTransport(): TransportKind {
    return this.current.kind
  }

  /** Switch to a different transport (disconnects current first) */
  async setTransport(kind: TransportKind): Promise<void> {
    if (this.current.kind === kind) return
    if (this.current.isConnected()) {
      try { await this.current.disconnect() } catch { /* ignore */ }
    }
    switch (kind) {
      case 'webserial': this.current = webSerialAdapter; break
      case 'webbluetooth': this.current = webBluetoothAdapter; break
      case 'wifi': this.current = wifiAdapter; break
    }
    this.subscribeCurrent()
  }

  /** Auto-pick the best available transport for the current platform */
  autoSelectTransport(): TransportKind {
    if (wifiAdapter.isAvailable()) { this.current = wifiAdapter; this.subscribeCurrent(); return 'wifi' }
    if (webBluetoothAdapter.isAvailable()) { this.current = webBluetoothAdapter; this.subscribeCurrent(); return 'webbluetooth' }
    if (webSerialAdapter.isAvailable()) { this.current = webSerialAdapter; this.subscribeCurrent(); return 'webserial' }
    this.current = webSerialAdapter
    this.subscribeCurrent()
    return 'webserial'
  }

  isConnected(): boolean { return this.current.isConnected() }

  onStateChange(cb: (connected: boolean) => void): () => void {
    this.listeners.add(cb)
    return () => { this.listeners.delete(cb) }
  }

  // Delegate methods to the active adapter
  connect(opts?: ConnectOptions): Promise<ConnectResult> { return this.current.connect(opts) }
  disconnect(): Promise<void> { return this.current.disconnect() }
  readVoltage(): Promise<number | null> { return this.current.readVoltage() }
  readDTCs(): Promise<DTCResult> { return this.current.readDTCs() }
  clearDTCs(): Promise<{ ok: boolean; error?: string }> { return this.current.clearDTCs() }
  readPID(pidCmd: string): Promise<number[] | null> { return this.current.readPID(pidCmd) }
  readAllLivePIDs(): Promise<Record<string, LiveData>> { return this.current.readAllLivePIDs() }
  getInfo(): string { return this.current.getInfo() }
  getPortLabel(): string { return this.current.getPortLabel() }
}

export const obd2 = new OBD2Manager()
