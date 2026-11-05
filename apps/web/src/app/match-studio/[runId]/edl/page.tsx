import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getMatchStudioRepository } from '@/lib/match-studio/runtime';

export default async function MatchStudioEdlPage({
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
      <h1 className="text-xl font-semibold">Editing decisions</h1>
      <p className="text-sm text-muted">
        Full-match EDL builds on <code className="font-mono text-xs">buildMatchEditPlan</code> /
        <code className="font-mono text-xs">renderFullMatch</code>. Shorts factory{' '}
        <code className="font-mono text-xs">assembleProject</code> (≤59s / 5 scenes) is not used
        here. Capability: {run.capability_flags.full_match_render}.
      </p>
    </div>
  );
}
