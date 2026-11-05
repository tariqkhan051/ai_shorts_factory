'use client';

import { useActionState } from 'react';
import {
  importGameKnowledgeDraftAction,
  previewGameKnowledgeAction,
  type GameKnowledgeActionState,
} from '@/app/game-knowledge/actions';

const initial: GameKnowledgeActionState = { ok: false };

export function GameKnowledgeImportForm() {
  const [previewState, previewAction, previewPending] = useActionState(
    previewGameKnowledgeAction,
    initial,
  );
  const [importState, importAction, importPending] = useActionState(
    importGameKnowledgeDraftAction,
    initial,
  );

  const state = importState.message || importState.errors ? importState : previewState;

  return (
    <div className="space-y-3">
      <form action={previewAction} className="space-y-3">
        <textarea
          name="json"
          rows={14}
          required
          spellCheck={false}
          placeholder='Paste game-knowledge-import-v1 JSON…'
          className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={previewPending}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-background-elevated disabled:opacity-50"
          >
            {previewPending ? 'Previewing…' : 'Preview diff'}
          </button>
          <button
            type="submit"
            formAction={importAction}
            disabled={importPending}
            className="rounded-md bg-foreground px-3 py-2 text-sm text-background disabled:opacity-50"
          >
            {importPending ? 'Importing…' : 'Import as draft'}
          </button>
        </div>
      </form>
      {state.message ? (
        <p className={`text-sm ${state.ok ? 'text-foreground' : 'text-red-400'}`}>{state.message}</p>
      ) : null}
      {state.diffSummary ? <p className="text-sm text-muted">{state.diffSummary}</p> : null}
      {state.warnings?.length ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          {state.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
      {state.errors?.length ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-red-400">
          {state.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
      {state.draftPatchId ? (
        <p className="font-mono text-xs text-muted">draft_patch_id={state.draftPatchId}</p>
      ) : null}
    </div>
  );
}
