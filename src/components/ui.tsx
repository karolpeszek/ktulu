"use client";

import React from "react";
import { Faction } from "@/lib/types";
import { usePrefs } from "@/lib/prefs";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export const FACTION_COLOR: Record<Faction | "system", string> = {
  miasto: "var(--city)",
  bandyci: "var(--bandit)",
  indianie: "var(--indian)",
  ufoki: "var(--ufo)",
  janosik: "var(--janosik)",
  system: "var(--text-dim)",
};

export function Card({
  title,
  right,
  children,
  className,
  accent,
}: {
  title?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  accent?: string;
}) {
  return (
    <section
      className={cx(
        "bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden",
        className
      )}
      style={accent ? { borderTopColor: accent, borderTopWidth: 2 } : undefined}
    >
      {(title || right) && (
        <header className="flex items-center justify-between gap-3 px-4 h-11 border-b border-[var(--border)] bg-[var(--surface-2)]">
          <h2 className="text-[13px] font-semibold tracking-tight">{title}</h2>
          {right}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

type BtnVariant = "primary" | "default" | "ghost" | "danger" | "ok";

export function Button({
  variant = "default",
  size = "md",
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md" }) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none select-none border";
  const sizes = size === "sm" ? "h-7 px-2.5 text-[12px]" : "h-9 px-3.5 text-[13px]";
  const variants: Record<BtnVariant, string> = {
    primary:
      "bg-[var(--accent)] text-[var(--accent-text)] border-[var(--accent)] hover:brightness-110",
    default:
      "bg-[var(--surface)] text-[var(--text)] border-[var(--border-strong)] hover:bg-[var(--surface-2)]",
    ghost: "bg-transparent border-transparent text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]",
    danger: "bg-[var(--danger-soft)] text-[var(--danger)] border-[var(--danger)]/30 hover:brightness-105",
    ok: "bg-[var(--ok-soft)] text-[var(--ok)] border-[var(--ok)]/30 hover:brightness-105",
  };
  return <button className={cx(base, sizes, variants[variant], className)} {...rest} />;
}

export function Badge({
  children,
  color,
  soft = true,
}: {
  children: React.ReactNode;
  color?: string;
  soft?: boolean;
}) {
  const c = color ?? "var(--text-dim)";
  return (
    <span
      className="inline-flex items-center gap-1 h-5 px-1.5 rounded text-[11px] font-medium whitespace-nowrap border"
      style={
        soft
          ? { color: c, borderColor: `color-mix(in srgb, ${c} 35%, transparent)`, background: `color-mix(in srgb, ${c} 12%, transparent)` }
          : { color: "#fff", background: c, borderColor: c }
      }
    >
      {children}
    </span>
  );
}

export function Dot({ color, size = 8 }: { color: string; size?: number }) {
  return (
    <span
      className="inline-block rounded-full shrink-0"
      style={{ width: size, height: size, background: color }}
    />
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return <div className="label-xs mb-1.5">{children}</div>;
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <Label>{label}</Label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-[var(--text-faint)]">{hint}</p>}
    </label>
  );
}

export const inputCls =
  "w-full h-9 px-2.5 rounded-md bg-[var(--surface)] border border-[var(--border-strong)] text-[13px] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20";

export function Stat({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  color?: string;
}) {
  return (
    <div className="px-3 py-2.5 rounded-md bg-[var(--surface-2)] border border-[var(--border)]">
      <div className="label-xs">{label}</div>
      <div className="text-[17px] font-semibold leading-tight mt-0.5" style={{ color }}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-[var(--text-faint)] mt-0.5">{sub}</div>}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        "flex items-center gap-2.5 text-[13px]",
        disabled && "opacity-40 pointer-events-none"
      )}
    >
      <span
        className={cx(
          "w-9 h-5 rounded-full relative transition-colors border",
          checked
            ? "bg-[var(--accent)] border-[var(--accent)]"
            : "bg-[var(--surface-2)] border-[var(--border-strong)]"
        )}
      >
        <span
          className={cx(
            "absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-all",
            checked ? "left-[18px]" : "left-0.5"
          )}
          style={!checked ? { background: "var(--text-faint)" } : undefined}
        />
      </span>
      <span>{label}</span>
    </button>
  );
}

/**
 * Dymek podpowiedzi. Pozycjonowany `fixed` względem okna, więc nie obcina go
 * `overflow: hidden` kart ani przewijane listy.
 */
export function Tooltip({
  content,
  children,
  side = "top",
  className,
}: {
  content: React.ReactNode;
  /** „obok” ucieka na stronę przeciwną do ręki trzymającej rysik. */
  children: React.ReactNode;
  side?: "top" | "beside";
  className?: string;
}) {
  const { tipSide } = usePrefs();
  const [box, setBox] = React.useState<{ x: number; y: number; flip: boolean } | null>(null);
  const ref = React.useRef<HTMLSpanElement>(null);

  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    if (side === "beside") {
      const left = tipSide === "left";
      setBox({ x: left ? r.left - 8 : r.right + 8, y: r.top + r.height / 2, flip: left });
    } else {
      setBox({ x: r.left + r.width / 2, y: r.top - 8, flip: false });
    }
  };

  if (!content) return <>{children}</>;

  return (
    <span
      ref={ref}
      className={cx("inline-flex", className)}
      onMouseEnter={show}
      onMouseLeave={() => setBox(null)}
      onFocus={show}
      onBlur={() => setBox(null)}
    >
      {children}
      {box && (
        <span
          role="tooltip"
          className="fixed z-50 pointer-events-none max-w-[280px] rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 py-1.5 text-[12px] leading-relaxed text-[var(--text)] shadow-lg anim-fade-up"
          style={
            side === "beside"
              ? {
                  left: box.x,
                  top: box.y,
                  transform: `translate(${box.flip ? "-100%" : "0"}, -50%)`,
                }
              : { left: box.x, top: box.y, transform: "translate(-50%, -100%)" }
          }
        >
          {content}
        </span>
      )}
    </span>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[13px] text-[var(--text-faint)] py-6 text-center border border-dashed border-[var(--border)] rounded-md">
      {children}
    </div>
  );
}

export function Divider() {
  return <div className="h-px bg-[var(--border)] my-3" />;
}
