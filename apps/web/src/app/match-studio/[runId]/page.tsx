import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import {
  getMatchAnalysisRepository,
  getMatchJobQueue,
  getMatchStudioRepository,
} from '@/lib/match-studio/runtime';
import { RegisterMatchRecordingForm } from '@/components/register-match-recording-form';
import { MatchStudioCloudUpload } from '@/components/match-studio-cloud-upload';
import { advanceMatchStudioStatusAction } from '@/app/match-studio/actions';

export default async function MatchStudioRunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const user = await requireUser();
  const { runId } = await params;
  const studio = await getMatchStudioRepository();
  const run = await studio.getRun(user.id, runId);
  if (!run) notFound();

  const source = run.match_source_id
    ? await (await getMatchAnalysisRepository()).getSource(user.id, run.match_source_id)
    : null;
  const jobs = await (await getMatchJobQueue()).listByProject(run.project_id);

  const nextHints: Partial<Record<typeof run.status, string>> = {
    ready_for_analysis: 'analyzing',
    analyzing: 'awaiting_timeline_review',
    awaiting_timeline_review: 'commentary_pending',
    commentary_pending: 'awaiting_commentary_review',
    awaiting_commentary_review: 'voice_pending',
    voice_pending: 'edl_pending',
    awaiting_voice_approval: 'edl_pending',
    edl_pending: 'awaiting_edit_review',
    awaiting_edit_review: 'rendering',
    rendering: 'awaiting_final_approval',
    awaiting_final_approval: 'completed',
  };

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs text-muted">
          <Link href="/match-studio" className="text-accent hover:underline">
            Match Studio
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{run.title}</h1>
        <div className="flex flex-wrap gap-3 text-xs font-mono text-muted">
          <span>status: {run.status}</span>
          <span>env: {run.server_environment}</span>
          <span>patch: {run.patch_resolution}</span>
          <span>tts: {run.capability_flags.tts}</span>
          <span>audio: {run.capability_flags.audio_events}</span>
          <span>scoreboard: {run.capability_flags.scoreboard}</span>
        </div>
        {run.last_error ? <p className="text-sm text-red-600">{run.last_error}</p> : null}
      </header>

      <section className="space-y-2 rounded-md border border-border p-4 text-sm">
        <h2 className="font-medium">Capabilities</h2>
        <ul className="grid gap-1 sm:grid-cols-2">
          {Object.entries(run.capability_flags).map(([key, value]) => (
            <li key={key} className="font-mono text-xs">
              {key}: {value}
            </li>
          ))}
        </ul>
      </section>

      {!source ? (
        <div className="space-y-4">
          <MatchStudioCloudUpload runId={run.id} />
          <RegisterMatchRecordingForm runId={run.id} />
        </div>
      ) : null}

      {source ? (
        <section className="space-y-2 rounded-md border border-border p-4 text-sm">
          <h2 className="font-medium">Recording</h2>
          <dl className="grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-muted">Path</dt>
              <dd className="font-mono text-xs break-all">{source.local_path || '—'}</dd>
            </div>
            <div>
              <dt className="text-muted">Storage key</dt>
              <dd className="font-mono text-xs break-all">{source.storage_key || '—'}</dd>
            </div>
            <div>
              <dt className="text-muted">Ingest</dt>
              <dd className="font-mono text-xs">{source.ingest_status}</dd>
            </div>
            <div>
              <dt className="text-muted">Duration</dt>
              <dd className="font-mono text-xs">{source.duration_seconds ?? '—'}s</dd>
            </div>
            <div>
              <dt className="text-muted">Probe</dt>
              <dd className="font-mono text-xs">
                {String(source.probe_json.width ?? '?')}x{String(source.probe_json.height ?? '?')}{' '}
                {String(source.probe_json.videoCodec ?? '')}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      <section className="space-y-3 rounded-md border border-border p-4 text-sm">
        <h2 className="font-medium">Workflow steps</h2>
        <ol className="list-decimal space-y-1 pl-5 text-muted">
          <li>
            <Link href={`/match-studio/${run.id}/timeline`} className="text-accent hover:underline">
              Timeline / corrections
            </Link>
          </li>
          <li>
            <Link
              href={`/match-studio/${run.id}/commentary`}
              className="text-accent hover:underline"
            >
              Commentary review
            </Link>
          </li>
          <li>
            <Link href={`/match-studio/${run.id}/voice`} className="text-accent hover:underline">
              Voice preview
            </Link>
          </li>
          <li>
            <Link href={`/match-studio/${run.id}/edl`} className="text-accent hover:underline">
              Editing decisions
            </Link>
          </li>
          <li>
            <Link href={`/match-studio/${run.id}/outputs`} className="text-accent hover:underline">
              Outputs / export
            </Link>
          </li>
        </ol>
        {nextHints[run.status] ? (
          <form
            action={async () => {
              'use server';
              await advanceMatchStudioStatusAction(run.id, nextHints[run.status]!);
            }}
          >
            <button
              type="submit"
              className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-background-elevated"
            >
              Advance to {nextHints[run.status]}
            </button>
          </form>
        ) : null}
      </section>

      <section className="space-y-2 rounded-md border border-border p-4 text-sm">
        <h2 className="font-medium">Jobs</h2>
        {jobs.length === 0 ? (
          <p className="text-muted">No jobs yet.</p>
        ) : (
          <ul className="space-y-1 font-mono text-xs">
            {jobs.map((job) => (
              <li key={job.id}>
                {job.jobType} — {job.state}
                {job.lastError ? ` — ${job.lastError}` : ''}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
