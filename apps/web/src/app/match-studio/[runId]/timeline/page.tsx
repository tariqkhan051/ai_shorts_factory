import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import {
  getMatchStudioRepository,
  getMatchTimelineRepository,
} from '@/lib/match-studio/runtime';
import { MatchStudioTimelineEditor } from '@/components/match-studio-timeline-editor';

export default async function MatchStudioTimelinePage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const user = await requireUser();
  const { runId } = await params;
  const run = await (await getMatchStudioRepository()).getRun(user.id, runId);
  if (!run) notFound();

  const timelines = run.match_source_id
    ? await (await getMatchTimelineRepository()).listTimelinesForSource(
        user.id,
        run.match_source_id,
      )
    : [];

  return (
    <div className="space-y-4">
      <Link href={`/match-studio/${runId}`} className="text-xs text-accent hover:underline">
        ← Back to run
      </Link>
      <h1 className="text-xl font-semibold">Event timeline</h1>
      <p className="text-sm text-muted">
        Status: <span className="font-mono">{run.status}</span>. Machine predictions are preserved
        on correction (`original_prediction`). Scoreboard/minimap:{' '}
        <span className="font-mono">{run.capability_flags.scoreboard}</span> /{' '}
        <span className="font-mono">{run.capability_flags.minimap}</span>. Audio:{' '}
        <span className="font-mono">{run.capability_flags.audio_events}</span>.
      </p>
      <MatchStudioTimelineEditor
        runId={runId}
        timelines={timelines.map((t) => ({
          id: t.id,
          status: t.status,
          events: t.events,
        }))}
      />
    </div>
  );
}
