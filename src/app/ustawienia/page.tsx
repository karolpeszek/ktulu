"use client";

import { Handedness, Theme, usePrefs } from "@/lib/prefs";
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
  const { theme, setTheme, handedness, setHandedness, tipSide } = usePrefs();

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
          title="Ręka trzymająca rysik"
          desc="Podpowiedzi wychodzą na stronę przeciwną do trzymanej ręki, żeby dłoń ich nie zasłaniała. Dotyczy podpowiedzi o graczach, krokach nocy i rolach."
        >
          <div className="flex flex-col gap-2">
            <Segmented<Handedness>
              label="Ręka"
              value={handedness}
              onChange={setHandedness}
              options={[
                { value: "right", label: "Praworęczny" },
                { value: "left", label: "Leworęczny" },
              ]}
            />
            <p className="text-[12px] text-[var(--text-faint)]">
              Podpowiedzi pojawiają się{" "}
              <strong className="text-[var(--text-dim)]">
                {tipSide === "left" ? "po lewej" : "po prawej"}
              </strong>{" "}
              stronie kursora.
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
            <strong className="text-[var(--text)]">Tryb bezpieczny</strong>, który ukrywa karty przed
            zaglądającymi przez ramię, jest w panelu rozgrywki, bo włącza się go w jej trakcie.
          </li>
        </ul>
      </Card>
    </div>
  );
}
