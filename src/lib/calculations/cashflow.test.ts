import { describe, expect, it } from 'vitest'
import { buildCashFlow, escalate } from './cashflow'

describe('escalate', () => {
  it('returns the base value unchanged in year 1', () => {
    expect(escalate(100, 5, 1)).toBe(100)
  })

  it('compounds by the given percentage per year', () => {
    expect(escalate(100, 10, 3)).toBeCloseTo(121, 6)
  })

  it('handles zero escalation', () => {
    expect(escalate(50, 0, 10)).toBe(50)
  })
})

describe('buildCashFlow', () => {
  it('computes cumulative savings and a null payback when never recouped', () => {
    const result = buildCashFlow({
      investment: 10000,
      horizonYears: 5,
      baselineAnnualCost: () => 100,
      scenarioAnnualCost: () => 100,
    })
    expect(result.totalSavings).toBe(0)
    expect(result.paybackYear).toBeNull()
    expect(result.netBenefit).toBe(-10000)
  })

  it('finds an exact-year payback when savings land exactly on a year boundary', () => {
    const result = buildCashFlow({
      investment: 1000,
      horizonYears: 5,
      baselineAnnualCost: () => 500,
      scenarioAnnualCost: () => 0,
    })
    // cumulative savings: 500, 1000, 1500... crosses 0 net exactly at year 2
    expect(result.paybackYear).toBeCloseTo(2, 6)
    expect(result.rows).toHaveLength(5)
    expect(result.rows[1].netCashFlow).toBe(0)
  })

  it('interpolates a fractional payback year within the crossing year', () => {
    const result = buildCashFlow({
      investment: 750,
      horizonYears: 3,
      baselineAnnualCost: () => 500,
      scenarioAnnualCost: () => 0,
    })
    // year1 net = -250, year2 net = 250 -> crosses halfway through year 2
    expect(result.paybackYear).toBeCloseTo(1.5, 6)
  })

  it('never reports a payback beyond the horizon', () => {
    const result = buildCashFlow({
      investment: 100000,
      horizonYears: 4,
      baselineAnnualCost: () => 500,
      scenarioAnnualCost: () => 0,
    })
    expect(result.paybackYear).toBeNull()
    expect(result.netBenefit).toBeLessThan(0)
  })
})
