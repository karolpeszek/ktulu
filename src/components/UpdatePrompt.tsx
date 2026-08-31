"use client";

import { useEffect, useState } from "react";
import { Button } from "./ui";

/** Co godzinę sprawdzamy, czy na hostingu nie ma nowszej wersji. */
const CHECK_INTERVAL = 60 * 60 * 1000;

export default function UpdatePrompt() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [offlineReady, setOfflineReady] = useState(false);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    let registration: ServiceWorkerRegistration | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;

    const track = (reg: ServiceWorkerRegistration) => {
      if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const next = reg.installing;
        if (!next) return;
        next.addEventListener("statechange", () => {
          if (next.state !== "installed") return;
          // Kontroler już istnieje → to podmiana, nie pierwsza instalacja.
          if (navigator.serviceWorker.controller) setWaiting(next);
          else setOfflineReady(true);
        });
      });
    };

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        registration = reg;
        track(reg);
        reg.update().catch(() => {});
        timer = setInterval(() => reg.update().catch(() => {}), CHECK_INTERVAL);
      })
      .catch(() => {
        /* brak service workera — aplikacja działa dalej, tylko bez offline */
      });

    // Po powrocie do karty warto od razu sprawdzić aktualizację.
    const onVisible = () => {
      if (document.visibilityState === "visible") registration?.update().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);

    // Nowy service worker przejął kontrolę — przeładuj, żeby wczytać nową wersję.
    let reloading = false;
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  useEffect(() => {
    if (!offlineReady) return;
    const t = setTimeout(() => setOfflineReady(false), 6000);
    return () => clearTimeout(t);
  }, [offlineReady]);

  if (!waiting && !offlineReady) return null;

  return (
    <div className="no-print fixed bottom-4 right-4 z-50 max-w-[360px] anim-fade-up">
      <div className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] shadow-lg px-4 py-3">
        {waiting ? (
          <>
            <div className="text-[13px] font-semibold">Dostępna nowa wersja</div>
            <p className="mt-1 text-[12.5px] text-[var(--text-dim)] leading-relaxed">
              Stan bieżącej rozgrywki jest zapisany i przetrwa odświeżenie. Jeśli akurat prowadzisz
              noc, możesz zaktualizować później.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  waiting.postMessage("SKIP_WAITING");
                  setWaiting(null);
                }}
              >
                Odśwież teraz
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setWaiting(null)}>
                Później
              </Button>
            </div>
          </>
        ) : (
          <div className="text-[12.5px]">
            <span className="font-semibold">Gotowe do gry offline.</span>{" "}
            <span className="text-[var(--text-dim)]">
              Aplikacja zadziała bez internetu — przydatne przy ognisku.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
