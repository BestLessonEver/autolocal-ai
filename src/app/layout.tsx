import type { Metadata } from "next";
import localFont from "next/font/local";
import { isStagingDeployment } from "@/lib/public-origin";
import "./globals.css";
const geist = localFont({
  src: "./fonts/GeistVF.woff",
  display: "swap",
  variable: "--font-geist",
  weight: "100 900",
});
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://autolocal.ai",
  ),
  title: {
    default: "AutoLocal | Websites and local visibility for small businesses",
    template: "%s | AutoLocal",
  },
  description:
    "A professional website, clearer business information, and one place to manage new inquiries. Build a stronger local presence with AutoLocal.",
  openGraph: {
    siteName: "AutoLocal",
    type: "website",
    locale: "en_US",
    title: "AutoLocal — a stronger local presence",
    description:
      "A better website. Clearer business information. Inquiries you can act on.",
  },
  twitter: { card: "summary", title: "AutoLocal — a stronger local presence" },
  robots: { index: !isStagingDeployment(), follow: !isStagingDeployment() },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={geist.className}>{children}</body>
    </html>
  );
}
