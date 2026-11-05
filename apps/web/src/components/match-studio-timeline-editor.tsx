'use client';

import { useActionState, useMemo, useState } from 'react';
import {
  addManualTimelineEventAction,
  correctTimelineEventAction,
  setTimelineStatusAction,
  type TimelineActionState,
} from '@/app/match-studio/timeline-actions';

type TimelineEvent = {
  id?: string;
  event_type: string;
  timestamp_seconds: number;
  confidence: number;
  participants: Array<{
    player_tag?: string | null;
    hero_key?: string | null;
    hero_name?: string | null;
    team?: string | null;
  }>;
  evidence: unknown[];
  notes: string;
  rejected: boolean;
  source: string;
};

type Timeline = {
  id: string;
  status: string;
  events: TimelineEvent[];
};

const EVENT_TYPES = ['kill', 'turtle', 'lord', 'turret', 'teamfight', 'other'] as const;
const initial: TimelineActionState = { ok: false };

export function MatchStudioTimelineEditor({
  runId,
  timelines,
}: {
  runId: string;
  timelines: Timeline[];
}) {
  const [timelineId, setTimelineId] = useState(timelines[0]?.id ?? '');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [playerQuery, setPlayerQuery] = useState('');
  const active = timelines.find((t) => t.id === timelineId) ?? timelines[0];

  const filtered = useMemo(() => {
    if (!active) return [];
    return active.events.filter((event) => {
      if (typeFilter !== 'all' && event.event_type !== typeFilter) return false;
      if (!playerQuery.trim()) return true;
      const q = playerQuery.trim().toLowerCase();
      return (event.participants ?? []).some(
        (p) =>
          (p.player_tag ?? '').toLowerCase().includes(q) ||
          (p.hero_name ?? '').toLowerCase().includes(q) ||
          (p.hero_key ?? '').toLowerCase().includes(q),
      );
    });
  }, [active, playerQuery, typeFilter]);

  if (timelines.length === 0) {
    return (
      <p className="text-sm text-muted">
        No timelines persisted for this run yet. Generate one via the Match Studio analysis CLI /
        worker, then refresh — corrections will persist in the configured store.
      </p>
    );
  }

  const correctBound = correctTimelineEventAction.bind(null, runId, active!.id);
  const addBound = addManualTimelineEventAction.bind(null, runId, active!.id);
  const [correctState, correctAction, correctPending] = useActionState(correctBound, initial);
  const [addState, addAction, addPending] = useActionState(addBound, initial);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 text-sm">
        <label className="space-y-1">
          <span className="text-muted">Timeline</span>
          <select
            className="block rounded-md border border-border bg-background px-2 py-1"
            value={active?.id}
            onChange={(e) => setTimelineId(e.target.value)}
          >
            {timelines.map((t) => (
              <option key={t.id} value={t.id}>
                {t.id.slice(0, 8)}… ({t.status}, {t.events.length} events)
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-muted">Event type</span>
          <select
            className="block rounded-md border border-border bg-background px-2 py-1"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="all">all</option>
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-muted">Player / hero search</span>
          <input
            className="block rounded-md border border-border bg-background px-2 py-1"
            value={playerQuery}
            onChange={(e) => setPlayerQuery(e.target.value)}
            placeholder="tag or hero"
          />
        </label>
        <button
          type="button"
          className="self-end rounded-md border border-border px-3 py-1.5 text-xs"
          onClick={() => void setTimelineStatusAction(runId, active!.id, 'approved')}
        >
          Approve timeline
        </button>
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="min-w-full text-left text-xs">
          <thead className="border-b border-border bg-background-elevated text-muted">
            <tr>
              <th className="px-2 py-2">Time</th>
              <th className="px-2 py-2">Type</th>
              <th className="px-2 py-2">Conf</th>
              <th className="px-2 py-2">Participants</th>
              <th className="px-2 py-2">Source</th>
              <th className="px-2 py-2">Evidence</th>
              <th className="px-2 py-2">Edit</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((event) => (
              <tr key={event.id} className="border-b border-border/60 align-top">
                <td className="px-2 py-2 font-mono">{event.timestamp_seconds.toFixed(1)}s</td>
                <td className="px-2 py-2 font-mono">{event.event_type}</td>
                <td className="px-2 py-2 font-mono">{event.confidence.toFixed(2)}</td>
                <td className="px-2 py-2">
                  {(event.participants ?? [])
                    .map(
                      (p) =>
                        `${p.player_tag ?? '?'} / ${p.hero_name ?? p.hero_key ?? '?'} (${p.team ?? '?'})`,
                    )
                    .join('; ') || '—'}
                </td>
                <td className="px-2 py-2 font-mono">
                  {event.source}
                  {event.rejected ? ' · rejected' : ''}
                </td>
                <td className="px-2 py-2 font-mono">{event.evidence?.length ?? 0}</td>
                <td className="px-2 py-2">
                  {event.id ? (
                    <form action={correctAction} className="space-y-1">
                      <input type="hidden" name="event_id" value={event.id} />
                      <input
                        name="timestamp_seconds"
                        defaultValue={event.timestamp_seconds}
                        className="w-20 rounded border border-border bg-background px-1 py-0.5 font-mono"
                      />
                      <select
                        name="event_type"
                        defaultValue={event.event_type}
                        className="block rounded border border-border bg-background px-1 py-0.5"
                      >
                        {EVENT_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                      <textarea
                        name="participants_json"
                        defaultValue={JSON.stringify(event.participants ?? [], null, 0)}
                        className="block h-16 w-56 rounded border border-border bg-background px-1 py-0.5 font-mono"
                      />
                      <label className="flex items-center gap-1">
                        <input type="checkbox" name="rejected" defaultChecked={event.rejected} />
                        false detection
                      </label>
                      <input
                        name="notes"
                        defaultValue={event.notes}
                        placeholder="notes"
                        className="block w-56 rounded border border-border bg-background px-1 py-0.5"
                      />
                      <button
                        type="submit"
                        disabled={correctPending}
                        className="rounded bg-foreground px-2 py-1 text-[11px] text-background disabled:opacity-50"
                      >
                        Save correction
                      </button>
                    </form>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {correctState.message ? (
        <p className={`text-sm ${correctState.ok ? 'text-green-700' : 'text-red-600'}`}>
          {correctState.message}
        </p>
      ) : null}

      <form action={addAction} className="space-y-2 rounded-md border border-border p-3 text-sm">
        <h3 className="font-medium">Add manual event</h3>
        <div className="flex flex-wrap gap-2">
          <select name="event_type" defaultValue="kill" className="rounded border border-border px-2 py-1">
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            name="timestamp_seconds"
            type="number"
            step="0.1"
            min="0"
            required
            placeholder="timestamp s"
            className="w-28 rounded border border-border px-2 py-1 font-mono"
          />
          <input
            name="notes"
            placeholder="notes"
            className="min-w-[12rem] flex-1 rounded border border-border px-2 py-1"
          />
          <button
            type="submit"
            disabled={addPending}
            className="rounded bg-foreground px-3 py-1 text-background disabled:opacity-50"
          >
            Add
          </button>
        </div>
        {addState.message ? (
          <p className={`text-xs ${addState.ok ? 'text-green-700' : 'text-red-600'}`}>
            {addState.message}
          </p>
        ) : null}
      </form>
    </div>
  );
}
