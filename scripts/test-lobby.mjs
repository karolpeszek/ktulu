/**
 * Test integracyjny lobby.
 *
 * Cykl życia pokoju siedzi w bazie Durable Objecta, więc nie da się go sprawdzić
 * czystymi funkcjami tak jak reguł gry. Ten skrypt przechodzi całą ścieżkę na
 * uruchomionym `wrangler dev` — od założenia pokoju po jego skasowanie.
 *
 * Uruchomienie:
 *   pnpm run build:only
 *   pnpm dlx wrangler dev --port 8800 --var RP_ID:localhost
 *   pnpm run test:lobby
 */

const BAZA = process.env.KTULU_BAZA ?? "http://localhost:8800";
const ORIGIN = BAZA;

let bledy = 0;
let zaliczone = 0;

function sprawdz(warunek, opis, szczegol = "") {
  if (warunek) {
    zaliczone += 1;
    console.log(`  ✔ ${opis}`);
  } else {
    bledy += 1;
    console.log(`  ✘ ${opis}${szczegol ? ` — ${szczegol}` : ""}`);
  }
}

let ciastko = "";

async function zapytaj(sciezka, opcje = {}) {
  const odp = await fetch(BAZA + sciezka, {
    ...opcje,
    headers: {
      origin: ORIGIN,
      "content-type": "application/json",
      ...(ciastko ? { cookie: ciastko } : {}),
      ...(opcje.headers ?? {}),
    },
  });
  const ustawione = odp.headers.get("set-cookie");
  if (ustawione) ciastko = ustawione.split(";")[0];
  const tresc = await odp.json().catch(() => ({}));
  return { status: odp.status, tresc };
}

const dolacz = (kod, token, nazwa) =>
  zapytaj(`/api/pokoj/${kod}/dolacz`, {
    method: "POST",
    body: JSON.stringify({ token, nazwa }),
  });

console.log("\nLobby — test integracyjny\n");

// — sesja prowadzącego —
const sesja = await zapytaj("/api/test/sesja", {
  method: "POST",
  body: JSON.stringify({ nazwa: "TestowyManitou" }),
});
sprawdz(sesja.status === 200, "furtka testowa daje sesję", `status ${sesja.status}`);

// — zakładanie —
const zalozony = await zapytaj("/api/pokoj", { method: "POST" });
sprawdz(zalozony.status === 200, "pokój się zakłada", `status ${zalozony.status}`);
const kod = zalozony.tresc.kod;
sprawdz(/^[2-9A-HJKMNP-Z]{4}$/.test(kod ?? ""), "kod ma cztery znaki z alfabetu", kod);
sprawdz(zalozony.tresc.etap === "lobby", "nowy pokój przyjmuje zapisy");

const istnienie = await zapytaj(`/api/pokoj/${kod}`);
sprawdz(istnienie.tresc.istnieje === true, "pokój jest widoczny bez logowania");

// — dołączanie —
const kasia = await dolacz(kod, "token-kasi", "Kasia");
sprawdz(kasia.status === 200, "gracz dołącza do puli", `status ${kasia.status}`);
sprawdz(kasia.tresc.ja?.nazwa === "Kasia", "gracz widzi własne imię");
sprawdz(kasia.tresc.ja?.miejsce === null, "nowy gracz nie ma jeszcze miejsca");

const powrot = await dolacz(kod, "token-kasi", "CosInnego");
sprawdz(powrot.status === 200, "powrót tym samym kluczem nie jest nowym dołączeniem");
sprawdz(powrot.tresc.ja?.nazwa === "Kasia", "powrót zachowuje pierwotne imię");

const duplikat = await dolacz(kod, "token-marka", "kasia");
sprawdz(duplikat.status === 409, "duplikat imienia jest odrzucany", `status ${duplikat.status}`);
sprawdz(/zajęte/.test(duplikat.tresc.error ?? ""), "odmowa mówi o zajętym imieniu");

const zaDlugie = await dolacz(kod, "token-marka", "x".repeat(17));
sprawdz(zaDlugie.status === 409, "imię ponad 16 znaków odpada");

const marek = await dolacz(kod, "token-marka", "Marek");
sprawdz(marek.status === 200, "drugi gracz dołącza");
sprawdz(marek.tresc.imiona.length === 2, "gracz widzi listę imion", JSON.stringify(marek.tresc.imiona));

// — podgląd na żywo —
{
  const gniazdo = new WebSocket(BAZA.replace(/^http/, "ws") + `/api/pokoj/${kod}/podglad`, {
    headers: { cookie: ciastko, origin: ORIGIN },
  });
  const odebrane = [];
  const otwarte = await new Promise((res) => {
    gniazdo.addEventListener("open", () => res(true));
    gniazdo.addEventListener("error", () => res(false));
    setTimeout(() => res(false), 5000);
  });
  sprawdz(otwarte, "prowadzący podłącza się WebSocketem");
  if (otwarte) {
    gniazdo.addEventListener("message", (e) => odebrane.push(JSON.parse(e.data)));
    await new Promise((r) => setTimeout(r, 400));
    sprawdz(odebrane.length >= 1, "stan przychodzi zaraz po podłączeniu");

    await dolacz(kod, "token-zosi", "Zosia");
    await new Promise((r) => setTimeout(r, 600));
    const ostatni = odebrane.at(-1);
    sprawdz(
      ostatni?.stan?.gracze?.some((g) => g.nazwa === "Zosia"),
      "dołączenie gracza rozsyła się na żywo",
      JSON.stringify(ostatni?.stan?.gracze?.map((g) => g.nazwa))
    );
    gniazdo.close();
  }
  // Zosia dołączyła w trakcie testu podglądu — usuwamy ją, żeby dalsze
  // sprawdzenia liczyły to, co zakładają.
  const stanTeraz = await zapytaj(`/api/pokoj/${kod}/manitou`);
  const idZosi = stanTeraz.tresc.gracze?.find((g) => g.nazwa === "Zosia")?.id;
  if (idZosi) await zapytaj(`/api/pokoj/${kod}/wyrzuc`, { method: "POST", body: JSON.stringify({ gracz: idZosi }) });
}

// — widok prowadzącego —
const widok = await zapytaj(`/api/pokoj/${kod}/manitou`);
sprawdz(widok.status === 200, "prowadzący widzi pełny stan");
sprawdz(widok.tresc.gracze?.length === 2, "w puli są dwie osoby");
const idKasi = widok.tresc.gracze.find((g) => g.nazwa === "Kasia")?.id;
const idMarka = widok.tresc.gracze.find((g) => g.nazwa === "Marek")?.id;

// — sadzanie —
const usadzona = await zapytaj(`/api/pokoj/${kod}/usadz`, {
  method: "POST",
  body: JSON.stringify({ gracz: idKasi, miejsce: 0 }),
});
sprawdz(usadzona.tresc.gracze?.find((g) => g.id === idKasi)?.miejsce === 0, "gracz siada na miejscu");

await zapytaj(`/api/pokoj/${kod}/usadz`, {
  method: "POST",
  body: JSON.stringify({ gracz: idMarka, miejsce: 1 }),
});
const zamiana = await zapytaj(`/api/pokoj/${kod}/usadz`, {
  method: "POST",
  body: JSON.stringify({ gracz: idMarka, miejsce: 0 }),
});
const poZamianie = Object.fromEntries(zamiana.tresc.gracze.map((g) => [g.nazwa, g.miejsce]));
sprawdz(poZamianie.Marek === 0 && poZamianie.Kasia === 1, "przeciągnięcie na zajęte miejsce zamienia graczy", JSON.stringify(poZamianie));

// — przemianowanie —
const nowaNazwa = await zapytaj(`/api/pokoj/${kod}/przemianuj`, {
  method: "POST",
  body: JSON.stringify({ gracz: idMarka, nazwa: "Marian" }),
});
sprawdz(nowaNazwa.tresc.gracze?.find((g) => g.id === idMarka)?.nazwa === "Marian", "prowadzący zmienia imię");

const kolizja = await zapytaj(`/api/pokoj/${kod}/przemianuj`, {
  method: "POST",
  body: JSON.stringify({ gracz: idMarka, nazwa: "Kasia" }),
});
sprawdz(kolizja.status === 409, "przemianowanie na zajęte imię odpada");

// — zamknięcie zapisów —
const zamkniete = await zapytaj(`/api/pokoj/${kod}/etap`, {
  method: "POST",
  body: JSON.stringify({ etap: "zamkniete" }),
});
sprawdz(zamkniete.tresc.etap === "zamkniete", "zapisy da się zamknąć");

const spozniony = await dolacz(kod, "token-spoznionego", "Zosia");
sprawdz(spozniony.status === 409, "po zamknięciu nikt nie dołączy", `status ${spozniony.status}`);
sprawdz(/zamknął zapisy/.test(spozniony.tresc.error ?? ""), "odmowa tłumaczy powód");

const wracajacy = await dolacz(kod, "token-kasi", "Kasia");
sprawdz(wracajacy.status === 200, "kto już był, wraca mimo zamkniętych zapisów");

// — wyrzucenie —
const bezMarka = await zapytaj(`/api/pokoj/${kod}/wyrzuc`, {
  method: "POST",
  body: JSON.stringify({ gracz: idMarka }),
});
sprawdz(bezMarka.tresc.gracze?.length === 1, "prowadzący wyrzuca gracza");

// — cudzy pokój —
const obcy = await zapytaj("/api/test/sesja", {
  method: "POST",
  body: JSON.stringify({ nazwa: "ObcyManitou" }),
});
sprawdz(obcy.status === 200, "druga sesja powstaje");
const podglad = await zapytaj(`/api/pokoj/${kod}/manitou`);
sprawdz(podglad.status === 403, "cudzy pokój jest niedostępny", `status ${podglad.status}`);

// — kasowanie —
const usuniety = await zapytaj(`/api/pokoj/${kod}`, { method: "DELETE" });
sprawdz(usuniety.status === 403, "cudzego pokoju nie da się skasować");

await zapytaj("/api/test/sesja", { method: "POST", body: JSON.stringify({ nazwa: "TestowyManitou" }) });
const skasowany = await zapytaj(`/api/pokoj/${kod}`, { method: "DELETE" });
sprawdz(skasowany.status === 200, "właściciel kasuje pokój");
const poKasacji = await zapytaj(`/api/pokoj/${kod}`);
sprawdz(poKasacji.tresc.istnieje === false, "po skasowaniu pokój znika");

console.log(`\n  ${zaliczone} zaliczonych, ${bledy} nieudanych\n`);
process.exit(bledy === 0 ? 0 : 1);
