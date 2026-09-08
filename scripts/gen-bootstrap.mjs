/**
 * Generuje kod bootstrapowy dla pierwszego konta administratora.
 *
 * Kod trafia w postaci jawnej wyłącznie do logu builda — do bundla idzie sam
 * skrót SHA-256, więc kod nie da się odczytać z wdrożonego Workera. Działa
 * tylko dopóki nie istnieje ani jedno konto, więc po pierwszej rejestracji
 * mechanizm sam wygasa, niezależnie od kolejnych buildów.
 *
 * Bez `--force` plik powstaje tylko wtedy, gdy go nie ma. Dzięki temu
 * `pnpm run verify` może go wygenerować na potrzeby sprawdzania typów, nie
 * zmieniając kodu, który za chwilę wejdzie do builda.
 *
 * Uruchomienie: node scripts/gen-bootstrap.mjs [--force]
 */
import { createHash, randomInt } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";

const PLIK = "worker/bootstrap.generated.ts";
const ALFABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const force = process.argv.includes("--force");

if (existsSync(PLIK) && !force) {
  console.log("gen-bootstrap: plik istnieje, zostawiam bez zmian (użyj --force, aby przelosować)");
  process.exit(0);
}

let znaki = "";
for (let i = 0; i < 12; i++) znaki += ALFABET[randomInt(ALFABET.length)];
const kod = znaki.match(/.{1,4}/g).join("-");
const hash = createHash("sha256").update(znaki).digest("hex");

writeFileSync(
  PLIK,
  `// Wygenerowane przez scripts/gen-bootstrap.mjs — nie edytuj i nie commituj.
// Jawny kod pojawia się wyłącznie w logu builda; tutaj jest tylko jego skrót.
export const HASH_BOOTSTRAPU = ${JSON.stringify(hash)};
`
);

/** Wyśrodkowanie liczone z długości tekstu — odstępy na sztywno się rozjeżdżają. */
const naglowek = "KOD REJESTRACYJNY PIERWSZEGO ADMINISTRATORA";
const szerokosc = naglowek.length + 4;
const srodek = (tekst) => {
  const luz = szerokosc - tekst.length;
  const lewo = Math.floor(luz / 2);
  return " ".repeat(lewo) + tekst + " ".repeat(luz - lewo);
};
const kreska = "─".repeat(szerokosc);

console.log("");
console.log(`  ┌${kreska}┐`);
console.log(`  │${srodek(naglowek)}│`);
console.log(`  ├${kreska}┤`);
console.log(`  │${srodek(kod)}│`);
console.log(`  └${kreska}┘`);
console.log("");
console.log("  Wpisz go na /manitou/rejestracja, żeby założyć konto admina.");
console.log("  Działa tylko dopóki nie istnieje żadne konto i zmienia się przy każdym buildzie.");
console.log("");
