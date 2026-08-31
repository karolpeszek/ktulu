"use client";

import { useEffect } from "react";
import { Button } from "./ui";

/** Janosik zamachał ciupagą — wszyscy się cieszą. */
export default function JoyOverlay({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 6000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/55 backdrop-blur-[2px] p-6"
      onClick={onClose}
    >
      <div className="anim-joy bg-[var(--surface)] border border-[var(--border)] rounded-xl px-10 py-8 text-center max-w-md shadow-2xl">
        <div className="text-[56px] leading-none mb-3">🪓</div>
        <h2 className="text-[22px] font-semibold tracking-tight">Janosik zamachał ciupagą</h2>
        <p className="mt-2 text-[14px] text-[var(--text-dim)] leading-relaxed">
          Wszyscy się cieszą. Nie ma to żadnego wpływu na warunki zwycięstwa — ale i tak wszyscy się
          cieszą.
        </p>
        <div className="mt-5 flex justify-center gap-2 text-[24px]">
          <span>🎉</span>
          <span>🏔️</span>
          <span>🎉</span>
        </div>
        <Button className="mt-6" variant="primary" onClick={onClose}>
          Radość zakończona
        </Button>
      </div>
    </div>
  );
}
