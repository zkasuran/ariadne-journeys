// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseContract, boundedJson, canonical, parseSource } from '../dist/src/contract.js';
import { checkoutContract, checkoutOracle, brokenSource, exampleCandidate } from '../dist/src/checkout.js';
import { check } from '../dist/src/sandbox.js';
import { acceptCandidate, RepairEngine } from '../dist/src/engine.js';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('a broken coupon threshold fails the customer-owned example', async () => {
  const result = await check(brokenSource, checkoutContract());
  assert.equal(result.passed, false);
  assert.equal(result.cases.find(row => row.id === 'coupon_changes_shipping').passed, false);
});

test('a real correction passes unchanged acceptance cases across new seeded inputs', async () => {
  for (const seed of [0, 431, 19787]) {
    const result = await check(exampleCandidate, checkoutContract(seed));
    assert.equal(result.passed, true, JSON.stringify(result.cases.filter(row => !row.passed)));
    assert.equal(result.total, 32);
  }
});

test('a constant answer cannot buy acceptance by matching the showcased order', async () => {
  const result = await check('function quoteOrder(){return {discountedCents:4500,shippingCents:600,totalCents:5100}}', checkoutContract());
  assert.equal(result.passed, false);
  assert.ok(result.passedCount < 4);
});

test('guest code sees no host process, require, fetch or filesystem', async () => {
  const contract = { version: 1, name: 'Host isolation', entrypoint: 'inspect', specification: 'Return whether any host capabilities are exposed.', cases: [{ id: 'isolated', input: null, expected: ['undefined', 'undefined', 'undefined', 'undefined'] }] };
  const result = await check('function inspect(){return [typeof process,typeof require,typeof fetch,typeof readFile]}', contract);
  assert.equal(result.passed, true);
});

test('mutating the input is rejected even if the returned answer is correct', async () => {
  const contract = { version: 1, name: 'Immutable input', entrypoint: 'calculate', specification: 'Return one without changing the input object.', cases: [{ id: 'input', input: { value: 9 }, expected: 1 }] };
  const result = await check('function calculate(input){input.value=0;return 1}', contract);
  assert.equal(result.passed, false);
  assert.match(result.cases[0].error, /mutated/);
});

test('guest global state cannot leak from one acceptance case into the next', async () => {
  const contract = { version: 1, name: 'Fresh contexts', entrypoint: 'calculate', specification: 'Return the first count in each independent context.', cases: [{ id: 'first', input: null, expected: 1 }, { id: 'second', input: null, expected: 1 }] };
  assert.equal((await check('let count=0; function calculate(){return ++count}', contract)).passed, true);
});

test('infinite computation is interrupted inside the interpreter', async () => {
  const contract = { version: 1, name: 'Bounded execution', entrypoint: 'calculate', specification: 'Return a finite numeric result for the supplied input.', cases: [{ id: 'loop', input: null, expected: 1 }] };
  const result = await check('function calculate(){while(true){}}', contract);
  assert.equal(result.passed, false);
  assert.match(result.cases[0].error, /interrupt/i);
});

test('memory exhaustion is an explicit failed case', async () => {
  const contract = { version: 1, name: 'Bounded allocation', entrypoint: 'calculate', specification: 'Return one without allocating unbounded memory.', cases: [{ id: 'allocation', input: null, expected: 1 }] };
  const result = await check('function calculate(){return new Array(10000000).fill("xxxxxxxxxxxxxxxxxxxxxxxx")} ', contract);
  assert.equal(result.passed, false);
  assert.ok(result.cases[0].error);
});

test('valid input distinctions, express charges and discounted boundary are specified', () => {
  assert.deepEqual(checkoutOracle({ subtotalCents: 5556, coupon: 'SAVE10', delivery: 'standard' }), { discountedCents: 5000, shippingCents: 0, totalCents: 5000 });
  assert.deepEqual(checkoutOracle({ subtotalCents: 5555, coupon: 'SAVE10', delivery: 'standard' }), { discountedCents: 4999, shippingCents: 600, totalCents: 5599 });
  assert.deepEqual(checkoutOracle({ subtotalCents: 5000, coupon: 'NONE', delivery: 'express' }), { discountedCents: 5000, shippingCents: 1500, totalCents: 6500 });
  assert.deepEqual(checkoutOracle({ subtotalCents: '5000', coupon: 'NONE', delivery: 'standard' }), { error: 'invalid_order' });
});

test('contracts reject duplicate cases, unknown fields and structural abuse', () => {
  const contract = checkoutContract();
  assert.throws(() => parseContract({ ...contract, cases: [contract.cases[0], contract.cases[0]] }), /unique/);
  assert.throws(() => parseContract({ ...contract, resetChecks: true }), /Unknown/);
  assert.throws(() => boundedJson(JSON.parse('{"__proto__":{}}')), /Reserved/);
  let nested = null; for (let i = 0; i < 20; i++) nested = [nested];
  assert.throws(() => boundedJson(nested), /structural/);
  assert.throws(() => boundedJson(Infinity), /finite/);
  assert.throws(() => parseSource('x'.repeat(17000)), /16 KB/);
  assert.throws(() => parseSource('const privateKey = "0x'+'1'.repeat(64)+'";'), /secret-shaped/);
});

test('acceptance binds exact source, candidate and unchanged contract', async () => {
  const contract = checkoutContract(); const before = canonical(boundedJson(contract));
  const run = await acceptCandidate(brokenSource, exampleCandidate, contract);
  assert.equal(run.outcome, 'accepted');
  assert.equal(run.mode, 'manual');
  assert.equal(run.purchase, null);
  assert.notEqual(run.sourceHash, run.candidateHash);
  assert.equal(canonical(boundedJson(contract)), before);
});

test('passing originals do not count as repaired failures', async () => {
  assert.equal((await acceptCandidate(exampleCandidate, exampleCandidate, checkoutContract())).outcome, 'rejected');
});

test('spending reservations persist and fail closed on a corrupt journal', async () => {
  const root = await mkdtemp(join(tmpdir(), 'finishline-budget-'));
  try {
    const engine = new RepairEngine(root);
    await engine.reserve(20000n); await engine.reserve(20000n);
    await assert.rejects(() => engine.reserve(20000n), /cap reached/);
    assert.equal(JSON.parse(await readFile(join(root, 'spending.json'), 'utf8')).reservedAtomic, '40000');
    await writeFile(join(root, 'spending.json'), '{}');
    await assert.rejects(() => engine.reserve(10000n), /invalid/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('separate engine instances cannot lose spending reservations through concurrent writes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ariadne-lock-'));
  try {
    const outcomes = await Promise.allSettled([new RepairEngine(root).reserve(20000n), new RepairEngine(root).reserve(20000n)]);
    const successful = outcomes.filter(item => item.status === 'fulfilled').length;
    assert.equal(JSON.parse(await readFile(join(root, 'spending.json'), 'utf8')).reservedAtomic, String(successful * 20000));
    assert.ok(successful >= 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('a receipt hash is consumed at most once', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ariadne-receipt-'));
  try {
    const engine = new RepairEngine(root);
    await engine.reserve(10000n);
    await engine.noteReceipt('0x'+'a'.repeat(64));
    await assert.rejects(() => engine.noteReceipt('0x'+'a'.repeat(64)), /already consumed/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
