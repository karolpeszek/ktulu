"use client";

import React from "react";
import { GameState } from "@/lib/types";
import { ROLE_BY_ID } from "@/lib/roles";
import { FACTION_COLOR, cx } from "./ui";

export interface SeatFlags {
  idol?: string | null;
  jailed?: string | null;
  guarded?: string | null;
  asleep?: string[];
  poisoned?: string | null;
  highlight?: string[];
}

interface Props {
  state: GameState;
  /** Ukryj przynależność frakcyjną (widok „bezpieczny”, gdy ktoś patrzy przez ramię). */
  hideRoles?: boolean;
  selected?: string | null;
  disabledIds?: string[];
  onSelect?: (id: string) => void;
  flags?: SeatFlags;
  compact?: boolean;
}

export default function SeatArc({
  state,
  hideRoles = false,
  selected,
  disabledIds = [],
  onSelect,
  flags = {},
  compact = false,
}: Props) {
  const players = [...state.players].sort((a, b) => a.seat - b.seat);
  const n = players.length;
  const W = 1000;
  const R = compact ? 300 : 360;
  const cxPt = W / 2;
  const cyPt = R + (compact ? 60 : 74);
  const H = cyPt + (compact ? 38 : 46);
  const nodeR = n > 22 ? 13 : n > 15 ? 15 : 17;

  if (n === 0) {
    return (
      <div className="text-[13px] text-[var(--text-faint)] py-10 text-center">
        Dodaj graczy, aby zobaczyć krąg rady.
      </div>
    );
  }

  const pad = 8;
  const angleOf = (i: number) => (n === 1 ? 90 : 180 - pad - ((180 - 2 * pad) * i) / (n - 1));

  const pt = (deg: number, r: number) => {
    const a = (deg * Math.PI) / 180;
    return { x: cxPt + r * Math.cos(a), y: cyPt - r * Math.sin(a) };
  };

  const arcStart = pt(180 - pad, R);
  const arcEnd = pt(pad, R);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none" role="img">
      <path
        d={`M ${arcStart.x} ${arcStart.y} A ${R} ${R} 0 0 1 ${arcEnd.x} ${arcEnd.y}`}
        fill="none"
        stroke="var(--border)"
        strokeWidth={1.5}
      />
      <text
        x={cxPt}
        y={cyPt - 8}
        textAnchor="middle"
        fontSize={12}
        fill="var(--text-faint)"
        letterSpacing="0.12em"
      >
        RADA MIASTA BUM-BUM CITY
      </text>
      <text
        x={cxPt}
        y={cyPt + 14}
        textAnchor="middle"
        fontSize={22}
        fontWeight={600}
        fill="var(--text)"
      >
        {players.filter((p) => p.alive).length}
        <tspan fill="var(--text-faint)" fontSize={14}>
          {` / ${n} żywych`}
        </tspan>
      </text>

      {players.map((p, i) => {
        const deg = angleOf(i);
        const c = pt(deg, R);
        const role = p.roleId ? ROLE_BY_ID[p.roleId] : null;
        const color = hideRoles || !role ? "var(--text-faint)" : FACTION_COLOR[role.faction];
        const dead = !p.alive;
        const isSel = selected === p.id;
        const disabled = disabledIds.includes(p.id);
        const flat = deg > 90;
        const l = pt(deg, R + nodeR + 8);
        const rot = flat ? 180 - deg : -deg;
        const hasIdol = flags.idol === p.id;
        const isJailed = flags.jailed === p.id;
        const isGuarded = flags.guarded === p.id;
        const isAsleep = flags.asleep?.includes(p.id);
        const isPoisoned = flags.poisoned === p.id;
        const isHi = flags.highlight?.includes(p.id);

        return (
          <g
            key={p.id}
            className={cx(onSelect && !disabled && "cursor-pointer")}
            opacity={disabled ? 0.35 : 1}
            onClick={() => !disabled && onSelect?.(p.id)}
          >
            {(isSel || isHi) && (
              <circle
                cx={c.x}
                cy={c.y}
                r={nodeR + 6}
                fill="none"
                stroke={isSel ? "var(--accent)" : "var(--warn)"}
                strokeWidth={2}
              />
            )}
            <circle
              cx={c.x}
              cy={c.y}
              r={nodeR}
              fill={dead ? "var(--surface-2)" : `color-mix(in srgb, ${color} 16%, var(--surface))`}
              stroke={dead ? "var(--border-strong)" : color}
              strokeWidth={dead ? 1 : 1.75}
              strokeDasharray={isAsleep && !dead ? "3 3" : undefined}
            />
            <text
              x={c.x}
              y={c.y + 4}
              textAnchor="middle"
              fontSize={nodeR - 3}
              fontWeight={600}
              fill={dead ? "var(--text-faint)" : color}
            >
              {p.seat + 1}
            </text>
            {dead && (
              <path
                d={`M ${c.x - nodeR * 0.6} ${c.y - nodeR * 0.6} L ${c.x + nodeR * 0.6} ${
                  c.y + nodeR * 0.6
                } M ${c.x + nodeR * 0.6} ${c.y - nodeR * 0.6} L ${c.x - nodeR * 0.6} ${
                  c.y + nodeR * 0.6
                }`}
                stroke="var(--text-faint)"
                strokeWidth={1.5}
              />
            )}
            {hasIdol && !hideRoles && (
              <circle
                cx={c.x + nodeR * 0.8}
                cy={c.y - nodeR * 0.8}
                r={5}
                fill="var(--warn)"
                stroke="var(--surface)"
                strokeWidth={1.5}
              />
            )}
            {isJailed && (
              <rect
                x={c.x - nodeR * 0.9}
                y={c.y + nodeR - 2}
                width={nodeR * 1.8}
                height={3}
                fill="var(--text-dim)"
              />
            )}
            {isGuarded && (
              <circle
                cx={c.x}
                cy={c.y}
                r={nodeR + 3}
                fill="none"
                stroke="var(--ok)"
                strokeWidth={1.5}
                strokeDasharray="2 3"
              />
            )}
            {isPoisoned && (
              <circle
                cx={c.x - nodeR * 0.8}
                cy={c.y - nodeR * 0.8}
                r={4.5}
                fill="var(--ok)"
                stroke="var(--surface)"
                strokeWidth={1.5}
              />
            )}
            <g transform={`translate(${l.x} ${l.y}) rotate(${rot})`}>
              <text
                textAnchor={flat ? "end" : "start"}
                fontSize={n > 22 ? 10 : 11}
                fontWeight={500}
                fill={dead ? "var(--text-faint)" : "var(--text)"}
                dy={3}
                style={dead ? { textDecoration: "line-through" } : undefined}
              >
                {p.name}
              </text>
              {!hideRoles && role && (
                <text
                  textAnchor={flat ? "end" : "start"}
                  fontSize={9}
                  fill={color}
                  dy={14}
                  opacity={dead ? 0.5 : 0.9}
                >
                  {role.name}
                </text>
              )}
            </g>
          </g>
        );
      })}
    </svg>
  );
}
