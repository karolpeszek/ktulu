"use client";

/**
 * Poczekalnia gracza.
 *
 * Odpytywanie zamiast WebSocketa: telefon czeka tu na jedno zdarzenie —
 * rozdanie kart — więc logika wznawiania połączenia byłaby kosztem bez
 * pokrycia. Odstęp zależy od tego, czy karta jest na wierzchu.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card, inputCls } from "@/components/ui";
import { MAKS_DLUGOSC_IMIENIA } from "@/lib/lobby";
import { tozsamoscGracza } from "@/lib/tozsamosc";
import KartaGracza from "./KartaGracza";
import KartyWGrze from "./KartyWGrze";

interface StanGracza {
  kod: string;
  etap: "lobby" | "zamkniete" | "rozdane";
  ja: {
    id: string;
    nazwa: string;
    miejsce: number | null;
    rola: string | null;
    widzial: number | null;
  } | null;
  imiona: string[];
  sklad: string[];
  ujawnieni: { rola: string; imie: string }[];
}

/** Jak często pytamy serwer, gdy ekran jest na wierzchu. */
const ODSTEP_MS = 4000;

export default function Poczekalnia({ kod, wyjdz }: { kod: string; wyjdz: () => void }) {
  const [stan, setStan] = useState<StanGracza | null>(null);
  const [nazwa, setNazwa] = useState("");
  const [blad, setBlad] = useState<string | null>(null);
  const [trwa, setTrwa] = useState(false);
  const [zniknal, setZniknal] = useState(false);
  // Klucz powstaje raz, przy pierwszym renderze dla danego pokoju — leniwa
  // wartość początkowa zamiast referencji, bo tej nie wolno czytać w renderze.
  const [token] = useState(() => tozsamoscGracza(kod));

  const pobierz = useCallback(async () => {
    try {
      const odp = await fetch(`/api/pokoj/${kod}/ja`, {
        headers: { "x-ktulu-gracz": token },
      });
      const dane = await odp.json().catch(() => ({}));
      if (odp.ok) {
        setStan(dane as StanGracza);
        setZniknal(false);
      } else if (odp.status === 404) {
        // Pokój skasowany przez prowadzącego albo wygasły po dobie. Mówimy
        // o tym wprost, zamiast po cichu wyrzucać z powrotem do wpisywania kodu.
        setZniknal(true);
      }
    } catch {
      /* chwilowy brak sieci — spróbujemy przy następnym odpytaniu */
    }
  }, [kod, token]);

  useEffect(() => {
    // Reguła widzi setState wewnątrz wołanej funkcji, ale wykonuje się on
    // dopiero po `await fetch`, więc kaskady renderów tu nie ma.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void pobierz();
    let uchwyt: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (uchwyt) return;
      uchwyt = setInterval(() => void pobierz(), ODSTEP_MS);
    };
    const stop = () => {
      if (uchwyt) clearInterval(uchwyt);
      uchwyt = null;
    };
    // Schowana karta nie ma po co pytać — dwadzieścia telefonów pytających
    // w tle przez cały wieczór to ruch bez żadnej wartości.
    const naZmiane = () => (document.visibilityState === "visible" ? (void pobierz(), start()) : stop());
    document.addEventListener("visibilitychange", naZmiane);
    naZmiane();
    return () => {
      document.removeEventListener("visibilitychange", naZmiane);
      stop();
    };
  }, [pobierz]);

  const dolacz = async () => {
    setBlad(null);
    setTrwa(true);
    try {
      const odp = await fetch(`/api/pokoj/${kod}/dolacz`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, nazwa }),
      });
      const dane = await odp.json().catch(() => ({}));
      if (!odp.ok) throw new Error((dane as { error?: string }).error ?? `Błąd ${odp.status}.`);
      setStan(dane as StanGracza);
    } catch (e) {
      setBlad(
        (e as Error).message === "Failed to fetch"
          ? "Brak połączenia z serwerem."
          : (e as Error).message
      );
    } finally {
      setTrwa(false);
    }
  };

  const potwierdz = async () => {
    try {
      const odp = await fetch(`/api/pokoj/${kod}/widzialem`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (odp.ok) setStan((await odp.json()) as StanGracza);
    } catch {
      /* potwierdzenie doleci przy następnym odpytaniu */
    }
  };

  const dolaczony = !!stan?.ja;
  const karta = stan?.ja?.rola ?? null;

  if (zniknal) {
    return (
      <div className="w-full max-w-[380px] flex flex-col gap-4">
        <Card>
          <div className="text-center py-2">
            <div className="text-[15px] font-semibold">Ten pokój już nie istnieje</div>
            <p className="text-[13px] text-[var(--text-dim)] leading-relaxed mt-2">
              Prowadzący go zamknął albo minęła doba od założenia. Jeśli gracie dalej, poproś
              o nowy kod.
            </p>
          </div>
          <Button variant="primary" className="w-full justify-center mt-3" onClick={wyjdz}>
            Wpisz inny kod
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[380px] flex flex-col gap-4">
      <div className="text-center">
        <div className="text-[12.5px] text-[var(--text-dim)]">Pokój</div>
        <div className="font-mono font-bold tracking-[0.2em] text-[28px] leading-none mt-1">
          {kod}
        </div>
      </div>

      {!dolaczony ? (
        <Card>
          <div className="label-xs mb-1.5">Twoje imię</div>
          <input
            className={inputCls}
            value={nazwa}
            onChange={(e) => setNazwa(e.target.value.slice(0, MAKS_DLUGOSC_IMIENIA))}
            onKeyDown={(e) => e.key === "Enter" && !trwa && void dolacz()}
            placeholder="np. Kasia"
            maxLength={MAKS_DLUGOSC_IMIENIA}
            autoFocus
          />
          <p className="text-[12px] text-[var(--text-faint)] mt-1.5">
            Tak zobaczą cię pozostali. Najwyżej {MAKS_DLUGOSC_IMIENIA} znaków.
          </p>
          <Button
            variant="primary"
            className="w-full justify-center mt-3"
            disabled={nazwa.trim().length < 2 || trwa}
            onClick={() => void dolacz()}
          >
            {trwa ? "Dołączam…" : "Dołącz"}
          </Button>
          {blad && (
            <p className="text-[12.5px] mt-3" style={{ color: "var(--danger)" }}>
              {blad}
            </p>
          )}
        </Card>
      ) : karta ? (
        <>
          <KartaGracza
            roleId={karta}
            imie={stan!.ja!.nazwa}
            potwierdzone={stan!.ja!.widzial !== null}
            onPotwierdz={() => void potwierdz()}
          />
          <KartyWGrze sklad={stan!.sklad} ujawnieni={stan!.ujawnieni} />
        </>
      ) : (
        <Card>
          <div className="text-center">
            <div className="text-[15px] font-semibold">{stan!.ja!.nazwa}</div>
            <p className="text-[12.5px] text-[var(--text-dim)] mt-1">
              {stan!.ja!.miejsce === null
                ? "Jesteś w poczekalni. Prowadzący zaraz posadzi cię przy stole."
                : `Siedzisz na miejscu ${stan!.ja!.miejsce + 1}.`}
            </p>
          </div>

          <div className="mt-4 pt-4 border-t border-[var(--border)]">
            <div className="label-xs mb-2">
              Dołączyli ({stan!.imiona.length})
            </div>
            <div className="flex flex-wrap gap-1.5">
              {stan!.imiona.map((imie) => (
                <span
                  key={imie}
                  className="text-[12.5px] px-2 py-1 rounded-[6px] bg-[var(--surface-2)]"
                >
                  {imie}
                </span>
              ))}
            </div>
          </div>

          <p className="text-[12px] text-[var(--text-faint)] leading-relaxed mt-4">
            Zostaw tę stronę otwartą. Gdy prowadzący rozda karty, twoja pojawi się tutaj — najpierw
            zobaczysz ostrzeżenie, żeby nikt nie zerknął ci przez ramię.
          </p>
        </Card>
      )}

      <div className="text-center text-[12px] text-[var(--text-faint)]">
        <button type="button" onClick={wyjdz} className="underline">
          Wpisz inny kod
        </button>
        <span className="mx-2">·</span>
        <Link href="/manitou" className="underline">
          Prowadzę grę
        </Link>
      </div>
    </div>
  );
}
