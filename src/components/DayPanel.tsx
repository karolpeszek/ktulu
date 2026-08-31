"use client";

import { useState } from "react";
import { useGame } from "@/lib/store";
import { GameState } from "@/lib/types";
import { livingWithRole, nameOf, playerById, roleNameOf } from "@/lib/engine";
import {
  resolveDuel,
  resolveHanging,
  resolvePoison,
  resolveSearch,
  startNight,
} from "@/lib/resolve";
import { Badge, Button, Card, Empty, cx, inputCls } from "./ui";
import SeatArc from "./SeatArc";

export default function DayPanel() {
  const { state, set } = useGame();
  const [history, setHistory] = useState<GameState[]>([]);
  const [searchPicks, setSearchPicks] = useState<string[]>([]);
  const [hangPick, setHangPick] = useState<string | null>(null);
  const [pardon, setPardon] = useState(false);
  const [duelA, setDuelA] = useState<string | null>(null);
  const [duelB, setDuelB] = useState<string | null>(null);
  const [votesA, setVotesA] = useState(0);
  const [votesB, setVotesB] = useState(0);
  const [override, setOverride] = useState<"" | "a" | "b" | "remis">("");
  const [overrideNote, setOverrideNote] = useState("");
  const [searchDone, setSearchDone] = useState(false);

  const alive = state.players.filter((p) => p.alive).sort((a, b) => a.seat - b.seat);
  const sheriffAlive = !!livingWithRole(state, "szeryf");
  const mayorAlive = !!livingWithRole(state, "burmistrz");

  const apply = (next: GameState) => {
    setHistory((h) => [...h.slice(-20), state]);
    set(next);
  };

  const toggleSearch = (id: string) => {
    setSearchPicks((cur) =>
      cur.includes(id)
        ? cur.filter((x) => x !== id)
        : cur.length >= state.settings.searchCount
          ? cur
          : [...cur, id]
    );
  };

  const nextNight = () => {
    apply(startNight(state));
    setSearchPicks([]);
    setHangPick(null);
    setPardon(false);
    setSearchDone(false);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* — poranek — */}
      <Card
        title={`Poranek — dzień ${state.day}`}
        accent="var(--warn)"
        right={
          <Button
            variant="ghost"
            size="sm"
            disabled={history.length === 0}
            onClick={() => {
              const prev = history[history.length - 1];
              setHistory((h) => h.slice(0, -1));
              set(prev);
            }}
          >
            ← Cofnij
          </Button>
        }
      >
        <div className="label-xs mb-2">Do ogłoszenia na głos</div>
        {state.morningReport.length === 0 ? (
          <Empty>Brak ogłoszeń z minionej nocy.</Empty>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {state.morningReport.map((m, i) => (
              <li
                key={i}
                className="text-[14px] px-3 py-2 rounded-md bg-[var(--surface-2)] border border-[var(--border)]"
              >
                {m}
              </li>
            ))}
          </ul>
        )}
        {state.day === 1 && (
          <p className="mt-3 text-[12.5px] text-[var(--text-dim)]">
            Pierwszy dzień: wszyscy przedstawiają się sobie nawzajem („Nazywam się Bill i jestem
            miejskim kowalem” — bez zdradzania karty).
          </p>
        )}
      </Card>

      {/* — trucizna — */}
      {state.poisoned && (
        <Card title="Trucizna szamanki" accent="var(--indian)">
          <p className="text-[14px]">
            {nameOf(state, state.poisoned)} zielenieje na twarzy i ginie — jeszcze przed
            głosowaniami.
          </p>
          <Button className="mt-3" variant="danger" onClick={() => apply(resolvePoison(state))}>
            Rozstrzygnij truciznę
          </Button>
        </Card>
      )}

      {/* — pojedynki — */}
      <Card
        title="Pojedynki"
        right={
          <Badge color={state.duelsToday >= state.settings.maxDuelsPerDay ? "var(--danger)" : undefined}>
            {state.duelsToday}/{state.settings.maxDuelsPerDay} dziś
          </Badge>
        }
      >
        <p className="text-[12.5px] text-[var(--text-dim)] mb-3">
          Najpierw mowa atakującego, potem zaatakowanego — nikt inny nie ma prawa głosu. Potem
          wszyscy poza pojedynkującymi głosują albo się wstrzymują.
          {sheriffAlive && " Szeryf żyje, więc pojedynku można nie przyjąć."}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <div className="label-xs mb-1.5">Atakujący</div>
            <select
              className={inputCls}
              value={duelA ?? ""}
              onChange={(e) => setDuelA(e.target.value || null)}
            >
              <option value="">— wybierz —</option>
              {alive.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.seat + 1}. {p.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              className={cx(inputCls, "mt-2")}
              value={votesA}
              onChange={(e) => setVotesA(Math.max(0, Number(e.target.value) || 0))}
              placeholder="Głosy za atakującym"
            />
          </div>
          <div>
            <div className="label-xs mb-1.5">Zaatakowany</div>
            <select
              className={inputCls}
              value={duelB ?? ""}
              onChange={(e) => setDuelB(e.target.value || null)}
            >
              <option value="">— wybierz —</option>
              {alive
                .filter((p) => p.id !== duelA)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.seat + 1}. {p.name}
                  </option>
                ))}
            </select>
            <input
              type="number"
              min={0}
              className={cx(inputCls, "mt-2")}
              value={votesB}
              onChange={(e) => setVotesB(Math.max(0, Number(e.target.value) || 0))}
              placeholder="Głosy za zaatakowanym"
            />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <div className="label-xs mb-1.5">Nadpisanie wyniku (rewolwerowiec / sędzia)</div>
            <select
              className={inputCls}
              value={override}
              onChange={(e) => setOverride(e.target.value as typeof override)}
            >
              <option value="">Wynik z głosowania</option>
              <option value="a">Wygrywa atakujący</option>
              <option value="b">Wygrywa zaatakowany</option>
              <option value="remis">Giną obaj</option>
            </select>
          </div>
          <div>
            <div className="label-xs mb-1.5">Notatka</div>
            <input
              className={inputCls}
              value={overrideNote}
              onChange={(e) => setOverrideNote(e.target.value)}
              placeholder="np. dobry rewolwerowiec, wyrok sędziego"
            />
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Button
            variant="primary"
            disabled={!duelA || !duelB || state.duelsToday >= state.settings.maxDuelsPerDay}
            onClick={() => {
              apply(
                resolveDuel(state, {
                  aId: duelA!,
                  bId: duelB!,
                  votesA,
                  votesB,
                  override: override || null,
                  overrideNote: overrideNote || undefined,
                })
              );
              setDuelA(null);
              setDuelB(null);
              setVotesA(0);
              setVotesB(0);
              setOverride("");
              setOverrideNote("");
            }}
          >
            Rozstrzygnij pojedynek
          </Button>
          <span className="text-[12px] text-[var(--text-faint)]">
            Remis głosów = giną obaj. Wszyscy wstrzymani = nikt nie ginie.
          </span>
        </div>
      </Card>

      {/* — przeszukanie — */}
      <Card
        title="Przeszukanie"
        right={
          <Badge color="var(--accent)">
            {searchPicks.length}/{state.settings.searchCount}
          </Badge>
        }
      >
        <p className="text-[12.5px] text-[var(--text-dim)] mb-3">
          Każdy radny ma tyle głosów, ile osób można przeszukać. Przy remisie — dogrywka, przy pacie
          przeszukujemy mniej osób. Wstrzymać się nie wolno.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {alive.map((p) => (
            <button
              key={p.id}
              onClick={() => toggleSearch(p.id)}
              className={cx(
                "h-8 px-2.5 rounded-md border text-[12.5px] flex items-center gap-1.5",
                searchPicks.includes(p.id)
                  ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                  : "border-[var(--border-strong)] bg-[var(--surface)] hover:bg-[var(--surface-2)]"
              )}
            >
              <span className="font-mono text-[10px] text-[var(--text-faint)]">{p.seat + 1}</span>
              {p.name}
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button
            variant="primary"
            disabled={searchPicks.length === 0}
            onClick={() => {
              apply(resolveSearch(state, searchPicks));
              setSearchDone(true);
            }}
          >
            Przeszukaj i ogłoś wynik
          </Button>
          {searchDone && !state.winner && (
            <span className="text-[12.5px] text-[var(--text-dim)]">
              Nikt z przeszukanych nie miał posążka — czas na głosowanie o powieszeniu.
            </span>
          )}
        </div>
      </Card>

      {/* — wieszanie — */}
      <Card title="Wieszanie" accent="var(--danger)">
        <p className="text-[12.5px] text-[var(--text-dim)] mb-3">
          Najpierw miasto głosuje, czy w ogóle wieszać (remis = nie), potem kogo (remis = nikt).
          {mayorAlive && " Burmistrz może odkryć kartę i ułaskawić skazanego."}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {alive.map((p) => (
            <button
              key={p.id}
              onClick={() => setHangPick(hangPick === p.id ? null : p.id)}
              className={cx(
                "h-8 px-2.5 rounded-md border text-[12.5px] flex items-center gap-1.5",
                hangPick === p.id
                  ? "border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)]"
                  : "border-[var(--border-strong)] bg-[var(--surface)] hover:bg-[var(--surface-2)]"
              )}
            >
              <span className="font-mono text-[10px] text-[var(--text-faint)]">{p.seat + 1}</span>
              {p.name}
            </button>
          ))}
        </div>
        {hangPick && playerById(state, hangPick)?.roleId === "janosik" && (
          <div className="mt-3 px-3 py-2 rounded-md border border-[var(--warn)]/40 bg-[var(--warn-soft)] text-[13px]">
            Uwaga, Manitou: to Janosik. Powieszenie go kończy grę — Janosik wygrywa, wszyscy
            pozostali przegrywają.
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            variant="danger"
            disabled={!hangPick}
            onClick={() => {
              apply(resolveHanging(state, hangPick, pardon));
              setHangPick(null);
              setPardon(false);
            }}
          >
            {pardon ? "Ułaskaw" : "Powieś"}
          </Button>
          <Button
            onClick={() => {
              apply(resolveHanging(state, null, false));
              setHangPick(null);
            }}
          >
            Nikt nie wisi
          </Button>
          {mayorAlive && (
            <label className="flex items-center gap-2 text-[12.5px]">
              <input
                type="checkbox"
                checked={pardon}
                onChange={(e) => setPardon(e.target.checked)}
                className="accent-[var(--accent)]"
              />
              Burmistrz ujawnia się i ułaskawia
            </label>
          )}
        </div>
      </Card>

      <Card title="Krąg rady">
        <SeatArc
          state={state}
          selected={hangPick}
          flags={{ idol: state.idolHolder, highlight: searchPicks }}
          onSelect={(id) => setHangPick(hangPick === id ? null : id)}
        />
      </Card>

      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={nextNight}>
          Zakończ dzień → noc {state.day}
        </Button>
        <span className="text-[12px] text-[var(--text-faint)]">
          Posążek: {state.idolHolder ? `${nameOf(state, state.idolHolder)} (${roleNameOf(state, state.idolHolder)})` : "nikt"}
          {state.plantedIdolOn && ` — podłożony przez cichą stopę`}
        </span>
      </div>
    </div>
  );
}
