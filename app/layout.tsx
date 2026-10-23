import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI News Curation",
  description: "Dashboard for filtering AI news and how-to content into content leads."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
