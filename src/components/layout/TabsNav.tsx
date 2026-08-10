interface Tab {
  id: string
  label: string
}

interface TabsNavProps {
  tabs: Tab[]
  activeId: string
  onChange: (id: string) => void
}

export function TabsNav({ tabs, activeId, onChange }: TabsNavProps) {
  return (
    <div className="flex gap-1 border-b border-slate-200">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`px-4 py-2 text-sm font-medium ${
            tab.id === activeId
              ? 'border-b-2 border-emerald-600 text-emerald-700'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
