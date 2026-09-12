"use client";

/**
 * Lobby w przygotowaniu gry.
 *
 * Pokój żyje na serwerze tylko po to, żeby zebrać imiona i rozdać karty.
 * Sadzanie kogoś z puli dopisuje go do zwykłej listy graczy — dalej wszystko
 * działa tak samo jak przy grze bez sieci, łącznie ze zmianą kolejności.
 */

import { useState } from "react";
import type { Pokoj, GraczWPokoju, PoziomAsysty } from "@/lib/pokoj";
import { Badge, Button, Card, Empty, cx, inputCls } from "./ui";
import EkranKodu from "./EkranKodu";

function Kropka({ kolor, tytul }: { kolor: string; tytul: string }) {
  return (
    <span
      title={tytul}
      className="w-2 h-2 rounded-full shrink-0"
      style={{ background: kolor }}
      aria-label={tytul}
    />
  );
}

export default function KartaLobby({
  pokoj,
  posadzeni,
  onPosadz,
}: {
  pokoj: Pokoj;
  /** Identyfikatory graczy, którzy siedzą już na liście prowadzącego. */
  posadzeni: string[];
  onPosadz: (gracz: GraczWPokoju) => void;
}) {
  const [pelnyEkran, setPelnyEkran] = useState(false);
  const [nowyKodAsysty, setNowyKodAsysty] = useState<string | null>(null);
  const [zmieniany, setZmieniany] = useState<string | null>(null);
  const [nowaNazwa, setNowaNazwa] = useState("");

  const stan = pokoj.stan;

  if (!stan) {
    return (
      <Card title="Lobby">
        <p className="text-[12.5px] text-[var(--text-dim)] leading-relaxed">
          Utwórz pokój, a gracze dołączą kodem ze swoich telefonów. Imiona wpiszą sami, ty tylko
          sadzasz ich w kolejności przy stole.
        </p>
        {pokoj.blad && (
          <p className="text-[12.5px] mt-2" style={{ color: "var(--danger)" }}>
            {pokoj.blad}
          </p>
        )}
        <Button variant="primary" className="mt-3" onClick={() => void pokoj.zaloz()}>
          Utwórz pokój
        </Button>
      </Card>
    );
  }

  const pula = stan.gracze.filter((g) => !posadzeni.includes(g.id));
  const zapisyOtwarte = stan.etap === "lobby";
  const rozdane = stan.etap === "rozdane";
  const zKarta = stan.gracze.filter((g) => g.maKarte);
  const widzieli = zKarta.filter((g) => g.widzial !== null);

  return (
    <>
      <Card
        title="Lobby"
        right={
          <div className="flex items-center gap-2">
            <Kropka
              kolor={
                pokoj.polaczenie === "polaczony"
                  ? "var(--ok)"
                  : pokoj.polaczenie === "laczenie"
                    ? "var(--warn)"
                    : "var(--danger)"
              }
              tytul={
                pokoj.polaczenie === "polaczony"
                  ? "Podgląd na żywo działa"
                  : pokoj.polaczenie === "laczenie"
                    ? "Łączenie z pokojem"
                    : "Brak połączenia z pokojem"
              }
            />
            <Badge color={zapisyOtwarte ? "var(--ok)" : rozdane ? "var(--accent)" : "var(--text-dim)"}>
              {zapisyOtwarte ? "zapisy otwarte" : rozdane ? "karty rozdane" : "zapisy zamknięte"}
            </Badge>
          </div>
        }
      >
        <div className="flex items-center gap-3">
          <div>
            <div className="label-xs mb-1">Kod pokoju</div>
            <div className="font-mono font-bold tracking-[0.2em] text-[26px] leading-none">
              {stan.kod}
            </div>
          </div>
          <Button variant="primary" className="ml-auto" onClick={() => setPelnyEkran(true)}>
            Pokaż graczom
          </Button>
        </div>

        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {/* Po rozdaniu zapisów nie da się otworzyć wprost — najpierw trzeba
              wyczyścić karty, więc pokazujemy dokładnie tę akcję zamiast
              przycisku, który odbiłby się o komunikat błędu. */}
          {rozdane ? (
            <Button size="sm" variant="primary" onClick={() => void pokoj.nowaRunda()}>
              Nowa runda — wyczyść karty
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => void pokoj.ustawEtap(zapisyOtwarte ? "zamkniete" : "lobby")}
            >
              {zapisyOtwarte ? "Zamknij zapisy" : "Otwórz zapisy"}
            </Button>
          )}
          {pula.length > 0 && (
            <Button size="sm" onClick={() => pula.forEach(onPosadz)}>
              Posadź wszystkich ({pula.length})
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={() => {
              if (!confirm("Zamknąć pokój? Gracze stracą do niego dostęp.")) return;
              void pokoj.zamknijNaZawsze();
            }}
          >
            Zamknij pokój
          </Button>
        </div>

        {pokoj.blad && (
          <p className="text-[12.5px] mt-2" style={{ color: "var(--danger)" }}>
            {pokoj.blad}
          </p>
        )}

        {rozdane && (
          <div className="mt-4 pt-3 border-t border-[var(--border)]">
            <div className="flex items-center justify-between">
              <div className="label-xs">Kto obejrzał kartę</div>
              <Badge color={widzieli.length === zKarta.length ? "var(--ok)" : "var(--warn)"}>
                {widzieli.length}/{zKarta.length}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {zKarta.map((g) => (
                <span
                  key={g.id}
                  className="text-[12.5px] px-2 py-1 rounded-[6px]"
                  style={{
                    background: "var(--surface-2)",
                    color: g.widzial === null ? "var(--text-faint)" : "var(--text)",
                  }}
                  title={g.widzial === null ? "Jeszcze nie zobaczył" : "Potwierdził"}
                >
                  {g.widzial !== null && "✓ "}
                  {g.nazwa}
                </span>
              ))}
            </div>
            <p className="mt-2 text-[12px] text-[var(--text-faint)] leading-relaxed">
              {widzieli.length === zKarta.length
                ? "Wszyscy znają swoje karty — można zaczynać noc zerową."
                : "Poczekaj, aż wszyscy potwierdzą, albo zapytaj brakujące osoby na głos."}
            </p>
          </div>
        )}

        <div className="mt-4">
          <div className="label-xs mb-1.5">
            Poczekalnia {pula.length > 0 && <span className="text-[var(--accent)]">({pula.length})</span>}
          </div>
          {pula.length === 0 ? (
            <Empty>
              {stan.gracze.length === 0
                ? "Nikt jeszcze nie dołączył."
                : "Wszyscy dołączeni siedzą już przy stole."}
            </Empty>
          ) : (
            <div className="flex flex-col gap-1">
              {pula.map((g) => (
                <div key={g.id} className="ui-row flex items-center gap-2">
                  {zmieniany === g.id ? (
                    <form
                      className="flex items-center gap-2 flex-1 min-w-0"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void pokoj.przemianuj(g.id, nowaNazwa);
                        setZmieniany(null);
                      }}
                    >
                      <input
                        className={cx(inputCls, "flex-1 min-w-0")}
                        value={nowaNazwa}
                        onChange={(e) => setNowaNazwa(e.target.value)}
                        maxLength={16}
                        autoFocus
                      />
                      <Button size="sm" type="submit">
                        Zapisz
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setZmieniany(null)}>
                        Anuluj
                      </Button>
                    </form>
                  ) : (
                    <>
                      <span className="text-[13px] font-medium truncate">{g.nazwa}</span>
                      <span className="text-[11.5px] text-[var(--text-faint)] shrink-0">
                        {new Date(g.dolaczyl).toLocaleTimeString("pl-PL", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <div className="ml-auto flex items-center gap-1.5 shrink-0">
                        <Button size="sm" variant="primary" onClick={() => onPosadz(g)}>
                          Posadź
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setZmieniany(g.id);
                            setNowaNazwa(g.nazwa);
                          }}
                        >
                          Zmień imię
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => void pokoj.wyrzuc(g.id)}>
                          Usuń
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="mt-2 text-[12px] text-[var(--text-faint)] leading-relaxed">
            Sadzanie dopisuje gracza na koniec listy przy stole. Kolejność zmienisz potem
            przeciąganiem — na liście albo wprost w kręgu rady.
          </p>
        </div>
      </Card>

      <SekcjaAsysty
        pokoj={pokoj}
        kodPokoju={stan.kod}
        nowyKod={nowyKodAsysty}
        setNowyKod={setNowyKodAsysty}
      />

      {pelnyEkran && <EkranKodu kod={stan.kod} zamknij={() => setPelnyEkran(false)} />}
    </>
  );
}


/**
 * Zapraszanie drugiego prowadzącego.
 *
 * Osobna karta, bo to zupełnie inna rzecz niż wpuszczanie graczy: kod z tej
 * karty daje wgląd we wszystkie karty w grze. Dlatego ma własny format i nie
 * pokazuje się obok kodu, który idzie na stół.
 */
function SekcjaAsysty({
  pokoj,
  kodPokoju,
  nowyKod,
  setNowyKod,
}: {
  pokoj: Pokoj;
  kodPokoju: string;
  nowyKod: string | null;
  setNowyKod: (k: string | null) => void;
}) {
  const stan = pokoj.stan;
  if (!stan) return null;

  const czekajace = stan.zaproszeniaAsysty.filter((z) => !z.zuzytePrzez);
  const link =
    nowyKod && typeof window !== "undefined"
      ? `${location.origin}/manitou/asysta/?p=${kodPokoju}&z=${nowyKod}`
      : null;

  const wystaw = async (poziom: PoziomAsysty) => {
    setNowyKod(await pokoj.zaproszenieAsysty(poziom));
  };

  return (
    <Card title="Drugi prowadzący">
      <p className="text-[12.5px] text-[var(--text-dim)] leading-relaxed">
        Zaproszenie daje wgląd we wszystkie karty, więc jest osobne od kodu gry i wymaga konta.
        Przy prawie zapisu każda zmiana asysty czeka na twoją zgodę tutaj.
      </p>

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <Button size="sm" variant="primary" onClick={() => void wystaw("zapis")}>
          Zaproś do pomocy
        </Button>
        <Button size="sm" onClick={() => void wystaw("odczyt")}>
          Zaproś do podglądu
        </Button>
      </div>

      {nowyKod && (
        <div className="mt-3 p-3 rounded-md border border-[var(--border)] bg-[var(--surface-2)]">
          <div className="label-xs mb-1">Kod zaproszenia — jednorazowy</div>
          <code className="font-mono tracking-[0.15em] text-[18px] font-semibold">{nowyKod}</code>
          {link && (
            <div className="mt-2">
              <Button
                size="sm"
                onClick={() => void navigator.clipboard?.writeText(link).catch(() => {})}
              >
                Skopiuj gotowy link
              </Button>
              <p className="mt-1.5 text-[11.5px] text-[var(--text-faint)] break-all">{link}</p>
            </div>
          )}
        </div>
      )}

      {stan.wspolprowadzacy.length > 0 && (
        <div className="mt-4">
          <div className="label-xs mb-1.5">Pomagają ci</div>
          <div className="flex flex-col gap-1">
            {stan.wspolprowadzacy.map((w) => (
              <div key={w.uzytkownik} className="ui-row flex items-center gap-2">
                <span className="text-[13px] font-medium">{w.nazwa}</span>
                <Badge color={w.poziom === "zapis" ? "var(--accent)" : undefined}>
                  {w.poziom === "zapis" ? "zmiany za zgodą" : "tylko podgląd"}
                </Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  onClick={() => void pokoj.odbierzAsyste(w.uzytkownik)}
                >
                  Odbierz dostęp
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {czekajace.length > 0 && (
        <p className="mt-3 text-[12px] text-[var(--text-faint)]">
          Niewykorzystane zaproszenia: {czekajace.length}. Każde działa raz i wygasa razem z grą.
        </p>
      )}
    </Card>
  );
}
