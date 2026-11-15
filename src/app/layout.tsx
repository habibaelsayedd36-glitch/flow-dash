import type { Metadata, Viewport } from "next";
import { Cairo, Didact_Gothic, Funnel_Display } from "next/font/google";
import type { ReactNode } from "react";
import { AppNav } from "@/components/AppNav";
import { dirOf } from "@/lib/i18n";
import { getI18n } from "@/lib/locale";
import "./globals.css";

// The same three faces flow-agency-eg.com uses.
const funnel = Funnel_Display({ subsets: ["latin"], variable: "--font-funnel", display: "swap" });
const didact = Didact_Gothic({ subsets: ["latin"], weight: "400", variable: "--font-didact", display: "swap" });
const cairo = Cairo({ subsets: ["arabic", "latin"], variable: "--font-cairo", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Flow Dashboard", template: "%s · Flow Dashboard" },
  description: "Run the agency in one place.",
  icons: { icon: "/brand/flow-icon.png" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#143c28", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { locale, t } = await getI18n();
  return (
    <html lang={locale} dir={dirOf(locale)} className={`${funnel.variable} ${didact.variable} ${cairo.variable}`}>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-lime focus:px-4 focus:py-2 focus:text-sm focus:text-forest"
        >
          {t.nav.overview}
        </a>
        <div className="min-h-dvh lg:flex">
          <AppNav />
          <main id="main" className="min-w-0 flex-1">
            <div className="mx-auto w-full max-w-[1240px] px-4 pb-16 pt-6 sm:px-6 lg:px-10 lg:pt-10">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
