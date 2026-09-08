"use client";

/**
 * Odkrywanie kart zmarłych na telefonach graczy.
 *
 * Świadomie osobny przycisk, a nie skutek śmierci w silniku: gdyby pokój
 * dowiadywał się o niej w chwili zabicia, telefony ujawniłyby nocne ofiary,
 * zanim Manitou zdąży ogłosić poranek. Klika się to wtedy, kiedy karta
 * naprawdę idzie na stół — po poranku, po pojedynku, po powieszeniu.
 *
 * Panel milczy, gdy gra idzie bez lobby.
 */

import { useCallback, useEffect, useState } from "react";
import { useGame } from "@/lib/store";
import { StanPokoju, stanZZapamietanego, ujawnijWZapamietanym } from "@/lib/pokoj";
import { Badge, Button, Card } from "./ui";

export default function PanelUjawnien() {
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

  if (!pokoj) return null;

  const wPokoju = new Map(pokoj.gracze.map((g) => [g.id, g]));
  const doUjawnienia = state.players.filter(
    (p) => !p.alive && wPokoju.get(p.id)?.maKarte && !wPokoju.get(p.id)?.ujawniony
  );
  const ujawnieni = state.players.filter((p) => !p.alive && wPokoju.get(p.id)?.ujawniony);

  // Nie ma zmarłych z kartą w pokoju — nie ma o czym mówić.
  if (doUjawnienia.length === 0 && ujawnieni.length === 0) return null;

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
          Wszystkie karty zmarłych są już widoczne na telefonach.
        </p>
      ) : (
        <>
          <p className="text-[12.5px] text-[var(--text-dim)] leading-relaxed">
            Nieodkryte:{" "}
            <strong className="text-[var(--text)]">
              {doUjawnienia.map((p) => p.name).join(", ")}
            </strong>
            . Kliknij, gdy karta idzie na stół — nie wcześniej, bo telefony wyprzedziłyby
            twoje ogłoszenie.
          </p>
          <Button
            variant="primary"
            size="sm"
            className="mt-3"
            disabled={trwa}
            onClick={async () => {
              setTrwa(true);
              try {
                await ujawnijWZapamietanym(doUjawnienia.map((p) => p.id));
                await odswiez();
              } finally {
                setTrwa(false);
              }
            }}
          >
            Ujawnij wszystkie ({doUjawnienia.length})
          </Button>
        </>
      )}
    </Card>
  );
}
