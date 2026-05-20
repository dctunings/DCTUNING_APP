/**
 * ECU Definitions Dynamic Loader
 * v1.0.0 — Lazy-loads ECU families on demand
 */

import type { EcuDef } from '../ecuDefinitions'
import { ECU_FAMILIES, TOTAL_ECUS } from './manifest'
export { ECU_FAMILIES, TOTAL_ECUS }

// Cache for loaded families
const familyCache = new Map<string, EcuDef[]>()

/**
 * Load a specific ECU family by key (e.g. "Bosch_EDC17")
 */
export async function loadEcuFamily(familyKey: string): Promise<EcuDef[] | null> {
  if (familyCache.has(familyKey)) {
    return familyCache.get(familyKey)!
  }

  const familyInfo = ECU_FAMILIES.find(f =>
    f.file === familyKey + '.ts' ||
    f.exportName === familyKey
  )
  if (!familyInfo) return null

  try {
    const module = await import(`./${familyInfo.file.replace(/\.ts$/, '')}`)
    const defs = module[familyInfo.exportName] as EcuDef[]
    familyCache.set(familyKey, defs)
    return defs
  } catch (e) {
    console.error(`Failed to load ECU family ${familyKey}:`, e)
    return null
  }
}

/**
 * Find ECU definition by identifier string
 */
export async function findEcuByIdent(partialIdent: string): Promise<EcuDef | null> {
  for (const familyInfo of ECU_FAMILIES) {
    const defs = await loadEcuFamily(familyInfo.exportName)
    if (!defs) continue

    for (const ecu of defs) {
      for (const ident of ecu.identStrings) {
        if (ident.includes(partialIdent)) {
          return ecu
        }
      }
    }
  }
  return null
}

/**
 * Get all ECU definitions (loads all families — use sparingly)
 */
export async function loadAllEcus(): Promise<EcuDef[]> {
  const all: EcuDef[] = []
  for (const familyInfo of ECU_FAMILIES) {
    const defs = await loadEcuFamily(familyInfo.exportName)
    if (defs) all.push(...defs)
  }
  return all
}

export function clearFamilyCache(): void {
  familyCache.clear()
}
