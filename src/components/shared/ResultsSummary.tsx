import type { CashFlowResult } from '../../lib/calculations/types'
import { formatEuro } from '../../lib/format'

interface ResultsSummaryProps {
  result: CashFlowResult
  investmentLabel: string
  paybackLabel: string
  paybackNeverLabel: string
  totalSavingsLabel: string
  netBenefitLabel: string
  yearsLabel: string
}

export function ResultsSummary({
  result,
  investmentLabel,
  paybackLabel,
  paybackNeverLabel,
  totalSavingsLabel,
  netBenefitLabel,
  yearsLabel,
}: ResultsSummaryProps) {
  const cards = [
    { label: investmentLabel, value: formatEuro(result.investment) },
    {
      label: paybackLabel,
      value: result.paybackYear !== null ? `${result.paybackYear.toFixed(1)} ${yearsLabel}` : paybackNeverLabel,
    },
    { label: totalSavingsLabel, value: formatEuro(result.totalSavings) },
    { label: netBenefitLabel, value: formatEuro(result.netBenefit) },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-xs text-slate-500">{card.label}</div>
          <div className="text-lg font-semibold text-slate-800">{card.value}</div>
        </div>
      ))}
    </div>
  )
}
