// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
import { getQuickJS, type QuickJSWASMModule } from 'quickjs-emscripten';
import { boundedJson, sameJson, LIMITS, type Contract, type Json, type Report } from './contract.js';

export async function evaluate(source: string, contract: Contract, module?: QuickJSWASMModule): Promise<Report> {
  const quickjs = module ?? await getQuickJS();
  const cases: Report['cases'] = [];
  for (const item of contract.cases) {
    const runtime = quickjs.newRuntime();
    runtime.setMemoryLimit(LIMITS.heapBytes);
    runtime.setMaxStackSize(128 * 1024);
    const deadline = Date.now() + LIMITS.sandboxMs;
    runtime.setInterruptHandler(() => Date.now() > deadline);
    const context = runtime.newContext();
    let actual: Json = null;
    let error: string | null = null;
    try {
      const loaded = context.evalCode(`'use strict';\n${source}`);
      if (loaded.error) {
        const message = context.dump(loaded.error) as unknown;
        loaded.error.dispose();
        throw new Error(JSON.stringify(message).slice(0, 400));
      }
      loaded.value.dispose();
      const fn = context.getProp(context.global, contract.entrypoint);
      const input = context.unwrapResult(context.evalCode(`JSON.parse(${JSON.stringify(JSON.stringify(item.input))})`));
      try {
        const result = context.callFunction(fn, context.undefined, input);
        if (result.error) {
          const message = context.dump(result.error) as unknown;
          result.error.dispose();
          throw new Error(JSON.stringify(message).slice(0, 400));
        }
        try {
          const dumped: unknown = context.dump(result.value);
          if (JSON.stringify(dumped)?.length > LIMITS.outputBytes) throw new Error('Candidate output exceeds 8 KB.');
          actual = boundedJson(dumped);
          const after: unknown = context.dump(input);
          if (!sameJson(boundedJson(after), item.input)) throw new Error('Candidate mutated the customer input.');
        } finally { result.value.dispose(); }
      } finally { fn.dispose(); input.dispose(); }
    } catch (caught) {
      error = caught instanceof Error ? caught.message.slice(0, 400) : 'Sandbox execution failed.';
    } finally { context.dispose(); runtime.dispose(); }
    cases.push({ id: item.id, passed: error === null && sameJson(actual, item.expected), actual, error });
  }
  const passedCount = cases.filter(item => item.passed).length;
  return { passed: passedCount === cases.length, passedCount, total: cases.length, cases };
}
