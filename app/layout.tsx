import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "칠판 → 텍스트 변환기",
  description: "칠판/화이트보드 사진을 LaTeX 포함 텍스트로 변환",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
