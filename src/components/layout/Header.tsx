import { useTranslation } from 'react-i18next'

export function Header() {
  const { t, i18n } = useTranslation()

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
        <h1 className="text-lg font-semibold text-slate-800">{t('app.title')}</h1>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          {t('app.language')}
          <select
            className="rounded-md border border-slate-300 px-2 py-1 focus:border-emerald-500 focus:outline-none"
            value={i18n.resolvedLanguage}
            onChange={(e) => void i18n.changeLanguage(e.target.value)}
          >
            <option value="lt">LT</option>
            <option value="en">EN</option>
          </select>
        </label>
      </div>
    </header>
  )
}
