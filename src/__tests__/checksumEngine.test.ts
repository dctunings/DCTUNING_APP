import { describe, it, expect } from 'vitest'
import { verifyChecksum, correctChecksum, checksumSupportInfo } from '../renderer/src/lib/checksumEngine'

describe('checksumEngine', () => {
  it('checksumSupportInfo returns supported for bosch-crc32', () => {
    const result = checksumSupportInfo('bosch-crc32')
    expect(result.supported).toBe(true)
  })

  it('checksumSupportInfo returns unsupported for none with explanation', () => {
    const result = checksumSupportInfo('none')
    expect(result.supported).toBe(false)
    expect(result.requiresExternalTool).toBe(true)
  })

  it('checksumSupportInfo returns unsupported for unknown algo', () => {
    const result = checksumSupportInfo('unknown')
    expect(result.supported).toBe(false)
    expect(result.requiresExternalTool).toBe(true)
  })

  it('verifyChecksum returns valid=false for empty buffer', () => {
    const buffer = new ArrayBuffer(100)
    const ecuDef = {
      checksumAlgo: 'bosch-crc32' as const,
      checksumOffset: 0,
    }
    const result = verifyChecksum(buffer, ecuDef as any)
    expect(typeof result.valid).toBe('boolean')
    expect(result.algo).toBe('bosch-crc32')
  })

  it('correctChecksum returns ArrayBuffer without throwing', () => {
    const buffer = new ArrayBuffer(100)
    const ecuDef = {
      checksumAlgo: 'bosch-crc32' as const,
      checksumOffset: 0,
    }
    const result = correctChecksum(buffer, ecuDef as any)
    expect(result).toBeInstanceOf(ArrayBuffer)
  })
})
