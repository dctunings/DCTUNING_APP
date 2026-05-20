/**
 * Virtual Dyno — Physics-Based Wheel HP/TQ Estimation
 * v1.0.0 — No hardware required, just OBD2 speed + RPM + vehicle weight
 *
 * Based on acceleration physics:
 *   F = m * a  (force = mass * acceleration)
 *   P = F * v  (power = force * velocity)
 *
 * We sample OBD2 at high frequency, compute acceleration between samples,
 * then derive power required to achieve that acceleration against:
 *   1. Inertial resistance (mass * acceleration)
 *   2. Aerodynamic drag (0.5 * ρ * Cd * A * v²)
 *   3. Rolling resistance (Crr * mass * g)
 *
 * Then correct for drivetrain loss to estimate crank HP.
 */

import type { OBD2TelemetryFrame, VehicleSpecs, VirtualDynoPoint } from './types'

// Constants
const AIR_DENSITY_KG_M3 = 1.225 // at sea level, 15°C
const GRAVITY = 9.80665
const ROLLING_RESISTANCE_COEFF = 0.015 // typical for street tires
const HP_PER_WATT = 745.7
const NM_PER_FTLB = 1.3558

/**
 * Calculate drivetrain loss percentage based on drivetrain type
 */
function getDrivetrainLossPercent(vehicle: VehicleSpecs): number {
  return vehicle.drivetrainLoss || 15 // default FWD
}

/**
 * Calculate rolling resistance force in Newtons
 */
function rollingResistanceForce(vehicle: VehicleSpecs): number {
  return ROLLING_RESISTANCE_COEFF * vehicle.weightKg * GRAVITY
}

/**
 * Calculate aerodynamic drag force in Newtons at given speed (m/s)
 */
function aeroDragForce(vehicle: VehicleSpecs, speedMs: number): number {
  return 0.5 * AIR_DENSITY_KG_M3 * vehicle.dragCoefficient * vehicle.frontalAreaM2 * speedMs * speedMs
}

/**
 * Calculate total resistance force at given speed
 */
function totalResistanceForce(vehicle: VehicleSpecs, speedMs: number): number {
  return rollingResistanceForce(vehicle) + aeroDragForce(vehicle, speedMs)
}

/**
 * Calculate acceleration between two frames (m/s²)
 */
function calculateAcceleration(frame1: OBD2TelemetryFrame, frame2: OBD2TelemetryFrame): number {
  const dt = (frame2.timestamp - frame1.timestamp) / 1000 // seconds
  if (dt <= 0) return 0
  const v1 = frame1.speedKmh / 3.6 // m/s
  const v2 = frame2.speedKmh / 3.6 // m/s
  return (v2 - v1) / dt
}

/**
 * Calculate gear from RPM and speed
 */
function calculateGear(vehicle: VehicleSpecs, rpm: number, speedKmh: number): number {
  if (speedKmh < 1 || rpm < 500) return 0

  // Speed (km/h) = RPM * tire_circumference (m) * 60 / gear_ratio / final_drive / 1000
  // gear_ratio = RPM * tire_circumference * 60 / speed / final_drive / 1000
  const tireCircumference = Math.PI * vehicle.tireDiameterM
  const speedMs = speedKmh / 3.6

  let bestGear = 1
  let bestError = Infinity

  for (let i = 0; i < vehicle.gearRatios.length; i++) {
    const gearRatio = vehicle.gearRatios[i]
    const expectedRpm = (speedMs * gearRatio * vehicle.finalDrive * 60) / tireCircumference
    const error = Math.abs(expectedRpm - rpm) / rpm
    if (error < bestError) {
      bestError = error
      bestGear = i + 1
    }
  }

  return bestGear
}

/**
 * Calculate wheel horsepower and torque from a single acceleration event
 */
/**
 * SAE J1349 Weather Correction Factor.
 *
 * Corrects measured horsepower to standard atmospheric conditions:
 *   - 25°C (77°F) intake air temperature
 *   - 100 kPa (29.61 inHg) dry barometric pressure
 *
 * Without this, hot/humid/high-altitude runs read low compared to cold/dry days.
 * Real chassis dynos apply this same correction.
 *
 * @param intakeTempC dry bulb temperature in °C (from PID 0x0F)
 * @param baroKPa     barometric pressure in kPa (from PID 0x33, fallback 100)
 * @returns multiplier to apply to measured HP (typically 0.95–1.05)
 */
export function sae_J1349_correction(intakeTempC: number | null | undefined, baroKPa: number | null | undefined): number {
  const T = (typeof intakeTempC === 'number' && isFinite(intakeTempC)) ? intakeTempC : 25
  const P = (typeof baroKPa === 'number' && isFinite(baroKPa) && baroKPa > 70) ? baroKPa : 100
  // Convert kPa to inHg, assume Pv (vapor pressure) ~ 0.4 inHg average humidity
  const inHg = P * 0.295300
  const Pd = Math.max(20, inHg - 0.4)
  const tempK = T + 273.15
  const cf = 1.180 * ((29.61 / Pd) * Math.sqrt(tempK / 298.15)) - 0.180
  // Clamp to reasonable bounds
  return Math.max(0.85, Math.min(1.20, cf))
}

function calculateWheelPower(
  vehicle: VehicleSpecs,
  accelerationMs2: number,
  speedMs: number
): { wheelHp: number; wheelTqNm: number } {
  // Force to accelerate = mass * acceleration
  const inertialForce = vehicle.weightKg * accelerationMs2

  // Total force = inertial + resistance
  const resistanceForce = totalResistanceForce(vehicle, speedMs)
  const totalForce = inertialForce + resistanceForce

  // Power = Force * Velocity
  const wheelPowerWatts = totalForce * speedMs

  // Convert to HP
  const wheelHp = wheelPowerWatts / HP_PER_WATT

  // Torque = Power / Angular Velocity
  // For wheel torque: T = P / ω, ω = v / r
  const wheelRadius = vehicle.tireDiameterM / 2
  const wheelAngularVelocity = speedMs / wheelRadius // rad/s
  const wheelTqNm = wheelAngularVelocity > 0 ? wheelPowerWatts / wheelAngularVelocity : 0

  return { wheelHp, wheelTqNm }
}

/**
 * Main virtual dyno calculation from a series of OBD2 frames
 */
export function calculateVirtualDyno(
  frames: OBD2TelemetryFrame[],
  vehicle: VehicleSpecs
): VirtualDynoPoint[] {
  if (frames.length < 3) return []

  const drivetrainLoss = getDrivetrainLossPercent(vehicle)
  const drivetrainMultiplier = 100 / (100 - drivetrainLoss)

  const results: VirtualDynoPoint[] = []

  for (let i = 1; i < frames.length; i++) {
    const prevFrame = frames[i - 1]
    const frame = frames[i]

    // Skip if throttle is too low (coasting or minimal power)
    if (frame.throttlePercent < 70) continue

    // Skip if speed is too low (launch artifacts)
    if (frame.speedKmh < 10) continue

    const acceleration = calculateAcceleration(prevFrame, frame)

    // Skip deceleration events
    if (acceleration <= 0.1) continue

    const speedMs = frame.speedKmh / 3.6
    const { wheelHp, wheelTqNm } = calculateWheelPower(vehicle, acceleration, speedMs)

    // Skip obvious outliers
    if (wheelHp > 2000 || wheelHp < 10) continue

    // SAE J1349 weather correction (intake temp + barometric pressure)
    const cf = sae_J1349_correction(frame.intakeTempC ?? null, frame.map ?? null)
    const correctedWheelHp = wheelHp * cf
    const correctedWheelTqNm = wheelTqNm * cf

    const gear = calculateGear(vehicle, frame.rpm, frame.speedKmh)
    const crankHp = correctedWheelHp * drivetrainMultiplier
    const crankTqNm = correctedWheelTqNm * drivetrainMultiplier

    results.push({
      rpm: Math.round(frame.rpm),
      wheelHp: Math.round(correctedWheelHp * 10) / 10,
      wheelTqNm: Math.round(correctedWheelTqNm * 10) / 10,
      crankHp: Math.round(crankHp * 10) / 10,
      crankTqNm: Math.round(crankTqNm * 10) / 10,
      gear,
    })
  }

  // Smooth the results with a moving average to reduce noise
  return smoothDynoCurve(results)
}

/**
 * Smooth the dyno curve with a 3-point moving average
 */
function smoothDynoCurve(points: VirtualDynoPoint[]): VirtualDynoPoint[] {
  if (points.length < 3) return points

  const smoothed: VirtualDynoPoint[] = []

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]
    const curr = points[i]
    const next = points[i + 1]

    // Only average points in the same gear
    if (curr.gear !== prev.gear || curr.gear !== next.gear) {
      smoothed.push(curr)
      continue
    }

    smoothed.push({
      rpm: curr.rpm,
      wheelHp: Math.round(((prev.wheelHp + curr.wheelHp + next.wheelHp) / 3) * 10) / 10,
      wheelTqNm: Math.round(((prev.wheelTqNm + curr.wheelTqNm + next.wheelTqNm) / 3) * 10) / 10,
      crankHp: Math.round(((prev.crankHp + curr.crankHp + next.crankHp) / 3) * 10) / 10,
      crankTqNm: Math.round(((prev.crankTqNm + curr.crankTqNm + next.crankTqNm) / 3) * 10) / 10,
      gear: curr.gear,
    })
  }

  return smoothed
}

/**
 * Get peak HP and TQ from a dyno curve
 */
export function getPeakValues(points: VirtualDynoPoint[]): { peakHp: number; peakTq: number; peakHpRpm: number; peakTqRpm: number } {
  if (points.length === 0) return { peakHp: 0, peakTq: 0, peakHpRpm: 0, peakTqRpm: 0 }

  const peakHpPoint = points.reduce((max, p) => p.crankHp > max.crankHp ? p : max, points[0])
  const peakTqPoint = points.reduce((max, p) => p.crankTqNm > max.crankTqNm ? p : max, points[0])

  return {
    peakHp: peakHpPoint.crankHp,
    peakTq: peakTqPoint.crankTqNm,
    peakHpRpm: peakHpPoint.rpm,
    peakTqRpm: peakTqPoint.rpm,
  }
}

/**
 * Calculate average HP across the dyno curve
 */
export function getAverageHp(points: VirtualDynoPoint[]): number {
  if (points.length === 0) return 0
  const sum = points.reduce((acc, p) => acc + p.crankHp, 0)
  return Math.round((sum / points.length) * 10) / 10
}
