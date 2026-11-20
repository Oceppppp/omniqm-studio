import type { ModuleExecutionResult } from '../core/types/module.types.ts';
import type { ModuleJob } from '../core/types/workspace.types.ts';
import { solveModuleJob } from '../engines/index.ts';

interface WorkerRequest {
  requestId: string;
  job: ModuleJob;
}

interface WorkerResponse {
  requestId: string;
  result: ModuleExecutionResult;
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { requestId, job } = event.data;
  const result = solveModuleJob(job);
  const payload: WorkerResponse = { requestId, result };
  self.postMessage(payload);
};
