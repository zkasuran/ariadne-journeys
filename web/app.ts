// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
import { checkoutContract, checkoutOracle, brokenSource, exampleCandidate } from '../src/checkout.js';
import { parseContract, parseSource, boundedJson, canonical, sameJson, record, type Contract, type Report, type Json } from '../src/contract.js';
import { verifySignal } from '../src/commitment.js';
import { paidAnchor } from './proof-anchor.js';

type BrowserRun = { id: string; mode: string; outcome: string; sourceHash: string; candidateHash: string; contractHash: string; before: Report; after: Report; candidate: string; purchase: unknown; elapsedMs: number };
function element<T extends HTMLElement>(id: string): T { const found = document.getElementById(id); if (!found) throw new Error(`Missing element ${id}`); return found as T; }
const source = element<HTMLTextAreaElement>('source');
const candidate = element<HTMLTextAreaElement>('candidate');
const contractBox = element<HTMLTextAreaElement>('contract');
const status = element('run-status');
let lastRun: BrowserRun | null = null;
let checkoutSource = brokenSource;
let working = false;
const local = document.documentElement.dataset.local === 'true';

function setStatus(message: string, kind = ''): void { status.textContent = message; status.className = `status ${kind}`; }
async function hash(value: string): Promise<string> { const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join(''); }
async function sandbox(code: string, contract: Contract): Promise<Report> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    const timeout = setTimeout(() => { worker.terminate(); reject(new Error('Browser sandbox exceeded its deadline.')); }, 8000);
    worker.onmessage = (event: MessageEvent<{ report?: Report; error?: string }>) => {
      clearTimeout(timeout); worker.terminate();
      if (event.data.report) resolve(event.data.report); else reject(new Error(event.data.error ?? 'Sandbox returned no result.'));
    };
    worker.onerror = () => { clearTimeout(timeout); worker.terminate(); reject(new Error('Browser sandbox failed to start.')); };
    worker.postMessage({ source: parseSource(code), contract: parseContract(contract) });
  });
}

function loadExample(): void { source.value = brokenSource; candidate.value = ''; contractBox.value = JSON.stringify(checkoutContract(), null, 2); checkoutSource = brokenSource; element('checkout-mode').textContent = 'Original implementation'; setStatus('Example loaded. Its coupon changes the shipping threshold.'); }

function present(run: BrowserRun): void {
  lastRun = run;
  element('results').hidden = false;
  element('result-title').textContent = `${run.after.passedCount}/${run.after.total} acceptance cases passed`;
  setStatus(run.outcome === 'accepted' ? 'Candidate accepted for this contract. The original failed and the candidate passed every case.' : 'Candidate not accepted. The original contract is still the finish line.', run.outcome === 'accepted' ? 'good' : 'bad');
  const list = element('case-list'); list.replaceChildren();
  for (const item of run.after.cases) { const row = document.createElement('div'); row.className = `case ${item.passed ? 'pass' : 'fail'}`; const name = document.createElement('span'); name.textContent = item.id; const state = document.createElement('span'); state.textContent = item.passed ? 'PASS' : 'FAIL'; row.append(name, state); if (!item.passed) row.title = item.error ?? JSON.stringify(item.actual); list.append(row); }
  element('hashes').textContent = `Contract ${run.contractHash} · Candidate ${run.candidateHash}`;
  element('use-checkout').hidden = run.outcome !== 'accepted' || run.contractHash !== paidAnchor.contractHash;
  const evidence = element('evidence-body'); evidence.replaceChildren();
  const heading = document.createElement('h2'); heading.textContent = `${run.mode === 'telegraph' ? 'Telegraph repair' : 'Manual candidate check'} · ${run.outcome}`;
  const summary = document.createElement('p'); summary.textContent = `${run.before.passedCount}/${run.before.total} before, ${run.after.passedCount}/${run.after.total} after. ${run.elapsedMs} ms. Evidence applies to this exact contract.`;
  const pre = document.createElement('pre'); pre.textContent = JSON.stringify({ id: run.id, sourceHash: run.sourceHash, candidateHash: run.candidateHash, contractHash: run.contractHash, purchase: run.purchase }, null, 2);
  evidence.append(heading, summary, pre);
}

async function runManual(): Promise<void> {
  if (working) return; working = true;
  element<HTMLButtonElement>('check').disabled = true; setStatus('Running the unchanged contract in fresh sandbox contexts…');
  const started = performance.now();
  const snapshot = { source: source.value, candidate: candidate.value, contract: contractBox.value };
  try {
    const spec = parseContract(JSON.parse(contractBox.value) as unknown);
    const current = parseSource(source.value); const proposed = parseSource(candidate.value);
    const before = await sandbox(current, spec); const after = await sandbox(proposed, spec);
    if (source.value !== snapshot.source || candidate.value !== snapshot.candidate || contractBox.value !== snapshot.contract) throw new Error('Inputs changed during the check. Run the current inputs again.');
    const run: BrowserRun = { id: crypto.randomUUID(), mode: 'manual', outcome: !before.passed && after.passed ? 'accepted' : 'rejected', sourceHash: await hash(current), candidateHash: await hash(proposed), contractHash: await hash(canonical(boundedJson(spec))), before, after, candidate: proposed, purchase: null, elapsedMs: Math.round(performance.now() - started) };
    present(run);
  } catch (error) { setStatus(error instanceof Error ? error.message : 'Candidate check failed.', 'bad'); }
  finally { working = false; element<HTMLButtonElement>('check').disabled = false; }
}

async function api(path: string, body: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
  const result: unknown = await response.json();
  if (!record(result)) throw new Error('Local service returned an invalid response.');
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : `Local service HTTP ${response.status}`);
  return result;
}

let quoteId: string | null = null;
async function preparePurchase(): Promise<void> {
  if (working) return; working = true; setStatus('Checking the original contract and requesting one testnet repair quote…');
  try {
    const result = await api('/api/quote', { source: source.value, contract: JSON.parse(contractBox.value) as unknown });
    if (!record(result.quote) || !record(result.quote.offer) || typeof result.quote.id !== 'string') throw new Error('Invalid repair quote.');
    quoteId = result.quote.id;
    const details = element('payment-details'); details.replaceChildren();
    const dl = document.createElement('dl');
    const offer = result.quote.offer;
    for (const [name, value] of [['Network', 'Ethereum Sepolia'], ['Token', 'Test USDC'], ['Amount', `${Number(offer.amount) / 1000000} (${String(offer.amount)} atomic units)`], ['Recipient', String(offer.payTo)]]) { const dt = document.createElement('dt'); dt.textContent = name ?? ''; const dd = document.createElement('dd'); dd.textContent = value ?? ''; dl.append(dt, dd); }
    details.append(dl); element<HTMLDialogElement>('payment-dialog').showModal();
  } catch (error) { setStatus(error instanceof Error ? error.message : 'Quote failed.', 'bad'); }
  finally { working = false; }
}

element('approve-payment').onclick = async () => {
  if (!quoteId || working) return; working = true;
  const id = quoteId; quoteId = null; element<HTMLDialogElement>('payment-dialog').close();
  setStatus('Buying repair code and checking its actual receipt, signal and settlement. Then the original contract runs again…');
  try { const result = await api('/api/repair', { quoteId: id, approved: true }); const run = result as unknown as BrowserRun; candidate.value = run.candidate; present(run); }
  catch (error) { setStatus(error instanceof Error ? error.message : 'Paid repair failed. No automatic retry.', 'bad'); }
  finally { working = false; }
};

element('check').onclick = () => { void runManual(); };
element('load-example').onclick = loadExample;
element('sample-candidate').onclick = () => { candidate.value = exampleCandidate; element('mode-note').textContent = 'Supplied example correction. No intelligence purchase has been made.'; };
element('buy').onclick = () => { void preparePurchase(); };
element('paid-example').onclick = async () => {
  if (working) return; working = true; setStatus('Rechecking the recorded paid answer against the original contract. No new purchase…');
  try {
    const response = await fetch(new URL('./paid-proof.json', import.meta.url), { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Recorded paid proof is unavailable.');
    const proof: unknown = await response.json();
    if (!record(proof) || !record(proof.run) || typeof proof.source !== 'string' || !record(proof.run.purchase) || typeof proof.run.candidate !== 'string') throw new Error('Malformed paid proof.');
    const run = proof.run as unknown as BrowserRun;
    const spec = checkoutContract();
    if (run.sourceHash !== paidAnchor.sourceHash || run.candidateHash !== paidAnchor.candidateHash || run.contractHash !== paidAnchor.contractHash || proof.run.purchase.signalHash !== paidAnchor.signalHash) throw new Error('Paid proof identity does not match the released fixture.');
    if (await hash(proof.source) !== run.sourceHash || await hash(run.candidate) !== run.candidateHash || await hash(canonical(boundedJson(spec))) !== run.contractHash) throw new Error('Recorded source, candidate or contract was changed.');
    const purchase = proof.run.purchase;
    if (typeof purchase.signalHash !== 'string' || typeof purchase.buyer !== 'string' || !record(purchase.request) || typeof purchase.request.query !== 'string') throw new Error('Missing request-bound payment evidence.');
    verifySignal(purchase.signal, purchase.signalHash, purchase.buyer, purchase.request.query);
    source.value = proof.source; candidate.value = run.candidate; contractBox.value = JSON.stringify(spec, null, 2);
    const before = await sandbox(source.value, spec); const after = await sandbox(candidate.value, spec);
    present({ ...run, before, after, outcome: !before.passed && after.passed ? 'accepted' : 'rejected' });
    element('mode-note').textContent = 'Recorded paid repair from Ethereum Sepolia. The code and original contract were rechecked here. No new payment was made.';
  } catch (error) { setStatus(error instanceof Error ? error.message : 'Paid proof replay failed.', 'bad'); }
  finally { working = false; }
};
element('download-run').onclick = () => {
  if (!lastRun) return; const url = URL.createObjectURL(new Blob([JSON.stringify(lastRun, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = `ariadne-${lastRun.id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
element('use-checkout').onclick = () => { if (lastRun?.outcome === 'accepted') { checkoutSource = lastRun.candidate; element('checkout-mode').textContent = 'Accepted candidate'; location.hash = '/checkout'; void updateOrder(); } };

async function updateOrder(): Promise<{ actual: Json; expected: Json }> {
  const input = { subtotalCents: Math.round(Number(element<HTMLInputElement>('subtotal').value) * 100), coupon: element<HTMLSelectElement>('coupon').value, delivery: element<HTMLSelectElement>('delivery').value };
  const spec = { version: 1 as const, name: 'Displayed order', entrypoint: 'quoteOrder', specification: checkoutContract().specification, cases: [{ id: 'displayed_order', input, expected: checkoutOracle(input) }] };
  const report = await sandbox(checkoutSource, spec); const actual = report.cases[0]?.actual ?? null; const expected = checkoutOracle(input);
  const values = element('order-values'); values.replaceChildren();
  if (record(actual) && typeof actual.totalCents === 'number' && typeof actual.shippingCents === 'number' && typeof actual.discountedCents === 'number') {
    for (const [name, cents] of [['After discount', actual.discountedCents], ['Shipping', actual.shippingCents], ['Order total', actual.totalCents]] as const) { const dt = document.createElement('dt'); dt.textContent = name; const dd = document.createElement('dd'); dd.textContent = `$${(cents / 100).toFixed(2)}`; values.append(dt, dd); }
  }
  return { actual, expected };
}
element('quote-order').onclick = () => { void updateOrder().then(() => { element('order-status').textContent = 'Total updated. Place the demo order to test the customer outcome.'; }).catch(error => { element('order-status').textContent = String(error); }); };
element<HTMLFormElement>('order-form').onsubmit = event => {
  event.preventDefault(); void updateOrder().then(({ actual, expected }) => {
    const state = element('order-status');
    if (sameJson(actual, expected) && record(actual) && !('error' in actual)) { state.textContent = 'Demo order completed. The charged total follows the original customer rule. No money moved.'; state.className = 'status good'; }
    else { state.textContent = 'Order not completed. The checkout total conflicts with the customer rule. Repair the implementation first.'; state.className = 'status bad'; }
  }).catch(error => { element('order-status').textContent = String(error); });
};

const routes: Record<string, string> = { '/': 'home', '/repair': 'repair', '/checkout': 'checkout', '/evidence': 'evidence', '/method': 'method', '/docs': 'docs', '/contract': 'contract', '/security': 'security' };
function route(): void {
  const path = location.hash.slice(1) || '/'; const name = routes[path] ?? 'home';
  for (const view of document.querySelectorAll<HTMLElement>('[data-view]')) view.hidden = view.dataset.view !== name;
  for (const group of document.querySelectorAll('.category')) { group.classList.remove('open'); group.querySelector('button')?.setAttribute('aria-expanded', 'false'); }
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (name === 'checkout') void updateOrder().catch(error => { element('order-status').textContent = String(error); });
}
window.addEventListener('hashchange', route);
for (const group of document.querySelectorAll<HTMLElement>('.category')) {
  const trigger = group.querySelector('button'); if (!trigger) continue;
  const open = (value: boolean) => { group.classList.toggle('open', value); trigger.setAttribute('aria-expanded', String(value)); };
  let suppressFocus = false;
  group.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') open(true); }); group.addEventListener('pointerleave', event => { if (event.pointerType !== 'touch') open(false); }); group.addEventListener('focusin', () => { if (!suppressFocus) open(true); }); group.addEventListener('focusout', event => { if (!group.contains(event.relatedTarget as Node | null)) open(false); }); trigger.onclick = () => open(true);
  group.addEventListener('keydown', event => {
    if (event.key === 'Escape') { suppressFocus = true; trigger.focus(); suppressFocus = false; open(false); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); open(true);
      const items: HTMLElement[] = [trigger, ...group.querySelectorAll<HTMLAnchorElement>('.submenu a')];
      const index = items.indexOf(document.activeElement as HTMLElement);
      items[(index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
    }
  });
}
document.addEventListener('pointerdown', event => { if (!(event.target instanceof Element) || !event.target.closest('.category')) for (const group of document.querySelectorAll('.category')) { group.classList.remove('open'); group.querySelector('button')?.setAttribute('aria-expanded', 'false'); } });
element('theme').onclick = () => { const dark = document.documentElement.dataset.theme !== 'dark'; document.documentElement.dataset.theme = dark ? 'dark' : 'light'; try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch {} element('theme').setAttribute('aria-pressed', String(dark)); };
element('theme').setAttribute('aria-pressed', String(document.documentElement.dataset.theme === 'dark'));
if (local) { element('buy').hidden = false; element('service-status').textContent = 'Local Telegraph repair service'; element('mode-note').textContent = 'Buy a repair locally sends your source, specification and failure summary to Telegraph for a quote. Signing requires approval. Manual checks stay in the browser.'; }
loadExample(); route();
