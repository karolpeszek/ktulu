import { GameState } from "./types";
import { emptyState } from "./engine";
import { syncRecommended } from "./setup";

/**
 * Nowa rozgrywka bez rozstawiania stołu od nowa.
 *
 * Zostają ludzie, ich kolejność i ustawienia zasad dobrane pod ten stół —
 * znika wszystko, co dotyczy zakończonej partii. Identyfikatory graczy też
 * zostają, bo w grze z lobby są zarazem identyfikatorami w pokoju: dzięki
 * temu telefony nie muszą dołączać jeszcze raz.
 */
export function zachowajSklad(s: GameState): void {
  const sklad = s.players.map((p) => ({
    id: p.id,
    name: p.name,
    seat: p.seat,
    roleId: null,
    alive: true,
  }));
  const ustawienia = { ...s.settings };
  const czysty = emptyState();

  Object.assign(s, czysty, {
    players: sklad,
    settings: ustawienia,
    setup: {
      ...czysty.setup,
      withJanosik: s.setup.withJanosik,
      manualCounts: s.setup.manualCounts,
      manualSettings: s.setup.manualSettings,
      autofill: s.setup.autofill,
    },
  });
  syncRecommended(s);
}
