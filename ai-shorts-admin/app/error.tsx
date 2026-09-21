"use client";

import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <p className="eyebrow mb-4 text-rose">error</p>
      <h1 className="display text-[28px] text-hi">Не вдалося завантажити дані</h1>
      <p className="mono mt-4 max-w-xl break-words rounded-xl border border-line bg-canvas-2 px-4 py-3 text-[12px] text-mid">
        {error.message}
      </p>
      <div className="mt-7 flex gap-2.5">
        <button type="button" onClick={reset} className="btn btn-primary">
          Спробувати ще раз
        </button>
        <Link href="/" className="btn btn-ghost">
          На головну
        </Link>
      </div>
    </div>
  );
}
