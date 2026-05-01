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
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export const metadata: Metadata = {
  title: "Plantor — Plan + Mentor",
  description:
    "학원이 쓰는 검증된 학습 프로그램을, 학원 없이 가정에 직접 연결합니다.",
  icons: {
    icon: "/favicon.svg",
    apple: "/icons/apple-touch-icon.png",
  },
  manifest: "/manifest.json",
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
