"use client";

/**
 * Ramka pulpitu Manitou.
 *
 * Wejście wymaga konta albo jawnego wyboru pracy bez niego. Bramka jest
 * miękka celowo: aplikacja ma działać przy ognisku bez zasięgu, więc brak
 * sesji nie może odciąć od gry — ale wybór trybu lokalnego musi być świadomy.
 */

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { useKonto } from "@/lib/konto";

/** Ekrany, na które trzeba wejść właśnie po to, żeby zdobyć dostęp. */
const OTWARTE = ["/manitou/logowanie", "/manitou/rejestracja"];

export default function ManitouLayout({ children }: { children: React.ReactNode }) {
  const { uzytkownik, polaczenie, trybLokalny } = useKonto();
  const sciezka = usePathname();
  const router = useRouter();

  const otwarte = OTWARTE.some((p) => sciezka.startsWith(p));
  const wolno = otwarte || !!uzytkownik || trybLokalny;
  const sprawdzanie = polaczenie === "sprawdzanie";

  useEffect(() => {
    if (!sprawdzanie && !wolno) router.replace("/manitou/logowanie");
  }, [sprawdzanie, wolno, router]);

  if (sprawdzanie) {
    return (
      <div className="min-h-screen grid place-items-center text-[13px] text-[var(--text-dim)]">
        Sprawdzanie konta…
      </div>
    );
  }
  // Przekierowanie już leci — nie migamy zawartością pulpitu.
  if (!wolno) return null;

  return <AppShell>{children}</AppShell>;
}
