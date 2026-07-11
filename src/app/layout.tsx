import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
import { ServicesProvider } from "@/lib/services-context";
import { Navbar } from "@/components/auth/navbar";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://plantor.web.app"),
  title: "Plantor — Plan + Mentor",
  description:
    "학원이 쓰는 검증된 학습 프로그램을, 학원 없이 가정에 직접 연결합니다.",
  alternates: { canonical: "/" },
  verification: { google: "qxjU6FaFmEZSbRautnwMEslGdO5Tr4oV4UTrOe6MG34" },
  // 모바일 Safari/Chrome이 전화번호 문자열을 자동으로 tel: 링크로 변환하지 않도록 함
  // (어드민 페이지 등에서 표시용 전화번호에 의도치 않은 밑줄/링크 생기는 것 방지)
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: "/favicon.svg",
    apple: "/icons/apple-touch-icon.png",
  },
  openGraph: {
    title: "Plantor — Plan + Mentor",
    description: "학원이 쓰는 검증된 학습 프로그램을, 학원 없이 가정에 직접 연결합니다.",
    url: "https://plantor.web.app",
    siteName: "Plantor",
    images: [{ url: "https://plantor.web.app/og.png", width: 1200, height: 630 }],
    locale: "ko_KR",
    type: "website",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Plantor",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full">
        <AuthProvider>
          <ServicesProvider>
            <Navbar />
            {children}
          </ServicesProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
