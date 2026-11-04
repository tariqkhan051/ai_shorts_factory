'use client';

import { useState } from 'react';

export function CopyPromptButton({ text }: { text: string }) {
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
      className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-background hover:bg-accent/90"
    >
      {copied ? 'Copied' : 'Copy Prompt'}
    </button>
  );
}
