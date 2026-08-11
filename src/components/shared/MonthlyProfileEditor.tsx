interface MonthlyProfileEditorProps {
  label: string
  monthLabels: readonly string[]
  values: number[]
  onChange: (values: number[]) => void
  /** When provided, shows the annual sum (kWh/yr) below the grid with this label. */
  totalLabel?: string
}

/** Grid of 12 numeric inputs, one per calendar month. */
export function MonthlyProfileEditor({ label, monthLabels, values, onChange, totalLabel }: MonthlyProfileEditorProps) {
  const annualTotal = totalLabel ? values.reduce((sum, v) => sum + (v || 0), 0) : 0
  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {monthLabels.map((month, i) => (
          <label key={month} className="flex flex-col gap-0.5 text-xs text-slate-500">
            {month}
            <input
              type="number"
              className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:border-emerald-500 focus:outline-none"
              value={values[i] ?? 0}
              min={0}
              onChange={(e) => {
                const next = [...values]
                next[i] = e.target.valueAsNumber || 0
                onChange(next)
              }}
            />
          </label>
        ))}
      </div>
      {totalLabel && (
        <div className="mt-1 text-xs text-slate-500">
          {totalLabel}:{' '}
          <span className="font-semibold text-slate-700">{Math.round(annualTotal).toLocaleString()} kWh/m.</span>
        </div>
      )}
    </div>
  )
}
