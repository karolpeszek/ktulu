/**
 * Konfiguracja Workera. Błędne RP_ID nie objawia się awarią, tylko cichym
 * „nie znaleziono klucza” przy logowaniu, więc walidacja musi być ostra.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { bladRpId, originDozwolony, sprawdzKonfiguracje } from "../worker/config";

describe("Walidacja RP_ID", () => {
  it("przyjmuje zwykłą domenę i subdomenę", () => {
    assert.equal(bladRpId("example.com"), null);
    assert.equal(bladRpId("ktulu.example.com"), null);
    assert.equal(bladRpId("moj-subdomain.workers.dev"), null);
  });

  it("przyjmuje localhost do pracy lokalnej", () => {
    assert.equal(bladRpId("localhost"), null);
  });

  it("odrzuca schemat, port i ścieżkę", () => {
    assert.match(bladRpId("https://example.com") ?? "", /schematu/);
    assert.match(bladRpId("example.com:8788") ?? "", /portu/);
    assert.match(bladRpId("example.com/api") ?? "", /ścieżki/);
  });

  it("odrzuca adres IP", () => {
    assert.match(bladRpId("127.0.0.1") ?? "", /adresem IP/);
  });

  it("odrzuca publiczny sufiks", () => {
    // Najbardziej prawdopodobna pomyłka: workers.dev zamiast własnej subdomeny.
    assert.match(bladRpId("workers.dev") ?? "", /publiczny sufiks/);
    assert.match(bladRpId("com") ?? "", /publiczny sufiks|pełną domeną/);
  });

  it("odrzuca pojedynczy człon inny niż localhost", () => {
    assert.match(bladRpId("ktulu") ?? "", /pełną domeną/);
  });

  it("odrzuca puste, kropkę na końcu i spację", () => {
    assert.match(bladRpId("") ?? "", /puste/);
    assert.match(bladRpId("example.com.") ?? "", /kropką/);
    assert.match(bladRpId("exam ple.com") ?? "", /spację/);
  });

  it("odrzuca niepoprawny człon domeny", () => {
    assert.match(bladRpId("-zle.example.com") ?? "", /poprawnym członem/);
    assert.match(bladRpId("a_b.example.com") ?? "", /poprawnym członem/);
  });
});

describe("Sprawdzenie konfiguracji", () => {
  it("brak RP_ID zatrzymuje aplikację z czytelnym powodem", () => {
    const w = sprawdzKonfiguracje({});
    assert.equal(w.ok, false);
    assert.match(w.ok === false ? w.powod : "", /Brak zmiennej RP_ID/);
  });

  it("puste RP_ID traktujemy jak brak", () => {
    assert.equal(sprawdzKonfiguracje({ RP_ID: "   " }).ok, false);
  });

  it("normalizuje wielkość liter i spacje", () => {
    const w = sprawdzKonfiguracje({ RP_ID: "  Ktulu.Example.COM " });
    assert.equal(w.ok, true);
    assert.equal(w.ok && w.konfiguracja.rpId, "ktulu.example.com");
  });

  it("bez RP_NAME wstawia nazwę domyślną", () => {
    const w = sprawdzKonfiguracje({ RP_ID: "example.com" });
    assert.equal(w.ok && w.konfiguracja.rpName, "Ktulu");
  });

  it("odrzuca zbyt długie RP_NAME", () => {
    const w = sprawdzKonfiguracje({ RP_ID: "example.com", RP_NAME: "x".repeat(65) });
    assert.equal(w.ok, false);
  });
});

describe("Dozwolone originy", () => {
  it("domena i jej subdomeny przechodzą po https", () => {
    assert.equal(originDozwolony("https://example.com", "example.com"), true);
    assert.equal(originDozwolony("https://ktulu.example.com", "example.com"), true);
    // Adres podglądu gałęzi działa bez dopisywania go do konfiguracji.
    assert.equal(
      originDozwolony("https://feat-lobby-ktulu.sub.workers.dev", "sub.workers.dev"),
      true
    );
  });

  it("obca domena i http nie przechodzą", () => {
    assert.equal(originDozwolony("https://zle.pl", "example.com"), false);
    assert.equal(originDozwolony("http://example.com", "example.com"), false);
    // Doklejenie nazwy nie może wystarczyć.
    assert.equal(originDozwolony("https://nieexample.com", "example.com"), false);
    assert.equal(originDozwolony("nie-adres", "example.com"), false);
  });

  it("przy localhost dopuszczamy http do pracy lokalnej", () => {
    assert.equal(originDozwolony("http://localhost:8788", "localhost"), true);
    assert.equal(originDozwolony("https://example.com", "localhost"), false);
  });
});
