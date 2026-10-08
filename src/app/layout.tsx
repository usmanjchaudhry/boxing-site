import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SITE } from "@/utils/site";
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.name} | Boxing Gym in Reseda, CA`,
    template: `%s | ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  keywords: [
    "boxing gym Reseda",
    "boxing classes Reseda",
    "boxing gym San Fernando Valley",
    "youth boxing",
    "boxing fitness",
    "sparring",
    "La Familia Showtime",
  ],
  openGraph: {
    type: "website",
    url: SITE.url,
    siteName: SITE.name,
    title: `${SITE.name} | Boxing Gym in Reseda, CA`,
    description: SITE.description,
    locale: "en_US",
    images: [{ url: "/gym-interior.jpg", alt: `${SITE.name} gym floor` }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE.name} | Boxing Gym in Reseda, CA`,
    description: SITE.description,
    images: ["/gym-interior.jpg"],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
