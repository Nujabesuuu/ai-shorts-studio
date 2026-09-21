export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="h-9 w-64 animate-pulse rounded-lg bg-surface-2" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[120px] animate-pulse rounded-[14px] bg-surface" />
        ))}
      </div>
      <div className="h-[320px] animate-pulse rounded-[14px] bg-surface" />
    </div>
  );
}
