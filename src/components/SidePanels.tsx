"use client";

import { useState } from "react";
import { useGame } from "@/lib/store";
import { FACTIONS, FACTION_LABEL, Faction } from "@/lib/types";
import { ROLE_BY_ID } from "@/lib/roles";
import {
  checkIndiansWin,
  factionOf,
  killAtDay,
  log,
  nameOf,
  roleNameOf,
  setWinner,
} from "@/lib/engine";
import { Badge, Button, Card, Stat, Toggle, cx, inputCls, FACTION_COLOR } from "./ui";
import FactionDonut from "./FactionDonut";

export function StatusPanel({
  hideRoles,
  onHideRoles,
}: {
  hideRoles: boolean;
  onHideRoles: (v: boolean) => void;
}) {
  const { state } = useGame();
  const counts = {} as Record<Faction, number>;
  const alive = {} as Record<Faction, number>;
  for (const f of FACTIONS) {
    const list = state.players.filter((p) => p.roleId && ROLE_BY_ID[p.roleId].faction === f);
    counts[f] = list.length;
    alive[f] = list.filter((p) => p.alive).length;
  }
  const idolF = factionOf(state, state.idolHolder);

  return (
    <Card
      title="Stan rozgrywki"
      right={<Toggle checked={hideRoles} onChange={onHideRoles} label="Tryb bezpieczny" />}
    >
      <div className="grid grid-cols-2 gap-2">
        <Stat
          label="Posążek"
          value={hideRoles ? "••••" : state.idolHolder ? nameOf(state, state.idolHolder) : "nikt"}
          sub={hideRoles ? undefined : idolF ? FACTION_LABEL[idolF] : "poza grą"}
          color={idolF && !hideRoles ? FACTION_COLOR[idolF] : undefined}
        />
        <Stat
          label="Sygnały ufoków"
          value={`${state.signals}/3`}
          sub={counts.ufoki ? "trzeci kończy grę" : "ufoki nie grają"}
          color={state.signals >= 2 ? "var(--ufo)" : undefined}
        />
        <Stat
          label="Statek bandytów"
          value={state.night >= state.settings.shipNight ? "gotowy" : `noc ${state.settings.shipNight}`}
          sub={state.sailDeclared ? "odpłynięcie zadeklarowane" : "odpływa o poranku"}
          color={state.sailDeclared ? "var(--bandit)" : undefined}
        />
        <Stat
          label="Przeszukania"
          value={state.settings.searchCount}
          sub={`pojedynki: ${state.settings.maxDuelsPerDay}/dzień`}
        />
      </div>
      <div className="mt-4">
        {hideRoles ? (
          <p className="text-[12px] text-[var(--text-faint)] text-center py-4">
            Skład frakcji ukryty. Wyłącz tryb bezpieczny, żeby go zobaczyć.
          </p>
        ) : (
          <FactionDonut counts={counts} alive={alive} />
        )}
      </div>
    </Card>
  );
}

export function ManualPanel() {
  const { state, update } = useGame();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");

  const players = [...state.players].sort((a, b) => a.seat - b.seat);
  const p = players.find((x) => x.id === target);

  return (
    <Card
      title="Korekta ręczna"
      right={
        <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
          {open ? "Zwiń" : "Rozwiń"}
        </Button>
      }
    >
      {!open ? (
        <p className="text-[12px] text-[var(--text-faint)]">
          Manitou rozstrzyga spory. Tu poprawisz stan gry, gdy zasada zadziałała inaczej.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <select className={inputCls} value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">— wybierz gracza —</option>
            {players.map((x) => (
              <option key={x.id} value={x.id}>
                {x.seat + 1}. {x.name} — {roleNameOf(state, x.id)}
                {x.alive ? "" : " (martwy)"}
              </option>
            ))}
          </select>

          {p && (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={p.alive ? "danger" : "ok"}
                onClick={() =>
                  update((s) => {
                    const t = s.players.find((x) => x.id === p.id)!;
                    if (t.alive) {
                      killAtDay(s, t.id, "decyzja Manitou");
                    } else {
                      t.alive = true;
                      t.deathNote = undefined;
                      t.deathPhase = undefined;
                      log(s, `Manitou przywrócił do gry: ${t.name}.`);
                      checkIndiansWin(s);
                    }
                  })
                }
              >
                {p.alive ? "Zabij" : "Przywróć"}
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  update((s) => {
                    s.idolHolder = p.id;
                    s.plantedIdolOn = null;
                    log(s, `Manitou przeniósł posążek do: ${p.name}.`);
                  })
                }
              >
                Daj posążek
              </Button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="text-[12px] text-[var(--text-dim)] flex-1">Sygnały ufoków</span>
            <Button
              size="sm"
              onClick={() =>
                update((s) => {
                  s.signals = Math.max(0, s.signals - 1);
                })
              }
            >
              −
            </Button>
            <span className="font-mono text-[13px] w-6 text-center">{state.signals}</span>
            <Button
              size="sm"
              onClick={() =>
                update((s) => {
                  s.signals += 1;
                })
              }
            >
              +
            </Button>
          </div>

          <div>
            <div className="label-xs mb-1.5">Ogłoś zwycięstwo</div>
            <div className="flex flex-wrap gap-1.5">
              {FACTIONS.map((f) => (
                <Button
                  key={f}
                  size="sm"
                  onClick={() =>
                    update((s) => {
                      s.winner = null;
                      setWinner(s, f, `Manitou ogłosił zwycięstwo: ${FACTION_LABEL[f]}.`);
                    })
                  }
                >
                  <span className={cx("w-1.5 h-1.5 rounded-full")} style={{ background: FACTION_COLOR[f] }} />
                  {FACTION_LABEL[f]}
                </Button>
              ))}
              <Button
                size="sm"
                onClick={() =>
                  update((s) => {
                    s.winner = null;
                    setWinner(s, "janosik", "Manitou ogłosił zwycięstwo Janosika.");
                  })
                }
              >
                Janosik
              </Button>
            </div>
          </div>

          {state.winner && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                update((s) => {
                  s.winner = null;
                  s.winReason = null;
                  s.stage = s.night >= s.day ? "night" : "day";
                })
              }
            >
              Cofnij koniec gry
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

export function BondsPanel() {
  const { state } = useGame();
  if (state.bonds.length === 0) return null;
  const label = { dziwka: "Dziwka → klient", uwodziciel: "Uwodziciel → uwiedziony", szantazysta: "Szantażysta → szantażowany" };
  return (
    <Card title="Powiązania z nocy zerowej">
      <ul className="flex flex-col gap-1.5">
        {state.bonds.map((b, i) => (
          <li key={i} className="text-[12.5px] flex items-center gap-2">
            <Badge>{label[b.kind]}</Badge>
            <span className="truncate">
              {nameOf(state, b.from)} → {nameOf(state, b.to)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
