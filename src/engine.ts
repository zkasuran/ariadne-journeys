// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, open, unlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { canonical, boundedJson, parseSource, parseContract, fail, type Contract, type Report } from './contract.js';
import { check } from './sandbox.js';
import { digest, quoteRepair, purchaseRepair, candidateFromAnswer, type Quote, type Purchase } from './telegraph.js';

export type Run = { id: string; at: string; mode: 'manual' | 'telegraph'; outcome: 'accepted' | 'rejected'; sourceHash: string; candidateHash: string; contractHash: string; before: Report; after: Report; candidate: string; purchase: Purchase | null; elapsedMs: number };
export type Prepared = { quote: Quote; before: Report; source: string; contract: Contract };
export type Journal = { date: string; reservedAtomic: string; receipts: string[] };

export async function acceptCandidate(sourceValue: unknown, candidateValue: unknown, contractValue: unknown, purchase: Purchase | null = null): Promise<Run> {
  const started = Date.now();
  const source = parseSource(sourceValue);
  const candidate = parseSource(candidateValue);
  const contract = parseContract(contractValue);
  const contractHash = digest(canonical(boundedJson(contract)));
  const before = await check(source, contract);
  const after = await check(candidate, contract);
  if (digest(canonical(boundedJson(contract))) !== contractHash) return fail('Customer contract changed during repair.');
  return { id: randomUUID(), at: new Date().toISOString(), mode: purchase ? 'telegraph' : 'manual', outcome: !before.passed && after.passed ? 'accepted' : 'rejected', sourceHash: digest(source), candidateHash: digest(candidate), contractHash, before, after, candidate, purchase, elapsedMs: Date.now() - started };
}

export class RepairEngine {
  private prepared = new Map<string, Prepared>();
  private runs: Run[] = [];
  private busy = false;
  constructor(private directory: string) {}

  async prepare(sourceValue: unknown, contractValue: unknown): Promise<Prepared> {
    if (this.prepared.size >= 8) for (const [id, data] of this.prepared) if (Date.parse(data.quote.expiresAt) < Date.now()) this.prepared.delete(id);
    if (this.prepared.size >= 8) return fail('Too many pending quotes.');
    const source = parseSource(sourceValue);
    const contract = parseContract(contractValue);
    const before = await check(source, contract);
    if (before.passed) return fail('The original already satisfies this contract. No purchase is needed.');
    const quote = await quoteRepair(source, contract, before);
    const data = { quote, before, source, contract };
    this.prepared.set(quote.id, data);
    return data;
  }

  async reserve(amount: bigint): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const path = join(this.directory, 'spending.json');
    const lock = await open(`${path}.lock`, 'wx', 0o600).catch(() => fail('Spending journal is locked. Inspect prior state before retrying.'));
    try {
    const today = new Date().toISOString().slice(0, 10);
    let journal: Journal = { date: today, reservedAtomic: '0', receipts: [] };
    try {
      if ((await stat(path)).size > 64000) return fail('Spending journal exceeds its limit.');
      const stored: unknown = JSON.parse(await readFile(path, 'utf8'));
      if (typeof stored !== 'object' || stored === null || !('date' in stored) || !('reservedAtomic' in stored) || !('receipts' in stored) || typeof stored.reservedAtomic !== 'string' || !/^[0-9]{1,12}$/.test(stored.reservedAtomic) || !Array.isArray(stored.receipts)) return fail('Spending journal is invalid.');
      if (stored.date === today) journal = stored as Journal;
    } catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
    const total = BigInt(journal.reservedAtomic) + amount;
    if (total > 50000n) return fail('Daily testnet authorization cap reached (0.05 test USDC).');
    journal.reservedAtomic = total.toString();
    const temporary = `${path}.tmp`;
    await writeFile(temporary, JSON.stringify(journal), { mode: 0o600 });
    await rename(temporary, path);
    } finally { await lock.close(); await unlink(`${path}.lock`); }
  }

  async complete(id: string, key: string): Promise<Run> {
    if (this.busy) return fail('Another paid repair is already running.');
    const prepared = this.prepared.get(id);
    if (!prepared) return fail('Unknown or already consumed quote.');
    this.prepared.delete(id);
    this.busy = true;
    let reserved = false;
    try {
      const purchase = await purchaseRepair(prepared.quote, key, async amount => { await this.reserve(amount); reserved = true; }, fetch, async evidence => {
        await mkdir(this.directory, { recursive: true, mode: 0o700 });
        await writeFile(join(this.directory, `purchase-${id}.json`), JSON.stringify(evidence, null, 2), { mode: 0o600 });
      });
      await writeFile(join(this.directory, `verified-purchase-${id}.json`), JSON.stringify(purchase, null, 2), { mode: 0o600 });
      await this.noteReceipt(purchase.receiptHash);
      const candidate = candidateFromAnswer(purchase.rawAnswer);
      const run = await acceptCandidate(prepared.source, candidate, prepared.contract, purchase);
      await this.save(run);
      return run;
    } catch (error) {
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      await writeFile(join(this.directory, `failed-${id}.json`), JSON.stringify({ at: new Date().toISOString(), quoteId: id, reserved, error: error instanceof Error ? error.message : 'Repair failed. No automatic retry.' }), { mode: 0o600 });
      throw error;
    } finally { this.busy = false; }
  }

  async save(run: Run): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await writeFile(join(this.directory, `${run.id}.json`), JSON.stringify(run, null, 2), { mode: 0o600 });
    this.runs.unshift(run);
    this.runs = this.runs.slice(0, 20);
  }

  async noteReceipt(hash: string): Promise<void> {
    if (!/^0x[0-9a-f]{64}$/i.test(hash)) return fail('Invalid receipt identity.');
    const path = join(this.directory, 'spending.json');
    const lock = await open(`${path}.lock`, 'wx', 0o600).catch(() => fail('Spending journal is locked.'));
    try {
      const data = JSON.parse(await readFile(path, 'utf8')) as Journal;
      if (!Array.isArray(data.receipts) || data.receipts.length >= 100 || data.receipts.some(value => typeof value !== 'string')) return fail('Receipt journal is invalid.');
      if (data.receipts.includes(hash)) return fail('This receipt was already consumed.');
      data.receipts.push(hash);
      await writeFile(`${path}.tmp`, JSON.stringify(data), { mode: 0o600 });
      await rename(`${path}.tmp`, path);
    } finally { await lock.close(); await unlink(`${path}.lock`); }
  }

  list(): Run[] { return [...this.runs]; }
}
