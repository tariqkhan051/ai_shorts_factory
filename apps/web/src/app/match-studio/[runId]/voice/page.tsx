import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createTtsProvider } from '@ai-shorts-factory/media-engine';
import { requireUser } from '@/lib/auth';
import { getMatchStudioRepository } from '@/lib/match-studio/runtime';

export default async function MatchStudioVoicePage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const user = await requireUser();
  const { runId } = await params;
  const run = await (await getMatchStudioRepository()).getRun(user.id, runId);
  if (!run) notFound();

  const tts = createTtsProvider(process.env);

  return (
    <div className="space-y-4">
      <Link href={`/match-studio/${runId}`} className="text-xs text-accent hover:underline">
        ← Back to run
      </Link>
      <h1 className="text-xl font-semibold">Voice narration</h1>
      <p className="text-sm text-muted">
        Provider: <span className="font-mono">{tts.name}</span> — status{' '}
        <span className="font-mono">{tts.status}</span>
      </p>
      {tts.status !== 'ready' ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          Voice generation is unavailable. You can continue with caption-only outputs. Enable local
          mock with <code className="font-mono text-xs">MATCH_TTS_PROVIDER=mock</code> and{' '}
          <code className="font-mono text-xs">MATCH_TTS_ALLOW_MOCK_WITHOUT_SPEND=true</code> (or
          spend gate).
        </p>
      ) : (
        <p className="text-sm text-muted">Mock TTS ready for segment preview (no paid API).</p>
      )}
    </div>
  );
}
