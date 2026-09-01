"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useGame } from "@/lib/store";
import { FACTION_GOAL, FACTION_LABEL, Faction } from "@/lib/types";
import { ROLE_BY_ID } from "@/lib/roles";
import { shuffle } from "@/lib/setup";
import { Badge, Button, Card, Empty, Toggle, cx } from "@/components/ui";

const PRINT_COLOR: Record<Faction, string> = {
  miasto: "#0b74d1",
  bandyci: "#b06a08",
  indianie: "#b8382b",
  ufoki: "#0d8a6c",
  janosik: "#6d4bc4",
};

const NIGHT_LABEL: Record<string, string> = {
  brak: "nie budzisz się w nocy",
  zerowa: "działasz tylko nocy zerowej",
  "co-noc": "budzisz się co noc",
  raz: "raz w grze",
  "dwa-razy": "dwa razy w grze",
  warunkowa: "budzisz się warunkowo",
};

export default function CardsPage() {
  const { state, loaded } = useGame();
  const [withNames, setWithNames] = useState(true);
  const [shuffled, setShuffled] = useState(false);
  const [withCheatSheet, setWithCheatSheet] = useState(true);
  const [seed, setSeed] = useState(0);

  const players = useMemo(() => {
    const base = [...state.players].sort((a, b) => a.seat - b.seat);
    return shuffled ? shuffle(base) : base;
    // seed wymusza ponowne przetasowanie
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.players, shuffled, seed]);

  if (!loaded) return null;

  const assigned = players.filter((p) => p.roleId);

  if (assigned.length === 0) {
    return (
      <Card title="Karteczki do druku">
        <Empty>
          Najpierw rozdaj role.{" "}
          <Link href="/" className="text-[var(--accent)] underline">
            Przejdź do przygotowania gry
          </Link>
          .
        </Empty>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card
        className="no-print"
        title="Karteczki do rozcięcia"
        right={
          <div className="flex items-center gap-2">
            <Badge>{assigned.length} kart</Badge>
            <Button variant="primary" onClick={() => window.print()}>
              Drukuj / zapisz PDF
            </Button>
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Toggle checked={withNames} onChange={setWithNames} label="Imię gracza na karcie" />
          <Toggle
            checked={shuffled}
            onChange={(v) => {
              setShuffled(v);
              setSeed((x) => x + 1);
            }}
            label="Wymieszaj kolejność (rozdanie na ślepo)"
          />
          <Toggle checked={withCheatSheet} onChange={setWithCheatSheet} label="Dołącz ściągę Manitou" />
          {shuffled && (
            <Button size="sm" onClick={() => setSeed((x) => x + 1)}>
              Przetasuj ponownie
            </Button>
          )}
        </div>
        <p className="mt-3 text-[12px] text-[var(--text-dim)] leading-relaxed">
          W oknie drukowania wybierz „Zapisz jako PDF”, format A4, marginesy domyślne i wyłącz
          nagłówki strony. Sześć karteczek (90 × 88 mm) na stronę, linie cięcia zaznaczone
          przerywaną ramką.
          {withCheatSheet && " Ściąga Manitou drukuje się na osobnej, ostatniej stronie."}
        </p>
      </Card>

      <div className="print-sheet">
        <div className="cards-grid">
          {assigned.map((p) => {
            const role = ROLE_BY_ID[p.roleId!];
            const color = PRINT_COLOR[role.faction];
            return (
              <article key={p.id} className="cut-card" style={{ borderTopColor: color }}>
                <header>
                  <span className="faction" style={{ color }}>
                    {role.faction === "janosik" ? "Frakcja własna" : FACTION_LABEL[role.faction]}
                  </span>
                  {withNames && <span className="player">{p.name}</span>}
                </header>
                <h2 className="role">{role.name}</h2>
                <p className="desc">{role.desc}</p>
                <footer>
                  <span className="goal">
                    <strong>Cel:</strong> {FACTION_GOAL[role.faction]}
                  </span>
                  <span className="night">{NIGHT_LABEL[role.nightUse]}</span>
                </footer>
              </article>
            );
          })}
        </div>

        {withCheatSheet && (
          <section className="cheat">
            <h2>Ściąga Manitou — kto jest kim</h2>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Gracz</th>
                  <th>Karta</th>
                  <th>Frakcja</th>
                </tr>
              </thead>
              <tbody>
                {[...state.players]
                  .sort((a, b) => a.seat - b.seat)
                  .map((p) => {
                    const role = p.roleId ? ROLE_BY_ID[p.roleId] : null;
                    return (
                      <tr key={p.id}>
                        <td>{p.seat + 1}</td>
                        <td>{p.name}</td>
                        <td>{role?.name ?? "—"}</td>
                        <td style={{ color: role ? PRINT_COLOR[role.faction] : undefined }}>
                          {role ? FACTION_LABEL[role.faction] : "—"}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
            <p className="hint">
              Posążek na starcie trzyma herszt bandy. Przeszukiwanych dziennie:{" "}
              {state.settings.searchCount}. Statek bandytów odpływa o poranku po nocy{" "}
              {state.settings.shipNight}.
            </p>
          </section>
        )}
      </div>

      <div
        className={cx(
          "no-print text-[12px] text-[var(--text-faint)] text-center pb-4",
          "border-t border-[var(--border)] pt-4"
        )}
      >
        Podgląd powyżej odpowiada wydrukowi. Karteczki zawierają pełny opis zdolności, więc gracz
        nie musi dopytywać Manitou w trakcie gry.
      </div>
    </div>
  );
}
