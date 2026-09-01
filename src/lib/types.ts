export type Faction = "miasto" | "bandyci" | "indianie" | "ufoki" | "janosik";

export const FACTIONS: Faction[] = ["miasto", "bandyci", "indianie", "ufoki", "janosik"];

/** Frakcje z tabeli Xięgi — bez dodatku domowego, którym jest Janosik. */
export const BOOK_FACTIONS: Faction[] = ["miasto", "bandyci", "indianie", "ufoki"];

export const FACTION_LABEL: Record<Faction, string> = {
  miasto: "Miasto",
  bandyci: "Bandyci",
  indianie: "Indianie",
  ufoki: "Ufoki",
  janosik: "Janosik",
};

export const FACTION_GOAL: Record<Faction, string> = {
  miasto: "Doprowadzić do oficjalnego odkrycia posążka.",
  bandyci: "Odpłynąć do Europy z posążkiem.",
  indianie: "Wybić wszystkich pozostałych graczy.",
  ufoki: "Trzykrotnie nadać sygnał posążkiem na macierzystą planetę.",
  janosik: "Dać się powiesić radzie miasta — wtedy wygrywa sam, a wszyscy pozostali przegrywają.",
};

/** Kategoria wg „Omówienia postaci" w Xiędze. */
export type RoleTier = "kluczowa" | "tradycyjna" | "kontrowersyjna" | "zwykla" | "szeregowy";

/** Kiedy postać jest wywoływana w nocy. */
export type NightUse = "brak" | "zerowa" | "co-noc" | "raz" | "dwa-razy" | "warunkowa";

export interface Role {
  id: string;
  name: string;
  faction: Faction;
  tier: RoleTier;
  /** Szeregowy członek frakcji — rola wypełniająca, może wystąpić wielokrotnie. */
  filler?: boolean;
  /** Najwyższy rangą członek frakcji. */
  leader?: boolean;
  nightUse: NightUse;
  /** Krótki opis dla Manitou. */
  desc: string;
  /** Czy postać może działać sama na sobie (wg rozstrzygnięć Xięgi). */
  selfTarget?: boolean;
  /** Czy działanie jest jawne dla wszystkich graczy. */
  jawne?: boolean;
}

export interface Player {
  id: string;
  name: string;
  seat: number;
  roleId: string | null;
  alive: boolean;
  /** Powód i moment śmierci — do logu i rewizji. */
  deathNote?: string;
  deathPhase?: string;
}

export interface EventEntry {
  id: string;
  phase: string;
  text: string;
  secret: boolean;
  ts: number;
}

export type Winner = Faction | null;

export interface Settings {
  /** Ile osób miasto przeszukuje na koniec dnia. */
  searchCount: number;
  /** Numer nocy, po której statek bandytów może odpłynąć (odpłynięcie o poranku). */
  shipNight: number;
  maxDuelsPerDay: number;
  /** Czy bandyci mogą zabić okradaną ofiarę (Xięga: nie). */
  banditsCanKill: boolean;
  /** Tryb jawności wg rozdziału „Jawność gry". */
  disclosure: "jawny" | "tajny";
}

export interface SetupConfig {
  /** Czy w grze bierze udział Janosik (dodatek domowy, od 13 graczy). */
  withJanosik: boolean;
  counts: Record<Faction, number>;
  picked: Record<Faction, string[]>;
  autofill: boolean;
  manualCounts: boolean;
  manualSettings: boolean;
}

export interface GameState {
  version: number;
  setup: SetupConfig;
  stage: "setup" | "night" | "day" | "koniec";
  players: Player[];
  settings: Settings;
  /** Numer nocy: 0 = noc zerowa. */
  night: number;
  day: number;
  /** Indeks aktualnego kroku w kreatorze nocy. */
  stepIndex: number;
  /** Id gracza trzymającego posążek (albo null = nikt/nieznane). */
  idolHolder: string | null;
  /** Podłożony przez cichą stopę — traktowany jak właściciel, nie wie o tym. */
  plantedIdolOn: string | null;
  /** Zużyte zdolności jednorazowe: roleId -> liczba użyć. */
  used: Record<string, number>;
  /** Efekty na czas jednej nocy. */
  jailed: string | null;
  protectedId: string | null;
  lastProtectedId: string | null;
  drunk: string[];
  /** Gracze uśpieni tej nocy (opój, szuler, więzienie). */
  asleep: string[];
  /** Zabici tej nocy (do wskrzeszenia przez lekarza / ogłoszenia rano). */
  nightDeaths: string[];
  /** Czy Indianie przejęli posążek tej nocy (warunek wojownika). */
  indiansTookIdolTonight: boolean;
  /** Kto ma posążek na początku nocy — do sprawdzenia warunku szeryfa. */
  idolAtNightStart: string | null;
  /** Ofiara szamanki — ginie następnego dnia przed głosowaniami. */
  poisoned: string | null;
  /** Bandyci zadeklarowali odpłynięcie tej nocy. */
  sailDeclared: boolean;
  signals: number;
  duelsToday: number;
  /** Relacje ujawnione przez zerową noc. */
  bonds: { kind: "dziwka" | "uwodziciel" | "szantazysta"; from: string; to: string }[];
  events: EventEntry[];
  winner: Winner;
  winReason: string | null;
  /** Log ogłoszeń dla graczy przy poranku. */
  morningReport: string[];
  /** Akcja wieloetapowa w toku (np. ruletka hazardzisty). */
  pending: string | null;
  /** Ostatnia informacja zwrotna dla Manitou. */
  feedback: string[];
}
