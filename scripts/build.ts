// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
import { build } from 'esbuild';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { checkoutContract, brokenSource } from '../src/checkout.js';
import { verifySignal } from '../src/commitment.js';
import { record, boundedJson, canonical } from '../src/contract.js';

const require = createRequire(import.meta.url);
await mkdir('site/assets', { recursive: true });
await build({ entryPoints: { app: 'web/app.ts', worker: 'web/worker.ts' }, outdir: 'site/assets', bundle: true, splitting: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true, sourcemap: false, legalComments: 'eof', logLevel: 'warning' });
await copyFile(require.resolve('@jitl/quickjs-wasmfile-release-sync/wasm'), 'site/assets/quickjs.wasm');
await copyFile('web/style.css', 'site/assets/style.css');
await writeFile('site/assets/favicon.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#186346"/><path d="M12 28 28 12M13 12h15v15" fill="none" stroke="#fff" stroke-width="3"/></svg>');
const html = await readFile('web/index.html', 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
if (!script) throw new Error('No first-paint theme script.');
const themeHash = createHash('sha256').update(script).digest('base64');
const csp = `default-src 'none'; script-src 'self' 'sha256-${themeHash}' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors 'none'`;
await writeFile('site/index.html', html.replace('<meta name="description"', `<meta http-equiv="Content-Security-Policy" content="${csp.replace('; frame-ancestors \'none\'', '')}"><meta name="description"`));
await writeFile('site/security.json', JSON.stringify({ csp }));
await writeFile('site/_headers', `/*\n  Content-Security-Policy: ${csp}\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Strict-Transport-Security: max-age=31536000; includeSubDomains\n  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()\n`);
await mkdir('docs/evidence', { recursive: true });
let proof: unknown;
try { proof = JSON.parse(await readFile('artifacts/live-run.json', 'utf8')); }
catch { proof = JSON.parse(await readFile('docs/evidence/paid-proof.json', 'utf8')).run; }
if (!record(proof) || typeof proof.candidate !== 'string' || !record(proof.purchase) || !record(proof.purchase.request) || typeof proof.purchase.request.query !== 'string' || typeof proof.purchase.signalHash !== 'string' || typeof proof.purchase.buyer !== 'string') throw new Error('Verified paid release evidence is required.');
verifySignal(proof.purchase.signal, proof.purchase.signalHash, proof.purchase.buyer, proof.purchase.request.query);
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
if (proof.sourceHash !== sha(brokenSource) || proof.candidateHash !== sha(proof.candidate) || proof.contractHash !== sha(canonical(boundedJson(checkoutContract())))) throw new Error('Release source or contract does not match the paid proof.');
const exported = JSON.stringify({ source: brokenSource, contract: checkoutContract(), run: proof }, null, 2);
await writeFile('docs/evidence/paid-proof.json', exported);
await writeFile('site/assets/paid-proof.json', exported);
console.log('Built Ariadne with a strict CSP and a local WebAssembly sandbox.');
