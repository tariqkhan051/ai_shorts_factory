'use client';

import { useState } from 'react';
import { CopyPromptButton } from '@/components/copy-prompt-button';
import { formatHashtags, formatPublishingPackText } from '@/lib/assembly/publishing-pack';

type Props = {
  projectId: string;
  videoSrc: string;
  title: string;
  description: string;
  tags: string[];
};

export function AssemblyDownloadPanel({
  projectId,
  videoSrc,
  title,
  description,
  tags,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hashtags = formatHashtags(tags);
  const packText = formatPublishingPackText({ title, description, tags });
  const downloadVideoHref = `${videoSrc}?download=1`;
  const publishingHref = `/api/projects/${projectId}/assembly/publishing`;

  async function downloadBoth() {
    setBusy(true);
    setError(null);
    try {
      // Sequential downloads from a single user gesture; browsers usually allow both.
      triggerDownload(downloadVideoHref);
      await new Promise((resolve) => window.setTimeout(resolve, 250));
      triggerDownload(publishingHref);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-md border border-border bg-background/40 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="text-sm font-medium">Publishing details</h3>
          <CopyPromptButton text={packText} label="Copy all" />
        </div>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Title</dt>
            <dd className="mt-1 flex flex-wrap items-start justify-between gap-2">
              <span className="text-foreground">{title || '—'}</span>
              {title ? <CopyPromptButton text={title} label="Copy title" /> : null}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Description</dt>
            <dd className="mt-1 flex flex-wrap items-start justify-between gap-2">
              <span className="whitespace-pre-wrap text-foreground">{description || '—'}</span>
              {description ? (
                <CopyPromptButton text={description} label="Copy description" />
              ) : null}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Hashtags</dt>
            <dd className="mt-1 flex flex-wrap items-start justify-between gap-2">
              <span className="font-mono text-xs text-foreground">{hashtags || '—'}</span>
              {hashtags ? <CopyPromptButton text={hashtags} label="Copy hashtags" /> : null}
            </dd>
          </div>
        </dl>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={downloadBoth}
          disabled={busy}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-background hover:bg-accent/90 disabled:opacity-60"
        >
          {busy ? 'Preparing…' : 'Download video + details'}
        </button>
        <a
          href={downloadVideoHref}
          className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-background"
        >
          Download MP4 only
        </a>
        <a
          href={publishingHref}
          className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-background"
        >
          Download details (.txt)
        </a>
        <a
          href={videoSrc}
          target="_blank"
          rel="noreferrer"
          className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-background"
        >
          Open in new tab
        </a>
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <p className="text-xs text-muted">
        “Download video + details” saves the MP4 and a text file with title, description, and
        hashtags for posting.
      </p>
    </div>
  );
}

function triggerDownload(href: string) {
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = '';
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
