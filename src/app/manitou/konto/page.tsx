"use client";

/** Konto: klucze urządzeń, a dla administratora także zarządzanie dostępem. */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Rola, Uzytkownik, useKonto } from "@/lib/konto";
import { Badge, Button, Card, Empty, inputCls } from "@/components/ui";

interface Zaproszenie {
  kod: string;
  rola: Rola;
  wygasa: number;
  zuzytePrzez: string | null;
}

const dataPl = (t: number) => new Date(t).toLocaleDateString("pl-PL");

export default function KontoPage() {
  const { uzytkownik, trybLokalny, dodajKlucz, wyloguj, odswiez } = useKonto();
  const router = useRouter();
  const [blad, setBlad] = useState<string | null>(null);
  const [konta, setKonta] = useState<Uzytkownik[]>([]);
  const [zaproszenia, setZaproszenia] = useState<Zaproszenie[]>([]);
  const [nowaRola, setNowaRola] = useState<Rola>("manitou");
  const [trwa, setTrwa] = useState(false);

  const admin = uzytkownik?.rola === "admin";

  const wczytajAdmina = useCallback(
    async (zyje: () => boolean = () => true) => {
      if (!admin) return;
      try {
        const odp = await fetch("/api/admin/konta", { credentials: "same-origin" });
        const dane = (await odp.json()) as { uzytkownicy: Uzytkownik[]; zaproszenia: Zaproszenie[] };
        if (odp.ok && zyje()) {
          setKonta(dane.uzytkownicy);
          setZaproszenia(dane.zaproszenia);
        }
      } catch {
        /* brak sieci — sekcja admina po prostu zostaje pusta */
      }
    },
    [admin]
  );

  useEffect(() => {
    // Odpowiedź może przyjść po opuszczeniu ekranu — wtedy nie ma czego ustawiać.
    let aktualne = true;
    // Reguła widzi setState wewnątrz wołanej funkcji, ale wykonuje się on
    // dopiero po `await fetch`, więc kaskady renderów tu nie ma.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void wczytajAdmina(() => aktualne);
    return () => {
      aktualne = false;
    };
  }, [wczytajAdmina]);

  const dzialaj = async (fn: () => Promise<unknown>) => {
    setBlad(null);
    setTrwa(true);
    try {
      await fn();
      await odswiez();
      await wczytajAdmina();
    } catch (e) {
      const m = (e as Error).message;
      setBlad(/NotAllowed|abort/i.test(m) ? "Przerwano." : m);
    } finally {
      setTrwa(false);
    }
  };

  const wyslij = (sciezka: string, metoda: string, cialo?: unknown) =>
    fetch(sciezka, {
      method: metoda,
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: cialo === undefined ? undefined : JSON.stringify(cialo),
    }).then(async (odp) => {
      const dane = await odp.json().catch(() => ({}));
      if (!odp.ok) throw new Error((dane as { error?: string }).error ?? `Błąd ${odp.status}.`);
      return dane;
    });

  if (!uzytkownik) {
    return (
      <Card title="Konto">
        <p className="text-[12.5px] text-[var(--text-dim)]">
          {trybLokalny
            ? "Pracujesz bez konta — gra jest zapisana wyłącznie na tym urządzeniu, a lobby jest niedostępne."
            : "Nie jesteś zalogowany."}
        </p>
        <Button
          variant="primary"
          className="mt-3"
          onClick={() => router.push("/manitou/logowanie")}
        >
          Zaloguj się
        </Button>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card
        title="Twoje konto"
        right={<Badge color={admin ? "var(--accent)" : undefined}>{uzytkownik.rola}</Badge>}
      >
        <div className="text-[13px] font-medium">{uzytkownik.nazwa}</div>
        <div className="text-[12.5px] text-[var(--text-dim)] mt-1">
          Klucze na urządzeniach: {uzytkownik.liczbaKluczy}
          {uzytkownik.kluczeZInnejDomeny > 0 && (
            <span style={{ color: "var(--warn)" }}>
              {" "}
              — w tym {uzytkownik.kluczeZInnejDomeny} z poprzedniej domeny, już nieczynne
            </span>
          )}
        </div>

        {uzytkownik.liczbaKluczy < 2 && (
          <p className="text-[12.5px] mt-3" style={{ color: "var(--warn)" }}>
            Masz tylko jeden klucz. Jeśli zgubisz to urządzenie, stracisz dostęp do konta — dodaj
            drugi na innym sprzęcie.
          </p>
        )}

        <div className="flex items-center gap-2 mt-3">
          <Button variant="primary" disabled={trwa} onClick={() => dzialaj(dodajKlucz)}>
            Dodaj klucz z tego urządzenia
          </Button>
          <Button
            disabled={trwa}
            onClick={() =>
              dzialaj(async () => {
                await wyloguj();
                router.replace("/manitou/logowanie");
              })
            }
          >
            Wyloguj
          </Button>
        </div>

        {blad && (
          <p className="text-[12.5px] mt-3" style={{ color: "var(--danger)" }}>
            {blad}
          </p>
        )}
      </Card>

      {admin && (
        <>
          <Card
            title="Kody rejestracyjne"
            right={
              <div className="flex items-center gap-2">
                <select
                  className={inputCls}
                  style={{ width: "auto" }}
                  value={nowaRola}
                  onChange={(e) => setNowaRola(e.target.value as Rola)}
                >
                  <option value="manitou">Manitou</option>
                  <option value="admin">Administrator</option>
                </select>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={trwa}
                  onClick={() =>
                    dzialaj(() => wyslij("/api/admin/zaproszenie", "POST", { rola: nowaRola }))
                  }
                >
                  Wystaw kod
                </Button>
              </div>
            }
          >
            {zaproszenia.length === 0 ? (
              <Empty>Brak wystawionych kodów.</Empty>
            ) : (
              <div className="flex flex-col gap-1.5">
                {zaproszenia.map((z) => (
                  <div key={z.kod} className="ui-row flex items-center gap-3 text-[12.5px]">
                    <code className="font-mono tracking-wide">{z.kod}</code>
                    <Badge>{z.rola}</Badge>
                    <span className="text-[var(--text-faint)]">
                      {z.zuzytePrzez ? "wykorzystany" : `ważny do ${dataPl(z.wygasa)}`}
                    </span>
                    {!z.zuzytePrzez && (
                      <Button
                        size="sm"
                        className="ml-auto"
                        disabled={trwa}
                        onClick={() =>
                          dzialaj(() => wyslij("/api/admin/zaproszenie", "DELETE", { kod: z.kod }))
                        }
                      >
                        Unieważnij
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <p className="text-[12px] text-[var(--text-faint)] mt-3">
              Kod jest jednorazowy i ważny czternaście dni. Bez kodu nikt nie założy konta, więc
              adres strony może krążyć swobodnie.
            </p>
          </Card>

          <Card title="Konta">
            <div className="flex flex-col gap-1.5">
              {konta.map((u) => (
                <div key={u.id} className="ui-row flex items-center gap-3 text-[12.5px]">
                  <span className="font-medium">{u.nazwa}</span>
                  <Badge color={u.rola === "admin" ? "var(--accent)" : undefined}>{u.rola}</Badge>
                  <span className="text-[var(--text-faint)]">
                    {u.liczbaKluczy} {u.liczbaKluczy === 1 ? "klucz" : "kluczy"}
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    <Button
                      size="sm"
                      disabled={trwa}
                      onClick={() =>
                        dzialaj(() => wyslij("/api/admin/klucze", "DELETE", { uzytkownik: u.id }))
                      }
                    >
                      Unieważnij klucze
                    </Button>
                    {u.id !== uzytkownik.id && (
                      <Button
                        size="sm"
                        disabled={trwa}
                        onClick={() =>
                          dzialaj(() => wyslij("/api/admin/konto", "DELETE", { uzytkownik: u.id }))
                        }
                      >
                        Usuń
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-[var(--border)]">
              <Button
                disabled={trwa}
                onClick={() => {
                  if (!confirm("Unieważnić klucze wszystkich kont? Konta zostaną, ale każdy będzie musiał zapisać klucz od nowa.")) return;
                  void dzialaj(() => wyslij("/api/admin/klucze", "DELETE", {}));
                }}
              >
                Unieważnij klucze wszystkich
              </Button>
              <p className="text-[12px] text-[var(--text-faint)] mt-2 leading-relaxed">
                Potrzebne po zmianie domeny: passkeye są z nią związane i po przeprowadzce
                przestają działać. Konta zostają — wystarczy rozesłać świeże kody.
              </p>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
