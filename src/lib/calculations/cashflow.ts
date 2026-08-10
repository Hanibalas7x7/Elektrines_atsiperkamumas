import type { CashFlowResult, CashFlowYearRow } from './types'

export interface CashFlowInputs {
  investment: number
  horizonYears: number
  /** Annual operating cost with no investment made (1-based year). */
  baselineAnnualCost: (year: number) => number
  /** Annual operating cost after the investment is made (1-based year). */
  scenarioAnnualCost: (year: number) => number
}

/** Builds a year-by-year cumulative savings cash flow and estimates the payback year. */
export function buildCashFlow({
  investment,
  horizonYears,
  baselineAnnualCost,
  scenarioAnnualCost,
}: CashFlowInputs): CashFlowResult {
  const rows: CashFlowYearRow[] = []
  let cumulativeSavings = 0
  let paybackYear: number | null = null
  let previousNet = -investment

  for (let year = 1; year <= horizonYears; year++) {
    const baselineCost = baselineAnnualCost(year)
    const scenarioCost = scenarioAnnualCost(year)
    const annualSavings = baselineCost - scenarioCost
    cumulativeSavings += annualSavings
    const netCashFlow = cumulativeSavings - investment

    if (paybackYear === null && netCashFlow >= 0) {
      const delta = netCashFlow - previousNet
      // Linear interpolation within the crossing year for a smoother payback estimate.
      const fraction = delta !== 0 ? -previousNet / delta : 0
      paybackYear = year - 1 + Math.min(Math.max(fraction, 0), 1)
    }

    rows.push({ year, baselineCost, scenarioCost, annualSavings, cumulativeSavings, netCashFlow })
    previousNet = netCashFlow
  }

  const last = rows[rows.length - 1]
  return {
    rows,
    investment,
    paybackYear,
    totalSavings: last ? last.cumulativeSavings : 0,
    netBenefit: last ? last.netCashFlow : -investment,
  }
}

/** Compounds a starting value by a yearly percentage rate, year 1 = no escalation applied yet. */
export function escalate(value: number, annualPct: number, year: number): number {
  return value * (1 + annualPct / 100) ** (year - 1)
}
