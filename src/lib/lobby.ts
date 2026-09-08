/**
 * Reguły lobby niezależne od środowiska — walidacja imion i stany pokoju.
 * Trzymane osobno, żeby pokrywał je zwykły `node --test` razem z regułami gry.
 */

/** Imię ma się zmieścić na żetonie w kręgu rady i na ekranie telefonu. */
export const MAKS_DLUGOSC_IMIENIA = 16;
export const MIN_DLUGOSC_IMIENIA = 2;

/** Pokój żyje jedną rozgrywkę; potem karty przestają być komukolwiek potrzebne. */
export const WAZNOSC_POKOJU_MS = 24 * 60 * 60 * 1000;

export type EtapPokoju = "lobby" | "zamkniete" | "rozdane";

export type WynikImienia = { ok: true; imie: string } | { ok: false; powod: string };

/** Ściąga nadmiarowe spacje — „Jan  Kowalski” i „Jan Kowalski” to to samo imię. */
export function znormalizujImie(surowe: string): string {
  return (surowe ?? "").trim().replace(/\s+/g, " ");
}

/** Do porównań: bez rozróżniania wielkości liter, żeby „Kasia” i „kasia” kolidowały. */
export function kluczImienia(surowe: string): string {
  return znormalizujImie(surowe).toLocaleLowerCase("pl-PL");
}

/** Znaki sterujące rozwalają układ listy i nie niosą treści. */
const STERUJACE = /[\u0000-\u001f\u007f]/;

/**
 * Sprawdza imię wpisane przez gracza.
 *
 * Duplikaty są zakazane, bo Manitou sadza ludzi po imionach — dwie „Kasie”
 * w puli oznaczają, że nie wiadomo, którą się przeciąga.
 */
export function sprawdzImie(surowe: string, zajete: string[]): WynikImienia {
  const imie = znormalizujImie(surowe);
  if (imie.length < MIN_DLUGOSC_IMIENIA) {
    return { ok: false, powod: `Imię ma mieć co najmniej ${MIN_DLUGOSC_IMIENIA} znaki.` };
  }
  if (imie.length > MAKS_DLUGOSC_IMIENIA) {
    return { ok: false, powod: `Imię może mieć najwyżej ${MAKS_DLUGOSC_IMIENIA} znaków.` };
  }
  if (STERUJACE.test(imie)) {
    return { ok: false, powod: "Imię zawiera niedozwolone znaki." };
  }
  const klucz = kluczImienia(imie);
  if (zajete.some((z) => kluczImienia(z) === klucz)) {
    return { ok: false, powod: "To imię jest już zajęte — wybierz inne." };
  }
  return { ok: true, imie };
}

/** Czy do pokoju wolno jeszcze dołączyć. */
export function moznaDolaczyc(etap: EtapPokoju): boolean {
  return etap === "lobby";
}

/**
 * Dlaczego dołączenie odpada — komunikat trafia wprost na telefon gracza,
 * więc mówi, co się stało, a nie jaki kod błędu padł.
 */
export function powodOdmowy(etap: EtapPokoju): string {
  return etap === "rozdane"
    ? "Gra już się zaczęła — karty zostały rozdane."
    : "Prowadzący zamknął zapisy do tej gry.";
}
