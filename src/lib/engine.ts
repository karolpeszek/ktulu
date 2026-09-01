import { Faction, GameState, Player, Settings } from "./types";
import { ROLE_BY_ID } from "./roles";

export const DEFAULT_SETTINGS: Settings = {
  searchCount: 2,
  shipNight: 3,
  maxDuelsPerDay: 2,
  banditsCanKill: false,
  disclosure: "tajny",
};

export function emptyState(): GameState {
  return {
    version: 1,
    setup: {
      withJanosik: false,
      counts: { miasto: 0, bandyci: 0, indianie: 0, ufoki: 0, janosik: 0 },
      picked: { miasto: [], bandyci: [], indianie: [], ufoki: [], janosik: [] },
      autofill: true,
      manualCounts: false,
      manualSettings: false,
    },
    stage: "setup",
    players: [],
    settings: { ...DEFAULT_SETTINGS },
    night: 0,
    day: 0,
    stepIndex: 0,
    idolHolder: null,
    plantedIdolOn: null,
    used: {},
    jailed: null,
    protectedId: null,
    lastProtectedId: null,
    drunk: [],
    asleep: [],
    nightDeaths: [],
    indiansTookIdolTonight: false,
    idolAtNightStart: null,
    poisoned: null,
    sailDeclared: false,
    signals: 0,
    duelsToday: 0,
    bonds: [],
    events: [],
    winner: null,
    winReason: null,
    morningReport: [],
    pending: null,
    feedback: [],
  };
}

// ── odczyty pomocnicze ─────────────────────────────────────────────────────

export function factionOf(s: GameState, id: string | null): Faction | null {
  const p = s.players.find((x) => x.id === id);
  return p?.roleId ? ROLE_BY_ID[p.roleId].faction : null;
}

export function playerById(s: GameState, id: string | null | undefined): Player | undefined {
  return s.players.find((p) => p.id === id);
}

export function nameOf(s: GameState, id: string | null | undefined): string {
  return playerById(s, id)?.name ?? "—";
}

export function roleNameOf(s: GameState, id: string | null | undefined): string {
  const p = playerById(s, id);
  return p?.roleId ? ROLE_BY_ID[p.roleId].name : "—";
}

export function playersWithRole(s: GameState, roleId: string): Player[] {
  return s.players.filter((p) => p.roleId === roleId);
}

export function livingWithRole(s: GameState, roleId: string): Player | undefined {
  return s.players.find((p) => p.roleId === roleId && p.alive);
}

export function factionMembers(s: GameState, f: Faction): Player[] {
  return s.players.filter((p) => p.roleId && ROLE_BY_ID[p.roleId].faction === f);
}

export function livingMembers(s: GameState, f: Faction): Player[] {
  return factionMembers(s, f).filter((p) => p.alive);
}

export function isActive(s: GameState, id: string | null | undefined): boolean {
  const p = playerById(s, id);
  return !!p && p.alive && !s.asleep.includes(p.id);
}

export function activeMembers(s: GameState, f: Faction): Player[] {
  return livingMembers(s, f).filter((p) => !s.asleep.includes(p.id));
}

export function idolFaction(s: GameState): Faction | null {
  return factionOf(s, s.idolHolder);
}

/** Najwyższy rangą aktywny członek frakcji — on decyduje o przydziale posążka. */
export function leaderOf(s: GameState, f: Faction): Player | undefined {
  const act = activeMembers(s, f);
  return act.find((p) => p.roleId && ROLE_BY_ID[p.roleId].leader) ?? act[0];
}

export function usedCount(s: GameState, key: string): number {
  return s.used[key] ?? 0;
}

// ── log ────────────────────────────────────────────────────────────────────

let eventSeq = 0;
export function log(s: GameState, text: string, secret = true) {
  s.events.unshift({
    id: `e${Date.now().toString(36)}-${eventSeq++}`,
    phase: s.stage === "night" ? `Noc ${s.night}` : s.stage === "day" ? `Dzień ${s.day}` : "Gra",
    text,
    secret,
    ts: Date.now(),
  });
}

// ── zwycięstwa ─────────────────────────────────────────────────────────────

export function setWinner(s: GameState, w: GameState["winner"], reason: string) {
  if (s.winner) return;
  s.winner = w;
  s.winReason = reason;
  s.stage = "koniec";
  log(s, `KONIEC GRY — ${reason}`, false);
}

export function checkIndiansWin(s: GameState) {
  if (s.winner) return;
  const alive = s.players.filter((p) => p.alive);
  if (alive.length === 0) return;
  if (alive.every((p) => p.roleId && ROLE_BY_ID[p.roleId].faction === "indianie")) {
    setWinner(s, "indianie", "Przy życiu pozostali sami Indianie.");
  }
}

/** Śmierć posiadacza posążka za dnia = rewizja zwłok = zwycięstwo miasta. */
export function checkDayIdolReveal(s: GameState, deadId: string) {
  if (s.idolHolder === deadId) {
    setWinner(s, "miasto", `Posążek znaleziono przy zwłokach (${nameOf(s, deadId)}) — miasto wygrywa.`);
  }
}

// ── zabijanie ──────────────────────────────────────────────────────────────

export interface KillResult {
  ok: boolean;
  reason?: string;
  tookIdol?: boolean;
}

/** Zabójstwo nocne. Posążek zawsze przechodzi w ręce zabójcy. */
export function killAtNight(
  s: GameState,
  victimId: string,
  killerId: string | null,
  note: string
): KillResult {
  const v = playerById(s, victimId);
  if (!v || !v.alive) return { ok: false, reason: "Ta osoba już nie żyje." };
  if (s.jailed === victimId)
    return { ok: false, reason: `${v.name} siedzi w więzieniu — nie można jej zabić.` };
  if (s.protectedId === victimId)
    return { ok: false, reason: `${v.name} jest chroniona przez ochroniarza — przeżywa.` };

  v.alive = false;
  v.deathNote = note;
  v.deathPhase = `Noc ${s.night}`;
  s.nightDeaths.push(victimId);

  let tookIdol = false;
  if (s.idolHolder === victimId) {
    tookIdol = true;
    s.plantedIdolOn = null;
    s.idolHolder = killerId;
    if (killerId) {
      log(s, `Posążek przechodzi do: ${nameOf(s, killerId)} (${roleNameOf(s, killerId)}).`);
    } else {
      log(s, `Posążek zostaje przy zwłokach — brak zabójcy przejmującego.`);
    }
  }
  // Ochroniarz zginął — ochrona przestaje działać.
  if (v.roleId === "ochroniarz" && s.protectedId) {
    log(s, `Ochroniarz zginął — ochrona ${nameOf(s, s.protectedId)} przestaje działać.`);
    s.protectedId = null;
  }
  log(s, `${v.name} (${roleNameOf(s, victimId)}) ginie — ${note}.`);
  checkIndiansWin(s);
  return { ok: true, tookIdol };
}

/** Śmierć dzienna: powieszenie, pojedynek, trucizna. */
export function killAtDay(s: GameState, victimId: string, note: string, hanging = false) {
  const v = playerById(s, victimId);
  if (!v || !v.alive) return;
  v.alive = false;
  v.deathNote = note;
  v.deathPhase = `Dzień ${s.day}`;
  log(s, `${v.name} (${roleNameOf(s, victimId)}) ginie — ${note}.`, false);

  if (hanging && v.roleId === "janosik") {
    setWinner(
      s,
      "janosik",
      `Powieszono Janosika (${v.name}) — Janosik wygrywa, wszyscy pozostali przegrywają.`
    );
    return;
  }
  checkDayIdolReveal(s, victimId);
  checkIndiansWin(s);
}

// ── kroki nocy ─────────────────────────────────────────────────────────────

export type StepSelect = "none" | "player" | "member" | "yesno";

export interface NightStep {
  id: string;
  action: string;
  faction: Faction | "system";
  title: string;
  script: string;
  detail?: string;
  select: StepSelect;
  optional?: boolean;
  secret: boolean;
  /** Co Manitou zobaczy po rozstrzygnięciu. */
  reveals?: "karta" | "frakcja" | "posiadacz" | "luk" | "ma-posazek" | "nic";
  /** Rola, do której krok należy (jeśli indywidualna). */
  roleId?: string;
  /** Kogo nie wolno wskazać. */
  forbid?: string[];
}

function hasRole(s: GameState, roleId: string): boolean {
  return s.players.some((p) => p.roleId === roleId);
}

function hasFaction(s: GameState, f: Faction): boolean {
  return s.players.some((p) => p.roleId && ROLE_BY_ID[p.roleId].faction === f);
}

export function nightSteps(s: GameState): NightStep[] {
  const steps: NightStep[] = [];
  const push = (st: NightStep) => steps.push(st);
  const zero = s.night === 0;

  push({
    id: "open",
    action: "info",
    faction: "system",
    title: zero ? "Noc zerowa" : `Noc ${s.night}`,
    script: zero
      ? "Zapada noc. Wszyscy zamykają oczy i zakrywają twarz dłońmi. Zaczynamy noc zerową."
      : "Zapada noc. Wszyscy zamykają oczy i zakrywają twarz dłońmi.",
    select: "none",
    secret: false,
  });

  // — Miasto —
  if (hasRole(s, "szeryf"))
    push({
      id: "sheriff",
      action: "sheriff-jail",
      faction: "miasto",
      roleId: "szeryf",
      title: "Szeryf",
      script: "Budzi się szeryf. Wskaż osobę, którą zamykasz na noc w więzieniu.",
      detail:
        "Zamknięty nie budzi się przez resztę nocy i nie może zginąć. Jeśli miał posążek — przejmuje go szeryf. Szeryf nie zamyka sam siebie.",
      select: "player",
      secret: false,
      reveals: "ma-posazek",
    });

  if (hasRole(s, "pastor"))
    push({
      id: "pastor",
      action: "pastor",
      faction: "miasto",
      roleId: "pastor",
      title: "Pastor",
      script: "Budzi się pastor. Wskaż osobę, którą chcesz wyspowiadać.",
      detail: "Pastor poznaje frakcję wskazanej osoby. Spowiadany o niczym nie wie.",
      select: "player",
      secret: true,
      reveals: "frakcja",
    });

  if (zero) {
    if (hasRole(s, "dziwka"))
      push({
        id: "whore",
        action: "whore",
        faction: "miasto",
        roleId: "dziwka",
        title: "Dziwka",
        script: "Budzi się dziwka. Wskaż osobę, która zostaje twoim klientem.",
        detail:
          "UWAGA: po wskazaniu Manitou budzi klienta przy otwartych oczach dziwki. Klient musi zobaczyć, kto jest dziwką, a dziwka poznaje jego kartę. Dopiero potem oboje zasypiają.",
        select: "player",
        secret: true,
        reveals: "karta",
      });
    if (hasRole(s, "uwodziciel"))
      push({
        id: "seducer",
        action: "seducer",
        faction: "miasto",
        roleId: "uwodziciel",
        title: "Uwodziciel",
        script: "Budzi się uwodziciel. Wskaż osobę, którą uwodzisz.",
        detail:
          "UWAGA: uwiedziony MUSI zostać obudzony i zobaczyć, kto go uwiódł — inaczej nie ma jak przestrzegać zasady. Od tej pory nie może działać na szkodę uwodziciela: nawoływać do jego zabicia ani za tym głosować, musi głosować za nim w pojedynkach i nie może ujawnić uwiedzenia.",
        select: "player",
        secret: true,
      });
  } else {
    if (hasRole(s, "poborca"))
      push({
        id: "tax",
        action: "tax",
        faction: "miasto",
        roleId: "poborca",
        title: "Poborca podatków",
        script: "Budzi się poborca podatków. Czy chcesz zajrzeć w zeznania majątkowe?",
        detail: "Raz w grze: Manitou wskazuje aktualnego posiadacza posążka.",
        select: "yesno",
        optional: true,
        secret: true,
        reveals: "posiadacz",
      });

    if (hasRole(s, "ochroniarz"))
      push({
        id: "guard",
        action: "guard",
        faction: "miasto",
        roleId: "ochroniarz",
        title: "Ochroniarz",
        script: "Budzi się ochroniarz. Wskaż osobę, którą tej nocy chronisz.",
        detail:
          "Nie może chronić siebie ani tej samej osoby co poprzedniej nocy. Chroniony nie zginie, ale może zostać okradziony czy spowiadany.",
        select: "player",
        secret: false,
      });

    if (hasRole(s, "hazardzista"))
      push({
        id: "gambler",
        action: "gambler",
        faction: "miasto",
        roleId: "hazardzista",
        title: "Hazardzista",
        script: "Budzi się hazardzista. Czy zaczynasz rosyjską ruletkę?",
        detail:
          "Od drugiej nocy, raz w grze. Wskazany obywatel miasta → ginie hazardzista. Wskazany nie-miastowy → ginie i hazardzista wskazuje kolejnego. Przerywa dopiero, gdy zginie albo zdobędzie posążek.",
        select: "yesno",
        optional: true,
        secret: false,
      });

    if (hasRole(s, "opoj"))
      push({
        id: "drunkard",
        action: "drunkard",
        faction: "miasto",
        roleId: "opoj",
        title: "Opój",
        script: "Budzi się opój. Czy idziesz się z kimś napić?",
        detail:
          "Dwa razy w grze. Spity nie budzi się tej nocy, ale można go zabić, okraść i przeszukać.",
        select: "yesno",
        optional: true,
        secret: false,
      });

    if (hasRole(s, "janosik"))
      push({
        id: "janosik",
        action: "janosik",
        faction: "janosik",
        roleId: "janosik",
        title: "Janosik",
        script: "Budzi się Janosik. Czy machasz ciupagą?",
        detail:
          "Raz w grze, w tajemnicy. Gdy Janosik zamacha ciupagą — wszyscy się cieszą. Nie wpływa to na warunki zwycięstwa. Janosik jest osobną frakcją i budzi się po mieście, przed bandytami.",
        select: "yesno",
        optional: true,
        secret: true,
      });
  }

  // — Bandyci —
  if (hasFaction(s, "bandyci")) {
    push({
      id: "bandits-wake",
      action: "info",
      faction: "bandyci",
      title: "Bandyci się budzą",
      script: zero
        ? "Budzą się bandyci — poznajcie się nawzajem. Herszt trzyma posążek."
        : "Budzą się bandyci.",
      detail: zero ? "Bandyci rozglądają się po sobie i zapamiętują skład bandy." : undefined,
      select: "none",
      secret: false,
    });

    if (zero) {
      if (hasRole(s, "szantazysta"))
        push({
          id: "blackmailer",
          action: "blackmailer",
          faction: "bandyci",
          roleId: "szantazysta",
          title: "Szantażysta",
          script: "Budzi się szantażysta. Wskaż osobę, którą szantażujesz.",
          detail:
            "UWAGA: szantażowany MUSI zostać obudzony i zobaczyć, kto go szantażuje — inaczej nie ma jak przestrzegać zasady. Od tej pory nie może działać na szkodę szantażysty: nawoływać do jego zabicia ani za tym głosować, musi głosować za nim w pojedynkach i nie może ujawnić szantażu.",
          select: "player",
          secret: true,
        });
    } else {
      push({
        id: "bandits-rob",
        action: "bandits-rob",
        faction: "bandyci",
        title: "Bandyci przeszukują",
        script: "Bandyci wskazują osobę, którą okradają.",
        detail:
          "Tylko gdy banda nie ma posążka. Jeśli okradziony go ma — posążek przechodzi w ręce bandy. Wg Xięgi bandyci nie zabijają swojej ofiary.",
        select: "player",
        optional: true,
        secret: true,
        reveals: "ma-posazek",
      });
      push({
        id: "bandits-sail",
        action: "bandits-sail",
        faction: "bandyci",
        title: "Odpłynięcie statku",
        script: "Bandyci — czy tej nocy wsiadacie na statek i odpływacie z posążkiem?",
        detail:
          "Statek odpływa dopiero o poranku: posążek trzeba utrzymać przez fazy Indian i ufoków.",
        select: "yesno",
        optional: true,
        secret: true,
      });
      push({
        id: "bandits-assign",
        action: "assign",
        faction: "bandyci",
        title: "Bandyci przekazują posążek",
        script: "Herszt decyduje, który bandyta trzyma posążek.",
        detail: "Osoba nieaktywna (spita, w więzieniu) nie może posążka oddać ani przyjąć.",
        select: "member",
        optional: true,
        secret: true,
      });
      push({
        id: "bandits-sleep",
        action: "info",
        faction: "bandyci",
        title: "Bandyci idą spać",
        script: "Bandyci zamykają oczy.",
        select: "none",
        secret: false,
      });

      if (hasRole(s, "msciciel"))
        push({
          id: "avenger",
          action: "avenger",
          faction: "bandyci",
          roleId: "msciciel",
          title: "Mściciel",
          script: "Budzi się mściciel. Czy zabijasz tej nocy?",
          detail: "Raz w grze. Ofiara mściciela jest ogłaszana jawnie.",
          select: "yesno",
          optional: true,
          secret: false,
        });

      if (hasRole(s, "zlodziej"))
        push({
          id: "thief",
          action: "thief",
          faction: "bandyci",
          roleId: "zlodziej",
          title: "Złodziej",
          script: "Budzi się złodziej. Czy próbujesz ukraść posążek?",
          detail: "Raz w grze, tajnie. Jeśli wskazany ma posążek — złodziej go przejmuje.",
          select: "yesno",
          optional: true,
          secret: true,
          reveals: "ma-posazek",
        });

      if (hasRole(s, "szuler"))
        push({
          id: "cardsharp",
          action: "cardsharp",
          faction: "bandyci",
          roleId: "szuler",
          title: "Szuler",
          script: "Budzi się szuler. Czy siadasz z kimś do kart?",
          detail:
            "Raz w grze. Partner nie budzi się tej nocy; jeśli ma posążek — szuler go wygrywa. Jawne jest, z kim szuler grał (a jeśli wygrał posążek, Manitou mówi: „szuler grał z właścicielem posążka”).",
          select: "yesno",
          optional: true,
          secret: false,
          reveals: "ma-posazek",
        });
    }
  }

  // — Indianie —
  if (hasFaction(s, "indianie")) {
    if (!zero && hasRole(s, "szaman"))
      push({
        id: "shaman",
        action: "shaman",
        faction: "indianie",
        roleId: "szaman",
        title: "Szaman",
        script: "Budzi się szaman. Czy wpadasz w trans?",
        detail: "Raz w grze, tajnie: szaman poznaje kartę wskazanej osoby.",
        select: "yesno",
        optional: true,
        secret: true,
        reveals: "karta",
      });

    push({
      id: "indians-wake",
      action: "info",
      faction: "indianie",
      title: "Indianie się budzą",
      script: zero ? "Budzą się Indianie — poznajcie się nawzajem." : "Budzą się Indianie.",
      select: "none",
      secret: false,
    });

    if (!zero) {
      push({
        id: "indians-kill",
        action: "indians-kill",
        faction: "indianie",
        title: "Indianie zabijają",
        script: "Indianie wskazują osobę, którą tej nocy zabijają.",
        detail: "Jeśli ofiara miała posążek — Indianie go przejmują.",
        select: "player",
        secret: false,
      });
      push({
        id: "indians-kill2",
        action: "indians-kill",
        faction: "indianie",
        title: "Indianie zabijają po raz drugi",
        script: "Indianie mają posążek — wskazują drugą ofiarę.",
        detail: "Drugie zabójstwo przysługuje tylko, gdy Indianie posiadają posążek.",
        select: "player",
        secret: false,
      });
      if (hasRole(s, "wojownik"))
        push({
          id: "warrior",
          action: "extra-kill",
          faction: "indianie",
          roleId: "wojownik",
          title: "Wojownik",
          script: "Wojownik zabija dodatkowo jedną osobę.",
          detail: "Tylko jeśli tej nocy Indianie przejęli posążek, a wojownik jest aktywny.",
          select: "player",
          secret: false,
        });
      if (hasRole(s, "samotny-kojot"))
        push({
          id: "coyote",
          action: "extra-kill",
          faction: "indianie",
          roleId: "samotny-kojot",
          title: "Samotny kojot",
          script: "Samotny kojot zabija dodatkowo jedną osobę.",
          detail: "Tylko jeśli kojot jest jedynym aktywnym Indianinem.",
          select: "player",
          secret: false,
        });
      push({
        id: "indians-assign",
        action: "assign",
        faction: "indianie",
        title: "Indianie przekazują posążek",
        script: "Wódz decyduje, który Indianin trzyma posążek.",
        select: "member",
        optional: true,
        secret: true,
      });
      push({
        id: "indians-sleep",
        action: "info",
        faction: "indianie",
        title: "Indianie idą spać",
        script: "Indianie zamykają oczy.",
        select: "none",
        secret: false,
      });
      if (hasRole(s, "cicha-stopa")) {
        push({
          id: "quietfoot-take",
          action: "quietfoot-take",
          faction: "indianie",
          roleId: "cicha-stopa",
          title: "Cicha stopa — odbiór posążka",
          script: "Cicha stopa: czy odbierasz podłożony posążek?",
          detail: "Możliwe, jeśli podrzucona osoba nie utraciła posążka do tego ruchu Indian.",
          select: "yesno",
          optional: true,
          secret: true,
        });
        push({
          id: "quietfoot-plant",
          action: "quietfoot-plant",
          faction: "indianie",
          roleId: "cicha-stopa",
          title: "Cicha stopa — podłożenie posążka",
          script: "Cicha stopa: czy podkładasz komuś posążek?",
          detail:
            "Podrzucony jest traktowany jak właściciel (przeszukany → miasto wygrywa), ale o niczym nie wie.",
          select: "yesno",
          optional: true,
          secret: true,
        });
      }
      if (hasRole(s, "lornecie-oko"))
        push({
          id: "binoculars",
          action: "binoculars",
          faction: "indianie",
          roleId: "lornecie-oko",
          title: "Lornecie oko",
          script: "Lornecie oko: czy sprawdzasz, gdzie jest posążek?",
          detail: "Raz w grze, tajnie. Posążek może się jeszcze przemieścić.",
          select: "yesno",
          optional: true,
          secret: true,
          reveals: "posiadacz",
        });
      if (hasRole(s, "szamanka"))
        push({
          id: "medicine-woman",
          action: "medicine-woman",
          faction: "indianie",
          roleId: "szamanka",
          title: "Szamanka",
          script: "Szamanka: czy podkładasz komuś truciznę?",
          detail:
            "Raz w grze, tajnie. Otruty zielenieje i ginie następnego dnia, przed głosowaniami.",
          select: "yesno",
          optional: true,
          secret: true,
        });
    }
  }

  // — Ufoki —
  if (hasFaction(s, "ufoki")) {
    push({
      id: "ufo-wake",
      action: "info",
      faction: "ufoki",
      title: "Ufoki się budzą",
      script: zero ? "Budzą się ufoludki — poznajcie się nawzajem." : "Budzą się ufoludki.",
      select: "none",
      secret: false,
    });

    if (!zero) {
      if (hasRole(s, "detektor"))
        push({
          id: "detector",
          action: "detector",
          faction: "ufoki",
          roleId: "detektor",
          title: "Detektor",
          script: "Detektor wskazuje osobę, od której zaczyna detekcję.",
          detail:
            "Jeśli wskazany ma posążek — detektor to wie. Jeśli nie — poznaje łuk okręgu, w którym posążek się znajduje.",
          select: "player",
          secret: true,
          reveals: "luk",
        });
      if (hasRole(s, "pozeracz"))
        push({
          id: "mind-eater",
          action: "mind-eater",
          faction: "ufoki",
          roleId: "pozeracz",
          title: "Pożeracz umysłów",
          script: "Pożeracz umysłów wskazuje osobę, której kartę poznaje.",
          select: "player",
          secret: true,
          reveals: "karta",
        });
      if (hasRole(s, "zielona-macka"))
        push({
          id: "tentacle",
          action: "tentacle",
          faction: "ufoki",
          roleId: "zielona-macka",
          title: "Zielona Macka",
          script: "Zielona Macka: czy zabijasz tej nocy?",
          detail: "Raz w grze. Ofiara jest ogłaszana jawnie.",
          select: "yesno",
          optional: true,
          secret: false,
        });
      push({
        id: "ufo-search",
        action: "ufo-search",
        faction: "ufoki",
        title: "Ufoki przeszukują",
        script: "Ufoki wskazują osobę, którą przeszukują.",
        detail: "Bez możliwości zabijania. Jeśli przeszukany ma posążek — ufoki go przejmują.",
        select: "player",
        optional: true,
        secret: true,
        reveals: "ma-posazek",
      });
      push({
        id: "ufo-assign",
        action: "assign",
        faction: "ufoki",
        title: "Ufoki przekazują posążek",
        script: "Wielki Ufol decyduje, kto trzyma posążek.",
        select: "member",
        optional: true,
        secret: true,
      });
      push({
        id: "ufo-signal",
        action: "ufo-signal",
        faction: "ufoki",
        title: "Ufoki nadają sygnał",
        script: "Ufoki próbują nadać sygnał na macierzystą planetę.",
        detail: "Sygnał udaje się tylko, jeśli po ruchu ufoków posążek jest w ich rękach.",
        select: "none",
        secret: true,
      });
      push({
        id: "ufo-sleep",
        action: "info",
        faction: "ufoki",
        title: "Ufoki idą spać",
        script: "Ufoludki zamykają oczy.",
        select: "none",
        secret: false,
      });
    }
  }

  if (!zero && hasRole(s, "lekarz"))
    push({
      id: "doctor",
      action: "doctor",
      faction: "miasto",
      roleId: "lekarz",
      title: "Lekarz",
      script:
        "Wszyscy mają zamknięte oczy. Manitou pyta cicho: czy lekarz chce kogoś wskrzesić? (Nikt nie może się zorientować, że pytanie padło.)",
      detail: "Raz w grze. Wskrzesić można świeżo zmarłego w nocy lub w pojedynku — nie powieszonego.",
      select: "yesno",
      optional: true,
      secret: true,
    });

  push({
    id: "close",
    action: "end-night",
    faction: "system",
    title: "Świta",
    script: "Noc dobiega końca. Za chwilę wszyscy otworzą oczy.",
    select: "none",
    secret: false,
  });

  return steps;
}

/** Zwraca powód pominięcia kroku albo null, gdy krok jest wykonalny. */
export function skipReason(s: GameState, step: NightStep): string | null {
  if (step.faction !== "system" && step.action !== "info") {
    // kroki frakcyjne
    if (step.roleId) {
      const p = livingWithRole(s, step.roleId);
      if (!p) return `${ROLE_BY_ID[step.roleId].name} nie żyje albo nie ma go w grze.`;
      if (s.asleep.includes(p.id))
        return `${p.name} jest tej nocy nieaktywny (${s.jailed === p.id ? "więzienie" : "spity/zajęty"}).`;
    } else {
      if (activeMembers(s, step.faction as Faction).length === 0)
        return `Brak aktywnych członków frakcji ${step.faction}.`;
    }
  }

  switch (step.id) {
    case "tax":
      return usedCount(s, "poborca") ? "Zdolność już zużyta." : null;
    case "gambler":
      if (s.night < 2) return "Hazardzista działa dopiero od drugiej nocy.";
      return usedCount(s, "hazardzista") ? "Zdolność już zużyta." : null;
    case "drunkard":
      return usedCount(s, "opoj") >= 2 ? "Opój wykorzystał obie kolejki." : null;
    case "janosik":
      return usedCount(s, "janosik") ? "Ciupaga już zamachana." : null;
    case "avenger":
      return usedCount(s, "msciciel") ? "Zdolność już zużyta." : null;
    case "thief":
      return usedCount(s, "zlodziej") ? "Zdolność już zużyta." : null;
    case "cardsharp":
      return usedCount(s, "szuler") ? "Zdolność już zużyta." : null;
    case "shaman":
      return usedCount(s, "szaman") ? "Zdolność już zużyta." : null;
    case "binoculars":
      return usedCount(s, "lornecie-oko") ? "Zdolność już zużyta." : null;
    case "medicine-woman":
      return usedCount(s, "szamanka") ? "Zdolność już zużyta." : null;
    case "tentacle":
      return usedCount(s, "zielona-macka") ? "Zdolność już zużyta." : null;
    case "doctor":
      if (usedCount(s, "lekarz")) return "Zdolność już zużyta.";
      return s.nightDeaths.length === 0 ? "Tej nocy nikt nie zginął." : null;
    case "bandits-rob":
      return idolFaction(s) === "bandyci" ? "Banda ma już posążek." : null;
    case "bandits-sail":
      if (idolFaction(s) !== "bandyci") return "Banda nie ma posążka.";
      if (s.night < s.settings.shipNight)
        return `Statek jest gotowy dopiero od nocy ${s.settings.shipNight}.`;
      return null;
    case "bandits-assign":
      return idolFaction(s) === "bandyci" ? null : "Banda nie ma posążka.";
    case "indians-kill2":
      return idolFaction(s) === "indianie" ? null : "Indianie nie mają posążka.";
    case "warrior":
      return s.indiansTookIdolTonight ? null : "Indianie nie przejęli tej nocy posążka.";
    case "coyote": {
      const act = activeMembers(s, "indianie");
      return act.length === 1 && act[0].roleId === "samotny-kojot"
        ? null
        : "Kojot nie jest jedynym aktywnym Indianinem.";
    }
    case "indians-assign":
      return idolFaction(s) === "indianie" ? null : "Indianie nie mają posążka.";
    case "quietfoot-take": {
      const cs = livingWithRole(s, "cicha-stopa");
      if (!s.plantedIdolOn) return "Nic nie jest podłożone.";
      if (s.idolHolder !== s.plantedIdolOn) return "Podrzucony utracił posążek.";
      return cs ? null : "Cicha stopa nie żyje.";
    }
    case "quietfoot-plant": {
      const cs = livingWithRole(s, "cicha-stopa");
      if (!cs) return "Cicha stopa nie żyje.";
      return s.idolHolder === cs.id ? null : "Cicha stopa nie ma posążka.";
    }
    case "ufo-assign":
      return idolFaction(s) === "ufoki" ? null : "Ufoki nie mają posążka.";
    case "ufo-search":
      return idolFaction(s) === "ufoki" ? "Ufoki mają już posążek." : null;
    default:
      return null;
  }
}
