/**
 * types.ts — Bridge protocol types
 *
 * Shared between the bridge service and the browser client. Kept as plain
 * interfaces so they can be copy-pasted into the renderer without imports.
 */

// ── J2534 device descriptor (from registry scan) ───────────────────────────
export interface J2534Device {
  name: string
  dll: string
  vendor: string
  is64bit: boolean
  exists: boolean
  known: KnownDeviceInfo | null
}

export interface KnownDeviceInfo {
  brand: string
  model: string
  category: 'professional' | 'prosumer' | 'clone' | 'budget'
  protocols: string[]
  maxBaudRate: number
  canFlash: boolean
  isClone: boolean
  driverNote: string
  setupTip: string
}

// ── ECU identification (from UDS reads) ────────────────────────────────────
export interface ECUIdentification {
  partNumber?: string
  swVersion?: string
  hwVersion?: string
  vin?: string
  systemName?: string
  ecuPart?: string
  flashSize?: number
  securityLevel?: number
  raw?: Record<string, string>
}

// ── WebSocket message envelopes ────────────────────────────────────────────
//
// Every request from the client carries a unique `id`. The bridge replies
// with the same `id` so the client can match request → response.
//
// Push events from the bridge (no id) carry an `event` field.

export interface BridgeRequest<T = unknown> {
  id: string
  action: BridgeAction
  params?: T
}

export interface BridgeResponse<T = unknown> {
  id: string
  ok: boolean
  data?: T
  error?: string
}

export interface BridgeEvent<T = unknown> {
  event: string  // e.g. "j2534-progress", "device-connected", "device-disconnected"
  data?: T
}

export type BridgeMessage = BridgeRequest | BridgeResponse | BridgeEvent

// ── Action verbs the bridge accepts ────────────────────────────────────────
export type BridgeAction =
  | 'ping'                      // health check, returns version + status
  | 'scan-devices'              // enumerate installed J2534 devices
  | 'j2534-open'                // open a specific DLL
  | 'j2534-close'
  | 'j2534-is-open'
  | 'j2534-connect'             // configure protocol channel
  | 'j2534-disconnect'
  | 'j2534-is-connected'
  | 'j2534-read-ecu-id'
  | 'j2534-read-dtcs'
  | 'j2534-clear-dtcs'
  | 'j2534-read-flash'
  | 'j2534-write-flash'
  | 'j2534-calc-key'
  | 'j2534-uds'                 // raw UDS request
  | 'j2534-calc-key'            // SecurityAccess seed → key (pure JS, ECU-specific)

export interface PingResponse {
  version: string
  hasPowerShell: boolean
  bridgeReady: boolean
  uptime: number
}
