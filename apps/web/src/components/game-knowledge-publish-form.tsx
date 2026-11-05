'use client';

import { useActionState } from 'react';
import { PUBLISH_GAME_KNOWLEDGE_PHRASE } from '@ai-shorts-factory/shared-types';
import {
  publishGameKnowledgeAction,
  type GameKnowledgeActionState,
} from '@/app/game-knowledge/actions';

const initial: GameKnowledgeActionState = { ok: false };

export function GameKnowledgePublishForm({
  patchId,
  label,
}: {
  patchId: string;
  label: string;
}) {
  const [state, action, pending] = useActionState(publishGameKnowledgeAction, initial);

  return (
    <form action={action} className="space-y-2 rounded-md border border-border p-3">
      <p className="text-sm font-medium">{label}</p>
      <input type="hidden" name="patch_id" value={patchId} />
      <input
        name="confirm_phrase"
        required
        placeholder={PUBLISH_GAME_KNOWLEDGE_PHRASE}
        className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-border px-3 py-2 text-sm hover:bg-background-elevated disabled:opacity-50"
      >
        {pending ? 'Publishing…' : 'Publish draft'}
      </button>
      {state.message ? (
        <p className={`text-sm ${state.ok ? 'text-foreground' : 'text-red-400'}`}>{state.message}</p>
      ) : null}
      {state.errors?.length ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-red-400">
          {state.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}
