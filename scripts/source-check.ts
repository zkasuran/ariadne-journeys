// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

let checked = 0;
for (const directory of ['src', 'web', 'scripts']) {
  for (const name of await readdir(directory)) {
    if (!name.endsWith('.ts')) continue;
    const text = await readFile(join(directory, name), 'utf8');
    if (/\beval\s*\(|new\s+Function\s*\(|shell\s*:\s*true/.test(text)) throw new Error(`Native dynamic execution is not allowed in ${directory}/${name}`);
    checked++;
  }
}
if (!checked) throw new Error('Source gate inspected no files.');
for (const name of await readdir('site/assets')) {
  if (!name.endsWith('.js')) continue;
  const text = await readFile(join('site/assets', name), 'utf8');
  if (/HOUSE_WALLET_PRIVATE_KEY|privateKeyToAccount|payment pay-local/.test(text)) throw new Error(`Payment signer code leaked into browser bundle ${name}`);
}
console.log(`Source lint passed: ${checked} typed source files, no native eval or shell execution and no browser signer.`);
