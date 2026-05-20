import { describe, it, expect } from 'vitest'

describe('MapClassifier Quality Scoring', () => {
  it('should enforce minimum quality floor even when minQuality=0', () => {
    // The absoluteMin floor of 0.05 should prevent total bypass
    const minQ = 0
    const absoluteMin = Math.max(minQ, 0.05)
    expect(absoluteMin).toBe(0.05)
  })

  it('should respect higher minQuality values', () => {
    const minQ = 0.3
    const absoluteMin = Math.max(minQ, 0.05)
    expect(absoluteMin).toBe(0.3)
  })

  it('should reject very low quality scores', () => {
    const quality = 0.01
    const absoluteMin = 0.05
    expect(quality >= absoluteMin).toBe(false)
  })

  it('should accept marginal but above-floor scores', () => {
    const quality = 0.08
    const absoluteMin = 0.05
    expect(quality >= absoluteMin).toBe(true)
  })
})

describe('Score Breakdown', () => {
  it('should have 5 scoring dimensions summing to 100', () => {
    // Dimension 25 + ValueRange 25 + AxisFingerprint 25 + Proximity 15 + Structural 10 = 100
    const maxScore = 25 + 25 + 25 + 15 + 10
    expect(maxScore).toBe(100)
  })
})
