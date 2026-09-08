/**
 * Punkt wejścia Workera.
 *
 * Statyczne pliki serwuje nadal warstwa assetów i to się nie zmienia — Worker
 * dostaje wyłącznie ścieżki wskazane w `run_worker_first`, czyli `/api/*`.
 * Bez tego ustawienia żądanie do API nie trafiłoby tutaj: nie pasowałoby do
 * żadnego pliku, więc `not_found_handling` odesłałby wyeksportowaną stronę 404.
 *
 * Dopóki nie ma tu żadnego kodu, Cloudflare traktuje projekt jako „tylko
 * statyczne zasoby" i nie pozwala ustawić zmiennych środowiskowych.
 */

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

    if (url.pathname === "/api/health") {
      return json({
        ok: true,
        // Pozwala sprawdzić z przeglądarki, czy zmienne doszły na produkcję,
        // bez ujawniania czegokolwiek wrażliwego.
        rpId: env.RP_ID ?? null,
        rpName: env.RP_NAME ?? null,
      });
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ error: "Nie ma takiego zasobu." }, 404);
    }

    // Cokolwiek innego tu trafi, obsługuje warstwa statyczna.
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
