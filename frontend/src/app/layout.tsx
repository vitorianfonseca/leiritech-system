import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import localFont from "next/font/local";
import { cookies } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { AppProviders } from "@/components/providers/app-providers";
import { TEXT_SIZE_COOKIE, parseTextSize } from "@/lib/text-size";
import "./globals.css";

/**
 * Two faces, two jobs.
 *
 * Satoshi carries everything read as language — it is warm, geometric and has
 * actual character, which a condensed technical face does not. IBM Plex Mono
 * carries every figure, so numbers align down a column and read as data
 * rather than prose. The split is what keeps the interface elegant *and*
 * precise: warmth where there are words, rigour where there are numbers.
 */
const satoshi = localFont({
  variable: "--font-satoshi",
  display: "swap",
  src: [
    { path: "./fonts/Satoshi-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/Satoshi-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/Satoshi-Bold.woff2", weight: "700", style: "normal" },
    { path: "./fonts/Satoshi-Black.woff2", weight: "900", style: "normal" },
  ],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app");
  return {
    title: {
      default: t("name"),
      template: `%s · ${t("name")}`,
    },
    description: t("tagline"),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  const textSize = parseTextSize((await cookies()).get(TEXT_SIZE_COOKIE)?.value);

  return (
    <html
      lang={locale}
      data-text-size={textSize}
      suppressHydrationWarning
      className={`${satoshi.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AppProviders textSize={textSize}>{children}</AppProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
