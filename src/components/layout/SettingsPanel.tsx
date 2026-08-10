import { useTranslation } from 'react-i18next'
import { useSettings } from '../../state/SettingsContext'
import { NumberField, PercentField } from '../shared/NumberField'

export function SettingsPanel() {
  const { t } = useTranslation()
  const { settings, setSettings } = useSettings()

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="mb-1 text-sm font-semibold text-slate-800">{t('settings.title')}</h3>
      <p className="mb-3 text-xs text-slate-500">{t('settings.hint')}</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <NumberField
          label={t('settings.electricityPriceNow')}
          value={settings.electricityPriceNow}
          onChange={(v) => setSettings((prev) => ({ ...prev, electricityPriceNow: v }))}
          step={0.01}
        />
        <PercentField
          label={t('settings.electricityPriceEscalation')}
          value={settings.electricityPriceEscalationPct}
          onChange={(v) => setSettings((prev) => ({ ...prev, electricityPriceEscalationPct: v }))}
        />
      </div>
    </section>
  )
}
