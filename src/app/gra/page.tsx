"use client";

import { useState } from "react";
import Link from "next/link";
import { useGame } from "@/lib/store";
import { FACTION_LABEL } from "@/lib/types";
import { ROLE_BY_ID } from "@/lib/roles";
import { startNight } from "@/lib/resolve";
import { Badge, Button, Card, Empty, FACTION_COLOR, cx } from "@/components/ui";
import NightPanel from "@/components/NightPanel";
import DayPanel from "@/components/DayPanel";
import Roster from "@/components/Roster";
import EventLog from "@/components/EventLog";
import SeatArc from "@/components/SeatArc";
import { BondsPanel, ManualPanel, StatusPanel } from "@/components/SidePanels";

export default function GamePage() {
  const { state, reset, loaded } = useGame();
  const [hideRoles, setHideRoles] = useState(false);

  if (!loaded) return null;

  if (state.stage === "setup") {
    return (
      <Card title="Brak rozgrywki">
        <Empty>
          Nie ma jeszcze rozdanych kart.{" "}
          <Link href="/" className="text-[var(--accent)] underline">
            Przejdź do przygotowania gry
          </Link>
          .
        </Empty>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-4 items-start">
      <div className="flex flex-col gap-4 min-w-0">
        {state.stage === "night" && <NightPanel />}
        {state.stage === "day" && <DayPanel />}
        {state.stage === "koniec" && <EndPanel />}
      </div>

      <div className="flex flex-col gap-4 xl:sticky xl:top-16">
        <StatusPanel hideRoles={hideRoles} onHideRoles={setHideRoles} />
        <Card
          title="Skład rady"
          right={
            <div className="flex items-center gap-2">
            <Link
              href="/karty"
              className="h-7 px-2.5 inline-flex items-center rounded-md border border-[var(--border-strong)] bg-[var(--surface)] hover:bg-[var(--surface-2)] text-[12px]"
            >
              Karteczki
            </Link>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                if (confirm("Zakończyć i skasować bieżącą rozgrywkę?")) reset();
              }}
            >
              Nowa gra
            </Button>
            </div>
          }
        >
          <Roster state={state} hideRoles={hideRoles} />
        </Card>
        <BondsPanel />
        <Card title="Dziennik">
          <EventLog state={state} />
        </Card>
        <ManualPanel />
      </div>
    </div>
  );

}

function EndPanel() {
  const { state, set, reset } = useGame();
  const w = state.winner;
  const color = w ? FACTION_COLOR[w] : "var(--text-dim)";
    return (
      <div className="flex flex-col gap-4">
        <Card accent={color}>
          <div className="text-center py-6">
            <div className="label-xs mb-2">Koniec gry</div>
            <h1 className="text-[30px] font-semibold tracking-tight" style={{ color }}>
              {w ? `Wygrywa: ${FACTION_LABEL[w]}` : "Gra zakończona"}
            </h1>
            <p className="mt-3 text-[14px] text-[var(--text-dim)] max-w-xl mx-auto leading-relaxed">
              {state.winReason}
            </p>
            {w === "janosik" && (
              <p className="mt-4 text-[14px] px-4 py-3 rounded-md bg-[var(--warn-soft)] border border-[var(--warn)]/40 inline-block">
                Manitou ogłasza: wszyscy pozostali przegrali.
              </p>
            )}
            <div className="mt-6 flex items-center justify-center gap-2">
              <Button
                onClick={() => {
                  const next = structuredClone(state);
                  next.winner = null;
                  next.winReason = null;
                  set(startNight(next));
                }}
              >
                Graj dalej mimo to
              </Button>
              <Button variant="primary" onClick={reset}>
                Nowa gra
              </Button>
            </div>
          </div>
        </Card>

        <Card title="Odkrycie kart">
          <SeatArc state={state} flags={{ idol: state.idolHolder }} />
        </Card>

        <Card title="Wszystkie karty">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {[...state.players]
              .sort((a, b) => a.seat - b.seat)
              .map((p) => {
                const role = p.roleId ? ROLE_BY_ID[p.roleId] : null;
                const c = role ? FACTION_COLOR[role.faction] : "var(--text-dim)";
                return (
                  <div
                    key={p.id}
                    className={cx(
                      "px-3 py-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)]",
                      !p.alive && "opacity-50"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className={cx("text-[13px] font-medium", !p.alive && "line-through")}>
                        {p.name}
                      </span>
                      {state.idolHolder === p.id && <Badge color="var(--warn)">posążek</Badge>}
                    </div>
                    <div className="text-[12px] mt-0.5" style={{ color: c }}>
                      {role?.name ?? "—"}
                    </div>
                    {!p.alive && (
                      <div className="text-[11px] text-[var(--text-faint)] mt-0.5">
                        {p.deathPhase} — {p.deathNote}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </Card>
      </div>
    );
  }
