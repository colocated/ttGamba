import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Script from "next/script";

import { Tablet } from "@/components/tablet";
import { BOOTSTRAP_SCRIPT } from "@/lib/bootstrap";
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
          first paint and any chance of the bundle failing. See lib/bootstrap.
        */}
        <Script id="ttgamba-bootstrap" strategy="beforeInteractive">
          {BOOTSTRAP_SCRIPT}
        </Script>
        <Tablet>{children}</Tablet>
      </body>
    </html>
  );
}
