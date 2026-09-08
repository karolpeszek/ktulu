"use client";

/**
 * Ekran gracza — pierwsze, co widzi ktoś, kto wejdzie na adres z kartki.
 *
 * Celowo bez nawigacji Manitou: gracz ma tu jedną rzecz do zrobienia.
 * Prowadzący wchodzi na swój pulpit przyciskiem w prawym górnym rogu.
 */

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button, Card, inputCls } from "@/components/ui";
import { DLUGOSC_KODU_POKOJU, PREFIKS_POKOJU, rdzenKodu, sprawdzKodPokoju } from "@/lib/kody";

function Formularz() {
  const parametry = useSearchParams();
  const [wpisane, setWpisane] = useState<string | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [trwa, setTrwa] = useState(false);

  // Kod z linku albo z kodu QR pokazanego przez Manitou wypełnia pole sam.
  // Wartość jest wyliczana, a nie kopiowana efektem: dopóki nikt nic nie
  // wpisał, obowiązuje ta z adresu, a pierwsze naciśnięcie klawisza ją zastępuje.
  const zLinku = rdzenKodu(parametry.get("k") ?? "").slice(0, DLUGOSC_KODU_POKOJU);
  const kod = wpisane ?? zLinku;
  const setKod = setWpisane;

  const sprawdzenie = sprawdzKodPokoju(kod);

  const dolacz = async () => {
    if (!sprawdzenie.ok) return;
    setBlad(null);
    setTrwa(true);
    try {
      const odp = await fetch(`/api/pokoj/${sprawdzenie.kod}`);
      const dane = (await odp.json().catch(() => ({}))) as { istnieje?: boolean; error?: string };
      if (!odp.ok) throw new Error(dane.error ?? `Błąd ${odp.status}.`);
      if (!dane.istnieje) {
        setBlad("Nie ma pokoju o tym kodzie. Sprawdź, czy przepisany jest dokładnie.");
        return;
      }
      // Dołączanie powstaje w kolejnym kroku — na razie kod jest tylko sprawdzany.
      setBlad("Pokój istnieje, ale dołączanie nie jest jeszcze uruchomione.");
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
      <div className="label-xs mb-1.5">Kod pokoju</div>
      <div className="flex items-stretch gap-2">
        <span className="grid place-items-center px-3 rounded-[6px] bg-[var(--surface-2)] border border-[var(--border)] text-[13px] text-[var(--text-dim)] font-mono shrink-0">
          {PREFIKS_POKOJU}-
        </span>
        <input
          className={inputCls}
          value={kod}
          onChange={(e) => setKod(rdzenKodu(e.target.value).slice(0, DLUGOSC_KODU_POKOJU))}
          onKeyDown={(e) => e.key === "Enter" && dolacz()}
          placeholder="XXXX"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          autoFocus
        />
      </div>
      {kod && !sprawdzenie.ok && (
        <p className="text-[12px] mt-1.5" style={{ color: "var(--warn)" }}>
          {sprawdzenie.powod}
        </p>
      )}

      <Button
        variant="primary"
        className="w-full justify-center mt-3"
        disabled={!sprawdzenie.ok || trwa}
        onClick={dolacz}
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
        coś takiego, to na pewno inny znak.
      </p>
    </Card>
  );
}

export default function EkranGracza() {
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
        <div className="w-full max-w-[380px] flex flex-col gap-4">
          <div className="text-center">
            <div className="text-[15px] font-semibold">Dołącz do rozgrywki</div>
            <div className="text-[12.5px] text-[var(--text-dim)] mt-1">
              Wpisz kod, który podał prowadzący.
            </div>
          </div>
          {/* useSearchParams wymaga granicy Suspense przy eksporcie statycznym. */}
          <Suspense fallback={<Card>Wczytywanie…</Card>}>
            <Formularz />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
