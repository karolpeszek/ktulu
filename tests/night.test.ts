/**
 * Zasady nocy: kolejność wywoływania, pomijanie postaci nieaktywnych oraz
 * działanie każdej karty, która budzi się po zmroku.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { idolAt, makeState, run, skipOf, stepIds } from "./helpers";
import { activeMembers, isActive, livingWithRole, nightSteps } from "../src/lib/engine";
import { endNight, startNight } from "../src/lib/resolve";
import type { Faction } from "../src/lib/types";

describe("Kolejność nocy", () => {
  const s = makeState([
    "szeryf",
    "pastor",
    "ochroniarz",
    "herszt",
    "msciciel",
    "wodz",
    "szaman",
    "wielki-ufol",
    "detektor",
  ]);

  it("wpierw miasto, potem bandyci, Indianie i na końcu ufoki", () => {
    const order: (Faction | "system")[] = nightSteps(s).map((x) => x.faction);
    const firstOf = (f: Faction) => order.indexOf(f);
    assert.ok(firstOf("miasto") < firstOf("bandyci"), "miasto przed bandytami");
    assert.ok(firstOf("bandyci") < firstOf("indianie"), "bandyci przed Indianami");
    assert.ok(firstOf("indianie") < firstOf("ufoki"), "Indianie przed ufokami");
  });

  it("noc zaczyna się zapadnięciem zmroku, a kończy świtem", () => {
    const ids = stepIds(s);
    assert.equal(ids[0], "open");
    assert.equal(ids[ids.length - 1], "close");
  });

  it("w mieście szeryf budzi się przed pastorem i ochroniarzem", () => {
    const ids = stepIds(s);
    assert.ok(ids.indexOf("sheriff") < ids.indexOf("pastor"));
    assert.ok(ids.indexOf("pastor") < ids.indexOf("guard"));
  });

  it("Janosik ma własną fazę między miastem a bandytami", () => {
    const withJanosik = makeState(["szeryf", "janosik", "herszt", "wodz"]);
    const ids = stepIds(withJanosik);
    assert.ok(ids.indexOf("sheriff") < ids.indexOf("janosik"), "po mieście");
    assert.ok(ids.indexOf("janosik") < ids.indexOf("bandits-wake"), "przed bandytami");
    const krok = nightSteps(withJanosik).find((x) => x.id === "janosik")!;
    assert.equal(krok.faction, "janosik", "krok należy do własnej frakcji");
  });
});

describe("Noc zerowa", () => {
  const zero = makeState(
    ["szeryf", "pastor", "dziwka", "uwodziciel", "herszt", "szantazysta", "wodz", "wielki-ufol"],
    { night: 0 }
  );

  it("działają szeryf, pastor, dziwka, uwodziciel i szantażysta", () => {
    const ids = stepIds(zero);
    for (const id of ["sheriff", "pastor", "whore", "seducer", "blackmailer"]) {
      assert.ok(ids.includes(id), `zerowej nocy powinien działać krok ${id}`);
    }
  });

  it("frakcje poznają się nawzajem", () => {
    const ids = stepIds(zero);
    for (const id of ["bandits-wake", "indians-wake", "ufo-wake"]) {
      assert.ok(ids.includes(id), `brak poznania się frakcji: ${id}`);
    }
  });

  it("nikt nie ginie — nie ma kroków zabijania", () => {
    const ids = stepIds(zero);
    for (const id of ["indians-kill", "tentacle", "avenger", "gambler"]) {
      assert.ok(!ids.includes(id), `zerowej nocy nie powinno być kroku ${id}`);
    }
  });

  it("posążek trafia na start do herszta bandy", () => {
    const after = run(zero, "bandits-wake");
    assert.equal(idolAt(after), 4, "posążek u herszta");
  });

  it("dziwka działa wyłącznie zerowej nocy", () => {
    const pierwsza = makeState(["szeryf", "dziwka", "herszt", "wodz"], { night: 1 });
    assert.ok(!stepIds(pierwsza).includes("whore"));
  });
});

describe("Szeryf", () => {
  const base = () => makeState(["szeryf", "herszt", "wodz", "indianin"], { idol: 1 });

  it("zamknięty w więzieniu nie budzi się przez resztę nocy", () => {
    const s = run(base(), "sheriff", { targetId: "p1" });
    assert.equal(s.jailed, "p1");
    assert.equal(isActive(s, "p1"), false);
  });

  it("zamkniętego nie da się zabić", () => {
    let s = run(base(), "sheriff", { targetId: "p2" });
    s = run(s, "indians-kill", { targetId: "p2" });
    assert.equal(s.players[2].alive, true, "więzień przeżywa noc");
  });

  it("przejmuje posążek od zamkniętego", () => {
    const s = run(base(), "sheriff", { targetId: "p1" });
    assert.equal(idolAt(s), 0, "posążek przechodzi do szeryfa");
  });

  it("miasto wygrywa, gdy szeryf dotrwa z posążkiem do końca nocy", () => {
    const s = run(base(), "sheriff", { targetId: "p1" });
    endNight(s);
    assert.equal(s.winner, "miasto");
  });

  it("bez posążka świt nie kończy gry", () => {
    const s = run(base(), "sheriff", { targetId: "p2" });
    endNight(s);
    assert.equal(s.winner, null);
  });
});

describe("Pastor i inne sprawdzenia", () => {
  it("pastor poznaje frakcję sprawdzanego", () => {
    const s = run(makeState(["pastor", "herszt", "wodz"]), "pastor", { targetId: "p1" });
    assert.match(s.feedback.join(" "), /BANDYCI/i);
  });

  it("pastor działa co noc, także zerowej", () => {
    for (const night of [0, 1, 2]) {
      const s = makeState(["pastor", "herszt", "wodz"], { night });
      assert.ok(stepIds(s).includes("pastor"), `noc ${night}`);
    }
  });

  it("szaman poznaje kartę i zużywa zdolność raz na grę", () => {
    let s = makeState(["szaman", "szeryf", "herszt"]);
    s = run(s, "shaman", { yes: true, targetId: "p1" });
    assert.match(s.feedback.join(" "), /Szeryf/);
    assert.ok(skipOf(s, "shaman"), "druga próba jest pomijana");
  });

  it("pożeracz umysłów poznaje kartę co noc", () => {
    let s = makeState(["pozeracz", "szeryf", "herszt", "wodz", "wielki-ufol"]);
    s = run(s, "mind-eater", { targetId: "p1" });
    assert.match(s.feedback.join(" "), /Szeryf/);
    assert.equal(skipOf(s, "mind-eater"), null, "nie zużywa się");
  });

  it("poborca podatków wskazuje posiadacza posążka raz na grę", () => {
    let s = makeState(["poborca", "herszt", "wodz"], { idol: 1 });
    s = run(s, "tax", { yes: true });
    assert.match(s.feedback.join(" "), /G2/);
    assert.ok(skipOf(s, "tax"));
  });

  it("lornecie oko wskazuje posążek raz na grę", () => {
    let s = makeState(["lornecie-oko", "herszt", "wodz"], { idol: 1 });
    s = run(s, "binoculars", { yes: true });
    assert.match(s.feedback.join(" "), /G2/);
    assert.ok(skipOf(s, "binoculars"));
  });

  it("detektor mówi wprost, gdy badany ma posążek", () => {
    const s = run(makeState(["detektor", "herszt", "wodz", "wielki-ufol"], { idol: 1 }), "detector", {
      targetId: "p1",
    });
    assert.match(s.feedback.join(" "), /MA posążek/);
  });

  it("detektor bez trafienia podaje łuk, w którym jest posążek", () => {
    const s = run(makeState(["detektor", "herszt", "wodz", "wielki-ufol"], { idol: 2 }), "detector", {
      targetId: "p1",
    });
    assert.match(s.feedback.join(" "), /łuku/);
  });
});

describe("Ochroniarz", () => {
  it("chroniony nie ginie tej nocy", () => {
    let s = makeState(["ochroniarz", "szeryf", "wodz", "indianin"]);
    s = run(s, "guard", { targetId: "p1" });
    s = run(s, "indians-kill", { targetId: "p1" });
    assert.equal(s.players[1].alive, true);
  });

  it("chronionego nadal można okraść", () => {
    let s = makeState(["ochroniarz", "szeryf", "herszt", "wodz"], { idol: 1 });
    s = run(s, "guard", { targetId: "p1" });
    s = run(s, "bandits-rob", { targetId: "p1" });
    assert.equal(idolAt(s), 2, "posążek trafia do bandy mimo ochrony");
  });

  it("gdy ochroniarz zginie w nocy, ochrona przestaje działać", () => {
    let s = makeState(["ochroniarz", "szeryf", "wodz", "indianin", "szaman"]);
    s = run(s, "guard", { targetId: "p1" });
    assert.equal(s.protectedId, "p1");
    s = run(s, "indians-kill", { targetId: "p0" });
    assert.equal(s.players[0].alive, false, "ochroniarz ginie");
    assert.equal(s.protectedId, null, "ochrona pada razem z nim");
  });

  it("pamięta, kogo chronił poprzedniej nocy", () => {
    let s = makeState(["ochroniarz", "szeryf", "herszt", "wodz"]);
    s = run(s, "guard", { targetId: "p1" });
    endNight(s);
    assert.equal(s.lastProtectedId, "p1");
    assert.equal(s.protectedId, null, "ochrona nie przechodzi na kolejną noc");
  });
});

describe("Opój i szuler — usypianie", () => {
  it("spity nie budzi się tej nocy", () => {
    const s = run(makeState(["opoj", "szeryf", "herszt", "wodz"]), "drunkard", {
      yes: true,
      targetId: "p1",
    });
    assert.equal(isActive(s, "p1"), false);
  });

  it("spitego nadal można zabić", () => {
    let s = makeState(["opoj", "szeryf", "wodz", "indianin"]);
    s = run(s, "drunkard", { yes: true, targetId: "p1" });
    s = run(s, "indians-kill", { targetId: "p1" });
    assert.equal(s.players[1].alive, false);
  });

  it("opój działa dwa razy w grze", () => {
    let s = makeState(["opoj", "szeryf", "herszt", "wodz"]);
    s = run(s, "drunkard", { yes: true, targetId: "p1" });
    assert.equal(skipOf(s, "drunkard"), null, "druga kolejka przysługuje");
    s = run(s, "drunkard", { yes: true, targetId: "p2" });
    assert.ok(skipOf(s, "drunkard"), "trzeciej już nie ma");
  });

  it("szuler usypia partnera i wygrywa jego posążek", () => {
    const s = run(makeState(["szuler", "herszt", "wodz", "szeryf"], { idol: 3 }), "cardsharp", {
      yes: true,
      targetId: "p3",
    });
    assert.equal(isActive(s, "p3"), false);
    assert.equal(idolAt(s), 0, "posążek przechodzi do szulera");
    assert.ok(
      s.morningReport.some((l) => /właścicielem posążka/.test(l)),
      "Manitou ogłasza to bez wskazywania osoby"
    );
  });

  it("nieaktywny nie może przyjąć posążka przy przekazaniu we frakcji", () => {
    let s = makeState(["opoj", "herszt", "bandyta", "wodz"], { idol: 1 });
    s = run(s, "drunkard", { yes: true, targetId: "p2" });
    s = run(s, "bandits-assign", { memberId: "p2" });
    assert.equal(idolAt(s), 1, "posążek zostaje u herszta");
  });
});

describe("Hazardzista", () => {
  it("nie gra pierwszej nocy", () => {
    const s = makeState(["hazardzista", "szeryf", "herszt", "wodz"], { night: 1 });
    assert.match(skipOf(s, "gambler") ?? "", /drugiej nocy/);
  });

  it("trafiając na obywatela miasta ginie sam", () => {
    const s = run(
      makeState(["hazardzista", "mieszczanin", "herszt", "wodz"], { night: 2 }),
      "gambler",
      { yes: true, targetId: "p1" }
    );
    assert.equal(s.players[0].alive, false, "hazardzista ginie");
    assert.equal(s.players[1].alive, true, "obywatel przeżywa");
  });

  it("trafiając poza miasto zabija i gra dalej", () => {
    const s = run(makeState(["hazardzista", "bandyta", "herszt", "wodz"], { night: 2 }), "gambler", {
      yes: true,
      targetId: "p1",
    });
    assert.equal(s.players[1].alive, false, "wskazany ginie");
    assert.equal(s.players[0].alive, true, "hazardzista żyje");
    assert.equal(s.pending, "gambler", "ruletka trwa dalej");
  });
});

describe("Janosik", () => {
  it("macha ciupagą raz na grę i wszyscy się cieszą", () => {
    let s = makeState(["janosik", "szeryf", "herszt", "wodz"]);
    const out = run(s, "janosik", { yes: true });
    assert.match(out.feedback.join(" "), /ciupag/i);
    assert.ok(skipOf(out, "janosik"), "drugi raz nie zamacha");
    s = out;
  });

  it("ciupaga nie zmienia stanu gry ani warunków zwycięstwa", () => {
    const przed = makeState(["janosik", "szeryf", "herszt", "wodz"], { idol: 2 });
    const po = run(przed, "janosik", { yes: true });
    assert.equal(po.winner, null);
    assert.equal(po.idolHolder, przed.idolHolder);
    assert.deepEqual(
      po.players.map((p) => p.alive),
      przed.players.map((p) => p.alive)
    );
  });
});

describe("Bandyci", () => {
  it("kradną tylko wtedy, gdy nie mają posążka", () => {
    const bezPosazka = makeState(["herszt", "szeryf", "wodz"], { idol: 1 });
    assert.equal(skipOf(bezPosazka, "bandits-rob"), null);
    const zPosazkiem = makeState(["herszt", "szeryf", "wodz"], { idol: 0 });
    assert.match(skipOf(zPosazkiem, "bandits-rob") ?? "", /ma już posążek/);
  });

  it("kradzież zabiera posążek okradanemu", () => {
    const s = run(makeState(["herszt", "szeryf", "wodz"], { idol: 1 }), "bandits-rob", {
      targetId: "p1",
    });
    assert.equal(idolAt(s), 0);
  });

  it("wg Xięgi bandyci nie zabijają swojej ofiary", () => {
    const s = run(makeState(["herszt", "szeryf", "wodz"], { idol: 1 }), "bandits-rob", {
      targetId: "p1",
      yes: true,
    });
    assert.equal(s.players[1].alive, true, "ofiara kradzieży przeżywa");
    assert.equal(s.settings.banditsCanKill, false, "domyślne ustawienie Xięgi");
  });

  it("mściciel zabija raz na grę", () => {
    let s = makeState(["msciciel", "szeryf", "herszt", "wodz"]);
    s = run(s, "avenger", { yes: true, targetId: "p1" });
    assert.equal(s.players[1].alive, false);
    assert.ok(skipOf(s, "avenger"));
  });

  it("złodziej kradnie posążek raz na grę", () => {
    let s = makeState(["zlodziej", "szeryf", "herszt", "wodz"], { idol: 1 });
    s = run(s, "thief", { yes: true, targetId: "p1" });
    assert.equal(idolAt(s), 0);
    assert.ok(skipOf(s, "thief"));
  });

  it("statek jest gotowy dopiero od ustalonej nocy", () => {
    const wczesniej = makeState(["herszt", "szeryf", "wodz"], { idol: 0, night: 2 });
    assert.match(skipOf(wczesniej, "bandits-sail") ?? "", /Statek/);
    const teraz = makeState(["herszt", "szeryf", "wodz"], { idol: 0, night: 3 });
    assert.equal(skipOf(teraz, "bandits-sail"), null);
  });

  it("bez posążka nie ma czym odpłynąć", () => {
    const s = makeState(["herszt", "szeryf", "wodz"], { idol: 1, night: 3 });
    assert.match(skipOf(s, "bandits-sail") ?? "", /nie ma posążka/);
  });
});

describe("Indianie", () => {
  it("zabijają jedną osobę i przejmują jej posążek", () => {
    const s = run(makeState(["wodz", "szeryf", "herszt"], { idol: 1 }), "indians-kill", {
      targetId: "p1",
    });
    assert.equal(s.players[1].alive, false);
    assert.equal(idolAt(s), 0, "posążek przechodzi do zabójcy");
    assert.equal(s.indiansTookIdolTonight, true);
  });

  it("drugie zabójstwo przysługuje tylko z posążkiem", () => {
    const bez = makeState(["wodz", "szeryf", "herszt", "mieszczanin"], { idol: 2 });
    assert.match(skipOf(bez, "indians-kill2") ?? "", /nie mają posążka/);
    const z = makeState(["wodz", "szeryf", "herszt", "mieszczanin"], { idol: 0 });
    assert.equal(skipOf(z, "indians-kill2"), null);
  });

  it("wojownik zabija dodatkowo tylko po przejęciu posążka tej nocy", () => {
    let s = makeState(["wodz", "wojownik", "szeryf", "herszt"], { idol: 3 });
    assert.match(skipOf(s, "warrior") ?? "", /nie przejęli/);
    s = run(s, "indians-kill", { targetId: "p3" });
    assert.equal(skipOf(s, "warrior"), null, "po przejęciu posążka wojownik działa");
  });

  it("samotny kojot zabija, gdy jest jedynym aktywnym Indianinem", () => {
    const sam = makeState(["samotny-kojot", "szeryf", "herszt"]);
    assert.equal(skipOf(sam, "coyote"), null);
    const wDwoje = makeState(["samotny-kojot", "wodz", "szeryf", "herszt"]);
    assert.match(skipOf(wDwoje, "coyote") ?? "", /jedynym aktywnym/);
  });

  it("szamanka podkłada truciznę raz na grę", () => {
    let s = makeState(["szamanka", "szeryf", "herszt"]);
    s = run(s, "medicine-woman", { yes: true, targetId: "p1" });
    assert.equal(s.poisoned, "p1");
    assert.equal(s.players[1].alive, true, "trucizna działa dopiero następnego dnia");
    assert.ok(skipOf(s, "medicine-woman"));
  });
});

describe("Cicha stopa", () => {
  it("podkłada posążek wybranej osobie", () => {
    const s = run(makeState(["cicha-stopa", "szeryf", "herszt"], { idol: 0 }), "quietfoot-plant", {
      yes: true,
      targetId: "p1",
    });
    assert.equal(idolAt(s), 1, "podrzucony jest traktowany jak właściciel");
    assert.equal(s.plantedIdolOn, "p1");
  });

  it("podkłada tylko wtedy, gdy sama ma posążek", () => {
    const s = makeState(["cicha-stopa", "szeryf", "herszt"], { idol: 2 });
    assert.match(skipOf(s, "quietfoot-plant") ?? "", /nie ma posążka/);
  });

  it("odbiera podłożony posążek, jeśli nie zmienił właściciela", () => {
    let s = run(makeState(["cicha-stopa", "szeryf", "herszt"], { idol: 0 }), "quietfoot-plant", {
      yes: true,
      targetId: "p1",
    });
    assert.equal(skipOf(s, "quietfoot-take"), null);
    s = run(s, "quietfoot-take", { yes: true });
    assert.equal(idolAt(s), 0, "posążek wraca do cichej stopy");
    assert.equal(s.plantedIdolOn, null);
  });

  it("nie odbierze, gdy podrzucony utracił posążek", () => {
    const s = run(makeState(["cicha-stopa", "szeryf", "herszt"], { idol: 0 }), "quietfoot-plant", {
      yes: true,
      targetId: "p1",
    });
    s.idolHolder = "p2";
    assert.match(skipOf(s, "quietfoot-take") ?? "", /utracił/);
  });
});

describe("Ufoki", () => {
  it("przeszukują i przejmują posążek", () => {
    const s = run(
      makeState(["wielki-ufol", "szeryf", "herszt", "wodz"], { idol: 1 }),
      "ufo-search",
      { targetId: "p1" }
    );
    assert.equal(idolAt(s), 0);
  });

  it("zielona macka zabija raz na grę", () => {
    let s = makeState(["zielona-macka", "szeryf", "herszt", "wodz"]);
    s = run(s, "tentacle", { yes: true, targetId: "p1" });
    assert.equal(s.players[1].alive, false);
    assert.ok(skipOf(s, "tentacle"));
  });

  it("sygnał udaje się tylko z posążkiem w rękach ufoków", () => {
    const bez = run(makeState(["wielki-ufol", "szeryf", "herszt", "wodz"], { idol: 1 }), "ufo-signal");
    assert.equal(bez.signals, 0);
    const z = run(makeState(["wielki-ufol", "szeryf", "herszt", "wodz"], { idol: 0 }), "ufo-signal");
    assert.equal(z.signals, 1);
  });
});

describe("Lekarz", () => {
  it("wskrzesza świeżo zmarłego w nocy, raz na grę", () => {
    let s = makeState(["lekarz", "szeryf", "wodz", "indianin"]);
    s = run(s, "indians-kill", { targetId: "p1" });
    assert.equal(s.players[1].alive, false);
    assert.equal(skipOf(s, "doctor"), null);
    s = run(s, "doctor", { yes: true, targetId: "p1" });
    assert.equal(s.players[1].alive, true, "wraca do gry");
    assert.ok(skipOf(s, "doctor"), "zdolność zużyta");
  });

  it("nie ma kogo wskrzeszać, gdy nikt nie zginął", () => {
    const s = makeState(["lekarz", "szeryf", "herszt", "wodz"]);
    assert.match(skipOf(s, "doctor") ?? "", /nikt nie zginął/);
  });
});

describe("Przekazywanie posążka i nieaktywność", () => {
  it("w nocy posążek zawsze przechodzi w ręce zabójcy", () => {
    const s = run(makeState(["wodz", "szeryf", "herszt"], { idol: 1 }), "indians-kill", {
      targetId: "p1",
    });
    assert.equal(idolAt(s), 0);
  });

  it("frakcja przekazuje posążek aktywnemu członkowi", () => {
    const s = run(makeState(["herszt", "bandyta", "szeryf", "wodz"], { idol: 0 }), "bandits-assign", {
      memberId: "p1",
    });
    assert.equal(idolAt(s), 1);
  });

  it("krok postaci nieżyjącej jest pomijany z podaniem powodu", () => {
    const s = makeState(["pastor", "szeryf", "herszt", "wodz"]);
    s.players[0].alive = false;
    assert.match(skipOf(s, "pastor") ?? "", /nie żyje/);
  });

  it("krok frakcji bez aktywnych członków jest pomijany", () => {
    const s = makeState(["szeryf", "herszt", "wodz"]);
    s.players[1].alive = false;
    assert.match(skipOf(s, "bandits-rob") ?? "", /Brak aktywnych/);
  });

  it("faza frakcji, której nie ma w grze, w ogóle nie występuje", () => {
    const bezUfokow = makeState(["szeryf", "herszt", "wodz"]);
    assert.ok(!stepIds(bezUfokow).some((id) => id.startsWith("ufo")));
  });
});

describe("Świt i przejście do dnia", () => {
  it("po nocy zaczyna się dzień o numerze o jeden wyższym", () => {
    const s = makeState(["szeryf", "herszt", "wodz"], { night: 2 });
    endNight(s);
    assert.equal(s.stage, "day");
    assert.equal(s.day, 3);
  });

  it("efekty jednonocne gasną o świcie", () => {
    let s = makeState(["szeryf", "ochroniarz", "herszt", "wodz"]);
    s = run(s, "sheriff", { targetId: "p2" });
    s = run(s, "guard", { targetId: "p3" });
    endNight(s);
    assert.equal(s.jailed, null);
    assert.equal(s.protectedId, null);
    assert.deepEqual(s.asleep, []);
    assert.equal(s.indiansTookIdolTonight, false);
    assert.equal(s.sailDeclared, false);
  });

  it("poranny raport wymienia zabitych tej nocy", () => {
    let s = makeState(["wodz", "szeryf", "herszt"]);
    s = run(s, "indians-kill", { targetId: "p1" });
    endNight(s);
    assert.ok(s.morningReport.some((l) => /G2/.test(l)));
  });

  it("nowa noc zaczyna się od pierwszego wykonalnego kroku", () => {
    let s = makeState(["szeryf", "herszt", "wodz"], { night: 1 });
    endNight(s);
    s = startNight(s);
    assert.equal(s.stage, "night");
    assert.equal(s.night, 2);
    assert.equal(s.morningReport.length, 0);
    assert.equal(nightSteps(s)[s.stepIndex].id, "open");
  });

  it("aktywni członkowie frakcji to żywi i nieuśpieni", () => {
    let s = makeState(["szeryf", "herszt", "bandyta", "wodz"]);
    s = run(s, "sheriff", { targetId: "p1" });
    s.players[2].alive = false;
    assert.deepEqual(activeMembers(s, "bandyci").map((p) => p.id), []);
    assert.ok(livingWithRole(s, "herszt"), "herszt nadal żyje, tylko siedzi");
  });
});
