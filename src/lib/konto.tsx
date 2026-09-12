"use client";

/**
 * Konto Manitou po stronie przeglądarki.
 *
 * Sesja siedzi w ciasteczku HttpOnly, więc JavaScript jej nie widzi — stan
 * konta bierzemy z `/api/auth/stan`. Aplikacja ma działać także bez sieci
 * i bez konta, dlatego brak połączenia nie jest tu błędem, tylko trybem
 * offline: konsola działa dalej, niedostępne jest wyłącznie lobby.
 */

import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";

export type Rola = "admin" | "manitou";

export interface Uzytkownik {
  id: string;
  nazwa: string;
  rola: Rola;
  utworzono: number;
  liczbaKluczy: number;
  kluczeZInnejDomeny: number;
}

/** Czy serwer jest w zasięgu i co o nas wie. */
export type StanPolaczenia = "sprawdzanie" | "online" | "offline" | "niedostepny";

interface Ctx {
  uzytkownik: Uzytkownik | null;
  /**
   * Świadoma zgoda na pracę bez konta.
   *
   * Konsola musi działać przy ognisku bez zasięgu, więc brak sesji nie może
   * blokować wejścia — ale wybór ma być jawny, żeby nikt nie prowadził gry
   * offline w przekonaniu, że lobby działa.
   */
  trybLokalny: boolean;
  ustawTrybLokalny: (v: boolean) => void;
  /**
   * Czy funkcje sieciowe są w ogóle dostępne — czyli czy jest konto.
   *
   * Nie ma osobnego przełącznika: lobby pokazuje się zawsze, a bez konta jego
   * przyciski są po prostu nieczynne i mówią dlaczego. Przełącznik, który
   * trzeba znaleźć i kliknąć, żeby cokolwiek zadziałało, tylko mylił.
   */
  trybOnline: boolean;
  /** Prawda, dopóki nie istnieje ani jedno konto — trwa tryb bootstrapowy. */
  pusto: boolean;
  polaczenie: StanPolaczenia;
  /** Powód, dla którego serwer odmawia obsługi (np. zła konfiguracja RP_ID). */
  powodNiedostepnosci: string | null;
  odswiez: () => Promise<void>;
  zaloguj: () => Promise<void>;
  zarejestruj: (kod: string, nazwa: string) => Promise<void>;
  dodajKlucz: () => Promise<void>;
  wyloguj: () => Promise<void>;
}

const KontoCtx = createContext<Ctx | null>(null);

const KLUCZ_TRYBU = "ktulu.tryb.lokalny";

/**
 * Wybór trybu trzymamy poza Reactem i czytamy synchronicznie.
 *
 * Jest to potrzebne, żeby ktoś, kto raz zdecydował się prowadzić grę bez
 * konta, wchodził na pulpit od razu — bez czekania, aż odpowie serwer.
 * Przy ognisku bez zasięgu to różnica między działającą aplikacją a ekranem
 * „Sprawdzanie konta…” wiszącym do timeoutu.
 */
const sluchacze = new Set<() => void>();

function subskrybujTryb(cb: () => void): () => void {
  sluchacze.add(cb);
  return () => {
    sluchacze.delete(cb);
  };
}

function odczytajTryb(): boolean {
  try {
    return localStorage.getItem(KLUCZ_TRYBU) === "1";
  } catch {
    return false;
  }
}

function zapiszTryb(lokalny: boolean): void {
  try {
    if (lokalny) localStorage.setItem(KLUCZ_TRYBU, "1");
    else localStorage.removeItem(KLUCZ_TRYBU);
  } catch {
    /* wybór przepadnie po odświeżeniu, ale sesja działa */
  }
  for (const cb of sluchacze) cb();
}

/** Ile czekamy na serwer, zanim uznamy, że jesteśmy offline. */
const LIMIT_SPRAWDZENIA_MS = 3500;

/** Rzuca wyjątkiem z komunikatem serwera, żeby ekran mógł go pokazać wprost. */
async function api<T>(sciezka: string, opcje: RequestInit = {}): Promise<T> {
  const odp = await fetch(sciezka, {
    ...opcje,
    headers: { "content-type": "application/json", ...(opcje.headers ?? {}) },
    credentials: "same-origin",
  });
  const dane = await odp.json().catch(() => ({}));
  if (!odp.ok) throw new Error((dane as { error?: string }).error ?? `Błąd ${odp.status}.`);
  return dane as T;
}

export function KontoProvider({ children }: { children: React.ReactNode }) {
  const [uzytkownik, setUzytkownik] = useState<Uzytkownik | null>(null);
  const [pusto, setPusto] = useState(false);
  const [polaczenie, setPolaczenie] = useState<StanPolaczenia>("sprawdzanie");
  const [powodNiedostepnosci, setPowod] = useState<string | null>(null);
  const trybLokalny = useSyncExternalStore(subskrybujTryb, odczytajTryb, () => false);

  const odswiez = useCallback(async () => {
    try {
      const odp = await fetch("/api/auth/stan", {
        credentials: "same-origin",
        // Bez limitu zawieszona sieć (portal hotelowy, słabe wifi) trzymałaby
        // pulpit na ekranie ładowania w nieskończoność.
        signal: AbortSignal.timeout(LIMIT_SPRAWDZENIA_MS),
      });
      const dane = (await odp.json().catch(() => ({}))) as {
        pusto?: boolean;
        uzytkownik?: Uzytkownik | null;
        powod?: string;
        error?: string;
      };
      if (odp.status === 503) {
        // Serwer żyje, ale nie jest skonfigurowany — to inny przypadek niż brak sieci.
        setPolaczenie("niedostepny");
        setPowod(dane.powod ?? dane.error ?? "Serwer nie jest skonfigurowany.");
        setUzytkownik(null);
        return;
      }
      if (!odp.ok) throw new Error(dane.error ?? `Błąd ${odp.status}.`);
      setPolaczenie("online");
      setPowod(null);
      setPusto(!!dane.pusto);
      setUzytkownik(dane.uzytkownik ?? null);
    } catch {
      // Brak sieci nie jest awarią: konsola działa offline, lobby nie.
      setPolaczenie("offline");
      setPowod(null);
      setUzytkownik(null);
    }
  }, []);

  useEffect(() => {
    // Reguła widzi setState wewnątrz wołanej funkcji, ale wykonuje się on
    // dopiero po `await fetch`, więc kaskady renderów tu nie ma.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void odswiez();
  }, [odswiez]);

  const ustawTrybLokalny = useCallback((v: boolean) => {
    zapiszTryb(v);
  }, []);

  const zaloguj = useCallback(async () => {
    const opcje = await api<Parameters<typeof startAuthentication>[0]["optionsJSON"]>(
      "/api/auth/logowanie/start",
      { method: "POST", body: "{}" }
    );
    const odpowiedz = await startAuthentication({ optionsJSON: opcje });
    const wynik = await api<{ uzytkownik: Uzytkownik }>("/api/auth/logowanie/koniec", {
      method: "POST",
      body: JSON.stringify({ odpowiedz }),
    });
    setUzytkownik(wynik.uzytkownik);
    setPolaczenie("online");
    zapiszTryb(false);
  }, []);

  const zarejestruj = useCallback(async (kod: string, nazwa: string) => {
    const opcje = await api<Parameters<typeof startRegistration>[0]["optionsJSON"]>(
      "/api/auth/rejestracja/start",
      { method: "POST", body: JSON.stringify({ kod, nazwa }) }
    );
    const odpowiedz = await startRegistration({ optionsJSON: opcje });
    const wynik = await api<{ uzytkownik: Uzytkownik }>("/api/auth/rejestracja/koniec", {
      method: "POST",
      body: JSON.stringify({ odpowiedz }),
    });
    setUzytkownik(wynik.uzytkownik);
    setPusto(false);
    setPolaczenie("online");
    zapiszTryb(false);
  }, []);

  const dodajKlucz = useCallback(async () => {
    const opcje = await api<Parameters<typeof startRegistration>[0]["optionsJSON"]>(
      "/api/auth/klucz/start",
      { method: "POST", body: "{}" }
    );
    const odpowiedz = await startRegistration({ optionsJSON: opcje });
    const wynik = await api<{ uzytkownik: Uzytkownik }>("/api/auth/klucz/koniec", {
      method: "POST",
      body: JSON.stringify({ odpowiedz }),
    });
    setUzytkownik(wynik.uzytkownik);
  }, []);

  const wyloguj = useCallback(async () => {
    await fetch("/api/auth/wyloguj", { method: "POST", credentials: "same-origin" }).catch(() => {});
    setUzytkownik(null);
    // Po wylogowaniu konsola ma dalej działać, tylko bez lobby.
    zapiszTryb(true);
  }, []);

  return (
    <KontoCtx.Provider
      value={{
        uzytkownik,
        pusto,
        polaczenie,
        powodNiedostepnosci,
        trybLokalny,
        ustawTrybLokalny,
        trybOnline: !!uzytkownik,
        odswiez,
        zaloguj,
        zarejestruj,
        dodajKlucz,
        wyloguj,
      }}
    >
      {children}
    </KontoCtx.Provider>
  );
}

export function useKonto(): Ctx {
  const c = useContext(KontoCtx);
  if (!c) throw new Error("useKonto poza KontoProvider");
  return c;
}

/**
 * Czy przeglądarka w ogóle umie passkeye.
 *
 * To informacja o środowisku, nie stan Reacta, więc czytamy ją przez
 * useSyncExternalStore. Wartość dla serwera jest optymistyczna: przy eksporcie
 * statycznym `window` nie istnieje, a mignięcie ostrzeżenia „brak obsługi”
 * u kogoś, kto obsługę ma, byłoby gorsze niż jego brak.
 */
const bezZmian = () => () => {};

export function usePasskeye(): boolean {
  return useSyncExternalStore(
    bezZmian,
    () => typeof window !== "undefined" && !!window.PublicKeyCredential,
    () => true
  );
}
