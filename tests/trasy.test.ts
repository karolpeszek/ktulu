/**
 * Wewnętrzne odnośniki muszą wskazywać istniejące trasy.
 *
 * Po przeniesieniu pulpitu pod /manitou trzy odnośniki zostały pod starymi
 * adresami i prowadziły na stronę 404 — w tym ten, którym zaczyna się
 * rozgrywkę. Kompilator tego nie łapie, bo adres to zwykły napis, więc
 * pilnuje tego test.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const KATALOG_APP = "src/app";
const KATALOG_ZRODEL = "src";

function pliki(katalog: string, filtr: (p: string) => boolean): string[] {
  const wynik: string[] = [];
  for (const wpis of readdirSync(katalog)) {
    const pelna = join(katalog, wpis);
    if (statSync(pelna).isDirectory()) wynik.push(...pliki(pelna, filtr));
    else if (filtr(pelna)) wynik.push(pelna);
  }
  return wynik;
}

/** Trasy wyprowadzone z układu katalogów, tak jak robi to router Next. */
function istniejaceTrasy(): Set<string> {
  const trasy = new Set<string>();
  for (const plik of pliki(KATALOG_APP, (p) => p.endsWith(`${sep}page.tsx`))) {
    const katalog = relative(KATALOG_APP, plik).split(sep).slice(0, -1);
    trasy.add("/" + katalog.join("/"));
  }
  // Katalog główny daje pustą ścieżkę — router widzi ją jako "/".
  trasy.delete("/");
  trasy.add("/");
  return trasy;
}

/** Adresy z href="..." oraz router.push/replace("..."). */
function uzyteAdresy(): { plik: string; adres: string }[] {
  const znalezione: { plik: string; adres: string }[] = [];
  const wzorce = [/href="(\/[^"]*)"/g, /router\.(?:push|replace)\("(\/[^"]*)"\)/g];
  for (const plik of pliki(KATALOG_ZRODEL, (p) => p.endsWith(".tsx") || p.endsWith(".ts"))) {
    const tresc = readFileSync(plik, "utf8");
    for (const wzorzec of wzorce) {
      for (const trafienie of tresc.matchAll(wzorzec)) {
        znalezione.push({ plik, adres: trafienie[1] });
      }
    }
  }
  return znalezione;
}

describe("Wewnętrzne odnośniki", () => {
  it("każdy prowadzi do istniejącej strony", () => {
    const trasy = istniejaceTrasy();
    const bledy: string[] = [];
    for (const { plik, adres } of uzyteAdresy()) {
      // Pomijamy API i pliki statyczne — to nie są trasy routera.
      if (adres.startsWith("/api/")) continue;
      if (/\.[a-z0-9]+$/i.test(adres)) continue;
      const bezOgona = adres.split(/[?#]/)[0].replace(/\/$/, "") || "/";
      if (!trasy.has(bezOgona)) bledy.push(`${plik}: ${adres}`);
    }
    assert.deepEqual(bledy, [], `odnośniki do nieistniejących tras:\n${bledy.join("\n")}`);
  });

  it("pulpit i ekran gracza faktycznie istnieją", () => {
    const trasy = istniejaceTrasy();
    for (const t of ["/", "/manitou", "/manitou/gra", "/manitou/karty", "/manitou/ustawienia"]) {
      assert.ok(trasy.has(t), `brak trasy ${t}`);
    }
  });
});
