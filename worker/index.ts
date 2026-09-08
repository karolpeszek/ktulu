/**
 * Punkt wejścia Workera.
 *
 * Statyczne pliki serwuje nadal warstwa assetów i to się nie zmienia — Worker
 * dostaje wyłącznie ścieżki wskazane w `run_worker_first`, czyli `/api/*`.
 * Bez tego ustawienia żądanie do API nie trafiłoby tutaj: nie pasowałoby do
 * żadnego pliku, więc `not_found_handling` odesłałby wyeksportowaną stronę 404.
 */

import { sprawdzKonfiguracje } from "./config";

export interface Env {
  /** Dostęp do wyeksportowanej strony z poziomu Workera. */
  ASSETS: Fetcher;
  /**
   * Domena, do której przypisywane są passkeye Manitou.
   *
   * Ustawiana w panelu Cloudflare, nie w `wrangler.toml` — dzięki temu zmiana
   * domeny nie wymaga commita. `keep_vars` pilnuje, żeby deploy jej nie zdjął.
   */
  RP_ID?: string;
  RP_NAME?: string;
}

/** Odpowiedź JSON bez cache — API nigdy nie powinno wylądować w service workerze. */
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
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
        ? json({ ok: true, rpId: konfiguracja.konfiguracja.rpId, rpName: konfiguracja.konfiguracja.rpName })
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

    return json({ error: "Nie ma takiego zasobu." }, 404);
  },
} satisfies ExportedHandler<Env>;
