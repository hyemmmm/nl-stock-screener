import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "종목 스크리너 · 자연어 검색",
  description:
    "자연어로 한국 주식 종목을 찾아주는 스크리너. Next.js + Claude + KIS Open API.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
