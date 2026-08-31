import type { Metadata, Viewport } from "next";
import "./globals.css";
import { GameProvider } from "@/lib/store";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "Ktulu · pulpit Manitou",
  description:
    "Aplikacja do prowadzenia rozgrywki w Ktulu — przydział ról, kroki nocy, głosowania i warunki zwycięstwa.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#101216" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl">
      <body>
        <GameProvider>
          <AppShell>{children}</AppShell>
        </GameProvider>
      </body>
    </html>
  );
}
