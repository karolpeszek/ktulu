/** Dane pokazowe: skład musi być prawdziwy, a poległy nie może być zmyślony. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { generatorZiarna, wylosujDemo } from "../src/lib/demo";
import { ROLE_BY_ID } from "../src/lib/roles";

/** Deterministyczne „losowanie” — test sprawdza niezmienniki, nie przypadek. */
const ustalone = (wartosci: number[]) => {
  let i = 0;
  return () => wartosci[i++ % wartosci.length];
};

describe("Demo ekranu gracza", () => {
  it("każda karta w składzie naprawdę istnieje", () => {
    for (let i = 0; i < 50; i++) {
      const d = wylosujDemo();
      for (const rola of d.sklad) assert.ok(ROLE_BY_ID[rola], `nieznana karta ${rola}`);
      assert.ok(ROLE_BY_ID[d.mojaRola], "własna karta musi istnieć");
    }
  });

  it("własna karta należy do składu rozgrywki", () => {
    for (let i = 0; i < 50; i++) {
      const d = wylosujDemo();
      assert.ok(d.sklad.includes(d.mojaRola));
    }
  });

  it("polegli mają karty ze składu i różne imiona", () => {
    for (let i = 0; i < 50; i++) {
      const d = wylosujDemo();
      const imiona = new Set<string>();
      for (const u of d.ujawnieni) {
        assert.ok(ROLE_BY_ID[u.rola], `nieznana karta ${u.rola}`);
        assert.ok(u.imie.length > 0);
        assert.equal(imiona.has(u.imie), false, "to samo imię dwa razy");
        imiona.add(u.imie);
      }
    }
  });

  it("oglądający nigdy nie jest wśród poległych", () => {
    // Inaczej demo pokazywałoby własną kartę jako odkrytą, co nie ma sensu.
    for (let i = 0; i < 50; i++) {
      const d = wylosujDemo();
      assert.equal(d.ujawnieni.some((u) => u.imie === d.mojeImie), false);
    }
  });

  it("nie polegli wszyscy — demo pokazuje grę w toku", () => {
    for (let i = 0; i < 50; i++) {
      const d = wylosujDemo();
      assert.ok(d.ujawnieni.length < d.sklad.length);
    }
  });

  it("skład ma tylu graczy, ilu przewiduje tabela", () => {
    const d = wylosujDemo(ustalone([0]));
    assert.equal(d.sklad.length, 12, "najmniejszy stół z tabeli Xięgi");
    const duzy = wylosujDemo(ustalone([0.999]));
    assert.equal(duzy.sklad.length, 18);
  });

  it("wspólnicy, jeśli są, należą do tej samej frakcji i nie obejmują mnie", () => {
    for (let i = 0; i < 100; i++) {
      const d = wylosujDemo();
      if (d.wspolnicy.length === 0) continue;
      assert.equal(d.wspolnicy.includes(d.mojeImie), false, "własne imię wśród wspólników");
      assert.equal(new Set(d.wspolnicy).size, d.wspolnicy.length, "powtórzone imię");
      const moja = ROLE_BY_ID[d.mojaRola].faction;
      assert.notEqual(moja, "miasto", "miasto nigdy nie poznaje swoich");
    }
  });

  it("czasem pokazuje wspólników, a czasem nie", () => {
    // Pokaz ma ilustrować oba warianty zasady domowej, nie jeden z nich.
    const wyniki = Array.from({ length: 80 }, () => wylosujDemo().wspolnicy.length > 0);
    assert.ok(wyniki.some(Boolean), "nigdy nie pokazał wspólników");
    assert.ok(wyniki.some((x) => !x), "zawsze pokazywał wspólników");
  });

  it("to samo ziarno daje to samo rozdanie", () => {
    // Dzięki temu ekran pokazu nie miga innym składem przy byle przerysowaniu.
    const a = wylosujDemo(generatorZiarna(0.42));
    const b = wylosujDemo(generatorZiarna(0.42));
    assert.deepEqual(a, b);
  });

  it("inne ziarno daje inne rozdanie", () => {
    const a = wylosujDemo(generatorZiarna(0.1));
    const b = wylosujDemo(generatorZiarna(0.9));
    assert.notDeepEqual(a, b);
  });

  it("kolejne losowania dają różne rozdania", () => {
    // Odświeżenie ma pokazywać coś nowego, inaczej demo niczego nie ilustruje.
    const wyniki = new Set(Array.from({ length: 20 }, () => wylosujDemo().mojaRola + wylosujDemo().mojeImie));
    assert.ok(wyniki.size > 1, "wszystkie losowania wyszły identyczne");
  });
});
