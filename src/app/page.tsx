"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useGame } from "@/lib/store";
import { FACTIONS, FACTION_GOAL, FACTION_LABEL, Faction, Player } from "@/lib/types";
import { ROLES, ROLE_BY_ID, TIER_LABEL, fillerRole, rolesOf } from "@/lib/roles";
import { buildPool, shuffle, suggestedCounts, totalOf } from "@/lib/setup";
import { firstIndex } from "@/lib/resolve";
import { Badge, Button, Card, Empty, Field, Toggle, cx, inputCls } from "@/components/ui";
import FactionDonut from "@/components/FactionDonut";
import SeatArc from "@/components/SeatArc";

let idSeq = 0;
const newId = () => `p${Date.now().toString(36)}${idSeq++}`;

export default function SetupPage() {
  const { state, update, reset, loaded } = useGame();
  const router = useRouter();
  const [name, setName] = useState("");
  const [bulk, setBulk] = useState("");
  const [showBulk, setShowBulk] = useState(false);

  const players = state.players;
  const counts = state.setup.manualCounts
    ? state.setup.counts
    : suggestedCounts(players.length);
  const countsTotal = totalOf(counts);
  const assigned = players.filter((p) => p.roleId).length;

  const pools = useMemo(() => {
    const out: Record<Faction, string[]> = { miasto: [], bandyci: [], indianie: [], ufoki: [] };
    for (const f of FACTIONS)
      out[f] = buildPool(f, counts[f], state.setup.picked[f] ?? [], state.setup.autofill);
    return out;
  }, [counts, state.setup.picked, state.setup.autofill]);

  const addPlayer = (n: string) => {
    const trimmed = n.trim();
    if (!trimmed) return;
    update((s) => {
      s.players.push({
        id: newId(),
        name: trimmed,
        seat: s.players.length,
        roleId: null,
        alive: true,
      });
    });
  };

  const addBulk = () => {
    const names = bulk
      .split(/[\n,;]+/)
      .map((x) => x.trim())
      .filter(Boolean);
    update((s) => {
      for (const n of names)
        s.players.push({ id: newId(), name: n, seat: s.players.length, roleId: null, alive: true });
    });
    setBulk("");
    setShowBulk(false);
  };

  const move = (i: number, dir: -1 | 1) => {
    update((s) => {
      const arr = [...s.players].sort((a, b) => a.seat - b.seat);
      const j = i + dir;
      if (j < 0 || j >= arr.length) return;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      arr.forEach((p, k) => (p.seat = k));
      s.players = arr;
    });
  };

  const draw = () => {
    const pool = FACTIONS.flatMap((f) => pools[f]);
    if (pool.length !== players.length) return;
    const shuffledRoles = shuffle(pool);
    const order = shuffle(players.map((p) => p.id));
    update((s) => {
      order.forEach((pid, i) => {
        const p = s.players.find((x) => x.id === pid)!;
        p.roleId = shuffledRoles[i];
      });
    });
  };

  const clearRoles = () =>
    update((s) => {
      s.players.forEach((p) => (p.roleId = null));
    });

  const startGame = () => {
    update((s) => {
      s.stage = "night";
      s.night = 0;
      s.day = 0;
      s.players.forEach((p) => {
        p.alive = true;
        p.deathNote = undefined;
        p.deathPhase = undefined;
      });
      s.idolHolder = null;
      s.events = [];
      s.morningReport = [];
      s.stepIndex = firstIndex(s);
      s.setup.counts = counts;
      s.setup.manualCounts = true;
    });
    router.push("/gra");
  };

  const ready = players.length >= 4 && assigned === players.length && countsTotal === players.length;

  if (!loaded) return null;

  return (
    <div className="flex flex-col gap-4">
      {state.stage !== "setup" && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[13px]">
          <span className="flex-1">
            Rozgrywka jest w toku ({state.stage === "night" ? `noc ${state.night}` : `dzień ${state.day}`}
            ). Zmiany w przygotowaniu nie wpłyną na trwającą grę.
          </span>
          <Button variant="primary" size="sm" onClick={() => router.push("/gra")}>
            Wróć do rozgrywki
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              if (confirm("Skasować bieżącą rozgrywkę i zacząć od zera?")) reset();
            }}
          >
            Nowa gra
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-4 items-start">
        {/* ── kolumna lewa ── */}
        <div className="flex flex-col gap-4">
          <Card
            title="Gracze"
            right={
              <div className="flex items-center gap-2">
                <Badge>{players.length}</Badge>
                <Button size="sm" variant="ghost" onClick={() => setShowBulk((v) => !v)}>
                  {showBulk ? "Pojedynczo" : "Wklej listę"}
                </Button>
              </div>
            }
          >
            {showBulk ? (
              <div className="flex flex-col gap-2">
                <textarea
                  value={bulk}
                  onChange={(e) => setBulk(e.target.value)}
                  rows={6}
                  placeholder={"Jeden gracz w linii\nlub po przecinku"}
                  className={cx(inputCls, "h-auto py-2 resize-y font-mono text-[12px]")}
                />
                <Button variant="primary" size="sm" onClick={addBulk}>
                  Dodaj wszystkich
                </Button>
              </div>
            ) : (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  addPlayer(name);
                  setName("");
                }}
              >
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Imię gracza"
                  className={inputCls}
                />
                <Button variant="primary" type="submit">
                  Dodaj
                </Button>
              </form>
            )}

            <div className="mt-3 flex flex-col gap-1 max-h-[420px] overflow-y-auto -mx-1 px-1">
              {players.length === 0 && <Empty>Brak graczy. Dodaj co najmniej 4 osoby.</Empty>}
              {[...players]
                .sort((a, b) => a.seat - b.seat)
                .map((p, i) => (
                  <PlayerRow
                    key={p.id}
                    player={p}
                    index={i}
                    onMove={move}
                    onRename={(v) =>
                      update((s) => {
                        const t = s.players.find((x) => x.id === p.id);
                        if (t) t.name = v;
                      })
                    }
                    onRemove={() =>
                      update((s) => {
                        s.players = s.players
                          .filter((x) => x.id !== p.id)
                          .sort((a, b) => a.seat - b.seat)
                          .map((x, k) => ({ ...x, seat: k }));
                      })
                    }
                  />
                ))}
            </div>
          </Card>

          <Card
            title="Skład frakcji"
            right={
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  update((s) => {
                    s.setup.manualCounts = false;
                    s.setup.counts = suggestedCounts(s.players.length);
                  })
                }
              >
                Sugestia Xięgi
              </Button>
            }
          >
            <FactionDonut counts={counts} />
            <div className="mt-4 flex flex-col gap-2">
              {FACTIONS.map((f) => (
                <div key={f} className="flex items-center gap-2">
                  <span
                    className="w-1.5 h-6 rounded-sm"
                    style={{ background: `var(--${f === "miasto" ? "city" : f === "bandyci" ? "bandit" : f === "indianie" ? "indian" : "ufo"})` }}
                  />
                  <span className="flex-1 text-[13px]">{FACTION_LABEL[f]}</span>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      onClick={() =>
                        update((s) => {
                          s.setup.manualCounts = true;
                          s.setup.counts = { ...counts, [f]: Math.max(0, counts[f] - 1) };
                        })
                      }
                    >
                      −
                    </Button>
                    <span className="w-8 text-center font-mono tabular-nums text-[13px]">
                      {counts[f]}
                    </span>
                    <Button
                      size="sm"
                      onClick={() =>
                        update((s) => {
                          s.setup.manualCounts = true;
                          s.setup.counts = { ...counts, [f]: counts[f] + 1 };
                        })
                      }
                    >
                      +
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div
              className={cx(
                "mt-3 text-[12px] px-2.5 py-2 rounded-md border",
                countsTotal === players.length
                  ? "text-[var(--ok)] bg-[var(--ok-soft)] border-[var(--ok)]/30"
                  : "text-[var(--danger)] bg-[var(--danger-soft)] border-[var(--danger)]/30"
              )}
            >
              {countsTotal === players.length
                ? `Suma frakcji zgadza się z liczbą graczy (${countsTotal}).`
                : `Suma frakcji ${countsTotal} ≠ liczba graczy ${players.length}.`}
            </div>
          </Card>

          <Card title="Ustawienia Manitou">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Przeszukiwanych dziennie" hint="Xięga: 2 do 16 graczy, 3 powyżej.">
                <input
                  type="number"
                  min={1}
                  max={5}
                  className={inputCls}
                  value={state.settings.searchCount}
                  onChange={(e) =>
                    update((s) => {
                      s.settings.searchCount = Math.max(1, Number(e.target.value) || 1);
                    })
                  }
                />
              </Field>
              <Field label="Noc odpłynięcia" hint="Statek odpływa o poranku po tej nocy.">
                <input
                  type="number"
                  min={1}
                  max={9}
                  className={inputCls}
                  value={state.settings.shipNight}
                  onChange={(e) =>
                    update((s) => {
                      s.settings.shipNight = Math.max(1, Number(e.target.value) || 1);
                    })
                  }
                />
              </Field>
              <Field label="Pojedynków dziennie">
                <input
                  type="number"
                  min={0}
                  max={5}
                  className={inputCls}
                  value={state.settings.maxDuelsPerDay}
                  onChange={(e) =>
                    update((s) => {
                      s.settings.maxDuelsPerDay = Math.max(0, Number(e.target.value) || 0);
                    })
                  }
                />
              </Field>
              <Field label="Jawność">
                <select
                  className={inputCls}
                  value={state.settings.disclosure}
                  onChange={(e) =>
                    update((s) => {
                      s.settings.disclosure = e.target.value as "jawny" | "tajny";
                    })
                  }
                >
                  <option value="tajny">Tajny (Xięga)</option>
                  <option value="jawny">Jawny (szybka gra)</option>
                </select>
              </Field>
            </div>
            <div className="mt-3">
              <Toggle
                checked={state.settings.banditsCanKill}
                onChange={(v) =>
                  update((s) => {
                    s.settings.banditsCanKill = v;
                  })
                }
                label="Bandyci mogą zabić okradaną ofiarę (Xięga odradza)"
              />
            </div>
          </Card>
        </div>

        {/* ── kolumna prawa ── */}
        <div className="flex flex-col gap-4">
          <Card
            title="Krąg rady"
            right={
              <div className="flex items-center gap-2">
                <Badge color="var(--accent)">{`${assigned}/${players.length} kart`}</Badge>
              </div>
            }
          >
            <SeatArc state={state} />
          </Card>

          <Card
            title="Pula kart"
            right={
              <div className="flex items-center gap-3">
                <Toggle
                  checked={state.setup.autofill}
                  onChange={(v) =>
                    update((s) => {
                      s.setup.autofill = v;
                    })
                  }
                  label="Uzupełniaj automatycznie"
                />
              </div>
            }
          >
            <p className="text-[12px] text-[var(--text-faint)] mb-3">
              Zaznacz karty, które mają wejść do gry. Wolne miejsca w frakcji uzupełni automat
              (kolejność wg Xięgi: kluczowe → tradycyjne → opcjonalne → kontrowersyjne), a resztę
              szeregowi członkowie.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {FACTIONS.filter((f) => counts[f] > 0).map((f) => (
                <FactionRoles
                  key={f}
                  faction={f}
                  size={counts[f]}
                  picked={state.setup.picked[f] ?? []}
                  pool={pools[f]}
                  onToggle={(roleId) =>
                    update((s) => {
                      const cur = new Set(s.setup.picked[f] ?? []);
                      if (cur.has(roleId)) cur.delete(roleId);
                      else cur.add(roleId);
                      s.setup.picked[f] = [...cur];
                    })
                  }
                />
              ))}
            </div>
          </Card>

          <Card
            title="Przydział ról"
            right={
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={clearRoles}>
                  Wyczyść
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={draw}
                  disabled={countsTotal !== players.length || players.length === 0}
                >
                  Losuj role
                </Button>
              </div>
            }
          >
            {players.length === 0 ? (
              <Empty>Najpierw dodaj graczy.</Empty>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {[...players]
                  .sort((a, b) => a.seat - b.seat)
                  .map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-2)]"
                    >
                      <span className="w-6 h-6 shrink-0 grid place-items-center rounded bg-[var(--surface)] border border-[var(--border)] text-[11px] font-mono">
                        {p.seat + 1}
                      </span>
                      <span className="flex-1 truncate text-[13px]">{p.name}</span>
                      <select
                        className="h-7 max-w-[150px] text-[12px] rounded bg-[var(--surface)] border border-[var(--border-strong)] px-1 outline-none focus:border-[var(--accent)]"
                        value={p.roleId ?? ""}
                        onChange={(e) =>
                          update((s) => {
                            const t = s.players.find((x) => x.id === p.id);
                            if (t) t.roleId = e.target.value || null;
                          })
                        }
                      >
                        <option value="">— brak —</option>
                        {FACTIONS.map((f) => (
                          <optgroup key={f} label={FACTION_LABEL[f]}>
                            {rolesOf(f).map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                  ))}
              </div>
            )}

            <div className="mt-4 flex items-center gap-3">
              <Button variant="primary" disabled={!ready} onClick={startGame}>
                Rozpocznij grę — noc zerowa
              </Button>
              {!ready && (
                <span className="text-[12px] text-[var(--text-faint)]">
                  Potrzeba ≥4 graczy, zgodnej sumy frakcji i karty dla każdego.
                </span>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function PlayerRow({
  player,
  index,
  onMove,
  onRename,
  onRemove,
}: {
  player: Player;
  index: number;
  onMove: (i: number, d: -1 | 1) => void;
  onRename: (v: string) => void;
  onRemove: () => void;
}) {
  return (
    <div className="group flex items-center gap-1.5 h-8">
      <span className="w-6 shrink-0 text-center text-[11px] font-mono text-[var(--text-faint)]">
        {index + 1}
      </span>
      <input
        value={player.name}
        onChange={(e) => onRename(e.target.value)}
        className="flex-1 h-7 px-2 rounded bg-transparent border border-transparent hover:border-[var(--border)] focus:border-[var(--accent)] focus:bg-[var(--surface)] text-[13px] outline-none"
      />
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onMove(index, -1)}
          className="w-6 h-6 rounded text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]"
          title="W górę"
        >
          ↑
        </button>
        <button
          onClick={() => onMove(index, 1)}
          className="w-6 h-6 rounded text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]"
          title="W dół"
        >
          ↓
        </button>
        <button
          onClick={onRemove}
          className="w-6 h-6 rounded text-[var(--text-faint)] hover:text-[var(--danger)] hover:bg-[var(--danger-soft)]"
          title="Usuń"
        >
          ×
        </button>
      </div>
    </div>
  );
}

function FactionRoles({
  faction,
  size,
  picked,
  pool,
  onToggle,
}: {
  faction: Faction;
  size: number;
  picked: string[];
  pool: string[];
  onToggle: (roleId: string) => void;
}) {
  const color =
    faction === "miasto"
      ? "var(--city)"
      : faction === "bandyci"
        ? "var(--bandit)"
        : faction === "indianie"
          ? "var(--indian)"
          : "var(--ufo)";
  const filler = fillerRole(faction);
  const fillerCount = pool.filter((r) => r === filler.id).length;
  const list = ROLES.filter((r) => r.faction === faction && !r.filler);

  return (
    <div className="rounded-md border border-[var(--border)] overflow-hidden">
      <div
        className="px-3 h-9 flex items-center gap-2 border-b border-[var(--border)]"
        style={{ background: `color-mix(in srgb, ${color} 8%, var(--surface-2))` }}
      >
        <span className="w-2 h-2 rounded-full" style={{ background: color }} />
        <span className="text-[13px] font-semibold" style={{ color }}>
          {FACTION_LABEL[faction]}
        </span>
        <span className="ml-auto text-[11px] font-mono text-[var(--text-dim)]">
          {picked.length}/{size} wybrane
        </span>
      </div>
      <div className="p-2 flex flex-col gap-0.5 max-h-[260px] overflow-y-auto">
        {list.map((r) => {
          const on = picked.includes(r.id);
          const auto = !on && pool.includes(r.id);
          return (
            <button
              key={r.id}
              onClick={() => onToggle(r.id)}
              className={cx(
                "flex items-start gap-2 text-left px-2 py-1.5 rounded transition-colors",
                on ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--surface-2)]"
              )}
              title={r.desc}
            >
              <span
                className={cx(
                  "mt-0.5 w-3.5 h-3.5 shrink-0 rounded-[3px] border grid place-items-center text-[9px]",
                  on
                    ? "bg-[var(--accent)] border-[var(--accent)] text-white"
                    : auto
                      ? "border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--text-faint)]"
                      : "border-[var(--border-strong)]"
                )}
              >
                {on ? "✓" : auto ? "·" : ""}
              </span>
              <span className="flex-1 min-w-0">
                <span className="text-[12.5px]">{r.name}</span>
                {r.leader && <span className="ml-1.5 text-[10px] text-[var(--text-faint)]">herszt/wódz</span>}
              </span>
              <span className="text-[10px] text-[var(--text-faint)] shrink-0 mt-0.5">
                {TIER_LABEL[r.tier]}
              </span>
            </button>
          );
        })}
        {fillerCount > 0 && (
          <div className="mt-1 px-2 py-1.5 rounded bg-[var(--surface-2)] text-[12px] text-[var(--text-dim)] flex justify-between">
            <span>{ROLE_BY_ID[filler.id].name}</span>
            <span className="font-mono">×{fillerCount}</span>
          </div>
        )}
      </div>
      <div className="px-3 py-2 border-t border-[var(--border)] text-[11px] text-[var(--text-faint)]">
        {FACTION_GOAL[faction]}
      </div>
    </div>
  );
}
