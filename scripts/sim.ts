/**
 * Symulacja rozgrywki bez UI — sanity check silnika.
 * Uruchomienie: npx tsx scripts/sim.ts
 */
import { emptyState, nightSteps, skipReason, livingWithRole } from "../src/lib/engine";
import { resolveStep, firstIndex, resolveSearch, resolveHanging, startNight } from "../src/lib/resolve";
import { buildPool, suggestedCounts } from "../src/lib/setup";
import { FACTIONS, GameState } from "../src/lib/types";

function makeGame(n: number): GameState {
  const s = emptyState();
  const counts = suggestedCounts(n);
  const pool = FACTIONS.flatMap((f) => buildPool(f, counts[f], [], true));
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
  let s = makeGame(n);
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
