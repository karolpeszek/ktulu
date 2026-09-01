"use client";

import { GameState } from "@/lib/types";
import { ROLE_BY_ID } from "@/lib/roles";
import { FACTION_COLOR, Tooltip, cx } from "./ui";
import { FACTION_LABEL } from "@/lib/types";

export default function Roster({
  state,
  hideRoles,
  onPick,
}: {
  state: GameState;
  hideRoles: boolean;
  onPick?: (id: string) => void;
}) {
  const players = [...state.players].sort((a, b) => a.seat - b.seat);

  return (
    <div className="-mx-4 -my-4">
      <table className="w-full text-[12.5px] border-collapse">
        <thead>
          <tr className="text-[var(--text-faint)]">
            <th className="text-left font-medium px-3 py-2 w-8 label-xs">#</th>
            <th className="text-left font-medium px-1 py-2 label-xs">Gracz</th>
            <th className="text-left font-medium px-1 py-2 label-xs">Karta</th>
            <th className="text-right font-medium px-3 py-2 label-xs">Stan</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => {
            const role = p.roleId ? ROLE_BY_ID[p.roleId] : null;
            const color = role ? FACTION_COLOR[role.faction] : "var(--text-faint)";
            const idol = state.idolHolder === p.id;
            const jailed = state.jailed === p.id;
            const guarded = state.protectedId === p.id;
            const asleep = state.asleep.includes(p.id);
            const poisoned = state.poisoned === p.id;
            return (
              <tr
                key={p.id}
                onClick={() => onPick?.(p.id)}
                className={cx(
                  "border-t border-[var(--border)]",
                  onPick && "cursor-pointer hover:bg-[var(--surface-2)]",
                  !p.alive && "opacity-45"
                )}
              >
                <td className="px-3 py-1.5 font-mono text-[11px] text-[var(--text-faint)]">
                  {p.seat + 1}
                </td>
                <td className="px-1 py-1.5">
                  <Tooltip
                    side="beside"
                    content={
                      <span className="block">
                        <span className="block font-semibold">
                          {p.seat + 1}. {p.name}
                        </span>
                        {hideRoles || !role ? (
                          <span className="block text-[var(--text-dim)] mt-0.5">
                            Karta ukryta w trybie bezpiecznym.
                          </span>
                        ) : (
                          <>
                            <span className="block mt-0.5" style={{ color }}>
                              {role.name} — {FACTION_LABEL[role.faction]}
                            </span>
                            <span className="block text-[var(--text-dim)] mt-1">{role.desc}</span>
                          </>
                        )}
                        {!p.alive && (
                          <span className="block text-[var(--text-dim)] mt-1">
                            † {p.deathPhase}
                            {p.deathNote ? ` — ${p.deathNote}` : ""}
                          </span>
                        )}
                        {p.alive && (idol || jailed || guarded || poisoned || asleep) && (
                          <span className="block text-[var(--text-dim)] mt-1">
                            {[
                              idol && !hideRoles && "ma posążek",
                              jailed && "w więzieniu — nie budzi się i nie może zginąć",
                              guarded && "chroniony przez ochroniarza",
                              poisoned && !hideRoles && "otruty — zginie następnego dnia",
                              asleep && !jailed && "nieaktywny tej nocy",
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        )}
                      </span>
                    }
                  >
                    <span className={cx("truncate cursor-help", !p.alive && "line-through")}>
                      {p.name}
                    </span>
                  </Tooltip>
                </td>
                <td className="px-1 py-1.5">
                  {hideRoles ? (
                    <span className="text-[var(--text-faint)]">••••</span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5" style={{ color }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                      {role?.name ?? "—"}
                    </span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-right whitespace-nowrap">
                  {!p.alive ? (
                    <span className="text-[var(--text-faint)]">{p.deathPhase ?? "martwy"}</span>
                  ) : (
                    <span className="inline-flex gap-1 items-center justify-end">
                      {idol && !hideRoles && (
                        <span title="Posiada posążek" className="text-[var(--warn)]">
                          ◆
                        </span>
                      )}
                      {jailed && (
                        <span title="W więzieniu" className="text-[var(--text-dim)]">
                          ▤
                        </span>
                      )}
                      {guarded && (
                        <span title="Chroniony" className="text-[var(--ok)]">
                          ◇
                        </span>
                      )}
                      {poisoned && !hideRoles && (
                        <span title="Otruty" className="text-[var(--ok)]">
                          ☠
                        </span>
                      )}
                      {asleep && (
                        <span title="Nie budzi się tej nocy" className="text-[var(--text-faint)]">
                          z
                        </span>
                      )}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="px-3 py-2 border-t border-[var(--border)] flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--text-faint)]">
        <span className="label-xs">Oznaczenia</span>
        <span>
          <span className="text-[var(--warn)]">◆</span> posążek
        </span>
        <span>
          <span className="text-[var(--text-dim)]">▤</span> więzienie
        </span>
        <span>
          <span className="text-[var(--ok)]">◇</span> ochrona
        </span>
        <span>
          <span className="text-[var(--ok)]">☠</span> trucizna
        </span>
        <span>
          <span className="text-[var(--text-faint)]">z</span> nie budzi się
        </span>
      </div>
    </div>
  );
}
