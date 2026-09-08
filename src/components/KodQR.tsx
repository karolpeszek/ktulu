"use client";

/**
 * Kod QR rysowany jako SVG.
 *
 * Biblioteka jest wbudowana w paczkę zamiast pobierana z zewnętrznego serwisu:
 * kod pokoju nie ma powodu opuszczać naszej infrastruktury, a ekran działa
 * wtedy również wtedy, gdy sieć ledwo zipie.
 */

import { useMemo } from "react";
import qrcode from "qrcode-generator";

export default function KodQR({
  tresc,
  opis,
  className,
}: {
  tresc: string;
  opis?: string;
  /**
   * Rozmiar ustala kontener, nie komponent — kod ma wypełniać przydzieloną
   * powierzchnię, a ta zależy od wielkości ekranu, na którym się go pokazuje.
   */
  className?: string;
}) {
  const { sciezka, bok } = useMemo(() => {
    // Typ 0 dobiera najmniejszą wersję mieszczącą treść; korekcja „M” znosi
    // odbicia i cienie na ekranie trzymanym przed dwudziestoma telefonami.
    const kod = qrcode(0, "M");
    kod.addData(tresc);
    kod.make();
    const n = kod.getModuleCount();
    const kawalki: string[] = [];
    for (let y = 0; y < n; y += 1) {
      for (let x = 0; x < n; x += 1) {
        if (kod.isDark(y, x)) kawalki.push(`M${x} ${y}h1v1h-1z`);
      }
    }
    return { sciezka: kawalki.join(""), bok: n };
  }, [tresc]);

  // Cicha strefa: cztery moduły z każdej strony, inaczej czytniki gubią kod.
  const margines = 4;
  const cale = bok + margines * 2;

  return (
    <svg
      className={className}
      width="100%"
      height="100%"
      viewBox={`0 0 ${cale} ${cale}`}
      role="img"
      aria-label={opis ?? "Kod QR"}
      shapeRendering="crispEdges"
    >
      {/* Tło zawsze białe — czytniki źle znoszą ciemny motyw. */}
      <rect width={cale} height={cale} fill="#ffffff" rx={1} />
      <g transform={`translate(${margines} ${margines})`} fill="#000000">
        <path d={sciezka} />
      </g>
    </svg>
  );
}
