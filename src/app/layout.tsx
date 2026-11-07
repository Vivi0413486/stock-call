import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "어느 날 내 주식이 전화했다",
  description: "종목을 고르면 그 주식이 전화를 걸어 오늘 시세와 공시를 자기 사연처럼 털어놓는다. 데이터: Phoenix AI · 음성: Vapi",
};

export const viewport: Viewport = {
  themeColor: "#0b0f1a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
