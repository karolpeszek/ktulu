/**
 * Rozróżnianie dotknięcia od przewinięcia. Palcem po liście się przewija, więc
 * samo położenie palca na elemencie nie może uchodzić za wybór — liczy się to,
 * czy palec ruszył, zanim go podniesiono.
 */

/** Ile pikseli wolno drgnąć palcowi, żeby gest nadal był dotknięciem. */
export const TAP_SLOP = 10;

export interface Punkt {
  x: number;
  y: number;
}

export function isTap(start: Punkt, end: Punkt, slop: number = TAP_SLOP): boolean {
  return Math.hypot(end.x - start.x, end.y - start.y) <= slop;
}
