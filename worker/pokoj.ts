/**
 * Pokój gry — jeden Durable Object na rozgrywkę, adresowany kodem.
 *
 * Pokój jest właścicielem lobby i rozdania, nie całej rozgrywki: po wydaniu
 * kart konsola Manitou wraca do pracy na własnym stanie w przeglądarce.
 * Dzięki temu utrata sieci w środku nocy niczego nie psuje.
 *
 * Manitou trzyma otwarty WebSocket, żeby widzieć wchodzących na żywo. Gracze
 * odpytują zwykłym HTTP — czekają tylko na jedno zdarzenie, więc nie ma po co
 * fundować dwudziestu telefonom logiki wznawiania połączenia.
 */

import { DurableObject } from "cloudflare:workers";

import { doBase64Url, sha256Hex } from "./bytes";
import { losujKodAsysty, rdzenKodu } from "../src/lib/kody";
import {
  EtapPokoju,
  WAZNOSC_POKOJU_MS,
  moznaDolaczyc,
  powodOdmowy,
  sprawdzImie,
} from "../src/lib/lobby";
import type { Env } from "./srodowisko";

export { WAZNOSC_POKOJU_MS };

export interface GraczWPokoju {
  id: string;
  nazwa: string;
  dolaczyl: number;
  /** Miejsce na półkolu albo null, dopóki Manitou go nie posadzi. */
  miejsce: number | null;
  /** Czy ma już przypisaną kartę. Samej karty prowadzący nie dostaje stąd. */
  maKarte: boolean;
  /** Kiedy potwierdził, że ją obejrzał — po tym Manitou wie, że można zaczynać. */
  widzial: number | null;
  /** Czy jego karta została odkryta po śmierci. */
  ujawniony: boolean;
}

export interface StanPokoju {
  kod: string;
  etap: EtapPokoju;
  utworzono: number;
  wygasa: number;
  gracze: GraczWPokoju[];
  wspolprowadzacy: Wspolprowadzacy[];
  zaproszeniaAsysty: ZaproszenieAsysty[];
  /** Prośby czekające na decyzję głównego prowadzącego. */
  zadania: Zadanie[];
  /** Rośnie z każdym zapisem migawki — po niej asystent poznaje, że ma odświeżyć. */
  wersjaMigawki: number;
}

/** To, co widzi gracz: własne dane i tyle o pokoju, ile mu potrzebne. */
export interface StanGracza {
  kod: string;
  etap: EtapPokoju;
  ja: {
    id: string;
    nazwa: string;
    miejsce: number | null;
    /** Własna karta — wyłącznie po wydaniu i wyłącznie dla właściciela klucza. */
    rola: string | null;
    widzial: number | null;
  } | null;
  /** Imiona pozostałych — jawne i tak, bo wszyscy siedzą przy jednym stole. */
  imiona: string[];
  /**
   * Karty biorące udział w tej rozgrywce, w kolejności niezależnej od miejsc
   * przy stole — sam skład jest jawny, ale nie może zdradzać, kto gdzie siedzi.
   */
  sklad: string[];
  /** Karty odkryte po śmierci: rola i imię, w kolejności ujawniania. */
  ujawnieni: { rola: string; imie: string }[];
}

/** Zakres uprawnień drugiego prowadzącego. */
export type PoziomAsysty = "odczyt" | "zapis";

export interface Wspolprowadzacy {
  uzytkownik: string;
  nazwa: string;
  poziom: PoziomAsysty;
  dolaczyl: number;
}

export interface ZaproszenieAsysty {
  kod: string;
  poziom: PoziomAsysty;
  wygasa: number;
  zuzytePrzez: string | null;
}

/**
 * Prośba asystenta o zmianę stanu gry.
 *
 * Asystent liczy skutek u siebie tym samym silnikiem i przysyła gotowy stan,
 * a nie opis akcji. Inaczej reguły gry musiałyby istnieć drugi raz, po stronie
 * protokołu — a to jest dokładnie ten rodzaj powielenia, przez który dwie
 * kopie zasad się rozjeżdżają.
 */
export interface Zadanie {
  id: string;
  od: string;
  odNazwa: string;
  /** Co się stanie, w słowach — wyprowadzone z dziennika gry. */
  opis: string[];
  utworzono: number;
  /** Wersja migawki, na której asystent liczył. Starsza znaczy rozjazd. */
  bazowaWersja: number;
}

export type Wynik<T> = { ok: true; dane: T } | { ok: false; powod: string; status: number };

const blad = (powod: string, status = 400): { ok: false; powod: string; status: number } => ({
  ok: false,
  powod,
  status,
});

interface WierszGracza extends Record<string, SqlStorageValue> {
  id: string;
  nazwa: string;
  dolaczyl: number;
  miejsce: number | null;
  token: string;
  rola: string | null;
  widzial: number | null;
  ujawniony: number | null;
}

export class Pokoj extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.migruj();
      // Pingi obsługiwane bez budzenia obiektu — inaczej utrzymanie
      // połączenia przez cały wieczór naliczałoby czas procesora.
      ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    });
  }

  private get sql() {
    return this.ctx.storage.sql;
  }

  /**
   * Zakłada schemat i dociąga go do bieżącej postaci.
   *
   * `CREATE TABLE IF NOT EXISTS` nie dokłada kolumn do tabeli, która już
   * istnieje — a obiekt pokoju powstaje przy pierwszym pytaniu o dany kod,
   * więc tabele mogą pochodzić ze starszej wersji schematu i być przy tym
   * puste. Dlatego brakujące kolumny dokładamy osobno.
   */
  private migruj(): void {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS pokoj (
        klucz TEXT PRIMARY KEY,
        wartosc TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS gracze (
        id TEXT PRIMARY KEY,
        token TEXT NOT NULL UNIQUE,
        nazwa TEXT NOT NULL,
        dolaczyl INTEGER NOT NULL,
        miejsce INTEGER,
        rola TEXT,
        widzial INTEGER,
        ujawniony INTEGER
      );
      CREATE TABLE IF NOT EXISTS wspolprowadzacy (
        uzytkownik TEXT PRIMARY KEY,
        nazwa TEXT NOT NULL,
        poziom TEXT NOT NULL,
        dolaczyl INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS zaproszenia_asysty (
        kod TEXT PRIMARY KEY,
        poziom TEXT NOT NULL,
        wygasa INTEGER NOT NULL,
        zuzyte_przez TEXT
      );
      CREATE TABLE IF NOT EXISTS zadania (
        id TEXT PRIMARY KEY,
        od TEXT NOT NULL,
        od_nazwa TEXT NOT NULL,
        opis TEXT NOT NULL,
        stan TEXT NOT NULL,
        bazowa_wersja INTEGER NOT NULL,
        utworzono INTEGER NOT NULL
      );
    `);

    const kolumny = new Set(
      this.sql
        .exec<{ name: string }>("SELECT name FROM pragma_table_info('gracze')")
        .toArray()
        .map((k) => k.name)
    );

    // Brak `token` znaczy, że tabela pochodzi sprzed obsługi graczy, więc jest
    // pusta — wtedy prościej i bezpieczniej zbudować ją od nowa niż dokładać
    // kolumnę z więzami, których ALTER nie przyjmie.
    if (!kolumny.has("token")) {
      this.sql.exec("DROP TABLE gracze");
      this.sql.exec(`
        CREATE TABLE gracze (
          id TEXT PRIMARY KEY,
          token TEXT NOT NULL UNIQUE,
          nazwa TEXT NOT NULL,
          dolaczyl INTEGER NOT NULL,
          miejsce INTEGER,
          rola TEXT,
          widzial INTEGER,
          ujawniony INTEGER
        );
      `);
      return;
    }

    for (const [nazwa, typ] of [
      ["rola", "TEXT"],
      ["widzial", "INTEGER"],
      ["ujawniony", "INTEGER"],
    ] as const) {
      if (!kolumny.has(nazwa)) this.sql.exec(`ALTER TABLE gracze ADD COLUMN ${nazwa} ${typ}`);
    }
  }

  // ————————————————————— drobiazgi na stanie pokoju —————————————————————

  private pole(klucz: string): string | null {
    const w = this.sql
      .exec<{ wartosc: string }>("SELECT wartosc FROM pokoj WHERE klucz = ?", klucz)
      .toArray()[0];
    return w?.wartosc ?? null;
  }

  private ustaw(klucz: string, wartosc: string): void {
    this.sql.exec(
      "INSERT INTO pokoj (klucz, wartosc) VALUES (?, ?) ON CONFLICT(klucz) DO UPDATE SET wartosc = excluded.wartosc",
      klucz,
      wartosc
    );
  }

  private zalozony(): boolean {
    return this.pole("kod") !== null;
  }

  private etap(): EtapPokoju {
    return (this.pole("etap") as EtapPokoju | null) ?? "lobby";
  }

  private gracze(): WierszGracza[] {
    return this.sql
      .exec<WierszGracza>("SELECT * FROM gracze ORDER BY dolaczyl")
      .toArray();
  }

  /**
   * Opis dla prowadzącego — bez kart.
   *
   * Manitou zna wszystkie karty ze swojego pulpitu, więc nie ma powodu
   * wozić ich jeszcze raz przez sieć. Stąd tylko informacja, czy karta
   * została wydana i czy gracz ją potwierdził.
   */
  private opiszGraczy(): GraczWPokoju[] {
    return this.gracze().map((g) => ({
      id: g.id,
      nazwa: g.nazwa,
      dolaczyl: g.dolaczyl,
      miejsce: g.miejsce,
      maKarte: g.rola !== null,
      widzial: g.widzial,
      ujawniony: g.ujawniony !== null,
    }));
  }

  private stanPelny(): StanPokoju {
    return {
      kod: this.pole("kod") ?? "",
      etap: this.etap(),
      utworzono: Number(this.pole("utworzono") ?? 0),
      wygasa: Number(this.pole("wygasa") ?? 0),
      gracze: this.opiszGraczy(),
      wspolprowadzacy: this.wspolprowadzacy(),
      zaproszeniaAsysty: this.sql
        .exec<{ kod: string; poziom: string; wygasa: number; zuzyte_przez: string | null }>(
          "SELECT * FROM zaproszenia_asysty ORDER BY wygasa DESC"
        )
        .toArray()
        .map((z) => ({
          kod: z.kod,
          poziom: z.poziom as PoziomAsysty,
          wygasa: z.wygasa,
          zuzytePrzez: z.zuzyte_przez,
        })),
      zadania: this.zadania(),
      wersjaMigawki: this.wersjaMigawki(),
    };
  }

  /** Rozsyła stan do wszystkich otwartych połączeń Manitou. */
  private rozeslij(): void {
    const wiadomosc = JSON.stringify({ typ: "stan", stan: this.stanPelny() });
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(wiadomosc);
      } catch {
        /* zerwane połączenie posprząta webSocketClose */
      }
    }
  }

  private czyWlasciciel(uzytkownik: string): boolean {
    return this.pole("wlasciciel") === uzytkownik;
  }

  private wspolprowadzacy(): Wspolprowadzacy[] {
    return this.sql
      .exec<{ uzytkownik: string; nazwa: string; poziom: string; dolaczyl: number }>(
        "SELECT * FROM wspolprowadzacy ORDER BY dolaczyl"
      )
      .toArray()
      .map((w) => ({
        uzytkownik: w.uzytkownik,
        nazwa: w.nazwa,
        poziom: w.poziom as PoziomAsysty,
        dolaczyl: w.dolaczyl,
      }));
  }

  /** Poziom dostępu użytkownika: właściciel ma zawsze pełny. */
  private poziom(uzytkownik: string): PoziomAsysty | "wlasciciel" | null {
    if (this.czyWlasciciel(uzytkownik)) return "wlasciciel";
    const w = this.sql
      .exec<{ poziom: string }>("SELECT poziom FROM wspolprowadzacy WHERE uzytkownik = ?", uzytkownik)
      .toArray()[0];
    return w ? (w.poziom as PoziomAsysty) : null;
  }

  /** Czy wolno choćby zaglądać — właściciel albo dowolny współprowadzący. */
  private czyWidzi(uzytkownik: string): boolean {
    return this.poziom(uzytkownik) !== null;
  }

  private zadania(): Zadanie[] {
    return this.sql
      .exec<{
        id: string;
        od: string;
        od_nazwa: string;
        opis: string;
        bazowa_wersja: number;
        utworzono: number;
      }>("SELECT id, od, od_nazwa, opis, bazowa_wersja, utworzono FROM zadania ORDER BY utworzono")
      .toArray()
      .map((z) => ({
        id: z.id,
        od: z.od,
        odNazwa: z.od_nazwa,
        opis: JSON.parse(z.opis) as string[],
        bazowaWersja: z.bazowa_wersja,
        utworzono: z.utworzono,
      }));
  }

  private wersjaMigawki(): number {
    return Number(this.pole("wersjaMigawki") ?? 0);
  }

  // ————————————————————————— odczyt —————————————————————————

  /** Czy pokój w ogóle istnieje — tyle wolno wiedzieć bez żadnego dostępu. */
  async stan(): Promise<{ istnieje: boolean; etap: EtapPokoju | null }> {
    return this.zalozony()
      ? { istnieje: true, etap: this.etap() }
      : { istnieje: false, etap: null };
  }

  async stanDlaManitou(uzytkownik: string): Promise<Wynik<StanPokoju>> {
    if (!this.zalozony()) return blad("Ten pokój nie istnieje.", 404);
    if (!this.czyWidzi(uzytkownik)) return blad("Nie masz dostępu do tej gry.", 403);
    return { ok: true, dane: this.stanPelny() };
  }

  /** Czym dana osoba jest w tym pokoju — do rozstrzygnięcia, co jej pokazać. */
  async mojaRola(
    uzytkownik: string
  ): Promise<Wynik<{ poziom: PoziomAsysty | "wlasciciel" | null; kod: string }>> {
    if (!this.zalozony()) return blad("Ten pokój nie istnieje.", 404);
    return { ok: true, dane: { poziom: this.poziom(uzytkownik), kod: this.pole("kod") ?? "" } };
  }

  // ————————————————————————— zakładanie —————————————————————————

  /**
   * Zakłada pokój pod kodem, którym adresowany jest ten obiekt.
   *
   * Odmowa przy zajętym kodzie jest jednocześnie testem kolizji: Worker losuje
   * kod, próbuje założyć i przy odmowie losuje następny.
   */
  async zaloz(kod: string, uzytkownik: string): Promise<Wynik<StanPokoju>> {
    if (this.zalozony()) return blad("Ten kod jest już zajęty.", 409);
    const teraz = Date.now();
    this.ustaw("kod", kod);
    this.ustaw("wlasciciel", uzytkownik);
    this.ustaw("etap", "lobby");
    this.ustaw("utworzono", String(teraz));
    this.ustaw("wygasa", String(teraz + WAZNOSC_POKOJU_MS));
    // Po dobie pokój znika razem z imionami i kartami.
    await this.ctx.storage.setAlarm(teraz + WAZNOSC_POKOJU_MS);
    return { ok: true, dane: this.stanPelny() };
  }

  /** Kasuje pokój — na żądanie Manitou albo po dobie. */
  async zamknijNaZawsze(uzytkownik: string | null): Promise<Wynik<null>> {
    if (uzytkownik !== null && !this.czyWlasciciel(uzytkownik)) {
      return blad("To nie jest twój pokój.", 403);
    }
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.close(1000, "pokoj zamkniety");
      } catch {
        /* i tak znika */
      }
    }
    await this.ctx.storage.deleteAll();
    // `deleteAll` usuwa również tabele, a działający obiekt nie przechodzi
    // ponownie przez konstruktor — bez odtworzenia schematu następne pytanie
    // o ten pokój kończyłoby się błędem SQLITE zamiast odpowiedzią „nie ma”.
    this.migruj();
    return { ok: true, dane: null };
  }

  async alarm(): Promise<void> {
    await this.zamknijNaZawsze(null);
  }

  // ————————————————————————— gracze —————————————————————————

  /**
   * Dołączenie do puli.
   *
   * Tożsamość gracza to losowy klucz z jego przeglądarki. Trzymamy jego skrót,
   * żeby zawartość bazy pokoju nie była zbiorem cudzych sekretów.
   */
  async dolacz(token: string, nazwa: string): Promise<Wynik<StanGracza>> {
    if (!this.zalozony()) return blad("Ten pokój nie istnieje.", 404);

    const skrot = await sha256Hex(token);
    const istniejacy = this.sql
      .exec<WierszGracza>("SELECT * FROM gracze WHERE token = ?", skrot)
      .toArray()[0];
    // Powrót po odświeżeniu strony nie jest nowym dołączeniem.
    if (istniejacy) return { ok: true, dane: this.stanDlaSkrotu(skrot) };

    const etap = this.etap();
    if (!moznaDolaczyc(etap)) return blad(powodOdmowy(etap), 409);

    const zajete = this.gracze().map((g) => g.nazwa);
    const sprawdzenie = sprawdzImie(nazwa, zajete);
    if (!sprawdzenie.ok) return blad(sprawdzenie.powod, 409);

    this.sql.exec(
      "INSERT INTO gracze (id, token, nazwa, dolaczyl, miejsce) VALUES (?, ?, ?, ?, NULL)",
      doBase64Url(crypto.getRandomValues(new Uint8Array(8))),
      skrot,
      sprawdzenie.imie,
      Date.now()
    );
    this.rozeslij();
    return { ok: true, dane: this.stanDlaSkrotu(skrot) };
  }

  /** Skład rozgrywki, posortowany, żeby nie niósł informacji o miejscach. */
  private sklad(): string[] {
    if (this.etap() !== "rozdane") return [];
    return this.gracze()
      .map((g) => g.rola)
      .filter((r): r is string => !!r)
      .sort();
  }

  private stanDlaSkrotu(skrot: string): StanGracza {
    const wszyscy = this.gracze();
    const ja = wszyscy.find((g) => g.token === skrot) ?? null;
    return {
      kod: this.pole("kod") ?? "",
      etap: this.etap(),
      ja: ja
        ? {
            id: ja.id,
            nazwa: ja.nazwa,
            miejsce: ja.miejsce,
            // Karta wychodzi dopiero po wydaniu i tylko do właściciela klucza.
            rola: this.etap() === "rozdane" ? ja.rola : null,
            widzial: ja.widzial,
          }
        : null,
      imiona: wszyscy.map((g) => g.nazwa),
      sklad: this.sklad(),
      ujawnieni: wszyscy
        .filter((g) => g.ujawniony !== null && g.rola)
        .sort((a, b) => (a.ujawniony ?? 0) - (b.ujawniony ?? 0))
        .map((g) => ({ rola: g.rola as string, imie: g.nazwa })),
    };
  }

  async stanDlaGracza(token: string): Promise<Wynik<StanGracza>> {
    if (!this.zalozony()) return blad("Ten pokój nie istnieje.", 404);
    return { ok: true, dane: this.stanDlaSkrotu(await sha256Hex(token)) };
  }

  /** Sadza gracza na wskazanym miejscu albo zdejmuje go z powrotem do puli. */
  async usadz(uzytkownik: string, idGracza: string, miejsce: number | null): Promise<Wynik<StanPokoju>> {
    if (!this.zalozony()) return blad("Ten pokój nie istnieje.", 404);
    if (!this.czyWlasciciel(uzytkownik)) return blad("To nie jest twój pokój.", 403);

    if (miejsce !== null) {
      const zajmujacy = this.sql
        .exec<WierszGracza>("SELECT * FROM gracze WHERE miejsce = ? AND id != ?", miejsce, idGracza)
        .toArray()[0];
      // Zamiana miejscami zamiast odmowy — przeciąganie na zajęte miejsce
      // to naturalny sposób zmiany kolejności przy stole.
      if (zajmujacy) {
        const moje = this.sql
          .exec<WierszGracza>("SELECT miejsce FROM gracze WHERE id = ?", idGracza)
          .toArray()[0];
        this.sql.exec("UPDATE gracze SET miejsce = ? WHERE id = ?", moje?.miejsce ?? null, zajmujacy.id);
      }
    }
    this.sql.exec("UPDATE gracze SET miejsce = ? WHERE id = ?", miejsce, idGracza);
    this.rozeslij();
    return { ok: true, dane: this.stanPelny() };
  }

  async przemianuj(uzytkownik: string, idGracza: string, nazwa: string): Promise<Wynik<StanPokoju>> {
    if (!this.czyWlasciciel(uzytkownik)) return blad("To nie jest twój pokój.", 403);
    const zajete = this.gracze().filter((g) => g.id !== idGracza).map((g) => g.nazwa);
    const sprawdzenie = sprawdzImie(nazwa, zajete);
    if (!sprawdzenie.ok) return blad(sprawdzenie.powod, 409);
    this.sql.exec("UPDATE gracze SET nazwa = ? WHERE id = ?", sprawdzenie.imie, idGracza);
    this.rozeslij();
    return { ok: true, dane: this.stanPelny() };
  }

  async wyrzuc(uzytkownik: string, idGracza: string): Promise<Wynik<StanPokoju>> {
    if (!this.czyWlasciciel(uzytkownik)) return blad("To nie jest twój pokój.", 403);
    this.sql.exec("DELETE FROM gracze WHERE id = ?", idGracza);
    this.rozeslij();
    return { ok: true, dane: this.stanPelny() };
  }

  /** Zamyka albo otwiera zapisy. Po rozdaniu kart nie ma już powrotu. */
  async ustawEtap(uzytkownik: string, etap: EtapPokoju): Promise<Wynik<StanPokoju>> {
    if (!this.czyWlasciciel(uzytkownik)) return blad("To nie jest twój pokój.", 403);
    if (this.etap() === "rozdane" && etap !== "rozdane") {
      return blad("Karty są rozdane — zacznij nową rundę, żeby zmienić zapisy.", 409);
    }
    this.ustaw("etap", etap);
    this.rozeslij();
    return { ok: true, dane: this.stanPelny() };
  }

  // ————————————————————————— karty —————————————————————————

  /**
   * Zapisuje rozdanie i wydaje karty na telefony.
   *
   * Losowanie zostaje po stronie prowadzącego: zna wszystkie karty tak czy
   * inaczej, a dzięki temu całe dotychczasowe UI wyboru ról działa bez zmian.
   * Pokój jest tu serwerem projekcji — pilnuje, żeby każdy dostał wyłącznie
   * swoją kartę.
   */
  async rozdaj(
    uzytkownik: string,
    przypisania: { gracz: string; rola: string }[]
  ): Promise<Wynik<StanPokoju>> {
    if (!this.zalozony()) return blad("Ten pokój nie istnieje.", 404);
    if (!this.czyWlasciciel(uzytkownik)) return blad("To nie jest twój pokój.", 403);
    if (przypisania.length === 0) return blad("Nie ma czego rozdawać.");

    const znani = new Set(this.gracze().map((g) => g.id));
    for (const { gracz, rola } of przypisania) {
      if (!znani.has(gracz)) continue;
      if (typeof rola !== "string" || rola.length > 64) continue;
      this.sql.exec(
        "UPDATE gracze SET rola = ?, widzial = NULL, ujawniony = NULL WHERE id = ?",
        rola,
        gracz
      );
    }
    this.ustaw("etap", "rozdane");
    this.rozeslij();
    return { ok: true, dane: this.stanPelny() };
  }

  /**
   * Odkrywa karty zmarłych.
   *
   * Świadomie osobna akcja, a nie skutek śmierci: gdyby pokój dowiadywał się
   * o niej w chwili zabicia, telefony ujawniłyby nocne ofiary, zanim Manitou
   * zdąży ogłosić poranek. Publikujemy wtedy, kiedy karta idzie na stół.
   */
  async ujawnij(uzytkownik: string, gracze: string[]): Promise<Wynik<StanPokoju>> {
    if (!this.zalozony()) return blad("Ten pokój nie istnieje.", 404);
    if (!this.czyWlasciciel(uzytkownik)) return blad("To nie jest twój pokój.", 403);
    const teraz = Date.now();
    for (const id of gracze) {
      this.sql.exec(
        "UPDATE gracze SET ujawniony = ? WHERE id = ? AND ujawniony IS NULL AND rola IS NOT NULL",
        teraz,
        id
      );
    }
    this.rozeslij();
    return { ok: true, dane: this.stanPelny() };
  }

  /** Gracz potwierdza, że obejrzał kartę — prowadzący wie, kiedy zaczynać. */
  async potwierdz(token: string): Promise<Wynik<StanGracza>> {
    if (!this.zalozony()) return blad("Ten pokój nie istnieje.", 404);
    const skrot = await sha256Hex(token);
    this.sql.exec(
      "UPDATE gracze SET widzial = ? WHERE token = ? AND widzial IS NULL",
      Date.now(),
      skrot
    );
    this.rozeslij();
    return { ok: true, dane: this.stanDlaSkrotu(skrot) };
  }

  /**
   * Nowa rozgrywka z tym samym składem i tym samym kodem.
   *
   * Karty znikają, ludzie i ich miejsca zostają — nikt nie musi wpisywać
   * kodu ani imienia od nowa, a telefony same wrócą do poczekalni.
   */
  async nowaRunda(uzytkownik: string): Promise<Wynik<StanPokoju>> {
    if (!this.zalozony()) return blad("Ten pokój nie istnieje.", 404);
    if (!this.czyWlasciciel(uzytkownik)) return blad("To nie jest twój pokój.", 403);
    this.sql.exec("UPDATE gracze SET rola = NULL, widzial = NULL, ujawniony = NULL");
    // Prośby dotyczyły zakończonej partii i po niej nie mają sensu.
    this.sql.exec("DELETE FROM zadania");
    this.ustaw("etap", "zamkniete");
    // Doba liczy się od nowa — nowa rozgrywka to nowy wieczór.
    const wygasa = Date.now() + WAZNOSC_POKOJU_MS;
    this.ustaw("wygasa", String(wygasa));
    await this.ctx.storage.setAlarm(wygasa);
    this.rozeslij();
    return { ok: true, dane: this.stanPelny() };
  }


  // ————————————————————— drugi prowadzący —————————————————————

  /**
   * Wystawia kod zaproszenia dla drugiego prowadzącego.
   *
   * Kod jest inny niż ten do gry i dłuższy, bo daje wgląd we wszystkie karty,
   * a nie tylko wstęp do poczekalni.
   */
  async zaproszenieAsysty(
    uzytkownik: string,
    poziom: PoziomAsysty
  ): Promise<Wynik<{ kod: string; wygasa: number }>> {
    if (!this.zalozony()) return blad("Ten pokój nie istnieje.", 404);
    if (!this.czyWlasciciel(uzytkownik)) return blad("To nie jest twój pokój.", 403);
    if (poziom !== "odczyt" && poziom !== "zapis") return blad("Nieznany poziom dostępu.");

    const kod = losujKodAsysty();
    const wygasa = Date.now() + WAZNOSC_POKOJU_MS;
    this.sql.exec(
      "INSERT INTO zaproszenia_asysty (kod, poziom, wygasa) VALUES (?, ?, ?)",
      rdzenKodu(kod),
      poziom,
      wygasa
    );
    this.rozeslij();
    return { ok: true, dane: { kod, wygasa } };
  }

  async cofnijZaproszenieAsysty(uzytkownik: string, kod: string): Promise<Wynik<StanPokoju>> {
    if (!this.czyWlasciciel(uzytkownik)) return blad("To nie jest twój pokój.", 403);
    this.sql.exec(
      "DELETE FROM zaproszenia_asysty WHERE kod = ? AND zuzyte_przez IS NULL",
      rdzenKodu(kod)
    );
    this.rozeslij();
    return { ok: true, dane: this.stanPelny() };
  }

  /** Dołącza drugiego prowadzącego na podstawie kodu. */
  async dolaczJakoAsysta(
    uzytkownik: string,
    nazwa: string,
    kod: string
  ): Promise<Wynik<{ poziom: PoziomAsysty }>> {
    if (!this.zalozony()) return blad("Nie ma gry o tym kodzie.", 404);
    if (this.czyWlasciciel(uzytkownik)) return blad("To twoja własna gra.", 409);

    const juz = this.sql
      .exec<{ poziom: string }>("SELECT poziom FROM wspolprowadzacy WHERE uzytkownik = ?", uzytkownik)
      .toArray()[0];
    // Powrót po odświeżeniu nie jest nowym dołączeniem i nie zużywa kodu.
    if (juz) return { ok: true, dane: { poziom: juz.poziom as PoziomAsysty } };

    const z = this.sql
      .exec<{ poziom: string; wygasa: number; zuzyte_przez: string | null }>(
        "SELECT poziom, wygasa, zuzyte_przez FROM zaproszenia_asysty WHERE kod = ?",
        rdzenKodu(kod)
      )
      .toArray()[0];
    if (!z) return blad("Nie ma takiego zaproszenia.", 403);
    if (z.zuzyte_przez) return blad("To zaproszenie zostało już wykorzystane.", 403);
    if (z.wygasa < Date.now()) return blad("To zaproszenie straciło ważność.", 403);

    const teraz = Date.now();
    this.sql.exec(
      "INSERT INTO wspolprowadzacy (uzytkownik, nazwa, poziom, dolaczyl) VALUES (?, ?, ?, ?)",
      uzytkownik,
      nazwa,
      z.poziom,
      teraz
    );
    this.sql.exec(
      "UPDATE zaproszenia_asysty SET zuzyte_przez = ? WHERE kod = ?",
      uzytkownik,
      rdzenKodu(kod)
    );
    this.rozeslij();
    return { ok: true, dane: { poziom: z.poziom as PoziomAsysty } };
  }

  async odbierzAsyste(uzytkownik: string, komu: string): Promise<Wynik<StanPokoju>> {
    if (!this.czyWlasciciel(uzytkownik)) return blad("To nie jest twój pokój.", 403);
    this.sql.exec("DELETE FROM wspolprowadzacy WHERE uzytkownik = ?", komu);
    this.sql.exec("DELETE FROM zadania WHERE od = ?", komu);
    this.rozeslij();
    return { ok: true, dane: this.stanPelny() };
  }

  // ————————————————————— migawka stanu gry —————————————————————

  /**
   * Zapisuje stan gry do wglądu dla asysty.
   *
   * Wolno to wyłącznie właścicielowi: jego urządzenie trzyma stan i jest
   * jedynym miejscem, w którym gra naprawdę się toczy. Pokój tylko powiela
   * ten stan dalej.
   */
  async zapiszMigawke(uzytkownik: string, stan: unknown): Promise<Wynik<{ wersja: number }>> {
    if (!this.zalozony()) return blad("Ten pokój nie istnieje.", 404);
    if (!this.czyWlasciciel(uzytkownik)) return blad("Stan zapisuje tylko główny prowadzący.", 403);

    const wersja = this.wersjaMigawki() + 1;
    this.ustaw("migawka", JSON.stringify(stan));
    this.ustaw("wersjaMigawki", String(wersja));
    this.ustaw("migawkaKiedy", String(Date.now()));
    this.rozeslij();
    return { ok: true, dane: { wersja } };
  }

  async pobierzMigawke(
    uzytkownik: string
  ): Promise<Wynik<{ wersja: number; kiedy: number; stan: unknown | null }>> {
    if (!this.zalozony()) return blad("Ten pokój nie istnieje.", 404);
    if (!this.czyWidzi(uzytkownik)) return blad("Nie masz dostępu do tej gry.", 403);
    const surowa = this.pole("migawka");
    return {
      ok: true,
      dane: {
        wersja: this.wersjaMigawki(),
        kiedy: Number(this.pole("migawkaKiedy") ?? 0),
        stan: surowa ? (JSON.parse(surowa) as unknown) : null,
      },
    };
  }

  // ————————————————————— prośby asysty —————————————————————

  /**
   * Przyjmuje prośbę o zmianę stanu. Sama niczego nie zmienia — dopóki główny
   * prowadzący jej nie zatwierdzi, obowiązuje dotychczasowa migawka.
   */
  async zglosZadanie(
    uzytkownik: string,
    opis: string[],
    stan: unknown,
    bazowaWersja: number
  ): Promise<Wynik<{ id: string }>> {
    if (!this.zalozony()) return blad("Ten pokój nie istnieje.", 404);
    const poziom = this.poziom(uzytkownik);
    if (poziom === null) return blad("Nie masz dostępu do tej gry.", 403);
    if (poziom === "odczyt") return blad("Masz dostęp tylko do podglądu.", 403);
    if (poziom === "wlasciciel") return blad("Główny prowadzący zmienia stan wprost.", 409);

    const ja = this.sql
      .exec<{ nazwa: string }>("SELECT nazwa FROM wspolprowadzacy WHERE uzytkownik = ?", uzytkownik)
      .toArray()[0];

    const id = doBase64Url(crypto.getRandomValues(new Uint8Array(8)));
    this.sql.exec(
      `INSERT INTO zadania (id, od, od_nazwa, opis, stan, bazowa_wersja, utworzono)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id,
      uzytkownik,
      ja?.nazwa ?? "asysta",
      JSON.stringify(opis.slice(0, 40)),
      JSON.stringify(stan),
      bazowaWersja,
      Date.now()
    );
    this.rozeslij();
    return { ok: true, dane: { id } };
  }

  /** Zwraca stan zaproponowany przez asystenta, żeby główny mógł go przyjąć. */
  async trescZadania(uzytkownik: string, id: string): Promise<Wynik<{ stan: unknown; bazowaWersja: number }>> {
    if (!this.czyWlasciciel(uzytkownik)) return blad("To nie jest twój pokój.", 403);
    const z = this.sql
      .exec<{ stan: string; bazowa_wersja: number }>(
        "SELECT stan, bazowa_wersja FROM zadania WHERE id = ?",
        id
      )
      .toArray()[0];
    if (!z) return blad("Tej prośby już nie ma.", 404);
    return { ok: true, dane: { stan: JSON.parse(z.stan), bazowaWersja: z.bazowa_wersja } };
  }

  /** Zdejmuje prośbę z kolejki — po przyjęciu albo odrzuceniu. */
  async zamknijZadanie(uzytkownik: string, id: string): Promise<Wynik<StanPokoju>> {
    if (!this.czyWlasciciel(uzytkownik)) return blad("To nie jest twój pokój.", 403);
    this.sql.exec("DELETE FROM zadania WHERE id = ?", id);
    this.rozeslij();
    return { ok: true, dane: this.stanPelny() };
  }

  /** Asystent może wycofać własną prośbę, dopóki nikt jej nie rozstrzygnął. */
  async wycofajZadanie(uzytkownik: string, id: string): Promise<Wynik<null>> {
    this.sql.exec("DELETE FROM zadania WHERE id = ? AND od = ?", id, uzytkownik);
    this.rozeslij();
    return { ok: true, dane: null };
  }

  // ————————————————————————— WebSocket —————————————————————————

  /**
   * Podłącza Manitou do podglądu na żywo.
   *
   * Przejście na WebSocket idzie przez `fetch`, a nie przez metodę RPC —
   * odpowiedź 101 z gniazdem musi wrócić tą samą drogą, którą przyszło żądanie.
   * Tożsamość dokłada Worker w nagłówku; do obiektu nie da się dostać inaczej.
   *
   * Stan czytamy z bazy przy każdej wiadomości, nie z pola klasy: obiekt bywa
   * usypiany między zdarzeniami i traci wtedy pamięć, zachowując połączenia.
   */
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("upgrade") !== "websocket") {
      return new Response("Ta trasa wymaga WebSocketa.", { status: 426 });
    }
    const uzytkownik = request.headers.get("x-ktulu-uzytkownik") ?? "";
    if (!this.zalozony()) return new Response("Ten pokój nie istnieje.", { status: 404 });
    // Współprowadzący też patrzą na żywo — bez tego asysta nie wiedziałaby,
    // że stan się zmienił, dopóki sama o to nie zapyta.
    if (!this.czyWidzi(uzytkownik)) {
      return new Response("Nie masz dostępu do tej gry.", { status: 403 });
    }

    const para = new WebSocketPair();
    this.ctx.acceptWebSocket(para[1]);
    para[1].send(JSON.stringify({ typ: "stan", stan: this.stanPelny() }));
    return new Response(null, { status: 101, webSocket: para[0] });
  }

  async webSocketMessage(ws: WebSocket, wiadomosc: string | ArrayBuffer): Promise<void> {
    if (typeof wiadomosc !== "string") return;
    // Jedyne, o co klient prosi, to świeży stan; resztą sterują zwykłe żądania.
    if (wiadomosc === "odswiez") ws.send(JSON.stringify({ typ: "stan", stan: this.stanPelny() }));
  }

  async webSocketClose(ws: WebSocket, kod: number, powod: string): Promise<void> {
    try {
      ws.close(kod === 1006 ? 1000 : kod, powod);
    } catch {
      /* już zamknięty */
    }
  }
}
