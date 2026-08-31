"use client";

import { FACTIONS, FACTION_LABEL, Faction } from "@/lib/types";
import { FACTION_COLOR } from "./ui";

interface Props {
  counts: Record<Faction, number>;
  alive?: Record<Faction, number>;
}

/** Półkolisty wykres udziału frakcji. */
export default function FactionDonut({ counts, alive }: Props) {
  const entries = FACTIONS.filter((f) => counts[f] > 0);
  const total = entries.reduce((a, f) => a + counts[f], 0) || 1;
  const W = 320;
  const R = 120;
  const thick = 26;
  const cx = W / 2;
  const cy = R + 12;

  const offsets = entries.map((_, i) =>
    entries.slice(0, i).reduce((a, g) => a + counts[g], 0)
  );
  const arcs = entries.map((f, i) => {
    const start = 180 - (offsets[i] / total) * 180;
    const end = 180 - ((offsets[i] + counts[f]) / total) * 180;
    const rad = (d: number) => (d * Math.PI) / 180;
    const p = (deg: number, r: number) =>
      `${cx + r * Math.cos(rad(deg))} ${cy - r * Math.sin(rad(deg))}`;
    const d = `M ${p(start, R)} A ${R} ${R} 0 0 1 ${p(end, R)} L ${p(end, R - thick)} A ${
      R - thick
    } ${R - thick} 0 0 0 ${p(start, R - thick)} Z`;
    return { f, d };
  });

  return (
    <div className="flex flex-col items-center gap-3">
      <svg viewBox={`0 0 ${W} ${cy + 16}`} className="w-full max-w-[320px] h-auto">
        {arcs.map(({ f, d }) => (
          <path
            key={f}
            d={d}
            fill={FACTION_COLOR[f]}
            opacity={0.85}
            stroke="var(--surface)"
            strokeWidth={1.5}
          />
        ))}
        <text x={cx} y={cy - 34} textAnchor="middle" fontSize={26} fontWeight={600} fill="var(--text)">
          {total}
        </text>
        <text
          x={cx}
          y={cy - 16}
          textAnchor="middle"
          fontSize={11}
          fill="var(--text-faint)"
          letterSpacing="0.1em"
        >
          GRACZY
        </text>
      </svg>
      <div className="w-full grid grid-cols-2 gap-x-4 gap-y-1.5">
        {entries.map((f) => (
          <div key={f} className="flex items-center gap-2 text-[12px]">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: FACTION_COLOR[f] }}
            />
            <span className="flex-1 truncate">{FACTION_LABEL[f]}</span>
            <span className="font-mono tabular-nums text-[var(--text-dim)]">
              {alive ? `${alive[f]}/${counts[f]}` : counts[f]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
