import { describe, expect, it } from 'vitest'
import {
  computeAllSolarVariants,
  computeMonthlyBreakdown,
  computeSolarAnnualCost,
  computeSolarScenario,
  computeSystemInvestment,
  distributeByShares,
  distributeEvenly,
  estimateBatteryCostEur,
  exportableEnergyFraction,
  getSettlementMethodParams,
  simulateBatteryMonths,
  simulateNetMetering,
  simulateNetMeteringMonthly,
  SOLAR_VARIANTS,
} from './solar'
import type { SolarInputs } from './types'

const shares = [0.02, 0.04, 0.08, 0.11, 0.13, 0.14, 0.14, 0.12, 0.09, 0.06, 0.04, 0.03]

function baseInputs(overrides: Partial<SolarInputs> = {}): SolarInputs {
  return {
    electricityPriceNow: 0.2,
    electricityPriceEscalationPct: 0,
    settlementMethod: 'per-kwh-fee',
    perKwhFeeNow: 0.0726,
    perKwhFeeEscalationPct: 0,
    capacityFeePerKwMonth: 5.0336,
    capacityFeeEscalationPct: 0,
    percentageRetainedByEso: 37,
    tariffManualPerKwh: 0.05,
    tariffManualEscalationPct: 0,
    capacityKw: 10,
    systemCostMode: 'fixed-per-kw',
    fixedPricePerKw: 1000,
    panelsCost: 0,
    inverterCost: 0,
    otherCosts: 0,
    hasExportPowerLimit: false,
    exportPowerLimitKw: 0,
    threePhaseSyncMode: false,
    phaseAsymmetryFactor: 0,
    expiredCreditCompensationPerKwh: 0,
    annualMaintenanceCost: 0,
    maintenanceCostEscalationPct: 0,
    useDirectProduction: false,
    annualYieldKwhPerKwp: 1000,
    directMonthlyProductionKwh: [],
    panelDegradationPct: 0,
    annualConsumptionKwh: 6000,
    useMonthlyConsumption: false,
    directMonthlyConsumptionKwh: [],
    batteryMode: 'none',
    batteryCapacityKwh: 0,
    batteryCost: 0,
    batteryRoundTripEfficiencyPct: 90,
    batteryDegradationPct: 0,
    batteryUsableCapacityPct: 100,
    daytimeConsumptionShare: 35,
    ...overrides,
  }
}

describe('distribution helpers', () => {
  it('distributeEvenly splits total across 12 equal months', () => {
    const result = distributeEvenly(1200)
    expect(result).toHaveLength(12)
    expect(result.every((v) => v === 100)).toBe(true)
  })

  it('distributeByShares scales by each month share', () => {
    const result = distributeByShares(1000, [0.5, 0.5])
    expect(result).toEqual([500, 500])
  })
})

describe('simulateNetMetering', () => {
  it('draws deficits from the banked surplus before buying at normal price', () => {
    // Summer (June) surplus of 100, deficits only in the following months -> fully covered by the bank.
    const surplus = [0, 0, 0, 0, 0, 100, 0, 0, 0, 0, 0, 0]
    const deficit = [0, 0, 0, 0, 0, 0, 10, 10, 10, 10, 10, 10]
    const result = simulateNetMetering(surplus, deficit, 1)
    expect(result.retrievedFromBank).toBe(60)
    expect(result.boughtAtNormalPrice).toBe(0)
  })

  it('buys remaining deficit at normal price once the bank is exhausted', () => {
    const surplus = [0, 0, 0, 0, 0, 50, 0, 0, 0, 0, 0, 0]
    const deficit = [0, 0, 0, 0, 0, 0, 20, 20, 20, 20, 20, 20]
    const result = simulateNetMetering(surplus, deficit, 1)
    expect(result.retrievedFromBank).toBe(50)
    expect(result.boughtAtNormalPrice).toBe(70)
  })

  it('carries unused credit from the previous December into January (rolling 24-month window, no calendar-year reset)', () => {
    // January deficit is covered by credit rolled over from last June's surplus (still well within
    // its 24-month window), since the same production/consumption pattern is assumed to repeat yearly.
    const surplus = [0, 0, 0, 0, 0, 100, 0, 0, 0, 0, 0, 0]
    const deficit = [10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    const result = simulateNetMetering(surplus, deficit, 1)
    expect(result.boughtAtNormalPrice).toBe(0)
    expect(result.retrievedFromBank).toBe(10)
  })

  it('applies the credit factor to banked surplus (percentage method haircut)', () => {
    const surplus = [0, 0, 0, 0, 0, 100, 0, 0, 0, 0, 0, 0]
    const deficit = [0, 0, 0, 0, 0, 0, 50, 0, 0, 0, 0, 0]
    const result = simulateNetMetering(surplus, deficit, 0.63)
    expect(result.retrievedFromBank).toBe(50)
    expect(result.boughtAtNormalPrice).toBe(0)

    const scarce = simulateNetMetering(surplus, [0, 0, 0, 0, 0, 0, 70, 0, 0, 0, 0, 0], 0.63)
    expect(scarce.retrievedFromBank).toBeCloseTo(63, 6)
    expect(scarce.boughtAtNormalPrice).toBeCloseTo(7, 6)
  })
})

describe('simulateNetMeteringMonthly', () => {
  it('tracks the running bank balance month by month and matches the annual totals', () => {
    const surplus = [0, 0, 0, 0, 0, 100, 0, 0, 0, 0, 0, 0]
    const deficit = [0, 0, 0, 0, 0, 0, 10, 10, 10, 10, 10, 10]
    const monthly = simulateNetMeteringMonthly(surplus, deficit, 1)
    expect(monthly.bankBalance[5]).toBe(200)
    expect(monthly.bankBalance[6]).toBe(190)
    expect(monthly.bankBalance[11]).toBe(140)
    expect(monthly.retrievedFromBank.reduce((sum, v) => sum + v, 0)).toBe(60)
    expect(monthly.boughtAtNormalPrice.reduce((sum, v) => sum + v, 0)).toBe(0)
  })

  it('expires credit that is never drawn down after 24 months instead of accumulating forever', () => {
    // Surplus every year in March, never used - under a rolling 24-month window each March's batch
    // overlaps with the previous year's (still valid, only 12 months old), so the balance settles
    // at 2 years' worth (60) rather than growing without bound or flatlining at a single year's (30).
    const surplus = [0, 0, 30, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    const deficit = new Array(12).fill(0)
    const monthly = simulateNetMeteringMonthly(surplus, deficit, 1)
    expect(monthly.bankBalance[2]).toBe(60)
  })

  it('reports expired credits when banked surplus is never consumed', () => {
    // Only surplus in March, no deficit - each March's batch expires 24 months later.
    // In steady state, 30 kWh expire each March.
    const surplus = [0, 0, 30, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    const deficit = new Array(12).fill(0)
    const monthly = simulateNetMeteringMonthly(surplus, deficit, 1)
    const totalExpired = monthly.expiredCredits.reduce((s, v) => s + v, 0)
    expect(totalExpired).toBeCloseTo(30, 5)
  })
})

describe('expired credit compensation', () => {
  it('reduces annual cost when expired credits are compensated', () => {
    // Large surplus, no deficit - all surplus expires after 24 months.
    // With compensation > 0 the annual cost should be lower.
    const base = baseInputs({ annualYieldKwhPerKwp: 2000, capacityKw: 5, annualConsumptionKwh: 100 })
    const noComp = computeSolarAnnualCost(
      { ...base, expiredCreditCompensationPerKwh: 0 },
      distributeByShares(10000, shares),
      distributeEvenly(100),
      'none',
      'per-kwh-fee',
      0,
    )
    const withComp = computeSolarAnnualCost(
      { ...base, expiredCreditCompensationPerKwh: 0.05 },
      distributeByShares(10000, shares),
      distributeEvenly(100),
      'none',
      'per-kwh-fee',
      0,
    )
    expect(withComp).toBeLessThan(noComp)
  })

  it('has no effect when all banked credits are consumed before expiry', () => {
    // Symmetric surplus/deficit: summer surplus exactly covers winter deficit, nothing expires.
    const base = baseInputs({ annualYieldKwhPerKwp: 1000, capacityKw: 3, annualConsumptionKwh: 3000 })
    const production = distributeByShares(3000, shares)
    const consumption = distributeEvenly(3000)
    const noComp = computeSolarAnnualCost({ ...base, expiredCreditCompensationPerKwh: 0 }, production, consumption, 'none', 'per-kwh-fee', 0)
    const withComp = computeSolarAnnualCost({ ...base, expiredCreditCompensationPerKwh: 0.1 }, production, consumption, 'none', 'per-kwh-fee', 0)
    // When no credits expire, compensation rate does not matter
    expect(withComp).toBeCloseTo(noComp, 2)
  })
})

describe('getSettlementMethodParams', () => {
  it('per-kwh-fee charges a per-kWh fee on retrieved energy with full credit', () => {
    const params = getSettlementMethodParams('per-kwh-fee', baseInputs(), 1)
    expect(params.creditFactor).toBe(1)
    expect(params.feeRatePerKwh).toBeCloseTo(0.0726, 6)
    expect(params.flatFeeAnnual).toBe(0)
  })

  it('capacity-fee charges a flat annual fee based on installed kW and no per-kWh fee', () => {
    const params = getSettlementMethodParams('capacity-fee', baseInputs({ capacityKw: 10 }), 1)
    expect(params.creditFactor).toBe(1)
    expect(params.feeRatePerKwh).toBe(0)
    expect(params.flatFeeAnnual).toBeCloseTo(5.0336 * 12 * 10, 6)
  })

  it('capacity-fee uses export limit kW (not installed kW) when hasExportPowerLimit is set', () => {
    const params = getSettlementMethodParams(
      'capacity-fee',
      baseInputs({ capacityKw: 10, hasExportPowerLimit: true, exportPowerLimitKw: 1 }),
      0,
    )
    expect(params.flatFeeAnnual).toBeCloseTo(5.0336 * 12 * 1, 6)
  })

  it('percentage retains a share of banked surplus with no cash fee', () => {
    const params = getSettlementMethodParams('percentage', baseInputs({ percentageRetainedByEso: 37 }), 1)
    expect(params.creditFactor).toBeCloseTo(0.63, 6)
    expect(params.feeRatePerKwh).toBe(0)
    expect(params.flatFeeAnnual).toBe(0)
  })

  it('tariff-manual charges the user-provided per-kWh rate', () => {
    const params = getSettlementMethodParams('tariff-manual', baseInputs({ tariffManualPerKwh: 0.09 }), 1)
    expect(params.feeRatePerKwh).toBeCloseTo(0.09, 6)
  })
})

describe('simulateBatteryMonths', () => {
  it('covers day and night load fully when battery capacity and efficiency are ample', () => {
    // June: production 100, consumption 40 (35% day / 65% night by default split).
    const production = [0, 0, 0, 0, 0, 100, 0, 0, 0, 0, 0, 0]
    const consumption = [0, 0, 0, 0, 0, 40, 0, 0, 0, 0, 0, 0]
    const result = simulateBatteryMonths(production, consumption, 100, 1)
    expect(result.residualDeficit[5]).toBeCloseTo(0, 6)
  })

  it('leaves a remaining night deficit when battery throughput or efficiency is limited', () => {
    const production = [0, 0, 0, 0, 0, 100, 0, 0, 0, 0, 0, 0]
    const consumption = [0, 0, 0, 0, 0, 40, 0, 0, 0, 0, 0, 0]
    // June has 30 days -> capacity 1 kWh/day caps daytime charging at 30 kWh, halved by efficiency.
    const result = simulateBatteryMonths(production, consumption, 1, 0.5)
    const dayConsumption = 40 * 0.35
    const nightConsumption = 40 * 0.65
    const daytimeSurplus = 100 - Math.min(100, dayConsumption)
    const chargeable = Math.min(daytimeSurplus, 1 * 30)
    const expectedRemainingNightDeficit = nightConsumption - chargeable * 0.5
    expect(result.residualDeficit[5]).toBeCloseTo(expectedRemainingNightDeficit, 6)
    expect(result.residualSurplus[5]).toBeCloseTo(daytimeSurplus - chargeable, 6)
  })

  it('buys all consumption from the grid when there is no production at all', () => {
    const production = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    const consumption = [60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    const result = simulateBatteryMonths(production, consumption, 100, 1)
    expect(result.residualDeficit[0]).toBe(60)
    expect(result.residualSurplus[0]).toBe(0)
  })

  it('spills excess daytime surplus over as residual surplus once the battery has covered the whole night, instead of discarding it', () => {
    // June: production 100, consumption 40 (35% day / 65% night) -> night only needs 26 kWh, but a
    // 100 kWh battery could otherwise "absorb" the full 86 kWh daytime surplus.
    const production = [0, 0, 0, 0, 0, 100, 0, 0, 0, 0, 0, 0]
    const consumption = [0, 0, 0, 0, 0, 40, 0, 0, 0, 0, 0, 0]
    const result = simulateBatteryMonths(production, consumption, 100, 1)
    expect(result.residualDeficit[5]).toBeCloseTo(0, 6)
    expect(result.residualSurplus[5]).toBeCloseTo(86 - 26, 6)
  })

  it('shrinks the effective daily throughput cap when usableCapacityFraction is below 1', () => {
    // June has 30 days -> a 1 kWh nameplate battery with 80% usable capacity caps daytime charging
    // at 0.8 kWh/day * 30 days = 24 kWh, instead of the full 30 kWh at 100% usable capacity.
    const production = [0, 0, 0, 0, 0, 100, 0, 0, 0, 0, 0, 0]
    const consumption = [0, 0, 0, 0, 0, 40, 0, 0, 0, 0, 0, 0]
    const fullyUsable = simulateBatteryMonths(production, consumption, 1, 1, 0.35, 1)
    const partlyUsable = simulateBatteryMonths(production, consumption, 1, 1, 0.35, 0.8)
    expect(partlyUsable.chargedToBattery[5]).toBeCloseTo(24, 6)
    expect(partlyUsable.chargedToBattery[5]).toBeLessThan(fullyUsable.chargedToBattery[5])
    expect(partlyUsable.residualDeficit[5]).toBeGreaterThan(fullyUsable.residualDeficit[5])
  })
})

describe('computeSystemInvestment', () => {
  it('uses capacity * price/kW in fixed mode', () => {
    expect(computeSystemInvestment(baseInputs())).toBe(10000)
  })

  it('sums panels + inverter in split mode', () => {
    const investment = computeSystemInvestment(
      baseInputs({ systemCostMode: 'split', panelsCost: 6000, inverterCost: 2000, otherCosts: 500 }),
    )
    expect(investment).toBe(8500)
  })

  it('adds battery cost only when a battery mode is selected', () => {
    const noBattery = computeSystemInvestment(baseInputs({ batteryMode: 'none', batteryCost: 3000 }))
    const battery = computeSystemInvestment(baseInputs({ batteryMode: 'no-export', batteryCost: 3000 }))
    expect(noBattery).toBe(10000)
    expect(battery).toBe(13000)
  })
})

describe('computeSolarAnnualCost', () => {
  it('no-export battery mode ignores the settlement method entirely (no export, no fees)', () => {
    const inputs = baseInputs({ batteryMode: 'no-export', capacityFeePerKwMonth: 999 })
    const production = [0, 0, 0, 0, 0, 100, 0, 0, 0, 0, 0, 0]
    const consumption = [0, 0, 0, 0, 0, 40, 0, 0, 0, 0, 0, 0]
    const cost = computeSolarAnnualCost(inputs, production, consumption, 'no-export', 'capacity-fee', 1)
    expect(cost).toBeGreaterThanOrEqual(0)
    // Verify no capacity fee leaked into a no-export scenario.
    expect(cost).toBeLessThan(999 * 10)
  })

  it('applies panel degradation cumulatively, raising later-year grid cost for the same load', () => {
    const inputs = baseInputs({ batteryMode: 'no-export', panelDegradationPct: 10 })
    const production = new Array(12).fill(50)
    const consumption = new Array(12).fill(100)
    const yearOneCost = computeSolarAnnualCost(inputs, production, consumption, 'no-export', 'per-kwh-fee', 1)
    const yearTenCost = computeSolarAnnualCost(inputs, production, consumption, 'no-export', 'per-kwh-fee', 10)
    expect(yearTenCost).toBeGreaterThan(yearOneCost)
  })
})

describe('computeSolarScenario', () => {
  it('produces a 20-year cash flow with a finite payback for a well-sized system', () => {
    const result = computeSolarScenario(baseInputs({ fixedPricePerKw: 500 }), shares)
    expect(result.rows).toHaveLength(20)
    expect(result.paybackYear).not.toBeNull()
    expect(result.netBenefit).toBeGreaterThan(0)
  })

  it('never pays back an oversized, overpriced system within the horizon', () => {
    const result = computeSolarScenario(baseInputs({ fixedPricePerKw: 100000, capacityKw: 1 }), shares)
    expect(result.paybackYear).toBeNull()
  })

  it('respects a custom horizon length', () => {
    const result = computeSolarScenario(baseInputs({ fixedPricePerKw: 500 }), shares, 10)
    expect(result.rows).toHaveLength(10)
  })
})

describe('computeAllSolarVariants', () => {
  it('returns one result per defined variant', () => {
    const results = computeAllSolarVariants(baseInputs({ fixedPricePerKw: 500 }), shares)
    expect(results).toHaveLength(SOLAR_VARIANTS.length)
    expect(results.every((r) => r.result.rows.length === 20)).toBe(true)
  })
})

describe('computeMonthlyBreakdown', () => {
  it('returns 12 rows summing to the annual production/consumption totals (no battery)', () => {
    const inputs = baseInputs({ annualYieldKwhPerKwp: 1000, capacityKw: 10, annualConsumptionKwh: 6000 })
    const rows = computeMonthlyBreakdown(inputs, shares)
    expect(rows).toHaveLength(12)
    expect(rows.reduce((sum, r) => sum + r.production, 0)).toBeCloseTo(10000, 5)
    expect(rows.reduce((sum, r) => sum + r.consumption, 0)).toBeCloseTo(6000, 5)
  })

  it('reflects the battery split when a battery mode is selected', () => {
    const withoutBattery = computeMonthlyBreakdown(
      baseInputs({
        annualYieldKwhPerKwp: 1000,
        capacityKw: 10,
        annualConsumptionKwh: 6000,
        batteryMode: 'no-export',
        batteryCapacityKwh: 0,
      }),
      shares,
    )
    const withBattery = computeMonthlyBreakdown(
      baseInputs({
        annualYieldKwhPerKwp: 1000,
        capacityKw: 10,
        annualConsumptionKwh: 6000,
        batteryMode: 'no-export',
        batteryCapacityKwh: 10,
      }),
      shares,
    )
    const summerMonth = 6
    // A bigger battery should let the household draw down less from the grid in a sunny month.
    expect(withBattery[summerMonth].deficit).toBeLessThanOrEqual(withoutBattery[summerMonth].deficit)
  })
})

describe('exportableEnergyFraction', () => {
  it('allows full export when there is no limit or the limit is at/above capacity', () => {
    expect(exportableEnergyFraction(Infinity, 10)).toBe(1)
    expect(exportableEnergyFraction(10, 10)).toBe(1)
    expect(exportableEnergyFraction(20, 10)).toBe(1)
  })

  it('blocks everything when the permitted power is zero', () => {
    expect(exportableEnergyFraction(0, 10)).toBe(0)
  })

  it('delivers more than half the energy at half the peak power (bell-shaped curve)', () => {
    // Most of a day's solar output happens well below peak power, so capping at 50% of peak still
    // lets more than 50% of the energy through.
    expect(exportableEnergyFraction(5, 10)).toBeCloseTo(0.6576, 3)
  })
})

describe('export power limit', () => {
  it('curtails surplus beyond the permitted export power instead of exporting it all', () => {
    const inputs = baseInputs({
      annualYieldKwhPerKwp: 1000,
      capacityKw: 10,
      annualConsumptionKwh: 0,
      hasExportPowerLimit: true,
      exportPowerLimitKw: 1,
    })
    const rows = computeMonthlyBreakdown(inputs, shares)
    const totalExported = rows.reduce((sum, r) => sum + r.exported, 0)
    const totalCurtailed = rows.reduce((sum, r) => sum + r.curtailedByExportLimit, 0)
    const totalProduction = rows.reduce((sum, r) => sum + r.production, 0)
    expect(totalCurtailed).toBeGreaterThan(0)
    expect(totalExported + totalCurtailed).toBeCloseTo(totalProduction, 5)
    expect(totalExported).toBeLessThan(totalProduction)
  })

  it('does not curtail no-export mode (nothing is ever sent to the grid anyway)', () => {
    const inputs = baseInputs({
      annualYieldKwhPerKwp: 1000,
      capacityKw: 10,
      annualConsumptionKwh: 0,
      batteryMode: 'no-export',
      hasExportPowerLimit: true,
      exportPowerLimitKw: 1,
    })
    const rows = computeMonthlyBreakdown(inputs, shares)
    expect(rows.every((r) => r.curtailedByExportLimit === 0)).toBe(true)
  })

  it('reduces the annual cost benefit when export power is heavily restricted', () => {
    const base = baseInputs({ annualYieldKwhPerKwp: 1200, capacityKw: 10, annualConsumptionKwh: 3000 })
    const unrestricted = computeSolarAnnualCost(
      base,
      distributeByShares(12000, shares),
      distributeEvenly(3000),
      'none',
      'per-kwh-fee',
      0,
    )
    const restricted = computeSolarAnnualCost(
      { ...base, hasExportPowerLimit: true, exportPowerLimitKw: 1 },
      distributeByShares(12000, shares),
      distributeEvenly(3000),
      'none',
      'per-kwh-fee',
      0,
    )
    // Curtailed energy can no longer be banked as credit, so more of the winter deficit must be
    // bought at full price instead - restricted export can only make the annual cost worse or equal.
    expect(restricted).toBeGreaterThanOrEqual(unrestricted)
  })

  it('3-phase sync mode with high asymmetry reduces effective export limit to 2/3', () => {
    // With capacityKw=10, exportPowerLimitKw=3, fraction ~ 0.426
    // With threePhaseSyncMode + phaseAsymmetryFactor=100: effective limit = 3*(1-100/300)=2kW, fraction ~0.294
    // => 3-phase high asymmetry must curtail more than single-phase with same limitKw
    const base = baseInputs({ annualYieldKwhPerKwp: 1200, capacityKw: 10, annualConsumptionKwh: 0 })
    const singlePhase = computeMonthlyBreakdown(
      { ...base, hasExportPowerLimit: true, exportPowerLimitKw: 3 },
      shares,
    )
    const threePhaseHigh = computeMonthlyBreakdown(
      { ...base, hasExportPowerLimit: true, exportPowerLimitKw: 3, threePhaseSyncMode: true, phaseAsymmetryFactor: 100 },
      shares,
    )
    const curtailedSingle = singlePhase.reduce((s, r) => s + r.curtailedByExportLimit, 0)
    const curtailedThreeHigh = threePhaseHigh.reduce((s, r) => s + r.curtailedByExportLimit, 0)
    expect(curtailedThreeHigh).toBeGreaterThan(curtailedSingle)
  })

  it('3-phase sync mode with asymmetryFactor=100 matches a single-phase effective limit of 2/3*limitKw', () => {
    const base = baseInputs({ annualYieldKwhPerKwp: 1200, capacityKw: 10, annualConsumptionKwh: 0 })
    const effectiveLimitKw = 3 * (1 - 100 / 300) // = 2
    const threePhaseHigh = computeMonthlyBreakdown(
      { ...base, hasExportPowerLimit: true, exportPowerLimitKw: 3, threePhaseSyncMode: true, phaseAsymmetryFactor: 100 },
      shares,
    )
    const singlePhaseEquivalent = computeMonthlyBreakdown(
      { ...base, hasExportPowerLimit: true, exportPowerLimitKw: effectiveLimitKw },
      shares,
    )
    threePhaseHigh.forEach((row, i) => {
      expect(row.curtailedByExportLimit).toBeCloseTo(singlePhaseEquivalent[i].curtailedByExportLimit, 6)
    })
  })

  it('3-phase sync mode with symmetric load (factor=0) does not add extra penalty', () => {
    const base = baseInputs({ annualYieldKwhPerKwp: 1200, capacityKw: 10, annualConsumptionKwh: 0 })
    const mono = computeMonthlyBreakdown(
      { ...base, hasExportPowerLimit: true, exportPowerLimitKw: 3 },
      shares,
    )
    const threePhaseSymmetric = computeMonthlyBreakdown(
      { ...base, hasExportPowerLimit: true, exportPowerLimitKw: 3, threePhaseSyncMode: true, phaseAsymmetryFactor: 0 },
      shares,
    )
    mono.forEach((row, i) => {
      expect(row.curtailedByExportLimit).toBeCloseTo(threePhaseSymmetric[i].curtailedByExportLimit, 6)
    })
  })
})

describe('estimateBatteryCostEur', () => {
  it('matches the known market data points exactly', () => {
    expect(estimateBatteryCostEur(5)).toBeCloseTo(1000, 5)
    expect(estimateBatteryCostEur(10)).toBeCloseTo(2000, 5)
    expect(estimateBatteryCostEur(15)).toBeCloseTo(2500, 5)
    expect(estimateBatteryCostEur(20)).toBeCloseTo(3000, 5)
  })

  it('interpolates linearly between two data points', () => {
    expect(estimateBatteryCostEur(7.5)).toBeCloseTo(1500, 5)
  })

  it('extrapolates below the smallest and above the largest data point', () => {
    expect(estimateBatteryCostEur(2.5)).toBeCloseTo(500, 5)
    expect(estimateBatteryCostEur(30)).toBeGreaterThan(3000)
  })

  it('returns 0 for a non-positive capacity', () => {
    expect(estimateBatteryCostEur(0)).toBe(0)
    expect(estimateBatteryCostEur(-5)).toBe(0)
  })
})

describe('annual maintenance cost', () => {
  it('adds the (escalated) maintenance reserve on top of the grid cost every year', () => {
    const base = baseInputs({ annualYieldKwhPerKwp: 1000, capacityKw: 3, annualConsumptionKwh: 3000 })
    const withoutMaintenance = computeSolarAnnualCost(base, distributeByShares(3000, shares), distributeEvenly(3000), 'none', 'per-kwh-fee', 1)
    const withMaintenance = computeSolarAnnualCost(
      { ...base, annualMaintenanceCost: 100, maintenanceCostEscalationPct: 0 },
      distributeByShares(3000, shares),
      distributeEvenly(3000),
      'none',
      'per-kwh-fee',
      1,
    )
    expect(withMaintenance - withoutMaintenance).toBeCloseTo(100, 5)
  })

  it('escalates the maintenance reserve year over year', () => {
    const base = baseInputs({
      annualYieldKwhPerKwp: 1000,
      capacityKw: 3,
      annualConsumptionKwh: 3000,
      annualMaintenanceCost: 100,
      maintenanceCostEscalationPct: 10,
    })
    const year1 = computeSolarAnnualCost(base, distributeByShares(3000, shares), distributeEvenly(3000), 'none', 'per-kwh-fee', 1)
    const year2 = computeSolarAnnualCost(base, distributeByShares(3000, shares), distributeEvenly(3000), 'none', 'per-kwh-fee', 2)
    expect(year2 - year1).toBeCloseTo(10, 5)
  })
})

describe('battery degradation', () => {
  it('reduces effective battery capacity (and therefore the benefit) in later years', () => {
    const base = baseInputs({
      annualYieldKwhPerKwp: 1200,
      capacityKw: 5,
      annualConsumptionKwh: 4000,
      batteryMode: 'no-export',
      batteryCapacityKwh: 10,
      batteryDegradationPct: 10,
    })
    const year1 = computeSolarAnnualCost(base, distributeByShares(6000, shares), distributeEvenly(4000), 'no-export', 'per-kwh-fee', 1)
    const year10 = computeSolarAnnualCost(base, distributeByShares(6000, shares), distributeEvenly(4000), 'no-export', 'per-kwh-fee', 10)
    // A degraded (smaller) battery covers less night load, so more must be bought from the grid later on.
    expect(year10).toBeGreaterThanOrEqual(year1)
  })

  it('does not affect no-battery mode (capacity is already forced to 0 there)', () => {
    const base = baseInputs({
      annualYieldKwhPerKwp: 1200,
      capacityKw: 5,
      annualConsumptionKwh: 4000,
      batteryMode: 'none',
      batteryCapacityKwh: 10,
      batteryDegradationPct: 10,
    })
    const year1 = computeSolarAnnualCost(base, distributeByShares(6000, shares), distributeEvenly(4000), 'none', 'per-kwh-fee', 1)
    const year10 = computeSolarAnnualCost(base, distributeByShares(6000, shares), distributeEvenly(4000), 'none', 'per-kwh-fee', 10)
    expect(year10).toBeCloseTo(year1, 5)
  })
})
