// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
import { keccak256, toHex } from 'viem';
import { boundedJson, canonical, record, fail, type Json } from './contract.js';

export function verifySignal(signal: unknown, hash: string, payer: string, query: string): Json {
  if (!record(signal) || signal.signal_hash !== hash || !record(signal.payload) || typeof signal.payload.wallet_address !== 'string' || signal.payload.wallet_address.toLowerCase() !== payer.toLowerCase() || signal.payload.request !== query || !Object.hasOwn(signal.payload, 'response')) return fail('Signal does not bind this buyer and exact repair request.');
  const payload = boundedJson({ ...signal.payload, wallet_address: payer.toLowerCase() });
  const serialized = canonical(payload).replace(/[<>&]/g, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
  if (keccak256(toHex(serialized)) !== hash) return fail('Telegraph signal commitment does not match its payload.');
  return boundedJson(signal);
}
