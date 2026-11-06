export default function Loading() {
  return (
    <div className="space-y-7" aria-busy="true" aria-live="polite" aria-label="Loading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <div className="skeleton h-3 w-16 rounded" />
          <div className="skeleton h-9 w-40 max-w-full rounded" />
          <div className="skeleton h-4 w-56 max-w-full rounded" />
        </div>
        <div className="flex gap-2">
          <div className="skeleton h-10 w-28 rounded-md" />
          <div className="skeleton h-10 w-28 rounded-md" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="skeleton h-20 rounded-lg" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="skeleton h-48 rounded-lg" />
        <div className="skeleton h-48 rounded-lg" />
      </div>
    </div>
  );
}
