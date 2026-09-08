/** Zamiana bajtów na base64url i z powrotem — klucze publiczne trzymamy jako tekst. */

export function doBase64Url(bajty: Uint8Array<ArrayBufferLike>): string {
  let binarne = "";
  for (const b of bajty) binarne += String.fromCharCode(b);
  return btoa(binarne).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function zBase64Url(tekst: string): Uint8Array<ArrayBuffer> {
  const uzupelnione = tekst.replace(/-/g, "+").replace(/_/g, "/");
  const binarne = atob(uzupelnione + "=".repeat((4 - (uzupelnione.length % 4)) % 4));
  const bajty = new Uint8Array(new ArrayBuffer(binarne.length));
  for (let i = 0; i < binarne.length; i++) bajty[i] = binarne.charCodeAt(i);
  return bajty;
}

/** SHA-256 w zapisie szesnastkowym — do porównywania kodu bootstrapowego. */
export async function sha256Hex(tekst: string): Promise<string> {
  const bufor = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(tekst));
  return [...new Uint8Array(bufor)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Porównanie w stałym czasie — kody i identyfikatory sesji są sekretami. */
export function rowneStalyCzas(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let roznica = 0;
  for (let i = 0; i < a.length; i++) roznica |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return roznica === 0;
}

/**
 * Tekst na bajty w buforze o jednoznacznym typie.
 *
 * `TextEncoder.encode` zwraca tablicę nad `ArrayBufferLike`, a WebAuthn oczekuje
 * zwykłego `ArrayBuffer` — przepisanie przez nowy bufor zdejmuje tę różnicę.
 */
export function naBajty(tekst: string): Uint8Array<ArrayBuffer> {
  const zrodlo = new TextEncoder().encode(tekst);
  const bajty = new Uint8Array(new ArrayBuffer(zrodlo.length));
  bajty.set(zrodlo);
  return bajty;
}
