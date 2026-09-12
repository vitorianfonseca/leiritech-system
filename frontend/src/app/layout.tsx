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
      {/* Applied before first paint. next-themes does the same for light/dark;
          without it the page renders one frame in the default accent and then
          swaps, which is the flash a theming system exists to avoid. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `try{var a=localStorage.getItem("leiritech-accent");if(a&&a!=="rose"){document.documentElement.dataset.accent=a;if(a==="custom"){var h=localStorage.getItem("leiritech-accent-hex");if(h){var d=parseInt(h.slice(1),16),f=function(v){v/=255;return v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4)},r=f(d>>16&255),g=f(d>>8&255),b=f(d&255),l=Math.cbrt(0.4122214708*r+0.5363325363*g+0.0514459929*b),m=Math.cbrt(0.2119034982*r+0.6806995451*g+0.1073969566*b),s2=Math.cbrt(0.0883024619*r+0.2817188376*g+0.6299787005*b),A=1.9779984951*l-2.428592205*m+0.4505937099*s2,B=0.0259040371*l+0.7827717662*m-0.808675766*s2,c=Math.min(0.18,Math.max(0.04,Math.sqrt(A*A+B*B))),hu=Math.atan2(B,A)*180/Math.PI;if(hu<0)hu+=360;hu=Math.round(hu);var dk=document.documentElement.classList.contains("dark"),ac="oklch("+(dk?0.78:0.56)+" "+(dk?Math.min(0.12,c):c).toFixed(3)+" "+hu+")",st=document.documentElement.style;st.setProperty("--accent-hue",hu);["--primary","--ring","--signal","--sidebar-ring","--sidebar-primary"].forEach(function(k){st.setProperty(k,ac)});st.setProperty("--signal-muted","oklch("+(dk?"0.320 0.045 ":"0.945 0.030 ")+hu+")");st.setProperty("--brand-rotate",(hu-340)+"deg")}}}}catch(e){}`,
        }}
      />
      <body className="min-h-full">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AppProviders textSize={textSize}>{children}</AppProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
