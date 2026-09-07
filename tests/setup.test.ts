/**
 * Zasady przygotowania gry: tabela składów z Xięgi, ustawienia zależne od
 * liczby graczy, budowanie puli kart i dodatek domowy — Janosik.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  JANOSIK_MIN_PLAYERS,
  RECOMMENDED_MAX,
  TABLE,
  TABLE_MAX,
  TABLE_MIN,
  bookHeadcount,
  buildPool,
  inTable,
  janosikAllowed,
  recommendedSettings,
  shuffle,
  suggestedCounts,
  totalOf,
} from "../src/lib/setup";
import { ROLES, ROLE_BY_ID, fillerRole } from "../src/lib/roles";
import { BOOK_FACTIONS, FACTIONS } from "../src/lib/types";

describe("Tabela składów z Xięgi", () => {
  it("obejmuje 12–30 graczy bez luk", () => {
    for (let n = TABLE_MIN; n <= TABLE_MAX; n++) {
      assert.ok(inTable(n), `brak wiersza dla ${n} graczy`);
    }
    assert.equal(TABLE_MIN, 12);
    assert.equal(TABLE_MAX, 30);
  });

  it("każdy wiersz sumuje się do liczby graczy", () => {
    for (const [n, row] of Object.entries(TABLE)) {
      const sum = row.reduce((a, b) => a + b, 0);
      assert.equal(sum, Number(n), `wiersz ${n} sumuje się do ${sum}`);
    }
  });

  it("ufoki dochodzą dopiero od 18 graczy", () => {
    for (let n = TABLE_MIN; n <= TABLE_MAX; n++) {
      const c = suggestedCounts(n);
      if (n < 18) assert.equal(c.ufoki, 0, `${n} graczy nie powinno mieć ufoków`);
      else assert.ok(c.ufoki >= 3, `${n} graczy powinno mieć ufoków`);
    }
  });

  it("każda frakcja w tabeli ma co najmniej jednego członka", () => {
    for (let n = TABLE_MIN; n <= TABLE_MAX; n++) {
      const c = suggestedCounts(n);
      for (const f of BOOK_FACTIONS) {
        if (f === "ufoki" && c.ufoki === 0) continue;
        assert.ok(c[f] > 0, `${n} graczy: frakcja ${f} jest pusta`);
      }
    }
  });

  it("Xięga nie poleca gry powyżej 20 osób, ale tabela sięga dalej", () => {
    assert.equal(RECOMMENDED_MAX, 20);
    assert.ok(TABLE_MAX > RECOMMENDED_MAX);
  });

  it("poza tabelą skład nadal sumuje się do liczby graczy", () => {
    for (const n of [4, 6, 8, 11, 31, 40]) {
      assert.equal(totalOf(suggestedCounts(n)), n, `${n} graczy`);
    }
  });
});

describe("Ustawienia zależne od liczby graczy", () => {
  it("przeszukuje dwie osoby do szesnastu graczy, trzy powyżej", () => {
    assert.equal(recommendedSettings(12).searchCount, 2);
    assert.equal(recommendedSettings(16).searchCount, 2);
    assert.equal(recommendedSettings(17).searchCount, 3);
    assert.equal(recommendedSettings(30).searchCount, 3);
  });

  it("statek bandytów odpływa po trzeciej nocy, a powyżej 16 graczy po czwartej", () => {
    assert.equal(recommendedSettings(12).shipNight, 3);
    assert.equal(recommendedSettings(16).shipNight, 3);
    assert.equal(recommendedSettings(17).shipNight, 4);
  });
});

describe("Janosik — dodatek domowy", () => {
  it("wchodzi do gry dopiero od 13 graczy", () => {
    assert.equal(JANOSIK_MIN_PLAYERS, 13);
    assert.equal(janosikAllowed(12), false);
    assert.equal(janosikAllowed(13), true);
    assert.equal(suggestedCounts(12, true).janosik, 0, "poniżej progu nie dostaje karty");
    assert.equal(suggestedCounts(13, true).janosik, 1);
  });

  it("zajmuje jedno miejsce, a reszta dzieli się wg wiersza o jeden niższego", () => {
    for (let n = JANOSIK_MIN_PLAYERS; n <= TABLE_MAX; n++) {
      const withJ = suggestedCounts(n, true);
      const rowBelow = suggestedCounts(n - 1, false);
      assert.equal(withJ.janosik, 1, `${n} graczy`);
      assert.equal(totalOf(withJ), n, `${n} graczy: skład nie sumuje się`);
      assert.equal(bookHeadcount(withJ), n - 1, `${n} graczy: reszta stołu`);
      for (const f of BOOK_FACTIONS) {
        assert.equal(withJ[f], rowBelow[f], `${n} graczy: frakcja ${f} nie zgadza się z wierszem ${n - 1}`);
      }
    }
  });

  it("jest własną, jednoosobową frakcją — nie kartą miasta", () => {
    assert.equal(ROLE_BY_ID.janosik.faction, "janosik");
    assert.ok(FACTIONS.includes("janosik"));
    assert.ok(!BOOK_FACTIONS.includes("janosik"), "nie należy do frakcji z tabeli Xięgi");
    assert.equal(fillerRole("janosik"), undefined, "frakcja Janosika nie ma szeregowych");
  });
});

describe("Budowanie puli kart", () => {
  it("pula ma dokładnie tyle kart, ilu członków liczy frakcja", () => {
    for (const size of [1, 3, 5, 8, 13]) {
      assert.equal(buildPool("miasto", size, [], true).length, size, `rozmiar ${size}`);
      assert.equal(buildPool("miasto", size, [], false).length, size, `bez autouzupełniania ${size}`);
    }
  });

  it("karty wskazane ręcznie zawsze wchodzą do puli", () => {
    const pool = buildPool("miasto", 5, ["sedzia", "lekarz"], true);
    assert.ok(pool.includes("sedzia"));
    assert.ok(pool.includes("lekarz"));
  });

  it("autouzupełnianie bierze najpierw karty kluczowe", () => {
    const pool = buildPool("miasto", 4, [], true);
    const kluczowe = ROLES.filter((r) => r.faction === "miasto" && r.tier === "kluczowa");
    for (const r of kluczowe) {
      assert.ok(pool.includes(r.id), `zabrakło kluczowej karty: ${r.name}`);
    }
  });

  it("resztę miejsc wypełniają szeregowi członkowie frakcji", () => {
    const pool = buildPool("bandyci", 12, [], true);
    assert.equal(pool.length, 12);
    assert.ok(pool.filter((id) => id === "bandyta").length > 0);
  });

  it("bez autouzupełniania pula to wybrane karty plus szeregowi", () => {
    const pool = buildPool("indianie", 4, ["szaman"], false);
    assert.deepEqual(pool, ["szaman", "indianin", "indianin", "indianin"]);
  });

  it("nie zwraca więcej kart, niż wynosi liczebność frakcji", () => {
    const pool = buildPool("miasto", 2, ["szeryf", "pastor", "burmistrz", "opoj"], true);
    assert.equal(pool.length, 2);
  });

  it("żadna karta poza szeregową nie powtarza się w puli", () => {
    const pool = buildPool("indianie", 7, [], true);
    const bezSzeregowych = pool.filter((id) => id !== "indianin");
    assert.equal(new Set(bezSzeregowych).size, bezSzeregowych.length);
  });
});

describe("Tasowanie", () => {
  it("zachowuje wszystkie elementy", () => {
    const src = Array.from({ length: 30 }, (_, i) => i);
    const out = shuffle(src);
    assert.equal(out.length, src.length);
    assert.deepEqual([...out].sort((a, b) => a - b), src);
  });

  it("nie zmienia tablicy wejściowej", () => {
    const src = [1, 2, 3, 4, 5];
    const copy = [...src];
    shuffle(src);
    assert.deepEqual(src, copy);
  });
});

describe("Katalog kart", () => {
  it("identyfikatory są unikalne", () => {
    const ids = ROLES.map((r) => r.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("każda karta ma nazwę, frakcję i opis zdolności", () => {
    for (const r of ROLES) {
      assert.ok(r.name.length > 0, `${r.id}: brak nazwy`);
      assert.ok(FACTIONS.includes(r.faction), `${r.id}: nieznana frakcja`);
      assert.ok(r.desc.length > 20, `${r.id}: opis jest za ubogi na karteczkę`);
    }
  });

  it("każda frakcja z tabeli ma dokładnie jedną kartę szeregową", () => {
    for (const f of BOOK_FACTIONS) {
      const fillers = ROLES.filter((r) => r.faction === f && r.filler);
      assert.equal(fillers.length, 1, `frakcja ${f}`);
    }
  });

  it("każda frakcja poza miastem ma dokładnie jednego przywódcę", () => {
    for (const f of FACTIONS) {
      const leaders = ROLES.filter((r) => r.faction === f && r.leader);
      if (f === "miasto") {
        assert.equal(leaders.length, 0, "miasto nie ma przywódcy rangowego");
      } else {
        assert.equal(leaders.length, 1, `frakcja ${f}`);
      }
    }
  });

  it("herszt bandy jest kartą kluczową — to on trzyma posążek na starcie", () => {
    assert.equal(ROLE_BY_ID.herszt.tier, "kluczowa");
    assert.equal(ROLE_BY_ID.herszt.leader, true);
  });

  it("karty kluczowe wg Xięgi są oznaczone", () => {
    const kluczowe = ["szeryf", "dziwka", "dobry-rewolwerowiec", "zly-rewolwerowiec", "herszt", "szaman"];
    for (const id of kluczowe) {
      assert.equal(ROLE_BY_ID[id].tier, "kluczowa", `${id} powinna być kluczowa`);
    }
  });

  it("postaci, które nie działają same na sobie, są tak opisane", () => {
    for (const id of ["ochroniarz", "lekarz", "szeryf", "dziwka"]) {
      assert.equal(ROLE_BY_ID[id].selfTarget, false, `${id} nie może działać na sobie`);
    }
    for (const id of ["sedzia", "burmistrz"]) {
      assert.equal(ROLE_BY_ID[id].selfTarget, true, `${id} może działać na sobie`);
    }
  });
});
