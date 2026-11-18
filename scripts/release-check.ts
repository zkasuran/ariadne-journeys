// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
import { readFile, readdir, stat, mkdir, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const required = ['README.md', 'LICENSE', 'NOTICE', 'SECURITY.md', 'DATA-SOURCES.md', 'docs/REFERENCES.md', 'docs/evidence/paid-proof.json'];
for (const path of required) if (!(await stat(path)).size) throw new Error(`Empty release artifact ${path}`);
await mkdir('docs/licenses', { recursive: true });
const require = createRequire(import.meta.url);
const packageRoot = require.resolve('@jitl/quickjs-wasmfile-release-sync/package.json').replace(/package.json$/, '');
await copyFile(join(packageRoot, 'LICENSE'), 'docs/licenses/QuickJS-MIT.txt');
await copyFile('docs/licenses/QuickJS-MIT.txt', 'site/assets/THIRD-PARTY-NOTICES.txt');
const ignored = new Set(['node_modules', 'dist', 'site', '.git', '.hq', 'artifacts', 'submit']);
const publicFiles: string[] = [];
async function walk(path: string): Promise<void> {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (ignored.has(entry.name) || entry.name.startsWith('CONTENT-') || entry.name.startsWith('DEMO-')) continue;
    const name = join(path, entry.name);
    if (entry.isDirectory()) await walk(name);
    else if (entry.isFile()) publicFiles.push(name.replace(/^\.\//, ''));
  }
}
await walk('.');
for (const path of publicFiles) {
  if (/\.env$|\.pem$|\.key$/.test(path)) throw new Error(`Secret-shaped public path ${path}`);
  const bytes = await readFile(path);
  if (path.endsWith('.png')) continue;
  const text = bytes.toString('utf8');
  if (/(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY)/.test(text)) throw new Error(`Secret-shaped value in ${path}`);
}
const manifest = { outboundLicense: 'LicenseRef-zkasuran-SAND-1.0', thirdPartyLicenses: 'Retained in NOTICE and docs/licenses; unchanged QuickJS binary is MIT', binary_wrap: 0, files: await Promise.all(publicFiles.filter(path => path !== 'PROVENANCE.json').map(async path => ({ path, sha256: createHash('sha256').update(await readFile(path)).digest('hex') }))) };
await writeFile('PROVENANCE.json', JSON.stringify(manifest, null, 2));
console.log(`Release presence, notices and secret scan passed: ${publicFiles.length} public files. binary_wrap=0.`);
