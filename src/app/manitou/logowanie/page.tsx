"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useKonto, usePasskeye } from "@/lib/konto";
import { Button, Card } from "@/components/ui";

export default function LogowaniePage() {
  const { uzytkownik, pusto, polaczenie, powodNiedostepnosci, zaloguj, ustawTrybLokalny } = useKonto();
  const router = useRouter();
  const [blad, setBlad] = useState<string | null>(null);
  const [trwa, setTrwa] = useState(false);
  const umiePasskeye = usePasskeye();

  useEffect(() => {
    if (uzytkownik) router.replace("/manitou");
  }, [uzytkownik, router]);

  const online = polaczenie === "online";

  const sprobuj = async () => {
    setBlad(null);
    setTrwa(true);
    try {
      await zaloguj();
      router.replace("/manitou");
    } catch (e) {
      const m = (e as Error).message;
      // Odmowa użytkownika w oknie systemowym to nie awaria — nie strasz go.
      setBlad(/NotAllowed|abort/i.test(m) ? "Logowanie zostało przerwane." : m);
    } finally {
      setTrwa(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center p-4">
      <div className="w-full max-w-[420px] flex flex-col gap-4">
        <div className="text-center">
          <div className="text-[15px] font-semibold">Pulpit Manitou</div>
          <div className="text-[12.5px] text-[var(--text-dim)] mt-1">
            Logowanie kluczem urządzenia — bez hasła.
          </div>
        </div>

        <Card>
          {polaczenie === "niedostepny" && (
            <p className="text-[12.5px] mb-3" style={{ color: "var(--danger)" }}>
              Serwer nie jest poprawnie skonfigurowany: {powodNiedostepnosci}
            </p>
          )}
          {polaczenie === "offline" && (
            <p className="text-[12.5px] mb-3 text-[var(--text-dim)]">
              Brak połączenia z serwerem. Zalogować się nie da, ale prowadzenie gry na tym
              urządzeniu działa bez konta.
            </p>
          )}
          {!umiePasskeye && (
            <p className="text-[12.5px] mb-3" style={{ color: "var(--warn)" }}>
              Ta przeglądarka nie obsługuje kluczy dostępu. Na iPadzie w trybie lockdown trzeba go
              wyłączyć dla tej strony.
            </p>
          )}

          <Button
            variant="primary"
            disabled={!online || trwa || !umiePasskeye}
            onClick={sprobuj}
            className="w-full justify-center"
          >
            {trwa ? "Czekam na klucz…" : "Zaloguj kluczem"}
          </Button>

          {blad && (
            <p className="text-[12.5px] mt-3" style={{ color: "var(--danger)" }}>
              {blad}
            </p>
          )}

          <div className="mt-4 pt-4 border-t border-[var(--border)] flex flex-col gap-2">
            {/* Bez konta wolno prowadzić grę, tylko lobby jest wtedy niedostępne. */}
            <Button
              onClick={() => {
                ustawTrybLokalny(true);
                router.replace("/manitou");
              }}
              className="w-full justify-center"
            >
              Kontynuuj offline, bez logowania
            </Button>
            <p className="text-[12px] text-[var(--text-faint)] leading-relaxed">
              Wszystko poza lobby działa bez konta: przydział ról, noce, dzień, karteczki do druku.
              Gra jest wtedy zapisana wyłącznie na tym urządzeniu.
            </p>
          </div>

          <div className="mt-4 pt-4 border-t border-[var(--border)] text-[12.5px] text-[var(--text-dim)]">
            {pusto ? (
              <>
                Nie ma jeszcze żadnego konta.{" "}
                <Link href="/manitou/rejestracja" className="text-[var(--accent)] underline">
                  Załóż konto administratora
                </Link>{" "}
                kodem z logu builda.
              </>
            ) : (
              <>
                Masz kod rejestracyjny?{" "}
                <Link href="/manitou/rejestracja" className="text-[var(--accent)] underline">
                  Załóż konto
                </Link>
                .
              </>
            )}
          </div>
        </Card>

        <div className="text-center text-[12px] text-[var(--text-faint)]">
          <Link href="/" className="underline">
            Jestem graczem, mam kod pokoju
          </Link>
        </div>
      </div>
    </div>
  );
}
