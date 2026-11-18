// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
import { Worker } from 'node:worker_threads';
import { LIMITS, parseContract, parseSource, type Contract, type Report } from './contract.js';

export async function check(source: string, contract: Contract): Promise<Report> {
  const data = { source: parseSource(source), contract: parseContract(contract) };
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./sandbox-worker.js', import.meta.url), { workerData: data, env: {}, execArgv: [], resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16 } });
    let settled = false;
    const finish = (error?: Error, report?: Report) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      void worker.terminate();
      if (error) reject(error);
      else if (report) resolve(report);
      else reject(new Error('Sandbox returned no report.'));
    };
    const timeout = setTimeout(() => finish(new Error('Sandbox exceeded its worker deadline.')), LIMITS.workerMs);
    worker.once('message', (message: { report?: Report; error?: string }) => finish(message.error ? new Error(message.error) : undefined, message.report));
    worker.once('error', (error) => finish(error));
    worker.once('exit', (code) => { if (!settled) finish(new Error(`Sandbox exited before reporting (${code}).`)); });
  });
}
