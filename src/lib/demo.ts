import { BOOK_FACTIONS } from "./types";
import { buildPool, suggestedCounts } from "./setup";
import { ROLE_BY_ID } from "./roles";
import { FRAKCJE_Z_ROZPOZNANIEM } from "./wspolnicy";

/**
 * Dane pokazowe dla ekranu gracza.
 *
 * Służą do pokazania komuś, jak wygląda karta na telefonie, bez zakładania
 * pokoju i bez zapraszania kogokolwiek. Skład liczony jest prawdziwą tabelą
 * Xięgi, a nie wymyślony — inaczej demo pokazywałoby układ, który w grze
 * nigdy nie wystąpi.
 */

const IMIONA = [
  "Kasia", "Marek", "Zosia", "Bartek", "Ula", "Wojtek", "Hania", "Michał",
  "Ola", "Kuba", "Basia", "Antek", "Iga", "Staszek", "Marysia", "Franek",
  "Nina", "Paweł", "Gosia", "Tomek", "Ewa", "Janek", "Lena", "Adam",
];

export interface DaneDemo {
  /** Karta, którą „dostał” oglądający. */
  mojaRola: string;
  mojeImie: string;
  /** Wszystkie karty w tej rozgrywce. */
  sklad: string[];
  /** Odkryci po śmierci: rola i imię. */
  ujawnieni: { rola: string; imie: string }[];
  /**
   * Wspólnicy z własnej frakcji — czasem pokazywani, czasem nie, bo w grze
   * zależy to od zasady domowej. Pokaz ma pokazywać oba warianty.
   */
  wspolnicy: string[];
}

/** Liczba graczy mieszcząca się w tabeli Xięgi i typowa dla jednego stołu. */
const MIN_GRACZY = 12;
const MAX_GRACZY = 18;

/**
 * Losuje przykładową rozgrywkę.
 *
 * Źródło losowości można podstawić, żeby test sprawdzał niezmienniki zamiast
 * gonić za przypadkiem.
 */
export function wylosujDemo(losowa: () => number = Math.random): DaneDemo {
  const liczba = MIN_GRACZY + Math.floor(losowa() * (MAX_GRACZY - MIN_GRACZY + 1));
  const counts = suggestedCounts(liczba, false);
  const sklad = BOOK_FACTIONS.flatMap((f) => buildPool(f, counts[f], [], true));

  const imiona = wymieszaj(IMIONA, losowa).slice(0, sklad.length);
  // Karty rozdajemy po kolei na wymieszaną listę imion — tak jak przy stole.
  const rozdanie = wymieszaj(sklad, losowa).map((rola, i) => ({ rola, imie: imiona[i] ?? `Gracz ${i + 1}` }));

  const ja = rozdanie[0];
  // Kilkoro poległych, ale nigdy wszyscy — demo ma pokazywać grę w toku.
  const ilu = Math.floor(losowa() * Math.min(5, rozdanie.length - 1));
  const ujawnieni = rozdanie.slice(1, 1 + ilu).map((g) => ({ rola: g.rola, imie: g.imie }));

  // Zasada domowa bywa włączona i wyłączona, więc pokaz losuje i to.
  const zWspolnikami = losowa() < 0.5;
  const mojaFrakcja = ROLE_BY_ID[ja.rola]?.faction;
  const wspolnicy =
    zWspolnikami && mojaFrakcja && FRAKCJE_Z_ROZPOZNANIEM.includes(mojaFrakcja)
      ? rozdanie
          .filter((g) => g.imie !== ja.imie && ROLE_BY_ID[g.rola]?.faction === mojaFrakcja)
          .map((g) => g.imie)
      : [];

  return { mojaRola: ja.rola, mojeImie: ja.imie, sklad, ujawnieni, wspolnicy };
}

/**
 * Powtarzalne źródło losowości z jednej liczby.
 *
 * Pozwala przeliczyć rozdanie dokładnie tak samo przy każdym renderze, więc
 * ekran pokazu nie miga innym składem przy byle zmianie stanu — a osobne
 * ziarno daje nowe rozdanie na żądanie.
 */
export function generatorZiarna(ziarno: number): () => number {
  let a = Math.floor(ziarno * 2 ** 31) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function wymieszaj<T>(lista: T[], losowa: () => number): T[] {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(losowa() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
