# AGENTS.md — projekto gidas AI agentams

Šis failas skirtas kitam AI agentui/botui greitai suprasti projektą prieš darant pakeitimus.
Rašyta lietuviškai, nes tai vartotojo kalba ir dauguma i18n/domenų terminų yra LT.

## Kas tai per projektas

React (Vite + TypeScript + Tailwind v4) skaičiuoklė vienam namų ūkiui, padedanti apsispręsti:

1. **Saulės elektrinė** (`src/components/solar/SolarCalculator.tsx`) — ar verta įsirengti saulės
   elektrinę (+ bateriją), koks atsiskaitymo su ESO būdas geriausias, per kiek metų atsiperka.
2. **Šilumos siurblys + saulė** (`src/components/heating/HeatingCalculator.tsx`) — ar verta keisti
   malkinį/granulinį šildymą į oro-vandens šilumos siurblį, kartu su saulės elektrine ir baterija,
   su rekomenduojama siurblio galia ir saulės/baterijos talpos palyginimo lentele.

Abu skaičiuotuvai yra `App.tsx` dviejų tabų (`'solar'` / `'heating'`) sąsajoje — **nėra ir
neplanuojama daryti trečio tabo**; vartotojas eksplicitiškai paprašė šilumos siurblio
funkcionalumą plėsti PERDARANT esamą tabą, ne kuriant naują.

Vartotojas turi domeno žinių (elektros/šilumos inžinerija, ESO tarifai) ir dažnai iškelia labai
konkrečius, techniškai pagrįstus klausimus apie modelio tikslumą — traktuok jo pastabas rimtai,
tikrink skaičiavimus, o ne tik UI.

## Paleidimas / patikra

```bash
npm install
npm run dev      # dev serveris (Vite)
npm run test     # Vitest — visi calculations/ testai TURI būti paleisti po KIEKVIENO variklio pakeitimo
npm run build    # tsc -b && vite build — TURI būti paleista po kiekvieno pakeitimo (tikrina TS tipus visame projekte)
```

Po bet kokio pakeitimo `src/lib/calculations/**` arba komponentuose, kurie juos naudoja, visada
paleisk **abu** `npm run test` ir `npm run build` viename terminale (`npm run test; npm run build`)
prieš pranešant, kad darbas baigtas.

## Architektūra

```
src/
  lib/calculations/       - grynos, be React, unit-testuojamos skaičiavimo funkcijos
    types.ts              - SolarInputs, HeatingInputs, CashFlowResult, MonthlyValues ir kt.
    constants.ts          - numatytosios reikšmės, presetai, sezoniškumo kreivės
    cashflow.ts           - buildCashFlow() (bendras N-metų pinigų srauto/atsipirkimo variklis) + escalate()
    solar.ts              - saulės/baterijos/ESO atsiskaitymo simuliacija (didžiausias failas)
    heating.ts            - vien šilumos siurblio (be saulės) skaičiavimai
    heatPumpSolar.ts       - NAUJAS: kombinuotas šilumos siurblys + saulė + baterija variklis
    *.test.ts              - Vitest testai kiekvienam engine failui
  state/
    SettingsContext.tsx    - BENDRI abiem tabams nustatymai (React Context + localStorage)
    useLocalStorageState.ts - localStorage persistencijos hook'as (shallow-merge su default)
  components/
    layout/                - Header, TabsNav, SettingsPanel (bendri nustatymai viršuje)
    shared/                 - NumberField, PercentField, PresetSelect, Section, ResultsSummary/Chart/Table, MonthlyProfileEditor, InfoTooltip
    solar/                  - SolarCalculator.tsx (didelis), SolarComparisonTable.tsx, MonthlyFlowChart.tsx
    heating/                - HeatingCalculator.tsx (perdarytas į kombinuotą įrankį), CombinedComparisonTable.tsx
  i18n/
    locales/lt/translation.json  - numatyta kalba (VISADA pildyti pirmą/pilnai)
    locales/en/translation.json  - antra kalba, TURI atitikti tuos pačius raktus
```

### Duomenų srautas / state architektūra

- **Bendra tarp abiejų tabų** (`SettingsContext`/`useSettings()`, raktas `'elektrines.settings'`):
  `electricityPriceNow`, `electricityPriceEscalationPct`, ir (nuo šio pakeitimo) namų ūkio
  suvartojimas `annualConsumptionKwh` / `useMonthlyConsumption` / `directMonthlyConsumptionKwh`
  (šilumos siurblio suvartojimas NEĮSKAIČIUOTAS į šiuos laukus — jis skaičiuojamas atskirai ir
  pridedamas prie namų ūkio suvartojimo tik `heatPumpSolar.ts` viduje).
- **Tik Saulės tabui** (`SolarCalculator.tsx`, raktas `'elektrines.solar'`, tipas
  `SolarLocalInputs` — EKSPORTUOJAMAS iš `SolarCalculator.tsx` kartu su `DEFAULT_SOLAR_LOCAL`):
  elektrinės galia, atsiskaitymo būdas, kainos, derlingumas, baterijos parametrai ir kt.
- **Tik Šilumos tabui** (`HeatingCalculator.tsx`, raktas `'elektrines.heating'`, tipas
  `HeatingLocalInputs`): kuro tipas/kaina/suvartojimas, šilumos siurblio COP/kaina.
- **Svarbus principas**: `HeatingCalculator.tsx` PATS SKAITO Saulės tabo localStorage
  (`useLocalStorageState<SolarLocalInputs>('elektrines.solar', DEFAULT_SOLAR_LOCAL)`), kad
  pakartotinai panaudotų jo atsiskaitymo/kainos/baterijos prielaidas kombinuotame skaičiavime, o
  ne dubliuotų tuos pačius laukus antroje UI vietoje. Jei reikės dar vieno tabo, kuriam reikia kito
  tabo pilnos input struktūros — daryk taip pat (skaityk kito tabo raw storage), o ne kartok laukus.

## Skaičiavimo modelio prielaidos (SVARBU nepamiršti keičiant variklį)

- **Mėnesinis granuliariškumas**: gamyba/suvartojimas/šildymo poreikis skaičiuojami 12 mėnesių
  tikslumu (vidutinė "tipinė diena" kartojama visą mėnesį), NE valandiniu/dienos profiliu.
- **Baterijos/dienos-nakties atskyrimas**: kadangi mėnesio suminiai duomenys nerodo dienos/nakties
  skirtumo, naudojama `daytimeConsumptionShare` (numatyta 35%) prielaida daliai suvartojimo dienos
  metu. NĖRA ir NEGALI BŪTI modeliuojamas para-iš-paros SOC (state of charge) pernešimas — tai
  esminis šio modelio (o ne bug'as) apribojimas; paaiškinta vartotojui, užfiksuota atmintyje.
- **`batteryUsableCapacityPct`** (numatyta 90%) apriboja realiai cikliuojamą baterijos talpą (BMS
  saugumo/ilgaamžiškumo ribos), taikoma `simulateBatteryMonths` viduje.
- **"Kaupimo" (net-metering) scenarijus**: perteklius kaupiamas kaip kWh kreditas SLENKANČIU
  24 mėnesių FIFO langu (ne kalendoriniais metais) — žr. `simulateNetMeteringMonthly`.
- **ESO atsiskaitymo būdai** (`SettlementMethodId`): `per-kwh-fee` | `capacity-fee` | `percentage` |
  `tariff-manual` — 4 oficialūs 2026 m. ESO "gaminančio vartotojo" būdai, tarpusavyje nesumuojami.
- **Panelių degradacija** (~0.5%/metus) ir **baterijos degradacija** (~2%/metus) ĮSKAIČIUOTOS
  daugiametėje `computeSolarAnnualCost` simuliacijoje (bet NE momentinėje `computeMonthlyBreakdown`
  "šiandienos" lentelėje — ten sąmoningai rodomas year-0/pristine vaizdas).
- **Šilumos siurblio + saulės mišinys** (`heatPumpSolar.ts`): šilumos siurblio elektros
  suvartojimas paskirstomas per metus PAGAL `DEFAULT_HEATING_MONTHLY_SHARE` (žiemą sunkiausia) —
  PRIEŠINGA kreivė nei `DEFAULT_MONTHLY_PRODUCTION_SHARE` (saulė vasarą). Tai esminis modelio
  akcentas: saulė padengia tik dalį šilumos siurblio poreikio žiemą.
- **Rekomendacijos** (`heatPumpSolar.ts`): `recommendHeatPumpPowerKw` = metinis šilumos poreikis /
  1800 val., apvalinama Į VIRŠŲ (nedasukimas blogiau nei perdydinimas); `recommendSolarCapacityKw` =
  kombinuotas metinis suvartojimas / derlingumas kWh/kWp, apvalinama iki artimiausio 0.5 kW.
  Palyginimo lentelė (`computeCombinedVariants`) perrenka `[0, 0.5x, 1x, 1.5x]` rekomenduotos
  saulės galios × `[0, 5, 10, 15]` kWh baterijos, surikiuoja pagal `netBenefit`. `capacityKw <= 0`
  ("be saulės") atveju SĄMONINGAI nulinami sistemos kaštų laukai (kad 'split' kainos režimas
  nepaliktų fantominės sąnaudos "be saulės" eilutei).

## i18n konvencijos

- LT (`src/i18n/locales/lt/translation.json`) yra numatyta/pirminė kalba — visada pildyti pirmą arba
  bent jau abi kartu per `multi_replace_string_in_file`.
- EN failas TURI turėti tuos pačius raktus (naudojama testuose/skanavime nepatikrinta automatiškai —
  tikrink rankiniu būdu).
- Naudok `t('section.key', { interpolatedVar })` interpoliaciją tik kai tikrai reikia; statiniai
  tekstai (pvz. "per 20 metų") gali likti statiniai, jei laikotarpis visada fiksuotas (`HORIZON_YEARS`).

## Testavimo/patikros disciplina šioje sesijoje

- Po kiekvieno `calculations/` pakeitimo: pridėti/atnaujinti `*.test.ts`, paleisti
  `npm run test; npm run build` VIENAME terminalo iškvietime, ištaisyti visas klaidas prieš tęsiant.
- UI pakeitimams patikrinti naudotas naršyklės (`open_browser_page`/`click_element`) darbas prieš
  `http://localhost:5175/` (arba koks bebūtų laisvas Vite portas) dev serverį — naudinga, kai reikia
  vizualiai patvirtinti naujus laukus/lenteles prieš atsakant vartotojui.
- **Svarbi pastaba dėl atminties (memory)**: repo atmintis (`/memories/repo/solar-calculator-notes.md`,
  ne šio repo dalis — VS Code agento vidinė atmintis, ne git failas) turi detalią chronologinę
  visų anksčiau ištaisytų klaidų/modelio sprendimų istoriją. Jei esi VS Code Copilot agentas su
  `memory` įrankiu, PERŽIŪRĖK JĄ PRIEŠ darant pakeitimus šiame projekte — ten yra svarbių
  "nedaryk taip vėl" pastabų (pvz. default tarifų kalibravimas, localStorage migracijos
  apribojimai, baterijos srauto skaičiavimo klaidos ir jų taisymai).

## Žinomos, sąmoningai nepataisytos spragos (nepertaisyti be vartotojo prašymo)

- Nepanaudoto/pasibaigusio "kaupimo" kredito ESO/tiekėjo kompensacija (piniginė, ne laisva)
  neįskaičiuota — traktuojama kaip visiškas nuostolis (konservatyvu, ne per daug optimistiška).
- Esamų naudotojų namų ūkio suvartojimo reikšmė, išsaugota po senuoju `'elektrines.solar'` raktu,
  VIENĄ KARTĄ nusistato į numatytą (4000 kWh), kai suvartojimas buvo perkeltas į bendrą
  `'elektrines.settings'` raktą — migracija nerašyta (priimtas kompromisas, žr. repo atmintį).
- Para-iš-paros baterijos SOC perkėlimas (žr. aukščiau) — architektūrinis apribojimas, ne bug'as.
