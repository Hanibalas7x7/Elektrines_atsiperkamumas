interface PresetOption<T> {
  id: string
  label: string
  value: T
}

interface PresetSelectProps<T> {
  label: string
  options: readonly PresetOption<T>[]
  customLabel: string
  selectedId: string
  onSelect: (id: string, value: T | null) => void
}

/** Dropdown that fills a field from a preset, with a "custom" fallback for manual entry. */
export function PresetSelect<T>({ label, options, customLabel, selectedId, onSelect }: PresetSelectProps<T>) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <select
        className="rounded-md border border-slate-300 px-3 py-1.5 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        value={selectedId}
        onChange={(e) => {
          const id = e.target.value
          const option = options.find((o) => o.id === id)
          onSelect(id, option ? option.value : null)
        }}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
        <option value="custom">{customLabel}</option>
      </select>
    </label>
  )
}
