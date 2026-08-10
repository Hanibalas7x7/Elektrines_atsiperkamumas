import { useState, type ReactNode } from 'react'

/** Small "(?)" info icon that shows an explanatory tooltip on hover/click. */
export function InfoTooltip({ text }: { text: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-block align-middle">
      <button
        type="button"
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600 hover:bg-slate-300"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
        aria-label="info"
      >
        ?
      </button>
      {open && (
        <span className="absolute left-1/2 top-6 z-10 w-64 -translate-x-1/2 rounded-md border border-slate-200 bg-white p-2 text-xs font-normal text-slate-600 shadow-lg">
          {text}
        </span>
      )}
    </span>
  )
}
