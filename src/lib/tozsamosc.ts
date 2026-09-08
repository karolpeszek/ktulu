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
