# Ktulu — pulpit Manitou

Aplikacja do prowadzenia rozgrywki w Ktulu (gra towarzyska oparta na „mafii”, wg *Wyelkiej Xięgi
Ktulu*). Wszystko dzieje się w przeglądarce — bez serwera i bez konta. Stan gry zapisuje się w
`localStorage`, więc odświeżenie strony w środku nocy niczego nie kasuje.

## Uruchomienie

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # produkcja
npm run lint
npx tsx scripts/sim.ts   # 200 symulowanych partii — sanity check silnika
```

## Co robi

**Przygotowanie (`/`)**
- lista graczy (pojedynczo lub wklejona hurtem), kolejność = kolejność w kręgu — istotna dla
  detektora ufoków,
- skład frakcji z tabeli Xięgi dla 12–30 graczy (3 lub 4 frakcje), z ręczną korektą,
- wybór kart: ręcznie albo automatycznie (kluczowe → tradycyjne → opcjonalne → kontrowersyjne,
  reszta to szeregowi członkowie frakcji),
- losowanie ról albo przydział ręczny gracz po graczu,
- ustawienia Manitou: liczba przeszukiwanych, noc odpłynięcia statku, limit pojedynków, czy bandyci
  mogą zabijać, tryb jawności.

**Rozgrywka (`/gra`)**
- kreator nocy krok po kroku w kolejności z Xięgi (miasto → bandyci → Indianie → ufoki), z tekstem
  do odczytania na głos, oznaczeniem „jawne / tajne” i wynikiem widocznym tylko dla Manitou,
- kroki niewykonalne (postać martwa, spita, w więzieniu, zdolność zużyta) są pokazywane jako
  pomijane wraz z powodem,
- dzień: poranny raport, trucizna szamanki, pojedynki (z nadpisaniem wyniku przez rewolwerowca lub
  sędziego), przeszukanie, wieszanie z ułaskawieniem burmistrza,
- automatyczne wykrywanie zwycięstw: odkrycie posążka, szeryf z posążkiem o świcie, odpłynięcie
  bandytów, trzeci sygnał ufoków, wybicie wszystkich przez Indian, powieszenie Janosika,
- półkolisty diagram kręgu rady (frakcje kolorem, posążek, więzienie, ochrona, uśpieni, martwi) —
  służy też jako sposób wskazywania celu,
- panel korekty ręcznej: Manitou zawsze może nadpisać stan gry i ogłosić dowolne zwycięstwo.

**Karteczki (`/karty`)**
- karty do rozcięcia dla każdego gracza: frakcja, nazwa roli, pełny opis zdolności i cel frakcji,
  sześć sztuk (90 × 88 mm) na stronie A4 z liniami cięcia,
- opcje: imię gracza na karcie (albo bez — do rozdania na ślepo), wymieszanie kolejności,
  dołączona ściąga Manitou „kto jest kim” na osobnej stronie,
- „Drukuj / zapisz PDF” otwiera okno drukowania przeglądarki — wybierz „Zapisz jako PDF”.

**Zasady (`/zasady`)** — pełna ściąga: cele frakcji, kolejność nocy, jawność, opisy wszystkich kart,
tabela składów.

## Janosik (dodatek domowy)

Karta miasta. Raz w grze, w nocy i w tajemnicy, Janosik może zamachać ciupagą — wtedy wszyscy się
cieszą. Nie ma to żadnego wpływu na warunki zwycięstwa. Jeżeli natomiast Janosik zostanie
powieszony, gra kończy się natychmiast: wygrywa Janosik, a wszyscy pozostali przegrywają — aplikacja
ostrzega o tym Manitou jeszcze przed wykonaniem wyroku.

## Struktura

```
src/lib/types.ts     model danych i stan gry
src/lib/roles.ts     katalog kart (miasto, bandyci, Indianie, ufoki)
src/lib/setup.ts     tabela składów, budowanie puli kart, losowanie
src/lib/engine.ts    stan, zabijanie, warunki zwycięstwa, generator kroków nocy
src/lib/resolve.ts   rozstrzyganie kroków nocy i głosowań dnia
src/lib/store.tsx    kontekst Reacta + zapis w localStorage
src/components/      panele nocy i dnia, diagramy, lista graczy, dziennik
```

Motyw jasny/ciemny idzie za ustawieniem systemu (`prefers-color-scheme`).
