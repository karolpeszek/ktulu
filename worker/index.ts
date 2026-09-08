/**
 * Punkt wejścia Workera.
 *
 * Statyczne pliki serwuje nadal warstwa assetów i to się nie zmienia — Worker
 * dostaje wyłącznie ścieżki wskazane w `run_worker_first`, czyli `/api/*`.
 * Bez tego ustawienia żądanie do API nie trafiłoby tutaj: nie pasowałoby do
 * żadnego pliku, więc `not_found_handling` odesłałby wyeksportowaną stronę 404.
 */

import { HASH_BOOTSTRAPU } from "./bootstrap.generated";
import { Konfiguracja, originDozwolony, sprawdzKonfiguracje } from "./config";
import { KontekstWebAuthn, Wynik } from "./konta";
import type { Env } from "./srodowisko";

export { Konta } from "./konta";
export { Pokoj } from "./pokoj";
export type { Env };

const CIASTKO_SESJI = "ktulu_sesja";

function json(data: unknown, status = 200, naglowki: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // API nigdy nie może wylądować w cache przeglądarki ani service workera.
      "cache-control": "no-store",
      ...naglowki,
    },
  });
}

function odczytajSesje(request: Request): string | null {
  const surowe = request.headers.get("cookie");
  if (!surowe) return null;
  for (const kawalek of surowe.split(";")) {
    const [nazwa, ...reszta] = kawalek.trim().split("=");
    if (nazwa === CIASTKO_SESJI) return decodeURIComponent(reszta.join("="));
  }
  return null;
}

/**
 * Ciasteczko sesji. `Secure` odpada tylko na localhost, bo przeglądarka
 * odrzuciłaby je po http i praca lokalna byłaby niemożliwa.
 */
function ciastkoSesji(id: string, wygasa: number, https: boolean): string {
  const maxAge = Math.max(0, Math.floor((wygasa - Date.now()) / 1000));
  const czesci = [
    `${CIASTKO_SESJI}=${encodeURIComponent(id)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (https) czesci.push("Secure");
  return czesci.join("; ");
}

function ciastkoWygaszone(https: boolean): string {
  return ciastkoSesji("", Date.now(), https);
}

/** Przekłada wynik z obiektu kont na odpowiedź HTTP. */
function odpowiedz<T>(w: Wynik<T>, naglowki: Record<string, string> = {}): Response {
  return w.ok ? json(w.dane, 200, naglowki) : json({ error: w.powod }, w.status);
}

async function czytajJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const dane = await request.json();
    return typeof dane === "object" && dane !== null ? (dane as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function tekst(dane: Record<string, unknown> | null, pole: string): string {
  const v = dane?.[pole];
  return typeof v === "string" ? v : "";
}

async function obsluzApi(
  request: Request,
  env: Env,
  url: URL,
  konfiguracja: Konfiguracja
): Promise<Response> {
  const origin = request.headers.get("origin") ?? url.origin;
  if (!originDozwolony(origin, konfiguracja.rpId)) {
    return json({ error: "Żądanie z niedozwolonego adresu." }, 403);
  }
  const https = new URL(origin).protocol === "https:";
  const kontekst: KontekstWebAuthn = {
    rpId: konfiguracja.rpId,
    rpName: konfiguracja.rpName,
    origin,
  };

  // Jeden obiekt na całą instalację — nazwa jest stała i celowo nieciekawa.
  const konta = env.KONTA.getByName("konta");
  const sesja = odczytajSesje(request);
  const sciezka = url.pathname;
  const post = request.method === "POST";

  if (sciezka === "/api/auth/stan" && request.method === "GET") {
    const stan = await konta.stan();
    const ja = await konta.ktoTo(sesja, konfiguracja.rpId);
    // `pusto` mówi ekranowi rejestracji, że trwa tryb bootstrapowy.
    return json({ pusto: stan.pusto, uzytkownik: ja });
  }

  if (sciezka === "/api/auth/rejestracja/start" && post) {
    const dane = await czytajJson(request);
    return odpowiedz(
      await konta.rejestracjaStart(tekst(dane, "kod"), tekst(dane, "nazwa"), HASH_BOOTSTRAPU, kontekst)
    );
  }

  if (sciezka === "/api/auth/rejestracja/koniec" && post) {
    const dane = await czytajJson(request);
    const w = await konta.rejestracjaKoniec(
      dane?.odpowiedz as never,
      HASH_BOOTSTRAPU,
      kontekst
    );
    return w.ok
      ? json({ uzytkownik: w.dane.uzytkownik }, 200, {
          "set-cookie": ciastkoSesji(w.dane.sesja.id, w.dane.sesja.wygasa, https),
        })
      : json({ error: w.powod }, w.status);
  }

  if (sciezka === "/api/auth/logowanie/start" && post) {
    return odpowiedz(await konta.logowanieStart(kontekst));
  }

  if (sciezka === "/api/auth/logowanie/koniec" && post) {
    const dane = await czytajJson(request);
    const w = await konta.logowanieKoniec(dane?.odpowiedz as never, kontekst);
    return w.ok
      ? json({ uzytkownik: w.dane.uzytkownik }, 200, {
          "set-cookie": ciastkoSesji(w.dane.sesja.id, w.dane.sesja.wygasa, https),
        })
      : json({ error: w.powod }, w.status);
  }

  if (sciezka === "/api/auth/wyloguj" && post) {
    await konta.wyloguj(sesja);
    return json({ ok: true }, 200, { "set-cookie": ciastkoWygaszone(https) });
  }

  if (sciezka === "/api/auth/klucz/start" && post) {
    return odpowiedz(await konta.dodanieKluczaStart(sesja, kontekst));
  }

  if (sciezka === "/api/auth/klucz/koniec" && post) {
    const dane = await czytajJson(request);
    return odpowiedz(await konta.dodanieKluczaKoniec(sesja, dane?.odpowiedz as never, kontekst));
  }

  if (sciezka === "/api/admin/konta" && request.method === "GET") {
    return odpowiedz(await konta.listaKont(sesja, konfiguracja.rpId));
  }

  if (sciezka === "/api/admin/zaproszenie" && post) {
    const dane = await czytajJson(request);
    const rola = tekst(dane, "rola") === "admin" ? "admin" : "manitou";
    return odpowiedz(await konta.utworzZaproszenie(sesja, rola, konfiguracja.rpId));
  }

  if (sciezka === "/api/admin/zaproszenie" && request.method === "DELETE") {
    const dane = await czytajJson(request);
    return odpowiedz(await konta.usunZaproszenie(sesja, tekst(dane, "kod"), konfiguracja.rpId));
  }

  if (sciezka === "/api/admin/klucze" && request.method === "DELETE") {
    const dane = await czytajJson(request);
    const id = tekst(dane, "uzytkownik");
    return odpowiedz(await konta.wyczyscKlucze(sesja, id || null, konfiguracja.rpId));
  }

  if (sciezka === "/api/admin/konto" && request.method === "DELETE") {
    const dane = await czytajJson(request);
    return odpowiedz(await konta.usunKonto(sesja, tekst(dane, "uzytkownik"), konfiguracja.rpId));
  }

  return json({ error: "Nie ma takiego zasobu." }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Cokolwiek spoza /api/ tu trafi, obsługuje warstwa statyczna.
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);

    const konfiguracja = sprawdzKonfiguracje(env);

    // Diagnostyka odpowiada zawsze — po to istnieje, żeby dało się sprawdzić,
    // czy zmienne doszły na produkcję. Nie ujawnia niczego wrażliwego.
    if (url.pathname === "/api/health") {
      return konfiguracja.ok
        ? json({
            ok: true,
            rpId: konfiguracja.konfiguracja.rpId,
            rpName: konfiguracja.konfiguracja.rpName,
          })
        : json({ ok: false, blad: "konfiguracja", powod: konfiguracja.powod }, 503);
    }

    // Reszta API bez poprawnej konfiguracji nie ma prawa działać: passkey
    // zapisany pod złym RP_ID jest bezużyteczny i nie da się tego cofnąć.
    if (!konfiguracja.ok) {
      return json(
        { error: "Aplikacja nie jest poprawnie skonfigurowana.", powod: konfiguracja.powod },
        503
      );
    }

    try {
      return await obsluzApi(request, env, url, konfiguracja.konfiguracja);
    } catch (e) {
      return json({ error: `Błąd serwera: ${(e as Error).message}` }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
