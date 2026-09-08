"use client";

/**
 * Odkrywanie kart zmarłych na telefonach graczy.
 *
 * Świadomie osobna akcja, a nie skutek śmierci w silniku: gdyby pokój
 * dowiadywał się o niej w chwili zabicia, telefony ujawniłyby nocne ofiary,
 * zanim Manitou zdąży ogłosić poranek. Klika się to wtedy, kiedy karta
 * naprawdę idzie na stół — po poranku, po pojedynku, po powieszeniu.
 *
 * Wszystko tu milczy, gdy gra idzie bez lobby.
 */

import { useCallback, useEffect, useState } from "react";
import { useGame } from "@/lib/store";
import { Player } from "@/lib/types";
import { StanPokoju, stanZZapamietanego, ujawnijWZapamietanym } from "@/lib/pokoj";
import { Badge, Button, Card } from "./ui";

interface Ujawnienia {
  /** Zmarli z kartą w pokoju, których telefony jeszcze nie widziały. */
  doUjawnienia: Player[];
  ujawnieni: Player[];
  wLobby: boolean;
  trwa: boolean;
  ujawnij: () => Promise<void>;
}

function useUjawnienia(): Ujawnienia {
  const { state } = useGame();
  const [pokoj, setPokoj] = useState<StanPokoju | null>(null);
  const [trwa, setTrwa] = useState(false);

  const odswiez = useCallback(async () => {
    setPokoj(await stanZZapamietanego());
  }, []);

  useEffect(() => {
    // Reguła widzi setState wewnątrz wołanej funkcji, ale wykonuje się on
    // dopiero po `await fetch`, więc kaskady renderów tu nie ma.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void odswiez();
  }, [odswiez]);

  const wPokoju = new Map((pokoj?.gracze ?? []).map((g) => [g.id, g]));
  const doUjawnienia = state.players.filter(
    (p) => !p.alive && wPokoju.get(p.id)?.maKarte && !wPokoju.get(p.id)?.ujawniony
  );
  const ujawnieni = state.players.filter((p) => !p.alive && wPokoju.get(p.id)?.ujawniony);

  const ujawnij = useCallback(async () => {
    if (doUjawnienia.length === 0) return;
    setTrwa(true);
    try {
      await ujawnijWZapamietanym(doUjawnienia.map((p) => p.id));
      await odswiez();
    } finally {
      setTrwa(false);
    }
    // Lista zmarłych zmienia się z każdą śmiercią, więc zależność jest celowa.
  }, [doUjawnienia, odswiez]);

  return { doUjawnienia, ujawnieni, wLobby: !!pokoj, trwa, ujawnij };
}

/**
 * Przycisk przy samych zdarzeniach — poranek, pojedynek, wieszanie.
 * To jedyne momenty, w których karta zmarłego idzie na stół.
 */
export function PrzyciskUjawnien({ etykieta }: { etykieta?: string }) {
  const { doUjawnienia, wLobby, trwa, ujawnij } = useUjawnienia();
  if (!wLobby || doUjawnienia.length === 0) return null;

  return (
    <div className="mt-3 flex items-center gap-2 flex-wrap">
      <Button variant="primary" size="sm" disabled={trwa} onClick={() => void ujawnij()}>
        💀 {etykieta ?? "Ujawnij karty zmarłych"} ({doUjawnienia.length})
      </Button>
      <span className="text-[12px] text-[var(--text-faint)]">
        {doUjawnienia.map((p) => p.name).join(", ")} — karty pokażą się na telefonach graczy.
      </span>
    </div>
  );
}

/** Pełny podgląd w panelu bocznym: co już poszło na telefony, a co nie. */
export default function PanelUjawnien() {
  const { doUjawnienia, ujawnieni, wLobby, trwa, ujawnij } = useUjawnienia();
  if (!wLobby || (doUjawnienia.length === 0 && ujawnieni.length === 0)) return null;

  return (
    <Card
      title="Karty zmarłych"
      right={
        <Badge color={doUjawnienia.length > 0 ? "var(--warn)" : "var(--ok)"}>
          {ujawnieni.length}/{ujawnieni.length + doUjawnienia.length}
        </Badge>
      }
    >
      {doUjawnienia.length === 0 ? (
        <p className="text-[12.5px] text-[var(--text-dim)]">
          Wszystkie karty zmarłych są widoczne na telefonach graczy.
        </p>
      ) : (
        <>
          <p className="text-[12.5px] text-[var(--text-dim)] leading-relaxed">
            Nieodkryte:{" "}
            <strong className="text-[var(--text)]">
              {doUjawnienia.map((p) => p.name).join(", ")}
            </strong>
            . Kliknij, gdy karta idzie na stół — nie wcześniej, bo telefony wyprzedziłyby twoje
            ogłoszenie.
          </p>
          <Button
            variant="primary"
            size="sm"
            className="mt-3"
            disabled={trwa}
            onClick={() => void ujawnij()}
          >
            💀 Ujawnij wszystkie ({doUjawnienia.length})
          </Button>
        </>
      )}
    </Card>
  );
}
