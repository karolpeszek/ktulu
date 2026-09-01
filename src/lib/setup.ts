import { Faction, GameState } from "./types";
import { ROLES } from "./roles";
import type { Role } from "./types";

export type FactionCounts = Record<Faction, number>;

/** Tabela „Proponowana liczebność i składy frakcji” z Xięgi. */
export const TABLE: Record<number, [number, number, number, number]> = {
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

/**
 * Janosik jest osobną, jednoosobową frakcją i dodatkiem domowym — wolno go
 * dołączyć dopiero wtedy, gdy po odjęciu jego karty zostaje co najmniej tyle
 * osób, ile obejmuje najmniejszy wiersz tabeli Xięgi.
 */
export const JANOSIK_MIN_PLAYERS = 13;

export function janosikAllowed(playerCount: number): boolean {
  return playerCount >= JANOSIK_MIN_PLAYERS;
}

/** Podział wg tabeli Xięgi — bez Janosika. */
function bookSplit(playerCount: number): Omit<FactionCounts, "janosik"> {
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

/**
 * Skład frakcji dla podanej liczby graczy. Gdy gra Janosik, jego karta jest
 * odliczana od stołu, a pozostali gracze dzielą się wg wiersza tabeli dla
 * liczby o jeden mniejszej.
 */
export function suggestedCounts(playerCount: number, withJanosik = false): FactionCounts {
  const janosik = withJanosik && janosikAllowed(playerCount) ? 1 : 0;
  return { ...bookSplit(playerCount - janosik), janosik };
}

export const TABLE_MIN = 12;
export const TABLE_MAX = 30;
/** Xięga nie poleca gry w większą liczbę osób. */
export const RECOMMENDED_MAX = 20;

export function inTable(playerCount: number): boolean {
  return !!TABLE[playerCount];
}

/**
 * Pozostałe ustawienia, które Xięga uzależnia od liczby graczy:
 * — przeszukiwanych: dwie osoby do szesnastu graczy, trzy przy większej liczbie;
 * — statek bandytów: trzecia noc (czwarty poranek), a powyżej 16 graczy piąty poranek.
 */
export function recommendedSettings(playerCount: number): { searchCount: number; shipNight: number } {
  return {
    searchCount: playerCount > 16 ? 3 : 2,
    shipNight: playerCount > 16 ? 4 : 3,
  };
}

/** Podpowiedź Xięgi w całości: skład frakcji + ustawienia zależne od liczby graczy. */
export function recommendationFor(playerCount: number, withJanosik = false) {
  return {
    counts: suggestedCounts(playerCount, withJanosik),
    ...recommendedSettings(playerCount),
    inTable: inTable(playerCount),
  };
}

/**
 * Wpisuje podpowiedzi Xięgi do stanu — z pominięciem tego, co Manitou ustawił ręcznie.
 * Wołane po każdej zmianie listy graczy.
 */
export function syncRecommended(s: GameState) {
  const n = s.players.length;
  if (!janosikAllowed(n)) {
    s.setup.withJanosik = false;
    s.setup.counts.janosik = 0;
  }
  if (!s.setup.manualCounts) s.setup.counts = suggestedCounts(n, s.setup.withJanosik);
  if (!s.setup.manualSettings) {
    const r = recommendedSettings(n);
    s.settings.searchCount = r.searchCount;
    s.settings.shipNight = r.shipNight;
  }
}

export function totalOf(c: FactionCounts): number {
  return c.miasto + c.bandyci + c.indianie + c.ufoki + c.janosik;
}

/** Liczba graczy dzielona wg tabeli Xięgi, czyli bez karty Janosika. */
export function bookHeadcount(c: FactionCounts): number {
  return totalOf(c) - c.janosik;
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
  const filler = ROLES.find((r) => r.faction === faction && r.filler);
  // Frakcja Janosika nie ma szeregowych członków — jest jednoosobowa.
  if (filler) while (pool.length < size) pool.push(filler.id);
  return pool.slice(0, size);
}
