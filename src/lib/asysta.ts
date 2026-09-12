"use client";

/**
 * Drugi prowadzący po stronie przeglądarki.
 *
 * Podział ról jest tu ostry: urządzenie głównego Manitou jest jedynym
 * miejscem, w którym gra się toczy, i jedynym, które zapisuje stan. Asystent
 * dostaje kopię, liczy na niej tym samym silnikiem i przysyła wynik jako
 * prośbę. Nic się nie dzieje, dopóki główny jej nie przyjmie.
 */

import { GameState } from "./types";

const KLUCZ_ASYSTY = "ktulu.asysta.kod";

export type PoziomAsysty = "odczyt" | "zapis";
export type MojaRola = PoziomAsysty | "wlasciciel" | null;

export interface Migawka {
  wersja: number;
  kiedy: number;
  stan: GameState | null;
}

async function api<T>(sciezka: string, opcje: RequestInit = {}): Promise<T> {
  const odp = await fetch(sciezka, {
    ...opcje,
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...(opcje.headers ?? {}) },
  });
  const dane = await odp.json().catch(() => ({}));
  if (!odp.ok) throw new Error((dane as { error?: string }).error ?? `Błąd ${odp.status}.`);
  return dane as T;
}

// ————————————————————— pokój, w którym asystujemy —————————————————————

const sluchacze = new Set<() => void>();

export function subskrybujAsyste(cb: () => void): () => void {
  sluchacze.add(cb);
  return () => {
    sluchacze.delete(cb);
  };
}

export function kodAsystowanegoPokoju(): string | null {
  try {
    return localStorage.getItem(KLUCZ_ASYSTY);
  } catch {
    return null;
  }
}

export function zapamietajAsyste(kod: string | null): void {
  try {
    if (kod) localStorage.setItem(KLUCZ_ASYSTY, kod);
    else localStorage.removeItem(KLUCZ_ASYSTY);
  } catch {
    /* powrót po odświeżeniu przepadnie, ale asysta działa */
  }
  for (const cb of sluchacze) cb();
}

// ————————————————————————— wywołania —————————————————————————

export function dolaczJakoAsysta(kodPokoju: string, kodZaproszenia: string) {
  return api<{ poziom: PoziomAsysty }>(`/api/pokoj/${kodPokoju}/asysta/dolacz`, {
    method: "POST",
    body: JSON.stringify({ kod: kodZaproszenia }),
  });
}

export function mojaRolaWPokoju(kodPokoju: string) {
  return api<{ poziom: MojaRola; kod: string }>(`/api/pokoj/${kodPokoju}/moja-rola`);
}

export function pobierzMigawke(kodPokoju: string) {
  return api<Migawka>(`/api/pokoj/${kodPokoju}/migawka`);
}

/** Zapis migawki — wolno wyłącznie głównemu prowadzącemu. */
export function zapiszMigawke(kodPokoju: string, stan: GameState) {
  return api<{ wersja: number }>(`/api/pokoj/${kodPokoju}/migawka`, {
    method: "POST",
    body: JSON.stringify({ stan }),
  });
}

export function zglosZadanie(
  kodPokoju: string,
  opis: string[],
  stan: GameState,
  bazowaWersja: number
) {
  return api<{ id: string }>(`/api/pokoj/${kodPokoju}/zadanie`, {
    method: "POST",
    body: JSON.stringify({ opis, stan, bazowaWersja }),
  });
}

export function trescZadania(kodPokoju: string, id: string) {
  return api<{ stan: GameState; bazowaWersja: number }>(
    `/api/pokoj/${kodPokoju}/zadanie/tresc?id=${encodeURIComponent(id)}`
  );
}

export function zamknijZadanie(kodPokoju: string, id: string) {
  return api(`/api/pokoj/${kodPokoju}/zadanie`, {
    method: "DELETE",
    body: JSON.stringify({ id }),
  });
}

export function wycofajZadanie(kodPokoju: string, id: string) {
  return api(`/api/pokoj/${kodPokoju}/zadanie/wycofaj`, {
    method: "POST",
    body: JSON.stringify({ id }),
  });
}
