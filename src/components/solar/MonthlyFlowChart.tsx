import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { MonthlyBreakdownRow } from '../../lib/calculations/solar'
import { formatKwh } from '../../lib/format'

interface MonthlyFlowChartProps {
  rows: MonthlyBreakdownRow[]
  monthLabels: string[]
  totalLabel: string
  productionLabel: string
  consumptionLabel: string
  chargedToBatteryLabel: string
  exportedLabel: string
  wastedProductionLabel: string
  boughtFromBankLabel: string
  boughtFullPriceLabel: string
  bankBalanceLabel: string
  curtailedByExportLimitLabel?: string
  expiredCreditsLabel?: string
}

type MonthlyChartRow = {
  month: string
  production: number
  consumption: number
  chargedToBattery: number
  exported: number
  wastedProduction: number
  boughtFromBank: number
  boughtFullPrice: number
  bankBalance: number
  curtailedByExportLimit: number
  expiredCredits: number
}

/**
 * Bar chart + table showing the monthly production/consumption mismatch (summer surplus vs.
 * winter deficit): how much surplus is charged into the battery, how much is exported, how much
 * is simply lost, and how the resulting shortfall splits between previously banked (own, exported)
 * kWh credit vs. bought at the full retail price, plus the running credit-bank balance (each
 * month's credit rolls over and stays valid for 24 months from when it was produced, rather than
 * resetting on a fixed calendar date).
 */
export function MonthlyFlowChart({
  rows,
  monthLabels,
  totalLabel,
  productionLabel,
  consumptionLabel,
  chargedToBatteryLabel,
  exportedLabel,
  wastedProductionLabel,
  boughtFromBankLabel,
  boughtFullPriceLabel,
  bankBalanceLabel,
  curtailedByExportLimitLabel,
  expiredCreditsLabel,
}: MonthlyFlowChartProps) {
  const data: MonthlyChartRow[] = rows.map((row, i) => ({
    month: monthLabels[i] ?? String(i + 1),
    production: Math.round(row.production),
    consumption: Math.round(row.consumption),
    chargedToBattery: Math.round(row.chargedToBattery),
    exported: Math.round(row.exported),
    wastedProduction: Math.round(row.wastedProduction),
    boughtFromBank: Math.round(row.boughtFromBank),
    boughtFullPrice: Math.round(row.boughtFullPrice),
    bankBalance: Math.round(row.bankBalance),
    curtailedByExportLimit: Math.round(row.curtailedByExportLimit),
    expiredCredits: Math.round(row.expiredCredits),
  }))

  const hasCurtailment = data.some((row) => row.curtailedByExportLimit > 0)
  const hasCharging = data.some((row) => row.chargedToBattery > 0)
  const hasWaste = data.some((row) => row.wastedProduction > 0)
  const hasExpiredCredits = data.some((row) => row.expiredCredits > 0)

  const sum = (key: Exclude<keyof MonthlyChartRow, 'month'>) => data.reduce((total, row) => total + row[key], 0)

  const rowsSpec: Array<{ label: string; key: Exclude<keyof MonthlyChartRow, 'month'>; className: string; showTotal: boolean }> = [
    { label: productionLabel, key: 'production', className: 'text-slate-600', showTotal: true },
    { label: consumptionLabel, key: 'consumption', className: 'text-slate-600', showTotal: true },
  ]
  if (hasCharging) {
    rowsSpec.push({ label: chargedToBatteryLabel, key: 'chargedToBattery', className: 'text-teal-700', showTotal: true })
  }
  rowsSpec.push({ label: exportedLabel, key: 'exported', className: 'text-emerald-700', showTotal: true })
  if (hasWaste) {
    rowsSpec.push({ label: wastedProductionLabel, key: 'wastedProduction', className: 'text-slate-500', showTotal: true })
  }
  rowsSpec.push(
    { label: boughtFromBankLabel, key: 'boughtFromBank', className: 'text-amber-700', showTotal: true },
    { label: boughtFullPriceLabel, key: 'boughtFullPrice', className: 'text-red-700', showTotal: true },
    { label: bankBalanceLabel, key: 'bankBalance', className: 'text-sky-700', showTotal: false },
  )
  if (hasCurtailment && curtailedByExportLimitLabel) {
    rowsSpec.push({ label: curtailedByExportLimitLabel, key: 'curtailedByExportLimit', className: 'text-orange-700', showTotal: true })
  }
  if (hasExpiredCredits && expiredCreditsLabel) {
    rowsSpec.push({ label: expiredCreditsLabel, key: 'expiredCredits', className: 'text-violet-700', showTotal: true })
  }

  return (
    <div className="flex flex-col gap-4">
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis width={60} />
          <Tooltip formatter={(value) => formatKwh(Number(value))} />
          <Legend />
          <Bar dataKey="production" name={productionLabel} fill="#facc15" />
          <Bar dataKey="consumption" name={consumptionLabel} fill="#64748b" />
          {hasCharging && <Bar dataKey="chargedToBattery" name={chargedToBatteryLabel} fill="#0d9488" />}
          <Bar dataKey="exported" name={exportedLabel} fill="#16a34a" />
          {hasWaste && <Bar dataKey="wastedProduction" name={wastedProductionLabel} fill="#94a3b8" />}
          <Bar dataKey="boughtFromBank" name={boughtFromBankLabel} stackId="bought" fill="#d97706" />
          <Bar dataKey="boughtFullPrice" name={boughtFullPriceLabel} stackId="bought" fill="#dc2626" />
          {hasCurtailment && curtailedByExportLimitLabel && (
            <Bar dataKey="curtailedByExportLimit" name={curtailedByExportLimitLabel} fill="#c2410c" />
          )}
          <Line type="monotone" dataKey="bankBalance" name={bankBalanceLabel} stroke="#0369a1" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="overflow-auto">
        <table className="w-full min-w-[640px] border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-1 pr-2 font-medium"></th>
              {data.map((row) => (
                <th key={row.month} className="py-1 pr-2 text-right font-medium">
                  {row.month}
                </th>
              ))}
              <th className="py-1 pl-3 text-right font-semibold">{totalLabel}</th>
            </tr>
          </thead>
          <tbody>
            {rowsSpec.map(({ label, key, className, showTotal }) => (
              <tr key={key} className="border-b border-slate-100 last:border-0">
                <td className={`py-1 pr-2 font-medium ${className}`}>{label}</td>
                {data.map((row, i) => (
                  <td key={i} className={`py-1 pr-2 text-right tabular-nums ${className}`}>
                    {formatKwh(row[key])}
                  </td>
                ))}
                <td className={`py-1 pl-3 text-right font-semibold tabular-nums ${className}`}>
                  {showTotal ? formatKwh(sum(key)) : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
