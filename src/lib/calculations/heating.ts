import { buildCashFlow, escalate } from './cashflow'
import { HORIZON_YEARS } from './constants'
import type { CashFlowResult, HeatingInputs } from './types'

/** Useful heat energy actually delivered by the current fuel-based system, per year. */
export function computeAnnualHeatDemandKwh(inputs: HeatingInputs): number {
  return inputs.fuelAnnualConsumption * inputs.fuelEnergyContentKwhPerUnit * (inputs.boilerEfficiencyPct / 100)
}

/** Electricity the heat pump needs to deliver the same useful heat, based on its COP. */
export function computeHeatPumpElectricityKwh(inputs: HeatingInputs): number {
  return computeAnnualHeatDemandKwh(inputs) / inputs.heatPumpCop
}

export function computeHeatingScenario(
  inputs: HeatingInputs,
  horizonYears: number = HORIZON_YEARS,
): CashFlowResult {
  const electricityConsumption = computeHeatPumpElectricityKwh(inputs)
  const investment = inputs.heatPumpPrice + inputs.installationCost

  const baselineAnnualCost = (year: number) =>
    inputs.fuelAnnualConsumption * escalate(inputs.fuelPriceNow, inputs.fuelPriceEscalationPct, year)

  const scenarioAnnualCost = (year: number) =>
    electricityConsumption * escalate(inputs.electricityPriceNow, inputs.electricityPriceEscalationPct, year)

  return buildCashFlow({ investment, horizonYears, baselineAnnualCost, scenarioAnnualCost })
}
