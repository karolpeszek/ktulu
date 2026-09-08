"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useKonto, usePasskeye } from "@/lib/konto";
import { Button, Card, inputCls } from "@/components/ui";
import { DLUGOSC_KODU_REJESTRACJI, pogrupuj, rdzenKodu, sprawdzKodRejestracji } from "@/lib/kody";

export default function RejestracjaPage() {
  const { uzytkownik, pusto, polaczenie, zarejestruj } = useKonto();
  const router = useRouter();
  const [kod, setKod] = useState("");
  const [nazwa, setNazwa] = useState("");
  const [blad, setBlad] = useState<string | null>(null);
  const [trwa, setTrwa] = useState(false);
  const umiePasskeye = usePasskeye();

  useEffect(() => {
    if (uzytkownik) router.replace("/manitou");
  }, [uzytkownik, router]);

  // Kod wpisuje się z kartki albo z logu builda, więc formatujemy w locie:
  // wielkie litery i myślniki co cztery znaki.
  const przepisz = (surowe: string) => {
    const rdzen = rdzenKodu(surowe).slice(0, DLUGOSC_KODU_REJESTRACJI);
    setKod(pogrupuj(rdzen, 4));
  };

  const sprawdzenie = sprawdzKodRejestracji(kod);
  const gotowe = sprawdzenie.ok && nazwa.trim().length >= 2 && polaczenie === "online";

  const wyslij = async () => {
    setBlad(null);
    setTrwa(true);
    try {
      await zarejestruj(kod, nazwa.trim());
      router.replace("/manitou");
    } catch (e) {
      const m = (e as Error).message;
      setBlad(/NotAllowed|abort/i.test(m) ? "Rejestracja została przerwana." : m);
    } finally {
      setTrwa(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center p-4">
      <div className="w-full max-w-[420px] flex flex-col gap-4">
        <div className="text-center">
          <div className="text-[15px] font-semibold">Nowe konto Manitou</div>
          <div className="text-[12.5px] text-[var(--text-dim)] mt-1">
            {pusto
              ? "Pierwsze konto zakłada się kodem z logu builda."
              : "Potrzebny jest kod rejestracyjny od administratora."}
          </div>
        </div>

        <Card>
          <div className="label-xs mb-1.5">Kod rejestracyjny</div>
          <input
            className={inputCls}
            value={kod}
            onChange={(e) => przepisz(e.target.value)}
            placeholder="XXXX-XXXX-XXXX"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            inputMode="text"
          />
          {kod && !sprawdzenie.ok && (
            <p className="text-[12px] mt-1.5" style={{ color: "var(--warn)" }}>
              {sprawdzenie.powod}
            </p>
          )}

          <div className="label-xs mb-1.5 mt-3">Nazwa konta</div>
          <input
            className={inputCls}
            value={nazwa}
            onChange={(e) => setNazwa(e.target.value.slice(0, 32))}
            placeholder="np. Karol"
            autoComplete="username"
          />

          {!umiePasskeye && (
            <p className="text-[12.5px] mt-3" style={{ color: "var(--warn)" }}>
              Ta przeglądarka nie obsługuje kluczy dostępu, więc konta nie da się tu założyć.
            </p>
          )}
          {polaczenie !== "online" && (
            <p className="text-[12.5px] mt-3" style={{ color: "var(--warn)" }}>
              Rejestracja wymaga połączenia z serwerem.
            </p>
          )}

          <Button
            variant="primary"
            disabled={!gotowe || trwa || !umiePasskeye}
            onClick={wyslij}
            className="w-full justify-center mt-4"
          >
            {trwa ? "Czekam na klucz…" : "Załóż konto i zapisz klucz"}
          </Button>

          {blad && (
            <p className="text-[12.5px] mt-3" style={{ color: "var(--danger)" }}>
              {blad}
            </p>
          )}

          <p className="text-[12px] text-[var(--text-faint)] leading-relaxed mt-3">
            Klucz zapisuje się na tym urządzeniu. Zaraz po założeniu konta warto dodać drugi na
            innym sprzęcie — passkey ginie razem z telefonem.
          </p>
        </Card>

        <div className="text-center text-[12px] text-[var(--text-faint)]">
          <Link href="/manitou/logowanie" className="underline">
            Mam już konto
          </Link>
        </div>
      </div>
    </div>
  );
}
