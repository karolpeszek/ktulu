"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { GameState } from "./types";
import { emptyState } from "./engine";

const KEY = "ktulu.game.v1";

interface Ctx {
  state: GameState;
  set: (s: GameState) => void;
  update: (fn: (s: GameState) => void) => void;
  reset: () => void;
  loaded: boolean;
}

const GameCtx = createContext<Ctx | null>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GameState>(() => emptyState());
  const [loaded, setLoaded] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as GameState;
        // Hydratacja z localStorage musi nastąpić po pierwszym renderze,
        // żeby serwer i klient wyrenderowały to samo.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (parsed?.version === 1) setState({ ...emptyState(), ...parsed });
      }
    } catch {
      /* pusty stan */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!loaded) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* brak miejsca — gra działa dalej w pamięci */
    }
  }, [state, loaded]);

  const update = (fn: (s: GameState) => void) => {
    setState((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  };

  const reset = () => {
    setState(emptyState());
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignoruj */
    }
  };

  return (
    <GameCtx.Provider value={{ state, set: setState, update, reset, loaded }}>
      {children}
    </GameCtx.Provider>
  );
}

export function useGame(): Ctx {
  const c = useContext(GameCtx);
  if (!c) throw new Error("useGame poza GameProvider");
  return c;
}
