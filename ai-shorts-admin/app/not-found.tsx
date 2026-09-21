import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <p className="eyebrow mb-4">404 · not found</p>
      <h1 className="display text-[30px] text-hi">Такого запису немає</h1>
      <p className="mt-3 max-w-sm text-[14px] text-mid">
        Можливо, його видалили або посилання застаріло.
      </p>
      <Link href="/" className="btn btn-primary mt-7">
        До списку проєктів
      </Link>
    </div>
  );
}
