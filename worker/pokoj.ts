/**
 * Pokój gry — jeden Durable Object na rozgrywkę, adresowany kodem KTULU-XXXX.
 *
 * Klasa jest tu celowo już teraz, mimo że lobby powstaje dopiero w kolejnym
 * kroku. Powód jest praktyczny: zmiany cyklu życia Durable Objectów da się
 * zastosować wyłącznie pełnym `wrangler deploy`, a gałęzie inne niż
 * produkcyjna dostają w Workers Builds `versions upload`, które taką zmianę
 * odrzuca. Zadeklarowanie obu klas w jednej migracji sprawia, że podglądy
 * gałęzi działają dalej bez kolejnego zejścia na produkcję.
 *
 * Schemat bazy wolno zmieniać dowolnie — migracji wymaga tylko lista klas.
 */

import { DurableObject } from "cloudflare:workers";

import type { Env } from "./srodowisko";

/** Pokój żyje jedną rozgrywkę; potem karty przestają być komukolwiek potrzebne. */
export const WAZNOSC_POKOJU_MS = 24 * 60 * 60 * 1000;

export class Pokoj extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => this.migruj());
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
        nazwa TEXT NOT NULL,
        dolaczyl INTEGER NOT NULL,
        miejsce INTEGER,
        rola TEXT,
        widzial INTEGER
      );
    `);
  }

  /** Czy pokój w ogóle istnieje — obiekt bez założonego pokoju jest pusty. */
  async stan(): Promise<{ istnieje: boolean }> {
    const w = this.sql
      .exec<{ wartosc: string }>("SELECT wartosc FROM pokoj WHERE klucz = 'zalozony'")
      .toArray()[0];
    return { istnieje: !!w };
  }
}
