/**
 * Performance Test Runner — OBD2-Based Performance Testing
 * v1.0.0 — Drag Strip, Acceleration Tests, Boost Onset
 *
 * All tests use high-frequency OBD2 polling to measure real-world performance.
 * No external hardware required beyond the ELM327 already used in the app.
 */

import type {
  OBD2TelemetryFrame,
  VehicleSpecs,
  PerformanceTestConfig,
  ZeroToSixtyResult,
  QuarterMileResult,
  BoostOnsetResult,
  SpeedTrap,
  PerformanceTestType,
  SafetyScoreResult,
} from './types'
import { calculateVirtualDyno, getPeakValues, getAverageHp } from './virtualDyno'

// ── Test Constants ──────────────────────────────────────────────────────────
const QUARTER_MILE_METERS = 402.336
const EIGHTH_MILE_METERS = 201.168
const SIXTY_FEET_METERS = 18.288
const ROLLOUT_DISTANCE_METERS = 0.3048 // 1 foot rollout

const ROLLING_TEST_TOLERANCE = 2 // kmh

// ── Safety Check ────────────────────────────────────────────────────────────

export function analyzeSafety(frames: OBD2TelemetryFrame[]): SafetyScoreResult {
  const result: SafetyScoreResult = {
    overall: 'green',
    coolant: 'green',
    knock: 'green',
    fuelTrims: 'green',
    boost: 'green',
    details: [],
    recommendation: 'All systems nominal. Safe to proceed with performance testing.',
  }

  if (frames.length === 0) {
    result.overall = 'red'
    result.recommendation = 'No OBD2 data available. Connect and warm up engine first.'
    return result
  }

  const recentFrames = frames.slice(-10) // last 10 samples

  // Coolant temp check
  const avgCoolant = recentFrames.reduce((s, f) => s + f.coolantTempC, 0) / recentFrames.length
  if (avgCoolant < 70) {
    result.coolant = 'yellow'
    result.details.push(`Coolant temp ${avgCoolant.toFixed(0)}°C — engine not fully warm`)
  } else if (avgCoolant > 105) {
    result.coolant = 'red'
    result.details.push(`Coolant temp ${avgCoolant.toFixed(0)}°C — OVERHEATING`)
  }

  // Knock detection
  const knockFrames = recentFrames.filter(f => f.knockRetard && f.knockRetard > 0)
  if (knockFrames.length > 3) {
    result.knock = 'red'
    result.details.push(`${knockFrames.length} knock events detected in last 10 samples`)
  }

  // Fuel trim check
  const stFrames = recentFrames.map(f => f.fuelTrimShort).filter((v): v is number => v !== null)
  if (stFrames.length > 0) {
    const avgSt = stFrames.reduce((a, b) => a + b, 0) / stFrames.length
    if (Math.abs(avgSt) > 10) {
      result.fuelTrims = 'yellow'
      result.details.push(`Fuel trim avg ${avgSt.toFixed(1)}% — possible vacuum leak or MAF issue`)
    }
    if (Math.abs(avgSt) > 20) {
      result.fuelTrims = 'red'
      result.details.push(`Fuel trim avg ${avgSt.toFixed(1)}% — CRITICAL fueling issue`)
    }
  }

  // Boost check (leak detection)
  const boostFrames = recentFrames.map(f => f.boostPsi).filter((v): v is number => v !== null)
  if (boostFrames.length > 0) {
    const maxBoost = Math.max(...boostFrames)
    const minBoost = Math.min(...boostFrames)
    if (maxBoost > 0 && minBoost < -5) {
      result.boost = 'yellow'
      result.details.push(`Boost fluctuation ${minBoost.toFixed(1)} to ${maxBoost.toFixed(1)} psi — possible leak`)
    }
  }

  // Overall score
  if (result.coolant === 'red' || result.knock === 'red' || result.fuelTrims === 'red') {
    result.overall = 'red'
    result.recommendation = 'CRITICAL ISSUES DETECTED. Do not proceed with performance testing. Fix issues first.'
  } else if (result.coolant === 'yellow' || result.knock === 'yellow' || result.fuelTrims === 'yellow' || result.boost === 'yellow') {
    result.overall = 'yellow'
    result.recommendation = 'Caution advised. Issues detected but not critical. Proceed at own risk.'
  }

  return result
}

// ── Test State Machine ──────────────────────────────────────────────────────

export type TestPhase = 'idle' | 'arming' | 'waiting-launch' | 'running' | 'complete' | 'aborted'

export interface TestRunnerState {
  phase: TestPhase
  config: PerformanceTestConfig
  startTime: number | null
  endTime: number | null
  frames: OBD2TelemetryFrame[]
  speedTraps: SpeedTrap[]
  abortReason?: string
}

// ── 0-60 / 0-100 Test ───────────────────────────────────────────────────────

export function runZeroToSixtyTest(
  frames: OBD2TelemetryFrame[],
  vehicle: VehicleSpecs,
  testId: string
): ZeroToSixtyResult {
  const targetSpeed = 96.56 // 60 mph in km/h
  const startSpeed = 0

  let startIdx = -1
  let endIdx = -1

  for (let i = 0; i < frames.length; i++) {
    if (startIdx === -1 && frames[i].speedKmh >= startSpeed && frames[i].throttlePercent >= 90) {
      startIdx = i
    }
    if (startIdx !== -1 && frames[i].speedKmh >= targetSpeed) {
      endIdx = i
      break
    }
  }

  const startTime = startIdx >= 0 ? frames[startIdx].timestamp : 0
  const endTime = endIdx >= 0 ? frames[endIdx].timestamp : startTime
  const timeSeconds = (endTime - startTime) / 1000

  // With 1-foot rollout (typical magazine standard)
  let rolloutIdx = -1
  const rolloutSpeedKmh = Math.sqrt(2 * 9.81 * ROLLOUT_DISTANCE_METERS) * 3.6 // ~6.2 kmh theoretical
  for (let i = startIdx; i < frames.length; i++) {
    if (frames[i].speedKmh >= rolloutSpeedKmh) {
      rolloutIdx = i
      break
    }
  }
  const timeWithRollout = rolloutIdx >= 0
    ? (frames[endIdx].timestamp - frames[rolloutIdx].timestamp) / 1000
    : timeSeconds

  // Speed traps every 16 kmh (10 mph)
  const speedTraps: SpeedTrap[] = []
  for (let trapSpeed = 16; trapSpeed < 100; trapSpeed += 16) {
    const trapIdx = frames.findIndex((f, idx) => idx >= startIdx && f.speedKmh >= trapSpeed)
    if (trapIdx >= 0) {
      speedTraps.push({
        speed: trapSpeed,
        timeSeconds: (frames[trapIdx].timestamp - startTime) / 1000,
      })
    }
  }

  return {
    id: testId,
    testType: '0-60',
    startTime,
    endTime,
    duration: endTime - startTime,
    frames: frames.slice(startIdx, endIdx + 1),
    vehicle,
    timeSeconds: Math.round(timeSeconds * 100) / 100,
    timeSecondsWithRollout: Math.round(timeWithRollout * 100) / 100,
    speedTrapData: speedTraps,
  }
}

// ── 1/4 Mile Test ───────────────────────────────────────────────────────────

export function runQuarterMileTest(
  frames: OBD2TelemetryFrame[],
  vehicle: VehicleSpecs,
  testId: string
): QuarterMileResult {
  const targetDistance = QUARTER_MILE_METERS

  let startIdx = -1
  let sixtyFtIdx = -1
  let eighthIdx = -1
  let endIdx = -1

  // Integrate speed to get distance
  let distance = 0

  for (let i = 1; i < frames.length; i++) {
    const dt = (frames[i].timestamp - frames[i - 1].timestamp) / 1000
    const avgSpeedMs = ((frames[i].speedKmh + frames[i - 1].speedKmh) / 2) / 3.6
    distance += avgSpeedMs * dt

    if (startIdx === -1 && frames[i].throttlePercent >= 90 && frames[i].speedKmh > 0) {
      startIdx = i
      distance = 0
    }

    if (startIdx >= 0) {
      if (sixtyFtIdx === -1 && distance >= SIXTY_FEET_METERS) sixtyFtIdx = i
      if (eighthIdx === -1 && distance >= EIGHTH_MILE_METERS) eighthIdx = i
      if (endIdx === -1 && distance >= targetDistance) {
        endIdx = i
        break
      }
    }
  }

  const startTime = startIdx >= 0 ? frames[startIdx].timestamp : 0
  const endTime = endIdx >= 0 ? frames[endIdx].timestamp : startTime
  const timeSeconds = (endTime - startTime) / 1000

  const sixtyFtTime = sixtyFtIdx >= 0
    ? (frames[sixtyFtIdx].timestamp - startTime) / 1000
    : 0

  const eighthTime = eighthIdx >= 0
    ? (frames[eighthIdx].timestamp - startTime) / 1000
    : 0

  const eighthSpeed = eighthIdx >= 0 ? frames[eighthIdx].speedKmh : 0

  // Trap speed = average of last 100ms before finish
  let trapSpeedKmh = 0
  if (endIdx >= 0) {
    const trapFrames = frames.slice(Math.max(0, endIdx - 5), endIdx + 1)
    trapSpeedKmh = trapFrames.reduce((s, f) => s + f.speedKmh, 0) / trapFrames.length
  }

  return {
    id: testId,
    testType: '1-4-mile',
    startTime,
    endTime,
    duration: endTime - startTime,
    frames: frames.slice(startIdx, endIdx + 1),
    vehicle,
    timeSeconds: Math.round(timeSeconds * 100) / 100,
    trapSpeedMph: Math.round(trapSpeedKmh / 1.609 * 10) / 10,
    trapSpeedKmh: Math.round(trapSpeedKmh * 10) / 10,
    sixtyFootTime: Math.round(sixtyFtTime * 100) / 100,
    eighthMileTime: Math.round(eighthTime * 100) / 100,
    eighthMileSpeed: Math.round(eighthSpeed * 10) / 10,
    speedTrapData: [],
  }
}

// ── Boost Onset Test ────────────────────────────────────────────────────────

export function runBoostOnsetTest(
  frames: OBD2TelemetryFrame[],
  vehicle: VehicleSpecs,
  testId: string,
  targetBoostPsi: number = 15
): BoostOnsetResult {
  let startIdx = -1
  let halfBoostIdx = -1
  let targetIdx = -1
  let maxBoost = -Infinity

  for (let i = 0; i < frames.length; i++) {
    const boost = frames[i].boostPsi ?? 0
    maxBoost = Math.max(maxBoost, boost)

    // Start when throttle goes >50% and boost begins rising from vacuum
    if (startIdx === -1 && frames[i].throttlePercent > 50 && boost > -5) {
      startIdx = i
    }

    if (startIdx >= 0) {
      if (halfBoostIdx === -1 && boost >= targetBoostPsi / 2) halfBoostIdx = i
      if (targetIdx === -1 && boost >= targetBoostPsi) {
        targetIdx = i
        break
      }
    }
  }

  const startTime = startIdx >= 0 ? frames[startIdx].timestamp : 0
  const endTime = targetIdx >= 0 ? frames[targetIdx].timestamp : startTime

  return {
    id: testId,
    testType: 'boost-onset',
    startTime,
    endTime,
    duration: endTime - startTime,
    frames: frames.slice(startIdx, targetIdx + 1),
    vehicle,
    targetBoostPsi,
    timeToTargetMs: targetIdx >= 0 ? frames[targetIdx].timestamp - startTime : 0,
    timeToHalfBoostMs: halfBoostIdx >= 0 ? frames[halfBoostIdx].timestamp - startTime : 0,
    maxBoostPsi: Math.round(maxBoost * 10) / 10,
  }
}

// ── Generic Test Runner ─────────────────────────────────────────────────────

export function runPerformanceTest(
  frames: OBD2TelemetryFrame[],
  vehicle: VehicleSpecs,
  config: PerformanceTestConfig,
  testId: string
): ZeroToSixtyResult | QuarterMileResult | BoostOnsetResult {
  switch (config.type) {
    case '0-60':
    case '0-100':
      return runZeroToSixtyTest(frames, vehicle, testId)
    case '1-4-mile':
      return runQuarterMileTest(frames, vehicle, testId)
    case 'boost-onset':
      return runBoostOnsetTest(frames, vehicle, testId)
    default:
      // For other tests, use 0-60 as base
      return runZeroToSixtyTest(frames, vehicle, testId)
  }
}

// ── Result Enhancement with Virtual Dyno ────────────────────────────────────

export function enhanceResultWithDyno(
  result: ZeroToSixtyResult | QuarterMileResult | BoostOnsetResult
): ZeroToSixtyResult | QuarterMileResult | BoostOnsetResult & { virtualDyno?: ReturnType<typeof calculateVirtualDyno> } {
  const dynoPoints = calculateVirtualDyno(result.frames, result.vehicle)
  const peaks = getPeakValues(dynoPoints)

  return {
    ...result,
    virtualDyno: dynoPoints,
    // @ts-expect-error — adding calculated fields
    peakHp: peaks.peakHp,
    peakTq: peaks.peakTq,
    peakHpRpm: peaks.peakHpRpm,
    peakTqRpm: peaks.peakTqRpm,
    avgHp: getAverageHp(dynoPoints),
  }
}
