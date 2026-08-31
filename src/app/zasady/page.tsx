import { ROLES, TIER_LABEL } from "@/lib/roles";
import { FACTIONS, FACTION_GOAL, FACTION_LABEL } from "@/lib/types";
import { Badge, Card } from "@/components/ui";

const COLOR = {
  miasto: "var(--city)",
  bandyci: "var(--bandit)",
  indianie: "var(--indian)",
  ufoki: "var(--ufo)",
} as const;

const NIGHT_ORDER: Record<string, string[]> = {
  Miasto: ["Szeryf", "Pastor", "Poborca podatków", "Ochroniarz", "Hazardzista", "Opój", "Janosik"],
  Bandyci: [
    "Bandyci się budzą",
    "Bandyci przeszukują",
    "Bandyci przekazują posążek",
    "Bandyci idą spać",
    "Mściciel",
    "Złodziej",
    "Szuler",
  ],
  Indianie: [
    "Szaman",
    "Indianie się budzą",
    "Indianie zabijają",
    "Wojownik",
    "Samotny kojot",
    "Indianie przekazują posążek",
    "Indianie idą spać",
    "Cicha stopa",
    "Lornecie oko",
    "Szamanka",
  ],
  Ufoki: [
    "Ufoki się budzą",
    "Detektor",
    "Pożeracz umysłów",
    "Zielona macka",
    "Ufoki przeszukują",
    "Ufoki przekazują posążek",
    "Ufoki nadają sygnał",
    "Ufoki idą spać",
  ],
};

const JAWNE = [
  "wszystko, co dzieje się za dnia",
  "kogo zamknął szeryf",
  "kogo chroni ochroniarz",
  "z kim gra hazardzista",
  "kogo spił opój",
  "z kim grał szuler (a jeśli wygrał posążek — „szuler grał z właścicielem posążka”)",
  "kogo zabili mściciel, Indianie i zielona macka",
];

const TAJNE = [
  "czy działali złodziej, szaman, lornecie oko, detektor, szamanka, cicha stopa i poborca podatków",
  "kogo przeszukiwali bandyci, ufoki, złodziej, szaman, pożeracz umysłów, detektor i pastor",
  "wyniki wszystkich przeszukań i badań",
  "czy Janosik zamachał ciupagą (dowiadują się dopiero, że wszyscy się cieszą)",
];

const SIZES: [number, number, number, number, number][] = [
  [12, 5, 4, 3, 0],
  [13, 6, 4, 3, 0],
  [14, 6, 4, 4, 0],
  [15, 7, 4, 4, 0],
  [16, 7, 5, 4, 0],
  [17, 7, 5, 5, 0],
  [18, 6, 4, 5, 3],
  [19, 7, 4, 5, 3],
  [20, 8, 4, 5, 3],
  [21, 8, 4, 6, 3],
  [22, 9, 4, 6, 3],
  [23, 9, 4, 6, 4],
  [24, 10, 4, 6, 4],
  [25, 10, 5, 6, 4],
  [26, 11, 5, 6, 4],
  [27, 11, 5, 7, 4],
  [28, 12, 5, 7, 4],
  [29, 12, 6, 7, 4],
  [30, 13, 6, 7, 4],
];

export default function RulesPage() {
  return (
    <div className="flex flex-col gap-4">
      <Card title="Cele frakcji">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {FACTIONS.map((f) => (
            <div
              key={f}
              className="rounded-md border border-[var(--border)] p-3"
              style={{ borderTopColor: COLOR[f], borderTopWidth: 2 }}
            >
              <div className="text-[13px] font-semibold" style={{ color: COLOR[f] }}>
                {FACTION_LABEL[f]}
              </div>
              <p className="mt-1 text-[12.5px] text-[var(--text-dim)] leading-relaxed">
                {FACTION_GOAL[f]}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[12.5px] text-[var(--text-dim)]">
          Wygrać może tylko jedna frakcja. W sytuacjach spornych decyduje Manitou. Wyjątek domowy:
          powieszony Janosik wygrywa sam, a wszyscy pozostali przegrywają.
        </p>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        <Card title="Kolejność nocy">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(NIGHT_ORDER).map(([k, list]) => (
              <div key={k}>
                <div className="label-xs mb-1.5">{k}</div>
                <ol className="flex flex-col gap-1">
                  {list.map((x, i) => (
                    <li key={x} className="text-[12px] flex gap-1.5">
                      <span className="font-mono text-[10px] text-[var(--text-faint)] w-3">
                        {i + 1}
                      </span>
                      {x}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[12px] text-[var(--text-faint)]">
            Nocy zerowej działają: szeryf, pastor, dziwka, uwodziciel i szantażysta; frakcje poznają
            swój skład.
          </p>
        </Card>

        <Card title="Jawność gry">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="label-xs mb-2">Jawne</div>
              <ul className="flex flex-col gap-1.5">
                {JAWNE.map((x) => (
                  <li key={x} className="text-[12.5px] flex gap-2">
                    <span className="text-[var(--accent)]">•</span>
                    {x}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="label-xs mb-2">Tajne</div>
              <ul className="flex flex-col gap-1.5">
                {TAJNE.map((x) => (
                  <li key={x} className="text-[12.5px] flex gap-2">
                    <span className="text-[var(--text-faint)]">•</span>
                    {x}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      </div>

      <Card title="Karty">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {FACTIONS.map((f) => (
            <div key={f}>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full" style={{ background: COLOR[f] }} />
                <span className="text-[13px] font-semibold" style={{ color: COLOR[f] }}>
                  {FACTION_LABEL[f]}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {ROLES.filter((r) => r.faction === f).map((r) => (
                  <div
                    key={r.id}
                    className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-medium">{r.name}</span>
                      <Badge color={r.tier === "kontrowersyjna" ? "var(--warn)" : undefined}>
                        {TIER_LABEL[r.tier]}
                      </Badge>
                      {r.nightUse !== "brak" && <Badge>noc: {r.nightUse}</Badge>}
                    </div>
                    <p className="mt-1 text-[12px] text-[var(--text-dim)] leading-relaxed">
                      {r.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Proponowane składy (Xięga nie poleca gry powyżej 20 osób)">
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="text-[12.5px] border-collapse min-w-[420px]">
            <thead>
              <tr>
                {["Graczy", "Miasto", "Bandyci", "Indianie", "Ufoki"].map((h) => (
                  <th key={h} className="text-left label-xs px-3 py-2">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SIZES.map((row) => (
                <tr key={row[0]} className="border-t border-[var(--border)]">
                  {row.map((v, i) => (
                    <td
                      key={i}
                      className="px-3 py-1 font-mono tabular-nums"
                      style={{
                        color:
                          i === 0
                            ? "var(--text)"
                            : v === 0
                              ? "var(--text-faint)"
                              : [null, COLOR.miasto, COLOR.bandyci, COLOR.indianie, COLOR.ufoki][i]!,
                      }}
                    >
                      {v === 0 && i > 0 ? "—" : v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
