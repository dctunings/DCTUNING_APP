/**
 * Unified OBD2 Connection Types
 *
 * Used by all OBD2 transport adapters (Web Serial, Web Bluetooth, WiFi)
 * to expose the same shape to the UI.
 */

export type TransportKind = 'webserial' | 'webbluetooth' | 'wifi'

export interface ConnectResult {
  ok: boolean
  error?: string
  info?: string
  portLabel?: string
}

export interface LiveData {
  pid: string
  name: string
  value: number
  unit: string
  timestamp: number
}

export interface DTCResult {
  ok: boolean
  codes?: string[]
  error?: string
}

export interface OBD2Adapter {
  /** Adapter identifier */
  readonly kind: TransportKind

  /** Whether this transport is supported in the current browser/runtime */
  isAvailable(): boolean

  /** True when actively connected and ready */
  isConnected(): boolean

  /** Subscribe to connection state changes; returns unsubscribe */
  onStateChange(cb: (connected: boolean) => void): () => void

  /** Connect (will trigger user permission prompts where required) */
  connect(opts?: ConnectOptions): Promise<ConnectResult>

  /** Cleanly disconnect */
  disconnect(): Promise<void>

  /** Read current vehicle voltage (Volts) or null if unsupported/failed */
  readVoltage(): Promise<number | null>

  /** Read all stored Diagnostic Trouble Codes */
  readDTCs(): Promise<DTCResult>

  /** Clear DTCs */
  clearDTCs(): Promise<{ ok: boolean; error?: string }>

  /** Read all common live PIDs in one batch (RPM, speed, MAP, etc.) */
  readAllLivePIDs(): Promise<Record<string, LiveData>>

  /** Read a single PID by hex command (e.g. '010C' for RPM) */
  readPID(pidCmd: string): Promise<number[] | null>

  /** Adapter info string (chip version, etc.) */
  getInfo(): string

  /** Human-readable port/device label */
  getPortLabel(): string
}

export interface ConnectOptions {
  /** Optional baud rate (Web Serial only); default 38400 */
  baudRate?: number
  /** Optional WiFi host:port for WiFi transport, e.g. '192.168.0.10:35000' */
  wifiHost?: string
}
