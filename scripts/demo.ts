// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { server } from '../src/server.js';
import { brokenSource, exampleCandidate, checkoutContract } from '../src/checkout.js';
import { acceptCandidate } from '../src/engine.js';

const port = 48191;
const app = server(port);
await new Promise<void>((resolve, reject) => { app.once('error', reject); app.listen(port, '127.0.0.1', resolve); });
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const evidence: unknown[] = [];
try {
  for (const theme of ['light', 'dark'] as const) {
    for (const width of [390, 1360]) {
      const context = await browser.newContext({ viewport: { width, height: 980 }, deviceScaleFactor: 2, colorScheme: theme });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`); });
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
      if (await page.locator('html').getAttribute('data-theme') !== theme) throw new Error('System theme was not respected.');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      if (overflow) throw new Error(`Horizontal overflow at ${width} ${theme}.`);
      await page.screenshot({ path: `artifacts/home-${theme}-${width}.png`, fullPage: true });
      await page.getByRole('link', { name: 'Try the checkout', exact: true }).click();
      await page.getByRole('button', { name: 'Place demo order' }).click();
      await page.waitForFunction(() => document.getElementById('order-status')?.textContent?.includes('Order not completed.'));
      await page.screenshot({ path: `artifacts/checkout-before-${theme}-${width}.png`, fullPage: true });
      await page.locator('a[href="#/repair"]').last().click();
      await page.getByRole('button', { name: 'Use example candidate' }).click();
      await page.getByRole('button', { name: 'Check my candidate' }).click();
      await page.waitForFunction(() => document.getElementById('run-status')?.textContent?.includes('Candidate accepted'));
      if (await page.locator('#result-title').textContent() !== '32/32 acceptance cases passed') throw new Error('Browser sandbox did not pass the full contract.');
      await page.screenshot({ path: `artifacts/repair-${theme}-${width}.png`, fullPage: true });
      await page.getByRole('button', { name: 'Try the repaired checkout' }).click();
      await page.getByRole('button', { name: 'Place demo order' }).click();
      await page.waitForFunction(() => document.getElementById('order-status')?.textContent?.includes('Demo order completed.'));
      await page.screenshot({ path: `artifacts/checkout-after-${theme}-${width}.png`, fullPage: true });
      await page.locator('[data-view="checkout"] a[href="#/repair"]').click();
      await page.getByRole('button', { name: 'Replay the paid repair' }).click();
      await page.waitForFunction(() => document.getElementById('mode-note')?.textContent?.includes('Recorded paid repair'));
      if (await page.locator('#result-title').textContent() !== '32/32 acceptance cases passed') throw new Error('Recorded paid answer failed the original browser contract.');
      await page.screenshot({ path: `artifacts/paid-repair-${theme}-${width}.png`, fullPage: true });
      await page.getByRole('button', { name: 'Try the repaired checkout' }).click();
      await page.getByRole('button', { name: 'Place demo order' }).click();
      await page.waitForFunction(() => document.getElementById('order-status')?.textContent?.includes('Demo order completed.'));
      await page.screenshot({ path: `artifacts/paid-checkout-${theme}-${width}.png`, fullPage: true });
      await page.locator('#theme').click();
      await page.reload({ waitUntil: 'networkidle' });
      if (await page.locator('html').getAttribute('data-theme') === theme) throw new Error('Theme choice did not persist.');
      await page.locator('#theme').click();
      if (errors.length) throw new Error(`Browser errors: ${errors.join('\n')}`);
      evidence.push({ theme, width, contractCases: 32, originalOrder: 'refused', repairedOrder: 'completed', recordedPaidRepair: 'rechecked; order completed', errors, themePersistence: true, overflow: false });
      await context.close();
    }
  }
  const run = await acceptCandidate(brokenSource, exampleCandidate, checkoutContract(8183));
  await writeFile('artifacts/manual-run.json', JSON.stringify(run, null, 2));
  await writeFile('artifacts/browser-checks.json', JSON.stringify({ at: new Date().toISOString(), browser: browser.version(), checks: evidence, mode: 'manual candidate; no paid request' }, null, 2));
  console.log(`Real browser walkthroughs passed: ${evidence.length}. Both themes, mobile and desktop. Original order refused; accepted candidate completed the order.`);
} finally { await browser.close(); await new Promise<void>(resolve => app.close(() => resolve())); }
