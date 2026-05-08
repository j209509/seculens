import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SecuLens（セキュレンズ）- Webセキュリティ診断",
  description: "AIによるWebアプリケーション脆弱性診断サービス",
  icons: {
    icon: [
      { url: "/seculens-icon.png", sizes: "any", type: "image/png" },
      { url: "/icon.png", sizes: "any", type: "image/png" },
    ],
    apple: { url: "/seculens-icon.png", sizes: "180x180", type: "image/png" },
    shortcut: "/seculens-icon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
