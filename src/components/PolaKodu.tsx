"use client";

/**
 * Kod wpisywany znak po znaku, w osobnych polach.
 *
 * Przy czterech znakach jest to wyraźnie szybsze niż jedno pole: widać, ile
 * zostało, a kursor przeskakuje sam. Wklejenie całego kodu też działa —
 * rozkłada się na pola, niezależnie od tego, w którym zaczniesz.
 */

import { useRef } from "react";
import { ALFABET } from "@/lib/kody";
import { cx } from "./ui";

export default function PolaKodu({
  dlugosc,
  wartosc,
  onChange,
  onKomplet,
  autoFocus = false,
}: {
  dlugosc: number;
  wartosc: string;
  onChange: (v: string) => void;
  /** Wywoływane, gdy padnie ostatni brakujący znak. */
  onKomplet?: (v: string) => void;
  autoFocus?: boolean;
}) {
  const pola = useRef<(HTMLInputElement | null)[]>([]);

  const skup = (i: number) => pola.current[Math.max(0, Math.min(dlugosc - 1, i))]?.focus();

  /** Wstawia znaki od pozycji `od`, zwraca nową wartość i miejsce kursora. */
  const wstaw = (od: number, znaki: string) => {
    const czyste = znaki.toUpperCase().split("").filter((z) => ALFABET.includes(z));
    if (czyste.length === 0) return;

    const tablica = wartosc.padEnd(dlugosc, " ").split("");
    let i = od;
    for (const znak of czyste) {
      if (i >= dlugosc) break;
      tablica[i] = znak;
      i += 1;
    }
    const nowa = tablica.join("").replace(/ +$/, "");
    onChange(nowa);
    skup(i);
    if (nowa.replace(/ /g, "").length === dlugosc) onKomplet?.(nowa);
  };

  return (
    <div className="flex items-center gap-2 justify-center">
      {Array.from({ length: dlugosc }, (_, i) => (
        <input
          key={i}
          ref={(el) => {
            pola.current[i] = el;
          }}
          value={wartosc[i] ?? ""}
          onChange={(e) => wstaw(i, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Backspace") {
              e.preventDefault();
              const tablica = wartosc.padEnd(dlugosc, " ").split("");
              // Puste pole cofa kursor i kasuje znak przed nim — tak jak
              // działa zwykłe pole tekstowe.
              const cel = tablica[i] && tablica[i] !== " " ? i : i - 1;
              if (cel < 0) return;
              tablica[cel] = " ";
              onChange(tablica.join("").replace(/ +$/, ""));
              skup(cel);
            } else if (e.key === "ArrowLeft") {
              e.preventDefault();
              skup(i - 1);
            } else if (e.key === "ArrowRight") {
              e.preventDefault();
              skup(i + 1);
            }
          }}
          onPaste={(e) => {
            e.preventDefault();
            wstaw(i, e.clipboardData.getData("text"));
          }}
          onFocus={(e) => e.currentTarget.select()}
          autoFocus={autoFocus && i === 0}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          aria-label={`Znak ${i + 1} z ${dlugosc}`}
          className={cx(
            "ui-input w-12 h-14 text-center font-mono uppercase",
            "text-[24px] tracking-normal p-0"
          )}
        />
      ))}
    </div>
  );
}
