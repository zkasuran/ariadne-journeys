// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
import { readFile } from 'node:fs/promises';
import { record } from '../src/contract.js';

const data: unknown = JSON.parse(await readFile('docs/evidence/paid-proof.json', 'utf8'));
if (!record(data) || !record(data.run) || !record(data.run.purchase) || !record(data.run.before) || !record(data.run.after)) throw new Error('Missing paid proof.');
const { run } = data;
const purchase = run.purchase as Record<string, unknown>;
console.log('Ariadne / recorded Ethereum Sepolia repair');
console.log(`Provider: ${String(purchase.miner)}`);
console.log(`Intent: ${String(purchase.intent)}`);
console.log(`Purchase: ${Number(purchase.costAtomic) / 1000000} test USDC`);
console.log(`Original: ${String((run.before as Record<string, unknown>).passedCount)}/32`);
console.log(`Candidate: ${String((run.after as Record<string, unknown>).passedCount)}/32`);
console.log(`Outcome: ${String(run.outcome)}`);
console.log(`Signal: ${String(purchase.signalHash)}`);
console.log(`Receipt: ${String(purchase.receiptHash)}`);
console.log(`Settlement: ${String(purchase.transaction)}`);
console.log('Browser outcome: the controlled demo order completes.');
console.log('Production customers and revenue: not established.');
