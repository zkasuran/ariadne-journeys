// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
import { writeFile, mkdir } from 'node:fs/promises';
import { RepairEngine } from '../src/engine.js';
import { checkoutContract, brokenSource } from '../src/checkout.js';

if (process.env.FINISHLINE_APPROVED_TEST !== '0.01') throw new Error('This live test requires approval for one 0.01 test-USDC repair.');
const engine = new RepairEngine('artifacts');
const prepared = await engine.prepare(brokenSource, checkoutContract());
if (prepared.quote.offer.amount !== '10000' || prepared.quote.offer.payTo.toLowerCase() !== '0x3624eb012b5e998bb57b6be6c9cfc9c4bc5eb99b') throw new Error('The live quote changed from the approved terms.');
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/live-quote.json', JSON.stringify(prepared.quote, null, 2), { mode: 0o600 });
const run = await engine.complete(prepared.quote.id, process.env.HOUSE_WALLET_PRIVATE_KEY ?? '');
await writeFile('artifacts/live-run.json', JSON.stringify(run, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ outcome: run.outcome, before: run.before.passedCount, after: run.after.passedCount, total: run.after.total, costAtomic: run.purchase?.costAtomic, receipt: run.purchase?.receiptHash, signal: run.purchase?.signalHash, transaction: run.purchase?.transaction }, null, 2));
if (run.outcome !== 'accepted') process.exitCode = 1;
