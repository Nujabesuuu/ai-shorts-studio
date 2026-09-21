import Link from "next/link";
import type { ReactNode } from "react";

/* ---------------- заголовок сторінки ---------------- */

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  backHref,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  backHref?: string;
}) {
  return (
    <header className="rise mb-9">
      {backHref && (
        <Link
          href={backHref}
          className="eyebrow mb-4 inline-flex items-center gap-2 transition-colors hover:text-accent"
        >
          <span aria-hidden>←</span> назад
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
          <h1 className="display text-[26px] leading-[1.15] text-hi sm:text-[34px]">
            {title}
          </h1>
          {subtitle && (
            <div className="mt-3 text-[14px] leading-relaxed text-mid">
              {subtitle}
            </div>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2.5">{actions}</div>}
      </div>
      <div className="ticks mt-7 opacity-30" />
    </header>
  );
}

/* ---------------- плитка метрики ---------------- */

export function StatTile({
  label,
  value,
  hint,
  tone = "default",
  delay = 0,
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: "default" | "accent";
  delay?: number;
}) {
  return (
    <div
      className="card card-hover rise relative overflow-hidden p-5"
      style={{ "--d": `${delay}ms` } as React.CSSProperties}
    >
      {tone === "accent" && (
        <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent to-transparent opacity-70" />
      )}
      <p className="eyebrow">{label}</p>
      <p
        className={`display mt-4 text-[34px] leading-none tabular-nums ${
          tone === "accent" ? "text-accent" : "text-hi"
        }`}
      >
        {value}
      </p>
      {hint && <p className="mono mt-2.5 text-[11px] text-lo">{hint}</p>}
    </div>
  );
}

/* ---------------- секція ---------------- */

export function Section({
  index,
  title,
  meta,
  actions,
  children,
  delay = 0,
}: {
  index: string;
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  delay?: number;
}) {
  return (
    <section
      className="rise"
      style={{ "--d": `${delay}ms` } as React.CSSProperties}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <span className="mono text-[11px] tracking-[0.16em] text-accent">
            {index}
          </span>
          <h2 className="display text-[17px] text-hi">{title}</h2>
          {meta && <span className="mono text-[11px] text-lo">{meta}</span>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

/* ---------------- порожній стан ---------------- */

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-canvas-2">
        <span className="mono text-[15px] text-lo">∅</span>
      </div>
      <p className="text-[14.5px] font-medium text-hi">{title}</p>
      {hint && <p className="mt-1.5 max-w-sm text-[13px] text-lo">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ---------------- пошук (GET-форма, без JS) ---------------- */

export function SearchField({
  action,
  defaultValue,
  placeholder,
}: {
  action: string;
  defaultValue?: string;
  placeholder: string;
}) {
  return (
    <form action={action} className="relative w-full sm:w-[300px]">
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-label={placeholder}
        className="field h-[38px] py-0 pl-9 text-[13.5px]"
      />
      <svg
        className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-lo"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        aria-hidden
      >
        <circle cx="7" cy="7" r="4.75" />
        <path d="m11 11 3.5 3.5" strokeLinecap="round" />
      </svg>
    </form>
  );
}

/* ---------------- хештеги ---------------- */

export function Hashtags({ tags }: { tags: string[] | null }) {
  if (!tags?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="mono rounded-md border border-line bg-canvas-2 px-1.5 py-1 text-[10.5px] text-mid"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}
