// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { keccak256, toHex } from 'viem';
import { chooseOffer, exactOffer, verifySignal, verifyReceipt, quoteRepair, candidateFromAnswer, ASSET, NETWORK, HOUSE } from '../dist/src/telegraph.js';
import { canonical, boundedJson } from '../dist/src/contract.js';
import { brokenSource, checkoutContract } from '../dist/src/checkout.js';

const offer = { scheme: 'exact', network: NETWORK, asset: ASSET, amount: '10000', payTo: '0x3624EB012B5E998BB57B6bE6C9Cfc9c4bc5eb99b', maxTimeoutSeconds: 60, extra: { name: 'USD Coin', version: '2' } };
const challenge = { x402Version: 2, accepts: [offer] };
const header = value => Buffer.from(JSON.stringify(value)).toString('base64');

test('quote selection only allows bounded test-USDC on the intended network', () => {
  assert.deepEqual(chooseOffer(challenge), offer);
  for (const change of [{ amount: '500000' }, { network: 'eip155:1' }, { asset: '0x' + '1'.repeat(40) }, { payTo: 'bad' }, { maxTimeoutSeconds: 1000 }, { extra: { name: 'USD Coin', version: '99' } }]) assert.throws(() => chooseOffer({ ...challenge, accepts: [{ ...offer, ...change }] }));
});

test('requotes cannot change price, recipient, domain or scheme after approval', () => {
  assert.equal(exactOffer(offer, { ...offer }), true);
  for (const change of [{ amount: '10001' }, { payTo: '0x' + '1'.repeat(40) }, { extra: { name: 'USDC', version: '2' } }, { scheme: 'escrow' }]) assert.equal(exactOffer(offer, { ...offer, ...change }), false);
});

test('a quote-only server is not counted as a completed repair or payment', async () => {
  let calls = 0;
  const fetcher = async (_url, init) => { calls++; assert.equal(init.method, 'POST'); assert.ok(JSON.parse(init.body).query.includes('Generate JavaScript')); return new Response('{}', { status: 402, headers: { 'payment-required': header(challenge) } }); };
  const quote = await quoteRepair(brokenSource, checkoutContract(), { cases: [{ id: 'coupon', passed: false, actual: {}, error: null }] }, fetcher);
  assert.equal(calls, 1);
  assert.equal(quote.offer.amount, '10000');
  assert.equal('receipt' in quote, false);
  assert.equal('candidate' in quote, false);
});

test('signal verification binds the exact query, payer and raw answer', () => {
  const query = 'Generate JavaScript code to repair this specific checkout.';
  const payload = { request: query, wallet_address: HOUSE.toLowerCase(), response: { answer: 'a < b && b > c' }, intent_id: 'CODE_GENERATION_GENERAL' };
  const bytes = canonical(boundedJson(payload)).replace(/[<>&]/g, character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
  const hash = keccak256(toHex(bytes));
  const signal = { signal_hash: hash, payload: { ...payload, wallet_address: HOUSE } };
  assert.ok(verifySignal(signal, hash, HOUSE, query));
  assert.throws(() => verifySignal(signal, hash, HOUSE, 'a different query'), /exact repair request/);
  assert.throws(() => verifySignal({ ...signal, payload: { ...payload, response: 'changed' } }, hash, HOUSE, query), /commitment/);
  assert.throws(() => verifySignal(signal, hash, '0x' + '1'.repeat(40), query), /buyer/);
});

test('receipt verification rejects wrong chain, payer, amount and missing settlement', () => {
  const receipt = { rail: 'x402', chain: NETWORK, payer: HOUSE, amount_uusdc: '10000', receipt_hash: '0x' + 'a'.repeat(64), tx_hash: '0x' + 'b'.repeat(64), settlement: 'onchain' };
  assert.equal(verifyReceipt(receipt, offer, HOUSE), receipt);
  for (const change of [{ amount_uusdc: '20000' }, { chain: 'eip155:1' }, { payer: '0x' + '1'.repeat(40) }, { settlement: 'none' }]) assert.throws(() => verifyReceipt({ ...receipt, ...change }, offer, HOUSE));
});

test('candidate extraction preserves JavaScript escapes and refuses ambiguous answers', () => {
  const source = 'function calculate(){return "a\\nb"}';
  assert.equal(candidateFromAnswer({ output: '```javascript\n' + source + '\n```' }), source + '\n');
  assert.equal(candidateFromAnswer({ answer: '```javascript\n' + source + '\n```', summary: '```javascript\n' + source + '\n```' }), source + '\n');
  assert.throws(() => candidateFromAnswer('a review with no code'), /exactly one/);
  assert.throws(() => candidateFromAnswer('```js\na\n```\n```js\nb\n```'), /exactly one/);
});
