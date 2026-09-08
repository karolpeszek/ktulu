"use client";

import { Density, Handedness, Theme, usePrefs } from "@/lib/prefs";
import { Card, cx } from "@/components/ui";

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div
      className="flex items-center rounded-md border border-[var(--border-strong)] overflow-hidden h-9 self-start"
      role="group"
      aria-label={label}
    >
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          title={o.hint}
          className={cx(
            "px-3.5 h-full text-[13px] font-medium transition-colors border-r border-[var(--border-strong)] last:border-r-0",
            value === o.value
              ? "bg-[var(--accent)] text-[var(--accent-text)]"
              : "text-[var(--text-dim)] hover:bg-[var(--surface-2)]"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Row({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-start gap-3 py-4 border-b border-[var(--border)] last:border-b-0 last:pb-0 first:pt-0">
      <div className="md:w-[320px] shrink-0">
        <div className="text-[13px] font-medium">{title}</div>
        <p className="mt-1 text-[12px] text-[var(--text-dim)] leading-relaxed">{desc}</p>
      </div>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const { theme, setTheme, handedness, setHandedness, tipSide, density, setDensity } = usePrefs();

  return (
    <div className="flex flex-col gap-4 max-w-[900px]">
      <Card title="Wygląd">
        <Row
          title="Motyw"
          desc="„Auto” idzie za ustawieniem systemu. Wymuszenie przydaje się, gdy gracie przy jednym urządzeniu w ciemnym pokoju, a system przełącza się sam o świcie."
        >
          <Segmented<Theme>
            label="Motyw"
            value={theme}
            onChange={setTheme}
            options={[
              { value: "system", label: "Auto", hint: "Za ustawieniem systemu" },
              { value: "light", label: "Jasny" },
              { value: "dark", label: "Ciemny" },
            ]}
          />
        </Row>

        <Row
          title="Rozmiar elementów"
          desc="„Dotyk” powiększa wszystko, w co się celuje: przyciski, przełączniki, pola, wiersze list i żetony w kręgu rady. Sterowanie wierszami, które normalnie pokazuje się po najechaniu, jest wtedy widoczne od razu — na ekranie dotykowym nie ma najeżdżania."
        >
          <Segmented<Density>
            label="Rozmiar elementów"
            value={density}
            onChange={setDensity}
            options={[
              { value: "normal", label: "Zwykły", hint: "Mysz albo rysik" },
              { value: "touch", label: "Dotyk", hint: "Palec, bez rysika" },
            ]}
          />
        </Row>

        <Row
          title="Ręka trzymająca rysik"
          desc="Podpowiedzi pojawiają się obok wskazanego elementu, po stronie przeciwnej do trzymanej ręki, żeby dłoń ich nie zasłaniała. Gdy po tej stronie brakuje miejsca, dymek przechodzi na drugą, a przy samej krawędzi ekranu — pod element."
        >
          <div className="flex flex-col gap-2">
            <Segmented<Handedness>
              label="Ręka"
              value={handedness}
              onChange={setHandedness}
              // Układ przycisków odpowiada stronie: lewy = leworęczny.
              options={[
                { value: "left", label: "Leworęczny" },
                { value: "right", label: "Praworęczny" },
              ]}
            />
            <p className="text-[12px] text-[var(--text-faint)]">
              Podpowiedzi pojawiają się{" "}
              <strong className="text-[var(--text-dim)]">
                {tipSide === "left" ? "po lewej" : "po prawej"}
              </strong>{" "}
              stronie wskazanego elementu.
            </p>
          </div>
        </Row>
      </Card>

      <Card title="Gdzie co siedzi">
        <ul className="flex flex-col gap-2 text-[12.5px] text-[var(--text-dim)] leading-relaxed">
          <li>
            <strong className="text-[var(--text)]">Ustawienia wyglądu</strong> zapisują się w tej
            przeglądarce i dotyczą osoby prowadzącej — nie są częścią rozgrywki i nie zerują się przy
            rozpoczęciu nowej gry.
          </li>
          <li>
            <strong className="text-[var(--text)]">Zasady gry</strong> — liczba przeszukiwanych, noc
            odpłynięcia statku, limit pojedynków, czy bandyci mogą zabijać — siedzą w przygotowaniu
            rozgrywki, bo zmieniają się z każdą partią.
          </li>
          <li>
            <strong className="text-[var(--text)]">Tryb bezpieczny</strong> włącza się w panelu
            rozgrywki, bo sięga się po niego w jej trakcie. Ukrywa karty wszędzie — na liście,
            w kręgu rady i w podpowiedziach — i przeżywa odświeżenie strony, żeby przypadkiem
            nie odsłonić kart przy przeładowaniu.
          </li>
        </ul>
      </Card>
    </div>
  );
}
