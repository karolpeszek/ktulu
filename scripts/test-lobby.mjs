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

/** Żądanie w cudzej sesji — do sprawdzania, co widzi drugi prowadzący. */
async function zapytajJako(ciastkoSesji, sciezka, opcje = {}) {
  const odp = await fetch(BAZA + sciezka, {
    ...opcje,
    headers: {
      origin: ORIGIN,
      "content-type": "application/json",
      cookie: ciastkoSesji,
      ...(opcje.headers ?? {}),
    },
  });
  return { status: odp.status, tresc: await odp.json().catch(() => ({})) };
}

/** Zakłada sesję i zwraca samo ciasteczko, nie ruszając bieżącej. */
async function osobnaSesja(nazwa) {
  const odp = await fetch(BAZA + "/api/test/sesja", {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json" },
    body: JSON.stringify({ nazwa }),
  });
  return (odp.headers.get("set-cookie") ?? "").split(";")[0];
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

// — rozdanie kart —
{
  const stanPrzed = await zapytaj(`/api/pokoj/${kod}/manitou`);
  const kasia = stanPrzed.tresc.gracze.find((g) => g.nazwa === "Kasia");
  sprawdz(kasia?.maKarte === false, "przed rozdaniem nikt nie ma karty");

  const przedWydaniem = await zapytaj(`/api/pokoj/${kod}/ja`, {
    headers: { "x-ktulu-gracz": "token-kasi" },
  });
  sprawdz(przedWydaniem.tresc.ja?.rola === null, "gracz nie widzi karty przed wydaniem");

  const rozdane = await zapytaj(`/api/pokoj/${kod}/rozdaj`, {
    method: "POST",
    body: JSON.stringify({ przypisania: [{ gracz: kasia.id, rola: "szeryf" }] }),
  });
  sprawdz(rozdane.tresc.etap === "rozdane", "rozdanie przestawia etap");
  sprawdz(
    rozdane.tresc.gracze.find((g) => g.id === kasia.id)?.maKarte === true,
    "prowadzący widzi, że karta została wydana"
  );
  sprawdz(
    !JSON.stringify(rozdane.tresc).includes("szeryf"),
    "widok prowadzącego nie wozi kart przez sieć — zna je ze swojego pulpitu"
  );

  const mojaKarta = await zapytaj(`/api/pokoj/${kod}/ja`, {
    headers: { "x-ktulu-gracz": "token-kasi" },
  });
  sprawdz(mojaKarta.tresc.ja?.rola === "szeryf", "gracz dostaje własną kartę");
  sprawdz(mojaKarta.tresc.ja?.widzial === null, "karta jeszcze niepotwierdzona");

  const obcy = await zapytaj(`/api/pokoj/${kod}/ja`, {
    headers: { "x-ktulu-gracz": "token-obcego" },
  });
  sprawdz(obcy.tresc.ja === null, "obcy klucz nie dostaje cudzej karty");
  // Skład rozgrywki jest jawny z założenia — to ta sama wiedza, którą przy
  // papierowych kartach daje pytanie do Manitou. Tajne jest przypisanie kart
  // do osób, więc pilnujemy właśnie tego.
  sprawdz(obcy.tresc.ujawnieni?.length === 0, "dla obcego nie ma żadnego przypisania karty do imienia");
  sprawdz(
    !JSON.stringify(obcy.tresc.imiona ?? []).includes("szeryf"),
    "imiona nie niosą ze sobą kart"
  );

  const potwierdzone = await zapytaj(`/api/pokoj/${kod}/widzialem`, {
    method: "POST",
    body: JSON.stringify({ token: "token-kasi" }),
  });
  sprawdz(potwierdzone.tresc.ja?.widzial !== null, "gracz potwierdza obejrzenie karty");

  const uProwadzacego = await zapytaj(`/api/pokoj/${kod}/manitou`);
  sprawdz(
    uProwadzacego.tresc.gracze.find((g) => g.id === kasia.id)?.widzial !== null,
    "prowadzący widzi potwierdzenie"
  );

  // — skład rozgrywki i odkrywanie zmarłych —
  const zeSkladem = await zapytaj(`/api/pokoj/${kod}/ja`, {
    headers: { "x-ktulu-gracz": "token-kasi" },
  });
  sprawdz(zeSkladem.tresc.sklad?.includes("szeryf"), "gracz widzi skład rozgrywki");
  sprawdz(zeSkladem.tresc.ujawnieni?.length === 0, "przed śmiercią nikt nie jest odkryty");

  const obcyWidzi = await zapytaj(`/api/pokoj/${kod}/ja`, {
    headers: { "x-ktulu-gracz": "token-obcego" },
  });
  sprawdz(
    obcyWidzi.tresc.sklad?.length === zeSkladem.tresc.sklad?.length,
    "skład jest jawny także dla kogoś bez karty"
  );

  const odkryte = await zapytaj(`/api/pokoj/${kod}/ujawnij`, {
    method: "POST",
    body: JSON.stringify({ gracze: [kasia.id] }),
  });
  sprawdz(
    odkryte.tresc.gracze.find((g) => g.id === kasia.id)?.ujawniony === true,
    "prowadzący odkrywa kartę zmarłego"
  );

  const poOdkryciu = await zapytaj(`/api/pokoj/${kod}/ja`, {
    headers: { "x-ktulu-gracz": "token-obcego" },
  });
  sprawdz(
    poOdkryciu.tresc.ujawnieni?.[0]?.rola === "szeryf" &&
      poOdkryciu.tresc.ujawnieni?.[0]?.imie === "Kasia",
    "odkryta karta pokazuje się z imieniem",
    JSON.stringify(poOdkryciu.tresc.ujawnieni)
  );

  // — nowa runda tym samym składem —
  const nowa = await zapytaj(`/api/pokoj/${kod}/nowa-runda`, { method: "POST" });
  sprawdz(nowa.tresc.gracze.length === uProwadzacego.tresc.gracze.length, "skład przeżywa nową rundę");
  sprawdz(nowa.tresc.gracze.every((g) => !g.maKarte), "karty znikają");
  sprawdz(nowa.tresc.gracze.every((g) => g.widzial === null), "potwierdzenia się zerują");
  sprawdz(nowa.tresc.gracze.every((g) => !g.ujawniony), "odkrycia się zerują");
  sprawdz(nowa.tresc.gracze.every((g) => g.miejsce !== undefined), "miejsca zostają");

  const poNowej = await zapytaj(`/api/pokoj/${kod}/ja`, {
    headers: { "x-ktulu-gracz": "token-kasi" },
  });
  sprawdz(poNowej.tresc.ja?.rola === null, "telefon wraca do poczekalni");
  sprawdz(poNowej.tresc.ja?.nazwa === "Kasia", "gracz nie musi wpisywać imienia od nowa");
  sprawdz(poNowej.tresc.sklad?.length === 0, "skład poprzedniej gry znika");
  sprawdz(poNowej.tresc.ujawnieni?.length === 0, "odkrycia poprzedniej gry znikają");
}

// — drugi prowadzący —
{
  const asystent = await osobnaSesja("TestowyAsystent");
  const podgladacz = await osobnaSesja("TestowyPodgladacz");

  const bezZaproszenia = await zapytajJako(asystent, `/api/pokoj/${kod}/manitou`);
  sprawdz(bezZaproszenia.status === 403, "bez zaproszenia nie ma wglądu w grę");

  const zapZapis = await zapytaj(`/api/pokoj/${kod}/asysta/zaproszenie`, {
    method: "POST",
    body: JSON.stringify({ poziom: "zapis" }),
  });
  sprawdz(zapZapis.status === 200, "prowadzący wystawia zaproszenie do asysty");
  const kodAsysty = zapZapis.tresc.kod;
  sprawdz(
    /^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/.test(kodAsysty ?? ""),
    "kod asysty ma osiem znaków, inaczej niż czteroznakowy kod gry",
    kodAsysty
  );
  sprawdz(kodAsysty.replace("-", "").length !== kod.length, "kodu asysty nie da się pomylić z kodem gry");

  const zapOdczyt = await zapytaj(`/api/pokoj/${kod}/asysta/zaproszenie`, {
    method: "POST",
    body: JSON.stringify({ poziom: "odczyt" }),
  });

  const dolaczony = await zapytajJako(asystent, `/api/pokoj/${kod}/asysta/dolacz`, {
    method: "POST",
    body: JSON.stringify({ kod: kodAsysty }),
  });
  sprawdz(dolaczony.tresc.poziom === "zapis", "asystent dołącza z prawem zapisu");

  const ponownie = await zapytajJako(asystent, `/api/pokoj/${kod}/asysta/dolacz`, {
    method: "POST",
    body: JSON.stringify({ kod: kodAsysty }),
  });
  sprawdz(ponownie.status === 200, "powrót po odświeżeniu nie wymaga nowego kodu");

  const zuzyty = await zapytajJako(podgladacz, `/api/pokoj/${kod}/asysta/dolacz`, {
    method: "POST",
    body: JSON.stringify({ kod: kodAsysty }),
  });
  sprawdz(zuzyty.status === 403, "zużytego zaproszenia nie da się użyć drugi raz");

  await zapytajJako(podgladacz, `/api/pokoj/${kod}/asysta/dolacz`, {
    method: "POST",
    body: JSON.stringify({ kod: zapOdczyt.tresc.kod }),
  });

  // — migawka stanu —
  const zapisana = await zapytaj(`/api/pokoj/${kod}/migawka`, {
    method: "POST",
    body: JSON.stringify({ stan: { stage: "night", night: 1 } }),
  });
  sprawdz(zapisana.tresc.wersja === 1, "główny prowadzący zapisuje migawkę");

  const uAsystenta = await zapytajJako(asystent, `/api/pokoj/${kod}/migawka`);
  sprawdz(uAsystenta.tresc.stan?.night === 1, "asystent widzi stan gry");

  const proba = await zapytajJako(asystent, `/api/pokoj/${kod}/migawka`, {
    method: "POST",
    body: JSON.stringify({ stan: { podmieniony: true } }),
  });
  sprawdz(proba.status === 403, "asystent nie może nadpisać stanu wprost");

  // — prośby o zmianę —
  const odPodgladu = await zapytajJako(podgladacz, `/api/pokoj/${kod}/zadanie`, {
    method: "POST",
    body: JSON.stringify({ opis: ["cokolwiek"], stan: { night: 9 }, bazowaWersja: 1 }),
  });
  sprawdz(odPodgladu.status === 403, "poziom tylko do odczytu nie zgłasza zmian");

  const prosba = await zapytajJako(asystent, `/api/pokoj/${kod}/zadanie`, {
    method: "POST",
    body: JSON.stringify({ opis: ["Zabito Marka"], stan: { night: 2 }, bazowaWersja: 1 }),
  });
  sprawdz(prosba.status === 200, "asystent zgłasza prośbę o zmianę");

  const poZgloszeniu = await zapytajJako(asystent, `/api/pokoj/${kod}/migawka`);
  sprawdz(
    poZgloszeniu.tresc.stan?.night === 1 && poZgloszeniu.tresc.wersja === 1,
    "sama prośba niczego nie zmienia — stan czeka na zatwierdzenie"
  );

  const kolejka = await zapytaj(`/api/pokoj/${kod}/manitou`);
  sprawdz(kolejka.tresc.zadania?.length === 1, "prośba stoi w kolejce u głównego");
  sprawdz(kolejka.tresc.zadania?.[0]?.opis?.[0] === "Zabito Marka", "kolejka niesie opis zmiany");

  const cudzaTresc = await zapytajJako(asystent, `/api/pokoj/${kod}/zadanie/tresc?id=${prosba.tresc.id}`);
  sprawdz(cudzaTresc.status === 403, "treść prośby czyta tylko główny prowadzący");

  const tresc = await zapytaj(`/api/pokoj/${kod}/zadanie/tresc?id=${prosba.tresc.id}`);
  sprawdz(tresc.tresc.stan?.night === 2, "główny pobiera proponowany stan");
  sprawdz(tresc.tresc.bazowaWersja === 1, "prośba niesie wersję, na której liczono");

  const zamkniete = await zapytaj(`/api/pokoj/${kod}/zadanie`, {
    method: "DELETE",
    body: JSON.stringify({ id: prosba.tresc.id }),
  });
  sprawdz(zamkniete.tresc.zadania?.length === 0, "rozstrzygnięta prośba znika z kolejki");

  // — odebranie dostępu —
  const bezAsysty = await zapytaj(`/api/pokoj/${kod}/asysta`, {
    method: "DELETE",
    body: JSON.stringify({ uzytkownik: dolaczony.tresc.uzytkownik ?? (await zapytaj(`/api/pokoj/${kod}/manitou`)).tresc.wspolprowadzacy.find((w) => w.nazwa === "TestowyAsystent")?.uzytkownik }),
  });
  sprawdz(
    !bezAsysty.tresc.wspolprowadzacy?.some((w) => w.nazwa === "TestowyAsystent"),
    "prowadzący odbiera dostęp asystentowi"
  );
  const poOdebraniu = await zapytajJako(asystent, `/api/pokoj/${kod}/migawka`);
  sprawdz(poOdebraniu.status === 403, "po odebraniu dostępu asystent nie widzi już stanu");
}

// — wspólnicy na karcie —
  {
    // Blok dokłada własnego gracza, żeby lista wspólników miała kogo zawierać,
    // i sprząta po sobie — dalsze sprawdzenia liczą na zastanym składzie.
    // Po rozdaniu zapisy są zamknięte — nowa runda przywraca możliwość
    // dołączenia, a że to ostatni blok, nie zaburza niczyich założeń.
    await zapytaj(`/api/pokoj/${kod}/nowa-runda`, { method: "POST" });
    await zapytaj(`/api/pokoj/${kod}/etap`, {
      method: "POST",
      body: JSON.stringify({ etap: "lobby" }),
    });
    await dolacz(kod, "token-wspolnika", "Bogdan");
    const wszyscy = (await zapytaj(`/api/pokoj/${kod}/manitou`)).tresc.gracze;
    sprawdz(wszyscy.length >= 2, "do sprawdzenia wspólników potrzeba dwóch osób");

    await zapytaj(`/api/pokoj/${kod}/rozdaj`, {
      method: "POST",
      body: JSON.stringify({
        przypisania: wszyscy.map((g, i) => ({
          gracz: g.id,
          rola: i === 0 ? "herszt" : "bandyta",
          // Listę liczy prowadzący; pokój ma ją wyłącznie przekazać dalej.
          wspolnicy: wszyscy.filter((x) => x.id !== g.id).map((x) => x.nazwa),
        })),
      }),
    });

    const moja = await zapytaj(`/api/pokoj/${kod}/ja`, {
      headers: { "x-ktulu-gracz": "token-kasi" },
    });
    sprawdz(
      moja.tresc.ja?.wspolnicy?.includes("Bogdan"),
      "gracz widzi wspólnika na własnej karcie",
      JSON.stringify(moja.tresc.ja?.wspolnicy)
    );
    sprawdz(
      !moja.tresc.ja.wspolnicy.includes(moja.tresc.ja.nazwa),
      "wśród wspólników nie ma samego zainteresowanego"
    );

    const obcy = await zapytaj(`/api/pokoj/${kod}/ja`, {
      headers: { "x-ktulu-gracz": "token-obcego" },
    });
    sprawdz(obcy.tresc.ja === null, "obcy klucz nie dostaje cudzej listy wspólników");

    // Bez listy od prowadzącego pokój nie wymyśla jej sam.
    await zapytaj(`/api/pokoj/${kod}/rozdaj`, {
      method: "POST",
      body: JSON.stringify({
        przypisania: wszyscy.map((g) => ({ gracz: g.id, rola: "mieszczanin" })),
      }),
    });
    const bezWspolnikow = await zapytaj(`/api/pokoj/${kod}/ja`, {
      headers: { "x-ktulu-gracz": "token-kasi" },
    });
    sprawdz(
      bezWspolnikow.tresc.ja?.wspolnicy?.length === 0,
      "przy wyłączonej zasadzie karta nie zdradza nikogo"
    );

  }


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
