import { describe, expect, it } from 'vitest'
import {
  computeCombinedScenario,
  computeCombinedVariants,
  computeHeatPumpMonthlyElectricityKwh,
  recommendHeatPumpPowerKw,
  recommendSolarCapacityKw,
} from './heatPumpSolar'
import { computeHeatPumpElectricityKwh } from './heating'
import { DEFAULT_HEATING_MONTHLY_SHARE } from './constants'
import type { HeatingInputs, SolarInputs } from './types'

function baseHeatingInputs(overrides: Partial<HeatingInputs> = {}): HeatingInputs {
  return {
    fuelAnnualConsumption: 10,
    fuelPriceNow: 60,
    fuelPriceEscalationPct: 5,
    fuelEnergyContentKwhPerUnit: 1700,
    boilerEfficiencyPct: 70,
    heatPumpCop: 3.2,
    heatPumpPrice: 6000,
    installationCost: 1500,
    electricityPriceNow: 0.2,
    electricityPriceEscalationPct: 0,
    ...overrides,
  }
}

function baseSolarInputs(overrides: Partial<SolarInputs> = {}): SolarInputs {
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
    annualConsumptionKwh: 0,
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

const shares = [0.02, 0.04, 0.08, 0.11, 0.13, 0.14, 0.14, 0.12, 0.09, 0.06, 0.04, 0.03]

describe('computeHeatPumpMonthlyElectricityKwh', () => {
  it('spreads the annual heat pump electricity demand by the heating-season monthly share', () => {
    const inputs = baseHeatingInputs()
    const annual = computeHeatPumpElectricityKwh(inputs)
    const result = computeHeatPumpMonthlyElectricityKwh(inputs)
    expect(result).toHaveLength(12)
    // DEFAULT_HEATING_MONTHLY_SHARE sums to ~1 (rounded estimate), so allow a small tolerance.
    expect(result.reduce((sum, v) => sum + v, 0)).toBeCloseTo(annual, 0)
    // January (heavy heating share) should be far bigger than July (near-zero heating share).
    expect(result[0]).toBeCloseTo(annual * DEFAULT_HEATING_MONTHLY_SHARE[0], 6)
    expect(result[0]).toBeGreaterThan(result[6])
  })
})

describe('recommendHeatPumpPowerKw', () => {
  it('divides annual heat demand by full-load hours and rounds up to the nearest 0.5 kW', () => {
    // Demand = 10 * 1700 * 0.7 = 11900 kWh; / 1800h = 6.61 kW -> rounds up to 7 kW.
    const inputs = baseHeatingInputs()
    expect(recommendHeatPumpPowerKw(inputs, 1800)).toBeCloseTo(7, 6)
  })

  it('never recommends below the 0.5 kW floor', () => {
    const inputs = baseHeatingInputs({ fuelAnnualConsumption: 0.001 })
    expect(recommendHeatPumpPowerKw(inputs, 1800)).toBe(0.5)
  })
})

describe('recommendSolarCapacityKw', () => {
  it('divides combined annual consumption by the assumed yield per kWp, rounded to the nearest 0.5 kW', () => {
    expect(recommendSolarCapacityKw(10000, 1000)).toBeCloseTo(10, 6)
    expect(recommendSolarCapacityKw(10200, 1000)).toBeCloseTo(10, 6)
    expect(recommendSolarCapacityKw(10300, 1000)).toBeCloseTo(10.5, 6)
  })
})

describe('computeCombinedScenario', () => {
  it('produces a positive investment covering both the heat pump and the solar system', () => {
    const heatingInputs = baseHeatingInputs({ fuelPriceNow: 300 })
    const solarInputs = baseSolarInputs({ capacityKw: 8, batteryCapacityKwh: 0, batteryMode: 'none' })
    const result = computeCombinedScenario(heatingInputs, solarInputs, new Array(12).fill(300), shares, 20)
    expect(result.investment).toBeCloseTo(8 * 1000 + 6000 + 1500, 6)
    expect(result.rows).toHaveLength(20)
  })

  it('finds a payback year when fuel is far pricier than the combined electricity cost', () => {
    const heatingInputs = baseHeatingInputs({ fuelPriceNow: 500 })
    const solarInputs = baseSolarInputs({ capacityKw: 8, batteryCapacityKwh: 0, batteryMode: 'none' })
    const result = computeCombinedScenario(heatingInputs, solarInputs, new Array(12).fill(200), shares, 20)
    expect(result.paybackYear).not.toBeNull()
  })
})

describe('computeCombinedVariants', () => {
  it('returns one result per (capacity x battery) combination', () => {
    const heatingInputs = baseHeatingInputs({ fuelPriceNow: 300 })
    const solarInputs = baseSolarInputs({ batteryMode: 'none' })
    const variants = computeCombinedVariants(
      heatingInputs,
      solarInputs,
      new Array(12).fill(300),
      shares,
      20,
      [5, 10],
      [0, 10],
    )
    expect(variants).toHaveLength(4)
    const noBattery = variants.find((v) => v.capacityKw === 10 && v.batteryCapacityKwh === 0)!
    const withBattery = variants.find((v) => v.capacityKw === 10 && v.batteryCapacityKwh === 10)!
    // Adding a battery costs more upfront - larger investment.
    expect(withBattery.result.investment).toBeGreaterThan(noBattery.result.investment)
  })

  it('zeroes out solar system cost fields for the 0 kW candidate even in split cost mode', () => {
    const heatingInputs = baseHeatingInputs({ fuelPriceNow: 300 })
    const solarInputs = baseSolarInputs({
      batteryMode: 'none',
      systemCostMode: 'split',
      panelsCost: 5000,
      inverterCost: 1500,
      otherCosts: 1000,
    })
    const variants = computeCombinedVariants(heatingInputs, solarInputs, new Array(12).fill(300), shares, 20, [0], [0])
    // Only the heat pump price + installation cost should remain - no phantom panels/inverter cost.
    expect(variants[0].result.investment).toBeCloseTo(heatingInputs.heatPumpPrice + heatingInputs.installationCost, 6)
  })
})
