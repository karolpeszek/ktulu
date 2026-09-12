import { FACTIONS, GameState, Faction } from "./types";
import { ROLE_BY_ID } from "./roles";

/**
 * Frakcje, których członkowie poznają się nawzajem.
 *
 * Xięga stawia sprawę wprost w „Początku gry”: zerowej nocy „poznają się
 * członkowie poszczególnych frakcji (oprócz miasta)”. Dlatego reguła jest
 * tu wyrażona przez wykluczenie, a nie wyliczenie — nowa frakcja obejmie ją
 * sama, a miasto nigdy, bo na jego niewiedzy stoi cała gra.
 *
 * Janosik jest sam w swojej frakcji, więc lista i tak wychodzi mu pusta.
 */
export const FRAKCJE_Z_ROZPOZNANIEM: Faction[] = FACTIONS.filter((f) => f !== "miasto");

/**
 * Kto jeszcze gra w tej samej drużynie, z punktu widzenia jednej osoby.
 *
 * Lista trafia na kartę wyświetlaną na telefonie, więc nigdy nie zawiera
 * samego zainteresowanego i jest pusta wszędzie tam, gdzie frakcja nie
 * poznaje się nawzajem — miasto ma się nie rozpoznawać, bo na tym stoi gra.
 */
export function wspolnicyDla(s: GameState, idGracza: string): string[] {
  if (!s.settings.wspolnicyNaKarcie) return [];

  const ja = s.players.find((p) => p.id === idGracza);
  const mojaRola = ja?.roleId ? ROLE_BY_ID[ja.roleId] : null;
  if (!mojaRola || !FRAKCJE_Z_ROZPOZNANIEM.includes(mojaRola.faction)) return [];

  return [...s.players]
    .sort((a, b) => a.seat - b.seat)
    .filter((p) => {
      if (p.id === idGracza) return false;
      const rola = p.roleId ? ROLE_BY_ID[p.roleId] : null;
      return rola?.faction === mojaRola.faction;
    })
    .map((p) => p.name);
}
