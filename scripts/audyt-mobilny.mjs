/**
 * Audyt szerokości pulpitu na małym ekranie.
 *
 * Sterowanie prawdziwym Chrome przez protokół DevTools: skrypt wchodzi na
 * każdy ekran przy szerokości telefonu i mierzy, czy cokolwiek wystaje poza
 * okno. Zamiast samej diagnozy wypisuje konkretne elementy — i zapisuje
 * zrzuty, bo brak przepełnienia to jeszcze nie czytelny układ.
 *
 * Stan gry wstrzykiwany jest do pamięci przeglądarki, więc ekrany mają
 * prawdziwą zawartość: czternastu graczy z rozdanymi kartami.
 *
 * Uruchomienie:
 *   pnpm run build:only
 *   pnpm exec wrangler dev --port 8800 --var RP_ID:localhost
 *   pnpm run audyt:mobilny
 *
 * Wymaga zainstalowanego Chrome. Nie wchodzi do bramki wdrożenia, bo zależy
 * od przeglądarki i uruchomionego serwera.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";


const SCIEZKI_CHROME = [
  process.env.CHROME,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

const CHROME = SCIEZKI_CHROME.find((p) => existsSync(p));
if (!CHROME) {
  console.error("Nie znalazłem Chrome. Wskaż go zmienną CHROME=/ścieżka/do/chrome");
  process.exit(2);
}
const BAZA = process.env.BAZA ?? "http://localhost:8800";
const KATALOG = process.argv[2] ?? process.env.KATALOG ?? "./zrzuty-mobilne";


import { emptyState } from "../src/lib/engine.ts";
import { firstIndex } from "../src/lib/resolve.ts";
import { buildPool, shuffle, suggestedCounts, syncRecommended } from "../src/lib/setup.ts";
import { BOOK_FACTIONS } from "../src/lib/types.ts";

/** Stół z czternastoma graczami i rozdanymi kartami — typowa rozgrywka. */
const IMIONA = ["Kasia","Marek","Zosia","Bartek","Ula","Wojtek","Hania","Michał","Ola","Kuba","Basia","Antek","Iga","Staszek"];

function stanGry(etap) {
  const s = emptyState();
  s.players = IMIONA.map((n, i) => ({ id: `p${i}`, name: n, seat: i, roleId: null, alive: true }));
  syncRecommended(s);
  const counts = suggestedCounts(s.players.length, false);
  const pula = shuffle(BOOK_FACTIONS.flatMap((f) => buildPool(f, counts[f], [], true)));
  s.players.forEach((p, i) => (p.roleId = pula[i] ?? null));
  s.setup.counts = counts;
  s.setup.manualCounts = true;
  if (etap === "night") {
    s.stage = "night";
    s.night = 0;
    s.stepIndex = firstIndex(s);
  }
  return s;
}

const STANY = { setup: stanGry("setup"), night: stanGry("night") };

const EKRANY = [
  ["/", "gracz", null],
  ["/demo/", "pokaz", null],
  ["/manitou/logowanie/", "logowanie", null],
  ["/manitou/", "przygotowanie", "setup"],
  ["/manitou/gra/", "rozgrywka", "night"],
  ["/manitou/karty/", "karteczki", "setup"],
  ["/manitou/ustawienia/", "ustawienia", "setup"],
  ["/manitou/zasady/", "zasady", "setup"],
  ["/manitou/asysta/", "asysta", "setup"],
];

const ROZMIARY = [
  { nazwa: "360x640", w: 360, h: 640 },
  { nazwa: "390x844", w: 390, h: 844 },
];

mkdirSync(KATALOG, { recursive: true });

const chrome = spawn(CHROME, [
  "--headless=new",
  "--remote-debugging-port=9333",
  "--no-first-run",
  "--no-default-browser-check",
  `--user-data-dir=/tmp/ktulu-audyt-${Date.now()}`,
  "--hide-scrollbars",
  "about:blank",
], { stdio: "ignore" });

const czekaj = (ms) => new Promise((r) => setTimeout(r, ms));

async function celDebugowania() {
  for (let i = 0; i < 40; i++) {
    try {
      const lista = await (await fetch("http://127.0.0.1:9333/json/list")).json();
      const strona = lista.find((t) => t.type === "page");
      if (strona?.webSocketDebuggerUrl) return strona.webSocketDebuggerUrl;
    } catch {
      /* jeszcze nie wstał */
    }
    await czekaj(250);
  }
  throw new Error("Chrome nie wystawił protokołu debugowania");
}

const url = await celDebugowania();
const ws = new WebSocket(url);
await new Promise((res, rej) => {
  ws.addEventListener("open", res);
  ws.addEventListener("error", () => rej(new Error("brak połączenia z Chrome")));
});

let licznik = 0;
const oczekujace = new Map();
ws.addEventListener("message", (e) => {
  const w = JSON.parse(e.data);
  if (w.id && oczekujace.has(w.id)) {
    oczekujace.get(w.id)(w);
    oczekujace.delete(w.id);
  }
});

function wyslij(method, params = {}) {
  const id = ++licznik;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res) => oczekujace.set(id, res));
}

async function ocen(wyrazenie) {
  const w = await wyslij("Runtime.evaluate", {
    expression: wyrazenie,
    returnByValue: true,
    awaitPromise: true,
  });
  if (w.result?.exceptionDetails) throw new Error(JSON.stringify(w.result.exceptionDetails));
  return w.result?.result?.value;
}

/** Elementy wystające poza prawą krawędź — z nazwą, klasą i o ile wystają. */
const POMIAR = `(() => {
  const w = document.documentElement.clientWidth;
  const winni = [];
  for (const el of document.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const nadmiar = Math.round(r.right - w);
    if (nadmiar <= 1) continue;
    // Element w kontenerze z przewijaniem jest przycinany, więc nie powiększa
    // strony — liczy się tylko to, co wystaje naprawdę.
    let wPrzewijalnym = false;
    for (let a = el.parentElement; a; a = a.parentElement) {
      const o = getComputedStyle(a).overflowX;
      if (o === "auto" || o === "scroll" || o === "hidden") { wPrzewijalnym = true; break; }
    }
    if (!wPrzewijalnym) {
      winni.push({
        tag: el.tagName.toLowerCase(),
        klasa: (el.className && typeof el.className === "string" ? el.className : "").slice(0, 90),
        tekst: (el.textContent || "").trim().slice(0, 40),
        nadmiar,
        szerokosc: Math.round(r.width),
      });
    }
  }
  winni.sort((a, b) => b.nadmiar - a.nadmiar);
  return {
    okno: w,
    przewijanie: document.documentElement.scrollWidth,
    nadmiarStrony: document.documentElement.scrollWidth - w,
    winni: winni.slice(0, 8),
  };
})()`;

await wyslij("Page.enable");
await wyslij("Runtime.enable");
await wyslij("Network.enable");
// Bez tego mierzylibyśmy to, co service worker zapamiętał przy poprzednim
// buildzie — czyli nie tę wersję, którą właśnie sprawdzamy.
await wyslij("Network.setBypassServiceWorker", { bypass: true });
await wyslij("Network.setCacheDisabled", { cacheDisabled: true });

const raport = [];

for (const rozmiar of ROZMIARY) {
  await wyslij("Emulation.setDeviceMetricsOverride", {
    width: rozmiar.w,
    height: rozmiar.h,
    deviceScaleFactor: 2,
    mobile: true,
  });

  for (const [sciezka, nazwa, stan] of EKRANY) {
    // Stan ustawiamy na właściwym origin, więc najpierw wchodzimy na stronę.
    await wyslij("Page.navigate", { url: BAZA + sciezka });
    await czekaj(500);
    await ocen(`(() => {
      try {
        localStorage.setItem("ktulu.tryb.lokalny", "1");
        ${stan ? `localStorage.setItem("ktulu.game.v1", ${JSON.stringify(JSON.stringify(STANY[stan]))});` : ""}
      } catch (e) {}
      return true;
    })()`);
    await wyslij("Page.navigate", { url: BAZA + sciezka });
    await czekaj(1400);

    const wynik = await ocen(POMIAR);
    raport.push({ ekran: nazwa, sciezka, rozmiar: rozmiar.nazwa, ...wynik });

    const zrzut = await wyslij("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    if (zrzut.result?.data) {
      writeFileSync(`${KATALOG}/${nazwa}-${rozmiar.nazwa}.png`, Buffer.from(zrzut.result.data, "base64"));
    }
  }
}

writeFileSync(`${KATALOG}/raport.json`, JSON.stringify(raport, null, 2));

let zle = 0;
for (const r of raport) {
  if (r.nadmiarStrony > 1) {
    zle++;
    console.log(`\n✘ ${r.ekran} @ ${r.rozmiar} — strona szersza o ${r.nadmiarStrony}px (okno ${r.okno})`);
    for (const el of r.winni) {
      console.log(`    +${el.nadmiar}px  <${el.tag}> szer.${el.szerokosc}  „${el.tekst}"`);
      if (el.klasa) console.log(`              ${el.klasa}`);
    }
  } else {
    console.log(`✔ ${r.ekran} @ ${r.rozmiar}`);
  }
}
console.log(`\n${raport.length - zle}/${raport.length} ekranów mieści się w szerokości.`);

ws.close();
chrome.kill();
process.exit(zle === 0 ? 0 : 1);
