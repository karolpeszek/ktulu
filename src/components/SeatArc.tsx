"use client";

import React from "react";
import { GameState } from "@/lib/types";
import { ROLE_BY_ID } from "@/lib/roles";
import { FACTION_COLOR, Tooltip, cx } from "./ui";
import { usePrefs } from "@/lib/prefs";
import { FACTION_LABEL } from "@/lib/types";

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
  /** Pozwala zmieniać kolejność w kręgu, przeciągając graczy po łuku. */
  onReorder?: (from: number, to: number) => void;
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
  onReorder,
  flags = {},
  compact = false,
}: Props) {
  const svgRef = React.useRef<SVGSVGElement>(null);
  const [dragFrom, setDragFrom] = React.useState<number | null>(null);
  const [dragTo, setDragTo] = React.useState<number | null>(null);
  const [hover, setHover] = React.useState<{ i: number; x: number; y: number } | null>(null);
  const { tipSide } = usePrefs();

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

  /**
   * Miejsce, które zajmuje każdy gracz w tym renderze. W trakcie przeciągania
   * jest to układ po upuszczeniu — reszta graczy rozsuwa się na podgląd, a że
   * pozycje są animowane, robi to płynnie.
   */
  const slotOf = players.map((_, i) => i);
  if (dragFrom !== null && dragTo !== null && dragFrom !== dragTo) {
    const arr = players.map((_, i) => i);
    const [moved] = arr.splice(dragFrom, 1);
    arr.splice(dragTo, 0, moved);
    arr.forEach((playerIndex, slot) => (slotOf[playerIndex] = slot));
  }

  /** Odwrotność `angleOf` — miejsce w kręgu najbliższe podanemu punktowi. */
  const seatAt = (clientX: number, clientY: number): number | null => {
    const svg = svgRef.current;
    if (!svg || n < 2) return null;
    const r = svg.getBoundingClientRect();
    const scale = W / r.width;
    const x = (clientX - r.left) * scale;
    const y = (clientY - r.top) * scale;
    const deg = (Math.atan2(cyPt - y, x - cxPt) * 180) / Math.PI;
    const raw = ((180 - pad - deg) * (n - 1)) / (180 - 2 * pad);
    return Math.max(0, Math.min(n - 1, Math.round(raw)));
  };

  const endDrag = () => {
    if (dragFrom !== null && dragTo !== null && dragFrom !== dragTo) {
      onReorder?.(dragFrom, dragTo);
    }
    setDragFrom(null);
    setDragTo(null);
  };

  const hovered = hover ? players[hover.i] : null;
  const hoveredRole = hovered?.roleId ? ROLE_BY_ID[hovered.roleId] : null;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto select-none overflow-visible"
        role="img"
        onPointerMove={(e) => {
          if (dragFrom === null) return;
          const to = seatAt(e.clientX, e.clientY);
          if (to !== null) setDragTo(to);
        }}
        // Bez `onPointerLeave` — przy przechwyconym wskaźniku zdarzenia brzegowe
        // potrafią paść w środku przeciągania i przerwać je przedwcześnie.
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
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
          const slot = slotOf[i];
          const deg = angleOf(slot);
          const c = pt(deg, R);
          const role = p.roleId ? ROLE_BY_ID[p.roleId] : null;
          const color = hideRoles || !role ? "var(--text-faint)" : FACTION_COLOR[role.faction];
          const dead = !p.alive;
          const isSel = selected === p.id;
          const disabled = disabledIds.includes(p.id);
          const flat = deg > 90;
          const rot = flat ? 180 - deg : -deg;
          const labelR = nodeR + 8;
          const lx = labelR * Math.cos((deg * Math.PI) / 180);
          const ly = -labelR * Math.sin((deg * Math.PI) / 180);
          const hasIdol = flags.idol === p.id;
          const isJailed = flags.jailed === p.id;
          const isGuarded = flags.guarded === p.id;
          const isAsleep = flags.asleep?.includes(p.id);
          const isPoisoned = flags.poisoned === p.id;
          const isHi = flags.highlight?.includes(p.id);
          const isDragged = dragFrom === i;

          const track = (e: React.PointerEvent) => {
            // Rysik i mysz zgłaszają najechanie przez zdarzenia wskaźnika;
            // natywny `title` w SVG nie pokazuje się w Safari na iPadzie.
            if (dragFrom !== null) return;
            setHover({ i, x: e.clientX, y: e.clientY });
          };

          return (
            <g
              key={p.id}
              className={cx(
                "seat-node",
                onSelect && !disabled && "cursor-pointer",
                onReorder && (isDragged ? "cursor-grabbing" : "cursor-grab")
              )}
              style={{
                transform: `translate(${c.x}px, ${c.y}px)`,
                touchAction: onReorder ? "none" : undefined,
              }}
              opacity={disabled ? 0.35 : isDragged ? 0.55 : 1}
              onClick={() => !disabled && onSelect?.(p.id)}
              onPointerEnter={track}
              onPointerMove={track}
              onPointerLeave={() => setHover((h) => (h?.i === i ? null : h))}
              onPointerDown={
                onReorder
                  ? (e) => {
                      // Przechwycenie wskaźnika trzyma ruch przy SVG, także gdy
                      // palec albo rysik zjedzie poza żeton.
                      e.preventDefault();
                      setHover(null);
                      svgRef.current?.setPointerCapture(e.pointerId);
                      setDragFrom(i);
                      setDragTo(i);
                    }
                  : undefined
              }
            >
              {isDragged && (
                <circle
                  r={nodeR + 9}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                />
              )}
              {(isSel || isHi) && (
                <circle
                  r={nodeR + 6}
                  fill="none"
                  stroke={isSel ? "var(--accent)" : "var(--warn)"}
                  strokeWidth={2}
                />
              )}
              <circle
                r={nodeR}
                fill={dead ? "var(--surface-2)" : `color-mix(in srgb, ${color} 16%, var(--surface))`}
                stroke={dead ? "var(--border-strong)" : color}
                strokeWidth={dead ? 1 : 1.75}
                strokeDasharray={isAsleep && !dead ? "3 3" : undefined}
              />
              <text
                y={4}
                textAnchor="middle"
                fontSize={nodeR - 3}
                fontWeight={600}
                fill={dead ? "var(--text-faint)" : color}
              >
                {slot + 1}
              </text>
              {dead && (
                <path
                  d={`M ${-nodeR * 0.6} ${-nodeR * 0.6} L ${nodeR * 0.6} ${nodeR * 0.6} M ${
                    nodeR * 0.6
                  } ${-nodeR * 0.6} L ${-nodeR * 0.6} ${nodeR * 0.6}`}
                  stroke="var(--text-faint)"
                  strokeWidth={1.5}
                />
              )}
              {hasIdol && !hideRoles && (
                <circle
                  cx={nodeR * 0.8}
                  cy={-nodeR * 0.8}
                  r={5}
                  fill="var(--warn)"
                  stroke="var(--surface)"
                  strokeWidth={1.5}
                />
              )}
              {isJailed && (
                <rect
                  x={-nodeR * 0.9}
                  y={nodeR - 2}
                  width={nodeR * 1.8}
                  height={3}
                  fill="var(--text-dim)"
                />
              )}
              {isGuarded && (
                <circle
                  r={nodeR + 3}
                  fill="none"
                  stroke="var(--ok)"
                  strokeWidth={1.5}
                  strokeDasharray="2 3"
                />
              )}
              {isPoisoned && (
                <circle
                  cx={-nodeR * 0.8}
                  cy={-nodeR * 0.8}
                  r={4.5}
                  fill="var(--ok)"
                  stroke="var(--surface)"
                  strokeWidth={1.5}
                />
              )}
              <g className="seat-label" style={{ transform: `translate(${lx}px, ${ly}px) rotate(${rot}deg)` }}>
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

      {hover && hovered && (
        <div
          role="tooltip"
          className="fixed z-50 pointer-events-none max-w-[280px] rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 py-2 text-[12px] leading-relaxed shadow-lg anim-fade-up"
          // Rysik zasłania to, co leży po stronie trzymającej ręki, więc dymek
          // wychodzi w przeciwną i jest wyrównany do wysokości grotu.
          style={{
            left: tipSide === "left" ? hover.x - 18 : hover.x + 18,
            top: hover.y,
            transform: `translate(${tipSide === "left" ? "-100%" : "0"}, -50%)`,
          }}
        >
          <div className="font-semibold">
            {slotOf[hover.i] + 1}. {hovered.name}
          </div>
          {hideRoles || !hoveredRole ? (
            <div className="text-[var(--text-dim)] mt-0.5">Karta ukryta w trybie bezpiecznym.</div>
          ) : (
            <>
              <div className="mt-0.5" style={{ color: FACTION_COLOR[hoveredRole.faction] }}>
                {hoveredRole.name} — {FACTION_LABEL[hoveredRole.faction]}
              </div>
              <div className="text-[var(--text-dim)] mt-1">{hoveredRole.desc}</div>
            </>
          )}
          {!hovered.alive && (
            <div className="text-[var(--text-dim)] mt-1">
              † {hovered.deathPhase}
              {hovered.deathNote ? ` — ${hovered.deathNote}` : ""}
            </div>
          )}
          {(() => {
            const st = [
              flags.idol === hovered.id && !hideRoles && "ma posążek",
              flags.jailed === hovered.id && "w więzieniu — nie budzi się i nie może zginąć",
              flags.guarded === hovered.id && "chroniony przez ochroniarza",
              flags.poisoned === hovered.id && !hideRoles && "otruty — zginie następnego dnia",
              flags.asleep?.includes(hovered.id) &&
                flags.jailed !== hovered.id &&
                "nieaktywny tej nocy",
              disabledIds.includes(hovered.id) && "nie można wskazać",
            ].filter(Boolean);
            return st.length ? (
              <div className="text-[var(--text-dim)] mt-1">{st.join(" · ")}</div>
            ) : null;
          })()}
        </div>
      )}
    </div>
  );
}

/** Objaśnienie oznaczeń używanych na diagramie kręgu. */
export function SeatLegend({ hideRoles = false }: { hideRoles?: boolean }) {
  const items: { swatch: React.ReactNode; label: string; tip: string }[] = [
    {
      swatch: (
        <span className="flex items-center gap-0.5">
          {(["miasto", "bandyci", "indianie", "ufoki", "janosik"] as const).map((f) => (
            <span
              key={f}
              className="w-2 h-2 rounded-full"
              style={{ background: FACTION_COLOR[f] }}
            />
          ))}
        </span>
      ),
      label: "kolor = frakcja",
      tip: "Obwódka i podpis pod imieniem mają kolor frakcji: miasto (niebieski), bandyci (bursztynowy), Indianie (czerwony), ufoki (zielony), Janosik (fioletowy). W trybie „ukryj karty” wszyscy są szarzy.",
    },
    {
      swatch: <Swatch><circle cx="11" cy="11" r="8" fill="none" stroke="var(--warn)" strokeWidth="1.5" /><circle cx="17" cy="5" r="4" fill="var(--warn)" /></Swatch>,
      label: "posążek",
      tip: "Bursztynowa kropka przy prawym górnym rogu żetonu — ta osoba trzyma posążek. Widoczna tylko dla Manitou.",
    },
    {
      swatch: <Swatch><circle cx="11" cy="11" r="8" fill="none" stroke="var(--text-dim)" strokeWidth="1.5" strokeDasharray="3 3" /></Swatch>,
      label: "nieaktywny",
      tip: "Przerywana obwódka — ta osoba nie budzi się tej nocy: spita przez opoja, zajęta przez szulera albo zamknięta w więzieniu. Nie może przekazać ani przyjąć posążka.",
    },
    {
      swatch: <Swatch><circle cx="11" cy="11" r="8" fill="none" stroke="var(--text-dim)" strokeWidth="1.5" /><rect x="4" y="19" width="14" height="3" fill="var(--text-dim)" /></Swatch>,
      label: "więzienie",
      tip: "Szara belka pod żetonem — szeryf zamknął tę osobę na noc. Nie budzi się i nie można jej zabić, ale wolno ją sprawdzić pastorem czy szamanem.",
    },
    {
      swatch: <Swatch><circle cx="11" cy="11" r="8" fill="none" stroke="var(--text-dim)" strokeWidth="1.5" /><circle cx="11" cy="11" r="10.5" fill="none" stroke="var(--ok)" strokeWidth="1.5" strokeDasharray="2 3" /></Swatch>,
      label: "ochrona",
      tip: "Zielony pierścień — ochroniarz chroni tę osobę tej nocy. Nie zginie, ale można ją okraść, spowiadać czy spić.",
    },
    {
      swatch: <Swatch><circle cx="11" cy="11" r="8" fill="none" stroke="var(--text-dim)" strokeWidth="1.5" /><circle cx="5" cy="5" r="3.5" fill="var(--ok)" /></Swatch>,
      label: "trucizna",
      tip: "Zielona kropka po lewej — szamanka podłożyła truciznę. Ta osoba zzielenieje i zginie następnego dnia, przed głosowaniami.",
    },
    {
      swatch: <Swatch><circle cx="11" cy="11" r="8" fill="none" stroke="var(--border-strong)" strokeWidth="1" /><path d="M7 7 L15 15 M15 7 L7 15" stroke="var(--text-faint)" strokeWidth="1.5" /></Swatch>,
      label: "martwy",
      tip: "Przekreślony żeton i przekreślone imię — ta osoba nie żyje. Najedź na nią, żeby zobaczyć, kiedy i jak zginęła.",
    },
    {
      swatch: <Swatch><circle cx="11" cy="11" r="8" fill="none" stroke="var(--text-dim)" strokeWidth="1.5" /><circle cx="11" cy="11" r="10.5" fill="none" stroke="var(--accent)" strokeWidth="2" /></Swatch>,
      label: "wskazany",
      tip: "Niebieski pierścień — osoba wskazana w bieżącym kroku, jeszcze przed zatwierdzeniem.",
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-3 mt-1 border-t border-[var(--border)]">
      <span className="label-xs">Legenda</span>
      {items
        .filter((it) => !(hideRoles && it.label === "posążek"))
        .map((it) => (
          <Tooltip key={it.label} content={it.tip}>
            <span className="flex items-center gap-1.5 text-[11.5px] text-[var(--text-dim)] cursor-help">
              {it.swatch}
              {it.label}
            </span>
          </Tooltip>
        ))}
      <span className="text-[11.5px] text-[var(--text-faint)] ml-auto">
        Najedź na gracza, aby zobaczyć szczegóły.
      </span>
    </div>
  );
}

function Swatch({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 22 24" width="15" height="16" className="shrink-0 overflow-visible">
      {children}
    </svg>
  );
}
