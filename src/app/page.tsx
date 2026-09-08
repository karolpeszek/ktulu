"use client";

/**
 * Ekran gracza — pierwsze, co widzi ktoś, kto wejdzie na adres z kartki.
 *
 * Celowo bez nawigacji Manitou: gracz ma tu jedną rzecz do zrobienia.
 * Prowadzący wchodzi na swój pulpit przyciskiem w prawym górnym rogu.
 */

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Button, Card } from "@/components/ui";
import PolaKodu from "@/components/PolaKodu";
import Poczekalnia from "@/components/Poczekalnia";
import { DLUGOSC_KODU_POKOJU, rdzenKodu, sprawdzKodPokoju } from "@/lib/kody";

/**
 * Kod z adresu czytany bez `useSearchParams`.
 *
 * Ten hook wymusza granicę Suspense, przez którą przy eksporcie statycznym
 * w gotowym HTML-u ląduje sam fallback — a to jest pierwszy ekran, jaki widzi
 * gracz. Odczyt spoza Reacta pozwala wyeksportować gotowy formularz.
 */
const bezZmian = (cb: () => void) => {
  window.addEventListener("popstate", cb);
  return () => window.removeEventListener("popstate", cb);
};

function useKodZAdresu(): string {
  return useSyncExternalStore(
    bezZmian,
    () => new URLSearchParams(window.location.search).get("k") ?? "",
    () => ""
  );
}

function Formularz({ onWejscie }: { onWejscie: (kod: string) => void }) {
  const zAdresu = useKodZAdresu();
  const [wpisane, setWpisane] = useState<string | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [trwa, setTrwa] = useState(false);

  // Kod z linku albo z kodu QR pokazanego przez Manitou wypełnia pole sam.
  // Wartość jest wyliczana, a nie kopiowana efektem: dopóki nikt nic nie
  // wpisał, obowiązuje ta z adresu, a pierwsze naciśnięcie klawisza ją zastępuje.
  const zLinku = rdzenKodu(zAdresu).slice(0, DLUGOSC_KODU_POKOJU);
  const kod = wpisane ?? zLinku;
  const setKod = setWpisane;

  const sprawdzenie = sprawdzKodPokoju(kod);

  const dolacz = async (podany?: string) => {
    const wynik = podany ? sprawdzKodPokoju(podany) : sprawdzenie;
    if (!wynik.ok) return;
    setBlad(null);
    setTrwa(true);
    try {
      const odp = await fetch(`/api/pokoj/${wynik.kod}`);
      const dane = (await odp.json().catch(() => ({}))) as { istnieje?: boolean; error?: string };
      if (!odp.ok) throw new Error(dane.error ?? `Błąd ${odp.status}.`);
      if (!dane.istnieje) {
        setBlad("Nie ma pokoju o tym kodzie. Sprawdź, czy przepisany jest dokładnie.");
        return;
      }
      onWejscie(wynik.kod);
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

  return (
    <Card>
      <div className="label-xs mb-2 text-center">Kod pokoju</div>
      <PolaKodu
        dlugosc={DLUGOSC_KODU_POKOJU}
        wartosc={kod}
        onChange={setKod}
        // Po ostatnim znaku nie ma na co czekać — sprawdzamy od razu.
        onKomplet={(v) => dolacz(v)}
        autoFocus
      />
      {kod.length === DLUGOSC_KODU_POKOJU && !sprawdzenie.ok && (
        <p className="text-[12px] mt-2 text-center" style={{ color: "var(--warn)" }}>
          {sprawdzenie.powod}
        </p>
      )}

      <Button
        variant="primary"
        className="w-full justify-center mt-4"
        disabled={!sprawdzenie.ok || trwa}
        onClick={() => dolacz()}
      >
        {trwa ? "Sprawdzam…" : "Dołącz do gry"}
      </Button>

      {blad && (
        <p className="text-[12.5px] mt-3" style={{ color: "var(--danger)" }}>
          {blad}
        </p>
      )}

      <p className="text-[12px] text-[var(--text-faint)] leading-relaxed mt-3">
        Kod podaje prowadzący. Kody nie zawierają zera, litery O, jedynki, I ani L — jeśli widzisz
        coś takiego, to na pewno inny znak. Pola przyjmują też wklejony kod w całości.
      </p>
    </Card>
  );
}

export default function EkranGracza() {
  // Kod trzymamy w stanie strony, żeby „wpisz inny kod” wracało do formularza
  // bez przeładowania i bez gubienia tożsamości zapisanej dla pokoju.
  const [wPokoju, setWPokoju] = useState<string | null>(null);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-12 shrink-0 flex items-center px-4">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-[5px] bg-[var(--accent)] grid place-items-center text-[11px] font-bold text-[var(--accent-text)]">
            K
          </span>
          <span className="text-[13px] font-semibold tracking-tight">Ktulu</span>
        </div>
        <Link
          href="/manitou"
          className="ml-auto text-[12.5px] text-[var(--text-dim)] hover:text-[var(--text)] underline"
        >
          Prowadzę grę
        </Link>
      </header>

      <div className="flex-1 grid place-items-center p-4">
        {wPokoju ? (
          <Poczekalnia kod={wPokoju} wyjdz={() => setWPokoju(null)} />
        ) : (
        <div className="w-full max-w-[380px] flex flex-col gap-4">
          <div className="text-center">
            <div className="text-[15px] font-semibold">Dołącz do rozgrywki</div>
            <div className="text-[12.5px] text-[var(--text-dim)] mt-1">
              Wpisz kod, który podał prowadzący.
            </div>
          </div>
          <Formularz onWejscie={setWPokoju} />
        </div>
        )}
      </div>
    </div>
  );
}
