/** Reguły lobby: imiona graczy i moment zamknięcia zapisów. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  MAKS_DLUGOSC_IMIENIA,
  kluczImienia,
  moznaDolaczyc,
  powodOdmowy,
  sprawdzImie,
  znormalizujImie,
} from "../src/lib/lobby";

describe("Imiona graczy", () => {
  it("przyjmuje zwykłe imię", () => {
    const w = sprawdzImie("Kasia", []);
    assert.equal(w.ok, true);
    assert.equal(w.ok && w.imie, "Kasia");
  });

  it("ścina spacje z brzegów i nadmiarowe w środku", () => {
    const w = sprawdzImie("  Jan   Kowalski  ", []);
    assert.equal(w.ok && w.imie, "Jan Kowalski");
    assert.equal(znormalizujImie("a  b"), "a b");
  });

  it("nie pozwala na duplikat bez względu na wielkość liter", () => {
    const w = sprawdzImie("kasia", ["Kasia"]);
    assert.equal(w.ok, false);
    assert.match(w.ok === false ? w.powod : "", /zajęte/);
    // Spacje też nie robią z tego innego imienia.
    assert.equal(sprawdzImie(" Kasia ", ["Kasia"]).ok, false);
  });

  it("pilnuje długości z obu stron", () => {
    assert.equal(sprawdzImie("K", []).ok, false);
    assert.equal(sprawdzImie("x".repeat(MAKS_DLUGOSC_IMIENIA), []).ok, true);
    const zaDlugie = sprawdzImie("x".repeat(MAKS_DLUGOSC_IMIENIA + 1), []);
    assert.equal(zaDlugie.ok, false);
    assert.match(zaDlugie.ok === false ? zaDlugie.powod : "", /16 znak/);
  });

  it("odrzuca znaki sterujące", () => {
    assert.equal(sprawdzImie("Ka\u0007sia", []).ok, false);
  });

  it("polskie znaki nie kolidują ze sobą przypadkiem", () => {
    assert.equal(sprawdzImie("Łukasz", ["Lukasz"]).ok, true);
    assert.equal(kluczImienia("ŁUKASZ"), kluczImienia("łukasz"));
  });
});

describe("Zapisy do pokoju", () => {
  it("dołączyć można tylko przed zamknięciem", () => {
    assert.equal(moznaDolaczyc("lobby"), true);
    assert.equal(moznaDolaczyc("zamkniete"), false);
    assert.equal(moznaDolaczyc("rozdane"), false);
  });

  it("odmowa mówi, co się stało", () => {
    assert.match(powodOdmowy("rozdane"), /karty zostały rozdane/);
    assert.match(powodOdmowy("zamkniete"), /zamknął zapisy/);
  });
});
