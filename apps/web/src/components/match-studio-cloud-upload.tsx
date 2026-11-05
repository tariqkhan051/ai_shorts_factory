'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  abortMatchRecordingUploadAction,
  completeMatchRecordingUploadAction,
  createMatchRecordingUploadSessionAction,
  getMatchUploadCapabilityAction,
  signMatchRecordingUploadPartsAction,
} from '@/app/match-studio/upload-actions';

type UploadPhase =
  | 'idle'
  | 'starting'
  | 'uploading'
  | 'verifying'
  | 'done'
  | 'error'
  | 'cancelled';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function MatchStudioCloudUpload({ runId }: { runId: string }) {
  const [capability, setCapability] = useState<{
    cloudUploadAvailable: boolean;
    provider: string;
    hint: string;
  } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<UploadPhase>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [bytesSent, setBytesSent] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [abortFlag, setAbortFlag] = useState(false);
  const [session, setSession] = useState<{
    key: string;
    uploadId: string;
    partSizeBytes: number;
    partCount: number;
  } | null>(null);

  useEffect(() => {
    void getMatchUploadCapabilityAction().then(setCapability);
  }, []);

  const speedLabel = useMemo(() => {
    if (!startedAt || bytesSent <= 0) return null;
    const elapsed = (Date.now() - startedAt) / 1000;
    if (elapsed <= 0) return null;
    const bps = bytesSent / elapsed;
    const remaining = file ? Math.max(0, file.size - bytesSent) / bps : 0;
    return `${formatBytes(bps)}/s · ~${Math.ceil(remaining)}s left`;
  }, [bytesSent, startedAt, file]);

  const cancelUpload = useCallback(async () => {
    setAbortFlag(true);
    setPhase('cancelled');
    setMessage('Cancelling…');
    if (session) {
      await abortMatchRecordingUploadAction({
        runId,
        key: session.key,
        uploadId: session.uploadId,
      });
    }
    setMessage('Upload cancelled');
  }, [runId, session]);

  const startUpload = useCallback(async () => {
    if (!file || !capability?.cloudUploadAvailable) return;
    setAbortFlag(false);
    setPhase('starting');
    setMessage(null);
    setProgress(0);
    setBytesSent(0);
    setStartedAt(Date.now());

    const created = await createMatchRecordingUploadSessionAction({
      runId,
      filename: file.name,
      contentType: file.type || 'video/mp4',
      byteSize: file.size,
    });
    if (!created.ok) {
      setPhase('error');
      setMessage(created.message);
      return;
    }

    setSession({
      key: created.key,
      uploadId: created.uploadId,
      partSizeBytes: created.partSizeBytes,
      partCount: created.partCount,
    });
    setPhase('uploading');

    const completedParts: Array<{ partNumber: number; etag: string }> = [];
    const concurrency = 3;

    try {
      for (let start = 1; start <= created.partCount; start += concurrency) {
        if (abortFlag) throw new Error('cancelled');
        const batch = Array.from(
          { length: Math.min(concurrency, created.partCount - start + 1) },
          (_, i) => start + i,
        );
        const signed = await signMatchRecordingUploadPartsAction({
          runId,
          key: created.key,
          uploadId: created.uploadId,
          partNumbers: batch,
        });
        if (!signed.ok) throw new Error(signed.message);

        await Promise.all(
          signed.parts.map(async (part) => {
            if (abortFlag) throw new Error('cancelled');
            const offset = (part.partNumber - 1) * created.partSizeBytes;
            const blob = file.slice(offset, offset + created.partSizeBytes);
            const response = await fetch(part.url, {
              method: 'PUT',
              body: blob,
              headers: { 'Content-Type': file.type || 'application/octet-stream' },
            });
            if (!response.ok) {
              throw new Error(`Part ${part.partNumber} failed (${response.status})`);
            }
            const etag = response.headers.get('etag') ?? response.headers.get('ETag');
            if (!etag) throw new Error(`Part ${part.partNumber} missing ETag`);
            completedParts.push({ partNumber: part.partNumber, etag });
            setBytesSent((prev) => {
              const next = Math.min(file.size, prev + blob.size);
              setProgress(Math.round((next / file.size) * 100));
              return next;
            });
          }),
        );
      }

      setPhase('verifying');
      const done = await completeMatchRecordingUploadAction({
        runId,
        key: created.key,
        uploadId: created.uploadId,
        parts: completedParts.sort((a, b) => a.partNumber - b.partNumber),
        originalFilename: file.name,
        expectedByteSize: file.size,
      });
      if (!done.ok) {
        setPhase('error');
        setMessage(done.message);
        return;
      }
      setPhase('done');
      setProgress(100);
      setMessage(done.message);
    } catch (error) {
      if (String(error).includes('cancelled') || abortFlag) {
        setPhase('cancelled');
        setMessage('Upload cancelled');
        return;
      }
      setPhase('error');
      setMessage(error instanceof Error ? error.message : 'Upload failed');
      await abortMatchRecordingUploadAction({
        runId,
        key: created.key,
        uploadId: created.uploadId,
      });
    }
  }, [abortFlag, capability?.cloudUploadAvailable, file, runId]);

  if (!capability) {
    return <p className="text-sm text-muted">Checking upload providers…</p>;
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-4">
      <h3 className="font-medium">Browser cloud upload</h3>
      <p className="text-xs text-muted">{capability.hint}</p>
      {!capability.cloudUploadAvailable ? (
        <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
          Cloud upload unavailable ({capability.provider}). Use local path registration below —
          that is not the same as browser cloud upload.
        </p>
      ) : (
        <>
          <label className="block space-y-1 text-sm">
            <span>Match recording file</span>
            <input
              type="file"
              accept="video/mp4,video/webm,video/quicktime,.mp4,.mkv,.webm,.mov"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setPhase('idle');
                setMessage(null);
                setProgress(0);
              }}
              className="block w-full text-xs"
            />
          </label>
          {file ? (
            <dl className="grid gap-1 text-xs text-muted sm:grid-cols-2">
              <div>
                <dt>Selected</dt>
                <dd className="font-mono text-foreground">{file.name}</dd>
              </div>
              <div>
                <dt>Size</dt>
                <dd className="font-mono text-foreground">{formatBytes(file.size)}</dd>
              </div>
            </dl>
          ) : null}
          {phase === 'uploading' || phase === 'verifying' ? (
            <div className="space-y-1">
              <div className="h-2 overflow-hidden rounded bg-border">
                <div className="h-full bg-accent transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs text-muted">
                {phase === 'verifying' ? 'Verifying object…' : `${progress}%`}
                {speedLabel ? ` · ${speedLabel}` : ''}
              </p>
            </div>
          ) : null}
          {message ? (
            <p
              className={`text-sm ${
                phase === 'done' ? 'text-green-700' : phase === 'error' ? 'text-red-600' : 'text-muted'
              }`}
            >
              {message}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!file || phase === 'uploading' || phase === 'starting' || phase === 'verifying'}
              onClick={() => void startUpload()}
              className="rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-50"
            >
              {phase === 'uploading' || phase === 'starting' ? 'Uploading…' : 'Start multipart upload'}
            </button>
            {(phase === 'uploading' || phase === 'starting') && (
              <button
                type="button"
                onClick={() => void cancelUpload()}
                className="rounded-md border border-border px-3 py-2 text-sm"
              >
                Cancel
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
