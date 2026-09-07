/**
 * Wspólne rusztowanie testów zasad. Buduje stan gry z listy kart, żeby każdy
 * test opisywał wyłącznie regułę, którą sprawdza.
 */
import { emptyState, nightSteps, skipReason, type NightStep } from "../src/lib/engine";
import { firstIndex, resolveStep, type StepPayload } from "../src/lib/resolve";
import type { GameState, Player } from "../src/lib/types";

export interface MakeOptions {
  night?: number;
  day?: number;
  stage?: GameState["stage"];
  /** Indeks gracza trzymającego posążek. */
  idol?: number;
}

/** Stan gry z graczami o podanych kartach; imiona to G1, G2, … */
export function makeState(roleIds: string[], opts: MakeOptions = {}): GameState {
  const s = emptyState();
  s.players = roleIds.map(
    (roleId, i): Player => ({
      id: `p${i}`,
      name: `G${i + 1}`,
      seat: i,
      roleId,
      alive: true,
    })
  );
  s.stage = opts.stage ?? "night";
  s.night = opts.night ?? 1;
  s.day = opts.day ?? 0;
  if (opts.idol !== undefined) s.idolHolder = `p${opts.idol}`;
  s.stepIndex = firstIndex(s);
  return s;
}

/** Krok nocy o podanym identyfikatorze — rzuca, gdy go nie ma w tej nocy. */
export function step(s: GameState, id: string): NightStep {
  const found = nightSteps(s).find((x) => x.id === id);
  if (!found) {
    throw new Error(
      `Brak kroku „${id}” w nocy ${s.night}. Dostępne: ${nightSteps(s)
        .map((x) => x.id)
        .join(", ")}`
    );
  }
  return found;
}

/** Wykonuje krok nocy i zwraca nowy stan. */
export function run(s: GameState, id: string, payload: StepPayload = {}): GameState {
  return resolveStep(s, step(s, id), payload).state;
}

/** Powód pominięcia kroku albo null, gdy krok jest wykonalny. */
export function skipOf(s: GameState, id: string): string | null {
  return skipReason(s, step(s, id));
}

/** Identyfikatory kroków tej nocy w kolejności wywoływania. */
export function stepIds(s: GameState): string[] {
  return nightSteps(s).map((x) => x.id);
}

export const idx = (n: number) => `p${n}`;

export function alive(s: GameState, i: number): boolean {
  return s.players[i].alive;
}

/** Kto trzyma posążek, jako indeks gracza (albo null). */
export function idolAt(s: GameState): number | null {
  if (!s.idolHolder) return null;
  return s.players.findIndex((p) => p.id === s.idolHolder);
}
