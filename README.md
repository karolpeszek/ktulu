# Ktulu — pulpit Manitou

Aplikacja do prowadzenia rozgrywki w Ktulu (gra towarzyska oparta na „mafii”, wg *Wyelkiej Xięgi
Ktulu*). Wszystko dzieje się w przeglądarce — bez serwera i bez konta. Stan gry zapisuje się w
`localStorage`, więc odświeżenie strony w środku nocy niczego nie kasuje.

## Uruchomienie

```bash
pnpm install
pnpm run dev       # http://localhost:3000
pnpm run build     # eksport statyczny do out/ + wygenerowanie service workera
pnpm run preview   # podgląd zbudowanej wersji na http://localhost:4173
pnpm run lint
pnpm dlx tsx scripts/sim.ts   # 200 symulowanych partii — sanity check silnika
```

Aplikacja jest w całości statyczna (`output: "export"`), bez backendu — build produkuje zwykłe
pliki w `out/`.

## Offline i aktualizacje

Po pierwszym otwarciu service worker zapisuje w cache całą aplikację, więc kolejne uruchomienia
działają bez internetu — przydatne, gdy gra toczy się przy ognisku poza zasięgiem. Stan rozgrywki
i tak siedzi w `localStorage`.

Service worker (`out/sw.js`) jest generowany po buildzie przez [scripts/gen-sw.mjs](scripts/gen-sw.mjs):
skrypt skanuje `out/`, wypisuje listę plików do zapisania w cache i stempluje ją hashem zawartości.
Każda zmiana w buildzie daje nowy hash, więc przeglądarka wykrywa nową wersję. Wtedy — po
załadowaniu w tle — w rogu pojawia się „Dostępna nowa wersja” z przyciskami *Odśwież teraz* i
*Później*; nic nie przeładowuje się samo w środku prowadzonej nocy. Aplikacja sprawdza aktualizacje
przy starcie, po powrocie do karty i co godzinę.

Zasoby z hashem w nazwie (`/_next/static/*`) serwowane są z cache, reszta strategią
network-first z fallbackiem na cache. Nagłówki w [public/_headers](public/_headers) pilnują, żeby
`sw.js`, manifest i `version.json` nigdy nie były cache’owane przez CDN.

## Wdrożenie na Cloudflare

Projekt jest wdrażany jako **Worker ze statycznymi zasobami** (Workers Builds) — aplikacja nie ma
kodu serwerowego, więc [wrangler.toml](wrangler.toml) nie deklaruje pola `main`, tylko sekcję
`[assets]` wskazującą katalog `out`.

Z linii poleceń:

```bash
pnpm run deploy   # build + wrangler deploy
```

Ustawienia projektu połączonego z repozytorium:

| Ustawienie | Wartość |
| --- | --- |
| Build command | `pnpm run build` |
| Deploy command | `npx wrangler deploy` |
| Node version | z `.nvmrc` (24) |

`html_handling = "auto-trailing-slash"` dopasowuje się do `trailingSlash: true` w Next (trasa `/gra`
i `/gra/` trafiają w ten sam `out/gra/index.html`), a `not_found_handling = "404-page"` serwuje
wyeksportowaną stronę 404. Plik `_headers` leży w `public/`, więc trafia do `out/` razem z buildem.

Gdyby projekt miał jednak być klasycznym **Pages**, wrangler.toml musi zamiast sekcji `[assets]`
zawierać `pages_build_output_dir = "out"`, a komendą wdrożenia jest
`wrangler pages deploy out --project-name ktulu`. Obie konfiguracje wykluczają się nawzajem:
`wrangler deploy` na konfiguracji Pages kończy się błędem `Missing entry-point to Worker script or
to assets directory`.

## Zależności

Projekt używa **pnpm**. Wersję przybija pole `packageManager` w [package.json](package.json)
(`pnpm@10.11.1` — dokładnie ta, którą ma builder Cloudflare), więc lokalnie i w CI instaluje
dokładnie ten sam pnpm, niezależnie od tego, co jest w systemie. W repozytorium jest wyłącznie
`pnpm-lock.yaml`; `package-lock.json` i `yarn.lock` są w `.gitignore`, bo Cloudflare wybiera
menedżera pakietów po pliku blokady i dwa naraz oznaczają losowy wybór.

Nie ma pliku `pnpm-workspace.yaml` — to pojedynczy pakiet, nie monorepo. Gdyby taki plik powstał bez
pola `packages:`, `pnpm install --frozen-lockfile` przerwie się błędem `packages field missing or
empty`. Zgodę na pominięcie skryptu instalacyjnego `unrs-resolver` (niepotrzebnego, bo pakiet ma
gotowe binaria) trzyma pole `pnpm.ignoredBuiltDependencies` w `package.json`.

## Co robi

**Przygotowanie (`/`)**
- lista graczy (pojedynczo lub wklejona hurtem), kolejność = kolejność w kręgu — istotna dla
  detektora ufoków; kolejność zmienia się przeciąganiem gracza po łuku diagramu, przeciąganiem za
  uchwyt przy liście albo strzałkami. Przeciąganie działa na zdarzeniach wskaźnika, więc obsługuje
  mysz, dotyk i Apple Pencil; sterowanie jest widoczne bez najeżdżania tam, gdzie nie ma `hover`,
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
- role, które budzą drugą osobę (dziwka, uwodziciel, szantażysta), dostają wyróżnione polecenie
  „OBUDŹ TERAZ …” — bez tego uwiedziony czy szantażowany nie wiedziałby, kogo dotyczy zakaz,
- dzień: poranny raport, trucizna szamanki, pojedynki (z nadpisaniem wyniku przez rewolwerowca lub
  sędziego), przeszukanie, wieszanie z ułaskawieniem burmistrza,
- automatyczne wykrywanie zwycięstw: odkrycie posążka, szeryf z posążkiem o świcie, odpłynięcie
  bandytów, trzeci sygnał ufoków, wybicie wszystkich przez Indian, powieszenie Janosika,
- półkolisty diagram kręgu rady (frakcje kolorem, posążek, więzienie, ochrona, uśpieni, martwi) —
  służy też jako sposób wskazywania celu; pod spodem legenda oznaczeń, a najechanie na gracza
  pokazuje kartę, stan i przyczynę śmierci,
- panel korekty ręcznej: Manitou zawsze może nadpisać stan gry i ogłosić dowolne zwycięstwo.

**Karteczki (`/karty`)**
- karty do rozcięcia dla każdego gracza: frakcja, nazwa roli, pełny opis zdolności i cel frakcji,
  sześć sztuk (90 × 88 mm) na stronie A4 z liniami cięcia,
- opcje: imię gracza na karcie (albo bez — do rozdania na ślepo), wymieszanie kolejności,
  dołączona ściąga Manitou „kto jest kim” na osobnej stronie,
- „Drukuj / zapisz PDF” otwiera okno drukowania przeglądarki — wybierz „Zapisz jako PDF”.

**Zasady (`/zasady`)** — przycisk pobrania Wyelkiej Xięgi Ktulu (`public/xiegai.pdf`, dostępnej też
offline) oraz pełna ściąga: cele frakcji, kolejność nocy, jawność, opisy wszystkich kart,
tabela składów.

## Janosik (dodatek domowy)

**Osobna, jednoosobowa frakcja** — nie należy do miasta. Można go dołączyć, ale nie trzeba;
przełącznik w składzie frakcji jest aktywny **od 13 graczy**. Gdy Janosik gra, zajmuje jedno miejsce
przy stole, a pozostali gracze dzielą się wg wiersza tabeli Xięgi dla liczby o jeden mniejszej —
przy 13 osobach jest to wiersz „12" (5 / 4 / 3). Liczba przeszukiwanych i noc odpłynięcia statku idą
natomiast za faktyczną liczbą osób przy stole.

Raz w grze, w nocy i w tajemnicy, Janosik może zamachać ciupagą — wtedy wszyscy się cieszą. Nie ma to
żadnego wpływu na warunki zwycięstwa; budzi się we własnej fazie, po mieście i przed bandytami.

Janosik wygrywa wtedy i tylko wtedy, gdy rada miasta go powiesi — gra kończy się natychmiast,
wszyscy pozostali przegrywają, a aplikacja ostrzega Manitou jeszcze przed wykonaniem wyroku. Ma to
też skutek uboczny w warunku zwycięstwa Indian: dopóki Janosik żyje, przy stole zostaje ktoś spoza
plemienia, więc Indianie nie mogą wygrać, dopóki i jego nie zabiją.

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
