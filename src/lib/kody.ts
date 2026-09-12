/**
 * Kody wpisywane z kartki albo z ekranu: rejestracja Manitou i wejście do
 * pokoju. Nie ma tu nic zależnego od środowiska Workers, więc pokrywa je
 * zwykły `node --test`.
 */

/**
 * Alfabet bez znaków, które ludzie mylą przy przepisywaniu: brak 0, O, 1, I
 * oraz L. Zostaje 31 znaków, co daje 923 521 kombinacji dla kodu pokoju
 * (cztery znaki) i około 8·10^17 dla kodu rejestracji (dwanaście).
 */
export const ALFABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/**
 * Dawny prefiks kodu pokoju. Kody są dziś gołymi czterema znakami, ale
 * wpisanie „KTULU-AB3D” nadal działa — prefiks jest po prostu odcinany.
 * Nie da się przy tym uszkodzić poprawnego kodu, bo litera L nie należy
 * do alfabetu, więc żaden kod nie zaczyna się od tych znaków.
 */
export const PREFIKS_POKOJU = "KTULU";

export const DLUGOSC_KODU_POKOJU = 4;
/**
 * Zaproszenie dla drugiego prowadzącego.
 *
 * Osiem znaków zamiast czterech, bo ten kod daje wgląd we wszystkie karty —
 * inaczej niż kod gry, który wpuszcza tylko do poczekalni. Przy okazji długość
 * jednoznacznie odróżnia oba kody: cztery znaki to gra, osiem to asysta,
 * dwanaście to założenie konta. Nie da się pomylić jednego z drugim.
 */
export const DLUGOSC_KODU_ASYSTY = 8;
export const DLUGOSC_KODU_REJESTRACJI = 12;

/**
 * Losuje ciąg z alfabetu bez przesunięcia rozkładu.
 *
 * 256 nie dzieli się przez 31, więc zwykłe `% 31` faworyzowałoby początek
 * alfabetu. Bajty spoza równego zakresu są odrzucane i losowane ponownie.
 */
export function losujZnaki(dlugosc: number): string {
  const prog = 256 - (256 % ALFABET.length);
  let wynik = "";
  const bufor = new Uint8Array(dlugosc * 2);
  while (wynik.length < dlugosc) {
    crypto.getRandomValues(bufor);
    for (const bajt of bufor) {
      if (bajt >= prog) continue;
      wynik += ALFABET[bajt % ALFABET.length];
      if (wynik.length === dlugosc) break;
    }
  }
  return wynik;
}

/** Wstawia myślniki co `grupa` znaków: XXXX-XXXX-XXXX. */
export function pogrupuj(znaki: string, grupa: number): string {
  const czesci: string[] = [];
  for (let i = 0; i < znaki.length; i += grupa) czesci.push(znaki.slice(i, i + grupa));
  return czesci.join("-");
}

/** Cztery znaki — tyle, ile da się przepisać z drugiego końca stołu. */
export function losujKodPokoju(): string {
  return losujZnaki(DLUGOSC_KODU_POKOJU);
}

/** XXXX-XXXX */
export function losujKodAsysty(): string {
  return pogrupuj(losujZnaki(DLUGOSC_KODU_ASYSTY), 4);
}

/** XXXX-XXXX-XXXX */
export function losujKodRejestracji(): string {
  return pogrupuj(losujZnaki(DLUGOSC_KODU_REJESTRACJI), 4);
}

/** Ściąga formatowanie: wielkie litery, bez myślników, spacji i prefiksu. */
export function rdzenKodu(surowy: string): string {
  return surowy
    .toUpperCase()
    .replace(/\s|-|_/g, "")
    .replace(new RegExp(`^${PREFIKS_POKOJU}`), "");
}

export type WynikKodu = { ok: true; kod: string } | { ok: false; powod: string };

/**
 * Sprawdza wpisany kod i zwraca go w postaci znormalizowanej.
 *
 * Komunikat wskazuje konkretny znak, bo najczęstsza pomyłka to przepisanie
 * zera zamiast litery O — a takich znaków w alfabecie po prostu nie ma.
 */
export function sprawdzKod(surowy: string, dlugosc: number): WynikKodu {
  const kod = rdzenKodu(surowy ?? "");
  if (!kod) return { ok: false, powod: "Wpisz kod." };
  for (const znak of kod) {
    if (!ALFABET.includes(znak)) {
      const podpowiedz =
        znak === "0" || znak === "O"
          ? " Kody nie zawierają zera ani litery O."
          : znak === "1" || znak === "I" || znak === "L"
            ? " Kody nie zawierają jedynki, I ani L."
            : "";
      return { ok: false, powod: `Znak „${znak}” nie występuje w kodach.${podpowiedz}` };
    }
  }
  if (kod.length !== dlugosc) {
    return {
      ok: false,
      powod: `Kod ma mieć ${dlugosc} znaków, a wpisano ${kod.length}.`,
    };
  }
  return { ok: true, kod };
}

export const sprawdzKodPokoju = (s: string) => sprawdzKod(s, DLUGOSC_KODU_POKOJU);
export const sprawdzKodAsysty = (s: string) => sprawdzKod(s, DLUGOSC_KODU_ASYSTY);
export const sprawdzKodRejestracji = (s: string) => sprawdzKod(s, DLUGOSC_KODU_REJESTRACJI);
