/**
 * Konta Manitou — jeden Durable Object na całą instalację.
 *
 * Świadomie nie ma tu D1: namespace Durable Objecta powstaje sam przy deployu,
 * więc nie trzeba zakładać zasobu w panelu ani przepisywać jego identyfikatora
 * do konfiguracji. Ruchu jest tyle, co przy kilku kontach prowadzących, więc
 * szeregowa obsługa w jednym obiekcie niczego nie ogranicza.
 *
 * Sesje są nieprzezroczystymi losowymi identyfikatorami zapisanymi w bazie,
 * nie podpisanymi ciasteczkami — nie ma wtedy klucza podpisującego, który
 * trzeba by trzymać w konfiguracji i którego utrata wylogowałaby wszystkich.
 */

import { DurableObject } from "cloudflare:workers";

import type { Env } from "./srodowisko";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";

import { doBase64Url, naBajty, rowneStalyCzas, sha256Hex, zBase64Url } from "./bytes";
import { losujKodRejestracji, losujZnaki, rdzenKodu } from "../src/lib/kody";

export type Rola = "admin" | "manitou";

export interface Uzytkownik {
  id: string;
  nazwa: string;
  rola: Rola;
  utworzono: number;
  liczbaKluczy: number;
  /** Klucze zapisane pod inną domeną niż obecna — nie da się nimi zalogować. */
  kluczeZInnejDomeny: number;
}

export interface Zaproszenie {
  kod: string;
  rola: Rola;
  wygasa: number;
  zuzytePrzez: string | null;
}

/** Kontekst potrzebny do weryfikacji odpowiedzi przeglądarki. */
export interface KontekstWebAuthn {
  rpId: string;
  rpName: string;
  origin: string;
}

export type Wynik<T> = { ok: true; dane: T } | { ok: false; powod: string; status: number };

const GODZINA = 60 * 60 * 1000;
const WAZNOSC_WYZWANIA = 5 * 60 * 1000;
const WAZNOSC_SESJI = 30 * 24 * GODZINA;
const WAZNOSC_ZAPROSZENIA = 14 * 24 * GODZINA;

const blad = (powod: string, status = 400): { ok: false; powod: string; status: number } => ({
  ok: false,
  powod,
  status,
});

interface WierszUzytkownika extends Record<string, SqlStorageValue> {
  id: string;
  nazwa: string;
  rola: string;
  utworzono: number;
}

interface WierszKlucza extends Record<string, SqlStorageValue> {
  id: string;
  uzytkownik: string;
  klucz_publiczny: string;
  licznik: number;
  transports: string | null;
  rp_id: string;
}

export class Konta extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Migracja musi się skończyć, zanim obiekt obsłuży cokolwiek innego.
    ctx.blockConcurrencyWhile(async () => this.migruj());
  }

  private get sql() {
    return this.ctx.storage.sql;
  }

  private migruj(): void {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS uzytkownicy (
        id TEXT PRIMARY KEY,
        nazwa TEXT NOT NULL UNIQUE,
        rola TEXT NOT NULL,
        utworzono INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS klucze (
        id TEXT PRIMARY KEY,
        uzytkownik TEXT NOT NULL,
        klucz_publiczny TEXT NOT NULL,
        licznik INTEGER NOT NULL,
        transports TEXT,
        rp_id TEXT NOT NULL,
        nazwa TEXT,
        utworzono INTEGER NOT NULL,
        uzyto INTEGER
      );
      CREATE TABLE IF NOT EXISTS zaproszenia (
        kod TEXT PRIMARY KEY,
        rola TEXT NOT NULL,
        utworzyl TEXT,
        wygasa INTEGER NOT NULL,
        zuzyte_przez TEXT,
        zuzyte_kiedy INTEGER
      );
      CREATE TABLE IF NOT EXISTS sesje (
        id TEXT PRIMARY KEY,
        uzytkownik TEXT NOT NULL,
        utworzono INTEGER NOT NULL,
        wygasa INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS wyzwania (
        wyzwanie TEXT PRIMARY KEY,
        cel TEXT NOT NULL,
        kontekst TEXT,
        wygasa INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS zuzyte_bootstrapy (
        hash TEXT PRIMARY KEY,
        kiedy INTEGER NOT NULL
      );
    `);
  }

  /** Kasuje to, co i tak przestało obowiązywać. Wywoływane przy każdym wejściu. */
  private sprzataj(): void {
    const teraz = Date.now();
    this.sql.exec("DELETE FROM wyzwania WHERE wygasa < ?", teraz);
    this.sql.exec("DELETE FROM sesje WHERE wygasa < ?", teraz);
  }

  private liczbaKont(): number {
    const w = this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM uzytkownicy").one();
    return w.n;
  }

  private uzytkownikPoId(id: string): WierszUzytkownika | null {
    return (
      this.sql
        .exec<WierszUzytkownika>("SELECT * FROM uzytkownicy WHERE id = ?", id)
        .toArray()[0] ?? null
    );
  }

  private zapiszWyzwanie(wyzwanie: string, cel: string, kontekst: string | null): void {
    this.sql.exec(
      "INSERT INTO wyzwania (wyzwanie, cel, kontekst, wygasa) VALUES (?, ?, ?, ?)",
      wyzwanie,
      cel,
      kontekst,
      Date.now() + WAZNOSC_WYZWANIA
    );
  }

  /** Wyzwanie wolno zużyć tylko raz — zwraca kontekst albo null. */
  private zuzyjWyzwanie(wyzwanie: string, cel: string): { kontekst: string | null } | null {
    const w = this.sql
      .exec<{ kontekst: string | null; wygasa: number }>(
        "SELECT kontekst, wygasa FROM wyzwania WHERE wyzwanie = ? AND cel = ?",
        wyzwanie,
        cel
      )
      .toArray()[0];
    if (!w) return null;
    this.sql.exec("DELETE FROM wyzwania WHERE wyzwanie = ?", wyzwanie);
    if (w.wygasa < Date.now()) return null;
    return { kontekst: w.kontekst };
  }

  private utworzSesje(uzytkownik: string): { id: string; wygasa: number } {
    const id = doBase64Url(crypto.getRandomValues(new Uint8Array(32)));
    const teraz = Date.now();
    const wygasa = teraz + WAZNOSC_SESJI;
    this.sql.exec(
      "INSERT INTO sesje (id, uzytkownik, utworzono, wygasa) VALUES (?, ?, ?, ?)",
      id,
      uzytkownik,
      teraz,
      wygasa
    );
    return { id, wygasa };
  }

  private opisz(w: WierszUzytkownika, rpId: string): Uzytkownik {
    const klucze = this.sql
      .exec<{ rp_id: string }>("SELECT rp_id FROM klucze WHERE uzytkownik = ?", w.id)
      .toArray();
    return {
      id: w.id,
      nazwa: w.nazwa,
      rola: w.rola as Rola,
      utworzono: w.utworzono,
      liczbaKluczy: klucze.length,
      kluczeZInnejDomeny: klucze.filter((k) => k.rp_id !== rpId).length,
    };
  }

  // ————————————————————————— odczyt stanu —————————————————————————

  /** Czy w ogóle istnieje jakiekolwiek konto — decyduje o trybie bootstrapu. */
  async stan(): Promise<{ pusto: boolean; liczbaKont: number }> {
    const n = this.liczbaKont();
    return { pusto: n === 0, liczbaKont: n };
  }

  async ktoTo(idSesji: string | null, rpId: string): Promise<Uzytkownik | null> {
    if (!idSesji) return null;
    this.sprzataj();
    const s = this.sql
      .exec<{ uzytkownik: string }>(
        "SELECT uzytkownik FROM sesje WHERE id = ? AND wygasa > ?",
        idSesji,
        Date.now()
      )
      .toArray()[0];
    if (!s) return null;
    const u = this.uzytkownikPoId(s.uzytkownik);
    return u ? this.opisz(u, rpId) : null;
  }

  async wyloguj(idSesji: string | null): Promise<void> {
    if (idSesji) this.sql.exec("DELETE FROM sesje WHERE id = ?", idSesji);
  }

  // ————————————————————————— rejestracja —————————————————————————

  /**
   * Zaczyna rejestrację nowego konta.
   *
   * Kod pochodzi albo z zaproszenia wystawionego przez admina, albo — dopóki
   * nie ma ani jednego konta — z kodu bootstrapowego wypisanego w logu builda.
   * Drugi wariant sam przestaje działać po założeniu pierwszego konta, więc
   * nie trzeba pamiętać o jego wyłączeniu.
   */
  async rejestracjaStart(
    kodSurowy: string,
    nazwa: string,
    hashBootstrapu: string,
    kontekst: KontekstWebAuthn
  ): Promise<Wynik<PublicKeyCredentialCreationOptionsJSON>> {
    this.sprzataj();

    const czysteImie = nazwa.trim();
    if (czysteImie.length < 2 || czysteImie.length > 32) {
      return blad("Nazwa konta ma mieć od 2 do 32 znaków.");
    }
    const zajete = this.sql
      .exec<{ id: string }>("SELECT id FROM uzytkownicy WHERE lower(nazwa) = ?", czysteImie.toLowerCase())
      .toArray()[0];
    if (zajete) return blad("Taka nazwa konta już istnieje.", 409);

    const sprawdzenie = await this.sprawdzKodRejestracji(kodSurowy, hashBootstrapu);
    if (!sprawdzenie.ok) return sprawdzenie;

    const idUzytkownika = doBase64Url(crypto.getRandomValues(new Uint8Array(16)));
    const opcje = await generateRegistrationOptions({
      rpName: kontekst.rpName,
      rpID: kontekst.rpId,
      userName: czysteImie,
      userDisplayName: czysteImie,
      userID: naBajty(idUzytkownika),
      attestationType: "none",
      // Klucz odkrywalny — dzięki temu logowanie nie wymaga podawania nazwy.
      authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
    });

    this.zapiszWyzwanie(
      opcje.challenge,
      "rejestracja",
      JSON.stringify({ idUzytkownika, nazwa: czysteImie, rola: sprawdzenie.dane.rola, kod: sprawdzenie.dane.kod })
    );
    return { ok: true, dane: opcje };
  }

  private async sprawdzKodRejestracji(
    kodSurowy: string,
    hashBootstrapu: string
  ): Promise<Wynik<{ rola: Rola; kod: string | null }>> {
    const kod = rdzenKodu(kodSurowy ?? "");
    if (!kod) return blad("Podaj kod rejestracyjny.");

    // Wariant bootstrapowy działa tylko przy zupełnie pustej bazie kont.
    if (this.liczbaKont() === 0) {
      const hash = await sha256Hex(kod);
      const juzZuzyty = this.sql
        .exec<{ hash: string }>("SELECT hash FROM zuzyte_bootstrapy WHERE hash = ?", hash)
        .toArray()[0];
      if (!juzZuzyty && hashBootstrapu && rowneStalyCzas(hash, hashBootstrapu)) {
        return { ok: true, dane: { rola: "admin", kod: null } };
      }
    }

    const z = this.sql
      .exec<{ kod: string; rola: string; wygasa: number; zuzyte_przez: string | null }>(
        "SELECT kod, rola, wygasa, zuzyte_przez FROM zaproszenia WHERE kod = ?",
        kod
      )
      .toArray()[0];
    if (!z) return blad("Nie ma takiego kodu rejestracyjnego.", 403);
    if (z.zuzyte_przez) return blad("Ten kod został już wykorzystany.", 403);
    if (z.wygasa < Date.now()) return blad("Ten kod stracił ważność.", 403);
    return { ok: true, dane: { rola: z.rola as Rola, kod: z.kod } };
  }

  async rejestracjaKoniec(
    odpowiedz: RegistrationResponseJSON,
    hashBootstrapu: string,
    kontekst: KontekstWebAuthn
  ): Promise<Wynik<{ uzytkownik: Uzytkownik; sesja: { id: string; wygasa: number } }>> {
    const wyzwanie = odczytajWyzwanie(odpowiedz);
    if (!wyzwanie) return blad("Odpowiedź przeglądarki jest niekompletna.");

    const zapisane = this.zuzyjWyzwanie(wyzwanie, "rejestracja");
    if (!zapisane?.kontekst) return blad("Rejestracja wygasła — zacznij od nowa.", 408);
    const meta = JSON.parse(zapisane.kontekst) as {
      idUzytkownika: string;
      nazwa: string;
      rola: Rola;
      kod: string | null;
    };

    let wynik;
    try {
      wynik = await verifyRegistrationResponse({
        response: odpowiedz,
        expectedChallenge: wyzwanie,
        expectedOrigin: kontekst.origin,
        expectedRPID: kontekst.rpId,
        requireUserVerification: false,
      });
    } catch (e) {
      return blad(`Nie udało się zweryfikować klucza: ${(e as Error).message}`);
    }
    if (!wynik.verified || !wynik.registrationInfo) return blad("Klucz nie przeszedł weryfikacji.");

    // Warunki sprawdzone przy starcie mogły się zmienić, zanim użytkownik
    // dotknął czytnika — dlatego sprawdzamy je jeszcze raz przed zapisem.
    if (meta.kod === null) {
      if (this.liczbaKont() !== 0) return blad("Konto administratora już istnieje.", 409);
      this.sql.exec(
        "INSERT OR IGNORE INTO zuzyte_bootstrapy (hash, kiedy) VALUES (?, ?)",
        hashBootstrapu,
        Date.now()
      );
    } else {
      const z = this.sql
        .exec<{ zuzyte_przez: string | null }>(
          "SELECT zuzyte_przez FROM zaproszenia WHERE kod = ?",
          meta.kod
        )
        .toArray()[0];
      if (!z || z.zuzyte_przez) return blad("Ten kod został w międzyczasie wykorzystany.", 403);
    }
    const zajete = this.sql
      .exec<{ id: string }>("SELECT id FROM uzytkownicy WHERE lower(nazwa) = ?", meta.nazwa.toLowerCase())
      .toArray()[0];
    if (zajete) return blad("Taka nazwa konta już istnieje.", 409);

    const teraz = Date.now();
    this.sql.exec(
      "INSERT INTO uzytkownicy (id, nazwa, rola, utworzono) VALUES (?, ?, ?, ?)",
      meta.idUzytkownika,
      meta.nazwa,
      meta.rola,
      teraz
    );
    this.zapiszKlucz(meta.idUzytkownika, wynik.registrationInfo.credential, kontekst.rpId, odpowiedz);
    if (meta.kod !== null) {
      this.sql.exec(
        "UPDATE zaproszenia SET zuzyte_przez = ?, zuzyte_kiedy = ? WHERE kod = ?",
        meta.idUzytkownika,
        teraz,
        meta.kod
      );
    }

    const u = this.uzytkownikPoId(meta.idUzytkownika)!;
    return { ok: true, dane: { uzytkownik: this.opisz(u, kontekst.rpId), sesja: this.utworzSesje(u.id) } };
  }

  private zapiszKlucz(
    uzytkownik: string,
    credential: { id: string; publicKey: Uint8Array<ArrayBufferLike>; counter: number; transports?: string[] },
    rpId: string,
    odpowiedz: RegistrationResponseJSON
  ): void {
    this.sql.exec(
      `INSERT OR REPLACE INTO klucze
       (id, uzytkownik, klucz_publiczny, licznik, transports, rp_id, nazwa, utworzono, uzyto)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      credential.id,
      uzytkownik,
      doBase64Url(credential.publicKey),
      credential.counter,
      JSON.stringify(credential.transports ?? odpowiedz.response.transports ?? []),
      rpId,
      null,
      Date.now()
    );
  }

  // ————————————————————————— logowanie —————————————————————————

  async logowanieStart(
    kontekst: KontekstWebAuthn
  ): Promise<Wynik<PublicKeyCredentialRequestOptionsJSON>> {
    this.sprzataj();
    // Bez allowCredentials: klucz jest odkrywalny, więc przeglądarka sama
    // proponuje pasujące konto i nie trzeba podawać nazwy.
    const opcje = await generateAuthenticationOptions({
      rpID: kontekst.rpId,
      userVerification: "preferred",
    });
    this.zapiszWyzwanie(opcje.challenge, "logowanie", null);
    return { ok: true, dane: opcje };
  }

  async logowanieKoniec(
    odpowiedz: AuthenticationResponseJSON,
    kontekst: KontekstWebAuthn
  ): Promise<Wynik<{ uzytkownik: Uzytkownik; sesja: { id: string; wygasa: number } }>> {
    const wyzwanie = odczytajWyzwanie(odpowiedz);
    if (!wyzwanie) return blad("Odpowiedź przeglądarki jest niekompletna.");
    if (!this.zuzyjWyzwanie(wyzwanie, "logowanie")) {
      return blad("Logowanie wygasło — spróbuj jeszcze raz.", 408);
    }

    const k = this.sql
      .exec<WierszKlucza>("SELECT * FROM klucze WHERE id = ?", odpowiedz.id)
      .toArray()[0];
    if (!k) return blad("Ten klucz nie jest przypisany do żadnego konta.", 403);
    if (k.rp_id !== kontekst.rpId) {
      return blad(
        "Klucz został zapisany pod inną domeną i przestał działać po jej zmianie. Poproś administratora o nowy kod rejestracyjny.",
        403
      );
    }

    let wynik;
    try {
      wynik = await verifyAuthenticationResponse({
        response: odpowiedz,
        expectedChallenge: wyzwanie,
        expectedOrigin: kontekst.origin,
        expectedRPID: kontekst.rpId,
        requireUserVerification: false,
        credential: {
          id: k.id,
          publicKey: zBase64Url(k.klucz_publiczny),
          counter: k.licznik,
          transports: JSON.parse(k.transports ?? "[]"),
        },
      });
    } catch (e) {
      return blad(`Nie udało się zweryfikować klucza: ${(e as Error).message}`);
    }
    if (!wynik.verified) return blad("Klucz nie przeszedł weryfikacji.", 403);

    this.sql.exec(
      "UPDATE klucze SET licznik = ?, uzyto = ? WHERE id = ?",
      wynik.authenticationInfo.newCounter,
      Date.now(),
      k.id
    );
    const u = this.uzytkownikPoId(k.uzytkownik);
    if (!u) return blad("Konto powiązane z tym kluczem już nie istnieje.", 403);
    return { ok: true, dane: { uzytkownik: this.opisz(u, kontekst.rpId), sesja: this.utworzSesje(u.id) } };
  }

  // ————————————————————— dokładanie kolejnego klucza —————————————————————

  /** Passkey siedzi na urządzeniu, więc konto bez drugiego klucza ginie razem z telefonem. */
  async dodanieKluczaStart(
    idSesji: string | null,
    kontekst: KontekstWebAuthn
  ): Promise<Wynik<PublicKeyCredentialCreationOptionsJSON>> {
    const ja = await this.ktoTo(idSesji, kontekst.rpId);
    if (!ja) return blad("Trzeba być zalogowanym.", 401);

    const posiadane = this.sql
      .exec<{ id: string; transports: string | null }>(
        "SELECT id, transports FROM klucze WHERE uzytkownik = ?",
        ja.id
      )
      .toArray();
    const opcje = await generateRegistrationOptions({
      rpName: kontekst.rpName,
      rpID: kontekst.rpId,
      userName: ja.nazwa,
      userDisplayName: ja.nazwa,
      userID: naBajty(ja.id),
      attestationType: "none",
      // Bez tego można by dwa razy zapisać ten sam klucz z tego samego urządzenia.
      excludeCredentials: posiadane.map((k) => ({
        id: k.id,
        transports: JSON.parse(k.transports ?? "[]"),
      })),
      authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
    });
    this.zapiszWyzwanie(opcje.challenge, "dodanie-klucza", ja.id);
    return { ok: true, dane: opcje };
  }

  async dodanieKluczaKoniec(
    idSesji: string | null,
    odpowiedz: RegistrationResponseJSON,
    kontekst: KontekstWebAuthn
  ): Promise<Wynik<{ uzytkownik: Uzytkownik }>> {
    const ja = await this.ktoTo(idSesji, kontekst.rpId);
    if (!ja) return blad("Trzeba być zalogowanym.", 401);

    const wyzwanie = odczytajWyzwanie(odpowiedz);
    if (!wyzwanie) return blad("Odpowiedź przeglądarki jest niekompletna.");
    const zapisane = this.zuzyjWyzwanie(wyzwanie, "dodanie-klucza");
    if (!zapisane || zapisane.kontekst !== ja.id) {
      return blad("Dodawanie klucza wygasło — zacznij od nowa.", 408);
    }

    let wynik;
    try {
      wynik = await verifyRegistrationResponse({
        response: odpowiedz,
        expectedChallenge: wyzwanie,
        expectedOrigin: kontekst.origin,
        expectedRPID: kontekst.rpId,
        requireUserVerification: false,
      });
    } catch (e) {
      return blad(`Nie udało się zweryfikować klucza: ${(e as Error).message}`);
    }
    if (!wynik.verified || !wynik.registrationInfo) return blad("Klucz nie przeszedł weryfikacji.");

    this.zapiszKlucz(ja.id, wynik.registrationInfo.credential, kontekst.rpId, odpowiedz);
    const u = this.uzytkownikPoId(ja.id)!;
    return { ok: true, dane: { uzytkownik: this.opisz(u, kontekst.rpId) } };
  }

  // ————————————————————————— administracja —————————————————————————

  private async wymagajAdmina(idSesji: string | null, rpId: string): Promise<Wynik<Uzytkownik>> {
    const ja = await this.ktoTo(idSesji, rpId);
    if (!ja) return blad("Trzeba być zalogowanym.", 401);
    if (ja.rola !== "admin") return blad("To może zrobić tylko administrator.", 403);
    return { ok: true, dane: ja };
  }

  async listaKont(
    idSesji: string | null,
    rpId: string
  ): Promise<Wynik<{ uzytkownicy: Uzytkownik[]; zaproszenia: Zaproszenie[] }>> {
    const admin = await this.wymagajAdmina(idSesji, rpId);
    if (!admin.ok) return admin;
    this.sprzataj();
    const uzytkownicy = this.sql
      .exec<WierszUzytkownika>("SELECT * FROM uzytkownicy ORDER BY utworzono")
      .toArray()
      .map((u) => this.opisz(u, rpId));
    const zaproszenia = this.sql
      .exec<{ kod: string; rola: string; wygasa: number; zuzyte_przez: string | null }>(
        "SELECT kod, rola, wygasa, zuzyte_przez FROM zaproszenia ORDER BY wygasa DESC"
      )
      .toArray()
      .map((z) => ({
        kod: z.kod,
        rola: z.rola as Rola,
        wygasa: z.wygasa,
        zuzytePrzez: z.zuzyte_przez,
      }));
    return { ok: true, dane: { uzytkownicy, zaproszenia } };
  }

  async utworzZaproszenie(
    idSesji: string | null,
    rola: Rola,
    rpId: string
  ): Promise<Wynik<{ kod: string; wygasa: number }>> {
    const admin = await this.wymagajAdmina(idSesji, rpId);
    if (!admin.ok) return admin;
    if (rola !== "admin" && rola !== "manitou") return blad("Nieznana rola.");

    const kod = losujKodRejestracji();
    const wygasa = Date.now() + WAZNOSC_ZAPROSZENIA;
    this.sql.exec(
      "INSERT INTO zaproszenia (kod, rola, utworzyl, wygasa) VALUES (?, ?, ?, ?)",
      rdzenKodu(kod),
      rola,
      admin.dane.id,
      wygasa
    );
    return { ok: true, dane: { kod, wygasa } };
  }

  async usunZaproszenie(idSesji: string | null, kod: string, rpId: string): Promise<Wynik<null>> {
    const admin = await this.wymagajAdmina(idSesji, rpId);
    if (!admin.ok) return admin;
    this.sql.exec("DELETE FROM zaproszenia WHERE kod = ? AND zuzyte_przez IS NULL", rdzenKodu(kod));
    return { ok: true, dane: null };
  }

  /**
   * Unieważnia klucze — pojedynczego konta albo wszystkich naraz.
   *
   * Hurtowy wariant jest po to, żeby po zmianie domeny (a więc RP_ID) dało się
   * jednym ruchem posprzątać klucze, którymi i tak nie da się już zalogować.
   * Konta zostają, więc wystarczy rozesłać świeże kody rejestracyjne.
   */
  async wyczyscKlucze(
    idSesji: string | null,
    idUzytkownika: string | null,
    rpId: string
  ): Promise<Wynik<{ usuniete: number }>> {
    const admin = await this.wymagajAdmina(idSesji, rpId);
    if (!admin.ok) return admin;

    const przed = this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM klucze").one().n;
    if (idUzytkownika) {
      this.sql.exec("DELETE FROM klucze WHERE uzytkownik = ?", idUzytkownika);
      this.sql.exec("DELETE FROM sesje WHERE uzytkownik = ?", idUzytkownika);
    } else {
      this.sql.exec("DELETE FROM klucze");
      this.sql.exec("DELETE FROM sesje");
    }
    const po = this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM klucze").one().n;
    return { ok: true, dane: { usuniete: przed - po } };
  }

  async usunKonto(idSesji: string | null, idUzytkownika: string, rpId: string): Promise<Wynik<null>> {
    const admin = await this.wymagajAdmina(idSesji, rpId);
    if (!admin.ok) return admin;
    if (admin.dane.id === idUzytkownika) return blad("Nie można usunąć własnego konta.");

    const inniAdmini = this.sql
      .exec<{ n: number }>(
        "SELECT COUNT(*) AS n FROM uzytkownicy WHERE rola = 'admin' AND id != ?",
        idUzytkownika
      )
      .one().n;
    if (inniAdmini === 0) return blad("To ostatni administrator — najpierw wskaż innego.");

    this.sql.exec("DELETE FROM klucze WHERE uzytkownik = ?", idUzytkownika);
    this.sql.exec("DELETE FROM sesje WHERE uzytkownik = ?", idUzytkownika);
    this.sql.exec("DELETE FROM uzytkownicy WHERE id = ?", idUzytkownika);
    return { ok: true, dane: null };
  }

  /** Wyłącznie do testów: czyści bazę obiektu. */
  async _wyczyscWszystko(): Promise<void> {
    for (const t of ["uzytkownicy", "klucze", "zaproszenia", "sesje", "wyzwania", "zuzyte_bootstrapy"]) {
      this.sql.exec(`DELETE FROM ${t}`);
    }
  }

  /** Wyłącznie do testów: doprasza zaproszenie bez sesji administratora. */
  async _zaproszenieNaSile(rola: Rola): Promise<string> {
    const kod = losujKodRejestracji();
    this.sql.exec(
      "INSERT INTO zaproszenia (kod, rola, utworzyl, wygasa) VALUES (?, ?, ?, ?)",
      rdzenKodu(kod),
      rola,
      null,
      Date.now() + WAZNOSC_ZAPROSZENIA
    );
    return kod;
  }
}

/** Wyciąga wyzwanie z odpowiedzi przeglądarki (clientDataJSON jest base64url). */
function odczytajWyzwanie(
  odpowiedz: RegistrationResponseJSON | AuthenticationResponseJSON
): string | null {
  try {
    const dane = JSON.parse(new TextDecoder().decode(zBase64Url(odpowiedz.response.clientDataJSON)));
    return typeof dane.challenge === "string" ? dane.challenge : null;
  } catch {
    return null;
  }
}

/** Niewykorzystane tu, ale trzymamy blisko definicji kodów. */
export { losujZnaki };
