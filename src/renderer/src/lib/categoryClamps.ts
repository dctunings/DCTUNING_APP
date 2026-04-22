import type { MapCategory } from './ecuDefinitions'

// ─── Physical-unit safety clamps for signature-driven auto-tuning ─────────────
// When we synthesize a MapDef from a scanner match, the catalog gives us a category
// (boost/fuel/torque/…) and a physical unit (hPa, mg/stk, Nm, °CRK, …). These clamps
// bound the result of applying a stage multiplier so we never push a map beyond a
// physically safe limit — even if the multiplier would allow it.
//
// Values chosen to be ceilings for STREET tuning, not race/motorsport:
//   • Boost: 3.0 bar absolute (≈ 2.0 bar of boost above atmospheric) — covers
//     Stage 3 tunes on stock TDI/TFSI turbos; race tunes need manual override.
//   • Fuel: 120 mg/stk for diesel injection quantity — Stage 2 territory.
//   • Torque: 1000 Nm — covers nearly everything except V8 TDI / RS-level cars.
//   • Ignition: 30° advance / -10° min — pushes past any reasonable street knock limit.
//   • Lambda: 0.75 min / 1.05 max — keeps AFR safely rich under load, prevents lean.
//
// Lookups are (category, unit-family) — unit strings are normalized (lowercased,
// whitespace stripped). Unknown unit/category returns undefined (no clamp applied).
//
// These clamps are expressed in PHYSICAL units. Consumer converts to raw via:
//   rawMax = (physMax - offsetVal) / factor
//   rawMin = (physMin - offsetVal) / factor

export interface PhysicalClamps {
  max?: number   // physical-unit upper bound (e.g. 3000 hPa)
  min?: number   // physical-unit lower bound (rare — mostly lambda/ignition)
}

function normUnit(u: string | undefined): string {
  return (u ?? '').toLowerCase().replace(/\s+/g, '').replace(/[*\/]/g, '/')
}

// Boost/pressure unit family — covers hPa, mbar, kPa, bar, psi
function clampBoost(u: string): PhysicalClamps | undefined {
  if (u === 'hpa' || u === 'mbar')        return { max: 3000 }   // 3.0 bar abs
  if (u === 'kpa')                        return { max: 300 }
  if (u === 'bar')                        return { max: 3.0 }
  if (u === 'psi')                        return { max: 45 }     // ~3 bar
  return undefined
}

// Fuel quantity unit family
function clampFuel(u: string): PhysicalClamps | undefined {
  if (u === 'mg/stk' || u === 'mg/st' || u === 'mg/hub' || u === 'mg' ||
      u === 'mg/inj' || u === 'mg/cyc')   return { max: 120 }    // high-end street diesel
  if (u === 'mg/s' || u === 'kg/h')       return { max: 1000 }   // mass air/fuel flow — crude ceiling
  if (u === '%')                          return { max: 100 }    // duty / fuel % — can't exceed 100
  return undefined
}

function clampTorque(u: string): PhysicalClamps | undefined {
  if (u === 'nm')                         return { max: 1000 }
  if (u === '%')                          return { max: 150 }    // relative torque % — allow 50% above stock
  return undefined
}

function clampIgnition(u: string): PhysicalClamps | undefined {
  if (u === '°crk' || u === '°kw' || u === 'deg' || u === '°' ||
      u === 'crkdeg' || u === '°ca')      return { max: 30, min: -10 }
  return undefined
}

function clampEmission(u: string): PhysicalClamps | undefined {
  // Lambda — unitless or "-"
  if (u === '' || u === '-' || u === 'lambda' || u === 'l')
                                          return { max: 1.05, min: 0.75 }
  // Temperatures (°C, K) — don't clamp blindly; target-temp rises are usually fine
  if (u === '%')                          return { max: 100 }    // EGR rate, duty, etc.
  return undefined
}

function clampSmoke(u: string): PhysicalClamps | undefined {
  // Smoke limiters are typically mg/stk or mg — same family as fuel
  return clampFuel(u)
}

function clampLimiter(_u: string): PhysicalClamps | undefined {
  // Limiters (RPM, VMAX, etc.) — intentionally no clamp. Raising a limiter is the
  // point; user picks how much. If we clamp here we'd cap rev limiter raises etc.
  return undefined
}

export function getPhysicalClamps(category: MapCategory, unit: string | undefined): PhysicalClamps | undefined {
  const u = normUnit(unit)
  switch (category) {
    case 'boost':    return clampBoost(u)
    case 'fuel':     return clampFuel(u)
    case 'torque':   return clampTorque(u)
    case 'ignition': return clampIgnition(u)
    case 'emission': return clampEmission(u)
    case 'smoke':    return clampSmoke(u)
    case 'limiter':  return clampLimiter(u)
    default:         return undefined
  }
}

// ─── Convert physical clamps to raw storage clamps ────────────────────────────
// raw = (phys - offsetVal) / factor
// Falls back to undefined if factor is invalid (0 or not finite).
export function physicalToRawClamps(
  phys: PhysicalClamps | undefined,
  factor: number | undefined,
  offsetVal: number | undefined,
  dtype: string | undefined,
): { clampMax?: number; clampMin?: number } {
  if (!phys || !factor || !isFinite(factor) || factor === 0) return {}
  const off = offsetVal ?? 0
  const result: { clampMax?: number; clampMin?: number } = {}
  if (phys.max !== undefined) result.clampMax = (phys.max - off) / factor
  if (phys.min !== undefined) result.clampMin = (phys.min - off) / factor
  // If factor is negative (rare — e.g. inverse scaling), swap max/min so the
  // raw-domain clamps still represent the correct physical bounds.
  if (factor < 0 && result.clampMax !== undefined && result.clampMin !== undefined) {
    [result.clampMax, result.clampMin] = [result.clampMin, result.clampMax]
  }
  // Round to integer for int dtypes — float32 keeps precision
  if (dtype !== 'float32') {
    if (result.clampMax !== undefined) result.clampMax = Math.round(result.clampMax)
    if (result.clampMin !== undefined) result.clampMin = Math.round(result.clampMin)
  }
  return result
}
