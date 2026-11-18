// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
import type { Contract, Json } from './contract.js';

export const checkoutSpecification = 'Implement quoteOrder(input). input has integer subtotalCents between 0 and 1000000, coupon NONE or SAVE10, and delivery standard, express or pickup. Invalid input returns {error:"invalid_order"}. SAVE10 takes 10 percent off with Math.floor(subtotalCents * 0.9). NONE leaves the subtotal unchanged. Standard shipping costs 600 cents unless the discounted subtotal is at least 5000 cents, when it is free. Express always costs 1500 cents. Pickup always costs 0 cents. Return exactly {discountedCents,shippingCents,totalCents}. Do not mutate the input. Values are integer cents.';

export const brokenSource = `function quoteOrder(input) {
  if (!input || !Number.isInteger(input.subtotalCents) || input.subtotalCents < 0 || input.subtotalCents > 1000000 || !['NONE', 'SAVE10'].includes(input.coupon) || !['standard', 'express', 'pickup'].includes(input.delivery)) return { error: 'invalid_order' };
  const discountedCents = input.coupon === 'SAVE10' ? Math.floor(input.subtotalCents * 0.9) : input.subtotalCents;
  const shippingCents = input.delivery === 'pickup' ? 0 : input.delivery === 'express' ? 1500 : input.subtotalCents >= 5000 ? 0 : 600;
  return { discountedCents, shippingCents, totalCents: discountedCents + shippingCents };
}`;

export const exampleCandidate = brokenSource.replace('input.subtotalCents >= 5000 ? 0 : 600', 'discountedCents >= 5000 ? 0 : 600');

export function checkoutOracle(input: Json): Json {
  if (input === null || Array.isArray(input) || typeof input !== 'object' || !Number.isInteger(input.subtotalCents) || typeof input.subtotalCents !== 'number' || input.subtotalCents < 0 || input.subtotalCents > 1000000 || !['NONE', 'SAVE10'].includes(String(input.coupon)) || !['standard', 'express', 'pickup'].includes(String(input.delivery))) return { error: 'invalid_order' };
  const subtotal = input.subtotalCents;
  const discountedCents = input.coupon === 'SAVE10' ? Math.trunc(subtotal * 9 / 10) : subtotal;
  const shippingCents = input.delivery === 'express' ? 1500 : input.delivery === 'pickup' || discountedCents >= 5000 ? 0 : 600;
  return { discountedCents, shippingCents, totalCents: discountedCents + shippingCents };
}

export function checkoutContract(seed = 431): Contract {
  const cases: Contract['cases'] = [
    { id: 'coupon_changes_shipping', input: { subtotalCents: 5000, coupon: 'SAVE10', delivery: 'standard' }, expected: { discountedCents: 4500, shippingCents: 600, totalCents: 5100 } },
    { id: 'threshold_inclusive', input: { subtotalCents: 5000, coupon: 'NONE', delivery: 'standard' }, expected: { discountedCents: 5000, shippingCents: 0, totalCents: 5000 } },
    { id: 'express_not_free', input: { subtotalCents: 6000, coupon: 'NONE', delivery: 'express' }, expected: { discountedCents: 6000, shippingCents: 1500, totalCents: 7500 } },
    { id: 'pickup_no_charge', input: { subtotalCents: 100, coupon: 'NONE', delivery: 'pickup' }, expected: { discountedCents: 100, shippingCents: 0, totalCents: 100 } },
    { id: 'fractional_rejected', input: { subtotalCents: 5000.5, coupon: 'NONE', delivery: 'standard' }, expected: { error: 'invalid_order' } },
    { id: 'negative_rejected', input: { subtotalCents: -1, coupon: 'NONE', delivery: 'standard' }, expected: { error: 'invalid_order' } },
    { id: 'unknown_coupon', input: { subtotalCents: 5000, coupon: 'FREE', delivery: 'standard' }, expected: { error: 'invalid_order' } },
    { id: 'null_rejected', input: null, expected: { error: 'invalid_order' } },
  ];
  let state = seed >>> 0;
  for (let index = 0; index < 24; index++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const input = { subtotalCents: state % 11000, coupon: index % 2 ? 'SAVE10' : 'NONE', delivery: ['standard', 'express', 'pickup'][index % 3] ?? 'standard' };
    cases.push({ id: `challenge_${index}`, input, expected: checkoutOracle(input) });
  }
  return { version: 1, name: 'Discount-aware checkout', entrypoint: 'quoteOrder', specification: checkoutSpecification, cases };
}
