/** Kody wpisywane ręcznie: alfabet bez mylących znaków i czytelne odrzucenia. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  ALFABET,
  DLUGOSC_KODU_POKOJU,
  DLUGOSC_KODU_REJESTRACJI,
  losujKodPokoju,
  losujKodRejestracji,
  losujZnaki,
  pogrupuj,
  rdzenKodu,
  sprawdzKodPokoju,
  sprawdzKodRejestracji,
} from "../src/lib/kody";

describe("Alfabet kodów", () => {
  it("nie zawiera znaków mylonych przy przepisywaniu", () => {
    for (const znak of ["0", "O", "1", "I", "L"]) {
      assert.equal(ALFABET.includes(znak), false, `${znak} powinno być wykluczone`);
    }
    assert.equal(ALFABET.length, 31);
  });

  it("losuje wyłącznie znaki z alfabetu", () => {
    for (let i = 0; i < 200; i++) {
      for (const znak of losujZnaki(12)) assert.ok(ALFABET.includes(znak));
    }
  });

  it("rozkład nie jest przesunięty na początek alfabetu", () => {
    // 256 nie dzieli się przez 31, więc naiwne `% 31` faworyzowałoby
    // pierwsze znaki. Sprawdzamy, że żaden nie dominuje.
    const licznik = new Map<string, number>();
    const probka = losujZnaki(31 * 400);
    for (const znak of probka) licznik.set(znak, (licznik.get(znak) ?? 0) + 1);
    assert.equal(licznik.size, 31, "każdy znak powinien wystąpić");
    const wartosci = [...licznik.values()];
    const min = Math.min(...wartosci);
    const max = Math.max(...wartosci);
    assert.ok(max / min < 1.5, `rozkład zbyt nierówny: ${min}–${max}`);
  });
});

describe("Format kodów", () => {
  it("kod pokoju to cztery gołe znaki", () => {
    assert.match(losujKodPokoju(), /^[2-9A-HJKMNP-Z]{4}$/);
  });

  it("dawny zapis z prefiksem nadal się wpisuje", () => {
    const w = sprawdzKodPokoju("KTULU-AB3D");
    assert.equal(w.ok && w.kod, "AB3D");
  });

  it("kod rejestracji ma trzy grupy po cztery", () => {
    const kod = losujKodRejestracji();
    assert.match(kod, /^[2-9A-HJKMNP-Z]{4}(-[2-9A-HJKMNP-Z]{4}){2}$/);
    assert.equal(rdzenKodu(kod).length, DLUGOSC_KODU_REJESTRACJI);
  });

  it("grupuje znaki po zadanej długości", () => {
    assert.equal(pogrupuj("ABCDEFGH", 4), "ABCD-EFGH");
    assert.equal(pogrupuj("ABC", 4), "ABC");
  });
});

describe("Wpisywanie kodu", () => {
  it("wybacza małe litery, spacje, myślniki i prefiks", () => {
    const w = sprawdzKodPokoju(" ktulu-a b3d ");
    assert.equal(w.ok, true);
    assert.equal(w.ok && w.kod, "AB3D");
    assert.equal(sprawdzKodPokoju("AB3D").ok, true);
  });

  it("wskazuje konkretny mylący znak", () => {
    const zero = sprawdzKodPokoju("AB3O");
    assert.equal(zero.ok, false);
    assert.match(zero.ok === false ? zero.powod : "", /litery O/);
    const jeden = sprawdzKodPokoju("AB3I");
    assert.match(jeden.ok === false ? jeden.powod : "", /jedynki/);
  });

  it("pilnuje długości i pustego pola", () => {
    const krotki = sprawdzKodPokoju("AB3");
    assert.match(krotki.ok === false ? krotki.powod : "", /4 znaków/);
    const pusty = sprawdzKodPokoju("");
    assert.match(pusty.ok === false ? pusty.powod : "", /Wpisz kod/);
  });

  it("wylosowany kod zawsze przechodzi własną walidację", () => {
    for (let i = 0; i < 300; i++) {
      assert.equal(sprawdzKodPokoju(losujKodPokoju()).ok, true);
      assert.equal(sprawdzKodRejestracji(losujKodRejestracji()).ok, true);
    }
    assert.equal(DLUGOSC_KODU_POKOJU, 4);
  });
});
