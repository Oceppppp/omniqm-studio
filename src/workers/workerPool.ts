import {
  applyPipelineLinksToJob,
  buildPipelineExecutionStages,
} from '../core/pipeline/pipelineResolver.ts';
import type { ModuleExecutionResult } from '../core/types/module.types.ts';
import type { BatchRunSummary, ModuleJob, PipelineLink } from '../core/types/workspace.types.ts';
import { solveModuleJob } from '../engines/index.ts';

export interface BatchProgressUpdate {
  completed: number;
  total: number;
  latestResult: ModuleExecutionResult;
}

interface QueuedTask {
  requestId: string;
  job: ModuleJob;
  resolve: (res: ModuleExecutionResult) => void;
}

interface WorkerSlot {
  worker: Worker;
  busy: boolean;
  activeTask: QueuedTask | null;
  timer: ReturnType<typeof setTimeout> | null;
}

const MAX_POOL_CAP = 8;
const TASK_TIMEOUT_MS = 15_000;

let workerSlots: WorkerSlot[] = [];
const pendingQueue: QueuedTask[] = [];
let seqCounter = 0;

export function getWorkerPoolSize(): number {
  const hc = typeof navigator !== 'undefined' && navigator.hardwareConcurrency
    ? navigator.hardwareConcurrency
    : 4;
  return Math.max(2, Math.min(hc, MAX_POOL_CAP));
}

export function disposeWorkerPool(): void {
  for (const slot of workerSlots) {
    if (slot.timer !== null) clearTimeout(slot.timer);
    slot.worker.terminate();
  }
  workerSlots = [];
  while (pendingQueue.length > 0) {
    const task = pendingQueue.shift()!;
    task.resolve(solveModuleJob(task.job));
  }
}

function releaseSlotAndPumpNext(slot: WorkerSlot): void {
  if (slot.timer !== null) {
    clearTimeout(slot.timer);
    slot.timer = null;
  }
  slot.busy = false;
  slot.activeTask = null;

  const nextTask = pendingQueue.shift();
  if (nextTask) {
    assignTaskToSlot(slot, nextTask);
  }
}

function createWorkerSlot(): WorkerSlot | null {
  try {
    const worker = new Worker(new URL('./solver.worker.ts', import.meta.url), {
      type: 'module',
    });

    const slot: WorkerSlot = {
      worker,
      busy: false,
      activeTask: null,
      timer: null,
    };

    worker.onmessage = (event: MessageEvent<{ requestId: string; result: ModuleExecutionResult }>) => {
      const task = slot.activeTask;
      if (!task || event.data.requestId !== task.requestId) return;
      task.resolve(event.data.result);
      releaseSlotAndPumpNext(slot);
    };

    worker.onerror = () => {
      const failedTask = slot.activeTask;
      if (slot.timer !== null) {
        clearTimeout(slot.timer);
        slot.timer = null;
      }
      workerSlots = workerSlots.filter((s) => s !== slot);
      worker.terminate();
      if (failedTask) {
        failedTask.resolve(solveModuleJob(failedTask.job));
      }
      // Pump remaining tasks on surviving slots or a freshly spawned replacement
      const next = pendingQueue.shift();
      if (next) dispatchViaPool(next);
    };

    workerSlots.push(slot);
    return slot;
  } catch {
    return null;
  }
}

function assignTaskToSlot(slot: WorkerSlot, task: QueuedTask): void {
  slot.busy = true;
  slot.activeTask = task;
  slot.timer = setTimeout(() => {
    const timedOut = slot.activeTask;
    workerSlots = workerSlots.filter((s) => s !== slot);
    slot.worker.terminate();
    if (timedOut) {
      timedOut.resolve(solveModuleJob(timedOut.job));
    }
    const next = pendingQueue.shift();
    if (next) dispatchViaPool(next);
  }, TASK_TIMEOUT_MS);

  slot.worker.postMessage({ requestId: task.requestId, job: task.job });
}

function dispatchViaPool(task: QueuedTask): void {
  const idleSlot = workerSlots.find((s) => !s.busy);
  if (idleSlot) {
    assignTaskToSlot(idleSlot, task);
    return;
  }

  const targetSize = getWorkerPoolSize();
  if (workerSlots.length < targetSize) {
    const freshSlot = createWorkerSlot();
    if (freshSlot) {
      assignTaskToSlot(freshSlot, task);
      return;
    }
    task.resolve(solveModuleJob(task.job));
    return;
  }

  pendingQueue.push(task);
}

function runSingleJobViaWorker(job: ModuleJob): Promise<ModuleExecutionResult> {
  if (typeof Worker === 'undefined') {
    return Promise.resolve(solveModuleJob(job));
  }

  return new Promise((resolve) => {
    seqCounter += 1;
    const requestId = `${job.id}-${seqCounter}-${Date.now()}`;
    dispatchViaPool({ requestId, job, resolve });
  });
}

export async function runAllModulesSimultaneously(
  jobs: ModuleJob[],
  links: PipelineLink[],
  onProgress?: (update: BatchProgressUpdate) => void,
): Promise<BatchRunSummary> {
  const startedAt = Date.now();
  const plan = buildPipelineExecutionStages(jobs, links);
  const totalJobs = plan.stages.reduce((acc, s) => acc + s.length, 0);
  const resultsByJobId: Record<string, ModuleExecutionResult> = {};
  let completed = 0;

  for (const stage of plan.stages) {
    // All independent modules in the same stage execute in parallel across pooled Web Workers!
    const stageResults = await Promise.all(
      stage.map(async (rawJob) => {
        const { updatedJob, appliedNotes } = applyPipelineLinksToJob(
          rawJob,
          links,
          resultsByJobId,
        );
        const result = await runSingleJobViaWorker(updatedJob);
        if (appliedNotes.length > 0) {
          result.warnings = [...appliedNotes, ...result.warnings];
        }
        completed += 1;
        onProgress?.({ completed, total: totalJobs, latestResult: result });
        return result;
      }),
    );

    for (const res of stageResults) {
      resultsByJobId[res.jobId] = res;
    }
  }

  const finishedAt = Date.now();
  const values = Object.values(resultsByJobId);
  const successCount = values.filter((r) => r.status === 'success').length;
  const warningCount = values.filter((r) => r.status === 'warning').length;
  const errorCount = values.filter((r) => r.status === 'error').length;

  return {
    runId: `run-${startedAt}`,
    startedAt,
    finishedAt,
    totalDurationMs: Math.max(1, finishedAt - startedAt),
    totalJobs: values.length,
    successCount,
    warningCount,
    errorCount,
    resultsByJobId,
  };
}
