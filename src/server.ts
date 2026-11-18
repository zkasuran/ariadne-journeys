// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RepairEngine, acceptCandidate } from './engine.js';
import { checkoutContract, brokenSource, exampleCandidate } from './checkout.js';
import { record, LIMITS, fail } from './contract.js';

const ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)));
export function server(port = 4318, root = ROOT) {
  const engine = new RepairEngine(join(root, 'artifacts'));
  let active = 0;
  const calls: number[] = [];
  const httpServer = createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    response.setHeader('Cache-Control', 'no-store');
    try {
      if (!request.headers.host || ![`127.0.0.1:${port}`, `localhost:${port}`].includes(request.headers.host)) return send(response, 403, { error: 'Loopback Host required.' });
      const origin = request.headers.origin;
      if (origin && origin !== `http://${request.headers.host}`) return send(response, 403, { error: 'Cross-origin requests are refused.' });
      const path = new URL(request.url ?? '/', `http://${request.headers.host}`).pathname;
      if (path.startsWith('/api/')) {
        const now = Date.now();
        while (calls[0] !== undefined && calls[0] < now - 60000) calls.shift();
        if (calls.length >= 30 || active >= 2) return send(response, 429, { error: 'Repair service is busy. Try again shortly.' });
        calls.push(now);
        if (request.method === 'GET' && path === '/api/status') return send(response, 200, { local: true, signerConfigured: Boolean(process.env.HOUSE_WALLET_PRIVATE_KEY), network: 'Ethereum Sepolia testnet' });
        if (request.method === 'GET' && path === '/api/runs') return send(response, 200, { runs: engine.list() });
        if (request.method !== 'POST') return send(response, 405, { error: 'Method not allowed.' });
        if (request.headers['content-type'] !== 'application/json') return send(response, 415, { error: 'Content-Type must be application/json.' });
        const body = await readRequest(request);
        active++;
        try {
          if (path === '/api/check') {
            const run = await acceptCandidate(body.source, body.candidate, body.contract);
            await engine.save(run);
            return send(response, 200, run);
          }
          if (path === '/api/quote') {
            const prepared = await engine.prepare(body.source, body.contract);
            return send(response, 200, { quote: prepared.quote, before: prepared.before });
          }
          if (path === '/api/repair') {
            if (body.approved !== true || typeof body.quoteId !== 'string') return send(response, 400, { error: 'Explicit quote approval is required.' });
            const run = await engine.complete(body.quoteId, process.env.HOUSE_WALLET_PRIVATE_KEY ?? '');
            return send(response, 200, run);
          }
          return send(response, 404, { error: 'Unknown API route.' });
        } finally { active--; }
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') return send(response, 405, { error: 'Method not allowed.' });
      if (path === '/examples/checkout.json') return send(response, 200, { source: brokenSource, candidate: exampleCandidate, contract: checkoutContract() });
      const relative = path === '/' || path === '/checkout' ? 'index.html' : /^\/assets\/[A-Za-z0-9._-]+$/.test(path) ? path.slice(1) : null;
      if (!relative) return send(response, 404, { error: 'Page not found.' });
      const file = await readFile(join(root, 'site', relative));
      const headers: unknown = JSON.parse(await readFile(join(root, 'site', 'security.json'), 'utf8'));
      if (record(headers) && typeof headers.csp === 'string') response.setHeader('Content-Security-Policy', headers.csp);
      response.setHeader('Content-Type', relative.endsWith('.html') ? 'text/html; charset=utf-8' : relative.endsWith('.js') ? 'text/javascript; charset=utf-8' : relative.endsWith('.css') ? 'text/css; charset=utf-8' : relative.endsWith('.wasm') ? 'application/wasm' : relative.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream');
      response.writeHead(200); response.end(request.method === 'HEAD' ? '' : relative.endsWith('.html') ? file.toString('utf8').replace('data-local="false"', 'data-local="true"') : file);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Request failed.';
      send(response, 400, { error: message.slice(0, 500) });
    }
  });
  httpServer.headersTimeout = 10000;
  httpServer.requestTimeout = 15000;
  httpServer.keepAliveTimeout = 5000;
  return httpServer;
}

function send(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(value));
}

async function readRequest(request: IncomingMessage): Promise<Record<string, unknown>> {
  let length = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    length += bytes.length;
    if (length > LIMITS.requestBytes) return fail('Request exceeds 64 KB.');
    chunks.push(bytes);
  }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!record(value)) return fail('Request must be a JSON object.');
  return value;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 4318);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT must be between 1024 and 65535.');
  const app = server(port);
  app.listen(port, '127.0.0.1', () => console.log(`Ariadne http://127.0.0.1:${port}`));
}
