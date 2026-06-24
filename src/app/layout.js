import { Outfit, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata = {
  title: "헥토큐앤엠 근태관리시스템",
  description: "헥토큐앤엠 근태관리시스템의 실시간 출퇴근, 월간 근태, 휴가 및 일정 관리 화면입니다.",
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg',
    apple: '/icon.svg',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko" className={`${outfit.variable} ${jetbrainsMono.variable}`}>
      <head>
        <title>헥토큐앤엠 근태관리시스템</title>
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
