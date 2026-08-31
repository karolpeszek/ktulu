/**
 * Generuje service workera dla wyeksportowanej aplikacji.
 *
 * Skanuje katalog `out/`, buduje z niego listę plików do zapisania w cache
 * i stempluje ją hashem zawartości. Zmiana czegokolwiek w buildzie zmienia
 * hash, więc przeglądarka widzi nowego SW i proponuje aktualizację.
 *
 * Uruchomienie: node scripts/gen-sw.mjs   (automatycznie po `npm run build`)
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, posix, relative, sep } from "node:path";

const OUT = "out";

/** Plików tych nie ma sensu trzymać w cache aplikacji. */
const SKIP = [/^_headers$/, /^sw\.js$/, /^version\.json$/, /\.map$/, /^404(\.html$|\/)/];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const files = walk(OUT)
  .map((f) => relative(OUT, f).split(sep).join(posix.sep))
  .filter((f) => !SKIP.some((re) => re.test(f)))
  .sort();

const hash = createHash("sha256");
for (const f of files) {
  hash.update(f);
  hash.update(readFileSync(join(OUT, f)));
}
const version = hash.digest("hex").slice(0, 12);

/** Ścieżki, pod którymi hosting poda dany plik (index.html → katalog). */
const urls = new Set(["/"]);
for (const f of files) {
  urls.add("/" + f);
  if (f.endsWith("/index.html")) urls.add("/" + f.slice(0, -"index.html".length));
  else if (f === "index.html") urls.add("/");
}

const sw = `// Wygenerowane przez scripts/gen-sw.mjs — nie edytuj ręcznie.
const VERSION = ${JSON.stringify(version)};
const CACHE = "ktulu-" + VERSION;
const PRECACHE = ${JSON.stringify([...urls].sort(), null, 0)};

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Pojedyncze błędy (np. zasób usunięty z hostingu) nie mogą wywrócić instalacji.
      await Promise.all(
        PRECACHE.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => {})
        )
      );
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// Strona prosi o natychmiastowe przejęcie kontroli po kliknięciu „Odśwież”.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
  if (event.data === "VERSION") event.source?.postMessage({ type: "VERSION", version: VERSION });
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.status === 200 && fresh.type === "basic") {
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch {
    const hit = await cache.match(request);
    if (hit) return hit;
    throw new Error("offline i brak zasobu w cache");
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const fresh = await fetch(request);
  if (fresh && fresh.status === 200 && fresh.type === "basic") {
    cache.put(request, fresh.clone());
  }
  return fresh;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Nawigacje: najpierw cache (natychmiastowy start offline), z podmianą na
  // stronę główną, gdy trasa nie jest znana.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        // Trasa może być zapisana z ukośnikiem na końcu albo bez niego.
        const withSlash = url.pathname.endsWith("/") ? url.pathname : url.pathname + "/";
        const candidates = [request, url.pathname, withSlash, withSlash + "index.html"];
        for (const candidate of candidates) {
          const hit = await cache.match(candidate);
          if (hit) return hit;
        }
        try {
          return await fetch(request);
        } catch {
          return (await cache.match("/")) || Response.error();
        }
      })()
    );
    return;
  }

  // Zasoby z hashem w nazwie są niezmienne — cache wystarczy.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(networkFirst(request));
});
`;

writeFileSync(join(OUT, "sw.js"), sw);
writeFileSync(
  join(OUT, "version.json"),
  JSON.stringify({ version, builtAt: new Date().toISOString(), files: files.length }, null, 2)
);

console.log(`sw.js: ${urls.size} adresów w cache, wersja ${version}`);
