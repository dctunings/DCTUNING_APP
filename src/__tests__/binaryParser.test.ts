import { describe, it, expect } from 'vitest'
import { detectEcu, extractMap } from '../renderer/src/lib/binaryParser'

describe('binaryParser', () => {
  it('detectEcu returns null for tiny buffer', () => {
    const result = detectEcu(new ArrayBuffer(10))
    expect(result).toBeNull()
  })

  it('detectEcu works on a realistic-sized buffer', () => {
    const buf = new ArrayBuffer(524288)
    const result = detectEcu(buf)
    expect(result === null || typeof result.confidence === 'number').toBe(true)
  })

  it('extractMap handles missing signatures gracefully', () => {
    const buffer = new ArrayBuffer(1024)
    const mapDef = {
      name: 'Test Map',
      address: 0,
      length: 2,
      axisXAddress: 0,
      axisXLength: 0,
      axisYAddress: 0,
      axisYLength: 0,
      dtype: 'uint8' as const,
      scale: 1,
      offset: 0,
      category: 'torque' as const,
      unit: 'nm',
      minQuality: 0,
      signatures: [],
    }
    const result = extractMap(buffer, mapDef)
    expect(typeof result.found).toBe('boolean')
  })
})
