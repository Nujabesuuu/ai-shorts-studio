"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/** Спільний каркас усіх форм: картка, банер помилки, панель дій. */
export default function FormFrame({
  error,
  pending,
  submitLabel,
  cancelHref,
  children,
  aside,
}: {
  error?: string | null;
  pending: boolean;
  submitLabel: string;
  cancelHref: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="card overflow-hidden">
        <div className="space-y-5 p-6 sm:p-7">{children}</div>

        {error && (
          <div className="border-t border-rose/25 bg-rose/10 px-6 py-3.5 sm:px-7">
            <p className="text-[13px] font-medium text-rose">{error}</p>
          </div>
        )}

        <div className="flex items-center gap-3 border-t border-line bg-canvas-2 px-6 py-4 sm:px-7">
          <button type="submit" disabled={pending} className="btn btn-primary">
            {pending ? "Зберігаємо…" : submitLabel}
          </button>
          <Link href={cancelHref} className="btn btn-quiet">
            Скасувати
          </Link>
        </div>
      </div>

      {aside && <div className="space-y-4">{aside}</div>}
    </div>
  );
}

export function Field({
  name,
  label,
  hint,
  children,
}: {
  name: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className="label">
        {label}
      </label>
      {children}
      {hint && <p className="mt-2 text-[12px] leading-snug text-lo">{hint}</p>}
    </div>
  );
}
