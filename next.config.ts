import type { NextConfig } from "next";

/**
 * Eksport statyczny — cała aplikacja działa w przeglądarce, więc build
 * produkuje zwykłe pliki w `out/`, gotowe do wrzucenia na Cloudflare Pages.
 */
const nextConfig: NextConfig = {
  output: "export",
  // Każda trasa dostaje własny katalog z index.html — hosting statyczny
  // serwuje wtedy /gra/ bez dodatkowej konfiguracji przekierowań.
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
