/**
 * OBD2 Performance Suite — Types & Interfaces
 * v1.0.0 — Virtual Dyno, Performance Tests, Telemetry
 */

export interface OBD2TelemetryFrame {
  timestamp: number // ms since test start
  rpm: number
  speedKmh: number
  speedMph: number
  throttlePercent: number
  boostPsi: number | null
  boostBar: number | null
  coolantTempC: number
  intakeTempC: number
  timingAdvance: number
  engineLoad: number
  afr: number | null
  fuelTrimShort: number | null
  fuelTrimLong: number | null
  knockRetard: number | null
  maf: number | null
  map: number | null
}

export interface VehicleSpecs {
  make: string
  model: string
  year: number
  weightKg: number
  frontalAreaM2: number
  dragCoefficient: number
  drivetrainLoss: number // percentage, e.g. 15 for FWD, 18 for AWD
  gearRatios: number[]
  finalDrive: number
  tireDiameterM: number
  redlineRpm: number
}

export interface VirtualDynoPoint {
  rpm: number
  wheelHp: number
  wheelTqNm: number
  crankHp: number
  crankTqNm: number
  gear: number
}

export interface TestResult {
  id: string
  testType: PerformanceTestType
  startTime: number
  endTime: number
  duration: number // ms
  frames: OBD2TelemetryFrame[]
  vehicle: VehicleSpecs
  tuneStage?: number
  notes?: string
}

export interface ZeroToSixtyResult extends TestResult {
  testType: '0-60'
  timeSeconds: number
  timeSecondsWithRollout: number // 1ft rollout subtracted
  speedTrapData: SpeedTrap[]
}

export interface QuarterMileResult extends TestResult {
  testType: '1-4-mile'
  timeSeconds: number
  trapSpeedMph: number
  trapSpeedKmh: number
  sixtyFootTime: number
  eighthMileTime: number
  eighthMileSpeed: number
  speedTrapData: SpeedTrap[]
}

export interface BoostOnsetResult extends TestResult {
  testType: 'boost-onset'
  targetBoostPsi: number
  timeToTargetMs: number
  timeToHalfBoostMs: number
  maxBoostPsi: number
}

export interface SpeedTrap {
  speed: number // kmh
  timeSeconds: number
}

export type PerformanceTestType = '0-60' | '0-100' | '1-4-mile' | '60-130' | '100-200' | 'boost-onset' | 'rolling-30-70' | 'custom'

export interface PerformanceTestConfig {
  type: PerformanceTestType
  customStartSpeed?: number // kmh
  customEndSpeed?: number // kmh
  minThrottlePercent?: number // default 90
  requireLaunchMode?: boolean
  maxTestDurationMs?: number
}

export interface BeforeAfterComparison {
  testType: PerformanceTestType
  baselineTestId: string
  tunedTestId: string
  improvement: {
    timeSeconds?: number // negative = faster
    trapSpeedMph?: number
    wheelHpAvg?: number
    wheelHpPeak?: number
    boostOnsetMs?: number
  }
  percentageImprovement: Record<string, number>
}

export interface SafetyScoreResult {
  overall: 'green' | 'yellow' | 'red'
  coolant: 'green' | 'yellow' | 'red'
  knock: 'green' | 'yellow' | 'red'
  fuelTrims: 'green' | 'yellow' | 'red'
  boost: 'green' | 'yellow' | 'red'
  details: string[]
  recommendation: string
}
