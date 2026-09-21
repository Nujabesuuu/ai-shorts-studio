import type { Metadata } from "next";
import { Unbounded, Onest, JetBrains_Mono } from "next/font/google";
import Sidebar from "@/components/Sidebar";
import "./globals.css";

const unbounded = Unbounded({
  variable: "--font-unbounded",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const onest = Onest({
  variable: "--font-onest",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AI Shorts Studio — адмін-панель",
  description:
    "Панель керування пайплайном коротких відео: ніші, тренди Day 1 та теми Day 2.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="uk"
      className={`${unbounded.variable} ${onest.variable} ${jetbrains.variable}`}
    >
      <body className="min-h-screen">
        <Sidebar />
        <div className="relative z-[2] md:pl-[252px]">
          {process.env.NEXT_PUBLIC_DEMO_MODE === "true" && (
            <div
              role="status"
              className="border-b border-line bg-canvas-2 px-5 py-2.5 text-center text-[12.5px] text-amber sm:px-8"
            >
              Демо-версія: лише перегляд. Зміни й затвердження нічого не записують.
            </div>
          )}
          <main className="mx-auto w-full max-w-[1340px] px-5 py-8 sm:px-8 lg:px-10 lg:py-12">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
