import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "NiftyLens | NIFTY Options Analytics & Strategy Backtesting Platform",
  description: "NIFTY Options Analytics & Strategy Backtesting Platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${mono.variable} font-sans antialiased text-sm bg-(--bg) text-(--fg)`}>
        {children}
      </body>
    </html>
  );
}
