"use client";

/**
 * Kod pokoju na pełnym ekranie — do pokazania stołowi.
 *
 * QR po lewej, duży kod po prawej: kto ma aparat, skanuje, reszta przepisuje
 * cztery znaki. Kod jest jawny dla wszystkich przy stole, więc nie ma tu
 * zasłony, którą dostają karty postaci.
 */

import { useEffect, useSyncExternalStore } from "react";
import KodQR from "./KodQR";
import { Button } from "./ui";
import { pogrupuj } from "@/lib/kody";

/**
 * Adres, pod który mają wejść gracze.
 *
 * Znany dopiero w przeglądarce, bo domena różni się między produkcją
 * a podglądem gałęzi. Czytany spoza Reacta, żeby nie kopiować go efektem.
 */
const bezZmian = () => () => {};

function useOrigin(): string {
  return useSyncExternalStore(
    bezZmian,
    () => location.origin,
    () => ""
  );
}

export default function EkranKodu({ kod, zamknij }: { kod: string; zamknij: () => void }) {
  const origin = useOrigin();
  const adres = origin ? `${origin}/?k=${kod}` : "";

  useEffect(() => {
    const naKlawisz = (e: KeyboardEvent) => e.key === "Escape" && zamknij();
    document.addEventListener("keydown", naKlawisz);
    return () => document.removeEventListener("keydown", naKlawisz);
  }, [zamknij]);

  return (
    <div
      className="fixed inset-0 z-50 bg-[var(--bg)] flex flex-col"
      role="dialog"
      aria-label="Kod pokoju"
    >
      <div className="flex items-center justify-between px-4 h-12 shrink-0">
        <span className="text-[13px] text-[var(--text-dim)]">Pokaż ten ekran graczom</span>
        <Button onClick={zamknij}>Zamknij</Button>
      </div>

      <div className="flex-1 grid place-items-center p-6 overflow-auto">
        <div className="flex flex-col md:flex-row items-center gap-10 md:gap-16">
          <div className="shrink-0 p-4 bg-white rounded-[12px] shadow-sm">
            {adres ? (
              <KodQR tresc={adres} rozmiar={260} opis={`Kod pokoju ${kod}`} />
            ) : (
              <div className="w-[260px] h-[260px]" />
            )}
          </div>

          <div className="text-center md:text-left">
            <div className="label-xs mb-2">Kod pokoju</div>
            <div className="font-mono font-bold tracking-[0.18em] text-[clamp(56px,12vw,110px)] leading-none">
              {kod}
            </div>
            <p className="mt-6 text-[14px] text-[var(--text-dim)] leading-relaxed max-w-[340px]">
              Zeskanuj kod albo wejdź na{" "}
              <strong className="text-[var(--text)]">{adres.replace(/^https?:\/\//, "").split("/?")[0]}</strong>{" "}
              i wpisz cztery znaki.
            </p>
            <p className="mt-3 text-[12.5px] text-[var(--text-faint)] leading-relaxed max-w-[340px]">
              W kodach nie ma zera, litery O, jedynki, I ani L — jeśli ktoś je widzi, to na pewno
              inny znak.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Kod w jednej linii, do nagłówka karty lobby. */
export function KodWLinii({ kod }: { kod: string }) {
  return <code className="font-mono tracking-[0.15em] text-[15px] font-semibold">{pogrupuj(kod, 4)}</code>;
}
