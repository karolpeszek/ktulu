"use client";

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from "react";

export type Handedness = "right" | "left";
export type Theme = "system" | "light" | "dark";
/** „touch” powiększa elementy dotykowe — dla palca, bez rysika. */
export type Density = "normal" | "touch";

const KEY = "ktulu.ui.prefs.v1";

interface Prefs {
  /** Ręka, w której Manitou trzyma rysik — dymki uciekają na przeciwną stronę. */
  handedness: Handedness;
  /** „system” idzie za ustawieniem urządzenia. */
  theme: Theme;
  /** Ukrywa karty i frakcje wszędzie, gdy ktoś zagląda przez ramię. */
  safeMode: boolean;
  density: Density;
}

const DEFAULTS: Prefs = {
  handedness: "right",
  theme: "system",
  safeMode: false,
  density: "normal",
};

interface Ctx extends Prefs {
  setHandedness: (h: Handedness) => void;
  setTheme: (t: Theme) => void;
  setSafeMode: (v: boolean) => void;
  setDensity: (d: Density) => void;
  /** Strona, po której ma się pojawiać dymek, żeby nie chowała go dłoń. */
  tipSide: "left" | "right";
}

// ── odczyt ustawień jako źródła zewnętrznego ───────────────────────────────
// `useSyncExternalStore` zamiast efektu z setState: nie powoduje kaskady
// renderów, poprawnie obsługuje render serwerowy i łapie zmiany z innych kart.

const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function readRaw(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

/** Na serwerze i przy pierwszym renderze nie ma dostępu do localStorage. */
const serverRaw = () => "";

function parse(raw: string): Prefs {
  if (!raw) return DEFAULTS;
  try {
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    return DEFAULTS;
  }
}

const PrefsCtx = createContext<Ctx | null>(null);

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const raw = useSyncExternalStore(subscribe, readRaw, serverRaw);
  const prefs = useMemo(() => parse(raw), [raw]);

  // Wymuszony motyw jedzie atrybutem na <html>; „system” zdejmuje atrybut
  // i oddaje decyzję regule `prefers-color-scheme`.
  useEffect(() => {
    const root = document.documentElement;
    if (prefs.theme === "system") delete root.dataset.theme;
    else root.dataset.theme = prefs.theme;
  }, [prefs.theme]);

  useEffect(() => {
    const root = document.documentElement;
    if (prefs.density === "normal") delete root.dataset.density;
    else root.dataset.density = prefs.density;
  }, [prefs.density]);

  const value = useMemo<Ctx>(() => {
    const save = (next: Prefs) => {
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* brak zapisu nie psuje działania */
      }
      // `storage` nie leci do karty, która zapisała — budzimy ją ręcznie.
      listeners.forEach((l) => l());
    };
    return {
      ...prefs,
      setHandedness: (handedness: Handedness) => save({ ...prefs, handedness }),
      setTheme: (theme: Theme) => save({ ...prefs, theme }),
      setSafeMode: (safeMode: boolean) => save({ ...prefs, safeMode }),
      setDensity: (density: Density) => save({ ...prefs, density }),
      // Praworęczny zasłania rysikiem to, co jest na prawo od grotu.
      tipSide: prefs.handedness === "right" ? "left" : "right",
    };
  }, [prefs]);

  return <PrefsCtx.Provider value={value}>{children}</PrefsCtx.Provider>;
}

export function usePrefs(): Ctx {
  const c = useContext(PrefsCtx);
  // Komponenty renderowane poza providerem dostają wartości domyślne.
  return (
    c ?? {
      ...DEFAULTS,
      setHandedness: () => {},
      setTheme: () => {},
      setSafeMode: () => {},
      setDensity: () => {},
      tipSide: "left",
    }
  );
}
