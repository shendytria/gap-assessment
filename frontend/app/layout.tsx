import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Kalbe Consumer Health — Gap Assessment Online", template: "%s · Kalbe Consumer Health" },
  description: "Kalbe Consumer Health — Regulatory gap assessment, action plans and compliance monitoring.",
  icons: { icon: "/logo-kch.png" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
