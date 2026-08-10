/** Twelve monthly values, index 0 = January .. index 11 = December. */
export type MonthlyValues = number[]

export interface CashFlowYearRow {
  year: number
  baselineCost: number
  scenarioCost: number
  annualSavings: number
  cumulativeSavings: number
  /** cumulativeSavings - investment, i.e. running net position of the project. */
  netCashFlow: number
}

export interface CashFlowResult {
  rows: CashFlowYearRow[]
  investment: number
  /** Fractional year at which netCashFlow crosses zero, or null if it never does within the horizon. */
  paybackYear: number | null
  /** Cumulative savings at the end of the horizon (excludes investment). */
  totalSavings: number
  /** netCashFlow at the end of the horizon. */
  netBenefit: number
}

export type SystemCostMode = 'fixed-per-kw' | 'split'

/**
 * The 4 alternative ESO settlement schemes for a "gaminantis vartotojas" (2026 rates). A prosumer
 * picks exactly one - they are mutually exclusive, not combined.
 */
export type SettlementMethodId = 'per-kwh-fee' | 'capacity-fee' | 'percentage' | 'tariff-manual'

/**
 * `'none'` - full grid export using the selected settlement method.
 * `'no-export'` - battery only, any surplus beyond battery capacity is curtailed/wasted.
 * `'export-residual'` - battery first, leftover surplus/deficit settled via the selected method.
 */
export type BatteryMode = 'none' | 'no-export' | 'export-residual'

export interface SolarInputs {
  electricityPriceNow: number
  electricityPriceEscalationPct: number

  settlementMethod: SettlementMethodId
  perKwhFeeNow: number
  perKwhFeeEscalationPct: number
  capacityFeePerKwMonth: number
  capacityFeeEscalationPct: number
  percentageRetainedByEso: number
  tariffManualPerKwh: number
  tariffManualEscalationPct: number

  capacityKw: number
  systemCostMode: SystemCostMode
  fixedPricePerKw: number
  panelsCost: number
  inverterCost: number
  otherCosts: number

  /** Whether ESO has restricted this connection's export power below the installed capacity. */
  hasExportPowerLimit: boolean
  /** Permitted export power (kW) when hasExportPowerLimit is true - can be far below capacityKw. */
  exportPowerLimitKw: number

  /** Annual reserve (EUR, year-1 value) for maintenance and possible failures (inverter replacement, minor repairs), escalated yearly like other running costs. */
  annualMaintenanceCost: number
  maintenanceCostEscalationPct: number

  useDirectProduction: boolean
  annualYieldKwhPerKwp: number
  directMonthlyProductionKwh: MonthlyValues
  /** Annual PV output decline (%) from panel ageing, compounded from year 1 onward. */
  panelDegradationPct: number

  annualConsumptionKwh: number
  useMonthlyConsumption: boolean
  directMonthlyConsumptionKwh: MonthlyValues

  batteryMode: BatteryMode
  batteryCapacityKwh: number
  batteryCost: number
  batteryRoundTripEfficiencyPct: number
  /** Annual battery capacity fade (%), compounded from year 1 onward - typically faster than panel degradation. */
  batteryDegradationPct: number
  /** Share (0-100) of nameplate capacity actually cyclable, approximating BMS charge/discharge limits (e.g. not charged to 100% or drained to 0% for longevity/safety). */
  batteryUsableCapacityPct: number
  /** Assumed share (0-100) of daily consumption that happens during daylight/production hours. */
  daytimeConsumptionShare: number
}

export interface HeatingInputs {
  fuelAnnualConsumption: number
  fuelPriceNow: number
  fuelPriceEscalationPct: number
  fuelEnergyContentKwhPerUnit: number
  boilerEfficiencyPct: number

  heatPumpCop: number
  heatPumpPrice: number
  installationCost: number

  electricityPriceNow: number
  electricityPriceEscalationPct: number
}
