import Link from 'next/link';
import { requireUser } from '@/lib/auth';

export default async function MatchAnalysisPage() {
  await requireUser();

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Match analysis</h1>
        <p className="max-w-2xl text-sm text-muted">
          Local match intelligence: roster OCR, event timelines, grounded commentary, and
          event-based FFmpeg edits / Shorts. Paid cloud vision APIs are not used.
        </p>
      </header>

      <section className="space-y-2 rounded-md border border-border p-4 text-sm">
        <h2 className="font-medium">1. Publish game knowledge</h2>
        <p className="text-muted">
          Import Original/Advance patches from{' '}
          <Link href="/game-knowledge" className="text-accent hover:underline">
            Game KB
          </Link>
          .
        </p>
      </section>

      <section className="space-y-2 rounded-md border border-border p-4 text-sm">
        <h2 className="font-medium">2. Roster OCR</h2>
        <code className="block overflow-x-auto rounded bg-background-elevated p-2 font-mono text-xs">
          pnpm match:analyze-roster -- --video path/to/match.mp4 --patch-id &lt;uuid&gt; --env
          original --ocr-text-file roster.txt
        </code>
      </section>

      <section className="space-y-2 rounded-md border border-border p-4 text-sm">
        <h2 className="font-medium">3. Event timeline</h2>
        <p className="text-muted">
          Detects kill / Turtle / Lord / turret / teamfight candidates, links pre/main/post
          windows, supports human correction, and exports JSON.
        </p>
        <code className="block overflow-x-auto rounded bg-background-elevated p-2 font-mono text-xs">
          pnpm match:analyze-timeline -- --video path/to/match.mp4 --patch-id &lt;uuid&gt; --env
          original --ocr-text-file killfeed.txt
        </code>
        <code className="block overflow-x-auto rounded bg-background-elevated p-2 font-mono text-xs">
          pnpm match:analyze-timeline -- --export-timeline &lt;timelineId&gt;
        </code>
      </section>

      <section className="space-y-2 rounded-md border border-border p-4 text-sm">
        <h2 className="font-medium">4. Grounded commentary</h2>
        <p className="text-muted">
          Builds commentary only from verified timeline events + the activated patch. Unevidenced
          kills/players/abilities fail validation. Optional ChatGPT polish is copy/paste only and
          cannot invent facts.
        </p>
        <code className="block overflow-x-auto rounded bg-background-elevated p-2 font-mono text-xs">
          pnpm match:commentary -- --timeline-id &lt;uuid&gt; --match-source-id &lt;uuid&gt;
        </code>
        <code className="block overflow-x-auto rounded bg-background-elevated p-2 font-mono text-xs">
          pnpm match:commentary -- --timeline-id &lt;uuid&gt; --match-source-id &lt;uuid&gt;
          --polish-file polished.json
        </code>
      </section>

      <section className="space-y-2 rounded-md border border-border p-4 text-sm">
        <h2 className="font-medium">5. Event-based edit + Shorts</h2>
        <p className="text-muted">
          Cuts verified event windows with pre/post pads, speeds up boring gaps, burns commentary
          captions, and exports one condensed vertical edit plus up to two Shorts (≤59s). Outputs
          stay draft until you confirm <code>APPROVE_MATCH_DISTRIBUTION</code>.
        </p>
        <code className="block overflow-x-auto rounded bg-background-elevated p-2 font-mono text-xs">
          pnpm match:edit -- --timeline-id &lt;uuid&gt; --video path/to/match.mp4
          --commentary-file commentary.json
        </code>
        <code className="block overflow-x-auto rounded bg-background-elevated p-2 font-mono text-xs">
          pnpm match:edit -- --approve-edit &lt;editId&gt; --confirm APPROVE_MATCH_DISTRIBUTION
        </code>
      </section>

      <section className="space-y-2 rounded-md border border-border p-4 text-sm">
        <h2 className="font-medium">6. Automation &amp; cost controls</h2>
        <p className="text-muted">
          KB artifact sync, spend flags (default off), and roster/timeline cache metrics. See{' '}
          <code className="font-mono text-xs">pnpm game-knowledge:sync</code> and env{' '}
          <code className="font-mono text-xs">MATCH_PAID_VISION_ENABLED</code> /{' '}
          <code className="font-mono text-xs">MATCH_TTS_SPEND_ENABLED</code>.
        </p>
      </section>
    </div>
  );
}
