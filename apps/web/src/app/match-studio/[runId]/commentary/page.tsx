import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getMatchStudioRepository } from '@/lib/match-studio/runtime';

export default async function MatchStudioCommentaryPage({
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
      <h1 className="text-xl font-semibold">Commentary review</h1>
      <p className="text-sm text-muted">
        Style: <span className="font-mono">{run.commentary_style}</span>. Patch resolution:{' '}
        <span className="font-mono">{run.patch_resolution}</span>. Grounded commentary must cite
        timeline evidence; unknown patch limits ability claims.
      </p>
      <p className="text-sm text-muted">
        CLI: <code className="font-mono text-xs">pnpm match:commentary -- --timeline-id …</code>
      </p>
    </div>
  );
}
