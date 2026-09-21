"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Огляд", index: "01", match: (p: string) => p === "/" || p.startsWith("/projects") },
  { href: "/trends", label: "Тренди · Day 1", index: "02", match: (p: string) => p.startsWith("/trends") },
  { href: "/topics", label: "Теми · Day 2", index: "03", match: (p: string) => p.startsWith("/topics") },
  { href: "/content", label: "Контент · Day 3", index: "04", match: (p: string) => p.startsWith("/content") },
  { href: "/videos", label: "Відео · Day 4", index: "05", match: (p: string) => p.startsWith("/videos") },
  { href: "/runs", label: "Прогони", index: "06", match: (p: string) => p.startsWith("/runs") },
];

function Mark() {
  return (
    <Link href="/" className="flex items-center gap-3">
      <span className="relative flex h-9 w-9 items-center justify-center rounded-[10px] border border-accent/45 bg-accent-soft">
        <svg width="12" height="13" viewBox="0 0 12 13" aria-hidden>
          <path d="M1 1.2 11 6.5 1 11.8Z" fill="var(--color-accent)" />
        </svg>
      </span>
      <span className="leading-none">
        <span className="display block text-[15px] text-hi">AI Shorts</span>
        <span className="eyebrow mt-1.5 block">studio console</span>
      </span>
    </Link>
  );
}

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <>
      {/* Мобільна шапка */}
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur-md md:hidden">
        <div className="flex items-center justify-between px-5 py-3.5">
          <Mark />
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3">
          {NAV.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`shrink-0 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                  active
                    ? "bg-accent-soft text-accent"
                    : "text-mid hover:bg-surface-2 hover:text-hi"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      {/* Десктопний рейл */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[252px] flex-col border-r border-line bg-canvas-2/80 backdrop-blur-sm md:flex">
        <div className="px-6 pb-7 pt-7">
          <Mark />
        </div>

        <div className="ticks mx-6 opacity-25" />

        <nav className="flex-1 space-y-1 px-4 pt-6">
          {NAV.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`group relative flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13.5px] font-medium transition-colors ${
                  active
                    ? "bg-accent-soft text-accent"
                    : "text-mid hover:bg-surface-2 hover:text-hi"
                }`}
              >
                <span
                  className={`absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-accent transition-opacity ${
                    active ? "opacity-100" : "opacity-0"
                  }`}
                />
                <span
                  className={`mono text-[10px] tracking-[0.14em] ${
                    active ? "text-accent/70" : "text-lo"
                  }`}
                >
                  {item.index}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4">
          <div className="rounded-xl border border-line bg-surface px-3.5 py-3">
            <div className="flex items-center gap-2">
              <span className="rec-dot h-1.5 w-1.5 rounded-full bg-accent" />
              <span className="eyebrow text-mid">supabase · live</span>
            </div>
            <p className="mono mt-2 truncate text-[11px] text-lo">school_day1</p>
          </div>
        </div>
      </aside>
    </>
  );
}
