// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
import { parentPort, workerData } from 'node:worker_threads';
import { parseContract, parseSource, type Contract } from './contract.js';
import { evaluate } from './sandbox-core.js';

const data = workerData as { source: string; contract: Contract };
try {
  parentPort?.postMessage({ report: await evaluate(parseSource(data.source), parseContract(data.contract)) });
} catch (error) {
  parentPort?.postMessage({ error: error instanceof Error ? error.message : 'Sandbox failed.' });
}
