import type { Metadata, Viewport } from "next";
import { Figtree, Fraunces } from "next/font/google";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

const sans = Figtree({ subsets: ["latin"], variable: "--font-figtree", display: "swap" });
const display = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap" });

export const metadata: Metadata = {
  title: "FarmShift – Rice to Black Gram Advisor",
  description: "Crop rotation suitability for Myanmar farms from NASA satellite data",
};

export const viewport: Viewport = {
  themeColor: "#113c27",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${display.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}