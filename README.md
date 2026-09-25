# Bygglabbet

En webbapp för att experimentera **visuellt** med att bygga saker i trä – utifrån de
material och verktyg du faktiskt har.

Skriv t.ex. *"Bygg ett hyllsystem mot en vägg som är 2,5 meter bred och 3 meter hög"* eller
*"Bygg en katt-patio mot huset"*, så får du:

- en **3D-modell** du kan snurra, zooma, genomlysa (röntgen) och spränga isär
- **byggsteg** som visar hur konstruktionen växer fram, steg för steg
- en **kapningslista** (längder, klyvning, vinkelkap)
- en **inköpslista** med kapoptimering på säljlängder, skivschema och ungefärlig kostnad
- en **kontroll** av att allt går att bygga med dina verktyg (t.ex. klyvning kräver bordssåg,
  45°-kap görs bäst med kap- & gersåg)

## Material och verktyg

Under **Material** bockar du i vad du har (t.ex. bara *Regel 45×45*) och kan lägga till eget
virke, skivor och nät med mått, säljlängd och pris. Under **Verktyg** väljer du t.ex.
*vanlig såg*, *kap- & gersåg* och *bordssåg*.

Mallarna anpassar sig automatiskt:

- finns bara reglar blir hyllplan och bänkskivor av ribbor
- utan kap- & gersåg/bordssåg får katt-pation hörnplåtar i stället för 45°-snedstöd
- med bordssåg klyvs grovt virke till tunna remsor för byrå och pennställ

## Mallar

| Mall | Exempel |
| --- | --- |
| 📚 Hyllsystem mot vägg | "hyllsystem 2,5 m brett och 3 m högt med 7 hyllor" |
| 🗃️ Hyllsystem av spånskivor | "hyllsystem av spånskivor 18 mm, 2,5 m brett och 2,5 m högt" – eller "… av spånskivor och reglar 45x45" för gavlar av reglar |
| 🐈 Katt-patio | "katt-patio mot huset, 2 x 1,2 m, utan dörr" |
| 🛠️ Arbetsbänk | "arbetsbänk 1,6 m lång med hylla under" |
| 🗄️ Byrå med lådor | "byrå med 4 lådor, 80 cm bred och 90 cm hög" |
| ✏️ Pennställ med låda | "pennställ med låda, 22 cm brett" |
| 🌱 Odlingslåda | "odlingslåda 1,2 × 0,8 m" |
| 🪑 Sittbänk | "sittbänk 1,4 m lång" |

Mått, antal och alternativ kan sedan justeras med reglage.

## Fri redigering

- Klicka på en del i 3D-vyn för att ändra namn, material, mått, position, rotation och kapvinklar
- **Flytta** med dragreglage i 3D, eller piltangenter (10 mm, Shift = 100 mm, PgUp/PgDn i höjd)
- Duplicera, vrid 90°, ta bort, lägg till nya delar
- Ångra/gör om (Ctrl+Z / Ctrl+Y)
- Spara projekt i webbläsaren, exportera/importera JSON, spara bild, skriv ut ritning och listor

## AI (valfritt)

Med en egen Anthropic API-nyckel (AI-inställningar under **Bygg**) kan Claude rita helt fria
konstruktioner – *"bygg en fågelholk"* – eller ändra den nuvarande – *"gör hyllan 20 cm djupare
och lägg till en lucka"*. AI:n får veta vilka material och verktyg du har. Nyckeln skickas bara
direkt från din webbläsare till Anthropic och sparas bara om du kryssar i "Kom ihåg".

## Utveckling

```bash
npm install
npm run dev          # utvecklingsserver
npm test             # enhetstester (tolkning, mallar, kapoptimering)
npm run build        # bygger till dist/
npm run build:single # allt i en enda fristående HTML-fil (dist-single/index.html)
```

Byggt med TypeScript, Vite och three.js. Alla mått är i millimeter.

Koden i korthet:

- `src/generators/` – mallarna (parametriska byggen) och `builder.ts` med materialval
- `src/parse.ts` – tolkar fritext ("2,5 meter bred", "fyra lådor", "mot huset")
- `src/analysis.ts` – kapningslista, kapoptimering, skivschema och verktygskontroll
- `src/viewer.ts` – 3D-vyn
- `src/ai.ts` – AI-generering via Claude
- `src/main.ts` – gränssnittet

## Publicering

Workflowen `.github/workflows/deploy.yml` bygger och publicerar appen på GitHub Pages vid push
till `main` (aktivera *Settings → Pages → Source: GitHub Actions*).
