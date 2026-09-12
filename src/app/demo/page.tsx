"use client";

/**
 * Pokaz ekranu gracza.
 *
 * Do pokazania komuś, jak wygląda karta na telefonie, bez zakładania pokoju
 * i bez zapraszania kogokolwiek. Rozdanie losuje się przy każdym wejściu,
 * więc dwa razy z rzędu nie widać tego samego.
 */

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import KartaGracza from "@/components/KartaGracza";
import KartyWGrze from "@/components/KartyWGrze";
import { Button, Card } from "@/components/ui";
import { generatorZiarna, wylosujDemo } from "@/lib/demo";

/**
 * Znacznik „jesteśmy już w przeglądarce”.
 *
 * Losowanie nie może wejść do wyeksportowanego HTML-a: wynik byłby
 * przypieczętowany w chwili builda i identyczny przy każdym odświeżeniu,
 * a przy hydracji rozjechałby się z tym, co wylosuje przeglądarka.
 */
const bezZmian = () => () => {};

function useWPrzegladarce(): boolean {
  return useSyncExternalStore(
    bezZmian,
    () => true,
    () => false
  );
}

export default function StronaDemo() {
  const wPrzegladarce = useWPrzegladarce();
  // Ziarno zamiast gotowego rozdania: przy tym samym ziarnie wynik jest ten
  // sam, więc przerysowanie ekranu niczym nie miga, a przycisk daje nowe.
  const [ziarno, setZiarno] = useState(() => Math.random());
  const dane = wPrzegladarce ? wylosujDemo(generatorZiarna(ziarno)) : null;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-12 shrink-0 flex items-center px-4 gap-3">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-[5px] bg-[var(--accent)] grid place-items-center text-[11px] font-bold text-[var(--accent-text)]">
            K
          </span>
          <span className="text-[13px] font-semibold tracking-tight">Ktulu · pokaz</span>
        </div>
        <Link
          href="/"
          className="ml-auto text-[12.5px] text-[var(--text-dim)] hover:text-[var(--text)] underline"
        >
          Wróć
        </Link>
      </header>

      <div className="flex-1 grid place-items-center p-4">
        <div className="w-full max-w-[380px] flex flex-col gap-4">
          <Card>
            <div className="text-[13px] font-semibold">To jest pokaz</div>
            <p className="text-[12.5px] text-[var(--text-dim)] leading-relaxed mt-1">
              Przykładowe rozdanie — nikt tu nie gra. Dokładnie tak wygląda ekran gracza
              w prawdziwej rozgrywce: najpierw ostrzeżenie, potem karta odsłaniana przytrzymaniem.
            </p>
            <Button size="sm" className="mt-3" onClick={() => setZiarno(Math.random())}>
              Wylosuj inne rozdanie
            </Button>
          </Card>

          {dane && (
            <>
              <KartaGracza
                roleId={dane.mojaRola}
                imie={dane.mojeImie}
                potwierdzone={false}
                onPotwierdz={() => {
                  /* w pokazie nie ma komu potwierdzać */
                }}
              />
              <KartyWGrze sklad={dane.sklad} ujawnieni={dane.ujawnieni} />
            </>
          )}

          <p className="text-[12px] text-[var(--text-faint)] text-center leading-relaxed">
            W prawdziwej grze imiona przy kartach pojawiają się dopiero wtedy, gdy prowadzący
            odkryje kartę zmarłego przy stole.
          </p>
        </div>
      </div>
    </div>
  );
}
