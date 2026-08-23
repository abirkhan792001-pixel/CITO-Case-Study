import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "TaxHub — Fragen Sie Ihr Kanzlei-Wissen",
  description:
    "Belegte Antworten aus den Unterlagen Ihrer Kanzlei. Mit Quellenangabe — oder mit klarer Absage.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body className={`${inter.className} bg-slate-50 text-slate-900`}>
        {children}
      </body>
    </html>
  );
}
