/**
 * Symulacja rozgrywki bez UI — sanity check silnika.
 * Uruchomienie: npx tsx scripts/sim.ts
 */
import { checkIndiansWin, emptyState, nightSteps, skipReason, livingWithRole } from "../src/lib/engine";
import { ROLE_BY_ID } from "../src/lib/roles";
import { resolveStep, firstIndex, resolveSearch, resolveHanging, startNight } from "../src/lib/resolve";
import {
  JANOSIK_MIN_PLAYERS,
  buildPool,
  janosikAllowed,
  shuffle,
  suggestedCounts,
} from "../src/lib/setup";
import { FACTIONS, GameState } from "../src/lib/types";

function makeGame(n: number, withJanosik = false): GameState {
  const s = emptyState();
  const counts = suggestedCounts(n, withJanosik);
  // Tasowanie jak przy prawdziwym rozdaniu — inaczej karty leżą blokami frakcji
  // i heurystyki symulacji (np. wieszanie ostatniego żywego) trafiają zawsze w to samo.
  const pool = shuffle(FACTIONS.flatMap((f) => buildPool(f, counts[f], [], true)));
  if (pool.length !== n) throw new Error(`pula ${pool.length} != ${n}`);
  s.players = Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `Gracz${i + 1}`,
    seat: i,
    roleId: pool[i],
    alive: true,
  }));
  s.stage = "night";
  s.night = 0;
  s.stepIndex = firstIndex(s);
  return s;
}

/** Przechodzi całą noc, wybierając pierwszy dozwolony cel. */
function runNight(s: GameState, verbose = false): GameState {
  let guard = 0;
  while (s.stage === "night" && !s.winner) {
    if (guard++ > 400) throw new Error("pętla nocy nie kończy się");
    const steps = nightSteps(s);
    const step = steps[s.stepIndex];
    if (!step) throw new Error("brak kroku " + s.stepIndex);
    const reason = skipReason(s, step);
    if (reason && step.action !== "end-night") {
      const next = structuredClone(s);
      next.stepIndex = Math.min(next.stepIndex + 1, steps.length - 1);
      s = next;
      continue;
    }
    const alive = s.players.filter((p) => p.alive && p.id !== s.jailed);
    const target = alive[Math.floor(Math.random() * alive.length)]?.id ?? null;
    if (verbose) console.log(`  [${step.faction}] ${step.title}`);
    const out = resolveStep(s, step, {
      targetId: target,
      yes: Math.random() < 0.5,
      memberId: null,
    });
    s = out.state;
    if (s.feedback.length && verbose) console.log("    →", s.feedback.filter(Boolean).join(" | "));
  }
  return s;
}

function runDay(s: GameState): GameState {
  const alive = s.players.filter((p) => p.alive);
  if (alive.length > 2) {
    s = resolveSearch(s, alive.slice(0, s.settings.searchCount).map((p) => p.id));
    if (s.winner) return s;
    s = resolveHanging(s, alive[alive.length - 1].id, false);
  }
  if (s.winner) return s;
  return startNight(s);
}

const stats: Record<string, number> = {};
for (let g = 0; g < 200; g++) {
  const n = 12 + (g % 19);
  // Co czwarta gra z Janosikiem, o ile liczba graczy na to pozwala.
  let s = makeGame(n, g % 4 === 0 && janosikAllowed(n));
  let rounds = 0;
  while (!s.winner && rounds < 25) {
    s = runNight(s, false);
    if (s.winner) break;
    if (s.stage !== "day") throw new Error("po nocy powinien być dzień, jest " + s.stage);
    s = runDay(s);
    rounds++;
  }
  const key = s.winner ?? "brak rozstrzygnięcia";
  stats[key] = (stats[key] ?? 0) + 1;
  if (rounds >= 25 && !s.winner) stats["limit rund"] = (stats["limit rund"] ?? 0) + 1;
}

console.log("200 symulowanych gier (losowe decyzje):");
console.table(stats);

// — testy szczegółowe —
const t = makeGame(14);
const sheriff = livingWithRole(t, "szeryf");
console.log("szeryf w grze:", !!sheriff);
const steps0 = nightSteps(t).map((x) => x.title);
console.log("kroki nocy zerowej:", steps0.join(" → "));

const t2 = makeGame(20);
t2.night = 2;
const steps2 = nightSteps(t2).map((x) => x.title);
console.log("\nkroki nocy 2 (20 graczy):\n " + steps2.join("\n "));

// — kontrola tabeli Xięgi: każda liczba graczy ma spójną konfigurację —
import { TABLE, recommendationFor } from "../src/lib/setup";
for (const [n, row] of Object.entries(TABLE)) {
  const sum = row.reduce((a, b) => a + b, 0);
  if (sum !== Number(n)) throw new Error(`tabela: ${n} graczy sumuje się do ${sum}`);
}
console.log("\ntabela Xięgi: wszystkie wiersze sumują się poprawnie");
for (const n of [12, 16, 17, 20, 24, 30]) {
  const r = recommendationFor(n);
  console.log(
    `${n} graczy → miasto ${r.counts.miasto}, bandyci ${r.counts.bandyci}, indianie ${r.counts.indianie}, ufoki ${r.counts.ufoki || "—"} | przeszukania ${r.searchCount} | statek noc ${r.shipNight}`
  );
}

// — Janosik jako osobna frakcja —
console.log("\nJanosik:");
if (janosikAllowed(JANOSIK_MIN_PLAYERS - 1)) throw new Error("Janosik nie powinien być dozwolony poniżej progu");
for (const n of [12, 13, 14, 18, 21]) {
  const withJ = suggestedCounts(n, true);
  const plain = suggestedCounts(n, false);
  const total = withJ.miasto + withJ.bandyci + withJ.indianie + withJ.ufoki + withJ.janosik;
  if (total !== n) throw new Error(`skład z Janosikiem dla ${n} graczy sumuje się do ${total}`);
  if (janosikAllowed(n)) {
    const base = suggestedCounts(n - 1, false);
    const sameAsRowBelow =
      withJ.miasto === base.miasto &&
      withJ.bandyci === base.bandyci &&
      withJ.indianie === base.indianie &&
      withJ.ufoki === base.ufoki;
    if (!sameAsRowBelow) throw new Error(`skład dla ${n} z Janosikiem nie odpowiada wierszowi ${n - 1}`);
  } else if (withJ.janosik !== 0) {
    throw new Error(`Janosik dopuszczony przy ${n} graczach`);
  }
  console.log(
    `${n} graczy → ${withJ.janosik ? "z Janosikiem" : "bez Janosika (poniżej progu)"}: miasto ${withJ.miasto}, bandyci ${withJ.bandyci}, indianie ${withJ.indianie}, ufoki ${withJ.ufoki || "—"}, janosik ${withJ.janosik} (bez dodatku: miasto ${plain.miasto})`
  );
}

// Powieszenie Janosika kończy grę jego zwycięstwem.
const tj = makeGame(13, true);
const jan = tj.players.find((p) => p.roleId === "janosik");
if (!jan) throw new Error("Janosik nie trafił do rozdania mimo włączenia");
const hung = resolveHanging(tj, jan.id, false);
if (hung.winner !== "janosik") throw new Error("powieszenie Janosika nie kończy gry jego zwycięstwem");
console.log("powieszenie Janosika → zwycięzca:", hung.winner);

// Dopóki Janosik żyje, Indianie nie mogą wygrać.
const ti = makeGame(13, true);
for (const p of ti.players) if (p.roleId !== "janosik" && ROLE_BY_ID[p.roleId!].faction !== "indianie") p.alive = false;
checkIndiansWin(ti);
if (ti.winner) throw new Error("Indianie wygrali mimo żywego Janosika");
const janAlive = ti.players.find((p) => p.roleId === "janosik")!;
janAlive.alive = false;
checkIndiansWin(ti);
if (ti.winner !== "indianie") throw new Error("Indianie nie wygrali po śmierci Janosika");
console.log("Indianie wygrywają dopiero po zabiciu Janosika — OK");
