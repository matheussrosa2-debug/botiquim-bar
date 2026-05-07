import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Botiquim Bar · Restaurante",
  description: "Cadastre-se e gire a roleta de prêmios do Botiquim Bar!",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Playfair Display for headings, Lato for body */}
        <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Lato:wght@400;500;700&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-btq-cream text-btq-dark antialiased">{children}</body>
    </html>
  );
}
