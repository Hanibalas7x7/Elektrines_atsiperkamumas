interface NumberFieldProps {
  label: string
  value: number
  onChange: (value: number) => void
  suffix?: string
  min?: number
  step?: number
  hint?: string
}

/** Labeled numeric input, used for currency/energy values throughout the calculators. */
export function NumberField({ label, value, onChange, suffix, min = 0, step = 'any' as unknown as number, hint }: NumberFieldProps) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          className="w-full rounded-md border border-slate-300 px-3 py-1.5 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          value={Number.isFinite(value) ? value : 0}
          min={min}
          step={step}
          onChange={(e) => onChange(e.target.valueAsNumber || 0)}
        />
        {suffix && <span className="text-slate-500">{suffix}</span>}
      </div>
      {hint && <span className="text-xs text-slate-400">{hint}</span>}
    </label>
  )
}

/** Labeled percentage input (stores plain numbers, e.g. 4 for 4%). */
export function PercentField({ label, value, onChange, hint }: Omit<NumberFieldProps, 'suffix' | 'min' | 'step'>) {
  return <NumberField label={label} value={value} onChange={onChange} suffix="%" step={0.1} hint={hint} />
}
