import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
import { GeistMono } from "geist/font/mono";
import { AuthProvider } from "@/lib/AuthContext";
import "./globals.css";

const sans = Figtree({ subsets: ["latin"], variable: "--font-figtree", display: "swap" });

export const metadata: Metadata = {
  title: "FarmShift – Rice to Black Gram Advisor",
  description: "Crop rotation suitability for Myanmar farms from NASA satellite data",
};

export const viewport: Viewport = {
  themeColor: "#1d702f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${GeistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}