"use client";

/**
 * Pulpit drugiego prowadzącego.
 *
 * Widzi ten sam stan gry co główny Manitou i te same panele, ale każda jego
 * zmiana jest tylko prośbą — obowiązuje dopiero po zatwierdzeniu na urządzeniu,
 * które trzyma stan.
 */

import { useCallback, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useKonto } from "@/lib/konto";
import { DostawcaAsysty, useAsysta } from "@/lib/asystaStore";
import {
  dolaczJakoAsysta,
  kodAsystowanegoPokoju,
  subskrybujAsyste,
  zapamietajAsyste,
} from "@/lib/asysta";
import {
  DLUGOSC_KODU_ASYSTY,
  DLUGOSC_KODU_POKOJU,
  pogrupuj,
  rdzenKodu,
  sprawdzKodAsysty,
  sprawdzKodPokoju,
} from "@/lib/kody";
import { Badge, Button, Card, Empty, inputCls } from "@/components/ui";
import NightPanel from "@/components/NightPanel";
import DayPanel from "@/components/DayPanel";
import Roster from "@/components/Roster";
import EventLog from "@/components/EventLog";
import { StatusPanel } from "@/components/SidePanels";
import { usePrefs } from "@/lib/prefs";

const bezZmian = () => () => {};

function useParametry(): { pokoj: string; zaproszenie: string } {
  const surowe = useSyncExternalStore(
    bezZmian,
    () => location.search,
    () => ""
  );
  const p = new URLSearchParams(surowe);
  return { pokoj: p.get("p") ?? "", zaproszenie: p.get("z") ?? "" };
}

function Dolaczanie({ onWejscie }: { onWejscie: (kod: string) => void }) {
  const zLinku = useParametry();
  const [pokojWpisany, setPokoj] = useState<string | null>(null);
  const [zaprWpisane, setZapr] = useState<string | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [trwa, setTrwa] = useState(false);

  const pokoj = pokojWpisany ?? rdzenKodu(zLinku.pokoj).slice(0, DLUGOSC_KODU_POKOJU);
  const zaproszenie =
    zaprWpisane ?? pogrupuj(rdzenKodu(zLinku.zaproszenie).slice(0, DLUGOSC_KODU_ASYSTY), 4);

  const sprPokoj = sprawdzKodPokoju(pokoj);
  const sprZapr = sprawdzKodAsysty(zaproszenie);
  const gotowe = sprPokoj.ok && sprZapr.ok;

  const dolacz = async () => {
    if (!sprPokoj.ok || !sprZapr.ok) return;
    setTrwa(true);
    setBlad(null);
    try {
      await dolaczJakoAsysta(sprPokoj.kod, sprZapr.kod);
      zapamietajAsyste(sprPokoj.kod);
      onWejscie(sprPokoj.kod);
    } catch (e) {
      setBlad((e as Error).message);
    } finally {
      setTrwa(false);
    }
  };

  return (
    <Card title="Dołącz jako drugi prowadzący">
      <p className="text-[12.5px] text-[var(--text-dim)] leading-relaxed">
        Potrzebujesz dwóch rzeczy od głównego prowadzącego: kodu gry i osobnego kodu zaproszenia.
        Zaproszenie daje wgląd we wszystkie karty, więc jest inne niż kod, który dostają gracze.
      </p>

      <div className="label-xs mt-3 mb-1.5">Kod gry (4 znaki)</div>
      <input
        className={inputCls}
        value={pokoj}
        onChange={(e) => setPokoj(rdzenKodu(e.target.value).slice(0, DLUGOSC_KODU_POKOJU))}
        placeholder="XXXX"
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
      />

      <div className="label-xs mt-3 mb-1.5">Kod zaproszenia (8 znaków)</div>
      <input
        className={inputCls}
        value={zaproszenie}
        onChange={(e) =>
          setZapr(pogrupuj(rdzenKodu(e.target.value).slice(0, DLUGOSC_KODU_ASYSTY), 4))
        }
        placeholder="XXXX-XXXX"
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
      />

      <Button
        variant="primary"
        className="w-full justify-center mt-4"
        disabled={!gotowe || trwa}
        onClick={() => void dolacz()}
      >
        {trwa ? "Dołączam…" : "Dołącz do gry"}
      </Button>

      {blad && (
        <p className="text-[12.5px] mt-3" style={{ color: "var(--danger)" }}>
          {blad}
        </p>
      )}
    </Card>
  );
}

function Pulpit({ kod, wyjdz }: { kod: string; wyjdz: () => void }) {
  const { ctx, info, anuluj } = useAsysta(kod);
  const { safeMode } = usePrefs();

  if (!info.gotowe) {
    return <Card title="Asysta">Wczytywanie stanu gry…</Card>;
  }
  if (info.poziom === null) {
    return (
      <Card title="Asysta">
        <Empty>Nie masz już dostępu do tej gry.</Empty>
        <Button className="mt-3" onClick={wyjdz}>
          Wpisz inny kod
        </Button>
      </Card>
    );
  }
  if (!info.migawka?.stan) {
    return (
      <Card title="Asysta">
        <Empty>
          Prowadzący nie udostępnił jeszcze stanu gry. Ekran odświeży się sam, gdy to zrobi.
        </Empty>
      </Card>
    );
  }

  const tylkoPodglad = info.poziom === "odczyt";

  return (
    <DostawcaAsysty ctx={ctx}>
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-4 items-start">
        <div className="flex flex-col gap-4 min-w-0">
          <Card
            accent={tylkoPodglad ? "var(--text-dim)" : "var(--accent)"}
            title={tylkoPodglad ? "Podgląd gry" : "Asysta prowadzącego"}
            right={
              <Badge color={tylkoPodglad ? undefined : "var(--accent)"}>
                {tylkoPodglad ? "tylko odczyt" : "zmiany za zgodą"}
              </Badge>
            }
          >
            <p className="text-[12.5px] text-[var(--text-dim)] leading-relaxed">
              {tylkoPodglad
                ? "Widzisz przebieg gry, ale niczego nie zmieniasz. Stan pochodzi z urządzenia prowadzącego."
                : "Każda twoja akcja trafia do prowadzącego jako prośba i zaczyna obowiązywać dopiero po jego zatwierdzeniu."}
            </p>

            {info.wyslana && (
              <div className="mt-3 p-3 rounded-md border border-[var(--warn)]/40 bg-[var(--warn-soft)]">
                <div className="label-xs mb-1">Czeka na zgodę prowadzącego</div>
                <ul className="flex flex-col gap-0.5">
                  {info.wyslana.opis.map((l, i) => (
                    <li key={i} className="text-[13px]">
                      {l}
                    </li>
                  ))}
                </ul>
                <Button size="sm" className="mt-2" onClick={anuluj}>
                  Wróć do bieżącego stanu
                </Button>
              </div>
            )}

            {info.blad && (
              <p className="text-[12.5px] mt-2" style={{ color: "var(--danger)" }}>
                {info.blad}
              </p>
            )}
          </Card>

          {/* Panele rozgrywki nie wiedzą, że działają na cudzym stanie —
              dostają ten sam kontekst co u głównego prowadzącego. */}
          {ctx.state.stage === "night" && <NightPanel />}
          {ctx.state.stage === "day" && <DayPanel />}
          {ctx.state.stage === "setup" && (
            <Card title="Przygotowanie">
              <Empty>Gra jeszcze się nie zaczęła. Prowadzący rozstawia stół.</Empty>
            </Card>
          )}
          {ctx.state.stage === "koniec" && (
            <Card title="Koniec gry">
              <p className="text-[13px]">{ctx.state.winReason}</p>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-4 xl:sticky xl:top-16">
          <StatusPanel />
          <Card title="Skład rady">
            <Roster state={ctx.state} hideRoles={safeMode} />
          </Card>
          <Card title="Dziennik">
            <EventLog state={ctx.state} />
          </Card>
          <div className="text-center">
            <button type="button" onClick={wyjdz} className="text-[12px] underline text-[var(--text-faint)]">
              Odłącz się od tej gry
            </button>
          </div>
        </div>
      </div>
    </DostawcaAsysty>
  );
}

export default function StronaAsysty() {
  const { uzytkownik } = useKonto();
  const kod = useSyncExternalStore(subskrybujAsyste, kodAsystowanegoPokoju, () => null);
  const wyjdz = useCallback(() => zapamietajAsyste(null), []);

  if (!uzytkownik) {
    return (
      <Card title="Asysta wymaga konta">
        <p className="text-[12.5px] text-[var(--text-dim)] leading-relaxed">
          Drugi prowadzący musi mieć własne konto — prośby o zmianę są podpisane jego nazwą, żeby
          główny Manitou wiedział, komu przyznaje zgodę.
        </p>
        <Link href="/manitou/logowanie">
          <Button variant="primary" className="mt-3">
            Zaloguj się
          </Button>
        </Link>
      </Card>
    );
  }

  return (
    <div className="max-w-[1200px]">
      {kod ? <Pulpit kod={kod} wyjdz={wyjdz} /> : <Dolaczanie onWejscie={zapamietajAsyste} />}
    </div>
  );
}
