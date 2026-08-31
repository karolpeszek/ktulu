"use client";

import { useState } from "react";
import { GameState } from "@/lib/types";
import { Button, cx } from "./ui";

export default function EventLog({ state }: { state: GameState }) {
  const [showSecret, setShowSecret] = useState(true);
  const events = state.events.filter((e) => showSecret || !e.secret);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button size="sm" variant={showSecret ? "primary" : "default"} onClick={() => setShowSecret(true)}>
          Wszystko
        </Button>
        <Button size="sm" variant={!showSecret ? "primary" : "default"} onClick={() => setShowSecret(false)}>
          Tylko jawne
        </Button>
      </div>
      <div className="max-h-[340px] overflow-y-auto flex flex-col gap-1 pr-1">
        {events.length === 0 && (
          <p className="text-[12px] text-[var(--text-faint)] py-3">Jeszcze nic się nie wydarzyło.</p>
        )}
        {events.map((e) => (
          <div
            key={e.id}
            className={cx(
              "text-[12px] leading-snug px-2 py-1.5 rounded border-l-2",
              e.secret
                ? "border-l-[var(--border-strong)] bg-[var(--surface-2)]"
                : "border-l-[var(--accent)] bg-[var(--surface-2)]"
            )}
          >
            <span className="label-xs mr-1.5">{e.phase}</span>
            <span>{e.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
