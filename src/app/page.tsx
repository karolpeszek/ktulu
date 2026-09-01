"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useGame } from "@/lib/store";
import { FACTIONS, FACTION_GOAL, FACTION_LABEL, Faction, Player } from "@/lib/types";
import { ROLES, ROLE_BY_ID, TIER_LABEL, fillerRole, rolesOf } from "@/lib/roles";
import {
  RECOMMENDED_MAX,
  TABLE_MAX,
  TABLE_MIN,
  buildPool,
  recommendationFor,
  shuffle,
  JANOSIK_MIN_PLAYERS,
  janosikAllowed,
  suggestedCounts,
  syncRecommended,
  totalOf,
} from "@/lib/setup";
import { firstIndex } from "@/lib/resolve";
import {
  Badge,
  Button,
  Card,
  Empty,
  FACTION_COLOR,
  Field,
  Toggle,
  Tooltip,
  cx,
  inputCls,
} from "@/components/ui";
import FactionDonut from "@/components/FactionDonut";
import SeatArc, { SeatLegend } from "@/components/SeatArc";

let idSeq = 0;
const newId = () => `p${Date.now().toString(36)}${idSeq++}`;

export default function SetupPage() {
  const { state, update, reset, loaded } = useGame();
  const router = useRouter();
  const [name, setName] = useState("");
  const [bulk, setBulk] = useState("");
  const [showBulk, setShowBulk] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [rowPitch, setRowPitch] = useState(36);
  const listRef = useRef<HTMLDivElement>(null);
  /**
   * Geometria listy zapamiętana w chwili chwycenia. W trakcie przeciągania
   * wiersze są poprzesuwane transformacjami, więc mierzenie ich na bieżąco
   * zwracałoby pozycje podglądu — cel liczyłby się z tego, co sam przed chwilą
   * ustawił, i lista skakała.
   */
  const dragGeom = useRef<{ top: number; pitch: number; count: number } | null>(null);

  /**
   * Miejsce, jakie wiersz zajmie po upuszczeniu. W trakcie przeciągania reszta
   * listy rozsuwa się na podgląd — dokładnie tak, jak żetony w kręgu rady.
   */
  const previewSlot = (i: number): number => {
    if (dragFrom === null || dragOver === null || dragFrom === dragOver) return i;
    if (i === dragFrom) return dragOver;
    if (dragFrom < dragOver) return i > dragFrom && i <= dragOver ? i - 1 : i;
    return i >= dragOver && i < dragFrom ? i + 1 : i;
  };

  /** Zapamiętuje układ listy przed pierwszym przesunięciem wierszy. */
  const captureGeometry = () => {
    const rows = listRef.current?.querySelectorAll("[data-player-row]");
    if (!rows?.length) return;
    const first = rows[0].getBoundingClientRect();
    const pitch =
      rows.length > 1 ? rows[1].getBoundingClientRect().top - first.top : first.height;
    if (pitch > 0) {
      dragGeom.current = { top: first.top, pitch, count: rows.length };
      setRowPitch(pitch);
    }
  };

  /** Który wiersz listy odpowiada podanemu Y — z geometrii sprzed przeciągania. */
  const rowIndexAt = (clientY: number): number | null => {
    const g = dragGeom.current;
    if (!g) return null;
    const i = Math.floor((clientY - g.top) / g.pitch);
    return Math.max(0, Math.min(g.count - 1, i));
  };

  const players = state.players;
  const withJanosik = state.setup.withJanosik;
  const janosikOk = janosikAllowed(players.length);
  const counts = state.setup.manualCounts
    ? state.setup.counts
    : suggestedCounts(players.length, withJanosik);
  const countsTotal = totalOf(counts);
  const rec = recommendationFor(players.length, withJanosik);
  const settingsMatchBook =
    state.settings.searchCount === rec.searchCount && state.settings.shipNight === rec.shipNight;
  const assigned = players.filter((p) => p.roleId).length;

  const pools = useMemo(() => {
    const out: Record<Faction, string[]> = {
      miasto: [],
      bandyci: [],
      indianie: [],
      ufoki: [],
      janosik: [],
    };
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
      syncRecommended(s);
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
      syncRecommended(s);
    });
    setBulk("");
    setShowBulk(false);
  };

  /** Przenosi gracza z pozycji `from` na pozycję `to`, przesuwając resztę. */
  const reorder = (from: number, to: number) => {
    if (from === to) return;
    update((s) => {
      const arr = [...s.players].sort((a, b) => a.seat - b.seat);
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      arr.forEach((p, k) => (p.seat = k));
      s.players = arr;
    });
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

            <div
              ref={listRef}
              className="mt-3 flex flex-col gap-1 max-h-[420px] overflow-y-auto -mx-1 px-1"
            >
              {players.length === 0 && <Empty>Brak graczy. Dodaj co najmniej 4 osoby.</Empty>}
              {[...players]
                .sort((a, b) => a.seat - b.seat)
                .map((p, i) => (
                  <PlayerRow
                    key={p.id}
                    player={p}
                    index={i}
                    onMove={move}
                    dragging={dragFrom === i}
                    // Ile miejsc wiersz przesuwa się w podglądzie układu po upuszczeniu.
                    offset={(previewSlot(i) - i) * rowPitch}
                    slot={previewSlot(i)}
                    onGrab={() => {
                      captureGeometry();
                      setDragFrom(i);
                      setDragOver(i);
                    }}
                    onDragMove={(clientY) => {
                      const to = rowIndexAt(clientY);
                      if (to !== null) setDragOver(to);
                    }}
                    onDrop={() => {
                      if (dragFrom !== null && dragOver !== null) reorder(dragFrom, dragOver);
                      dragGeom.current = null;
                      setDragFrom(null);
                      setDragOver(null);
                    }}
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
                        syncRecommended(s);
                      })
                    }
                  />
                ))}
            </div>
          </Card>

          <Card
            title="Podpowiedź Xięgi"
            right={<Badge color={rec.inTable ? "var(--ok)" : "var(--warn)"}>{`${players.length} graczy`}</Badge>}
          >
            {players.length === 0 ? (
              <p className="text-[12.5px] text-[var(--text-faint)]">
                Dodaj graczy — Xięga podaje gotowy skład i ustawienia dla każdej liczby uczestników.
              </p>
            ) : (
              <>
                {!rec.inTable && (
                  <div className="mb-3 px-2.5 py-2 rounded-md border border-[var(--warn)]/40 bg-[var(--warn-soft)] text-[12px] leading-relaxed">
                    Tabela Xięgi obejmuje {TABLE_MIN}–{TABLE_MAX} graczy. Dla {players.length} osób
                    wartości są wyliczone proporcjonalnie — sprawdź je sam.
                  </div>
                )}
                {players.length > RECOMMENDED_MAX && (
                  <div className="mb-3 px-2.5 py-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)] text-[12px] leading-relaxed text-[var(--text-dim)]">
                    Xięga nie poleca gry w liczbie większej niż {RECOMMENDED_MAX} osób.
                  </div>
                )}
                <dl className="flex flex-col gap-1">
                  {FACTIONS.filter((f) => f !== "janosik" || rec.counts.janosik > 0).map((f) => (
                    <div key={f} className="flex items-center gap-2 text-[12.5px]">
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: FACTION_COLOR[f] }}
                      />
                      <dt className="flex-1 text-[var(--text-dim)]">{FACTION_LABEL[f]}</dt>
                      <dd className="font-mono tabular-nums">
                        {rec.counts[f] || "—"}
                        {counts[f] !== rec.counts[f] && (
                          <span className="ml-1.5 text-[var(--warn)]">→ {counts[f]}</span>
                        )}
                      </dd>
                    </div>
                  ))}
                  <div className="h-px bg-[var(--border)] my-1.5" />
                  <div className="flex items-center gap-2 text-[12.5px]">
                    <dt className="flex-1 text-[var(--text-dim)]">Przeszukiwanych dziennie</dt>
                    <dd className="font-mono tabular-nums">
                      {rec.searchCount}
                      {state.settings.searchCount !== rec.searchCount && (
                        <span className="ml-1.5 text-[var(--warn)]">→ {state.settings.searchCount}</span>
                      )}
                    </dd>
                  </div>
                  <div className="flex items-center gap-2 text-[12.5px]">
                    <dt className="flex-1 text-[var(--text-dim)]">Statek bandytów</dt>
                    <dd className="font-mono tabular-nums">
                      noc {rec.shipNight}
                      {state.settings.shipNight !== rec.shipNight && (
                        <span className="ml-1.5 text-[var(--warn)]">→ noc {state.settings.shipNight}</span>
                      )}
                    </dd>
                  </div>
                </dl>
                <p className="mt-2 text-[11px] text-[var(--text-faint)] leading-relaxed">
                  Dwie osoby do przeszukania do szesnastu graczy, trzy powyżej. Statek odpływa o
                  poranku po nocy {rec.shipNight} (to {rec.shipNight + 1}. poranek).
                </p>
                {(state.setup.manualCounts || !settingsMatchBook) && (
                  <Button
                    className="mt-3"
                    size="sm"
                    variant="primary"
                    onClick={() =>
                      update((s) => {
                        s.setup.manualCounts = false;
                        s.setup.manualSettings = false;
                        syncRecommended(s);
                      })
                    }
                  >
                    Przywróć ustawienia Xięgi
                  </Button>
                )}
              </>
            )}
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
                    s.setup.counts = suggestedCounts(s.players.length, s.setup.withJanosik);
                  })
                }
              >
                Sugestia Xięgi
              </Button>
            }
          >
            <FactionDonut counts={counts} />

            <div className="mt-4 px-2.5 py-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)]">
              <Toggle
                checked={withJanosik}
                disabled={!janosikOk}
                onChange={(v) =>
                  update((s) => {
                    s.setup.withJanosik = v;
                    s.setup.manualCounts = false;
                    syncRecommended(s);
                  })
                }
                label="Janosik — osobna frakcja"
              />
              <p className="mt-1.5 text-[11px] text-[var(--text-faint)] leading-relaxed">
                {janosikOk
                  ? `Dodatek domowy. Janosik zajmuje jedno miejsce, a pozostałych ${players.length - 1} graczy dzieli się wg wiersza tabeli Xięgi dla ${players.length - 1} osób.`
                  : `Wymaga co najmniej ${JANOSIK_MIN_PLAYERS} graczy — po odjęciu jego karty przy stole musi zostać tylu, ilu obejmuje najmniejszy wiersz tabeli Xięgi.`}
              </p>
            </div>

            <div className="mt-3 flex flex-col gap-2">
              {FACTIONS.filter((f) => f !== "janosik" || counts.janosik > 0).map((f) => (
                <div key={f} className="flex items-center gap-2">
                  <span
                    className="w-1.5 h-6 rounded-sm"
                    style={{ background: FACTION_COLOR[f] }}
                  />
                  <span className="flex-1 text-[13px]">{FACTION_LABEL[f]}</span>
                  {f === "janosik" ? (
                    <span className="text-[12px] text-[var(--text-faint)] pr-1">
                      zawsze jeden — steruje przełącznik
                    </span>
                  ) : (
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
                  )}
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
                      s.setup.manualSettings = true;
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
                      s.setup.manualSettings = true;
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
            <SeatArc state={state} onReorder={reorder} />
            <SeatLegend />
            <p className="mt-2 text-[11.5px] text-[var(--text-faint)]">
              Przeciągnij gracza po łuku, aby zmienić kolejność siedzenia — albo użyj uchwytu przy
              liście obok. Kolejność w kręgu ma znaczenie dla detektora ufoków.
            </p>
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
                      // Ponad limit nie wchodzimy: karta i tak nie zmieściłaby się
                      // w puli, a w liście świeciłaby jako wybrana.
                      else if (cur.size < counts[f]) cur.add(roleId);
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
                <Button
                  size="sm"
                  disabled={assigned === 0}
                  onClick={() => router.push("/karty")}
                >
                  Karteczki do druku
                </Button>
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

/**
 * Sterowanie widoczne bez najeżdżania na urządzeniach dotykowych i rysikowych —
 * tam `hover` albo nie istnieje, albo (Apple Pencil w trybie blokady) nie działa.
 */
const HOVER_CONTROLS =
  "opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 transition-opacity";

function PlayerRow({
  player,
  index,
  onMove,
  onRename,
  onRemove,
  dragging,
  offset,
  slot,
  onGrab,
  onDragMove,
  onDrop,
}: {
  player: Player;
  index: number;
  onMove: (i: number, d: -1 | 1) => void;
  onRename: (v: string) => void;
  onRemove: () => void;
  dragging: boolean;
  /** Przesunięcie w pikselach do miejsca, które wiersz zajmie po upuszczeniu. */
  offset: number;
  /** Numer miejsca w podglądzie układu. */
  slot: number;
  onGrab: () => void;
  onDragMove: (clientY: number) => void;
  onDrop: () => void;
}) {
  // Stan „trzymam” w refie, nie w propsie: pierwsze ruchy padają zanim React
  // zdąży przerenderować wiersz, a bez nich pierwsze przeciągnięcie szarpało.
  const grabbed = useRef(false);

  return (
    <div
      data-player-row
      className={cx(
        "ui-row reorder-move group flex items-center gap-1.5 h-8 rounded",
        // Ciągnięty wiersz jedzie nad resztą i nie ma czekać na animację.
        dragging && "relative z-10 bg-[var(--surface-2)] shadow-md ring-1 ring-[var(--accent)]"
      )}
      style={{
        transform: offset ? `translateY(${offset}px)` : undefined,
        transition: dragging ? "none" : undefined,
      }}
    >
      {/*
        Zdarzenia wskaźnika zamiast HTML5 drag-and-drop: tamto nie działa
        w Safari na iOS ani z Apple Pencilem. `touch-action: none` powstrzymuje
        przewijanie strony w trakcie przeciągania, a przechwycenie wskaźnika
        sprawia, że ruch trafia do uchwytu nawet po zjechaniu poza wiersz.
      */}
      <span
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          grabbed.current = true;
          onGrab();
        }}
        onPointerMove={(e) => {
          if (grabbed.current) onDragMove(e.clientY);
        }}
        onPointerUp={(e) => {
          e.currentTarget.releasePointerCapture(e.pointerId);
          grabbed.current = false;
          onDrop();
        }}
        onPointerCancel={() => {
          grabbed.current = false;
          onDrop();
        }}
        // Uchwyt normalnie wychodzi po najechaniu, ale w trakcie przeciągania
        // wiersz ucieka spod kursora i `:hover` znika razem z nim.
        style={{ touchAction: "none", opacity: dragging ? 1 : undefined }}
        className={cx(
          "ui-grip w-6 h-7 shrink-0 grid place-items-center rounded text-[14px] leading-none",
          "text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]",
          "cursor-grab active:cursor-grabbing select-none",
          HOVER_CONTROLS
        )}
        title="Przeciągnij, aby zmienić miejsce w kręgu"
        aria-label={`Przenieś gracza ${player.name}`}
      >
        ⠿
      </span>
      <span className="w-6 shrink-0 text-center text-[11px] font-mono text-[var(--text-faint)]">
        {slot + 1}
      </span>
      <input
        value={player.name}
        onChange={(e) => onRename(e.target.value)}
        className="ui-input flex-1 min-w-0 h-7 px-2 rounded bg-transparent border border-transparent hover:border-[var(--border)] focus:border-[var(--accent)] focus:bg-[var(--surface)] text-[13px] outline-none"
      />
      <div className={cx("ui-rowctl flex items-center gap-0.5 shrink-0", HOVER_CONTROLS)}>
        <button
          onClick={() => onMove(index, -1)}
          className="ui-iconbtn w-7 h-7 rounded text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]"
          title="W górę"
          aria-label="Przenieś w górę"
        >
          ↑
        </button>
        <button
          onClick={() => onMove(index, 1)}
          className="ui-iconbtn w-7 h-7 rounded text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]"
          title="W dół"
          aria-label="Przenieś w dół"
        >
          ↓
        </button>
        <button
          onClick={onRemove}
          className="ui-iconbtn w-7 h-7 rounded text-[var(--text-faint)] hover:text-[var(--danger)] hover:bg-[var(--danger-soft)]"
          title="Usuń"
          aria-label="Usuń gracza"
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
  const color = FACTION_COLOR[faction];
  const filler = fillerRole(faction);
  const fillerCount = filler ? pool.filter((r) => r === filler.id).length : 0;
  const list = ROLES.filter((r) => r.faction === faction && !r.filler);
  const autoCount = pool.filter((id) => !picked.includes(id) && id !== filler?.id).length;

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
          {picked.length} + {autoCount} / {size}
        </span>
      </div>
      <div className="p-2 flex flex-col gap-0.5 max-h-[260px] overflow-y-auto">
        {list.map((r) => {
          const on = picked.includes(r.id);
          const auto = !on && pool.includes(r.id);
          // Przy pełnym limicie dokładanie kart tylko myli — najpierw trzeba coś zdjąć.
          const blocked = !on && picked.length >= size;
          return (
            <Tooltip
              key={r.id}
              side="beside"
              className="w-full"
              content={
                <span className="block">
                  <span className="block font-semibold">{r.name}</span>
                  <span className="block text-[var(--text-dim)] mt-1">{r.desc}</span>
                  <span className="block text-[var(--text-faint)] mt-1">
                    {TIER_LABEL[r.tier]}
                    {on && " · wybrana ręcznie — kliknij, żeby zdjąć"}
                    {auto && " · dobrana automatycznie; kliknij, żeby przypiąć na stałe"}
                    {blocked && ` · limit ${size} kart wyczerpany — zdejmij najpierw inną`}
                  </span>
                </span>
              }
            >
              <button
                onClick={() => onToggle(r.id)}
                disabled={blocked}
                className={cx(
                  "ui-row w-full flex items-center gap-2 text-left px-2 h-7 rounded transition-colors",
                  on && "bg-[var(--accent-soft)]",
                  !on && !blocked && "hover:bg-[var(--surface-2)]",
                  blocked && "opacity-40 cursor-not-allowed"
                )}
              >
                <span
                  className={cx(
                    "w-3.5 h-3.5 shrink-0 rounded-[3px] grid place-items-center text-[9px] leading-none",
                    on
                      ? "bg-[var(--accent)] border border-[var(--accent)] text-white"
                      : auto
                        ? "border border-dashed border-[var(--text-faint)]"
                        : "border border-[var(--border-strong)]"
                  )}
                >
                  {on ? "✓" : ""}
                </span>
                <span className="flex-1 min-w-0 truncate text-[12.5px]">
                  {r.name}
                  {r.leader && (
                    <span className="ml-1.5 text-[10px] text-[var(--text-faint)]">herszt/wódz</span>
                  )}
                </span>
                {/* Stała szerokość znacznika — inaczej wiersze skakałyby przy
                    każdym kliknięciu i trafiałoby się w sąsiada. */}
                <span className="w-[74px] shrink-0 text-right text-[10px] text-[var(--text-faint)]">
                  {on ? "ręcznie" : auto ? "auto" : TIER_LABEL[r.tier]}
                </span>
              </button>
            </Tooltip>
          );
        })}
        {filler && fillerCount > 0 && (
          <div className="mt-1 px-2 h-7 rounded bg-[var(--surface-2)] text-[12px] text-[var(--text-dim)] flex items-center justify-between">
            <span>{ROLE_BY_ID[filler.id].name}</span>
            <span className="font-mono">×{fillerCount}</span>
          </div>
        )}
      </div>
      <div className="px-3 py-2 border-t border-[var(--border)] text-[11px] text-[var(--text-faint)] leading-relaxed">
        <span className="block mb-0.5">
          <strong className="text-[var(--text-dim)]">{picked.length}</strong> wybranych ręcznie
          {autoCount > 0 && (
            <>
              , <strong className="text-[var(--text-dim)]">{autoCount}</strong> dobranych
              automatycznie
            </>
          )}
          . Każda karta przypięta ręcznie wypiera jedną z dobranych.
        </span>
        {FACTION_GOAL[faction]}
      </div>
    </div>
  );
}
