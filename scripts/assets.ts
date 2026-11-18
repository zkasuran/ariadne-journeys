// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
import { mkdir, writeFile, copyFile, stat } from 'node:fs/promises';

await mkdir('docs/assets', { recursive: true });
for (const theme of ['light', 'dark']) {
  const bg = theme === 'light' ? '#f6f8f5' : '#101b16';
  const ink = theme === 'light' ? '#18362b' : '#ecf4ed';
  const accent = theme === 'light' ? '#186346' : '#a0ddae';
  const svg = `<!-- SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0 --><svg xmlns="http://www.w3.org/2000/svg" width="1280" height="400" viewBox="0 0 1280 400"><rect width="1280" height="400" rx="18" fill="${bg}"/><path d="M820 298V96h140v202h130V154h130" fill="none" stroke="${accent}" stroke-width="5" opacity=".6"/><circle cx="820" cy="298" r="11" fill="${accent}"/><circle cx="1220" cy="154" r="11" fill="${accent}"/><text x="70" y="86" font-family="system-ui,sans-serif" font-size="15" letter-spacing="4" fill="${accent}">CUSTOMER-JOURNEY REPAIR</text><text x="66" y="184" font-family="system-ui,sans-serif" font-size="82" font-weight="650" fill="${ink}">Ariadne</text><text x="70" y="252" font-family="system-ui,sans-serif" font-size="29" fill="${ink}">Finish the checkout you meant to ship.</text><text x="70" y="316" font-family="system-ui,sans-serif" font-size="17" fill="${accent}">Paid repair. Original contract. Real browser.</text></svg>`;
  await writeFile(`docs/assets/banner-${theme}.svg`, svg);
  for (const [source, target] of [[`artifacts/home-${theme}-1360.png`, `docs/assets/hero-${theme}.png`], [`artifacts/paid-repair-${theme}-1360.png`, `docs/assets/repair-${theme}.png`], [`artifacts/paid-checkout-${theme}-1360.png`, `docs/assets/checkout-${theme}.png`]]) {
    if (!source || !target) throw new Error('Missing capture mapping.');
    if (await stat(target).then(() => false, () => true)) await copyFile(source, target);
  }
}
console.log('Generated themed banners and copied the actual product captures.');
