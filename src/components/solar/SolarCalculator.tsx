import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocalStorageState } from '../../state/useLocalStorageState'
import { useSettings } from '../../state/SettingsContext'
import { computeAllSolarVariants, computeMonthlyBreakdown, computeSolarScenario, deriveBatteryMode, estimateBatteryCostEur } from '../../lib/calculations/solar'
import {
  BATTERY_EFFICIENCY_PRESETS,
  BATTERY_USABLE_CAPACITY_PRESETS,
  DAYTIME_CONSUMPTION_SHARE_PRESETS,
  DEFAULT_ANNUAL_MAINTENANCE_COST,
  DEFAULT_BATTERY_DEGRADATION_PCT,
  DEFAULT_BATTERY_USABLE_CAPACITY_PCT,
  DEFAULT_CAPACITY_FEE_PER_KW_MONTH,
  DEFAULT_DAYTIME_CONSUMPTION_SHARE,
  DEFAULT_EXPIRED_CREDIT_COMPENSATION_PER_KWH,
  DEFAULT_MONTHLY_PRODUCTION_SHARE,
  DEFAULT_PANEL_DEGRADATION_PCT,
  DEFAULT_PER_KWH_FEE,
  DEFAULT_PERCENTAGE_RETAINED_BY_ESO,
  DEFAULT_TARIFF_MANUAL_PER_KWH,
  HORIZON_YEARS,
  SETTLEMENT_METHODS,
  SOLAR_YIELD_PRESETS,
} from '../../lib/calculations/constants'
import type { SettlementMethodId, SolarInputs, SystemCostMode } from '../../lib/calculations/types'
import { formatEuro, formatKwh } from '../../lib/format'
import { NumberField, PercentField } from '../shared/NumberField'
import { PresetSelect } from '../shared/PresetSelect'
import { MonthlyProfileEditor } from '../shared/MonthlyProfileEditor'
import { Section } from '../shared/Section'
import { ResultsSummary } from '../shared/ResultsSummary'
import { ResultsChart } from '../shared/ResultsChart'
import { ResultsTable } from '../shared/ResultsTable'
import { InfoTooltip } from '../shared/InfoTooltip'
import { SolarComparisonTable } from './SolarComparisonTable'
import { MonthlyFlowChart } from './MonthlyFlowChart'

export type SolarLocalInputs = Omit<
  SolarInputs,
  | 'electricityPriceNow'
  | 'electricityPriceEscalationPct'
  | 'batteryMode'
  | 'annualConsumptionKwh'
  | 'useMonthlyConsumption'
  | 'directMonthlyConsumptionKwh'
> & {
  yieldPresetId: string
  batteryEfficiencyPresetId: string
  batteryUsableCapacityPresetId: string
  daytimeSharePresetId: string
  horizonYears: number
  hasBattery: boolean
  exportSurplus: boolean
}

export const DEFAULT_SOLAR_LOCAL: SolarLocalInputs = {
  settlementMethod: 'per-kwh-fee',
  perKwhFeeNow: DEFAULT_PER_KWH_FEE,
  perKwhFeeEscalationPct: 3,
  capacityFeePerKwMonth: DEFAULT_CAPACITY_FEE_PER_KW_MONTH,
  capacityFeeEscalationPct: 3,
  percentageRetainedByEso: DEFAULT_PERCENTAGE_RETAINED_BY_ESO,
  tariffManualPerKwh: DEFAULT_TARIFF_MANUAL_PER_KWH,
  tariffManualEscalationPct: 3,
  capacityKw: 10,
  systemCostMode: 'fixed-per-kw',
  fixedPricePerKw: 900,
  panelsCost: 5000,
  inverterCost: 1500,
  otherCosts: 1000,
  hasExportPowerLimit: false,
  exportPowerLimitKw: 5,
  threePhaseSyncMode: false,
  phaseAsymmetryFactor: 50,
  expiredCreditCompensationPerKwh: DEFAULT_EXPIRED_CREDIT_COMPENSATION_PER_KWH,
  annualMaintenanceCost: DEFAULT_ANNUAL_MAINTENANCE_COST,
  maintenanceCostEscalationPct: 3,
  useDirectProduction: false,
  annualYieldKwhPerKwp: 1050,
  yieldPresetId: 'south',
  directMonthlyProductionKwh: new Array(12).fill(0),
  panelDegradationPct: DEFAULT_PANEL_DEGRADATION_PCT,
  hasBattery: false,
  exportSurplus: true,
  batteryCapacityKwh: 10,
  batteryCost: 2000,
  batteryRoundTripEfficiencyPct: 90,
  batteryEfficiencyPresetId: 'lfp-typical',
  batteryDegradationPct: DEFAULT_BATTERY_DEGRADATION_PCT,
  batteryUsableCapacityPct: DEFAULT_BATTERY_USABLE_CAPACITY_PCT,
  batteryUsableCapacityPresetId: 'typical',
  daytimeConsumptionShare: DEFAULT_DAYTIME_CONSUMPTION_SHARE,
  daytimeSharePresetId: 'typical',
  horizonYears: HORIZON_YEARS,
}

export function SolarCalculator() {
  const { t } = useTranslation()
  const { settings, setSettings } = useSettings()
  const [local, setLocal] = useLocalStorageState<SolarLocalInputs>('elektrines.solar', DEFAULT_SOLAR_LOCAL)

  const update = <K extends keyof SolarLocalInputs>(key: K, value: SolarLocalInputs[K]) =>
    setLocal((prev) => ({ ...prev, [key]: value }))

  const inputs: SolarInputs = useMemo(() => {
    const { hasBattery, exportSurplus, ...rest } = local
    return {
      ...rest,
      batteryMode: deriveBatteryMode(hasBattery, exportSurplus),
      batteryCapacityKwh: hasBattery ? local.batteryCapacityKwh : 0,
      batteryCost: hasBattery ? local.batteryCost : 0,
      annualConsumptionKwh: settings.annualConsumptionKwh,
      useMonthlyConsumption: settings.useMonthlyConsumption,
      directMonthlyConsumptionKwh: settings.directMonthlyConsumptionKwh,
      electricityPriceNow: settings.electricityPriceNow,
      electricityPriceEscalationPct: settings.electricityPriceEscalationPct,
    }
  }, [local, settings])

  // The comparison table tests every battery/settlement combination on equal footing, so it always
  // uses the entered battery capacity/cost (not zeroed out by the "hasBattery" checkbox above) -
  // otherwise battery variants would be silently simulated with a 0 kWh, 0 EUR battery whenever the
  // checkbox is off, making them look identical to (or worse than) the no-battery options.
  const comparisonInputs: SolarInputs = useMemo(() => {
    const { hasBattery, exportSurplus, ...rest } = local
    return {
      ...rest,
      batteryMode: deriveBatteryMode(hasBattery, exportSurplus),
      annualConsumptionKwh: settings.annualConsumptionKwh,
      useMonthlyConsumption: settings.useMonthlyConsumption,
      directMonthlyConsumptionKwh: settings.directMonthlyConsumptionKwh,
      electricityPriceNow: settings.electricityPriceNow,
      electricityPriceEscalationPct: settings.electricityPriceEscalationPct,
    }
  }, [local, settings])

  const result = useMemo(
    () => computeSolarScenario(inputs, DEFAULT_MONTHLY_PRODUCTION_SHARE, local.horizonYears),
    [inputs, local.horizonYears],
  )

  const allVariants = useMemo(
    () => computeAllSolarVariants(comparisonInputs, DEFAULT_MONTHLY_PRODUCTION_SHARE, local.horizonYears),
    [comparisonInputs, local.horizonYears],
  )

  const monthlyBreakdown = useMemo(
    () => computeMonthlyBreakdown(inputs, DEFAULT_MONTHLY_PRODUCTION_SHARE),
    [inputs],
  )

  const yieldPresetOptions = SOLAR_YIELD_PRESETS.map((p) => ({ id: p.id, label: t(p.labelKey), value: p.kwhPerKwp }))
  const batteryEfficiencyOptions = BATTERY_EFFICIENCY_PRESETS.map((p) => ({ id: p.id, label: t(p.labelKey), value: p.value * 100 }))
  const batteryUsableCapacityOptions = BATTERY_USABLE_CAPACITY_PRESETS.map((p) => ({ id: p.id, label: t(p.labelKey), value: p.value }))
  const daytimeShareOptions = DAYTIME_CONSUMPTION_SHARE_PRESETS.map((p) => ({ id: p.id, label: t(p.labelKey), value: p.value }))

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold text-slate-800">{t('solar.title')}</h2>

      <Section title={t('solar.sectionHorizon')}>
        <NumberField
          label={t('solar.horizonYears')}
          value={local.horizonYears}
          onChange={(v) => update('horizonYears', Math.max(1, Math.round(v)))}
          suffix={t('common.years')}
          min={1}
          step={1}
        />
      </Section>

      <Section title={t('solar.sectionSettlement')}>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="font-medium text-slate-700">{t('solar.exportSurplusLabel')}</span>
          <select
            className="rounded-md border border-slate-300 px-3 py-1.5 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            value={local.exportSurplus ? 'yes' : 'no'}
            onChange={(e) => update('exportSurplus', e.target.value === 'yes')}
          >
            <option value="yes">{t('solar.exportSurplusYes')}</option>
            <option value="no">{t('solar.exportSurplusNo')}</option>
          </select>
        </label>

        {!local.exportSurplus && <p className="text-sm text-slate-600 sm:col-span-2">{t('solar.exportSurplusNoHint')}</p>}

        {local.exportSurplus && (
          <>
            <p className="text-sm text-slate-600 sm:col-span-2">
              {t('solar.settlementSourceNote')}{' '}
              <a
                href="https://www.eso.lt/lt/namams/elektra/tarifai-kainos-atsiskaitymas-ir-skolos/gaminanciu-vartotoju-kainos.html"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-emerald-700 underline hover:text-emerald-800"
              >
                {t('solar.settlementSourceLinkText')}
              </a>
            </p>

            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span className="font-medium text-slate-700">{t('solar.settlementMethod')}</span>
              <select
                className="rounded-md border border-slate-300 px-3 py-1.5 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                value={local.settlementMethod}
                onChange={(e) => update('settlementMethod', e.target.value as SettlementMethodId)}
              >
                {SETTLEMENT_METHODS.map((method) => (
                  <option key={method.id} value={method.id}>
                    {t(method.labelKey)}
                  </option>
                ))}
              </select>
            </label>

            {local.settlementMethod === 'per-kwh-fee' && (
              <>
                <p className="text-sm text-slate-600 sm:col-span-2">{t('solar.settlementPerKwhFeeDesc')}</p>
                <NumberField label={t('solar.perKwhFee')} value={local.perKwhFeeNow} onChange={(v) => update('perKwhFeeNow', v)} step={0.0001} />
                <PercentField label={t('solar.perKwhFeeEscalation')} value={local.perKwhFeeEscalationPct} onChange={(v) => update('perKwhFeeEscalationPct', v)} />
              </>
            )}
            {local.settlementMethod === 'capacity-fee' && (
              <>
                <p className="text-sm text-slate-600 sm:col-span-2">{t('solar.settlementCapacityFeeDesc')}</p>
                <NumberField
                  label={t('solar.capacityFeePerKwMonth')}
                  value={local.capacityFeePerKwMonth}
                  onChange={(v) => update('capacityFeePerKwMonth', v)}
                  step={0.0001}
                />
                <PercentField label={t('solar.capacityFeeEscalation')} value={local.capacityFeeEscalationPct} onChange={(v) => update('capacityFeeEscalationPct', v)} />
              </>
            )}
            {local.settlementMethod === 'percentage' && (
              <>
                <p className="text-sm text-slate-600 sm:col-span-2">{t('solar.settlementPercentageDesc')}</p>
                <PercentField
                  label={t('solar.percentageRetainedByEso')}
                  value={local.percentageRetainedByEso}
                  onChange={(v) => update('percentageRetainedByEso', v)}
                />
              </>
            )}
            {local.settlementMethod === 'tariff-manual' && (
              <>
                <p className="text-sm text-slate-600 sm:col-span-2">
                  {t('solar.settlementTariffManualDesc')}{' '}
                  <a
                    href="https://www.eso.lt/namams/elektra/tarifu-planai-kainos-atsiskaitymas/tarifu-planai-ir-kainos-2026-metais/4801"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-emerald-700 underline hover:text-emerald-800"
                  >
                    {t('solar.settlementTariffPlansLinkText')}
                  </a>
                </p>
                <NumberField label={t('solar.tariffManual')} value={local.tariffManualPerKwh} onChange={(v) => update('tariffManualPerKwh', v)} step={0.0001} />
                <PercentField label={t('solar.tariffManualEscalation')} value={local.tariffManualEscalationPct} onChange={(v) => update('tariffManualEscalationPct', v)} />
              </>
            )}

            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={local.hasExportPowerLimit}
                onChange={(e) => update('hasExportPowerLimit', e.target.checked)}
              />
              {t('solar.hasExportPowerLimitLabel')}
            </label>
            {local.hasExportPowerLimit ? (
              <>
                <NumberField
                  label={t('solar.exportPowerLimitKw')}
                  value={local.exportPowerLimitKw}
                  onChange={(v) => update('exportPowerLimitKw', v)}
                  suffix="kW"
                />
                <p className="text-sm text-slate-600 sm:col-span-2">{t('solar.exportPowerLimitHint')}</p>
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={local.threePhaseSyncMode}
                    onChange={(e) => update('threePhaseSyncMode', e.target.checked)}
                  />
                  {t('solar.threePhaseSyncModeLabel')}
                </label>
                {local.threePhaseSyncMode && (
                  <>
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="font-medium text-slate-700">{t('solar.phaseAsymmetryLabel')}</span>
                      <select
                        className="rounded-md border border-slate-300 px-3 py-1.5 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        value={local.phaseAsymmetryFactor}
                        onChange={(e) => update('phaseAsymmetryFactor', Number(e.target.value))}
                      >
                        <option value={0}>{t('solar.phaseAsymmetrySymmetric')}</option>
                        <option value={50}>{t('solar.phaseAsymmetryModerate')}</option>
                        <option value={100}>{t('solar.phaseAsymmetryHigh')}</option>
                      </select>
                    </label>
                    <p className="text-sm text-slate-600 sm:col-span-2">{t('solar.threePhaseSyncHint')}</p>
                  </>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-600 sm:col-span-2">{t('solar.exportPowerLimitOffHint')}</p>
            )}

            <NumberField
              label={t('solar.expiredCreditCompensationPerKwh')}
              value={local.expiredCreditCompensationPerKwh}
              onChange={(v) => update('expiredCreditCompensationPerKwh', v)}
              step={0.001}
              suffix="€/kWh"
            />
            <p className="text-sm text-slate-600 sm:col-span-2">{t('solar.expiredCreditCompensationHint')}</p>
          </>
        )}
      </Section>


      <Section title={t('solar.sectionSystem')}>
        <NumberField label={t('solar.capacityKw')} value={local.capacityKw} onChange={(v) => update('capacityKw', v)} suffix="kW" />
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">{t('solar.costMode')}</span>
          <select
            className="rounded-md border border-slate-300 px-3 py-1.5 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            value={local.systemCostMode}
            onChange={(e) => update('systemCostMode', e.target.value as SystemCostMode)}
          >
            <option value="fixed-per-kw">{t('solar.costModeFixedPerKw')}</option>
            <option value="split">{t('solar.costModeSplit')}</option>
          </select>
        </label>
        {local.systemCostMode === 'fixed-per-kw' ? (
          <NumberField label={t('solar.fixedPricePerKw')} value={local.fixedPricePerKw} onChange={(v) => update('fixedPricePerKw', v)} />
        ) : (
          <>
            <NumberField label={t('solar.panelsCost')} value={local.panelsCost} onChange={(v) => update('panelsCost', v)} />
            <NumberField label={t('solar.inverterCost')} value={local.inverterCost} onChange={(v) => update('inverterCost', v)} />
          </>
        )}
        <NumberField label={t('solar.otherCosts')} value={local.otherCosts} onChange={(v) => update('otherCosts', v)} />
        <NumberField
          label={t('solar.annualMaintenanceCost')}
          value={local.annualMaintenanceCost}
          onChange={(v) => update('annualMaintenanceCost', v)}
          hint={t('solar.annualMaintenanceCostHint')}
        />
        <PercentField
          label={t('solar.maintenanceCostEscalationPct')}
          value={local.maintenanceCostEscalationPct}
          onChange={(v) => update('maintenanceCostEscalationPct', v)}
        />
      </Section>

      <Section title={t('solar.sectionProduction')}>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={local.useDirectProduction}
            onChange={(e) => update('useDirectProduction', e.target.checked)}
          />
          {t('solar.productionModeDirect')}
        </label>
        {local.useDirectProduction ? (
          <div className="sm:col-span-2">
            <MonthlyProfileEditor
              label={t('solar.monthlyProduction')}
              monthLabels={t('common.months', { returnObjects: true }) as string[]}
              values={local.directMonthlyProductionKwh}
              onChange={(v) => update('directMonthlyProductionKwh', v)}
            />
          </div>
        ) : (
          <>
            <PresetSelect
              label={t('solar.yieldPreset')}
              options={yieldPresetOptions}
              customLabel={t('common.custom')}
              selectedId={local.yieldPresetId}
              onSelect={(id, value) => {
                update('yieldPresetId', id)
                if (value !== null) update('annualYieldKwhPerKwp', value)
              }}
            />
            <NumberField
              label={t('solar.annualYieldKwhPerKwp')}
              value={local.annualYieldKwhPerKwp}
              onChange={(v) => {
                update('annualYieldKwhPerKwp', v)
                update('yieldPresetId', 'custom')
              }}
            />
          </>
        )}
        <PercentField
          label={t('solar.panelDegradationPct')}
          value={local.panelDegradationPct}
          onChange={(v) => update('panelDegradationPct', v)}
          hint={t('solar.panelDegradationPctHint')}
        />
      </Section>

      <Section title={t('solar.sectionConsumption')}>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={settings.useMonthlyConsumption}
            onChange={(e) => {
              const checked = e.target.checked
              setSettings((prev) => ({
                ...prev,
                useMonthlyConsumption: checked,
                ...(checked
                  ? { directMonthlyConsumptionKwh: new Array(12).fill(Math.round(prev.annualConsumptionKwh / 12)) }
                  : {}),
              }))
            }}
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
              totalLabel={t('common.monthlyProfileTotal')}
            />
          </div>
        ) : (
          <NumberField
            label={t('solar.annualConsumptionKwh')}
            value={settings.annualConsumptionKwh}
            onChange={(v) => setSettings((prev) => ({ ...prev, annualConsumptionKwh: v }))}
          />
        )}
      </Section>

      <Section title={t('solar.sectionScenario')}>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={local.hasBattery} onChange={(e) => update('hasBattery', e.target.checked)} />
          {t('solar.hasBatteryLabel')}
        </label>
        <p className="text-sm text-slate-600 sm:col-span-2">{t('solar.batterySizingHint')}</p>
        <NumberField label={t('solar.batteryCapacityKwh')} value={local.batteryCapacityKwh} onChange={(v) => update('batteryCapacityKwh', v)} />
        <NumberField
          label={t('solar.batteryCost')}
          value={local.batteryCost}
          onChange={(v) => update('batteryCost', v)}
          hint={t('solar.batteryCostHint', { estimate: Math.round(estimateBatteryCostEur(local.batteryCapacityKwh)) })}
        />
        <PresetSelect
          label={t('solar.batteryEfficiency')}
          options={batteryEfficiencyOptions}
          customLabel={t('common.custom')}
          selectedId={local.batteryEfficiencyPresetId}
          onSelect={(id, value) => {
            update('batteryEfficiencyPresetId', id)
            if (value !== null) update('batteryRoundTripEfficiencyPct', value)
          }}
        />
        <NumberField
          label={t('solar.batteryEfficiency')}
          value={local.batteryRoundTripEfficiencyPct}
          onChange={(v) => {
            update('batteryRoundTripEfficiencyPct', v)
            update('batteryEfficiencyPresetId', 'custom')
          }}
        />
        <PercentField
          label={t('solar.batteryDegradationPct')}
          value={local.batteryDegradationPct}
          onChange={(v) => update('batteryDegradationPct', v)}
          hint={t('solar.batteryDegradationPctHint')}
        />
        <PresetSelect
          label={t('solar.batteryUsableCapacityPct')}
          options={batteryUsableCapacityOptions}
          customLabel={t('common.custom')}
          selectedId={local.batteryUsableCapacityPresetId}
          onSelect={(id, value) => {
            update('batteryUsableCapacityPresetId', id)
            if (value !== null) update('batteryUsableCapacityPct', value)
          }}
        />
        <PercentField
          label={t('solar.batteryUsableCapacityPct')}
          value={local.batteryUsableCapacityPct}
          onChange={(v) => {
            update('batteryUsableCapacityPct', v)
            update('batteryUsableCapacityPresetId', 'custom')
          }}
          hint={t('solar.batteryUsableCapacityPctHint')}
        />
        <PresetSelect
          label={t('solar.daytimeConsumptionShare')}
          options={daytimeShareOptions}
          customLabel={t('common.custom')}
          selectedId={local.daytimeSharePresetId}
          onSelect={(id, value) => {
            update('daytimeSharePresetId', id)
            if (value !== null) update('daytimeConsumptionShare', value)
          }}
        />
        <PercentField
          label={t('solar.daytimeConsumptionShare')}
          value={local.daytimeConsumptionShare}
          onChange={(v) => {
            update('daytimeConsumptionShare', v)
            update('daytimeSharePresetId', 'custom')
          }}
          hint={t('solar.daytimeConsumptionShareHint')}
        />
      </Section>

      <details className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500">
        <summary className="cursor-pointer select-none font-medium text-slate-600">{t('solar.assumptionsLabel')}</summary>
        <div className="mt-2 flex flex-col gap-2">
          {local.hasBattery && local.exportSurplus && (
            <p>
              {t('solar.assumptionBattery')} {t('solar.assumptionCreditExpiry')}
            </p>
          )}
          {local.hasBattery && !local.exportSurplus && <p>{t('solar.assumptionBattery')}</p>}
          {!local.hasBattery && local.exportSurplus && <p>{t('solar.assumptionCreditExpiry')}</p>}
          {!local.hasBattery && !local.exportSurplus && <p>{t('solar.assumptionNoBatteryNoExport')}</p>}
          {local.exportSurplus && local.hasExportPowerLimit && <p>{t('solar.assumptionExportPowerLimit')}</p>}
        </div>
      </details>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-1 text-sm font-semibold text-slate-800">{t('solar.sectionMonthlyFlow')}</h3>
        <p className="mb-3 text-xs text-slate-500">{t('solar.sectionMonthlyFlowHint')}</p>
        <MonthlyFlowChart
          rows={monthlyBreakdown}
          monthLabels={t('common.months', { returnObjects: true }) as string[]}
          totalLabel={t('solar.flowTotal')}
          productionLabel={t('solar.flowProduction')}
          consumptionLabel={t('solar.flowConsumption')}
          chargedToBatteryLabel={t('solar.flowChargedToBattery')}
          exportedLabel={t('solar.flowExported')}
          wastedProductionLabel={t('solar.flowWasted')}
          boughtFromBankLabel={t('solar.flowBoughtFromBank')}
          boughtFullPriceLabel={t('solar.flowBoughtFullPrice')}
          bankBalanceLabel={t('solar.flowBankBalance')}
          curtailedByExportLimitLabel={t('solar.flowCurtailedByExportLimit')}
          expiredCreditsLabel={t('solar.flowExpiredCredits')}
          retainedByEsoLabel={t('solar.flowRetainedByEso')}
        />
        {(() => {
          const totalExpired = monthlyBreakdown.reduce((s, r) => s + r.expiredCredits, 0)
          if (totalExpired <= 0 || local.expiredCreditCompensationPerKwh <= 0) return null
          const compensation = totalExpired * local.expiredCreditCompensationPerKwh
          return (
            <p className="mt-2 text-xs text-slate-600">
              {t('solar.flowExpiredCreditsCompensationNote', {
                kwh: formatKwh(totalExpired),
                eur: formatEuro(compensation),
              })}
            </p>
          )
        })()}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 flex items-center text-sm font-semibold text-slate-800">
          {t('solar.resultsTitle')}
          <InfoTooltip text={local.hasBattery ? t('solar.assumptionBattery') : t('solar.assumptionCreditExpiry')} />
        </h3>
        <ResultsSummary
          result={result}
          investmentLabel={t('solar.resultsInvestment')}
          paybackLabel={t('solar.resultsPayback')}
          paybackNeverLabel={t('solar.resultsPaybackNever', { years: local.horizonYears })}
          totalSavingsLabel={t('solar.resultsTotalSavings', { years: local.horizonYears })}
          netBenefitLabel={t('solar.resultsNetBenefit', { years: local.horizonYears })}
          yearsLabel={t('common.years')}
        />
        <div className="mt-4">
          <ResultsChart
            result={result}
            title={t('solar.resultsChartTitle')}
            cumulativeLabel={t('solar.tableCumulative')}
            netLabel={t('solar.tableNet')}
          />
        </div>
        <div className="mt-4">
          <ResultsTable
            result={result}
            yearLabel={t('solar.tableYear')}
            baselineLabel={t('solar.tableBaseline')}
            scenarioLabel={t('solar.tableScenario')}
            savingsLabel={t('solar.tableSavings')}
            cumulativeLabel={t('solar.tableCumulative')}
            netLabel={t('solar.tableNet')}
          />
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-1 text-sm font-semibold text-slate-800">{t('solar.comparisonTitle')}</h3>
        <p className="mb-3 text-xs text-slate-500">{t('solar.comparisonHint')}</p>
        <SolarComparisonTable variants={allVariants} horizonYears={local.horizonYears} />
      </section>
    </div>
  )
}

