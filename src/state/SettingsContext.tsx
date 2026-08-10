import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useLocalStorageState } from './useLocalStorageState'
import type { MonthlyValues } from '../lib/calculations/types'

export interface Settings {
  electricityPriceNow: number
  electricityPriceEscalationPct: number
  /** Household electricity consumption excluding any heat pump - shared between the Solar and Heating tabs. */
  annualConsumptionKwh: number
  useMonthlyConsumption: boolean
  directMonthlyConsumptionKwh: MonthlyValues
}

const DEFAULT_SETTINGS: Settings = {
  electricityPriceNow: 0.23,
  electricityPriceEscalationPct: 4,
  annualConsumptionKwh: 4000,
  useMonthlyConsumption: false,
  directMonthlyConsumptionKwh: new Array(12).fill(Math.round(4000 / 12)),
}

interface SettingsContextValue {
  settings: Settings
  setSettings: React.Dispatch<React.SetStateAction<Settings>>
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useLocalStorageState<Settings>('elektrines.settings', DEFAULT_SETTINGS)
  const value = useMemo(() => ({ settings, setSettings }), [settings, setSettings])
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext)
  if (!context) throw new Error('useSettings must be used within a SettingsProvider')
  return context
}
