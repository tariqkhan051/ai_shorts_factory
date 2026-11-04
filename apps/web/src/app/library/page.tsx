export default function LibraryPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold tracking-tight">Video library</h1>
      <p className="max-w-2xl text-muted">
        Completed and approved outputs will appear here after assembly and quality checks (Phases
        5–6). Automatic publishing remains disabled.
      </p>
      <div className="rounded-lg border border-border bg-background-elevated/60 px-4 py-8 text-sm text-muted">
        Library empty — no assembled videos.
      </div>
    </div>
  );
}
