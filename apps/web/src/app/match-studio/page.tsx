import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { getMatchStudioRepository } from '@/lib/match-studio/runtime';

export default async function MatchStudioDashboardPage() {
  const user = await requireUser();
  const runs = await (await getMatchStudioRepository()).listRuns(user.id);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Match Studio</h1>
          <p className="max-w-2xl text-sm text-muted">
            Upload full MLBB Android recordings, review detections, generate grounded commentary,
            and export an edited match plus Shorts. Separate from the generative Flow Shorts
            factory.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/match-studio/ops"
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-background-elevated"
          >
            Ops
          </Link>
          <Link
            href="/match-studio/new"
            className="rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background hover:opacity-90"
          >
            New match
          </Link>
        </div>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Runs</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-muted">
            No Match Studio runs yet. Create one and bind an Original or Advance patch (or mark
            patch unknown).
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-background-elevated text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Title</th>
                  <th className="px-3 py-2 font-medium">Environment</th>
                  <th className="px-3 py-2 font-medium">Patch</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="border-b border-border/70">
                    <td className="px-3 py-2">
                      <Link
                        href={`/match-studio/${run.id}`}
                        className="text-accent hover:underline"
                      >
                        {run.title}
                      </Link>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{run.server_environment}</td>
                    <td className="px-3 py-2 font-mono text-xs">{run.patch_resolution}</td>
                    <td className="px-3 py-2 font-mono text-xs">{run.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-muted">
        Legacy CLI docs remain at{' '}
        <Link href="/match-analysis" className="text-accent hover:underline">
          /match-analysis
        </Link>
        . Game knowledge management:{' '}
        <Link href="/game-knowledge" className="text-accent hover:underline">
          /game-knowledge
        </Link>
        .
      </p>
    </div>
  );
}
