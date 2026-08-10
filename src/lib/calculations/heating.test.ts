import { describe, expect, it } from 'vitest'
import { computeAnnualHeatDemandKwh, computeHeatingScenario, computeHeatPumpElectricityKwh } from './heating'
import type { HeatingInputs } from './types'

function baseInputs(overrides: Partial<HeatingInputs> = {}): HeatingInputs {
  return {
    fuelAnnualConsumption: 10,
    fuelPriceNow: 60,
    fuelPriceEscalationPct: 0,
    fuelEnergyContentKwhPerUnit: 1700,
    boilerEfficiencyPct: 70,
    heatPumpCop: 3.2,
    heatPumpPrice: 6000,
    installationCost: 1000,
    electricityPriceNow: 0.2,
    electricityPriceEscalationPct: 0,
    ...overrides,
  }
}

describe('computeAnnualHeatDemandKwh', () => {
  it('multiplies consumption by energy content and boiler efficiency', () => {
    const demand = computeAnnualHeatDemandKwh(baseInputs())
    expect(demand).toBeCloseTo(10 * 1700 * 0.7, 6)
  })
})

describe('computeHeatPumpElectricityKwh', () => {
  it('divides heat demand by COP', () => {
    const inputs = baseInputs()
    const demand = computeAnnualHeatDemandKwh(inputs)
    expect(computeHeatPumpElectricityKwh(inputs)).toBeCloseTo(demand / 3.2, 6)
  })
})

describe('computeHeatingScenario', () => {
  it('finds a payback year when the heat pump is cheaper to run than fuel', () => {
    // Higher fuel price makes running the heat pump the cheaper option year to year.
    const result = computeHeatingScenario(baseInputs({ fuelPriceNow: 300 }))
    expect(result.rows).toHaveLength(20)
    expect(result.paybackYear).not.toBeNull()
  })

  it('never pays back when electricity is far pricier than the fuel it replaces', () => {
    const result = computeHeatingScenario(baseInputs({ electricityPriceNow: 5, heatPumpCop: 1 }))
    expect(result.paybackYear).toBeNull()
    expect(result.netBenefit).toBeLessThan(0)
  })
})
