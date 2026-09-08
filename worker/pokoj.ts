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
}

export interface StanPokoju {
  kod: string;
  etap: EtapPokoju;
  utworzono: number;
  wygasa: number;
  gracze: GraczWPokoju[];
}

/** To, co widzi gracz: własne dane i tyle o pokoju, ile mu potrzebne. */
export interface StanGracza {
  kod: string;
  etap: EtapPokoju;
  ja: { id: string; nazwa: string; miejsce: number | null } | null;
  /** Imiona pozostałych — jawne i tak, bo wszyscy siedzą przy jednym stole. */
  imiona: string[];
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
        widzial INTEGER
      );
    `);
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

  private opiszGraczy(): GraczWPokoju[] {
    return this.gracze().map((g) => ({
      id: g.id,
      nazwa: g.nazwa,
      dolaczyl: g.dolaczyl,
      miejsce: g.miejsce,
    }));
  }

  private stanPelny(): StanPokoju {
    return {
      kod: this.pole("kod") ?? "",
      etap: this.etap(),
      utworzono: Number(this.pole("utworzono") ?? 0),
      wygasa: Number(this.pole("wygasa") ?? 0),
      gracze: this.opiszGraczy(),
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

  // ————————————————————————— odczyt —————————————————————————

  /** Czy pokój w ogóle istnieje — tyle wolno wiedzieć bez żadnego dostępu. */
  async stan(): Promise<{ istnieje: boolean; etap: EtapPokoju | null }> {
    return this.zalozony()
      ? { istnieje: true, etap: this.etap() }
      : { istnieje: false, etap: null };
  }

  async stanDlaManitou(uzytkownik: string): Promise<Wynik<StanPokoju>> {
    if (!this.zalozony()) return blad("Ten pokój nie istnieje.", 404);
    if (!this.czyWlasciciel(uzytkownik)) return blad("To nie jest twój pokój.", 403);
    return { ok: true, dane: this.stanPelny() };
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

  private stanDlaSkrotu(skrot: string): StanGracza {
    const wszyscy = this.gracze();
    const ja = wszyscy.find((g) => g.token === skrot) ?? null;
    return {
      kod: this.pole("kod") ?? "",
      etap: this.etap(),
      ja: ja ? { id: ja.id, nazwa: ja.nazwa, miejsce: ja.miejsce } : null,
      imiona: wszyscy.map((g) => g.nazwa),
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
      return blad("Karty są już rozdane — zapisów nie da się otworzyć z powrotem.", 409);
    }
    this.ustaw("etap", etap);
    this.rozeslij();
    return { ok: true, dane: this.stanPelny() };
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
    if (!this.czyWlasciciel(uzytkownik)) {
      return new Response("To nie jest twój pokój.", { status: 403 });
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
