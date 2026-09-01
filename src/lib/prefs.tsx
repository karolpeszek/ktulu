"use client";

import { createContext, useContext, useMemo, useSyncExternalStore } from "react";

export type Handedness = "right" | "left";

const KEY = "ktulu.ui.prefs.v1";

interface Prefs {
  /** Ręka, w której Manitou trzyma rysik — dymki uciekają na przeciwną stronę. */
  handedness: Handedness;
}

const DEFAULTS: Prefs = { handedness: "right" };

interface Ctx extends Prefs {
  setHandedness: (h: Handedness) => void;
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

  const value = useMemo<Ctx>(
    () => ({
      ...prefs,
      setHandedness: (handedness: Handedness) => {
        try {
          localStorage.setItem(KEY, JSON.stringify({ ...prefs, handedness }));
        } catch {
          /* brak zapisu nie psuje działania */
        }
        // `storage` nie leci do karty, która zapisała — budzimy ją ręcznie.
        listeners.forEach((l) => l());
      },
      // Praworęczny zasłania rysikiem to, co jest na prawo od grotu.
      tipSide: prefs.handedness === "right" ? "left" : "right",
    }),
    [prefs]
  );

  return <PrefsCtx.Provider value={value}>{children}</PrefsCtx.Provider>;
}

export function usePrefs(): Ctx {
  const c = useContext(PrefsCtx);
  // Komponenty renderowane poza providerem dostają wartości domyślne.
  return c ?? { ...DEFAULTS, setHandedness: () => {}, tipSide: "left" };
}
