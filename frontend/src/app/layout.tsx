import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CodeForge Options Analytics",
  description: "AI-powered options market analytics",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
