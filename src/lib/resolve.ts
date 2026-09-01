import { Faction, GameState } from "./types";
import {
  NightStep,
  activeMembers,
  checkIndiansWin,
  factionOf,
  idolFaction,
  isActive,
  killAtDay,
  killAtNight,
  livingMembers,
  livingWithRole,
  log,
  nameOf,
  nightSteps,
  playerById,
  roleNameOf,
  setWinner,
  skipReason,
} from "./engine";

export interface StepPayload {
  targetId?: string | null;
  yes?: boolean;
  memberId?: string | null;
}

export interface StepOutcome {
  state: GameState;
  /** Krok pozostaje otwarty (ruletka hazardzisty). */
  stay?: boolean;
  /** Wyzwól animację ciupagi. */
  joy?: boolean;
}

/** Po odpowiedzi „tak" krok wymaga jeszcze wskazania celu. */
export const TARGET_AFTER_YES: Record<string, "player" | "dead" | "none"> = {
  tax: "none",
  gambler: "player",
  drunkard: "player",
  janosik: "none",
  avenger: "player",
  thief: "player",
  cardsharp: "player",
  shaman: "player",
  binoculars: "none",
  "medicine-woman": "player",
  tentacle: "player",
  "quietfoot-plant": "player",
  "quietfoot-take": "none",
  doctor: "dead",
  "bandits-sail": "none",
};

const clone = (s: GameState): GameState => structuredClone(s);

function spend(s: GameState, key: string) {
  s.used[key] = (s.used[key] ?? 0) + 1;
}

function sleep(s: GameState, id: string) {
  if (!s.asleep.includes(id)) s.asleep.push(id);
}

function say(s: GameState, ...lines: string[]) {
  s.feedback = lines;
}

function announce(s: GameState, line: string) {
  s.morningReport.push(line);
}

function holdsIdol(s: GameState, id: string | null | undefined): boolean {
  return !!id && s.idolHolder === id;
}

function takeIdol(s: GameState, fromId: string, toId: string, how: string): boolean {
  if (!holdsIdol(s, fromId)) return false;
  s.idolHolder = toId;
  if (s.plantedIdolOn === fromId) s.plantedIdolOn = null;
  log(s, `${how}: posążek przechodzi od ${nameOf(s, fromId)} do ${nameOf(s, toId)}.`);
  return true;
}

function arcOf(s: GameState, fromId: string, detectorId: string): string {
  const seats = [...s.players].sort((a, b) => a.seat - b.seat);
  const n = seats.length;
  const iFrom = seats.findIndex((p) => p.id === fromId);
  const iDet = seats.findIndex((p) => p.id === detectorId);
  const holder = s.idolHolder;
  if (!holder) return "Posążka nie ma przy nikim żywym.";
  const iHold = seats.findIndex((p) => p.id === holder);
  if (iHold < 0) return "Posążka nie ma przy nikim żywym.";
  // łuk „w prawo" od badanego do detektora
  const inArc = (i: number) => {
    let k = iFrom;
    while (k !== iDet) {
      if (k === i) return true;
      k = (k + 1) % n;
    }
    return k === i;
  };
  const right = inArc(iHold);
  const arcNames = (start: number, end: number) => {
    const out: string[] = [];
    let k = start;
    for (;;) {
      out.push(seats[k].name);
      if (k === end) break;
      k = (k + 1) % n;
    }
    return out.join(" → ");
  };
  return right
    ? `Posążek jest w łuku: ${arcNames(iFrom, iDet)}`
    : `Posążek jest w łuku: ${arcNames(iDet, iFrom)}`;
}

// ── rozstrzyganie kroku nocy ───────────────────────────────────────────────

export function resolveStep(prev: GameState, step: NightStep, payload: StepPayload): StepOutcome {
  const s = clone(prev);
  s.feedback = [];
  const t = payload.targetId ?? null;
  const target = playerById(s, t);
  const advance = () => {
    s.stepIndex = nextIndex(s, s.stepIndex);
  };

  switch (step.action) {
    case "info": {
      if (step.id === "bandits-wake" && s.night === 0) {
        const herszt = livingWithRole(s, "herszt") ?? livingMembers(s, "bandyci")[0];
        if (herszt && !s.idolHolder) {
          s.idolHolder = herszt.id;
          log(s, `Posążek trafia na start do: ${herszt.name} (${roleNameOf(s, herszt.id)}).`);
        }
      }
      advance();
      break;
    }

    case "sheriff-jail": {
      const sheriff = livingWithRole(s, "szeryf")!;
      s.jailed = t;
      if (t) {
        sleep(s, t);
        announce(s, `Szeryf zamknął w więzieniu: ${nameOf(s, t)}.`);
        log(s, `Szeryf (${sheriff.name}) zamyka ${nameOf(s, t)} w więzieniu.`, false);
        if (takeIdol(s, t, sheriff.id, "Rewizja w więzieniu")) {
          say(s, `${nameOf(s, t)} miał posążek — szeryf go przejmuje!`, "Jeśli szeryf dotrwa z nim do końca nocy, miasto wygrywa.");
        } else {
          say(s, `${nameOf(s, t)} nie miał posążka.`);
        }
      }
      advance();
      break;
    }

    case "pastor": {
      if (target) {
        const f = factionOf(s, target.id);
        say(s, `${target.name} należy do frakcji: ${f ? f.toUpperCase() : "—"}.`);
        log(s, `Pastor wyspowiadał ${target.name} → ${f}.`);
      }
      advance();
      break;
    }

    case "whore": {
      if (target) {
        const w = livingWithRole(s, "dziwka")!;
        s.bonds.push({ kind: "dziwka", from: w.id, to: target.id });
        say(
          s,
          `➤ OBUDŹ TERAZ: ${target.name} — przy otwartych oczach dziwki (${w.name}).`,
          `➤ ${target.name} ma zobaczyć, kto jest dziwką; dziwce pokaż kartę klienta.`,
          `Karta klienta: ${roleNameOf(s, target.id)} — frakcja ${factionOf(s, target.id)}.`,
          "Gdy oboje zapamiętają, każ im zamknąć oczy."
        );
        log(s, `Dziwka (${w.name}) wybrała klienta: ${target.name} (${roleNameOf(s, target.id)}).`);
      }
      advance();
      break;
    }

    case "seducer":
    case "blackmailer": {
      if (target) {
        const seducing = step.action === "seducer";
        const kind = seducing ? "uwodziciel" : "szantazysta";
        const from = livingWithRole(s, kind)!;
        s.bonds.push({ kind: kind as "uwodziciel" | "szantazysta", from: from.id, to: target.id });
        say(
          s,
          `➤ OBUDŹ TERAZ: ${target.name} — przy otwartych oczach ${seducing ? "uwodziciela" : "szantażysty"} (${from.name}).`,
          `➤ ${target.name} ma zobaczyć, kto go ${seducing ? "uwiódł" : "szantażuje"} — bez tego nie ma jak przestrzegać zasady.`,
          // Bez odmiany imion — dopełniacz od dowolnego imienia bywa nie do zgadnięcia.
          `Zasada dla tej osoby: nie wolno jej szkodzić ${seducing ? "uwodzicielowi" : "szantażyście"} — ani nawoływać do jego zabicia, ani za tym głosować; w pojedynkach musi głosować za nim i nie może ujawnić, co zaszło.`,
          "Gdy zapamięta, każ obojgu zamknąć oczy."
        );
        log(s, `${roleNameOf(s, from.id)} (${from.name}) → ${target.name}.`);
      }
      advance();
      break;
    }

    case "tax": {
      if (payload.yes) {
        spend(s, "poborca");
        say(
          s,
          s.idolHolder
            ? `Posążek posiada: ${nameOf(s, s.idolHolder)} (${roleNameOf(s, s.idolHolder)}).`
            : "Posążka nie ma przy nikim.",
          "Uwaga: położenie posążka może się jeszcze tej nocy zmienić."
        );
        log(s, `Poborca sprawdził posążek → ${nameOf(s, s.idolHolder)}.`);
      }
      advance();
      break;
    }

    case "guard": {
      s.protectedId = t;
      if (t) {
        announce(s, `Ochroniarz chroni: ${nameOf(s, t)}.`);
        log(s, `Ochroniarz chroni ${nameOf(s, t)}.`, false);
      }
      advance();
      break;
    }

    case "gambler": {
      const g = livingWithRole(s, "hazardzista");
      if (!payload.yes || !g) {
        advance();
        break;
      }
      if (!s.pending) {
        spend(s, "hazardzista");
        s.pending = "gambler";
      }
      if (!target) break;
      announce(s, `Hazardzista gra w ruletkę z: ${target.name}.`);
      const f = factionOf(s, target.id);
      if (f === "miasto") {
        const r = killAtNight(s, g.id, null, "przegrał w rosyjską ruletkę");
        say(s, `${target.name} to obywatel miasta — ginie hazardzista.`, r.ok ? "" : r.reason ?? "");
        s.pending = null;
        advance();
      } else {
        const hadIdol = holdsIdol(s, target.id);
        const r = killAtNight(s, target.id, g.id, "zastrzelony w rosyjskiej ruletce");
        if (!r.ok) {
          say(s, r.reason ?? "Nie udało się.", "Ruletka trwa dalej — wskaż kolejną osobę.");
          break;
        }
        if (hadIdol) {
          setWinner(
            s,
            "miasto",
            `Hazardzista zabił posiadacza posążka (${target.name}) — posążek zostaje odkryty, miasto wygrywa.`
          );
          s.pending = null;
          advance();
          break;
        }
        say(s, `${target.name} (${f}) ginie. Ruletka trwa — hazardzista wskazuje kolejną osobę.`);
        if (s.winner) {
          s.pending = null;
          advance();
        }
      }
      break;
    }

    case "drunkard": {
      if (payload.yes && t) {
        spend(s, "opoj");
        sleep(s, t);
        announce(s, `Opój spił: ${nameOf(s, t)}.`);
        log(s, `Opój spił ${nameOf(s, t)} — nie budzi się tej nocy.`, false);
        say(s, `${nameOf(s, t)} nie budzi się tej nocy (ale można go zabić i przeszukać).`);
      }
      advance();
      break;
    }

    case "janosik": {
      if (payload.yes) {
        spend(s, "janosik");
        log(s, `Janosik zamachał ciupagą — wszyscy się cieszą.`);
        say(s, "Janosik zamachał ciupagą. Wszyscy się cieszą.");
        advance();
        return { state: s, joy: true };
      }
      advance();
      break;
    }

    case "bandits-rob": {
      if (t) {
        const leader = activeMembers(s, "bandyci")[0];
        announce(s, `Bandyci kogoś okradli tej nocy.`);
        if (leader && takeIdol(s, t, leader.id, "Kradzież bandy")) {
          say(s, `${nameOf(s, t)} miał posążek — banda go przejmuje!`);
        } else {
          say(s, `${nameOf(s, t)} nie miał posążka.`);
        }
        if (s.settings.banditsCanKill && payload.yes) {
          killAtNight(s, t, leader?.id ?? null, "zabity przez bandytów");
        }
      }
      advance();
      break;
    }

    case "bandits-sail": {
      if (payload.yes) {
        s.sailDeclared = true;
        say(
          s,
          "Bandyci deklarują odpłynięcie o poranku.",
          "Muszą utrzymać posążek przez fazy Indian i ufoków."
        );
        log(s, "Bandyci zadeklarowali odpłynięcie statkiem o poranku.");
      }
      advance();
      break;
    }

    case "assign": {
      const m = payload.memberId;
      if (m && isActive(s, m)) {
        const before = s.idolHolder;
        s.idolHolder = m;
        if (s.plantedIdolOn === before) s.plantedIdolOn = null;
        log(s, `Posążek przekazany: ${nameOf(s, before)} → ${nameOf(s, m)}.`);
        say(s, `Posążek trzyma teraz ${nameOf(s, m)} (${roleNameOf(s, m)}).`);
      }
      advance();
      break;
    }

    case "avenger": {
      if (payload.yes && t) {
        spend(s, "msciciel");
        const av = livingWithRole(s, "msciciel")!;
        const r = killAtNight(s, t, av.id, "zabity przez mściciela");
        announce(s, `Mściciel zabił: ${nameOf(s, t)}.`);
        say(s, r.ok ? `${nameOf(s, t)} ginie.` : r.reason!);
      }
      advance();
      break;
    }

    case "thief": {
      if (payload.yes && t) {
        spend(s, "zlodziej");
        const th = livingWithRole(s, "zlodziej")!;
        say(
          s,
          takeIdol(s, t, th.id, "Kradzież złodzieja")
            ? `${nameOf(s, t)} miał posążek — złodziej go przejmuje!`
            : `${nameOf(s, t)} nie miał posążka.`
        );
      }
      advance();
      break;
    }

    case "cardsharp": {
      if (payload.yes && t) {
        spend(s, "szuler");
        const sz = livingWithRole(s, "szuler")!;
        sleep(s, t);
        const won = takeIdol(s, t, sz.id, "Gra w karty");
        announce(
          s,
          won ? "Szuler grał z właścicielem posążka." : `Szuler grał z: ${nameOf(s, t)}.`
        );
        say(s, won ? `${nameOf(s, t)} miał posążek — szuler go wygrywa!` : `${nameOf(s, t)} nie budzi się tej nocy.`);
      }
      advance();
      break;
    }

    case "shaman": {
      if (payload.yes && t) {
        spend(s, "szaman");
        say(s, `Karta: ${roleNameOf(s, t)} — frakcja ${factionOf(s, t)}.`);
        log(s, `Szaman sprawdził ${nameOf(s, t)} → ${roleNameOf(s, t)}.`);
      }
      advance();
      break;
    }

    case "indians-kill": {
      if (t) {
        const killer = activeMembers(s, "indianie")[0];
        const had = holdsIdol(s, t);
        const r = killAtNight(s, t, killer?.id ?? null, "zabity przez Indian");
        announce(s, `Indianie zabili: ${nameOf(s, t)}.`);
        if (r.ok && had) {
          s.indiansTookIdolTonight = true;
          say(s, `${nameOf(s, t)} ginie i miał posążek — Indianie go przejmują.`, "Przysługuje im drugie zabójstwo.");
        } else {
          say(s, r.ok ? `${nameOf(s, t)} ginie.` : r.reason!);
        }
      }
      advance();
      break;
    }

    case "extra-kill": {
      if (t) {
        const actor = step.roleId ? livingWithRole(s, step.roleId) : undefined;
        const had = holdsIdol(s, t);
        const r = killAtNight(s, t, actor?.id ?? null, `zabity przez: ${step.title}`);
        announce(s, `${step.title} zabił: ${nameOf(s, t)}.`);
        if (r.ok && had) s.indiansTookIdolTonight = true;
        say(s, r.ok ? `${nameOf(s, t)} ginie.` : r.reason!);
      }
      advance();
      break;
    }

    case "quietfoot-take": {
      if (payload.yes) {
        const cs = livingWithRole(s, "cicha-stopa")!;
        if (s.plantedIdolOn && s.idolHolder === s.plantedIdolOn) {
          const from = s.plantedIdolOn;
          s.idolHolder = cs.id;
          s.plantedIdolOn = null;
          log(s, `Cicha stopa odebrała posążek od ${nameOf(s, from)}.`);
          say(s, `Posążek wraca do cichej stopy (${cs.name}).`);
        }
      }
      advance();
      break;
    }

    case "quietfoot-plant": {
      if (payload.yes && t) {
        const cs = livingWithRole(s, "cicha-stopa")!;
        s.idolHolder = t;
        s.plantedIdolOn = t;
        log(s, `Cicha stopa podłożyła posążek: ${nameOf(s, t)}.`);
        say(
          s,
          `${nameOf(s, t)} jest teraz traktowany jak właściciel posążka — i o tym nie wie.`,
          `${cs.name} może go odebrać przy kolejnym ruchu Indian.`
        );
      }
      advance();
      break;
    }

    case "binoculars": {
      if (payload.yes) {
        spend(s, "lornecie-oko");
        say(
          s,
          s.idolHolder
            ? `Posążek jest u: ${nameOf(s, s.idolHolder)} (${roleNameOf(s, s.idolHolder)}).`
            : "Posążka nie ma przy nikim.",
          "Do kolejnego ruchu Indian posążek może się przemieścić."
        );
      }
      advance();
      break;
    }

    case "medicine-woman": {
      if (payload.yes && t) {
        spend(s, "szamanka");
        s.poisoned = t;
        log(s, `Szamanka otruła ${nameOf(s, t)} — zginie następnego dnia.`);
        say(s, `${nameOf(s, t)} zzielenieje i zginie następnego dnia, przed głosowaniami.`);
      }
      advance();
      break;
    }

    case "tentacle": {
      if (payload.yes && t) {
        spend(s, "zielona-macka");
        const zm = livingWithRole(s, "zielona-macka")!;
        const r = killAtNight(s, t, zm.id, "zabity przez Zieloną Mackę");
        announce(s, `Zielona Macka zabiła: ${nameOf(s, t)}.`);
        say(s, r.ok ? `${nameOf(s, t)} ginie.` : r.reason!);
      }
      advance();
      break;
    }

    case "detector": {
      if (t) {
        const det = livingWithRole(s, "detektor")!;
        if (holdsIdol(s, t)) say(s, `${nameOf(s, t)} MA posążek.`);
        else say(s, `${nameOf(s, t)} nie ma posążka.`, arcOf(s, t, det.id));
        log(s, `Detektor badał ${nameOf(s, t)}.`);
      }
      advance();
      break;
    }

    case "mind-eater": {
      if (t) {
        say(s, `Karta: ${roleNameOf(s, t)} — frakcja ${factionOf(s, t)}.`);
        log(s, `Pożeracz umysłów poznał kartę ${nameOf(s, t)}.`);
      }
      advance();
      break;
    }

    case "ufo-search": {
      if (t) {
        const leader = activeMembers(s, "ufoki")[0];
        say(
          s,
          leader && takeIdol(s, t, leader.id, "Przeszukanie ufoków")
            ? `${nameOf(s, t)} miał posążek — ufoki go przejmują!`
            : `${nameOf(s, t)} nie miał posążka.`
        );
      }
      advance();
      break;
    }

    case "ufo-signal": {
      if (idolFaction(s) === "ufoki") {
        s.signals += 1;
        log(s, `Ufoki nadały sygnał (${s.signals}/3).`);
        say(s, `Sygnał nadany. Licznik: ${s.signals}/3.`);
        if (s.signals >= 3)
          setWinner(s, "ufoki", "Ufoki nadały trzeci sygnał — przylatuje statek i odlatują z posążkiem.");
      } else {
        say(s, "Ufoki nie mają posążka — sygnał się nie udaje.");
      }
      advance();
      break;
    }

    case "doctor": {
      if (payload.yes && t) {
        spend(s, "lekarz");
        const p = playerById(s, t)!;
        p.alive = true;
        p.deathNote = undefined;
        p.deathPhase = undefined;
        s.nightDeaths = s.nightDeaths.filter((x) => x !== t);
        log(s, `Lekarz wskrzesił ${p.name}.`);
        say(s, `${p.name} wraca do gry. Nikt nie dowiaduje się, że zadziałał lekarz.`);
      }
      advance();
      break;
    }

    case "end-night": {
      endNight(s);
      break;
    }

    default:
      advance();
  }

  return { state: s, stay: !!s.pending };
}

/** Pierwszy indeks od `from` (włącznie), który nie jest pominięty. */
export function nextIndex(s: GameState, from: number): number {
  const steps = nightSteps(s);
  let i = from;
  while (i < steps.length - 1) {
    i++;
    if (!skipReason(s, steps[i])) return i;
  }
  return steps.length - 1;
}

export function firstIndex(s: GameState): number {
  const steps = nightSteps(s);
  for (let i = 0; i < steps.length; i++) if (!skipReason(s, steps[i])) return i;
  return 0;
}

// ── poranek ────────────────────────────────────────────────────────────────

export function endNight(s: GameState) {
  const sheriff = livingWithRole(s, "szeryf");
  if (sheriff && s.idolHolder === sheriff.id) {
    setWinner(
      s,
      "miasto",
      `Szeryf (${sheriff.name}) dotrwał z posążkiem do końca nocy — miasto wygrywa.`
    );
  }
  if (!s.winner && s.sailDeclared && idolFaction(s) === "bandyci") {
    setWinner(s, "bandyci", "Bandyci odpłynęli o poranku z posążkiem — bandyci wygrywają.");
  }
  checkIndiansWin(s);

  const deaths = s.nightDeaths.map((id) => `${nameOf(s, id)} (${roleNameOf(s, id)})`);
  s.morningReport.push(
    deaths.length ? `Tej nocy zginęli: ${deaths.join(", ")}.` : "Tej nocy nikt nie zginął."
  );

  s.jailed = null;
  s.lastProtectedId = s.protectedId;
  s.protectedId = null;
  s.asleep = [];
  s.drunk = [];
  s.nightDeaths = [];
  s.indiansTookIdolTonight = false;
  s.sailDeclared = false;
  s.pending = null;
  s.duelsToday = 0;
  s.day = s.night + 1;
  if (!s.winner) s.stage = "day";
  log(s, `Wstaje dzień ${s.day}.`, false);
}

export function startNight(prev: GameState): GameState {
  const s = clone(prev);
  s.night = s.day;
  s.stage = "night";
  s.morningReport = [];
  s.feedback = [];
  s.idolAtNightStart = s.idolHolder;
  s.stepIndex = firstIndex(s);
  log(s, `Zapada noc ${s.night}.`, false);
  return s;
}

// ── dzień ──────────────────────────────────────────────────────────────────

export function resolvePoison(prev: GameState): GameState {
  const s = clone(prev);
  if (!s.poisoned) return s;
  const victim = s.poisoned;
  s.poisoned = null;
  const isLastNonIndian =
    s.players.filter((p) => p.alive && factionOf(s, p.id) !== "indianie").length === 1 &&
    holdsIdol(s, victim);
  killAtDay(s, victim, "otruty przez szamankę — zzieleniał na twarzy");
  if (isLastNonIndian && !s.winner) {
    setWinner(
      s,
      "miasto",
      "Szamanka otruła ostatniego nie-Indianina z posążkiem — miasto wygrywa (kara dla Indian za głupotę)."
    );
  }
  return s;
}

export interface DuelResult {
  aId: string;
  bId: string;
  votesA: number;
  votesB: number;
  /** Nadpisanie: kto zginął mimo wyniku głosowania. */
  override?: "a" | "b" | "remis" | null;
  overrideNote?: string;
}

export function resolveDuel(prev: GameState, d: DuelResult): GameState {
  const s = clone(prev);
  s.duelsToday += 1;
  const a = playerById(s, d.aId)!;
  const b = playerById(s, d.bId)!;
  let dead: string[] = [];
  if (d.override === "a") dead = [d.bId];
  else if (d.override === "b") dead = [d.aId];
  else if (d.override === "remis") dead = [d.aId, d.bId];
  else if (d.votesA === 0 && d.votesB === 0) dead = [];
  else if (d.votesA > d.votesB) dead = [d.bId];
  else if (d.votesB > d.votesA) dead = [d.aId];
  else dead = [d.aId, d.bId];

  log(
    s,
    `Pojedynek ${a.name} vs ${b.name} — głosy ${d.votesA}:${d.votesB}${
      d.overrideNote ? ` (${d.overrideNote})` : ""
    }.`,
    false
  );
  for (const id of dead) killAtDay(s, id, "poległ w pojedynku");
  if (dead.length === 0) log(s, "Wszyscy się wstrzymali — nikt nie ginie.", false);
  return s;
}

export function resolveSearch(prev: GameState, ids: string[]): GameState {
  const s = clone(prev);
  const names = ids.map((id) => nameOf(s, id)).join(", ");
  log(s, `Przeszukano: ${names}.`, false);
  const found = ids.find((id) => holdsIdol(s, id));
  if (found) {
    setWinner(
      s,
      "miasto",
      `Podczas przeszukania znaleziono posążek u: ${nameOf(s, found)} — miasto wygrywa.`
    );
  } else {
    log(s, "Nikt z przeszukanych nie miał posążka.", false);
  }
  return s;
}

export function resolveHanging(prev: GameState, id: string | null, pardoned: boolean): GameState {
  const s = clone(prev);
  if (!id) {
    log(s, "Miasto nikogo nie powiesiło.", false);
    return s;
  }
  if (pardoned) {
    log(s, `Burmistrz ułaskawił ${nameOf(s, id)} — nikt nie zostaje powieszony.`, false);
    return s;
  }
  killAtDay(s, id, "powieszony wyrokiem rady miasta", true);
  return s;
}

export function factionColorVar(f: Faction | "system"): string {
  switch (f) {
    case "miasto":
      return "var(--city)";
    case "bandyci":
      return "var(--bandit)";
    case "indianie":
      return "var(--indian)";
    case "ufoki":
      return "var(--ufo)";
    default:
      return "var(--text-dim)";
  }
}
