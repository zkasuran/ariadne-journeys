// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
import { readFile, writeFile } from 'node:fs/promises';
import { record } from '../src/contract.js';
import { HOUSE, candidateFromAnswer, verifyDelivery, type Quote } from '../src/telegraph.js';
import { acceptCandidate } from '../src/engine.js';
import { brokenSource, checkoutContract } from '../src/checkout.js';

const path = process.argv[2];
if (!path || !/^artifacts\/purchase-[a-f0-9-]+\.json$/.test(path)) throw new Error('Pass a local captured purchase file.');
const capture: unknown = JSON.parse(await readFile(path, 'utf8'));
const quote = JSON.parse(await readFile('artifacts/live-quote.json', 'utf8')) as Quote;
if (!record(capture) || !record(capture.result) || capture.status !== 200 || typeof capture.receiptHeader !== 'string' || typeof capture.settlementHeader !== 'string' || typeof capture.at !== 'string' || JSON.stringify(capture.request) !== JSON.stringify(quote.request)) throw new Error('Captured purchase does not match the saved request.');
const elapsed = Date.parse(capture.at) - Date.parse(quote.createdAt);
const purchase = await verifyDelivery(quote, HOUSE, capture.result, capture.receiptHeader, capture.settlementHeader, elapsed);
const candidate = candidateFromAnswer(purchase.rawAnswer);
const run = await acceptCandidate(brokenSource, candidate, checkoutContract(), purchase);
await writeFile('artifacts/live-run.json', JSON.stringify({ ...run, recoveredFrom: path, latencyBasis: 'quote creation to captured response; acceptance recovered without another purchase' }, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ outcome: run.outcome, before: run.before.passedCount, after: run.after.passedCount, total: run.after.total, costAtomic: purchase.costAtomic, miner: purchase.miner, receipt: purchase.receiptHash, signal: purchase.signalHash, transaction: purchase.transaction, recoveredWithoutRepayment: true }, null, 2));
if (run.outcome !== 'accepted') process.exitCode = 1;
