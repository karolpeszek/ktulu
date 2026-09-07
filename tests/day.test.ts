/**
 * Zasady dnia: trucizna szamanki, pojedynki, przeszukanie i wieszanie.
 * Głosy w pojedynku liczą się „za” daną osobą — ginie ta, za którą padło mniej.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { idolAt, makeState } from "./helpers";
import {
  resolveDuel,
  resolveHanging,
  resolvePoison,
  resolveSearch,
  startNight,
} from "../src/lib/resolve";
import { DEFAULT_SETTINGS } from "../src/lib/engine";

const dzien = (roles: string[], idol?: number) =>
  makeState(roles, { stage: "day", day: 1, night: 1, idol });

describe("Trucizna szamanki", () => {
  it("otruty ginie następnego dnia", () => {
    const s = dzien(["szamanka", "szeryf", "herszt"]);
    s.poisoned = "p1";
    const po = resolvePoison(s);
    assert.equal(po.players[1].alive, false);
    assert.equal(po.poisoned, null, "trucizna działa tylko raz");
  });

  it("bez otrutego nic się nie dzieje", () => {
    const s = dzien(["szamanka", "szeryf", "herszt"]);
    const po = resolvePoison(s);
    assert.deepEqual(po.players.map((p) => p.alive), [true, true, true]);
  });

  it("rewizja zwłok otrutego z posążkiem daje zwycięstwo miastu", () => {
    const s = dzien(["szamanka", "szeryf", "herszt"], 1);
    s.poisoned = "p1";
    const po = resolvePoison(s);
    assert.equal(po.winner, "miasto");
  });
});

describe("Pojedynki", () => {
  const s = () => dzien(["szeryf", "herszt", "wodz", "mieszczanin"]);

  it("ginie ten, za którym padło mniej głosów", () => {
    const po = resolveDuel(s(), { aId: "p0", bId: "p1", votesA: 3, votesB: 1 });
    assert.equal(po.players[0].alive, true, "atakujący wygrywa");
    assert.equal(po.players[1].alive, false);
  });

  it("działa też w drugą stronę", () => {
    const po = resolveDuel(s(), { aId: "p0", bId: "p1", votesA: 1, votesB: 4 });
    assert.equal(po.players[0].alive, false);
    assert.equal(po.players[1].alive, true);
  });

  it("przy remisie giną obaj pojedynkujący", () => {
    const po = resolveDuel(s(), { aId: "p0", bId: "p1", votesA: 2, votesB: 2 });
    assert.equal(po.players[0].alive, false);
    assert.equal(po.players[1].alive, false);
  });

  it("gdy wszyscy się wstrzymają, nikt nie ginie", () => {
    const po = resolveDuel(s(), { aId: "p0", bId: "p1", votesA: 0, votesB: 0 });
    assert.equal(po.players[0].alive, true);
    assert.equal(po.players[1].alive, true);
  });

  it("rewolwerowiec wygrywa mimo przegranego głosowania", () => {
    const po = resolveDuel(s(), {
      aId: "p0",
      bId: "p1",
      votesA: 0,
      votesB: 5,
      override: "a",
      overrideNote: "rewolwerowiec",
    });
    assert.equal(po.players[0].alive, true);
    assert.equal(po.players[1].alive, false);
  });

  it("sędzia może ogłosić przegraną rewolwerowca — wskazuje jedną ofiarę", () => {
    const po = resolveDuel(s(), {
      aId: "p0",
      bId: "p1",
      votesA: 5,
      votesB: 0,
      override: "b",
      overrideNote: "wyrok sędziego",
    });
    assert.equal(po.players[0].alive, false, "sędzia jest silniejszy od głosowania");
    assert.equal(po.players[1].alive, true);
  });

  it("nadpisanie na remis uśmierca obu", () => {
    const po = resolveDuel(s(), { aId: "p0", bId: "p1", votesA: 3, votesB: 0, override: "remis" });
    assert.equal(po.players[0].alive, false);
    assert.equal(po.players[1].alive, false);
  });

  it("każdy pojedynek podbija dzienny licznik", () => {
    let po = resolveDuel(s(), { aId: "p0", bId: "p1", votesA: 1, votesB: 0 });
    assert.equal(po.duelsToday, 1);
    po = resolveDuel(po, { aId: "p2", bId: "p3", votesA: 0, votesB: 1 });
    assert.equal(po.duelsToday, 2);
    assert.equal(DEFAULT_SETTINGS.maxDuelsPerDay, 2, "Xięga ustala dwa pojedynki dziennie");
  });

  it("śmierć posiadacza posążka w pojedynku to zwycięstwo miasta", () => {
    const po = resolveDuel(dzien(["szeryf", "herszt", "wodz"], 1), {
      aId: "p0",
      bId: "p1",
      votesA: 3,
      votesB: 0,
    });
    assert.equal(po.winner, "miasto");
  });
});

describe("Przeszukanie", () => {
  it("znaleziony posążek kończy grę zwycięstwem miasta", () => {
    const po = resolveSearch(dzien(["szeryf", "herszt", "wodz"], 1), ["p1"]);
    assert.equal(po.winner, "miasto");
  });

  it("nieudane przeszukanie nie zmienia stanu graczy", () => {
    const po = resolveSearch(dzien(["szeryf", "herszt", "wodz"], 1), ["p0", "p2"]);
    assert.equal(po.winner, null);
    assert.deepEqual(po.players.map((p) => p.alive), [true, true, true]);
  });

  it("wystarczy, że posążek ma jedna z przeszukiwanych osób", () => {
    const po = resolveSearch(dzien(["szeryf", "herszt", "wodz"], 2), ["p0", "p2"]);
    assert.equal(po.winner, "miasto");
  });

  it("podrzucony przez cichą stopę liczy się jak właściciel", () => {
    const s = dzien(["cicha-stopa", "szeryf", "herszt"], 1);
    s.plantedIdolOn = "p1";
    const po = resolveSearch(s, ["p1"]);
    assert.equal(po.winner, "miasto", "miasto wygrywa mimo podrzutki");
  });

  it("liczba przeszukiwanych bierze się z ustawień rozgrywki", () => {
    assert.equal(DEFAULT_SETTINGS.searchCount, 2);
  });
});

describe("Wieszanie", () => {
  it("powieszony ginie", () => {
    const po = resolveHanging(dzien(["szeryf", "herszt", "wodz"]), "p1", false);
    assert.equal(po.players[1].alive, false);
  });

  it("miasto może nikogo nie powiesić", () => {
    const po = resolveHanging(dzien(["szeryf", "herszt", "wodz"]), null, false);
    assert.deepEqual(po.players.map((p) => p.alive), [true, true, true]);
  });

  it("burmistrz ułaskawia — nikt nie wisi w zamian", () => {
    const po = resolveHanging(dzien(["burmistrz", "herszt", "wodz"]), "p1", true);
    assert.deepEqual(po.players.map((p) => p.alive), [true, true, true]);
  });

  it("powieszenie posiadacza posążka daje zwycięstwo miastu", () => {
    const po = resolveHanging(dzien(["szeryf", "herszt", "wodz"], 1), "p1", false);
    assert.equal(po.winner, "miasto");
  });

  it("powieszenie Janosika kończy grę jego zwycięstwem", () => {
    const po = resolveHanging(dzien(["janosik", "szeryf", "herszt", "wodz"]), "p0", false);
    assert.equal(po.winner, "janosik");
  });

  it("ułaskawiony Janosik nie wygrywa", () => {
    const po = resolveHanging(dzien(["janosik", "szeryf", "herszt", "wodz"]), "p0", true);
    assert.equal(po.winner, null);
    assert.equal(po.players[0].alive, true);
  });

  it("Janosik z posążkiem wygrywa sam — szubienica jest silniejsza od rewizji", () => {
    const po = resolveHanging(dzien(["janosik", "szeryf", "herszt", "wodz"], 0), "p0", false);
    assert.equal(po.winner, "janosik");
  });
});

describe("Dzień przechodzi w noc", () => {
  it("numer nocy idzie za numerem dnia, a posążek zostaje na miejscu", () => {
    const s = dzien(["szeryf", "herszt", "wodz"], 1);
    s.day = 2;
    const noc = startNight(s);
    assert.equal(noc.stage, "night");
    assert.equal(noc.night, 2);
    assert.equal(idolAt(noc), 1);
    assert.equal(noc.idolAtNightStart, "p1");
  });
});
