"use client";

/**
 * Karta postaci na telefonie gracza.
 *
 * Najpierw ostrzeżenie, potem karta odsłaniana przytrzymaniem — telefon leży
 * na stole między dwojgiem sąsiadów, więc karta nie może zostać widoczna
 * dlatego, że ktoś odłożył urządzenie ekranem do góry.
 */

import { useEffect, useState } from "react";
import { ROLE_BY_ID } from "@/lib/roles";
import { FACTION_GOAL, FACTION_LABEL } from "@/lib/types";
import { Button, Card, FACTION_COLOR, SecretBackdrop } from "./ui";

/** Ile karta zostaje odsłonięta, zanim sama się schowa. */
const CZAS_PODGLADU_MS = 20000;

export default function KartaGracza({
  roleId,
  imie,
  potwierdzone,
  onPotwierdz,
  wspolnicy = [],
}: {
  roleId: string;
  imie: string;
  potwierdzone: boolean;
  onPotwierdz: () => void;
  /** Imiona z tej samej frakcji — puste, gdy zasada domowa jest wyłączona. */
  wspolnicy?: string[];
}) {
  const [odsloniete, setOdsloniete] = useState(false);
  const rola = ROLE_BY_ID[roleId];

  useEffect(() => {
    if (!odsloniete) return;
    const uchwyt = setTimeout(() => setOdsloniete(false), CZAS_PODGLADU_MS);
    return () => clearTimeout(uchwyt);
  }, [odsloniete]);

  // Schowanie karty przy przejściu w tło: odłożony telefon nie ma jej pokazywać.
  useEffect(() => {
    const naZmiane = () => document.visibilityState !== "visible" && setOdsloniete(false);
    document.addEventListener("visibilitychange", naZmiane);
    return () => document.removeEventListener("visibilitychange", naZmiane);
  }, []);

  if (!rola) {
    return (
      <Card>
        <p className="text-[12.5px]" style={{ color: "var(--danger)" }}>
          Nieznana karta ({roleId}). Zapytaj prowadzącego.
        </p>
      </Card>
    );
  }

  const kolor = FACTION_COLOR[rola.faction];

  if (!odsloniete) {
    return (
      <Card>
        <div className="text-center py-2">
          <div className="text-[13px] text-[var(--text-dim)]">{imie}</div>
          <div className="text-[16px] font-semibold mt-3">Twoja karta jest gotowa</div>
          <p className="text-[13px] text-[var(--text-dim)] leading-relaxed mt-3 max-w-[300px] mx-auto">
            Na następnym ekranie zobaczysz swoją postać. Odwróć telefon od sąsiadów i przytrzymaj
            palec — karta znika, gdy go zdejmiesz.
          </p>
        </div>

        <Button
          variant="primary"
          className="w-full justify-center mt-2"
          onPointerDown={(e) => {
            e.preventDefault();
            setOdsloniete(true);
            if (!potwierdzone) onPotwierdz();
          }}
        >
          {potwierdzone ? "Pokaż kartę ponownie" : "Przytrzymaj, żeby zobaczyć"}
        </Button>

        {potwierdzone && (
          <p className="text-[12px] text-[var(--text-faint)] text-center mt-3">
            Prowadzący wie już, że znasz swoją postać.
          </p>
        )}
      </Card>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4"
      onPointerUp={() => setOdsloniete(false)}
      onPointerCancel={() => setOdsloniete(false)}
      role="dialog"
      aria-label="Twoja karta"
    >
      <SecretBackdrop opacity={0.92} />
      <div
        className="relative w-full max-w-[340px] rounded-[14px] p-5 border-t-4"
        style={{ background: "var(--surface)", borderTopColor: kolor }}
      >
        <div className="label-xs" style={{ color: kolor }}>
          {rola.faction === "janosik" ? "Frakcja własna" : FACTION_LABEL[rola.faction]}
        </div>
        <h2 className="text-[26px] font-bold leading-tight mt-1">{rola.name}</h2>
        <p className="text-[13.5px] leading-relaxed mt-3 text-[var(--text)]">{rola.desc}</p>
        {wspolnicy.length > 0 && (
          <div className="mt-4 pt-3 border-t border-[var(--border)]">
            <div className="label-xs mb-1.5" style={{ color: kolor }}>
              {wspolnicy.length === 1 ? "Twój wspólnik" : "Twoi wspólnicy"}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {wspolnicy.map((n) => (
                <span
                  key={n}
                  className="text-[13.5px] font-medium px-2 py-1 rounded-[6px]"
                  style={{ background: "var(--surface-2)" }}
                >
                  {n}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 pt-3 border-t border-[var(--border)]">
          <div className="text-[12.5px] text-[var(--text-dim)] leading-relaxed">
            <strong className="text-[var(--text)]">Cel:</strong> {FACTION_GOAL[rola.faction]}
          </div>
        </div>
        <p className="text-[11.5px] text-[var(--text-faint)] mt-4 text-center">
          Zdejmij palec, żeby schować
        </p>
      </div>
    </div>
  );
}
