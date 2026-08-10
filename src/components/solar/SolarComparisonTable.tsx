import { useTranslation } from 'react-i18next'
import type { SolarVariantResult } from '../../lib/calculations/solar'
import { formatEuro, formatYears } from '../../lib/format'

interface SolarComparisonTableProps {
  variants: SolarVariantResult[]
  horizonYears: number
}

/** Ranks and displays all settlement-method / battery-mode combinations side by side. */
export function SolarComparisonTable({ variants, horizonYears }: SolarComparisonTableProps) {
  const { t } = useTranslation()

  const sorted = [...variants].sort((a, b) => b.result.netBenefit - a.result.netBenefit)
  const bestId = sorted[0]?.id

  return (
    <div className="overflow-auto rounded-md border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-100">
          <tr>
            <th className="p-2 text-left">{t('solar.comparisonVariant')}</th>
            <th className="p-2 text-right">{t('solar.resultsInvestment')}</th>
            <th className="p-2 text-right">{t('solar.resultsPayback')}</th>
            <th className="p-2 text-right">{t('solar.resultsTotalSavings', { years: horizonYears })}</th>
            <th className="p-2 text-right">{t('solar.resultsNetBenefit', { years: horizonYears })}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((variant) => (
            <tr
              key={variant.id}
              className={variant.id === bestId ? 'bg-emerald-50 font-semibold text-emerald-800' : undefined}
            >
              <td className="p-2">{t(variant.labelKey)}</td>
              <td className="p-2 text-right">{formatEuro(variant.result.investment)}</td>
              <td className="p-2 text-right">
                {variant.result.paybackYear !== null
                  ? formatYears(variant.result.paybackYear, t('common.years'))
                  : t('solar.resultsPaybackNever', { years: horizonYears })}
              </td>
              <td className="p-2 text-right">{formatEuro(variant.result.totalSavings)}</td>
              <td className="p-2 text-right">{formatEuro(variant.result.netBenefit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
