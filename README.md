# Saulės elektrinės ir šilumos siurblio atsiperkamumo skaičiuoklė

React (Vite + TypeScript + Tailwind) skaičiuoklė, kurioje yra du nepriklausomi, bet vieną bendrą elektros kainos nustatymą naudojantys skaičiuotuvai:

- **Saulės elektrinė** — atsiperkamumas su dviem scenarijais: grąžinimas į tinklą ("kaupimas") arba baterija be eksporto.
- **Šilumos siurblys** — malkų/granulių pakeitimo oro-vandens šilumos siurbliu atsiperkamumas.

## Paleidimas

```bash
npm install
npm run dev      # dev serveris
npm run test     # Vitest unit testai skaičiavimo branduoliui
npm run build    # produkcinis build (tsc + vite build)
```

Įvesti duomenys automatiškai išsaugomi naršyklės `localStorage`.

## Architektūra

- `src/lib/calculations/` — grynos, testuojamos skaičiavimo funkcijos (be React priklausomybių):
  - `cashflow.ts` — bendras 20 metų pinigų srauto ir atsipirkimo skaičiavimo variklis.
  - `solar.ts` — mėnesinės gamybos/suvartojimo simuliacija, "kaupimo" ir baterijos scenarijai.
  - `heating.ts` — kuro/šilumos siurblio skaičiavimai.
  - `constants.ts` — numatytosios reikšmės (sezoniškumo kreivė, kuro/COP/derlingumo presetai).
- `src/state/` — `localStorage` persistencija ir bendri nustatymai (elektros kaina/brangimas).
- `src/i18n/` — LT (numatyta) ir EN vertimai; naujos kalbos pridedamos `src/i18n/locales/<kalba>/translation.json`.
- `src/components/` — UI: `shared/` bendri komponentai, `solar/` ir `heating/` skaičiuotuvų formos ir rezultatai.

## Modelio prielaidos

- **Mėnesinis granuliariškumas**: gamyba ir suvartojimas skaičiuojami 12 mėnesių tikslumu, ne valandiniu profiliu.
- **"Kaupimo" scenarijus**: mėnesio perteklius kaupiamas kaip kWh kreditas ir naudojamas vėlesnių mėnesių trūkumui dengti superkimo kaina; likutis perkamas įprasta kaina. Nepanaudotas kreditas metų pabaigoje nulinamas.
- **Baterijos scenarijus**: kadangi mėnesio suminiai duomenys nerodo dienos/nakties skirtumo, naudojama prielaida, kad ~35% mėnesio suvartojimo vyksta gamybos (dienos) metu, o 65% - vakare/naktį. Baterija kaupia dienos perteklių ir jį naudoja nakties poreikiui, ribojama talpos ir ciklo efektyvumo. Realus rezultatas priklauso nuo tikslaus paros profilio.
- **Panelių degradacija** (~0.5%/metus, konfigūruojama) ir **baterijos degradacija** (~2%/metus) įskaičiuotos daugiametėje atsipirkimo simuliacijoje. Momentinė mėnesių lentelė rodo 0-tų metų (be degradacijos) vaizdą.
- Saulės ir šildymo skaičiuotuvai tarpusavyje nesujungti — dalinasi tik bendra elektros kaina/brangimu.
