"use client";

/**
 * Pulpit asystenta: te same panele, inny sposób zapisu.
 *
 * Stan przychodzi migawką od głównego prowadzącego. Każda próba zmiany jest
 * liczona lokalnie tym samym silnikiem, a wynik trafia do kolejki próśb —
 * nigdy wprost do gry. Dzięki temu panele rozgrywki nie muszą wiedzieć, na
 * czyim urządzeniu działają.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GameCtx, Ctx } from "./store";
import { emptyState } from "./engine";
import { opisZmiany } from "./opis";
import { GameState } from "./types";
import {
  Migawka,
  MojaRola,
  pobierzMigawke,
  mojaRolaWPokoju,
  zglosZadanie,
} from "./asysta";

/** Jak często dopytujemy o stan, gdy nie ma podglądu na żywo. */
const ODSTEP_MS = 3000;

export interface StanAsysty {
  poziom: MojaRola;
  migawka: Migawka | null;
  /** Prośba wysłana i czekająca na decyzję — blokuje kolejne zmiany. */
  wyslana: { id: string; opis: string[] } | null;
  blad: string | null;
  gotowe: boolean;
}

export function useAsysta(kodPokoju: string): {
  ctx: Ctx;
  info: StanAsysty;
  anuluj: () => void;
} {
  const [poziom, setPoziom] = useState<MojaRola>(null);
  const [migawka, setMigawka] = useState<Migawka | null>(null);
  const [wyslana, setWyslana] = useState<{ id: string; opis: string[] } | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [gotowe, setGotowe] = useState(false);
  /** Podgląd własnej propozycji, zanim główny ją przyjmie albo odrzuci. */
  const [propozycja, setPropozycja] = useState<GameState | null>(null);
  const ostatniaWersja = useRef(-1);

  const odswiez = useCallback(async () => {
    try {
      const [rola, swieza] = await Promise.all([
        mojaRolaWPokoju(kodPokoju),
        pobierzMigawke(kodPokoju),
      ]);
      setPoziom(rola.poziom);
      setMigawka(swieza);
      setBlad(null);
      // Nowa migawka znaczy, że główny coś rozstrzygnął — czekanie się kończy,
      // a własna propozycja przestaje obowiązywać, bo liczyła na starym stanie.
      if (swieza.wersja !== ostatniaWersja.current) {
        ostatniaWersja.current = swieza.wersja;
        setPropozycja(null);
        setWyslana(null);
      }
    } catch (e) {
      setBlad((e as Error).message);
    } finally {
      setGotowe(true);
    }
  }, [kodPokoju]);

  useEffect(() => {
    // Reguła widzi setState wewnątrz wołanej funkcji, ale wykonuje się on
    // dopiero po `await fetch`, więc kaskady renderów tu nie ma.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void odswiez();
    let uchwyt: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (!uchwyt) uchwyt = setInterval(() => void odswiez(), ODSTEP_MS);
    };
    const stop = () => {
      if (uchwyt) clearInterval(uchwyt);
      uchwyt = null;
    };
    const naZmiane = () =>
      document.visibilityState === "visible" ? (void odswiez(), start()) : stop();
    document.addEventListener("visibilitychange", naZmiane);
    naZmiane();
    return () => {
      document.removeEventListener("visibilitychange", naZmiane);
      stop();
    };
  }, [odswiez]);

  const bazowy = migawka?.stan ?? null;
  // Do czasu rozstrzygnięcia pokazujemy własną propozycję, żeby asystent
  // widział skutek swojego kliknięcia zamiast pozornie martwego ekranu.
  const widoczny = propozycja ?? bazowy ?? emptyState();

  const zaproponuj = useCallback(
    (nastepny: GameState) => {
      if (!bazowy || !migawka) return;
      if (poziom !== "zapis") {
        setBlad("Masz dostęp tylko do podglądu.");
        return;
      }
      if (wyslana) {
        setBlad("Poprzednia prośba czeka jeszcze na decyzję prowadzącego.");
        return;
      }
      const opis = opisZmiany(bazowy, nastepny);
      setPropozycja(nastepny);
      setBlad(null);
      void zglosZadanie(kodPokoju, opis, nastepny, migawka.wersja)
        .then((w) => setWyslana({ id: w.id, opis }))
        .catch((e) => {
          setPropozycja(null);
          setBlad((e as Error).message);
        });
    },
    [bazowy, migawka, poziom, wyslana, kodPokoju]
  );

  const ctx = useMemo<Ctx>(
    () => ({
      state: widoczny,
      loaded: gotowe && !!bazowy,
      set: (s: GameState) => zaproponuj(s),
      update: (fn: (s: GameState) => void) => {
        const kopia = structuredClone(widoczny);
        fn(kopia);
        zaproponuj(kopia);
      },
      // Kasowanie gry nie należy do asysty — to decyzja prowadzącego.
      reset: () => setBlad("Nową grę zaczyna główny prowadzący."),
    }),
    [widoczny, gotowe, bazowy, zaproponuj]
  );

  return {
    ctx,
    info: { poziom, migawka, wyslana, blad, gotowe },
    anuluj: () => {
      setPropozycja(null);
      setWyslana(null);
      setBlad(null);
    },
  };
}

/** Podstawia kontekst gry, żeby panele rozgrywki działały bez zmian. */
export function DostawcaAsysty({ ctx, children }: { ctx: Ctx; children: React.ReactNode }) {
  return <GameCtx.Provider value={ctx}>{children}</GameCtx.Provider>;
}
