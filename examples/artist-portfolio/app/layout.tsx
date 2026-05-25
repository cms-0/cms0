import type { Metadata } from "next";

import "./globals.css";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { data, readCms } from "@/data/cms0";
import { footerFallback, headerFallback } from "@/data/fallbacks";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3010",
  ),
  title: {
    default: "Mara Vale Studio",
    template: "%s | Mara Vale Studio",
  },
  description:
    "A cms0 powered artist portfolio example for paintings, essays, and studio notes.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [header, footer] = await Promise.all([
    readCms(() => data.header({ includeId: false }), headerFallback),
    readCms(() => data.footer({ includeId: false }), footerFallback),
  ]);

  return (
    <html lang="en">
      <body>
        <SiteHeader header={header} />
        <main>{children}</main>
        <SiteFooter footer={footer} />
      </body>
    </html>
  );
}
