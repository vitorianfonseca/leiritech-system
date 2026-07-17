import type { Metadata } from "next";
import { Manrope, Geist_Mono, Marcellus } from "next/font/google";
import { cookies } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { AppProviders } from "@/components/providers/app-providers";
import { TEXT_SIZE_COOKIE, parseTextSize } from "@/lib/text-size";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const marcellus = Marcellus({
  variable: "--font-marcellus",
  subsets: ["latin"],
  weight: "400",
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
      className={`${manrope.variable} ${geistMono.variable} ${marcellus.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AppProviders textSize={textSize}>{children}</AppProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
