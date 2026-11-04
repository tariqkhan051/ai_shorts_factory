'use client';

import { useState } from 'react';

export function CopyPromptButton({
  text,
  label = 'Copy Prompt',
}: {
  text: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button
      type="button"
      onClick={onCopy}
      className="rounded-md border border-border px-3 py-2 text-sm hover:bg-background"
    >
      {copied ? 'Copied' : label}
    </button>
  );
}
