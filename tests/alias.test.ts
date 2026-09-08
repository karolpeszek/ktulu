/** Alias adresu podglądu: Cloudflare przyjmuje wąski zestaw znaków. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { aliasZGalezi } from "../scripts/alias-podgladu.mjs";

describe("Alias adresu podglądu", () => {
  it("zamienia ukośnik na myślnik", () => {
    // To była przyczyna braku adresu: `feat/lobby` jest odrzucane wprost.
    assert.equal(aliasZGalezi("feat/lobby"), "feat-lobby");
  });

  it("sprowadza do małych liter", () => {
    assert.equal(aliasZGalezi("Feat/Lobby"), "feat-lobby");
  });

  it("zwija powtórzone i obcina brzegowe myślniki", () => {
    assert.equal(aliasZGalezi("feat//lobby--x"), "feat-lobby-x");
    assert.equal(aliasZGalezi("/feat/"), "feat");
  });

  it("wyrzuca znaki spoza alfabetu", () => {
    assert.equal(aliasZGalezi("feat/łobuz_42"), "feat-obuz-42");
  });

  it("wymusza literę na początku", () => {
    assert.equal(aliasZGalezi("2-poprawki"), "g-2-poprawki");
  });

  it("mieści się razem z nazwą Workera w limicie hosta", () => {
    const alias = aliasZGalezi("x".repeat(200));
    assert.ok(alias.length <= 63 - "ktulu".length - 1, `za długi: ${alias.length}`);
    assert.ok(!alias.endsWith("-"), "obcięcie nie może zostawić myślnika na końcu");
  });

  it("nigdy nie zwraca pustej nazwy", () => {
    assert.equal(aliasZGalezi(""), "podglad");
    assert.equal(aliasZGalezi("///"), "podglad");
    assert.equal(aliasZGalezi(undefined), "podglad");
  });

  it("wynik zawsze pasuje do wymagań Cloudflare", () => {
    for (const g of ["feat/lobby", "MAIN", "9", "a/b/c", "___", "Zażółć/gęślą"]) {
      assert.match(aliasZGalezi(g), /^[a-z][a-z0-9-]*$/, `zły alias dla ${g}`);
    }
  });
});
