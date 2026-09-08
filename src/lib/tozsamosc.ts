"use client";

/**
 * Tożsamość gracza w pokoju.
 *
 * To zwykły losowy klucz w pamięci przeglądarki, nie konto — wystarcza, żeby
 * wrócić do własnego miejsca po odświeżeniu strony albo po tym, jak telefon
 * uśpi kartę. Klucz jest osobny dla każdego pokoju, więc nic nie łączy dwóch
 * rozgrywek ze sobą.
 */

const PRZEDROSTEK = "ktulu.gracz.";

export function tozsamoscGracza(kod: string): string {
  const klucz = PRZEDROSTEK + kod;
  try {
    const zapisany = localStorage.getItem(klucz);
    if (zapisany) return zapisany;
    const nowy = crypto.randomUUID().replace(/-/g, "");
    localStorage.setItem(klucz, nowy);
    return nowy;
  } catch {
    // Prywatne okno albo zablokowana pamięć: klucz działa do przeładowania.
    return crypto.randomUUID().replace(/-/g, "");
  }
}

/**
 * Pokój, w którym gracz właśnie siedzi.
 *
 * Zapamiętany, bo odświeżenie strony ani uśpienie telefonu nie może wyrzucać
 * z powrotem do wpisywania kodu — gracz jest w środku rozgrywki i ma tam
 * swoją kartę. Czytany synchronicznie spoza Reacta, żeby formularz kodu
 * nie mignął przed właściwym ekranem.
 */
const KLUCZ_POKOJU = "ktulu.gracz.pokoj";

/** Wartość dla renderu na serwerze: jeszcze nie wiadomo. */
export const NIEZNANY = "?";

const sluchacze = new Set<() => void>();

export function subskrybujPokoj(cb: () => void): () => void {
  sluchacze.add(cb);
  return () => {
    sluchacze.delete(cb);
  };
}

export function zapamietanyPokoj(): string | null {
  try {
    return localStorage.getItem(KLUCZ_POKOJU);
  } catch {
    return null;
  }
}

export function zapamietajPokoj(kod: string | null): void {
  try {
    if (kod) localStorage.setItem(KLUCZ_POKOJU, kod);
    else localStorage.removeItem(KLUCZ_POKOJU);
  } catch {
    /* powrót po odświeżeniu przepadnie, ale gra działa */
  }
  for (const cb of sluchacze) cb();
}
