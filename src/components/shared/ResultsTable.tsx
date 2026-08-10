import type { CashFlowResult } from '../../lib/calculations/types'
import { formatEuro } from '../../lib/format'

interface ResultsTableProps {
  result: CashFlowResult
  yearLabel: string
  baselineLabel: string
  scenarioLabel: string
  savingsLabel: string
  cumulativeLabel: string
  netLabel: string
}

export function ResultsTable({
  result,
  yearLabel,
  baselineLabel,
  scenarioLabel,
  savingsLabel,
  cumulativeLabel,
  netLabel,
}: ResultsTableProps) {
  const paybackYearRounded = result.paybackYear !== null ? Math.ceil(result.paybackYear) : null

  return (
    <div className="max-h-80 overflow-auto rounded-md border border-slate-200">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-slate-100">
          <tr>
            <th className="p-2 text-left">{yearLabel}</th>
            <th className="p-2 text-right">{baselineLabel}</th>
            <th className="p-2 text-right">{scenarioLabel}</th>
            <th className="p-2 text-right">{savingsLabel}</th>
            <th className="p-2 text-right">{cumulativeLabel}</th>
            <th className="p-2 text-right">{netLabel}</th>
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row) => (
            <tr key={row.year} className={row.year === paybackYearRounded ? 'bg-emerald-50' : undefined}>
              <td className="p-2">{row.year}</td>
              <td className="p-2 text-right">{formatEuro(row.baselineCost)}</td>
              <td className="p-2 text-right">{formatEuro(row.scenarioCost)}</td>
              <td className="p-2 text-right">{formatEuro(row.annualSavings)}</td>
              <td className="p-2 text-right">{formatEuro(row.cumulativeSavings)}</td>
              <td className={`p-2 text-right font-medium ${row.netCashFlow >= 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                {formatEuro(row.netCashFlow)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
