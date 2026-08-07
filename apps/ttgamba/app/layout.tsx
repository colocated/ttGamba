import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
// Its own export path, not the barrel: this is a server component, and the
// barrel is full of "use client" modules — importing it here would hand the
// server a client reference instead of a string.
import { bootstrapScript } from "@tt/window/bootstrap";

import { Window } from "@/components/window";
// From lib/keys.ts and not lib/settings.ts — that one is `"use client"`, and
// its exports would reach this server component as client references rather
// than as the string. The file says so at length.
import { SETTINGS_KEY } from "@/lib/keys";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

/** Used for anything numeric — chip counts, odds, payouts — so figures line up. */
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ttGamba",
  description: "In-game casino for Transport Tycoon. Chips only, never real money.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      {/*
        `overflow-hidden` keeps the game viewport clean while the window is
        dragged; the window itself clamps to the viewport bounds.
      */}
      <body className="h-full overflow-hidden font-sans text-ink">
        {/*
          `beforeInteractive` puts this in the head and runs it ahead of any
          Next.js module, which is the whole point — it has to beat both the
          first paint and any chance of the bundle failing. It carries the
          remembered window geometry and, more importantly, Escape → pin, which
          is the player's way out if nothing else on this page ever loads.
        */}
        <Script id="ttgamba-bootstrap" strategy="beforeInteractive">
          {bootstrapScript(SETTINGS_KEY)}
        </Script>
        <Window>{children}</Window>
      </body>
    </html>
  );
}
