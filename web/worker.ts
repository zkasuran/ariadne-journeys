// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
import { newQuickJSWASMModuleFromVariant, newVariant } from 'quickjs-emscripten-core';
import RELEASE_SYNC from '@jitl/quickjs-wasmfile-release-sync';
import type { QuickJSSyncVariant } from '@jitl/quickjs-ffi-types';
import { evaluate } from '../src/sandbox-core.js';
import { parseContract, parseSource, type Contract } from '../src/contract.js';

const modulePromise = newQuickJSWASMModuleFromVariant(newVariant(RELEASE_SYNC as unknown as QuickJSSyncVariant, { wasmBinary: async () => {
  const response = await fetch(new URL('./quickjs.wasm', import.meta.url), { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Sandbox engine is unavailable.');
  return response.arrayBuffer();
} }));
self.onmessage = async (event: MessageEvent<{ source: string; contract: Contract }>) => {
  try { self.postMessage({ report: await evaluate(parseSource(event.data.source), parseContract(event.data.contract), await modulePromise) }); }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'Sandbox failed.' }); }
};
