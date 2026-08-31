"use client";

import { useMemo, useState } from "react";
import { useGame } from "@/lib/store";
import { GameState } from "@/lib/types";
import {
  NightStep,
  activeMembers,
  livingWithRole,
  nightSteps,
  playerById,
  skipReason,
} from "@/lib/engine";
import { TARGET_AFTER_YES, nextIndex, resolveStep } from "@/lib/resolve";
import { ROLE_BY_ID } from "@/lib/roles";
import { Badge, Button, Card, FACTION_COLOR, cx } from "./ui";
import SeatArc from "./SeatArc";
import JoyOverlay from "./JoyOverlay";

/** Kogo nie wolno wskazać w danym kroku. */
function forbiddenFor(s: GameState, step: NightStep): string[] {
  const out = new Set<string>(s.players.filter((p) => !p.alive).map((p) => p.id));
  if (step.id === "sheriff") {
    const me = livingWithRole(s, "szeryf");
    if (me) out.add(me.id);
  }
  if (step.id === "guard") {
    const me = livingWithRole(s, "ochroniarz");
    if (me) out.add(me.id);
    if (s.lastProtectedId) out.add(s.lastProtectedId);
  }
  if (step.id === "whore") {
    const me = livingWithRole(s, "dziwka");
    if (me) out.add(me.id);
  }
  if (step.id === "seducer") {
    const me = livingWithRole(s, "uwodziciel");
    if (me) out.add(me.id);
  }
  if (step.id === "blackmailer") {
    const me = livingWithRole(s, "szantazysta");
    if (me) out.add(me.id);
  }
  return [...out];
}

export default function NightPanel() {
  const { state, set } = useGame();
  const [history, setHistory] = useState<GameState[]>([]);
  const [pick, setPick] = useState<string | null>(null);
  const [answer, setAnswer] = useState<"tak" | "nie" | null>(null);
  const [joy, setJoy] = useState(false);

  const steps = useMemo(() => nightSteps(state), [state]);
  const idx = Math.min(state.stepIndex, steps.length - 1);
  const step = steps[idx];

  if (!step) return null;

  const color = FACTION_COLOR[step.faction];
  const blocked = step.action === "end-night" ? null : skipReason(state, step);
  const forbidden = forbiddenFor(state, step);
  const afterYes = TARGET_AFTER_YES[step.id] ?? "none";
  const gamblerRunning = state.pending === "gambler" && step.id === "gambler";
  const needsPlayer =
    step.select === "player" || (step.select === "yesno" && answer === "tak" && afterYes === "player") || gamblerRunning;
  const needsDead = step.select === "yesno" && answer === "tak" && afterYes === "dead";
  const needsMember = step.select === "member";

  const commit = (payload: { targetId?: string | null; yes?: boolean; memberId?: string | null }) => {
    setHistory((h) => [...h.slice(-30), state]);
    const out = resolveStep(state, step, payload);
    set(out.state);
    setPick(null);
    if (!out.stay) setAnswer(null);
    if (out.joy) setJoy(true);
  };

  const skipStep = () => {
    setHistory((h) => [...h.slice(-30), state]);
    const next = structuredClone(state);
    next.feedback = [];
    next.pending = null;
    next.stepIndex = nextIndex(next, next.stepIndex);
    set(next);
    setPick(null);
    setAnswer(null);
  };

  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    set(prev);
    setPick(null);
    setAnswer(null);
  };

  const members = step.faction !== "system" ? activeMembers(state, step.faction) : [];
  const deadTonight = state.nightDeaths.map((id) => playerById(state, id)!).filter(Boolean);

  return (
    <div className="flex flex-col gap-4">
      {joy && <JoyOverlay onClose={() => setJoy(false)} />}

      {state.feedback.length > 0 && (
        <div className="anim-fade-up rounded-lg border border-[var(--warn)]/40 bg-[var(--warn-soft)] px-4 py-3">
          <div className="label-xs mb-1" style={{ color: "var(--warn)" }}>
            Tylko dla Manitou
          </div>
          {state.feedback.filter(Boolean).map((f, i) => (
            <p key={i} className="text-[13.5px] leading-relaxed">
              {f}
            </p>
          ))}
        </div>
      )}

      {blocked ? (
        <Card accent={color}>
          <div className="flex items-center gap-2 mb-1">
            <span className="label-xs" style={{ color }}>
              {step.faction === "system" ? "Manitou" : step.faction}
            </span>
            <Badge>krok pomijany</Badge>
          </div>
          <h2 className="text-[20px] font-semibold tracking-tight">{step.title}</h2>
          <p className="mt-2 text-[13.5px] text-[var(--text-dim)]">{blocked}</p>
          <p className="mt-1 text-[12px] text-[var(--text-faint)]">
            Nikogo nie budzimy. Jeśli chcesz zachować pozory, odczekaj chwilę i przejdź dalej.
          </p>
          <div className="mt-4 flex items-center gap-2 pt-3 border-t border-[var(--border)]">
            <Button variant="primary" onClick={skipStep}>
              Dalej
            </Button>
            <Button variant="ghost" size="sm" disabled={history.length === 0} onClick={undo}>
              ← Cofnij krok
            </Button>
          </div>
        </Card>
      ) : (
      <Card accent={color}>
        <div className="flex items-start gap-3 mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="label-xs" style={{ color }}>
                {step.faction === "system" ? "Manitou" : step.faction}
              </span>
              <Badge color={step.secret ? "var(--text-dim)" : "var(--accent)"}>
                {step.secret ? "działanie tajne" : "jawne"}
              </Badge>
              {step.roleId && <Badge color={color}>{ROLE_BY_ID[step.roleId].name}</Badge>}
            </div>
            <h2 className="text-[20px] font-semibold tracking-tight">{step.title}</h2>
          </div>
          <div className="text-right shrink-0">
            <div className="label-xs">Krok</div>
            <div className="font-mono text-[15px]">
              {idx + 1}
              <span className="text-[var(--text-faint)]">/{steps.length}</span>
            </div>
          </div>
        </div>

        <p className="text-[15px] leading-relaxed px-3 py-2.5 rounded-md bg-[var(--surface-2)] border border-[var(--border)]">
          {step.script}
        </p>
        {step.detail && (
          <p className="mt-2 text-[12.5px] text-[var(--text-dim)] leading-relaxed">{step.detail}</p>
        )}

        {/* — wybór celu — */}
        {(needsPlayer || needsMember || needsDead) && (
          <div className="mt-4">
            <div className="label-xs mb-2">
              {needsMember ? "Kto trzyma posążek" : needsDead ? "Kogo wskrzesić" : "Wskaż osobę"}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(needsMember ? members : needsDead ? deadTonight : [...state.players].sort((a, b) => a.seat - b.seat)).map(
                (p) => {
                  const dis = !needsMember && !needsDead && forbidden.includes(p.id);
                  const role = p.roleId ? ROLE_BY_ID[p.roleId] : null;
                  return (
                    <button
                      key={p.id}
                      disabled={dis}
                      onClick={() => setPick(p.id)}
                      className={cx(
                        "h-8 px-2.5 rounded-md border text-[12.5px] flex items-center gap-1.5 transition-colors",
                        dis && "opacity-30 pointer-events-none line-through",
                        pick === p.id
                          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]"
                          : "border-[var(--border-strong)] bg-[var(--surface)] hover:bg-[var(--surface-2)]"
                      )}
                    >
                      <span className="font-mono text-[10px] text-[var(--text-faint)]">
                        {p.seat + 1}
                      </span>
                      {p.name}
                      {needsMember && role && (
                        <span className="text-[10px] text-[var(--text-faint)]">{role.name}</span>
                      )}
                      {state.idolHolder === p.id && (
                        <span className="text-[var(--warn)] text-[11px]">◆</span>
                      )}
                    </button>
                  );
                }
              )}
            </div>
          </div>
        )}

        {/* — akcje — */}
        <div className="mt-4 flex flex-wrap items-center gap-2 pt-3 border-t border-[var(--border)]">
          {step.select === "none" && (
            <Button variant="primary" onClick={() => commit({})}>
              {step.action === "end-night" ? "Zakończ noc" : "Dalej"}
            </Button>
          )}

          {step.select === "yesno" && answer === null && !gamblerRunning && (
            <>
              <Button
                variant="primary"
                onClick={() => {
                  if (afterYes === "none") commit({ yes: true });
                  else setAnswer("tak");
                }}
              >
                Tak
              </Button>
              <Button onClick={() => commit({ yes: false })}>Nie / pomija</Button>
            </>
          )}

          {(step.select === "player" || needsDead || (step.select === "yesno" && answer === "tak") || gamblerRunning) && (
            <Button variant="primary" disabled={!pick} onClick={() => commit({ targetId: pick, yes: true })}>
              {gamblerRunning ? "Strzelaj" : "Zatwierdź"}
            </Button>
          )}

          {needsMember && (
            <>
              <Button variant="primary" disabled={!pick} onClick={() => commit({ memberId: pick })}>
                Przekaż posążek
              </Button>
              <Button onClick={() => commit({ memberId: null })}>Bez zmian</Button>
            </>
          )}

          {answer === "tak" && !gamblerRunning && (
            <Button variant="ghost" onClick={() => setAnswer(null)}>
              Cofnij wybór
            </Button>
          )}

          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" disabled={history.length === 0} onClick={undo}>
              ← Cofnij krok
            </Button>
            {!gamblerRunning && (
              <Button variant="ghost" size="sm" onClick={skipStep}>
                Pomiń →
              </Button>
            )}
          </div>
        </div>

        {gamblerRunning && (
          <p className="mt-3 text-[12px] text-[var(--warn)]">
            Ruletka trwa — hazardzista strzela dalej, dopóki nie zginie albo nie zdobędzie posążka.
          </p>
        )}
      </Card>
      )}

      <Card title="Krąg rady" right={<span className="text-[11px] text-[var(--text-faint)]">kliknij, by wskazać</span>}>
        <SeatArc
          state={state}
          selected={pick}
          disabledIds={needsPlayer ? forbidden : []}
          onSelect={needsPlayer ? (id) => setPick(id) : undefined}
          flags={{
            idol: state.idolHolder,
            jailed: state.jailed,
            guarded: state.protectedId,
            asleep: state.asleep,
            poisoned: state.poisoned,
          }}
        />
      </Card>

      <Card title="Przebieg nocy">
        <ol className="flex flex-col">
          {steps.map((st, i) => {
            const reason = skipReason(state, st);
            const done = i < idx;
            const cur = i === idx;
            const c = FACTION_COLOR[st.faction];
            return (
              <li
                key={st.id}
                className={cx(
                  "flex items-center gap-2.5 py-1.5 px-2 rounded text-[12.5px]",
                  cur && "bg-[var(--accent-soft)]",
                  !cur && reason && "opacity-40"
                )}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: done ? "var(--text-faint)" : c }}
                />
                <span className={cx("flex-1", done && "text-[var(--text-faint)]")}>{st.title}</span>
                {cur && <Badge color="var(--accent)">teraz</Badge>}
                {!cur && reason && (
                  <span className="text-[11px] text-[var(--text-faint)] truncate max-w-[45%]">
                    {reason}
                  </span>
                )}
                {done && !cur && <span className="text-[11px] text-[var(--ok)]">✓</span>}
              </li>
            );
          })}
        </ol>
      </Card>
    </div>
  );
}
