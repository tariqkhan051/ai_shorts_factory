#!/usr/bin/env node
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'packages/flow-adapter/package.json'));
const playwright = require('playwright');

const outDir = join(root, 'assets', 'characters');
await mkdir(outDir, { recursive: true });

const browser = await playwright.chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 768, height: 1024 } });
await page.setContent(`<!doctype html>
<html><body style="margin:0;background:#111;display:flex;align-items:center;justify-content:center;height:100vh;font-family:Georgia,serif;color:#f5f0e8">
<section style="width:640px;height:900px;background:linear-gradient(160deg,#1a2330,#0d121a);border:1px solid #334;border-radius:24px;padding:36px;box-sizing:border-box;display:flex;flex-direction:column;gap:20px">
  <div style="font-size:14px;letter-spacing:.2em;text-transform:uppercase;color:#8ab">Character reference · Rina</div>
  <div style="flex:1;border-radius:18px;background:
    radial-gradient(circle at 50% 28%, #3a4a5c 0 18%, transparent 19%),
    linear-gradient(180deg,#243041 0%,#121820 55%,#0a0e14 100%);
    position:relative;overflow:hidden">
    <div style="position:absolute;left:50%;top:18%;transform:translateX(-50%);width:140px;height:140px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#f0d7c0,#b8896a);box-shadow:0 0 0 3px #222"></div>
    <div style="position:absolute;left:50%;top:17%;transform:translateX(-50%);width:150px;height:70px;border-radius:40px 40px 10px 10px;background:#111;opacity:.95"></div>
    <div style="position:absolute;left:50%;top:34%;transform:translateX(-50%);width:210px;height:160px;border-radius:28px;background:linear-gradient(160deg,#d9822b,#a85a12);box-shadow:inset 0 -20px 0 #7a4010"></div>
    <div style="position:absolute;left:58%;top:42%;width:90px;height:70px;border-radius:12px;background:#1c2430;border:2px solid #44aa55;transform:rotate(12deg)"></div>
    <div style="position:absolute;left:50%;top:55%;transform:translateX(-50%);width:120px;height:220px;background:linear-gradient(#1a1f28,#0d1016);border-radius:12px"></div>
    <div style="position:absolute;left:50%;bottom:8%;transform:translateX(-50%);width:160px;height:28px;background:#1a120c;border-radius:8px"></div>
  </div>
  <div style="font-size:22px;font-weight:700">Rina — night courier</div>
  <div style="font-size:15px;line-height:1.45;color:#c9d2de">Short black hair · amber weather jacket · dark pants · boots · courier satchel · determined eyes · rain-specked face. Use as Ingredients reference for consistent character across scenes.</div>
</section>
</body></html>`);

const path = join(outDir, 'rina-courier-reference.png');
await page.locator('section').screenshot({ path });
await writeFile(
  join(outDir, 'rina-courier-reference.json'),
  JSON.stringify(
    {
      name: 'Rina',
      path,
      visual_identity: 'Short black hair, amber jacket, courier satchel',
      purpose: 'Google Flow Ingredients character consistency',
    },
    null,
    2,
  ),
);
await browser.close();
console.log(JSON.stringify({ path }, null, 2));
