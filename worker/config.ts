/**
 * Walidacja konfiguracji Workera.
 *
 * Passkey jest kryptograficznie związany z domeną (`RP_ID`). Literówka nie
 * objawia się błędem konfiguracji, tylko cichym „nie znaleziono klucza” przy
 * logowaniu — i to dopiero u użytkownika. Dlatego konfigurację sprawdzamy
 * z góry i przy byle wątpliwości odmawiamy obsługi API.
 *
 * Plik nie korzysta z typów środowiska Workers, żeby dało się go testować
 * zwykłym `node --test` razem z regułami gry.
 */

export interface SurowaKonfiguracja {
  RP_ID?: string;
  RP_NAME?: string;
}

export interface Konfiguracja {
  rpId: string;
  rpName: string;
}

export type WynikKonfiguracji =
  | { ok: true; konfiguracja: Konfiguracja }
  | { ok: false; powod: string };

/**
 * Sufiksy, pod którymi rejestruje się dowolna osoba — WebAuthn ich zabrania,
 * bo klucz obejmowałby wtedy cudze serwisy.
 *
 * To wycinek Public Suffix List: tylko te wpisy, na które realnie można się
 * tu nadziać. `workers.dev` jest pierwszym podejrzanym, bo kuszące jest wpisać
 * je zamiast własnej subdomeny.
 */
const PUBLICZNE_SUFIKSY = new Set([
  "workers.dev",
  "pages.dev",
  "com",
  "net",
  "org",
  "dev",
  "app",
  "io",
  "pl",
  "eu",
  "co.uk",
]);

/** Pojedyncza etykieta domeny wg RFC 1123. */
const ETYKIETA = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Adres IPv4 — nie wolno go użyć jako RP ID. */
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * Sprawdza pojedynczą wartość RP_ID i zwraca powód odrzucenia albo null.
 *
 * Reguły wynikają wprost z WebAuthn: RP ID to goła nazwa domeny — bez
 * schematu, portu i ścieżki — która nie może być adresem IP ani publicznym
 * sufiksem. `localhost` jest jedynym dozwolonym wyjątkiem jednoczłonowym,
 * bo przeglądarki traktują go jako bezpieczny kontekst przy pracy lokalnej.
 */
export function bladRpId(surowe: string): string | null {
  const v = surowe.trim().toLowerCase();

  if (!v) return "RP_ID jest puste.";
  if (/^[a-z]+:\/\//.test(v)) return `RP_ID ma być samą domeną, bez schematu — usuń „${v.split("://")[0]}://”.`;
  if (v.includes("/")) return "RP_ID ma być samą domeną, bez ścieżki i ukośników.";
  if (v.includes(":")) return "RP_ID ma być samą domeną, bez numeru portu.";
  if (v.includes(" ")) return "RP_ID zawiera spację.";
  if (v.endsWith(".")) return "RP_ID nie może kończyć się kropką.";
  if (v.length > 253) return "RP_ID jest dłuższe niż 253 znaki.";
  if (IPV4.test(v)) return "RP_ID nie może być adresem IP — WebAuthn tego zabrania.";

  if (v === "localhost") return null;

  const etykiety = v.split(".");
  if (etykiety.length < 2) {
    return `„${v}” to pojedyncza nazwa, a RP_ID musi być pełną domeną (np. ktulu.example.com).`;
  }
  for (const e of etykiety) {
    if (!ETYKIETA.test(e)) return `„${e}” nie jest poprawnym członem domeny w RP_ID.`;
  }
  if (PUBLICZNE_SUFIKSY.has(v)) {
    return `„${v}” to publiczny sufiks — passkey nie może obejmować cudzych serwisów. Podaj własną subdomenę, np. cos.${v}.`;
  }
  return null;
}

/** Sprawdza całą konfigurację środowiska przed obsłużeniem czegokolwiek. */
export function sprawdzKonfiguracje(env: SurowaKonfiguracja): WynikKonfiguracji {
  const rpIdSurowe = env.RP_ID;
  if (rpIdSurowe === undefined || rpIdSurowe.trim() === "") {
    return {
      ok: false,
      powod:
        "Brak zmiennej RP_ID. Ustaw ją w panelu Cloudflare na domenę, pod którą działa aplikacja (np. ktulu.example.com).",
    };
  }
  const blad = bladRpId(rpIdSurowe);
  if (blad) return { ok: false, powod: blad };

  const rpName = (env.RP_NAME ?? "").trim() || "Ktulu";
  if (rpName.length > 64) return { ok: false, powod: "RP_NAME jest dłuższe niż 64 znaki." };

  return { ok: true, konfiguracja: { rpId: rpIdSurowe.trim().toLowerCase(), rpName } };
}

/**
 * Czy dany origin wolno obsłużyć przy tej konfiguracji.
 *
 * Zamiast listy adresów w konfiguracji wyprowadzamy ją z RP_ID: dozwolone jest
 * każde https pod tą domeną. Dzięki temu adresy podglądu gałęzi działają same,
 * bez dopisywania ich przy każdej nowej gałęzi.
 */
export function originDozwolony(origin: string, rpId: string): boolean {
  let host: string;
  let protokol: string;
  try {
    const u = new URL(origin);
    host = u.hostname.toLowerCase();
    protokol = u.protocol;
  } catch {
    return false;
  }
  if (rpId === "localhost") return host === "localhost";
  if (protokol !== "https:") return false;
  return host === rpId || host.endsWith("." + rpId);
}
