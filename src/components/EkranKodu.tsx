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

      {/* Ten ekran pokazuje się stołowi z odległości ręki wyciągniętej przez
          pół pokoju, więc kod i QR mają zająć tyle miejsca, ile się da. */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row items-center justify-center gap-4 md:gap-8 px-4 pb-4">
        <div className="flex-1 min-h-0 w-full flex items-center justify-center">
          {/* Bok liczony z obu wymiarów naraz: w poziomie ogranicza go połowa
              szerokości, w pionie wysokość okna. Bez tego kwadrat wychodziłby
              poza ekran na niskim, szerokim oknie. */}
          <div className="bg-white rounded-[10px] p-[1.5%] aspect-square w-[min(92vw,42vh)] md:w-[min(46vw,80vh)]">
            {adres ? (
              <KodQR tresc={adres} opis={`Kod pokoju ${kod}`} />
            ) : (
              <div className="w-full h-full" />
            )}
          </div>
        </div>

        <div className="flex-1 min-w-0 w-full flex flex-col items-center justify-center text-center">
          <div className="label-xs">Kod pokoju</div>
          {/* Cztery znaki plus odstępy to około 2,9 szerokości litery, więc
              górna granica w vw pilnuje, żeby kod mieścił się w swojej połowie. */}
          <div className="font-mono font-bold tracking-[0.12em] leading-none w-full text-[min(26vw,14vh)] md:text-[min(15vw,30vh)]">
            {kod}
          </div>
          <p className="mt-[3vh] text-[clamp(13px,2.2vh,20px)] text-[var(--text-dim)] leading-snug">
            Zeskanuj albo wejdź na{" "}
            <strong className="text-[var(--text)]">
              {adres.replace(/^https?:\/\//, "").split("/?")[0]}
            </strong>
          </p>
          <p className="mt-[1vh] text-[clamp(11px,1.7vh,15px)] text-[var(--text-faint)] leading-snug">
            W kodach nie ma zera, litery O, jedynki, I ani L.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Kod w jednej linii, do nagłówka karty lobby. */
export function KodWLinii({ kod }: { kod: string }) {
  return <code className="font-mono tracking-[0.15em] text-[15px] font-semibold">{pogrupuj(kod, 4)}</code>;
}
