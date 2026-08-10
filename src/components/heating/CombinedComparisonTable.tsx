import { useTranslation } from 'react-i18next'
import type { CombinedVariant } from '../../lib/calculations/heatPumpSolar'
import { formatEuro, formatYears } from '../../lib/format'

interface CombinedComparisonTableProps {
  variants: CombinedVariant[]
  horizonYears: number
}

/** Ranks and displays every (solar capacity x battery capacity) combination side by side. */
export function CombinedComparisonTable({ variants, horizonYears }: CombinedComparisonTableProps) {
  const { t } = useTranslation()

  const sorted = [...variants].sort((a, b) => b.result.netBenefit - a.result.netBenefit)
  const bestKey = sorted[0] ? `${sorted[0].capacityKw}-${sorted[0].batteryCapacityKwh}` : null

  return (
    <div className="overflow-auto rounded-md border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-100">
          <tr>
            <th className="p-2 text-left">{t('heating.comparisonSolarCapacity')}</th>
            <th className="p-2 text-left">{t('heating.comparisonBatteryCapacity')}</th>
            <th className="p-2 text-right">{t('heating.resultsInvestment')}</th>
            <th className="p-2 text-right">{t('heating.resultsPayback')}</th>
            <th className="p-2 text-right">{t('heating.resultsTotalSavings', { years: horizonYears })}</th>
            <th className="p-2 text-right">{t('heating.resultsNetBenefit', { years: horizonYears })}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((variant) => {
            const key = `${variant.capacityKw}-${variant.batteryCapacityKwh}`
            return (
              <tr key={key} className={key === bestKey ? 'bg-emerald-50 font-semibold text-emerald-800' : undefined}>
                <td className="p-2">
                  {variant.capacityKw > 0 ? `${variant.capacityKw} kW` : t('heating.comparisonNoSolar')}
                </td>
                <td className="p-2">
                  {variant.batteryCapacityKwh > 0 ? `${variant.batteryCapacityKwh} kWh` : t('heating.comparisonNoBattery')}
                </td>
                <td className="p-2 text-right">{formatEuro(variant.result.investment)}</td>
                <td className="p-2 text-right">
                  {variant.result.paybackYear !== null
                    ? formatYears(variant.result.paybackYear, t('common.years'))
                    : t('heating.resultsPaybackNever', { years: horizonYears })}
                </td>
                <td className="p-2 text-right">{formatEuro(variant.result.totalSavings)}</td>
                <td className="p-2 text-right">{formatEuro(variant.result.netBenefit)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
