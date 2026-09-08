/**
 * Nazwa aliasu adresu podglądu, wyprowadzona z gałęzi.
 *
 * Cloudflare przyjmuje w aliasie wyłącznie małe litery, cyfry i myślniki,
 * a alias razem z nazwą Workera musi zmieścić się w 63 znakach. Surowa nazwa
 * gałęzi tego nie spełnia — `feat/lobby` ma ukośnik i jest odrzucana, przez co
 * build kończy się bez adresu do otwarcia.
 *
 * Uruchomienie: node scripts/alias-podgladu.mjs
 * Używane w komendzie wdrożenia dla gałęzi nieprodukcyjnych.
 */

/** Nazwa Workera zajmuje początek nazwy hosta: `<alias>-<worker>.<subdomena>`. */
const NAZWA_WORKERA = "ktulu";
const LIMIT = 63 - NAZWA_WORKERA.length - 1;

export function aliasZGalezi(galaz) {
  const oczyszczona = (galaz ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  // Pusta nazwa albo same znaki spoza alfabetu — lepszy stały adres niż żaden.
  // Sprawdzane przed dodaniem litery, bo inaczej sam przedrostek udawałby alias.
  if (!oczyszczona) return "podglad";

  // Alias musi zaczynać się literą, a gałąź w rodzaju „2fix” zaczyna się cyfrą.
  const zLitera = /^[a-z]/.test(oczyszczona) ? oczyszczona : `g-${oczyszczona}`;
  return zLitera.slice(0, LIMIT).replace(/-+$/, "");
}

// Uruchomione wprost wypisuje alias dla bieżącej gałęzi w Workers Builds.
if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(aliasZGalezi(process.env.WORKERS_CI_BRANCH));
}
