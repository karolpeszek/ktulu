"use client";

/**
 * Rozmowa głównego prowadzącego z asystą.
 *
 * Dwie rzeczy naraz: wypychanie stanu gry do pokoju, żeby asystent widział to
 * samo co my, i pytanie o zgodę na każdą jego zmianę. Zgoda jest wymagana
 * zawsze — to urządzenie trzyma stan i tylko tutaj zapada decyzja.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useGame } from "@/lib/store";
import { usePokojCtx } from "@/lib/pokoj";
import { trescZadania, zamknijZadanie, zapiszMigawke } from "@/lib/asysta";
import { Badge, Button, Card } from "./ui";

/** Ile czekamy po ostatniej zmianie, zanim wyślemy stan. */
const ZWLOKA_MS = 600;

/**
 * Wypycha stan gry do pokoju po każdej zmianie.
 *
 * Ze zwłoką, bo w trakcie kroku nocy stan zmienia się kilka razy pod rząd,
 * a asystentowi potrzebny jest wynik, nie każdy etap pośredni. Odmowa zapisu
 * kończy próby: to znaczy, że nie jesteśmy właścicielem tego pokoju.
 */
export function usePublikacjaMigawki(): void {
  const { state, loaded } = useGame();
  const pokoj = usePokojCtx();
  const kod = pokoj.stan?.kod ?? null;
  const ostatnia = useRef<string>("");
  const wolnoPisac = useRef(true);

  useEffect(() => {
    if (!loaded || !kod || !wolnoPisac.current) return;
    const tresc = JSON.stringify(state);
    if (tresc === ostatnia.current) return;

    const uchwyt = setTimeout(() => {
      ostatnia.current = tresc;
      void zapiszMigawke(kod, state).catch((e: Error) => {
        // 403 znaczy „to nie twój pokój” — dalsze próby nic nie zmienią.
        if (/tylko główny prowadzący|nie jest twój/i.test(e.message)) wolnoPisac.current = false;
      });
    }, ZWLOKA_MS);
    return () => clearTimeout(uchwyt);
  }, [state, loaded, kod]);
}

/** Prośby asysty czekające na decyzję. Nic nie pokazuje, gdy kolejka pusta. */
export default function ProsbyAsysty() {
  const { set } = useGame();
  const pokoj = usePokojCtx();
  const [trwa, setTrwa] = useState<string | null>(null);
  const [blad, setBlad] = useState<string | null>(null);

  const kod = pokoj.stan?.kod ?? null;
  const zadania = pokoj.stan?.zadania ?? [];
  const wersja = pokoj.stan?.wersjaMigawki ?? 0;

  const przyjmij = useCallback(
    async (id: string) => {
      if (!kod) return;
      setTrwa(id);
      setBlad(null);
      try {
        const { stan } = await trescZadania(kod, id);
        // Stan wchodzi do gry dopiero tutaj — na urządzeniu, które ją trzyma.
        set(stan);
        await zamknijZadanie(kod, id);
      } catch (e) {
        setBlad((e as Error).message);
      } finally {
        setTrwa(null);
      }
    },
    [kod, set]
  );

  const odrzuc = useCallback(
    async (id: string) => {
      if (!kod) return;
      setTrwa(id);
      try {
        await zamknijZadanie(kod, id);
      } catch (e) {
        setBlad((e as Error).message);
      } finally {
        setTrwa(null);
      }
    },
    [kod]
  );

  if (zadania.length === 0) return null;

  return (
    <Card
      title="Asysta prosi o zgodę"
      accent="var(--warn)"
      right={<Badge color="var(--warn)">{zadania.length}</Badge>}
    >
      <div className="flex flex-col gap-3">
        {zadania.map((z) => {
          const nieaktualna = z.bazowaWersja !== wersja;
          return (
            <div key={z.id} className="ui-row flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium">{z.odNazwa}</span>
                {nieaktualna && (
                  <Badge color="var(--danger)">stan zmienił się od tego czasu</Badge>
                )}
              </div>
              <ul className="flex flex-col gap-1">
                {z.opis.map((linia, i) => (
                  <li key={i} className="text-[13px] text-[var(--text)]">
                    {linia}
                  </li>
                ))}
              </ul>
              {nieaktualna && (
                <p className="text-[12px]" style={{ color: "var(--danger)" }}>
                  Asysta liczyła to na starszym stanie gry. Przyjęcie cofnie zmiany, które w tym
                  czasie zrobiłeś u siebie — bezpieczniej odrzucić i poprosić o powtórzenie.
                </p>
              )}
              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  disabled={trwa === z.id}
                  onClick={() => void przyjmij(z.id)}
                >
                  Zatwierdź
                </Button>
                <Button size="sm" disabled={trwa === z.id} onClick={() => void odrzuc(z.id)}>
                  Odrzuć
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      {blad && (
        <p className="text-[12.5px] mt-2" style={{ color: "var(--danger)" }}>
          {blad}
        </p>
      )}
    </Card>
  );
}
