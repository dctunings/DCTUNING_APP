/**
 * OBD2 Telemetry Collector — High-Frequency Polling for Performance Tests
 * v1.0.0 — Bridges renderer to main process obdManager for performance data
 *
 * Uses the existing IPC bridge (preload/index.ts) to request OBD2 data
 * from the main process at configurable intervals (default 50ms for tests).
 */

import type { OBD2TelemetryFrame } from './types'
import { obd2 } from '../obd2'

// ── OBD2 PID Definitions ────────────────────────────────────────────────────

const PIDS = {
  RPM: '0C',
  SPEED: '0D',
  THROTTLE: '11',
  COOLANT_TEMP: '05',
  INTAKE_TEMP: '0F',
  TIMING_ADVANCE: '0E',
  ENGINE_LOAD: '04',
  MAF: '10',
  MAP: '0B',
  FUEL_TRIM_SHORT_1: '06',
  FUEL_TRIM_LONG_1: '07',
  O2_SENSOR_1: '24',
  KNOCK: '26', // Manufacturer specific, may not be available
  BOOST: '70', // PID 0x70 — boost pressure (Ford specific, some VAG)
}

// ── PID Decoders ────────────────────────────────────────────────────────────

function decodeRPM(a: number, b: number): number {
  return ((a * 256) + b) / 4
}

function decodeSpeed(a: number): number {
  return a // km/h directly
}

function decodeThrottle(a: number): number {
  return (a * 100) / 255
}

function decodeTemp(a: number): number {
  return a - 40
}

function decodeTiming(a: number): number {
  return (a / 2) - 64
}

function decodeLoad(a: number): number {
  return (a * 100) / 255
}

function decodeMAF(a: number, b: number): number {
  return ((a * 256) + b) / 100 // g/s
}

function decodeMAP(a: number): number {
  return a // kPa
}

function decodeFuelTrim(a: number): number {
  return (a / 1.28) - 100
}

function decodeBoost(a: number, b: number): number {
  // PID 0x70: boost pressure in 0.001 bar
  const kpa = ((a * 256) + b) / 10
  return kpa * 0.145038 // Convert to PSI
}

// ── Telemetry Collector Class ───────────────────────────────────────────────

export interface TelemetryCollectorOptions {
  pollIntervalMs: number
  onFrame: (frame: OBD2TelemetryFrame) => void
  onError: (error: string) => void
}

export class OBD2TelemetryCollector {
  private intervalId: ReturnType<typeof setInterval> | null = null
  private options: TelemetryCollectorOptions
  private isRunning = false
  private frameCount = 0
  private startTime = 0

  // Latest cached values for PIDs that update slower
  private cache: Partial<OBD2TelemetryFrame> = {}

  constructor(options: TelemetryCollectorOptions) {
    this.options = options
  }

  async start(): Promise<boolean> {
    if (this.isRunning) return true

    // Prefer the unified obd2 layer when connected (Bluetooth / WiFi / Web Serial picker)
    if (obd2.isConnected()) {
      // ready to go
    } else {
      // Fall back to legacy main-process IPC path
      try {
        const connected = await window.api?.obdIsConnected?.()
        if (!connected) {
          try {
            await window.api?.obdConnect?.('AUTO')
          } catch {
            this.options.onError('OBD2 device not connected. Connect via the OBD2 Connection panel first.')
            return false
          }
        }
      } catch {
        this.options.onError('OBD2 device not connected. Connect via the OBD2 Connection panel first.')
        return false
      }
    }

    this.isRunning = true
    this.startTime = Date.now()
    this.frameCount = 0
    this.cache = {}

    // Start high-frequency polling
    this.intervalId = setInterval(() => this.poll(), this.options.pollIntervalMs)

    return true
  }

  stop(): void {
    this.isRunning = false
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  getStats(): { frameCount: number; durationMs: number } {
    return {
      frameCount: this.frameCount,
      durationMs: Date.now() - this.startTime,
    }
  }

  private async poll(): Promise<void> {
    if (!this.isRunning) return

    try {
      const timestamp = Date.now() - this.startTime

      // Request critical PIDs every poll
      const [rpm, speed, throttle] = await Promise.all([
        this.requestPID(PIDS.RPM),
        this.requestPID(PIDS.SPEED),
        this.requestPID(PIDS.THROTTLE),
      ])

      // Request secondary PIDs every 5th frame (reduces bus load)
      let coolant: number | null = null
      let intake: number | null = null
      let timing: number | null = null
      let load: number | null = null
      let maf: number | null = null
      let map: number | null = null
      let boost: number | null = null
      let afr: number | null = null
      let fuelTrimShort: number | null = null
      let fuelTrimLong: number | null = null
      let knockRetard: number | null = null

      if (this.frameCount % 5 === 0) {
        const secondary = await Promise.allSettled([
          this.requestPID(PIDS.COOLANT_TEMP),
          this.requestPID(PIDS.INTAKE_TEMP),
          this.requestPID(PIDS.TIMING_ADVANCE),
          this.requestPID(PIDS.ENGINE_LOAD),
          this.requestPID(PIDS.MAF),
          this.requestPID(PIDS.MAP),
          this.requestPID(PIDS.BOOST),
          this.requestPID(PIDS.FUEL_TRIM_SHORT_1),
          this.requestPID(PIDS.FUEL_TRIM_LONG_1),
        ])

        coolant = secondary[0].status === 'fulfilled' ? secondary[0].value : this.cache.coolantTempC ?? null
        intake = secondary[1].status === 'fulfilled' ? secondary[1].value : this.cache.intakeTempC ?? null
        timing = secondary[2].status === 'fulfilled' ? secondary[2].value : this.cache.timingAdvance ?? null
        load = secondary[3].status === 'fulfilled' ? secondary[3].value : this.cache.engineLoad ?? null
        maf = secondary[4].status === 'fulfilled' ? secondary[4].value : this.cache.maf ?? null
        map = secondary[5].status === 'fulfilled' ? secondary[5].value : this.cache.map ?? null
        boost = secondary[6].status === 'fulfilled' ? secondary[6].value : this.cache.boostPsi ?? null
        fuelTrimShort = secondary[7].status === 'fulfilled' ? secondary[7].value : this.cache.fuelTrimShort ?? null
        fuelTrimLong = secondary[8].status === 'fulfilled' ? secondary[8].value : this.cache.fuelTrimLong ?? null

        // Update cache
        this.cache = { coolantTempC: coolant ?? undefined, intakeTempC: intake ?? undefined, timingAdvance: timing ?? undefined, engineLoad: load ?? undefined, maf: maf ?? undefined, map: map ?? undefined, boostPsi: boost ?? undefined, fuelTrimShort: fuelTrimShort ?? undefined, fuelTrimLong: fuelTrimLong ?? undefined }
      } else {
        // Use cached values
        coolant = this.cache.coolantTempC ?? null
        intake = this.cache.intakeTempC ?? null
        timing = this.cache.timingAdvance ?? null
        load = this.cache.engineLoad ?? null
        maf = this.cache.maf ?? null
        map = this.cache.map ?? null
        boost = this.cache.boostPsi ?? null
        fuelTrimShort = this.cache.fuelTrimShort ?? null
        fuelTrimLong = this.cache.fuelTrimLong ?? null
      }

      // Calculate AFR from O2 sensor if available
      if (this.frameCount % 10 === 0) {
        try {
          const o2 = await this.requestPID(PIDS.O2_SENSOR_1)
          if (o2 !== null) {
            afr = o2 * 0.0000305 + 10 // Approximate wideband conversion
          }
        } catch { /* ignore */ }
      }

      const frame: OBD2TelemetryFrame = {
        timestamp,
        rpm: rpm ?? 0,
        speedKmh: speed ?? 0,
        speedMph: speed ? speed / 1.609 : 0,
        throttlePercent: throttle ?? 0,
        boostPsi: boost,
        boostBar: boost ? boost / 14.504 : null,
        coolantTempC: coolant ?? 0,
        intakeTempC: intake ?? 0,
        timingAdvance: timing ?? 0,
        engineLoad: load ?? 0,
        afr,
        fuelTrimShort,
        fuelTrimLong,
        knockRetard,
        maf,
        map,
      }

      this.frameCount++
      this.options.onFrame(frame)

    } catch (error) {
      // Don't stop on single poll errors, but report them
      if (this.frameCount % 20 === 0) {
        this.options.onError('OBD2 poll error: ' + String(error))
      }
    }
  }

  private async requestPID(pid: string): Promise<number | null> {
    try {
      let data: number[] = []

      if (obd2.isConnected()) {
        // Unified obd2 layer (Bluetooth / WiFi / Web Serial)
        const bytes = await obd2.readPID(`01${pid}`)
        if (!bytes || bytes.length === 0) return null
        data = bytes
      } else {
        // Legacy main-process IPC path
        const response = await window.api?.obdSendCommand?.(`01${pid}`)
        if (!response || response.startsWith('NO DATA') || response.startsWith('UNABLE')) {
          return null
        }
        const bytes = response.split(' ').filter(b => b.length === 2).map(b => parseInt(b, 16))
        if (bytes.length < 2 || bytes[0] !== 0x41 || bytes[1] !== parseInt(pid, 16)) {
          return null
        }
        data = bytes.slice(2)
      }

      switch (pid) {
        case PIDS.RPM: return data.length >= 2 ? decodeRPM(data[0], data[1]) : null
        case PIDS.SPEED: return data.length >= 1 ? decodeSpeed(data[0]) : null
        case PIDS.THROTTLE: return data.length >= 1 ? decodeThrottle(data[0]) : null
        case PIDS.COOLANT_TEMP: return data.length >= 1 ? decodeTemp(data[0]) : null
        case PIDS.INTAKE_TEMP: return data.length >= 1 ? decodeTemp(data[0]) : null
        case PIDS.TIMING_ADVANCE: return data.length >= 1 ? decodeTiming(data[0]) : null
        case PIDS.ENGINE_LOAD: return data.length >= 1 ? decodeLoad(data[0]) : null
        case PIDS.MAF: return data.length >= 2 ? decodeMAF(data[0], data[1]) : null
        case PIDS.MAP: return data.length >= 1 ? decodeMAP(data[0]) : null
        case PIDS.FUEL_TRIM_SHORT_1: return data.length >= 1 ? decodeFuelTrim(data[0]) : null
        case PIDS.FUEL_TRIM_LONG_1: return data.length >= 1 ? decodeFuelTrim(data[0]) : null
        case PIDS.BOOST: return data.length >= 2 ? decodeBoost(data[0], data[1]) : null
        default: return null
      }
    } catch {
      return null
    }
  }
}

// ── Simulated Telemetry (for testing without hardware) ──────────────────────

export function createSimulatedFrames(count: number, vehicle: { weightKg: number }): OBD2TelemetryFrame[] {
  const frames: OBD2TelemetryFrame[] = []

  for (let i = 0; i < count; i++) {
    const t = i * 50 // 50ms intervals
    const progress = i / count

    // Simulate a launch: 0-100kmh in ~6 seconds
    const targetTime = 6000 // ms
    let speedKmh = 0
    if (t < targetTime) {
      speedKmh = 100 * Math.pow(t / targetTime, 0.85) // Non-linear acceleration
    } else {
      speedKmh = 100 + (t - targetTime) * 0.01 // Slow acceleration after 100
    }

    const rpm = 800 + (speedKmh * 35) + Math.sin(t / 200) * 50 // Idle + speed-based + noise
    const throttle = t < 100 ? t : 98 + Math.random() * 2 // Quick to WOT
    const boost = throttle > 80 ? Math.min(18, speedKmh * 0.15) * Math.sin(t / 300) : -8

    frames.push({
      timestamp: t,
      rpm: Math.round(rpm),
      speedKmh: Math.round(speedKmh * 10) / 10,
      speedMph: Math.round((speedKmh / 1.609) * 10) / 10,
      throttlePercent: Math.round(throttle),
      boostPsi: Math.round(boost * 10) / 10,
      boostBar: Math.round((boost / 14.504) * 100) / 100,
      coolantTempC: 92 + Math.random() * 3,
      intakeTempC: 35 + Math.random() * 5,
      timingAdvance: 15 + Math.random() * 3,
      engineLoad: throttle > 80 ? 75 + Math.random() * 20 : 20 + Math.random() * 10,
      afr: 14.2 + Math.random() * 0.5,
      fuelTrimShort: Math.random() * 4 - 2,
      fuelTrimLong: Math.random() * 2 - 1,
      knockRetard: Math.random() > 0.95 ? 0.5 : 0,
      maf: speedKmh * 0.8 + Math.random() * 5,
      map: 100 + boost * 6.895,
    })
  }

  return frames
}
