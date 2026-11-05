import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getMatchStudioRepository } from '@/lib/match-studio/runtime';

export default async function MatchStudioOutputsPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const user = await requireUser();
  const { runId } = await params;
  const run = await (await getMatchStudioRepository()).getRun(user.id, runId);
  if (!run) notFound();

  return (
    <div className="space-y-4">
      <Link href={`/match-studio/${runId}`} className="text-xs text-accent hover:underline">
        ← Back to run
      </Link>
      <h1 className="text-xl font-semibold">Outputs & export</h1>
      <p className="text-sm text-muted">
        Full-match and up to two Shorts appear here after render jobs complete. Publishing uses
        existing <strong>manual</strong> distribution confirmation — not automatic YouTube upload.
        Shorts capability: <span className="font-mono text-xs">{run.capability_flags.shorts}</span>.
      </p>
      <p className="text-sm text-muted">
        CLI: <code className="font-mono text-xs">pnpm match:edit -- --timeline-id …</code>
      </p>
    </div>
  );
}
