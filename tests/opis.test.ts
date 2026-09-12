/** Opis zmiany, który główny prowadzący czyta przed zatwierdzeniem. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { makeState } from "./helpers";
import { opisZmiany } from "../src/lib/opis";
import { log } from "../src/lib/engine";
import { GameState } from "../src/lib/types";

const kopia = (s: GameState): GameState => structuredClone(s);

describe("Opis zmiany dla zatwierdzającego", () => {
  it("bierze nowe wpisy z dziennika, w kolejności chronologicznej", () => {
    const przed = makeState(["szeryf", "herszt", "wodz"], { stage: "night", night: 1 });
    const po = kopia(przed);
    log(po, "Pierwsze zdarzenie", false);
    log(po, "Drugie zdarzenie", false);

    // Dziennik trzyma najnowsze na początku, a czytać ma się od najstarszego.
    assert.deepEqual(opisZmiany(przed, po), ["Pierwsze zdarzenie", "Drugie zdarzenie"]);
  });

  it("pomija wpisy, które już były", () => {
    const przed = makeState(["szeryf", "herszt", "wodz"], { stage: "night", night: 1 });
    log(przed, "Stare zdarzenie", false);
    const po = kopia(przed);
    log(po, "Nowe zdarzenie", false);
    assert.deepEqual(opisZmiany(przed, po), ["Nowe zdarzenie"]);
  });

  it("gdy dziennik milczy, opisuje śmierć po imieniu", () => {
    const przed = makeState(["szeryf", "herszt", "wodz"], { stage: "day", day: 1 });
    const po = kopia(przed);
    po.players[1].alive = false;
    po.players[1].deathNote = "powieszony";
    const opis = opisZmiany(przed, po);
    assert.equal(opis.length, 1);
    assert.match(opis[0], /Śmierć: /);
    assert.match(opis[0], /powieszony/);
  });

  it("opisuje zmianę fazy i numeru nocy", () => {
    const przed = makeState(["szeryf", "herszt", "wodz"], { stage: "day", day: 1, night: 1 });
    const po = kopia(przed);
    po.stage = "night";
    po.night = 2;
    const opis = opisZmiany(przed, po).join(" ");
    assert.match(opis, /noc/i);
    assert.match(opis, /Noc 2/);
  });

  it("nigdy nie zwraca pustej listy", () => {
    // Zatwierdzający nie może stanąć przed pytaniem bez treści.
    const przed = makeState(["szeryf", "herszt", "wodz"]);
    const po = kopia(przed);
    const opis = opisZmiany(przed, po);
    assert.ok(opis.length > 0);
    assert.match(opis[0], /bez wpisu w dzienniku/);
  });
});
