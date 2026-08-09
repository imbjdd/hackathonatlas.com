import type { Metadata, Viewport } from "next";
import { Geist, Inter, Yrsa } from "next/font/google";
import Script from "next/script";
import { CommandKSearch } from "./command-k-search";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const yrsa = Yrsa({
  subsets: ["latin"],
  variable: "--font-yrsa",
});

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
});

const siteUrl = "https://hackathonatlas.com";

const siteName = "Hackathon Atlas";
const siteDescription =
  "Discover hackathons near you and explore opportunities worldwide.";

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: siteName,
  title: siteName,
  description: siteDescription,
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: siteName,
    description: siteDescription,
    siteName,
    type: "website",
    url: "/",
    locale: "en_US",
    images: [
      {
        url: "https://hackathonatlas.com/og.png",
        width: 1200,
        height: 630,
        alt: "Hackathon Atlas",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteName,
    description: siteDescription,
    images: [
      {
        url: "https://hackathonatlas.com/og.png",
        alt: "Hackathon Atlas",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}}catch(e){}})();",
          }}
        />
      </head>
      <body className={`${inter.variable} ${yrsa.variable} ${geist.variable}`}>
        {process.env.NODE_ENV === "development" && (
          <Script
            src="//unpkg.com/react-grab/dist/index.global.js"
            crossOrigin="anonymous"
            strategy="beforeInteractive"
          />
        )}
        {children}
        <CommandKSearch />
      </body>
    </html>
  );
}
