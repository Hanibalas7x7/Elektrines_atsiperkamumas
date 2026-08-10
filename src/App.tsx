import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SettingsProvider } from './state/SettingsContext'
import { Header } from './components/layout/Header'
import { TabsNav } from './components/layout/TabsNav'
import { SettingsPanel } from './components/layout/SettingsPanel'
import { SolarCalculator } from './components/solar/SolarCalculator'
import { HeatingCalculator } from './components/heating/HeatingCalculator'

type TabId = 'solar' | 'heating'

function AppContent() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<TabId>('solar')

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6">
        <SettingsPanel />
        <TabsNav
          tabs={[
            { id: 'solar', label: t('app.tabSolar') },
            { id: 'heating', label: t('app.tabHeating') },
          ]}
          activeId={activeTab}
          onChange={(id) => setActiveTab(id as TabId)}
        />
        {activeTab === 'solar' ? <SolarCalculator /> : <HeatingCalculator onGoToSolarTab={() => setActiveTab('solar')} />}
      </main>
    </div>
  )
}

function App() {
  return (
    <SettingsProvider>
      <AppContent />
    </SettingsProvider>
  )
}

export default App
