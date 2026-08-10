import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocalStorageState } from '../../state/useLocalStorageState'
import { useSettings } from '../../state/SettingsContext'
import { computeAnnualHeatDemandKwh, computeHeatPumpElectricityKwh } from '../../lib/calculations/heating'
import { computeCombinedVariants, recommendHeatPumpPowerKw, recommendSolarCapacityKw } from '../../lib/calculations/heatPumpSolar'
import { deriveBatteryMode } from '../../lib/calculations/solar'
import {
  BATTERY_CAPACITY_SWEEP_OPTIONS_KWH,
  COP_PRESETS,
  DEFAULT_HEAT_PUMP_FULL_LOAD_HOURS,
  DEFAULT_MONTHLY_PRODUCTION_SHARE,
  FUEL_PRESETS,
  HORIZON_YEARS,
  SOLAR_CAPACITY_SWEEP_MULTIPLIERS,
} from '../../lib/calculations/constants'
import type { HeatingInputs, SolarInputs } from '../../lib/calculations/types'
import { DEFAULT_SOLAR_LOCAL, type SolarLocalInputs } from '../solar/SolarCalculator'
import { NumberField, PercentField } from '../shared/NumberField'
import { PresetSelect } from '../shared/PresetSelect'
import { MonthlyProfileEditor } from '../shared/MonthlyProfileEditor'
import { Section } from '../shared/Section'
import { ResultsSummary } from '../shared/ResultsSummary'
import { ResultsChart } from '../shared/ResultsChart'
import { ResultsTable } from '../shared/ResultsTable'
import { CombinedComparisonTable } from './CombinedComparisonTable'

type HeatingLocalInputs = Omit<HeatingInputs, 'electricityPriceNow' | 'electricityPriceEscalationPct'> & {
  fuelPresetId: string
  copPresetId: string
}

const DEFAULT_HEATING_LOCAL: HeatingLocalInputs = {
  fuelAnnualConsumption: 10,
  fuelPriceNow: 60,
  fuelPriceEscalationPct: 5,
  fuelEnergyContentKwhPerUnit: 1700,
  boilerEfficiencyPct: 70,
  fuelPresetId: 'firewood',
  heatPumpCop: 3.2,
  copPresetId: 'average',
  heatPumpPrice: 6000,
  installationCost: 1500,
}

/** Rounds to the nearest 0.5, with a 0.5 floor (used for solar capacity sizing candidates). */
function roundToHalf(value: number): number {
  return Math.max(0.5, Math.round(value * 2) / 2)
}

interface HeatingCalculatorProps {
  onGoToSolarTab: () => void
}

export function HeatingCalculator({ onGoToSolarTab }: HeatingCalculatorProps) {
  const { t } = useTranslation()
  const { settings, setSettings } = useSettings()
  const [local, setLocal] = useLocalStorageState<HeatingLocalInputs>('elektrines.heating', DEFAULT_HEATING_LOCAL)
  const [solarLocal] = useLocalStorageState<SolarLocalInputs>('elektrines.solar', DEFAULT_SOLAR_LOCAL)

  const update = <K extends keyof HeatingLocalInputs>(key: K, value: HeatingLocalInputs[K]) =>
    setLocal((prev) => ({ ...prev, [key]: value }))

  const heatingInputs: HeatingInputs = useMemo(
    () => ({
      ...local,
      electricityPriceNow: settings.electricityPriceNow,
      electricityPriceEscalationPct: settings.electricityPriceEscalationPct,
    }),
    [local, settings],
  )

  const heatDemand = useMemo(() => computeAnnualHeatDemandKwh(heatingInputs), [heatingInputs])
  const heatPumpElectricity = useMemo(() => computeHeatPumpElectricityKwh(heatingInputs), [heatingInputs])
  const recommendedPowerKw = useMemo(() => recommendHeatPumpPowerKw(heatingInputs), [heatingInputs])

  const householdMonthlyConsumption = useMemo(
    () =>
      settings.useMonthlyConsumption
        ? settings.directMonthlyConsumptionKwh
        : new Array(12).fill(settings.annualConsumptionKwh / 12),
    [settings],
  )
  const householdAnnualConsumption = useMemo(
    () => householdMonthlyConsumption.reduce((sum, v) => sum + v, 0),
    [householdMonthlyConsumption],
  )
  const combinedAnnualConsumption = householdAnnualConsumption + heatPumpElectricity

  // The solar system's own settlement/cost/battery-efficiency assumptions are reused as-is from
  // the Solar tab (shared, not duplicated here) - only capacityKw and battery capacity are swept
  // below to find a recommendation. Consumption fields are irrelevant here (always overridden by
  // computeCombinedScenario with the combined household+heat-pump monthly profile).
  const baseSolarInputs: SolarInputs = useMemo(() => {
    const { hasBattery, exportSurplus, ...rest } = solarLocal
    return {
      ...rest,
      batteryMode: deriveBatteryMode(hasBattery, exportSurplus),
      annualConsumptionKwh: 0,
      useMonthlyConsumption: false,
      directMonthlyConsumptionKwh: [],
      electricityPriceNow: settings.electricityPriceNow,
      electricityPriceEscalationPct: settings.electricityPriceEscalationPct,
    }
  }, [solarLocal, settings])

  const recommendedSolarKw = useMemo(
    () => recommendSolarCapacityKw(combinedAnnualConsumption, baseSolarInputs.annualYieldKwhPerKwp),
    [combinedAnnualConsumption, baseSolarInputs],
  )

  const capacityCandidatesKw = useMemo(() => {
    const candidates = SOLAR_CAPACITY_SWEEP_MULTIPLIERS.map((m) => roundToHalf(recommendedSolarKw * m))
    return Array.from(new Set([0, ...candidates])).sort((a, b) => a - b)
  }, [recommendedSolarKw])

  const variants = useMemo(
    () =>
      computeCombinedVariants(
        heatingInputs,
        baseSolarInputs,
        householdMonthlyConsumption,
        DEFAULT_MONTHLY_PRODUCTION_SHARE,
        HORIZON_YEARS,
        capacityCandidatesKw,
        BATTERY_CAPACITY_SWEEP_OPTIONS_KWH,
      ),
    [heatingInputs, baseSolarInputs, householdMonthlyConsumption, capacityCandidatesKw],
  )

  const bestVariant = useMemo(
    () => [...variants].sort((a, b) => b.result.netBenefit - a.result.netBenefit)[0],
    [variants],
  )

  const fuelPresetOptions = FUEL_PRESETS.map((p) => ({
    id: p.id,
    label: t(p.labelKey),
    value: { energyContentKwhPerUnit: p.energyContentKwhPerUnit, boilerEfficiencyPct: p.boilerEfficiencyPct },
  }))
  const copPresetOptions = COP_PRESETS.map((p) => ({ id: p.id, label: t(p.labelKey), value: p.value }))

  const unitLabel = FUEL_PRESETS.find((p) => p.id === local.fuelPresetId)?.unitKey ?? 'heating.unitSteres'
  const unitShortLabel = FUEL_PRESETS.find((p) => p.id === local.fuelPresetId)?.unitShortKey ?? 'heating.unitSteresShort'
  const energyContentHintKey =
    FUEL_PRESETS.find((p) => p.id === local.fuelPresetId)?.energyContentHintKey ?? 'heating.energyContentHintFirewood'

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold text-slate-800">{t('heating.title')}</h2>
      <p className="text-sm text-slate-600">{t('heating.intro')}</p>

      <Section title={t('heating.sectionCurrent')}>
        <PresetSelect
          label={t('heating.fuelPreset')}
          options={fuelPresetOptions}
          customLabel={t('common.custom')}
          selectedId={local.fuelPresetId}
          onSelect={(id, value) => {
            update('fuelPresetId', id)
            if (value !== null) {
              update('fuelEnergyContentKwhPerUnit', value.energyContentKwhPerUnit)
              update('boilerEfficiencyPct', value.boilerEfficiencyPct)
            }
          }}
        />
        <NumberField
          label={`${t('heating.fuelAnnualConsumption')} (${t(unitLabel)})`}
          value={local.fuelAnnualConsumption}
          onChange={(v) => update('fuelAnnualConsumption', v)}
        />
        <p className="text-xs text-slate-500 sm:col-span-2">{t('heating.fuelUnitHint')}</p>
        <NumberField
          label={`${t('heating.fuelPriceNow')} (€/${t(unitShortLabel)})`}
          value={local.fuelPriceNow}
          onChange={(v) => update('fuelPriceNow', v)}
        />
        <PercentField label={t('heating.fuelPriceEscalation')} value={local.fuelPriceEscalationPct} onChange={(v) => update('fuelPriceEscalationPct', v)} />
        <NumberField
          label={`${t('heating.fuelEnergyContent')} (kWh/${t(unitShortLabel)})`}
          value={local.fuelEnergyContentKwhPerUnit}
          hint={t(energyContentHintKey)}
          onChange={(v) => {
            update('fuelEnergyContentKwhPerUnit', v)
            update('fuelPresetId', 'custom')
          }}
        />
        <NumberField
          label={t('heating.boilerEfficiency')}
          value={local.boilerEfficiencyPct}
          onChange={(v) => {
            update('boilerEfficiencyPct', v)
            update('fuelPresetId', 'custom')
          }}
          suffix="%"
        />
      </Section>

      <Section title={t('heating.sectionHeatPump')}>
        <PresetSelect
          label={t('heating.copPreset')}
          options={copPresetOptions}
          customLabel={t('common.custom')}
          selectedId={local.copPresetId}
          onSelect={(id, value) => {
            update('copPresetId', id)
            if (value !== null) update('heatPumpCop', value)
          }}
        />
        <NumberField
          label={t('heating.heatPumpCop')}
          value={local.heatPumpCop}
          onChange={(v) => {
            update('heatPumpCop', v)
            update('copPresetId', 'custom')
          }}
          step={0.1}
        />
        <NumberField label={t('heating.heatPumpPrice')} value={local.heatPumpPrice} onChange={(v) => update('heatPumpPrice', v)} />
        <NumberField label={t('heating.installationCost')} value={local.installationCost} onChange={(v) => update('installationCost', v)} />
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
          <div className="text-xs text-slate-500">{t('heating.recommendedPowerKw', { hours: DEFAULT_HEAT_PUMP_FULL_LOAD_HOURS })}</div>
          <div className="text-lg font-semibold text-slate-800">{recommendedPowerKw.toLocaleString()} kW</div>
          <p className="mt-1 text-xs text-slate-500">{t('heating.recommendedPowerKwHint')}</p>
        </div>
      </Section>

      <Section title={t('heating.sectionHousehold')}>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={settings.useMonthlyConsumption}
            onChange={(e) => setSettings((prev) => ({ ...prev, useMonthlyConsumption: e.target.checked }))}
          />
          {t('solar.consumptionModeMonthly')}
        </label>
        {settings.useMonthlyConsumption ? (
          <div className="sm:col-span-2">
            <MonthlyProfileEditor
              label={t('solar.monthlyConsumption')}
              monthLabels={t('common.months', { returnObjects: true }) as string[]}
              values={settings.directMonthlyConsumptionKwh}
              onChange={(v) => setSettings((prev) => ({ ...prev, directMonthlyConsumptionKwh: v }))}
            />
          </div>
        ) : (
          <NumberField
            label={t('solar.annualConsumptionKwh')}
            value={settings.annualConsumptionKwh}
            onChange={(v) => setSettings((prev) => ({ ...prev, annualConsumptionKwh: v }))}
          />
        )}
        <p className="text-xs text-slate-500 sm:col-span-2">{t('heating.householdSharedHint')}</p>
      </Section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-1 text-sm font-semibold text-slate-800">{t('heating.sectionSolarAssumptions')}</h3>
        <p className="mb-2 text-xs text-slate-500">
          {t('heating.solarAssumptionsHint', { capacityKw: solarLocal.capacityKw, priceKw: solarLocal.fixedPricePerKw })}
        </p>
        <button
          type="button"
          onClick={onGoToSolarTab}
          className="rounded-md border border-emerald-600 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
        >
          {t('heating.goToSolarTab')}
        </button>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-1 text-sm font-semibold text-slate-800">{t('heating.sectionRecommendation')}</h3>
        <p className="mb-3 text-xs text-slate-500">{t('heating.winterMismatchHint')}</p>
        <CombinedComparisonTable variants={variants} horizonYears={HORIZON_YEARS} />
        {bestVariant && (
          <p className="mt-3 text-sm text-slate-700">
            {bestVariant.capacityKw > 0
              ? t('heating.recommendationSummary', {
                  capacityKw: bestVariant.capacityKw,
                  batteryKwh: bestVariant.batteryCapacityKwh,
                })
              : t('heating.recommendationSummaryNoSolar')}
          </p>
        )}
      </section>

      {bestVariant && (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">{t('heating.resultsTitle')}</h3>
          <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="text-xs text-slate-500">{t('heating.resultsHeatDemand')}</div>
              <div className="font-semibold text-slate-800">{Math.round(heatDemand).toLocaleString()} kWh</div>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="text-xs text-slate-500">{t('heating.resultsElectricityConsumption')}</div>
              <div className="font-semibold text-slate-800">{Math.round(heatPumpElectricity).toLocaleString()} kWh</div>
            </div>
          </div>
          <ResultsSummary
            result={bestVariant.result}
            investmentLabel={t('heating.resultsInvestment')}
            paybackLabel={t('heating.resultsPayback')}
            paybackNeverLabel={t('heating.resultsPaybackNever')}
            totalSavingsLabel={t('heating.resultsTotalSavings')}
            netBenefitLabel={t('heating.resultsNetBenefit')}
            yearsLabel={t('common.years')}
          />
          <div className="mt-4">
            <ResultsChart
              result={bestVariant.result}
              title={t('heating.resultsChartTitle')}
              cumulativeLabel={t('heating.tableCumulative')}
              netLabel={t('heating.tableNet')}
            />
          </div>
          <div className="mt-4">
            <ResultsTable
              result={bestVariant.result}
              yearLabel={t('heating.tableYear')}
              baselineLabel={t('heating.tableBaseline')}
              scenarioLabel={t('heating.tableScenario')}
              savingsLabel={t('heating.tableSavings')}
              cumulativeLabel={t('heating.tableCumulative')}
              netLabel={t('heating.tableNet')}
            />
          </div>
        </section>
      )}
    </div>
  )
}
