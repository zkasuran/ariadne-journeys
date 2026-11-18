// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JourneyCase = { id: string; input: Json; expected: Json };
export type Contract = { version: 1; name: string; entrypoint: string; specification: string; cases: JourneyCase[] };
export type CaseResult = { id: string; passed: boolean; actual: Json; error: string | null };
export type Report = { passed: boolean; passedCount: number; total: number; cases: CaseResult[] };
export const LIMITS = Object.freeze({ sourceBytes: 16000, contractBytes: 32000, cases: 64, jsonDepth: 8, jsonNodes: 2048, outputBytes: 8192, heapBytes: 8 * 1024 * 1024, sandboxMs: 150, workerMs: 5000, responseBytes: 512000, requestBytes: 64000 });

export function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function fail(message: string): never { throw new Error(message); }

export function boundedJson(value: unknown): Json {
  let nodes = 0;
  function visit(item: unknown, depth: number): Json {
    if (++nodes > LIMITS.jsonNodes || depth > LIMITS.jsonDepth) return fail('JSON exceeds the structural limit.');
    if (item === null || typeof item === 'boolean') return item;
    if (typeof item === 'string') return item.length <= LIMITS.outputBytes ? item : fail('JSON string is too long.');
    if (typeof item === 'number') return Number.isFinite(item) ? item : fail('JSON number must be finite.');
    if (Array.isArray(item)) return item.map((child: unknown) => visit(child, depth + 1));
    if (!record(item)) return fail('Only plain JSON values are accepted.');
    const output: { [key: string]: Json } = Object.create(null) as { [key: string]: Json };
    for (const [key, child] of Object.entries(item)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) return fail('Reserved JSON key.');
      output[key] = visit(child, depth + 1);
    }
    return output;
  }
  return visit(value, 0);
}

export function parseContract(value: unknown): Contract {
  if (!record(value) || value.version !== 1 || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 100 || typeof value.entrypoint !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(value.entrypoint) || typeof value.specification !== 'string' || value.specification.length < 20 || value.specification.length > 10000 || !Array.isArray(value.cases) || !value.cases.length || value.cases.length > LIMITS.cases) return fail('Invalid journey contract.');
  if (Object.keys(value).some(key => !['version', 'name', 'entrypoint', 'specification', 'cases'].includes(key))) return fail('Unknown contract field.');
  rejectSecrets(value.specification);
  const ids = new Set<string>();
  const cases = value.cases.map((item: unknown): JourneyCase => {
    if (!record(item) || typeof item.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(item.id) || !Object.hasOwn(item, 'input') || !Object.hasOwn(item, 'expected') || Object.keys(item).some(key => !['id', 'input', 'expected'].includes(key))) return fail('Invalid acceptance case.');
    if (ids.has(item.id)) return fail('Acceptance case IDs must be unique.');
    ids.add(item.id);
    return { id: item.id, input: boundedJson(item.input), expected: boundedJson(item.expected) };
  });
  if (JSON.stringify(value).length > LIMITS.contractBytes) return fail('Journey contract is too large.');
  rejectSecrets(JSON.stringify(value));
  return { version: 1, name: value.name.trim(), entrypoint: value.entrypoint, specification: value.specification, cases };
}

export function parseSource(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || new TextEncoder().encode(value).length > LIMITS.sourceBytes || value.includes('\u0000')) return fail('Source must be nonempty JavaScript under 16 KB.');
  rejectSecrets(value);
  return value;
}

function rejectSecrets(text: string): void {
  if (/(?:-----BEGIN [A-Z ]*PRIVATE KEY|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|(?:private[_ -]?key|api[_ -]?key|secret)\s*[:=]\s*['"]?(?:0x[0-9a-fA-F]{64}|[A-Za-z0-9_/-]{24,}))/i.test(text)) return fail('Source or specification contains a secret-shaped value.');
}

export function canonical(value: Json): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key] ?? null)}`).join(',')}}`;
  return JSON.stringify(value);
}

export function sameJson(left: Json, right: Json): boolean { return canonical(left) === canonical(right); }
