/**
 * Generuje ikony PWA (litera „K” na tle akcentu) bez zewnętrznych zależności.
 * Uruchomienie: node scripts/gen-icons.mjs
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // głębia bitowa
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filtr: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Odległość punktu od odcinka — do rysowania kresek litery. */
function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function render(size) {
  const buf = Buffer.alloc(size * size * 4);
  const S = size;
  const bg = [0x00, 0x6f, 0xff];
  const t = S * 0.085; // grubość kreski
  // Litera K: pionowa laska + dwie ukośne.
  const stemX = S * 0.34;
  const top = S * 0.26;
  const bot = S * 0.74;
  const armX = S * 0.7;
  const mid = S * 0.5;

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const px = x + 0.5;
      const py = y + 0.5;
      const d = Math.min(
        segDist(px, py, stemX, top, stemX, bot),
        segDist(px, py, stemX + t * 0.35, mid, armX, top),
        segDist(px, py, stemX + t * 0.35, mid, armX, bot)
      );
      // wygładzenie krawędzi na szerokości jednego piksela
      const cov = Math.max(0, Math.min(1, (t / 2 - d) / 1.2 + 0.5));
      buf[i] = Math.round(bg[0] + (255 - bg[0]) * cov);
      buf[i + 1] = Math.round(bg[1] + (255 - bg[1]) * cov);
      buf[i + 2] = Math.round(bg[2] + (255 - bg[2]) * cov);
      buf[i + 3] = 255;
    }
  }
  return png(S, S, buf);
}

for (const size of [192, 512]) {
  const out = `public/icon-${size}.png`;
  writeFileSync(out, render(size));
  console.log("zapisano", out);
}
