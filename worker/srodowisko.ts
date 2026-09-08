/** Wspólny opis środowiska — używany i przez punkt wejścia, i przez obiekty trwałe. */
import type { Konta } from "./konta";
import type { Pokoj } from "./pokoj";

export interface Env {
  /** Dostęp do wyeksportowanej strony z poziomu Workera. */
  ASSETS: Fetcher;
  /** Konta Manitou — jeden obiekt na całą instalację. */
  KONTA: DurableObjectNamespace<Konta>;
  /** Pokoje gry — jeden obiekt na rozgrywkę, adresowany kodem. */
  POKOJE: DurableObjectNamespace<Pokoj>;
  /**
   * Domena, do której przypisywane są passkeye Manitou.
   *
   * Ustawiana w panelu Cloudflare, nie w `wrangler.toml` — dzięki temu zmiana
   * domeny nie wymaga commita. `keep_vars` pilnuje, żeby deploy jej nie zdjął.
   */
  RP_ID?: string;
  RP_NAME?: string;
}
