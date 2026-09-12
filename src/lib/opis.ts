import { GameState } from "./types";

/**
 * Co asystent właśnie zrobił, w słowach.
 *
 * Prośba przychodzi do głównego prowadzącego jako gotowy stan, więc opis
 * musimy wyprowadzić z różnicy. Dziennik gry nadaje się do tego wprost:
 * silnik dopisuje do niego każde zdarzenie, którego gracze się dowiedzą,
 * i część tych, o których wie tylko Manitou.
 *
 * Gdy dziennik milczy — bo zmiana go nie dotknęła — opisujemy różnicę
 * z grubsza, żeby zatwierdzający nigdy nie stał przed pustym pytaniem.
 */
export function opisZmiany(przed: GameState, po: GameState): string[] {
  const nowe = po.events.length - przed.events.length;
  if (nowe > 0) {
    // Dziennik trzyma najnowsze na początku, a czyta się go chronologicznie.
    return po.events.slice(0, nowe).reverse().map((e) => e.text);
  }

  const opisy: string[] = [];

  if (przed.stage !== po.stage) {
    const nazwy: Record<GameState["stage"], string> = {
      setup: "przygotowanie",
      night: "noc",
      day: "dzień",
      koniec: "koniec gry",
    };
    opisy.push(`Przejście do: ${nazwy[po.stage]}.`);
  }
  if (przed.night !== po.night) opisy.push(`Noc ${po.night}.`);
  if (przed.day !== po.day) opisy.push(`Dzień ${po.day}.`);
  if (przed.stepIndex !== po.stepIndex) opisy.push("Przejście do kolejnego kroku nocy.");

  const zmarli = po.players.filter(
    (p) => !p.alive && przed.players.find((x) => x.id === p.id)?.alive
  );
  for (const p of zmarli) opisy.push(`Śmierć: ${p.name}${p.deathNote ? ` — ${p.deathNote}` : ""}.`);

  const ozywieni = po.players.filter(
    (p) => p.alive && przed.players.find((x) => x.id === p.id)?.alive === false
  );
  for (const p of ozywieni) opisy.push(`Przywrócenie do gry: ${p.name}.`);

  if (przed.winner !== po.winner) {
    opisy.push(po.winner ? `Rozstrzygnięcie gry: ${po.winner}.` : "Cofnięcie rozstrzygnięcia gry.");
  }
  if (przed.idolHolder !== po.idolHolder) opisy.push("Zmiana posiadacza posążka.");

  // Ostatnia deska ratunku: lepiej powiedzieć „coś się zmieniło”, niż nic.
  return opisy.length > 0 ? opisy : ["Zmiana stanu gry bez wpisu w dzienniku."];
}
