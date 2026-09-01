import type { Metadata, Viewport } from "next";
import "./globals.css";
import { GameProvider } from "@/lib/store";
import { PrefsProvider } from "@/lib/prefs";
import AppShell from "@/components/AppShell";
import UpdatePrompt from "@/components/UpdatePrompt";

export const metadata: Metadata = {
  title: "Ktulu · pulpit Manitou",
  description:
    "Aplikacja do prowadzenia rozgrywki w Ktulu — przydział ról, kroki nocy, głosowania i warunki zwycięstwa.",
  manifest: "/manifest.webmanifest",
  // Sam Disallow w robots.txt blokuje tylko pobieranie strony; dopiero noindex
  // wypycha ewentualny adres z wyników wyszukiwania.
  robots: { index: false, follow: false },
  applicationName: "Ktulu",
  appleWebApp: { capable: true, title: "Ktulu", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#101216" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Atrybuty data-theme / data-density dokłada skrypt poniżej, jeszcze przed
    // hydracją — rozjazd z HTML-em z serwera jest tu zamierzony.
    <html lang="pl" suppressHydrationWarning>
      <body>
        {/* Wymuszony motyw ustawiany przed pierwszym malowaniem — inaczej przy
            starcie mignąłby motyw systemowy, zanim React odczyta ustawienia. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{var p=JSON.parse(localStorage.getItem("ktulu.ui.prefs.v1")||"{}");' +
              'var r=document.documentElement;' +
              'if(p.theme&&p.theme!=="system")r.dataset.theme=p.theme;' +
              'if(p.density&&p.density!=="normal")r.dataset.density=p.density}catch(e){}',
          }}
        />
        <PrefsProvider>
          <GameProvider>
            <AppShell>{children}</AppShell>
            <UpdatePrompt />
          </GameProvider>
        </PrefsProvider>
      </body>
    </html>
  );
}
