import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPackageMeta } from './index.js';

const srcDir = dirname(fileURLToPath(import.meta.url));

describe('n8n integration Flow safety', () => {
  it('declares no Flow automation', () => {
    const meta = getPackageMeta();
    expect(meta.flowAutomation).toBe(false);
  });

  it('source does not import Playwright or Flow providers', () => {
    const files = [
      'index.ts',
      'publisher.ts',
      'client.ts',
      'orchestration.ts',
      'hmac.ts',
      'events.ts',
      'config.ts',
    ];
    for (const file of files) {
      const source = readFileSync(join(srcDir, file), 'utf8');
      expect(source).not.toMatch(/from ['"]playwright['"]/);
      expect(source).not.toMatch(/require\(['"]playwright['"]\)/);
      expect(source).not.toMatch(/google-flow-playwright/);
      expect(source).not.toMatch(/submitGeneration/);
      expect(source).not.toMatch(/FLOW_ALLOW_PLAYWRIGHT/);
      expect(source).not.toMatch(/puppeteer/i);
      expect(source).not.toMatch(/selenium/i);
    }
  });
});

