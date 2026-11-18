import type { Metadata, Viewport } from "next";
import { Cairo, Didact_Gothic, Funnel_Display } from "next/font/google";
import { Suspense, type ReactNode } from "react";
import { AppNav } from "@/components/AppNav";
import { auth } from "@/lib/auth/server";
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
  icons: {
    icon: [{ url: "https://www.flow-agency-eg.com/assets/logos/Symbol.png", type: "image/png" }],
    shortcut: "https://www.flow-agency-eg.com/assets/logos/Symbol.png",
    apple: "https://www.flow-agency-eg.com/assets/logos/Symbol.png",
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#143c28", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [{ locale, t }, { data: session }] = await Promise.all([getI18n(), auth.getSession()]);
  return (
    <html lang={locale} dir={dirOf(locale)} className={`${funnel.variable} ${didact.variable} ${cairo.variable}`}>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-lime focus:px-4 focus:py-2 focus:text-sm focus:text-forest"
        >
          {t.nav.overview}
        </a>
        {session?.user ? (
          <div className="min-h-dvh lg:flex">
            <AppNav userName={session.user.name ?? ""} userEmail={session.user.email ?? ""} />
            <main id="main" className="min-w-0 flex-1">
              <Suspense fallback={<div className="fixed inset-0 z-[200] grid min-h-dvh place-items-center bg-[#f5f6f2] text-[#183c2b]" role="status" aria-live="polite"><div className="flex flex-col items-center gap-5"><img src="https://www.flow-agency-eg.com/assets/logo/flow-lockup-green.png" alt="FLOW" className="h-12 w-auto max-w-[190px] object-contain" /><span className="size-7 animate-spin rounded-full border-[3px] border-[#dce4dc] border-t-[#315e42]" aria-hidden="true" /><p className="text-sm font-medium text-[#68766b]">Checking your access…</p></div></div>}>
                <div className="mx-auto w-full max-w-[1240px] px-4 pb-16 pt-6 sm:px-6 lg:px-10 lg:pt-10">{children}</div>
              </Suspense>
            </main>
          </div>
        ) : children}
      </body>
    </html>
  );
}
