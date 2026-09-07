/**
 * Całe partie rozgrywane losowo — sprawdzają, że reguły trzymają się kupy
 * także w kombinacjach, których nie da się wypisać z ręki: gra zawsze się
 * kończy, a stan nigdy nie wpada w układ niemożliwy wg zasad.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { emptyState, isActive, nightSteps, skipReason } from "../src/lib/engine";
import {
  firstIndex,
  resolveHanging,
  resolveSearch,
  resolveStep,
  startNight,
} from "../src/lib/resolve";
import { buildPool, janosikAllowed, shuffle, suggestedCounts } from "../src/lib/setup";
import { ROLE_BY_ID } from "../src/lib/roles";
import { FACTIONS, type GameState } from "../src/lib/types";

function newGame(n: number, withJanosik: boolean): GameState {
  const s = emptyState();
  const counts = suggestedCounts(n, withJanosik);
  const pool = shuffle(FACTIONS.flatMap((f) => buildPool(f, counts[f], [], true)));
  assert.equal(pool.length, n, `pula dla ${n} graczy`);
  s.players = pool.map((roleId, i) => ({
    id: `p${i}`,
    name: `G${i + 1}`,
    seat: i,
    roleId,
    alive: true,
  }));
  s.stage = "night";
  s.night = 0;
  s.stepIndex = firstIndex(s);
  return s;
}

/** Warunki, które muszą zachodzić w każdym momencie gry. */
function checkInvariants(s: GameState, gdzie: string) {
  if (s.idolHolder) {
    assert.ok(
      s.players.some((p) => p.id === s.idolHolder),
      `${gdzie}: posążek u kogoś spoza gry`
    );
  }
  for (const id of s.asleep) {
    assert.ok(
      s.players.some((p) => p.id === id),
      `${gdzie}: uśpiony gracz spoza gry`
    );
  }
  // Spitego czy zamkniętego wolno zabić, więc na liście uśpionych mogą zostać
  // nieboszczycy — istotne jest tylko to, że nikt martwy nie jest aktywny.
  for (const p of s.players) {
    if (!p.alive) assert.equal(isActive(s, p.id), false, `${gdzie}: martwy gracz jest aktywny`);
  }
  if (s.jailed) {
    assert.ok(s.asleep.includes(s.jailed), `${gdzie}: więzień powinien być nieaktywny`);
  }
  assert.ok(s.signals <= 3, `${gdzie}: więcej niż trzy sygnały`);
  if (s.winner) {
    assert.equal(s.stage, "koniec", `${gdzie}: zwycięstwo bez zakończenia gry`);
    assert.ok(s.winReason, `${gdzie}: zwycięstwo bez uzasadnienia`);
  }
  for (const p of s.players) {
    if (!p.alive) assert.ok(p.deathPhase, `${gdzie}: śmierć bez odnotowanej fazy`);
  }
}

/** Przechodzi całą noc, wybierając losowe, dozwolone cele. */
function playNight(s: GameState): GameState {
  let guard = 0;
  while (s.stage === "night" && !s.winner) {
    assert.ok(guard++ < 500, "noc nie chce się skończyć");
    const steps = nightSteps(s);
    const step = steps[s.stepIndex];
    assert.ok(step, `brak kroku o indeksie ${s.stepIndex}`);

    if (skipReason(s, step) && step.action !== "end-night") {
      s = { ...s, stepIndex: Math.min(s.stepIndex + 1, steps.length - 1) };
      continue;
    }
    const kandydaci = s.players.filter((p) => p.alive && p.id !== s.jailed);
    const cel = kandydaci[Math.floor(Math.random() * kandydaci.length)]?.id ?? null;
    s = resolveStep(s, step, {
      targetId: cel,
      yes: Math.random() < 0.5,
      memberId: null,
    }).state;
    checkInvariants(s, `noc ${s.night}, krok ${step.id}`);
  }
  return s;
}

function playDay(s: GameState): GameState {
  const alive = s.players.filter((p) => p.alive);
  if (alive.length > 2) {
    s = resolveSearch(
      s,
      shuffle(alive)
        .slice(0, s.settings.searchCount)
        .map((p) => p.id)
    );
    if (s.winner) return s;
    if (Math.random() < 0.5) s = resolveHanging(s, shuffle(alive)[0].id, false);
  }
  return s.winner ? s : startNight(s);
}

describe("Całe partie", () => {
  it("120 losowych gier kończy się rozstrzygnięciem albo wyczerpaniem rund, bez łamania zasad", () => {
    const wyniki: Record<string, number> = {};
    for (let g = 0; g < 120; g++) {
      const n = 12 + (g % 19);
      let s = newGame(n, g % 4 === 0 && janosikAllowed(n));
      checkInvariants(s, "start");

      let rundy = 0;
      while (!s.winner && rundy < 30) {
        s = playNight(s);
        if (s.winner) break;
        assert.equal(s.stage, "day", "po nocy powinien nastać dzień");
        checkInvariants(s, `poranek ${s.day}`);
        s = playDay(s);
        checkInvariants(s, `dzień ${s.day}`);
        rundy++;
      }
      const klucz = s.winner ?? "bez rozstrzygnięcia";
      wyniki[klucz] = (wyniki[klucz] ?? 0) + 1;
    }

    // Przy losowych decyzjach każda frakcja bywa zwycięska; wymagamy tylko, żeby
    // gry się kończyły, a rozstrzygnięcia nie były zawsze te same.
    assert.ok(Object.keys(wyniki).length > 1, `wszystkie gry kończą się tak samo: ${JSON.stringify(wyniki)}`);
    const bezWyniku = wyniki["bez rozstrzygnięcia"] ?? 0;
    assert.ok(bezWyniku < 60, `zbyt wiele gier bez rozstrzygnięcia: ${bezWyniku}/120`);
  });

  it("rozdanie pokrywa się z tabelą składów", () => {
    for (const n of [12, 16, 20, 24, 30]) {
      const s = newGame(n, false);
      const counts = suggestedCounts(n);
      for (const f of FACTIONS) {
        const ilu = s.players.filter((p) => ROLE_BY_ID[p.roleId!].faction === f).length;
        assert.equal(ilu, counts[f], `${n} graczy, frakcja ${f}`);
      }
    }
  });

  it("każdy gracz dostaje dokładnie jedną kartę", () => {
    const s = newGame(18, false);
    for (const p of s.players) {
      assert.ok(p.roleId, `${p.name} bez karty`);
      assert.ok(ROLE_BY_ID[p.roleId!], `${p.name} ma nieznaną kartę`);
    }
    const unikalne = s.players.filter((p) => !ROLE_BY_ID[p.roleId!].filler).map((p) => p.roleId);
    assert.equal(new Set(unikalne).size, unikalne.length, "karta niebędąca szeregową się powtarza");
  });
});
