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
| 🗃️ Hyllsystem av spånskivor | "hyllsystem av spånskivor 18 mm, 2,5 m brett och 2,5 m högt" – "… och reglar 45x45" för gavlar av reglar, eller "stegehylla av spånskivor och reglar" för hela osågade skivor genom stegar |
| 🐈 Katt-patio | "katt-patio mot huset, 2 x 1,2 m, utan dörr" |
| 🛠️ Arbetsbänk | "arbetsbänk 1,6 m lång med hylla under" |
| 🗄️ Byrå med lådor | "byrå med 4 lådor, 80 cm bred och 90 cm hög" |
| ✏️ Pennställ med låda | "pennställ med låda, 22 cm brett" |
| 🌱 Odlingslåda | "odlingslåda 1,2 × 0,8 m" |
| 🪑 Sittbänk | "sittbänk 1,4 m lång" |
| 🐾 Sittbänk med kattlåda | "sittbänk med box för kattlåda, 1 m lång" – ingång i gaveln, lyftbart sitslock, förvaringsfack |
| 🐦 Fågelholk | "fågelholk för blåmes" eller "… med 32 mm hål" |
| 🪵 Vedförråd | "vedförråd 2 m brett och 80 cm djupt" |
| 🏖️ Sandlåda | "sandlåda 1,5 × 1,5 m med sittkant" |
| 👟 Skohylla | "skohylla 80 cm bred med 3 nivåer" |
| 🧰 Förvaringskista | "dynbox/förvaringskista med lock, 90 cm bred" |
| 🏡 Trädäck / altan | "trädäck 3 x 2 m, 40 cm högt" |
| ☕ Soffbord | "soffbord 110 × 60 cm med hylla under" |

Mått, antal och alternativ kan sedan justeras med reglage.

## Hållfasthet

Fliken **Hållfasthet** räknar ut om konstruktionen bär:

- appen hittar själv vad som vilar på vad (hyllplan på lister, trall på reglar, reglar på bärlinor …)
  och för lasten nedåt genom konstruktionen
- varje liggande del kontrolleras för **böjning**, **svikt** (L/200, L/300 för däck och förråd, med
  krypning – spånskiva kryper mycket) och **skruvinfästning** när en del hänger i skruv
- stolpar och gavlar kontrolleras för tryck/knäckning, och hela konstruktionen för **tipprisk**
- välj last (kg/m²) – t.ex. *Böcker 150*, *Sittyta 300*, *Ved/förråd 400* – och se **utnyttjandegrad**
  per del, hur mycket varje hylla tål i kg och förslag som "minska spannet till ca 580 mm"
- slå på färgkartan för att se svaga delar i 3D (grönt → rött)
- **förslag på förstärkning** för varje del som inte håller (eller är nära gränsen): list under
  fram-/bakkant, tjockare skiva, grövre virke eller högkant, fler skruvar/vinkelbeslag, grövre stolpar
  eller kortare spann. Varje förslag är provräknat – du ser *före → efter*, merkostnad och antal nya
  delar – och **Acceptera** lägger in ändringen i modellen, kapnings- och inköpslistan (kan ångras)
- **Förstärk automatiskt** väljer det billigaste förslaget som räcker för varje svag del

Beräkningen är förenklad (ungefärliga värden för C24/C18, spånskiva, plywood och OSB) och ersätter
inte en konstruktionsberäkning för bärande konstruktioner som höga altaner.

## Ytbehandling

Fliken **Ytbehandling** gör delarna fina – för hela konstruktionen, en grupp (t.ex. alla hyllplan)
eller markerade delar (dubbelklicka för en hel enhet):

- **Kanter:** raka, fasade, rundade eller profilerade (2–10 mm) – syns som riktiga fasade/rundade kanter i 3D
- **Slipning** i steg upp till valt korn (80–240)
- **Behandling:** olja, vax, bets/lasyr, lack eller färg med kulörval – utseendet ändras i 3D
- **Kantband** på skivor
- snabbval som *Rundade kanter + olja*, *Fasat + vit färg*, *Utomhus: lasyr*
- åtgång och kostnad (liter olja/färg/grundfärg, sandpapper per korn, kantband, fräsar), arbetstid och
  torktid, egna byggsteg för ytbehandlingen och kantbearbetning i kapningslistan
- varningar när verktyg saknas (rundning/profil kräver överfräs – annars hyvel/slipkloss) och när
  behandlingen inte passar (lack/vax utomhus, kemikalier i sandlåda/odlingslåda, spånskivekanter)

## Fri redigering

- Klicka på en del i 3D-vyn för att ändra namn, material, mått, position, rotation och kapvinklar
- **Markera hela enheter** – dubbelklicka på en del i 3D (eller välj under *Markera enhet*) för att ta ett helt fack, en gavel, en låda eller ett dörrblad; Shift-klicka för att lägga till/ta bort delar
- **Flytta** markeringen med dragpilar i 3D, med ΔX/ΔY/ΔZ, eller piltangenter (10 mm, Shift = 100 mm, PgUp/PgDn i höjd)
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
- `src/strength.ts` – hållfasthetsanalys (last, böjning, svikt, infästningar, tipprisk)
- `src/reinforce.ts` – förslag på förstärkning som provräknas och kan accepteras
- `src/finish.ts` – ytbehandling: kanter, slipning, olja/vax/lasyr/lack/färg, åtgång och tid
- `src/viewer.ts` – 3D-vyn
- `src/ai.ts` – AI-generering via Claude
- `src/main.ts` – gränssnittet

## Publicering

Workflowen `.github/workflows/deploy.yml` bygger och publicerar appen på GitHub Pages vid push
till `main` (aktivera *Settings → Pages → Source: GitHub Actions*).
