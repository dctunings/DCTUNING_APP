/**
 * Backwards-compatible ECU_DEFINITIONS re-export
 * During migration, import from here instead of ecuDefinitions.ts
 * This will lazy-load all families on first access.
 */

import type { EcuDef } from '../ecuDefinitions'
import { loadAllEcus } from './index'

let cachedDefinitions: EcuDef[] | null = null

export async function getEcuDefinitions(): Promise<EcuDef[]> {
  if (!cachedDefinitions) {
    cachedDefinitions = await loadAllEcus()
  }
  return cachedDefinitions
}

// For sync code that can't await, use the old import temporarily
// TODO: Refactor all consumers to use async getEcuDefinitions()
export { ECU_DEFINITIONS } from '../ecuDefinitions'
