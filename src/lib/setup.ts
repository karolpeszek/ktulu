import { Faction } from "./types";
import { ROLES } from "./roles";
import type { Role } from "./types";

export type FactionCounts = Record<Faction, number>;

/** Tabela „Proponowana liczebność i składy frakcji" z Xięgi. */
const TABLE: Record<number, [number, number, number, number]> = {
  12: [5, 4, 3, 0],
  13: [6, 4, 3, 0],
  14: [6, 4, 4, 0],
  15: [7, 4, 4, 0],
  16: [7, 5, 4, 0],
  17: [7, 5, 5, 0],
  18: [6, 4, 5, 3],
  19: [7, 4, 5, 3],
  20: [8, 4, 5, 3],
  21: [8, 4, 6, 3],
  22: [9, 4, 6, 3],
  23: [9, 4, 6, 4],
  24: [10, 4, 6, 4],
  25: [10, 5, 6, 4],
  26: [11, 5, 6, 4],
  27: [11, 5, 7, 4],
  28: [12, 5, 7, 4],
  29: [12, 6, 7, 4],
  30: [13, 6, 7, 4],
};

export function suggestedCounts(playerCount: number): FactionCounts {
  const row = TABLE[playerCount];
  if (row) {
    return { miasto: row[0], bandyci: row[1], indianie: row[2], ufoki: row[3] };
  }
  // Poza tabelą: proporcje ~ 45% / 22% / 25% / 8%, minimum 1 na frakcję poniżej 12 graczy.
  if (playerCount < 12) {
    const bandyci = Math.max(1, Math.round(playerCount * 0.28));
    const indianie = Math.max(1, Math.round(playerCount * 0.24));
    return { miasto: Math.max(1, playerCount - bandyci - indianie), bandyci, indianie, ufoki: 0 };
  }
  const ufoki = Math.max(4, Math.round(playerCount * 0.14));
  const bandyci = Math.max(6, Math.round(playerCount * 0.2));
  const indianie = Math.max(7, Math.round(playerCount * 0.24));
  return { miasto: playerCount - ufoki - bandyci - indianie, bandyci, indianie, ufoki };
}

export function totalOf(c: FactionCounts): number {
  return c.miasto + c.bandyci + c.indianie + c.ufoki;
}

/** Kolejność, w jakiej role są dobierane, gdy Manitou nie wskaże ich ręcznie. */
const PRIORITY: Record<string, number> = {
  kluczowa: 0,
  tradycyjna: 1,
  zwykla: 2,
  kontrowersyjna: 3,
  szeregowy: 9,
};

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Buduje pulę kart dla frakcji: najpierw role wybrane ręcznie, potem — jeśli
 * brakuje — role wg priorytetu Xięgi, a resztę wypełniają szeregowi członkowie.
 */
export function buildPool(faction: Faction, size: number, picked: string[], autofill: boolean): string[] {
  const pool: string[] = picked.filter((id) => ROLES.some((r) => r.id === id)).slice(0, size);
  if (autofill) {
    const candidates = ROLES.filter(
      (r) => r.faction === faction && !r.filler && !pool.includes(r.id)
    ).sort((a: Role, b: Role) => PRIORITY[a.tier] - PRIORITY[b.tier]);
    for (const r of candidates) {
      if (pool.length >= size) break;
      pool.push(r.id);
    }
  }
  const filler = ROLES.find((r) => r.faction === faction && r.filler)!;
  while (pool.length < size) pool.push(filler.id);
  return pool.slice(0, size);
}
