'use client';

import { useRef, useState, useTransition } from 'react';
import { uploadManualSceneVideoAction } from '@/app/projects/[id]/flow-package/actions';

type Props = {
  projectId: string;
  sceneId: string;
  sceneNumber: number;
  disabled?: boolean;
};

export function ManualSceneUpload({ projectId, sceneId, sceneNumber, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credit, setCredit] = useState('');
  const [allowReplace, setAllowReplace] = useState(false);
  const [pending, startTransition] = useTransition();

  function submitFile(file: File | undefined) {
    if (!file || disabled) return;
    setError(null);
    const formData = new FormData();
    formData.set('projectId', projectId);
    formData.set('sceneId', sceneId);
    formData.set('video', file);
    if (credit.trim()) {
      formData.set('confirmedCreditCost', credit.trim());
    }
    if (allowReplace) {
      formData.set('allowReplace', 'true');
    }
    startTransition(async () => {
      try {
        await uploadManualSceneVideoAction(formData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed');
      }
    });
  }

  return (
    <div className="space-y-2">
      <label className="block text-xs uppercase tracking-wide text-muted">
        Confirmed credit cost (optional — operator-reported, not auto-verified)
        <input
          type="text"
          value={credit}
          onChange={(event) => setCredit(event.target.value)}
          placeholder="e.g. 10 or unknown"
          disabled={disabled || pending}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
        />
      </label>
      <label className="flex items-center gap-2 text-xs text-muted">
        <input
          type="checkbox"
          checked={allowReplace}
          onChange={(event) => setAllowReplace(event.target.checked)}
          disabled={disabled || pending}
        />
        Explicitly replace an already verified REAL_GENERATED asset (audited)
      </label>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          submitFile(event.dataTransfer.files?.[0]);
        }}
        className={`rounded-md border border-dashed px-4 py-6 text-center text-sm ${
          dragOver ? 'border-accent bg-accent/5' : 'border-border'
        } ${disabled ? 'opacity-50' : ''}`}
      >
        <p className="text-muted">
          Drag & drop scene {sceneNumber} MP4 here, or{' '}
          <button
            type="button"
            className="text-accent underline"
            disabled={disabled || pending}
            onClick={() => inputRef.current?.click()}
          >
            choose file
          </button>
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,.mp4"
          className="hidden"
          disabled={disabled || pending}
          onChange={(event) => submitFile(event.target.files?.[0])}
        />
      </div>
      {pending ? <p className="text-xs text-muted">Verifying with FFprobe…</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
