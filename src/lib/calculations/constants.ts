import type { SettlementMethodId } from './types'

export const HORIZON_YEARS = 20
export const MONTHS_IN_YEAR = 12

export const DAYS_IN_MONTH: readonly number[] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/**
 * Default monthly share of annual solar yield for Lithuania (south-facing roof). Calibrated from
 * a real Klaipėda-region 5 MW park's measured 2025 production (25 975 / 260 414 / 483 908 /
 * 726 088 / 805 054 / 816 909 / 707 411 / 708 657 / 566 878 / 358 771 / 108 111 / 43 615 kWh),
 * which matches the ~5-10% winter (Dec-Feb) share reported for Lithuanian PV plants. Sums to 1.
 */
export const DEFAULT_MONTHLY_PRODUCTION_SHARE: readonly number[] = [
  0.0046, 0.0464, 0.0862, 0.1294, 0.1435, 0.1455, 0.1261, 0.1263, 0.101, 0.0639, 0.0193, 0.0078,
]

/**
 * Default monthly share of annual space-heating demand for Lithuania, derived from Vilnius
 * long-term average monthly temperatures and heating degree-days (base 18°C): heavily loaded
 * Oct-Mar, negligible Jun-Aug. Used to spread a heat pump's annual electricity consumption across
 * the year - this is the OPPOSITE seasonal shape from {@link DEFAULT_MONTHLY_PRODUCTION_SHARE},
 * which is exactly the mismatch a heat pump + solar combination has to deal with (heat pump draws
 * most in winter, when solar produces least). Sums to ~1.
 */
export const DEFAULT_HEATING_MONTHLY_SHARE: readonly number[] = [
  0.1745, 0.1507, 0.1341, 0.0811, 0.0396, 0.0133, 0, 0.0069, 0.0428, 0.0853, 0.1187, 0.1531,
]

/**
 * Rough equivalent full-load hours per year used to translate annual heat demand (kWh) into a
 * recommended heat pump thermal power (kW), i.e. `annualHeatDemandKwh / fullLoadHours`. This is a
 * simplified stand-in for a proper heat-loss calculation at design outdoor temperature - real
 * sizing should also consider the building's peak heat loss, not just annual energy. ~1800h/year
 * is a common rule-of-thumb figure for Baltic-climate heat pump systems (radiators or underfloor).
 */
export const DEFAULT_HEAT_PUMP_FULL_LOAD_HOURS = 1800

/** Candidate solar capacity multipliers (relative to a consumption-based recommendation) shown side by side in the combined heat pump + solar comparison. */
export const SOLAR_CAPACITY_SWEEP_MULTIPLIERS: readonly number[] = [0.5, 1, 1.5]

/** Candidate battery capacities (kWh, including 0 = no battery) shown side by side in the combined heat pump + solar comparison. */
export const BATTERY_CAPACITY_SWEEP_OPTIONS_KWH: readonly number[] = [0, 5, 10, 15]

/** Typical annual PV panel output decline from ageing (manufacturer warranties: ~80-90% of rated output after 25 years). */
export const DEFAULT_PANEL_DEGRADATION_PCT = 0.5

/** Typical annual home-battery (LFP) capacity fade from cycling/calendar ageing - faster than panel degradation, ~70-80% retained after ~10 years of typical use. */
export const DEFAULT_BATTERY_DEGRADATION_PCT = 2

/**
 * Default compensation rate (EUR/kWh) paid by the grid operator for accumulated kWh credits that
 * expire after the 24-month rolling banking window. In Lithuania ESO pays approximately the
 * electricity exchange (NordPool) spot price - roughly 0.03 EUR/kWh in recent years, though this
 * varies with market conditions. Set to 0 to model the conservative case (no compensation).
 */
export const DEFAULT_EXPIRED_CREDIT_COMPENSATION_PER_KWH = 0.03

/**
 * Rough annual reserve (EUR, year-1 value) for system maintenance and possible failures - inverter
 * replacement (typically needed once every ~12-15 years) averaged per year, plus minor repairs and
 * panel cleaning. A starting estimate only - real costs vary with system size, component quality
 * and warranty terms.
 */
export const DEFAULT_ANNUAL_MAINTENANCE_COST = 80

export interface SolarYieldPreset {
  id: string
  labelKey: string
  kwhPerKwp: number
}

export const SOLAR_YIELD_PRESETS: readonly SolarYieldPreset[] = [
  { id: 'south', labelKey: 'solar.yieldPresetSouth', kwhPerKwp: 1050 },
  { id: 'east-west', labelKey: 'solar.yieldPresetEastWest', kwhPerKwp: 900 },
  { id: 'suboptimal', labelKey: 'solar.yieldPresetSuboptimal', kwhPerKwp: 800 },
]

/** 2026 ESO rates for "gaminantis vartotojas" (žemoji įtampa) settlement schemes. */
export const DEFAULT_PER_KWH_FEE = 0.0726
export const DEFAULT_CAPACITY_FEE_PER_KW_MONTH = 5.0336
export const DEFAULT_PERCENTAGE_RETAINED_BY_ESO = 37
/**
 * Default placeholder for the "pay your own persiuntimo tariff plan rate" method - the 2026 ESO
 * "Standartinis" single time-zone plan rate (žemoji įtampa, su PVM), the most common default plan.
 * Real 2026 ESO plans range ~0.05-0.15 €/kWh depending on plan/time-zone - never default this
 * below the cheapest real rate, or this variant looks artificially best regardless of user input.
 */
export const DEFAULT_TARIFF_MANUAL_PER_KWH = 0.11132

export interface SettlementMethodPreset {
  id: SettlementMethodId
  labelKey: string
}

export const SETTLEMENT_METHODS: readonly SettlementMethodPreset[] = [
  { id: 'per-kwh-fee', labelKey: 'solar.settlementPerKwhFee' },
  { id: 'capacity-fee', labelKey: 'solar.settlementCapacityFee' },
  { id: 'percentage', labelKey: 'solar.settlementPercentage' },
  { id: 'tariff-manual', labelKey: 'solar.settlementTariffManual' },
]

export interface BatteryEfficiencyPreset {
  id: string
  labelKey: string
  value: number
}

export const BATTERY_EFFICIENCY_PRESETS: readonly BatteryEfficiencyPreset[] = [
  { id: 'lfp-typical', labelKey: 'solar.batteryPresetLfpTypical', value: 0.9 },
  { id: 'conservative', labelKey: 'solar.batteryPresetConservative', value: 0.8 },
]

/**
 * Default share (0-100) of nameplate battery capacity actually usable, approximating typical BMS
 * charge/discharge limits (e.g. capped at ~95% state of charge and reserving ~5-10% at the bottom
 * for longevity/safety) rather than assuming the full nameplate kWh cycles every day.
 */
export const DEFAULT_BATTERY_USABLE_CAPACITY_PCT = 90

export interface BatteryUsableCapacityPreset {
  id: string
  labelKey: string
  value: number
}

export const BATTERY_USABLE_CAPACITY_PRESETS: readonly BatteryUsableCapacityPreset[] = [
  { id: 'full', labelKey: 'solar.batteryUsablePresetFull', value: 100 },
  { id: 'typical', labelKey: 'solar.batteryUsablePresetTypical', value: 90 },
  { id: 'conservative', labelKey: 'solar.batteryUsablePresetConservative', value: 80 },
]

/**
 * Rough Lithuanian home-battery market price points (capacity kWh -> total cost EUR), used only as
 * a starting estimate hint next to the battery cost field. Real prices vary a lot depending on
 * voltage class (low/high), manufacturer, and installation complexity - actual cost can be up to
 * ~2x these figures either way.
 */
export const BATTERY_COST_ESTIMATE_POINTS: readonly { kwh: number; eur: number }[] = [
  { kwh: 5, eur: 1000 },
  { kwh: 10, eur: 2000 },
  { kwh: 15, eur: 2500 },
  { kwh: 20, eur: 3000 },
]

/**
 * Default share (0-100) of daily consumption assumed to occur during production (daylight) hours.
 * Monthly totals alone can't separate "day" from "night" load, so this split gives the
 * battery/export simulation a day-to-night gap to bridge even when production and consumption net
 * out evenly.
 */
export const DEFAULT_DAYTIME_CONSUMPTION_SHARE = 35

export interface DaytimeConsumptionSharePreset {
  id: string
  labelKey: string
  value: number
}

export const DAYTIME_CONSUMPTION_SHARE_PRESETS: readonly DaytimeConsumptionSharePreset[] = [
  { id: 'mostly-away', labelKey: 'solar.daytimeShareMostlyAway', value: 20 },
  { id: 'typical', labelKey: 'solar.daytimeShareTypical', value: 35 },
  { id: 'mostly-home', labelKey: 'solar.daytimeShareMostlyHome', value: 55 },
]

export interface FuelPreset {
  id: string
  labelKey: string
  unitKey: string
  unitShortKey: string
  energyContentHintKey: string
  energyContentKwhPerUnit: number
  boilerEfficiencyPct: number
}

export const FUEL_PRESETS: readonly FuelPreset[] = [
  {
    id: 'firewood',
    labelKey: 'heating.fuelPresetFirewood',
    unitKey: 'heating.unitSteres',
    unitShortKey: 'heating.unitSteresShort',
    energyContentHintKey: 'heating.energyContentHintFirewood',
    energyContentKwhPerUnit: 1700,
    boilerEfficiencyPct: 70,
  },
  {
    id: 'pellets',
    labelKey: 'heating.fuelPresetPellets',
    unitKey: 'heating.unitKg',
    unitShortKey: 'heating.unitKgShort',
    energyContentHintKey: 'heating.energyContentHintPellets',
    energyContentKwhPerUnit: 4.7,
    boilerEfficiencyPct: 87,
  },
]

export interface CopPreset {
  id: string
  labelKey: string
  value: number
}

export const COP_PRESETS: readonly CopPreset[] = [
  { id: 'older-radiators', labelKey: 'heating.copPresetOlder', value: 2.8 },
  { id: 'average', labelKey: 'heating.copPresetAverage', value: 3.2 },
  { id: 'underfloor-modern', labelKey: 'heating.copPresetModern', value: 3.8 },
]
