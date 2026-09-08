"use client";

/**
 * Karty biorące udział w tej rozgrywce, widziane oczami gracza.
 *
 * Skład jest jawny — ta sama wiedza, którą przy stole z papierowymi kartami
 * daje pytanie do Manitou. Nie ma tu przypisania kart do miejsc; imię pojawia
 * się dopiero przy karcie odkrytej po czyjejś śmierci.
 */

import { useState } from "react";
import { ROLE_BY_ID } from "@/lib/roles";
import { FACTION_GOAL, FACTION_LABEL } from "@/lib/types";
import { Card, FACTION_COLOR, SecretBackdrop, cx } from "./ui";

export interface Ujawniony {
  rola: string;
  imie: string;
}

export default function KartyWGrze({
  sklad,
  ujawnieni,
}: {
  sklad: string[];
  ujawnieni: Ujawniony[];
}) {
  const [podglad, setPodglad] = useState<string | null>(null);

  if (sklad.length === 0) return null;

  // Powtórzone karty (szeregowi członkowie frakcji) zwijamy w jeden wiersz
  // z licznikiem — inaczej lista byłaby ścianą tych samych nazw.
  const zliczone = new Map<string, number>();
  for (const id of sklad) zliczone.set(id, (zliczone.get(id) ?? 0) + 1);

  const imionaDla = (roleId: string) => ujawnieni.filter((u) => u.rola === roleId).map((u) => u.imie);

  const rola = podglad ? ROLE_BY_ID[podglad] : null;

  return (
    <>
      {ujawnieni.length > 0 && (
        <Card title="Kto już odpadł">
          <div className="flex flex-col gap-1.5">
            {ujawnieni.map((u, i) => {
              const r = ROLE_BY_ID[u.rola];
              const kolor = r ? FACTION_COLOR[r.faction] : "var(--text-dim)";
              return (
                <button
                  key={`${u.imie}-${i}`}
                  type="button"
                  onClick={() => r && setPodglad(u.rola)}
                  className="ui-row flex items-center gap-2.5 text-left w-full"
                >
                  <span className="text-[16px] leading-none" aria-hidden>
                    💀
                  </span>
                  <span className="text-[14px] font-semibold">{u.imie}</span>
                  <span className="text-[13px] ml-auto text-right" style={{ color: kolor }}>
                    {r?.name ?? u.rola}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[12px] text-[var(--text-faint)] leading-relaxed">
            Karty odkryte przy stole. Dotknij, żeby przypomnieć sobie, co robiła dana postać.
          </p>
        </Card>
      )}

      <Card title="Karty w tej grze">
        <div className="flex flex-col gap-1">
          {[...zliczone.entries()]
            .map(([id, ile]) => ({ id, ile, rola: ROLE_BY_ID[id] }))
            .filter((x) => x.rola)
            .sort(
              (a, b) =>
                a.rola.faction.localeCompare(b.rola.faction) || a.rola.name.localeCompare(b.rola.name)
            )
            .map(({ id, ile, rola: r }) => {
              const kolor = FACTION_COLOR[r.faction];
              const martwi = imionaDla(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPodglad(id)}
                  className="ui-row flex items-center gap-2 text-left w-full"
                >
                  <span className="w-1.5 h-6 rounded-full shrink-0" style={{ background: kolor }} />
                  <span className="text-[13px] font-medium">{r.name}</span>
                  {ile > 1 && (
                    <span className="text-[11.5px] text-[var(--text-faint)]">×{ile}</span>
                  )}
                  {martwi.length > 0 && (
                    <span className="text-[12px] ml-auto text-right" style={{ color: kolor }}>
                      {martwi.map((imie) => `💀 ${imie}`).join(", ")}
                    </span>
                  )}
                </button>
              );
            })}
        </div>
        <p className="mt-2 text-[12px] text-[var(--text-faint)] leading-relaxed">
          Dotknij karty, żeby przeczytać, co robi. Przy karcie odkrytej po czyjejś śmierci pojawia
          się czaszka i imię.
        </p>
      </Card>

      {rola && (
        <div
          className="fixed inset-0 z-50 grid place-items-center p-4"
          onClick={() => setPodglad(null)}
          role="dialog"
          aria-label={rola.name}
        >
          <SecretBackdrop opacity={0.8} />
          <div
            className={cx("relative w-full max-w-[340px] rounded-[14px] p-5 border-t-4")}
            style={{ background: "var(--surface)", borderTopColor: FACTION_COLOR[rola.faction] }}
          >
            <div className="label-xs" style={{ color: FACTION_COLOR[rola.faction] }}>
              {rola.faction === "janosik" ? "Frakcja własna" : FACTION_LABEL[rola.faction]}
            </div>
            <h2 className="text-[24px] font-bold leading-tight mt-1">{rola.name}</h2>
            {imionaDla(rola.id).length > 0 && (
              <div className="text-[13.5px] mt-1 font-medium" style={{ color: FACTION_COLOR[rola.faction] }}>
                {imionaDla(rola.id).map((imie) => `💀 ${imie}`).join(", ")}
              </div>
            )}
            <p className="text-[13.5px] leading-relaxed mt-3">{rola.desc}</p>
            <div className="mt-4 pt-3 border-t border-[var(--border)] text-[12.5px] text-[var(--text-dim)] leading-relaxed">
              <strong className="text-[var(--text)]">Cel:</strong> {FACTION_GOAL[rola.faction]}
            </div>
            <p className="text-[11.5px] text-[var(--text-faint)] mt-4 text-center">
              Dotknij gdziekolwiek, żeby zamknąć
            </p>
          </div>
        </div>
      )}
    </>
  );
}
