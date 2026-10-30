import "./globals.css";
import { Analytics } from "@vercel/analytics/next";

export const metadata = {
  title: "EMAHAIRSHOP Bot | Tanya Produk Hair Extension via WhatsApp",
  description: "Bot WhatsApp resmi EMAHAIRSHOP. Tanya produk human hair extension, harga grosir, dan stok kapan saja, dijawab otomatis saat itu juga.",
  icons: { icon: "https://emahairshop.com/favicon.svg" },
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
