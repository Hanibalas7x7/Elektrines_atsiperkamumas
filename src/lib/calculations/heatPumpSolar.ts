import { buildCashFlow, escalate } from './cashflow'
import { computeAnnualHeatDemandKwh, computeHeatPumpElectricityKwh } from './heating'
import { computeSystemInvestment, deriveBatteryMode, distributeByShares, estimateBatteryCostEur, getMonthlyProduction, computeSolarAnnualCost } from './solar'
import { DEFAULT_HEATING_MONTHLY_SHARE, DEFAULT_HEAT_PUMP_FULL_LOAD_HOURS, HORIZON_YEARS } from './constants'
import type { CashFlowResult, HeatingInputs, MonthlyValues, SolarInputs } from './types'

/** Heat pump electricity demand spread across the year using a winter-heavy heating-season profile (the opposite shape from solar production). */
export function computeHeatPumpMonthlyElectricityKwh(
  inputs: HeatingInputs,
  monthlyShare: readonly number[] = DEFAULT_HEATING_MONTHLY_SHARE,
): MonthlyValues {
  return distributeByShares(computeHeatPumpElectricityKwh(inputs), monthlyShare)
}

/**
 * Rough recommended heat pump thermal power (kW), from annual heat demand and an assumed
 * full-load-hours figure. Rounded UP to the nearest 0.5 kW - undersizing a heat pump (can't keep
 * up on the coldest days) is a worse practical failure mode than oversizing it. This is only a
 * starting estimate; real sizing should use the building's actual peak heat loss.
 */
export function recommendHeatPumpPowerKw(
  inputs: HeatingInputs,
  fullLoadHours: number = DEFAULT_HEAT_PUMP_FULL_LOAD_HOURS,
): number {
  if (!(fullLoadHours > 0)) return 0
  const demandKw = computeAnnualHeatDemandKwh(inputs) / fullLoadHours
  return Math.max(0.5, Math.ceil(demandKw * 2) / 2)
}

/** Rough recommended solar capacity (kW) so annual production roughly matches annual consumption, rounded to the nearest 0.5 kW. */
export function recommendSolarCapacityKw(combinedAnnualConsumptionKwh: number, annualYieldKwhPerKwp: number): number {
  if (!(annualYieldKwhPerKwp > 0)) return 0
  const raw = combinedAnnualConsumptionKwh / annualYieldKwhPerKwp
  return Math.max(0.5, Math.round(raw * 2) / 2)
}

/**
 * Cash flow for replacing the current fuel heating with a heat pump, plus a solar + (optional)
 * battery system sized to offset the COMBINED household + heat pump electricity demand. Baseline
 * is the current state (fuel heating, household electricity bought fully from the grid, no
 * solar). `solarInputs`'s own consumption fields are ignored/overridden - the combined monthly
 * profile (household + heat pump) is always used instead, so the seasonal mismatch (heat pump
 * draws most in winter, when solar produces least) is fully reflected in the result.
 */
export function computeCombinedScenario(
  heatingInputs: HeatingInputs,
  solarInputs: SolarInputs,
  householdMonthlyConsumption: MonthlyValues,
  seasonalShares: readonly number[],
  horizonYears: number = HORIZON_YEARS,
): CashFlowResult {
  const heatPumpMonthly = computeHeatPumpMonthlyElectricityKwh(heatingInputs)
  const combinedMonthlyConsumption = householdMonthlyConsumption.map((v, i) => v + heatPumpMonthly[i])
  const effectiveSolarInputs: SolarInputs = {
    ...solarInputs,
    useMonthlyConsumption: true,
    directMonthlyConsumptionKwh: combinedMonthlyConsumption,
  }
  const monthlyProduction = getMonthlyProduction(effectiveSolarInputs, seasonalShares)
  const investment = computeSystemInvestment(effectiveSolarInputs) + heatingInputs.heatPumpPrice + heatingInputs.installationCost

  const householdAnnualConsumption = householdMonthlyConsumption.reduce((sum, v) => sum + v, 0)
  const baselineAnnualCost = (year: number) =>
    heatingInputs.fuelAnnualConsumption * escalate(heatingInputs.fuelPriceNow, heatingInputs.fuelPriceEscalationPct, year) +
    householdAnnualConsumption * escalate(solarInputs.electricityPriceNow, solarInputs.electricityPriceEscalationPct, year)

  const scenarioAnnualCost = (year: number) =>
    computeSolarAnnualCost(
      effectiveSolarInputs,
      monthlyProduction,
      combinedMonthlyConsumption,
      effectiveSolarInputs.batteryMode,
      effectiveSolarInputs.settlementMethod,
      year,
    )

  return buildCashFlow({ investment, horizonYears, baselineAnnualCost, scenarioAnnualCost })
}

export interface CombinedVariant {
  capacityKw: number
  batteryCapacityKwh: number
  result: CashFlowResult
}

/**
 * Computes {@link computeCombinedScenario} for every (solar capacity x battery capacity)
 * combination in the given candidate lists, so they can be ranked and compared side by side -
 * this is how "what solar size / is a battery worth it, and what capacity" gets answered, instead
 * of guessing a single configuration. All other assumptions (cost per kW, settlement method,
 * battery efficiency/degradation, export limits, etc.) are taken as-is from `baseSolarInputs`.
 */
export function computeCombinedVariants(
  heatingInputs: HeatingInputs,
  baseSolarInputs: SolarInputs,
  householdMonthlyConsumption: MonthlyValues,
  seasonalShares: readonly number[],
  horizonYears: number,
  capacityCandidatesKw: readonly number[],
  batteryCandidatesKwh: readonly number[],
): CombinedVariant[] {
  const exportSurplus = baseSolarInputs.batteryMode !== 'no-export'
  const variants: CombinedVariant[] = []

  for (const capacityKw of capacityCandidatesKw) {
    for (const batteryCapacityKwh of batteryCandidatesKwh) {
      const solarInputs: SolarInputs = {
        ...baseSolarInputs,
        capacityKw,
        // A 0 kW candidate means "no solar system at all" - zero out its cost fields too, so a
        // 'split' cost mode (flat panels/inverter/other sums, not scaled per kW) doesn't leave a
        // phantom system cost on the "no solar" row, and no maintenance is charged for a system
        // that doesn't exist.
        ...(capacityKw <= 0
          ? { systemCostMode: 'fixed-per-kw' as const, fixedPricePerKw: 0, panelsCost: 0, inverterCost: 0, otherCosts: 0, annualMaintenanceCost: 0 }
          : {}),
        batteryCapacityKwh,
        batteryCost: batteryCapacityKwh > 0 ? estimateBatteryCostEur(batteryCapacityKwh) : 0,
        batteryMode: deriveBatteryMode(batteryCapacityKwh > 0, exportSurplus),
      }
      const result = computeCombinedScenario(heatingInputs, solarInputs, householdMonthlyConsumption, seasonalShares, horizonYears)
      variants.push({ capacityKw, batteryCapacityKwh, result })
    }
  }

  return variants
}
