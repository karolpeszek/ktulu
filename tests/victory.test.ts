/**
 * Warunki zwycięstwa każdej frakcji — wraz z sytuacjami, w których zwycięstwo
 * właśnie NIE następuje.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { makeState, run, skipOf } from "./helpers";
import { checkIndiansWin, setWinner } from "../src/lib/engine";
import {
  endNight,
  resolveDuel,
  resolveHanging,
  resolvePoison,
  resolveSearch,
} from "../src/lib/resolve";

describe("Miasto", () => {
  it("wygrywa, gdy posążek zostanie odkryty przy przeszukaniu", () => {
    const s = makeState(["szeryf", "herszt", "wodz"], { stage: "day", idol: 1 });
    assert.equal(resolveSearch(s, ["p1"]).winner, "miasto");
  });

  it("wygrywa, gdy szeryf dotrwa z posążkiem do końca nocy", () => {
    const s = run(makeState(["szeryf", "herszt", "wodz"], { idol: 1 }), "sheriff", {
      targetId: "p1",
    });
    endNight(s);
    assert.equal(s.winner, "miasto");
  });

  it("nie wygrywa, gdy szeryf zdobył posążek, ale zginął przed świtem", () => {
    const s = run(makeState(["szeryf", "herszt", "wodz", "zielona-macka"], { idol: 1 }), "sheriff", {
      targetId: "p1",
    });
    s.players[0].alive = false;
    endNight(s);
    assert.notEqual(s.winner, "miasto");
  });

  it("wygrywa, gdy posiadacz posążka zginie za dnia — niezależnie od tego, kto zabił", () => {
    const s = makeState(["wodz", "herszt", "szeryf"], { stage: "day", idol: 1 });
    assert.equal(resolveHanging(s, "p1", false).winner, "miasto");
  });

  it("wygrywa nawet wtedy, gdy wszyscy miastowi są martwi", () => {
    const s = makeState(["szeryf", "herszt", "wodz"], { stage: "day", idol: 1 });
    s.players[0].alive = false;
    assert.equal(resolveSearch(s, ["p1"]).winner, "miasto");
  });

  it("wygrywa, gdy hazardzista zabije posiadacza posążka", () => {
    const s = run(
      makeState(["hazardzista", "herszt", "wodz"], { night: 2, idol: 1 }),
      "gambler",
      { yes: true, targetId: "p1" }
    );
    assert.equal(s.winner, "miasto");
  });

  it("wygrywa, gdy szamanka otruje ostatniego nie-Indianina z posążkiem", () => {
    const s = makeState(["szamanka", "wodz", "herszt"], { stage: "day", idol: 2 });
    s.poisoned = "p2";
    // p2 to jedyny żywy nie-Indianin i ma posążek — kara dla Indian za głupotę.
    assert.equal(resolvePoison(s).winner, "miasto");
  });
});

describe("Bandyci", () => {
  const gotowyDoOdplyniecia = () =>
    makeState(["herszt", "bandyta", "szeryf", "wodz"], { idol: 0, night: 3 });

  it("wygrywają, gdy odpłyną o poranku z posążkiem", () => {
    const s = run(gotowyDoOdplyniecia(), "bandits-sail", { yes: true });
    assert.equal(s.sailDeclared, true);
    endNight(s);
    assert.equal(s.winner, "bandyci");
  });

  it("nie wygrywają, gdy stracą posążek przed świtem", () => {
    let s = run(gotowyDoOdplyniecia(), "bandits-sail", { yes: true });
    // Indianie zabijają herszta i przejmują posążek jeszcze tej nocy.
    s = run(s, "indians-kill", { targetId: "p0" });
    endNight(s);
    assert.notEqual(s.winner, "bandyci");
  });

  it("nie odpłyną przed nocą ustaloną przez Manitou", () => {
    const s = makeState(["herszt", "szeryf", "wodz"], { idol: 0, night: 2 });
    assert.match(skipOf(s, "bandits-sail") ?? "", /Statek jest gotowy dopiero/);
  });

  it("bez deklaracji odpłynięcia świt niczego nie kończy", () => {
    const s = gotowyDoOdplyniecia();
    endNight(s);
    assert.equal(s.winner, null);
  });
});

describe("Indianie", () => {
  it("wygrywają, gdy przy życiu zostaną sami", () => {
    const s = makeState(["wodz", "szaman", "szeryf"]);
    s.players[2].alive = false;
    checkIndiansWin(s);
    assert.equal(s.winner, "indianie");
  });

  it("nie wygrywają, dopóki żyje ktokolwiek spoza plemienia", () => {
    const s = makeState(["wodz", "szaman", "szeryf"]);
    checkIndiansWin(s);
    assert.equal(s.winner, null);
  });

  it("muszą zabić także Janosika — to osobna frakcja", () => {
    const s = makeState(["wodz", "szaman", "janosik", "szeryf"]);
    s.players[3].alive = false;
    checkIndiansWin(s);
    assert.equal(s.winner, null, "żywy Janosik blokuje zwycięstwo Indian");
    s.players[2].alive = false;
    checkIndiansWin(s);
    assert.equal(s.winner, "indianie");
  });

  it("zwycięstwo przychodzi samo po nocnym zabójstwie", () => {
    const s = run(makeState(["wodz", "szeryf"]), "indians-kill", { targetId: "p1" });
    assert.equal(s.winner, "indianie");
  });
});

describe("Ufoki", () => {
  it("wygrywają po trzecim sygnale", () => {
    const s = makeState(["wielki-ufol", "szeryf", "herszt", "wodz"], { idol: 0 });
    s.signals = 2;
    const po = run(s, "ufo-signal");
    assert.equal(po.signals, 3);
    assert.equal(po.winner, "ufoki");
  });

  it("dwa sygnały nie wystarczą", () => {
    const s = makeState(["wielki-ufol", "szeryf", "herszt", "wodz"], { idol: 0 });
    s.signals = 1;
    const po = run(s, "ufo-signal");
    assert.equal(po.signals, 2);
    assert.equal(po.winner, null);
  });

  it("nieudany sygnał nie podbija licznika", () => {
    const s = makeState(["wielki-ufol", "szeryf", "herszt", "wodz"], { idol: 1 });
    s.signals = 2;
    const po = run(s, "ufo-signal");
    assert.equal(po.signals, 2);
    assert.equal(po.winner, null);
  });
});

describe("Janosik", () => {
  it("wygrywa wyłącznie przez powieszenie", () => {
    const s = makeState(["janosik", "szeryf", "herszt", "wodz"], { stage: "day" });
    assert.equal(resolveHanging(s, "p0", false).winner, "janosik");
  });

  it("śmierć w nocy nie daje mu zwycięstwa", () => {
    const s = run(makeState(["janosik", "wodz", "szeryf", "herszt"]), "indians-kill", {
      targetId: "p0",
    });
    assert.equal(s.players[0].alive, false);
    assert.notEqual(s.winner, "janosik");
  });

  it("śmierć w pojedynku też nie", () => {
    const s = makeState(["janosik", "szeryf", "herszt", "wodz"], { stage: "day" });
    const po = resolveDuel(s, { aId: "p0", bId: "p1", votesA: 0, votesB: 3 });
    assert.equal(po.players[0].alive, false);
    assert.notEqual(po.winner, "janosik");
  });
});

describe("Rozstrzygnięcie jest jedno", () => {
  it("wygrać może tylko jedna frakcja — pierwsze rozstrzygnięcie zostaje", () => {
    const s = makeState(["szeryf", "herszt", "wodz"]);
    setWinner(s, "miasto", "pierwsze");
    setWinner(s, "bandyci", "drugie");
    assert.equal(s.winner, "miasto");
    assert.match(s.winReason ?? "", /pierwsze/);
  });

  it("zwycięstwo kończy grę", () => {
    const s = makeState(["szeryf", "herszt", "wodz"]);
    setWinner(s, "ufoki", "sygnał");
    assert.equal(s.stage, "koniec");
  });

  it("koniec gry trafia do dziennika jako fakt jawny", () => {
    const s = makeState(["szeryf", "herszt", "wodz"]);
    setWinner(s, "indianie", "wybili wszystkich");
    const wpis = s.events.find((e) => /KONIEC GRY/.test(e.text));
    assert.ok(wpis, "brak wpisu o końcu gry");
    assert.equal(wpis!.secret, false);
  });
});
