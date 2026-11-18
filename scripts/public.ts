// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const base = 'https://ariadne-journeys.pages.dev/';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
await mkdir('artifacts/public', { recursive: true });
const checks: unknown[] = [];
try {
  for (const theme of ['light', 'dark'] as const) for (const width of [390, 1360]) {
    const context = await browser.newContext({ colorScheme: theme, viewport: { width, height: 980 }, deviceScaleFactor: 2, hasTouch: width === 390 });
    const page = await context.newPage(); const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    const response = await page.goto(base, { waitUntil: 'networkidle' });
    if (!response || response.status() !== 200) throw new Error('Public demo is not reachable anonymously.');
    const headers = response.headers();
    if (!headers['content-security-policy']?.includes("frame-ancestors 'none'")) throw new Error('Public CSP header is missing.');
    if (headers['x-content-type-options'] !== 'nosniff') throw new Error('Public nosniff header is missing.');
    await page.screenshot({ path: `docs/assets/hero-${theme}.png`, fullPage: true });
    for (const path of ['/repair', '/method', '/docs', '/contract', '/security', '/evidence']) {
      await page.goto(`${base}#${path}`, { waitUntil: 'networkidle' });
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`Public overflow ${path} ${width}.`);
    }
    await page.goto(`${base}#/repair`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Replay the paid repair' }).click();
    await page.waitForFunction(() => document.getElementById('mode-note')?.textContent?.includes('Recorded paid repair'));
    await page.screenshot({ path: `artifacts/public/repair-${theme}-${width}.png`, fullPage: true });
    if (width === 1360) await page.screenshot({ path: `docs/assets/repair-${theme}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Try the repaired checkout' }).click();
    await page.getByRole('button', { name: 'Place demo order' }).click();
    await page.waitForFunction(() => document.getElementById('order-status')?.textContent?.includes('Demo order completed.'));
    if (width === 1360) await page.screenshot({ path: `docs/assets/checkout-${theme}.png`, fullPage: true });
    if (errors.length) throw new Error(errors.join('\n'));
    checks.push({ theme, width, routes: 6, paidCodeRechecked: true, demoOrderCompleted: true, errors, headersVerified: true });
    await context.close();
  }
  await writeFile('artifacts/public/browser-checks.json', JSON.stringify({ at: new Date().toISOString(), base, checks }, null, 2));
  console.log('Public release passed four real Chrome walkthroughs, six routes, both themes, paid-code replay and order completion.');
} finally { await browser.close(); }
