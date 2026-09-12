/** Rozpoznanie wspólników na karcie: kto i kogo widzi. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { makeState } from "./helpers";
import { FRAKCJE_Z_ROZPOZNANIEM, wspolnicyDla } from "../src/lib/wspolnicy";
import { GameState } from "../src/lib/types";

/** Stół z rozpoznawalnym składem: dwóch bandytów, dwóch Indian, reszta miasto. */
const stol = (wlaczone: boolean): GameState => {
  const s = makeState(["herszt", "bandyta", "wodz", "indianin", "szeryf", "mieszczanin"]);
  s.settings.wspolnicyNaKarcie = wlaczone;
  return s;
};

describe("Wspólnicy na karcie", () => {
  it("wyłączone ustawienie nie zdradza nikogo", () => {
    const s = stol(false);
    for (const p of s.players) assert.deepEqual(wspolnicyDla(s, p.id), []);
  });

  it("bandyta widzi pozostałych bandytów, bez siebie", () => {
    const s = stol(true);
    const herszt = s.players[0];
    const lista = wspolnicyDla(s, herszt.id);
    assert.deepEqual(lista, [s.players[1].name]);
    assert.equal(lista.includes(herszt.name), false, "nie wymieniamy samego zainteresowanego");
  });

  it("Indianin widzi Indian, a nie bandytów", () => {
    const s = stol(true);
    assert.deepEqual(wspolnicyDla(s, s.players[2].id), [s.players[3].name]);
  });

  it("miasto nie rozpoznaje się nawzajem", () => {
    // Na tym stoi cała gra — miasto szuka po omacku.
    const s = stol(true);
    assert.deepEqual(wspolnicyDla(s, s.players[4].id), []);
    assert.deepEqual(wspolnicyDla(s, s.players[5].id), []);
  });

  it("nikt nie widzi nikogo spoza własnej frakcji", () => {
    const s = stol(true);
    for (const p of s.players) {
      const moi = new Set(wspolnicyDla(s, p.id));
      const mojaFrakcja = s.players.filter((x) => moi.has(x.name));
      for (const inny of mojaFrakcja) {
        assert.notEqual(inny.id, p.id);
      }
    }
  });

  it("gracz bez przydzielonej karty nie widzi nikogo", () => {
    const s = stol(true);
    s.players[0].roleId = null;
    assert.deepEqual(wspolnicyDla(s, s.players[0].id), []);
  });

  it("rozpoznanie dotyczy tylko wskazanych frakcji", () => {
    assert.deepEqual(FRAKCJE_Z_ROZPOZNANIEM, ["bandyci", "indianie"]);
  });
});
