export default function ProjectsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold tracking-tight">Projects</h1>
      <p className="max-w-2xl text-muted">
        Project create/list/detail arrives in Phase 1 with Supabase persistence. This route exists
        so navigation and layout are stable now.
      </p>
      <div className="rounded-lg border border-border bg-background-elevated/60 px-4 py-8 text-sm text-muted">
        No projects yet — database not connected.
      </div>
    </div>
  );
}
