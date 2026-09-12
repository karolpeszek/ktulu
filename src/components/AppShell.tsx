"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useGame } from "@/lib/store";
import { useKonto } from "@/lib/konto";
import { cx, Badge } from "./ui";

const NAV = [
  { href: "/manitou", label: "Przygotowanie" },
  { href: "/manitou/gra", label: "Rozgrywka" },
  { href: "/manitou/karty", label: "Karteczki" },
  { href: "/manitou/asysta", label: "Asysta" },
  { href: "/manitou/zasady", label: "Zasady" },
  { href: "/manitou/ustawienia", label: "Ustawienia" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { state, loaded } = useGame();
  const { uzytkownik } = useKonto();

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
      {/* Na telefonie same zakładki są szersze niż ekran, więc nawigacja
          przewija się w poziomie, a wszystko poza nią nie może się kurczyć.
          Dopisek przy nazwie i odznaki stanu znikają, bo są najmniej potrzebne
          z tego, co tu stoi. */}
      <header className="app-header ui-header h-12 shrink-0 sticky top-0 z-30 bg-[var(--surface)] border-b border-[var(--border)] flex items-center px-3 sm:px-4 gap-3 sm:gap-6">
        <Link href="/manitou" className="flex items-center gap-2 shrink-0">
          <span className="w-5 h-5 rounded-[5px] bg-[var(--accent)] grid place-items-center text-[11px] font-bold text-[var(--accent-text)]">
            K
          </span>
          <span className="text-[13px] font-semibold tracking-tight hidden min-[420px]:inline">
            Ktulu{" "}
            <span className="text-[var(--text-faint)] font-normal hidden lg:inline">
              · pulpit Manitou
            </span>
          </span>
        </Link>

        <nav className="pasek-zakladek flex items-center gap-0.5 h-full flex-1 min-w-0 overflow-x-auto">
          {NAV.map((n) => {
            const active = path === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cx(
                  "ui-navlink h-full px-3 flex items-center text-[13px] border-b-2 transition-colors shrink-0",
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

        <div className="shrink-0 flex items-center gap-2">
          {uzytkownik ? (
            <Link
              href="/manitou/ustawienia"
              className={cx(
                "text-[12.5px] px-2 py-1 rounded-[6px] hover:bg-[var(--surface-2)]",
                path === "/manitou/ustawienia" ? "text-[var(--text)]" : "text-[var(--text-dim)]"
              )}
              title="Konto, klucze i ustawienia"
            >
              {uzytkownik.nazwa}
            </Link>
          ) : (
            <Link
              href="/manitou/logowanie"
              className="text-[12.5px] px-2 py-1 rounded-[6px] text-[var(--accent)] hover:bg-[var(--surface-2)]"
            >
              Zaloguj się
            </Link>
          )}
          {loaded && state.players.length > 0 && (
            <div className="hidden md:flex items-center gap-2">
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
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 w-full max-w-[1500px] mx-auto p-4">{children}</main>
    </div>
  );
}
