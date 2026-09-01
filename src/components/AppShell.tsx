"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useGame } from "@/lib/store";
import { cx, Badge } from "./ui";

const NAV = [
  { href: "/", label: "Przygotowanie" },
  { href: "/gra", label: "Rozgrywka" },
  { href: "/karty", label: "Karteczki" },
  { href: "/zasady", label: "Zasady" },
  { href: "/ustawienia", label: "Ustawienia" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { state, loaded } = useGame();

  const phase =
    state.stage === "setup"
      ? "Przygotowanie"
      : state.stage === "night"
        ? `Noc ${state.night}`
        : state.stage === "day"
          ? `Dzień ${state.day}`
          : "Koniec gry";

  return (
    <div className="min-h-screen flex flex-col">
      <header className="app-header h-12 shrink-0 sticky top-0 z-30 bg-[var(--surface)] border-b border-[var(--border)] flex items-center px-4 gap-6">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span className="w-5 h-5 rounded-[5px] bg-[var(--accent)] grid place-items-center text-[11px] font-bold text-[var(--accent-text)]">
            K
          </span>
          <span className="text-[13px] font-semibold tracking-tight">
            Ktulu <span className="text-[var(--text-faint)] font-normal">· pulpit Manitou</span>
          </span>
        </Link>

        <nav className="flex items-center gap-0.5 h-full">
          {NAV.map((n) => {
            const active = path === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cx(
                  "h-full px-3 flex items-center text-[13px] border-b-2 transition-colors",
                  active
                    ? "border-[var(--accent)] text-[var(--text)] font-medium"
                    : "border-transparent text-[var(--text-dim)] hover:text-[var(--text)]"
                )}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {loaded && state.players.length > 0 && (
            <>
              <Badge>{`${state.players.filter((p) => p.alive).length} żywych`}</Badge>
              <Badge
                color={
                  state.stage === "night"
                    ? "var(--accent)"
                    : state.stage === "day"
                      ? "var(--warn)"
                      : "var(--text-dim)"
                }
              >
                {phase}
              </Badge>
            </>
          )}
        </div>
      </header>

      <main className="flex-1 w-full max-w-[1500px] mx-auto p-4">{children}</main>
    </div>
  );
}
