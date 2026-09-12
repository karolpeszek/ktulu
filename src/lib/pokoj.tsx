"use client";

/**
 * Pokój gry po stronie prowadzącego.
 *
 * Stan przychodzi WebSocketem, bo Manitou musi widzieć wchodzących na żywo.
 * Połączenie samo się wznawia — telefon albo iPad usypia ekran i zrywa je
 * przy każdym odłożeniu urządzenia, a to zdarza się w trakcie zapisów ciągle.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { EtapPokoju } from "./lobby";

export interface GraczWPokoju {
  id: string;
  nazwa: string;
  dolaczyl: number;
  miejsce: number | null;
  /** Czy ma już wydaną kartę. Samej karty prowadzący stąd nie dostaje. */
  maKarte: boolean;
  /** Kiedy potwierdził, że ją obejrzał. */
  widzial: number | null;
  /** Czy jego karta została odkryta po śmierci. */
  ujawniony: boolean;
}

export type PoziomAsysty = "odczyt" | "zapis";

export interface Wspolprowadzacy {
  uzytkownik: string;
  nazwa: string;
  poziom: PoziomAsysty;
  dolaczyl: number;
}

export interface ZaproszenieAsysty {
  kod: string;
  poziom: PoziomAsysty;
  wygasa: number;
  zuzytePrzez: string | null;
}

/** Prośba asystenta czekająca na decyzję głównego prowadzącego. */
export interface Zadanie {
  id: string;
  od: string;
  odNazwa: string;
  opis: string[];
  utworzono: number;
  bazowaWersja: number;
}

export interface StanPokoju {
  kod: string;
  etap: EtapPokoju;
  utworzono: number;
  wygasa: number;
  gracze: GraczWPokoju[];
  wspolprowadzacy: Wspolprowadzacy[];
  zaproszeniaAsysty: ZaproszenieAsysty[];
  zadania: Zadanie[];
  wersjaMigawki: number;
}

export type StanPolaczeniaPokoju = "rozlaczony" | "laczenie" | "polaczony";

const KLUCZ_POKOJU = "ktulu.pokoj.kod";

/**
 * Kod pokoju czytany synchronicznie spoza Reacta.
 *
 * Dzięki temu powrót na pulpit po odświeżeniu strony od razu wie, do którego
 * pokoju wracać — bez migania stanem „brak pokoju” i bez kopiowania wartości
 * z pamięci przeglądarki efektem.
 */
const sluchacze = new Set<() => void>();

function subskrybuj(cb: () => void): () => void {
  sluchacze.add(cb);
  return () => {
    sluchacze.delete(cb);
  };
}

function zapamietanyKod(): string | null {
  try {
    return localStorage.getItem(KLUCZ_POKOJU);
  } catch {
    return null;
  }
}

function zapamietaj(kod: string | null): void {
  try {
    if (kod) localStorage.setItem(KLUCZ_POKOJU, kod);
    else localStorage.removeItem(KLUCZ_POKOJU);
  } catch {
    /* pokój przepadnie po odświeżeniu, ale działa dalej */
  }
  for (const cb of sluchacze) cb();
}

async function api<T>(sciezka: string, opcje: RequestInit = {}): Promise<T> {
  const odp = await fetch(sciezka, {
    ...opcje,
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...(opcje.headers ?? {}) },
  });
  const dane = await odp.json().catch(() => ({}));
  if (!odp.ok) throw new Error((dane as { error?: string }).error ?? `Błąd ${odp.status}.`);
  return dane as T;
}

/**
 * Nowa runda w zapamiętanym pokoju, bez otwierania WebSocketa.
 *
 * Wołane z ekranu końca gry, gdzie podgląd na żywo nie jest do niczego
 * potrzebny — byłoby marnotrawstwem trzymać dla tego jednego żądania
 * osobne połączenie.
 */
export async function nowaRundaWZapamietanym(): Promise<void> {
  const kod = zapamietanyKod();
  if (!kod) return;
  await api(`/api/pokoj/${kod}/nowa-runda`, { method: "POST", body: "{}" });
}

/**
 * Ujawnia karty zmarłych w zapamiętanym pokoju, bez otwierania WebSocketa.
 *
 * Wołane z ekranu rozgrywki, gdzie podgląd na żywo nie jest potrzebny —
 * prowadzący patrzy tam na własny stan gry, nie na pokój.
 */
export async function ujawnijWZapamietanym(gracze: string[]): Promise<void> {
  const kod = zapamietanyKod();
  if (!kod || gracze.length === 0) return;
  await api(`/api/pokoj/${kod}/ujawnij`, {
    method: "POST",
    body: JSON.stringify({ gracze }),
  });
}

/** Stan pokoju na żądanie, bez podglądu na żywo. Null, gdy gra idzie bez lobby. */
export async function stanZZapamietanego(): Promise<StanPokoju | null> {
  const kod = zapamietanyKod();
  if (!kod) return null;
  try {
    return await api<StanPokoju>(`/api/pokoj/${kod}/manitou`);
  } catch {
    return null;
  }
}

export interface Pokoj {
  stan: StanPokoju | null;
  polaczenie: StanPolaczeniaPokoju;
  blad: string | null;
  zaloz: () => Promise<void>;
  porzuc: () => void;
  zamknijNaZawsze: () => Promise<void>;
  usadz: (gracz: string, miejsce: number | null) => Promise<void>;
  przemianuj: (gracz: string, nazwa: string) => Promise<void>;
  wyrzuc: (gracz: string) => Promise<void>;
  ustawEtap: (etap: EtapPokoju) => Promise<void>;
  rozdaj: (przypisania: { gracz: string; rola: string }[]) => Promise<void>;
  nowaRunda: () => Promise<void>;
  ujawnij: (gracze: string[]) => Promise<void>;
  zaproszenieAsysty: (poziom: PoziomAsysty) => Promise<string | null>;
  cofnijZaproszenieAsysty: (kod: string) => Promise<void>;
  odbierzAsyste: (uzytkownik: string) => Promise<void>;
}

/**
 * Jeden pokój na cały pulpit.
 *
 * Podgląd na żywo to otwarte połączenie, więc trzyma go kontekst, a nie każdy
 * ekran z osobna — inaczej przejście między przygotowaniem a rozgrywką
 * zrywałoby je i otwierało od nowa.
 */
const PokojCtx = createContext<Pokoj | null>(null);

export function PokojProvider({
  aktywny,
  children,
}: {
  aktywny: boolean;
  children: React.ReactNode;
}) {
  const pokoj = usePokoj(aktywny);
  return <PokojCtx.Provider value={pokoj}>{children}</PokojCtx.Provider>;
}

export function usePokojCtx(): Pokoj {
  const c = useContext(PokojCtx);
  if (!c) throw new Error("usePokojCtx poza PokojProvider");
  return c;
}

/** Kod pokoju, w którym prowadzimy grę — bez otwierania połączenia. */
export function kodProwadzonegoPokoju(): string | null {
  return zapamietanyKod();
}

export function usePokoj(aktywny: boolean): Pokoj {
  const kod = useSyncExternalStore(subskrybuj, zapamietanyKod, () => null);
  const [stan, setStan] = useState<StanPokoju | null>(null);
  const [polaczenie, setPolaczenie] = useState<StanPolaczeniaPokoju>("rozlaczony");
  const [blad, setBlad] = useState<string | null>(null);
  const gniazdo = useRef<WebSocket | null>(null);
  const wznowienie = useRef<ReturnType<typeof setTimeout> | null>(null);
  const proby = useRef(0);

  // Podłączenie żyje tak długo, jak kod pokoju. Wznawianie z narastającym
  // odstępem, żeby zerwana sieć nie zamieniła się w pętlę żądań.
  useEffect(() => {
    if (!aktywny || !kod) {
      gniazdo.current?.close();
      gniazdo.current = null;
      // Bez pokoju nie ma czego łączyć; stan wyliczamy niżej, więc nie ma tu
      // potrzeby niczego ustawiać.
      return;
    }

    let zywe = true;

    const polacz = () => {
      if (!zywe) return;
      setPolaczenie("laczenie");
      const protokol = location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protokol}//${location.host}/api/pokoj/${kod}/podglad`);
      gniazdo.current = ws;

      ws.addEventListener("open", () => {
        if (!zywe) return;
        proby.current = 0;
        setPolaczenie("polaczony");
        setBlad(null);
      });
      ws.addEventListener("message", (e) => {
        try {
          const dane = JSON.parse(e.data as string) as { typ: string; stan?: StanPokoju };
          if (dane.typ === "stan" && dane.stan) setStan(dane.stan);
        } catch {
          /* nieznana wiadomość — pomijamy */
        }
      });
      ws.addEventListener("close", () => {
        if (!zywe) return;
        setPolaczenie("rozlaczony");
        proby.current += 1;
        const odstep = Math.min(1000 * 2 ** (proby.current - 1), 15000);
        wznowienie.current = setTimeout(polacz, odstep);
      });
    };

    polacz();
    // Powrót do karty po uśpieniu ekranu ma odzyskiwać połączenie od razu,
    // nie po odczekaniu narastającego odstępu.
    const przyPowrocie = () => {
      if (document.visibilityState === "visible" && gniazdo.current?.readyState !== WebSocket.OPEN) {
        proby.current = 0;
        if (wznowienie.current) clearTimeout(wznowienie.current);
        polacz();
      }
    };
    document.addEventListener("visibilitychange", przyPowrocie);

    return () => {
      zywe = false;
      document.removeEventListener("visibilitychange", przyPowrocie);
      if (wznowienie.current) clearTimeout(wznowienie.current);
      gniazdo.current?.close();
      gniazdo.current = null;
    };
  }, [aktywny, kod]);

  const dzialaj = useCallback(
    async (sciezka: string, cialo: unknown, metoda: "POST" | "DELETE" = "POST") => {
      if (!kod) return;
      setBlad(null);
      try {
        // Odpowiedź niesie świeży stan, więc nie czekamy na rozgłoszenie.
        setStan(await api<StanPokoju>(`/api/pokoj/${kod}${sciezka}`, {
          method: metoda,
          body: JSON.stringify(cialo),
        }));
      } catch (e) {
        setBlad((e as Error).message);
      }
    },
    [kod]
  );

  const zaloz = useCallback(async () => {
    setBlad(null);
    try {
      const nowy = await api<StanPokoju>("/api/pokoj", { method: "POST", body: "{}" });
      setStan(nowy);
      zapamietaj(nowy.kod);
    } catch (e) {
      setBlad((e as Error).message);
    }
  }, []);

  /** Odpina pulpit od pokoju, ale zostawia go na serwerze. */
  const porzuc = useCallback(() => {
    setStan(null);
    zapamietaj(null);
  }, []);

  const zamknijNaZawsze = useCallback(async () => {
    if (!kod) return;
    try {
      await api(`/api/pokoj/${kod}`, { method: "DELETE" });
    } catch (e) {
      setBlad((e as Error).message);
    }
    setStan(null);
    zapamietaj(null);
  }, [kod]);

  return {
    stan: kod ? stan : null,
    // Bez pokoju albo w trybie lokalnym nie ma połączenia do opisania.
    polaczenie: aktywny && kod ? polaczenie : "rozlaczony",
    blad,
    zaloz,
    porzuc,
    zamknijNaZawsze,
    usadz: (gracz, miejsce) => dzialaj("/usadz", { gracz, miejsce }),
    przemianuj: (gracz, nazwa) => dzialaj("/przemianuj", { gracz, nazwa }),
    wyrzuc: (gracz) => dzialaj("/wyrzuc", { gracz }),
    ustawEtap: (etap) => dzialaj("/etap", { etap }),
    rozdaj: (przypisania) => dzialaj("/rozdaj", { przypisania }),
    nowaRunda: () => dzialaj("/nowa-runda", {}),
    ujawnij: (gracze) => dzialaj("/ujawnij", { gracze }),
    zaproszenieAsysty: async (poziom) => {
      if (!kod) return null;
      setBlad(null);
      try {
        // Odpowiedź niesie sam kod, więc świeży stan pokoju dociągamy osobno.
        const wynik = await api<{ kod: string }>(`/api/pokoj/${kod}/asysta/zaproszenie`, {
          method: "POST",
          body: JSON.stringify({ poziom }),
        });
        setStan(await api<StanPokoju>(`/api/pokoj/${kod}/manitou`));
        return wynik.kod;
      } catch (e) {
        setBlad((e as Error).message);
        return null;
      }
    },
    cofnijZaproszenieAsysty: (kodZaproszenia) =>
      dzialaj("/asysta/zaproszenie", { kod: kodZaproszenia }, "DELETE"),
    odbierzAsyste: (uzytkownik) => dzialaj("/asysta", { uzytkownik }, "DELETE"),
  };
}
