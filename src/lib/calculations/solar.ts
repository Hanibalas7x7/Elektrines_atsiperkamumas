import { buildCashFlow, escalate } from './cashflow'
import { BATTERY_COST_ESTIMATE_POINTS, DAYS_IN_MONTH, HORIZON_YEARS, MONTHS_IN_YEAR } from './constants'
import type { BatteryMode, CashFlowResult, MonthlyValues, SettlementMethodId, SolarInputs } from './types'

/**
 * Rough market-price estimate (EUR) for a battery of the given capacity, by linear interpolation
 * (and edge extrapolation) between {@link BATTERY_COST_ESTIMATE_POINTS}. This is only a starting
 * hint, not a firm quote - see the data points' own caveat about real-world price variance.
 */
export function estimateBatteryCostEur(capacityKwh: number): number {
  const points = BATTERY_COST_ESTIMATE_POINTS
  if (!(capacityKwh > 0)) return 0
  const first = points[0]
  if (capacityKwh <= first.kwh) return (capacityKwh / first.kwh) * first.eur
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]
    const curr = points[i]
    if (capacityKwh <= curr.kwh) {
      const t = (capacityKwh - prev.kwh) / (curr.kwh - prev.kwh)
      return prev.eur + t * (curr.eur - prev.eur)
    }
  }
  const last = points[points.length - 1]
  const secondLast = points[points.length - 2]
  const slope = (last.eur - secondLast.eur) / (last.kwh - secondLast.kwh)
  return last.eur + slope * (capacityKwh - last.kwh)
}

/** Spreads an annual total evenly across 12 months. */
export function distributeEvenly(annualTotal: number): MonthlyValues {
  return Array.from({ length: MONTHS_IN_YEAR }, () => annualTotal / MONTHS_IN_YEAR)
}

/** Spreads an annual total across 12 months using the given seasonal shares (must sum to ~1). */
export function distributeByShares(annualTotal: number, shares: readonly number[]): MonthlyValues {
  return shares.map((share) => annualTotal * share)
}

export function getMonthlyProduction(inputs: SolarInputs, seasonalShares: readonly number[]): MonthlyValues {
  if (inputs.useDirectProduction) return inputs.directMonthlyProductionKwh
  const annual = inputs.capacityKw * inputs.annualYieldKwhPerKwp
  return distributeByShares(annual, seasonalShares)
}

export function getMonthlyConsumption(inputs: SolarInputs): MonthlyValues {
  if (inputs.useMonthlyConsumption) return inputs.directMonthlyConsumptionKwh
  return distributeEvenly(inputs.annualConsumptionKwh)
}

/**
 * `'none'` when exporting surplus without a battery, `'no-export'` when the connection can't (or
 * shouldn't) export at all, `'export-residual'` for battery-first-then-export.
 */
export function deriveBatteryMode(hasBattery: boolean, exportSurplus: boolean): BatteryMode {
  if (!exportSurplus) return 'no-export'
  return hasBattery ? 'export-residual' : 'none'
}

export interface MonthlySurplusDeficit {
  surplus: MonthlyValues
  deficit: MonthlyValues
}

/** Splits monthly production/consumption into monthly surplus (exportable) and deficit (must buy). */
export function computeMonthlySurplusDeficit(
  monthlyProduction: MonthlyValues,
  monthlyConsumption: MonthlyValues,
): MonthlySurplusDeficit {
  const surplus: MonthlyValues = []
  const deficit: MonthlyValues = []
  for (let m = 0; m < MONTHS_IN_YEAR; m++) {
    surplus.push(Math.max(monthlyProduction[m] - monthlyConsumption[m], 0))
    deficit.push(Math.max(monthlyConsumption[m] - monthlyProduction[m], 0))
  }
  return { surplus, deficit }
}

export interface NetMeteringResult {
  boughtAtNormalPrice: number
  retrievedFromBank: number
  /** Total kWh of banked credit that expired unused within the year (24-month window elapsed). */
  expiredCredits: number
}

export interface NetMeteringMonthlyResult {
  /** Monthly deficit still bought at full retail price after the bank is drawn down. */
  boughtAtNormalPrice: MonthlyValues
  /** Monthly deficit covered by previously banked (own, exported) kWh credit. */
  retrievedFromBank: MonthlyValues
  /** Credit bank balance (kWh) remaining at the end of each month. */
  bankBalance: MonthlyValues
  /** kWh of banked credit that expired unused each month (24-month window exhausted). */
  expiredCredits: MonthlyValues
}

/**
 * Simulates net-metering banking with a rolling 24-month credit window: each month's surplus
 * (scaled by creditFactor) is banked as a kWh credit that can cover a deficit in any of the
 * following 24 months (oldest credit drawn down first); credit not used within 24 months of being
 * banked expires. Lithuania's actual accumulation cycle is a fixed 2-year period (starting 1 April
 * of even years, not tied to a household's own installation date or to a calendar year/December),
 * approximated here as a rolling 24-month window since this calculator has no absolute calendar
 * reference. Since the given 12-month pattern is assumed to repeat every year, enough cycles are
 * simulated to reach steady state and only the last 12 months are returned.
 */
export function simulateNetMeteringMonthly(
  monthlySurplus: MonthlyValues,
  monthlyDeficit: MonthlyValues,
  creditFactor: number,
): NetMeteringMonthlyResult {
  const creditValidityMonths = 2 * MONTHS_IN_YEAR
  // Enough warm-up cycles for a 24-month window (2 years) to settle into steady state from an
  // empty starting queue - empirically, 2 cycles of history beyond the validity window suffice.
  const cycles = creditValidityMonths / MONTHS_IN_YEAR + 2
  const totalMonths = MONTHS_IN_YEAR * cycles
  // FIFO queue of credit batches still within their 24-month window, oldest first.
  const batches: { bankedMonth: number; amount: number }[] = []
  const boughtAtNormalPrice: MonthlyValues = []
  const retrievedFromBank: MonthlyValues = []
  const bankBalance: MonthlyValues = []
  const expiredCredits: MonthlyValues = []

  for (let i = 0; i < totalMonths; i++) {
    const m = i % MONTHS_IN_YEAR

    let expired = 0
    while (batches.length > 0 && i - batches[0].bankedMonth >= creditValidityMonths) {
      expired += batches[0].amount
      batches.shift() // credit older than 24 months expires, unused.
    }

    const banked = monthlySurplus[m] * creditFactor
    if (banked > 0) batches.push({ bankedMonth: i, amount: banked })

    let remainingDeficit = monthlyDeficit[m]
    let usedFromBank = 0
    for (const batch of batches) {
      if (remainingDeficit <= 0) break
      const used = Math.min(batch.amount, remainingDeficit)
      batch.amount -= used
      remainingDeficit -= used
      usedFromBank += used
    }
    while (batches.length > 0 && batches[0].amount <= 0) batches.shift()

    if (i >= totalMonths - MONTHS_IN_YEAR) {
      retrievedFromBank.push(usedFromBank)
      boughtAtNormalPrice.push(remainingDeficit)
      bankBalance.push(batches.reduce((sum, b) => sum + b.amount, 0))
      expiredCredits.push(expired)
    }
  }

  return { boughtAtNormalPrice, retrievedFromBank, bankBalance, expiredCredits }
}

/** Annual totals variant of {@link simulateNetMeteringMonthly}, used for the yearly cost calculation. */
export function simulateNetMetering(
  monthlySurplus: MonthlyValues,
  monthlyDeficit: MonthlyValues,
  creditFactor: number,
): NetMeteringResult {
  const monthly = simulateNetMeteringMonthly(monthlySurplus, monthlyDeficit, creditFactor)
  return {
    boughtAtNormalPrice: monthly.boughtAtNormalPrice.reduce((sum, v) => sum + v, 0),
    retrievedFromBank: monthly.retrievedFromBank.reduce((sum, v) => sum + v, 0),
    expiredCredits: monthly.expiredCredits.reduce((sum, v) => sum + v, 0),
  }
}

export interface SettlementMethodParams {
  /** Fraction of exported surplus kept as usable kWh credit (the percentage method retains less). */
  creditFactor: number
  /** Cash fee (€) charged per kWh retrieved from the bank. */
  feeRatePerKwh: number
  /** Flat annual network fee (€), independent of how much energy is retrieved. */
  flatFeeAnnual: number
}

/** Resolves the annual cost parameters for one of the 4 (mutually exclusive) ESO settlement methods. */
export function getSettlementMethodParams(
  method: SettlementMethodId,
  inputs: SolarInputs,
  year: number,
): SettlementMethodParams {
  switch (method) {
    case 'per-kwh-fee':
      return {
        creditFactor: 1,
        feeRatePerKwh: escalate(inputs.perKwhFeeNow, inputs.perKwhFeeEscalationPct, year),
        flatFeeAnnual: 0,
      }
    case 'capacity-fee':
      return {
        creditFactor: 1,
        feeRatePerKwh: 0,
        flatFeeAnnual:
          escalate(inputs.capacityFeePerKwMonth, inputs.capacityFeeEscalationPct, year) * 12 * inputs.capacityKw,
      }
    case 'percentage':
      return { creditFactor: 1 - inputs.percentageRetainedByEso / 100, feeRatePerKwh: 0, flatFeeAnnual: 0 }
    case 'tariff-manual':
      return {
        creditFactor: 1,
        feeRatePerKwh: escalate(inputs.tariffManualPerKwh, inputs.tariffManualEscalationPct, year),
        flatFeeAnnual: 0,
      }
  }
}

export interface BatteryMonthsResult {
  /** Monthly amount actually charged into the battery from daytime surplus (before discharge/losses). */
  chargedToBattery: MonthlyValues
  /** Monthly daytime surplus left over after charging the battery (exportable or curtailed). */
  residualSurplus: MonthlyValues
  /** Monthly load left unmet after battery discharge (day deficit + unmet night deficit). */
  residualDeficit: MonthlyValues
}

/**
 * Simulates a battery at daily resolution (averaged per month): daytime surplus charges the
 * battery (cycling at most once per day, capped at usable capacity * days-in-month) and is
 * discharged to cover night load, with round-trip losses. Returns what's left over on both sides.
 * Being a monthly-average model, it assumes the same "typical day" repeats every day of the month -
 * it has no notion of an actual day-to-day state of charge, so it cannot carry over an
 * undischarged remainder from one real day into the next (that would require daily/hourly
 * production data, which this calculator does not have).
 */
export function simulateBatteryMonths(
  monthlyProduction: MonthlyValues,
  monthlyConsumption: MonthlyValues,
  batteryCapacityKwh: number,
  roundTripEfficiency: number,
  daytimeConsumptionShare: number = 0.35,
  usableCapacityFraction: number = 1,
): BatteryMonthsResult {
  const chargedToBattery: MonthlyValues = []
  const residualSurplus: MonthlyValues = []
  const residualDeficit: MonthlyValues = []
  const usableCapacityKwh = batteryCapacityKwh * usableCapacityFraction

  for (let m = 0; m < MONTHS_IN_YEAR; m++) {
    const production = monthlyProduction[m]
    const dayConsumption = monthlyConsumption[m] * daytimeConsumptionShare
    const nightConsumption = monthlyConsumption[m] * (1 - daytimeConsumptionShare)

    const daytimeSelfUse = Math.min(production, dayConsumption)
    const daytimeDeficit = Math.max(dayConsumption - production, 0)
    const daytimeSurplus = production - daytimeSelfUse

    const monthlyBatteryThroughput = usableCapacityKwh * DAYS_IN_MONTH[m]
    // Only charge as much as night consumption can actually use (after efficiency loss) - any
    // further daytime surplus wouldn't be discharged anyway, so it should spill over as exportable
    // residual surplus rather than silently disappearing into an already-satisfied battery.
    const usefulChargeCap = roundTripEfficiency > 0 ? nightConsumption / roundTripEfficiency : 0
    const chargeable = Math.min(daytimeSurplus, monthlyBatteryThroughput, usefulChargeCap)
    const dischargeToNight = chargeable * roundTripEfficiency
    const remainingNightDeficit = nightConsumption - dischargeToNight

    residualSurplus.push(daytimeSurplus - chargeable)
    residualDeficit.push(daytimeDeficit + remainingNightDeficit)
    chargedToBattery.push(chargeable)
  }

  return { chargedToBattery, residualSurplus, residualDeficit }
}

export function computeSystemInvestment(inputs: SolarInputs): number {
  const baseCost =
    inputs.systemCostMode === 'fixed-per-kw'
      ? inputs.capacityKw * inputs.fixedPricePerKw
      : inputs.panelsCost + inputs.inverterCost
  const batteryCost = inputs.batteryMode !== 'none' ? inputs.batteryCost : 0
  return baseCost + inputs.otherCosts + batteryCost
}

/** Annual grid cost for one battery-mode + settlement-method combination. */
export function computeSolarAnnualCost(
  inputs: SolarInputs,
  monthlyProduction: MonthlyValues,
  monthlyConsumption: MonthlyValues,
  batteryMode: BatteryMode,
  settlementMethod: SettlementMethodId,
  year: number,
): number {
  const electricityPrice = escalate(inputs.electricityPriceNow, inputs.electricityPriceEscalationPct, year)
  const degradationFactor = escalate(1, -inputs.panelDegradationPct, year)
  const degradedProduction = monthlyProduction.map((v) => v * degradationFactor)
  const maintenanceCost = escalate(inputs.annualMaintenanceCost, inputs.maintenanceCostEscalationPct, year)
  // Battery fades faster than the panels - a 20-year-old battery no longer holds its rated kWh, so
  // later years of the horizon should simulate a smaller effective capacity, not the nameplate one.
  const batteryDegradationFactor = escalate(1, -inputs.batteryDegradationPct, year)
  const degradedBatteryInputs: SolarInputs = {
    ...inputs,
    batteryCapacityKwh: inputs.batteryCapacityKwh * batteryDegradationFactor,
  }

  if (batteryMode === 'no-export') {
    const { residualDeficit } = simulateBatteryMonths(
      degradedProduction,
      monthlyConsumption,
      degradedBatteryInputs.batteryCapacityKwh,
      inputs.batteryRoundTripEfficiencyPct / 100,
      inputs.daytimeConsumptionShare / 100,
      inputs.batteryUsableCapacityPct / 100,
    )
    const boughtFromGrid = residualDeficit.reduce((sum, v) => sum + v, 0)
    return boughtFromGrid * electricityPrice + maintenanceCost
  }

  const { surplus, deficit } = splitMonthlySurplusDeficit(degradedBatteryInputs, degradedProduction, monthlyConsumption, batteryMode)

  const { creditFactor, feeRatePerKwh, flatFeeAnnual } = getSettlementMethodParams(settlementMethod, inputs, year)
  const { boughtAtNormalPrice, retrievedFromBank, expiredCredits } = simulateNetMetering(surplus, deficit, creditFactor)
  const expiredCompensation = expiredCredits * inputs.expiredCreditCompensationPerKwh
  return boughtAtNormalPrice * electricityPrice + retrievedFromBank * feeRatePerKwh + flatFeeAnnual + maintenanceCost - expiredCompensation
}

/**
 * Fraction of a day's would-be-exported energy that's still deliverable when the grid connection
 * caps instantaneous export power at `limitKw`, assuming production follows a symmetric half-sine
 * curve over the daylight period (a standard simplification for irradiance without hourly data).
 * This ratio depends only on limitKw/peakKw - not on day length - because the sine shape is
 * scale-invariant, so the same formula applies to every month. Returns 1 (no clipping) whenever
 * there's no limit or it's at/above the assumed peak power (the installed capacity).
 */
export function exportableEnergyFraction(limitKw: number, peakKw: number): number {
  if (!(peakKw > 0) || !(limitKw < peakKw)) return 1
  const r = Math.max(limitKw, 0) / peakKw
  if (r <= 0) return 0
  const phi = Math.asin(r)
  return 1 - Math.sqrt(1 - r * r) + r * (Math.PI / 2 - phi)
}

interface SplitSurplusDeficitResult extends MonthlySurplusDeficit {
  /** Would-be-exported energy lost to ESO's permitted export power limit (not usable, not banked). */
  curtailed: MonthlyValues
  /** Monthly amount actually charged into the battery (0 for 'none' mode, which has no battery). */
  chargedToBattery: MonthlyValues
}

/**
 * Surplus (exported to the grid) and deficit (still bought from the grid) for the settlement-based
 * modes ('none' and 'export-residual'), respecting the day/night consumption split even without a
 * battery: daytime surplus beyond same-instant self-consumption can only be exported (it cannot be
 * time-shifted to cover night load without storage), so 'none' mode is simulated as a battery with
 * 0 kWh of capacity rather than netting the whole month's totals against each other. Surplus left
 * after self-consumption/battery is further capped by ESO's permitted export power, if set.
 */
function splitMonthlySurplusDeficit(
  inputs: SolarInputs,
  monthlyProduction: MonthlyValues,
  monthlyConsumption: MonthlyValues,
  batteryMode: BatteryMode,
): SplitSurplusDeficitResult {
  const battery = simulateBatteryMonths(
    monthlyProduction,
    monthlyConsumption,
    batteryMode === 'none' ? 0 : inputs.batteryCapacityKwh,
    inputs.batteryRoundTripEfficiencyPct / 100,
    inputs.daytimeConsumptionShare / 100,
    inputs.batteryUsableCapacityPct / 100,
  )
  const rawLimitKw = inputs.hasExportPowerLimit ? inputs.exportPowerLimitKw : Infinity
  const limitKw =
    inputs.threePhaseSyncMode && rawLimitKw < Infinity
      ? rawLimitKw * (1 - inputs.phaseAsymmetryFactor / 300)
      : rawLimitKw
  const fraction = exportableEnergyFraction(limitKw, inputs.capacityKw)
  if (fraction >= 1) {
    return {
      surplus: battery.residualSurplus,
      deficit: battery.residualDeficit,
      curtailed: battery.residualSurplus.map(() => 0),
      chargedToBattery: battery.chargedToBattery,
    }
  }
  const surplus = battery.residualSurplus.map((v) => v * fraction)
  const curtailed = battery.residualSurplus.map((v) => v * (1 - fraction))
  return { surplus, deficit: battery.residualDeficit, curtailed, chargedToBattery: battery.chargedToBattery }
}

export function computeSolarScenario(
  inputs: SolarInputs,
  seasonalShares: readonly number[] = [],
  horizonYears: number = HORIZON_YEARS,
): CashFlowResult {
  const monthlyProduction = getMonthlyProduction(inputs, seasonalShares)
  const monthlyConsumption = getMonthlyConsumption(inputs)
  const annualConsumption = monthlyConsumption.reduce((sum, v) => sum + v, 0)
  const investment = computeSystemInvestment(inputs)

  const baselineAnnualCost = (year: number) =>
    annualConsumption * escalate(inputs.electricityPriceNow, inputs.electricityPriceEscalationPct, year)

  const scenarioAnnualCost = (year: number) =>
    computeSolarAnnualCost(inputs, monthlyProduction, monthlyConsumption, inputs.batteryMode, inputs.settlementMethod, year)

  return buildCashFlow({ investment, horizonYears, baselineAnnualCost, scenarioAnnualCost })
}

export interface MonthlyBreakdownRow {
  month: number
  production: number
  consumption: number
  /** Daytime surplus actually charged into the battery this month (always 0 when there is no battery). */
  chargedToBattery: number
  /** Surplus actually sent to the grid this month (always 0 for 'no-export' mode, which never exports). */
  exported: number
  /** Surplus that was neither self-consumed, charged, nor exported, and is simply lost - only nonzero for 'no-export' mode once the battery (if any) is full. */
  wastedProduction: number
  /** Total shortfall this month: covered either from the credit bank or bought at full price. */
  deficit: number
  /** Deficit covered by drawing down previously banked (own, exported) kWh credit - not the full retail price. */
  boughtFromBank: number
  /** Deficit paid at the full retail electricity price because the credit bank was empty. */
  boughtFullPrice: number
  /** Credit bank balance (kWh) remaining at the end of this month; resets to 0 every January. */
  bankBalance: number
  /** Would-be-exported energy lost to ESO's permitted export power limit, if one is set. */
  curtailedByExportLimit: number
  /** kWh of banked credit that expired unused this month (24-month window elapsed); these are compensated at expiredCreditCompensationPerKwh. */
  expiredCredits: number
}

/**
 * Month-by-month production/consumption/grid-interaction for the currently selected battery mode
 * and settlement method, so the seasonal mismatch (summer surplus vs. winter deficit) and the
 * split between "buying back own banked kWh" vs. "buying at full price" are both visible, instead
 * of hidden inside a single annual number.
 */
export function computeMonthlyBreakdown(
  inputs: SolarInputs,
  seasonalShares: readonly number[] = [],
): MonthlyBreakdownRow[] {
  const monthlyProduction = getMonthlyProduction(inputs, seasonalShares)
  const monthlyConsumption = getMonthlyConsumption(inputs)

  const { surplus, deficit, curtailed, chargedToBattery } = splitMonthlySurplusDeficit(
    inputs,
    monthlyProduction,
    monthlyConsumption,
    inputs.batteryMode,
  )

  // 'no-export' never sends anything to the grid, so there is no settlement method and no credit bank -
  // whatever the battery couldn't use is simply lost, regardless of any (irrelevant) export power limit.
  const isExportable = inputs.batteryMode !== 'no-export'
  const netMetering = isExportable
    ? simulateNetMeteringMonthly(surplus, deficit, getSettlementMethodParams(inputs.settlementMethod, inputs, 0).creditFactor)
    : null

  return monthlyProduction.map((production, m) => ({
    month: m,
    production,
    consumption: monthlyConsumption[m],
    chargedToBattery: chargedToBattery[m],
    exported: isExportable ? surplus[m] : 0,
    wastedProduction: isExportable ? 0 : surplus[m] + curtailed[m],
    deficit: deficit[m],
    boughtFromBank: netMetering ? netMetering.retrievedFromBank[m] : 0,
    boughtFullPrice: netMetering ? netMetering.boughtAtNormalPrice[m] : deficit[m],
    bankBalance: netMetering ? netMetering.bankBalance[m] : 0,
    curtailedByExportLimit: isExportable ? curtailed[m] : 0,
    expiredCredits: netMetering ? netMetering.expiredCredits[m] : 0,
  }))
}

export interface SolarVariant {
  id: string
  batteryMode: BatteryMode
  settlementMethod: SettlementMethodId | null
  labelKey: string
}

/** All 9 mutually distinct combinations to compare: 4 export methods, battery-only, and 4 battery+export-residual methods. */
export const SOLAR_VARIANTS: readonly SolarVariant[] = [
  { id: 'none-per-kwh-fee', batteryMode: 'none', settlementMethod: 'per-kwh-fee', labelKey: 'solar.variantNonePerKwhFee' },
  { id: 'none-capacity-fee', batteryMode: 'none', settlementMethod: 'capacity-fee', labelKey: 'solar.variantNoneCapacityFee' },
  { id: 'none-percentage', batteryMode: 'none', settlementMethod: 'percentage', labelKey: 'solar.variantNonePercentage' },
  { id: 'none-tariff-manual', batteryMode: 'none', settlementMethod: 'tariff-manual', labelKey: 'solar.variantNoneTariffManual' },
  { id: 'no-export', batteryMode: 'no-export', settlementMethod: null, labelKey: 'solar.variantNoExport' },
  {
    id: 'export-residual-per-kwh-fee',
    batteryMode: 'export-residual',
    settlementMethod: 'per-kwh-fee',
    labelKey: 'solar.variantResidualPerKwhFee',
  },
  {
    id: 'export-residual-capacity-fee',
    batteryMode: 'export-residual',
    settlementMethod: 'capacity-fee',
    labelKey: 'solar.variantResidualCapacityFee',
  },
  {
    id: 'export-residual-percentage',
    batteryMode: 'export-residual',
    settlementMethod: 'percentage',
    labelKey: 'solar.variantResidualPercentage',
  },
  {
    id: 'export-residual-tariff-manual',
    batteryMode: 'export-residual',
    settlementMethod: 'tariff-manual',
    labelKey: 'solar.variantResidualTariffManual',
  },
]

export interface SolarVariantResult extends SolarVariant {
  result: CashFlowResult
}

/** Computes the cash flow for every variant in `SOLAR_VARIANTS`, so they can be compared side by side. */
export function computeAllSolarVariants(
  inputs: SolarInputs,
  seasonalShares: readonly number[] = [],
  horizonYears: number = HORIZON_YEARS,
): SolarVariantResult[] {
  const monthlyProduction = getMonthlyProduction(inputs, seasonalShares)
  const monthlyConsumption = getMonthlyConsumption(inputs)
  const annualConsumption = monthlyConsumption.reduce((sum, v) => sum + v, 0)

  const baselineAnnualCost = (year: number) =>
    annualConsumption * escalate(inputs.electricityPriceNow, inputs.electricityPriceEscalationPct, year)

  return SOLAR_VARIANTS.map((variant) => {
    const investment = computeSystemInvestment({ ...inputs, batteryMode: variant.batteryMode })
    const scenarioAnnualCost = (year: number) =>
      computeSolarAnnualCost(
        inputs,
        monthlyProduction,
        monthlyConsumption,
        variant.batteryMode,
        variant.settlementMethod ?? 'per-kwh-fee',
        year,
      )
    const result = buildCashFlow({ investment, horizonYears, baselineAnnualCost, scenarioAnnualCost })
    return { ...variant, result }
  })
}
