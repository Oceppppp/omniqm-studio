import type { ModuleExecutionResult } from '../types/module.types.ts';
import type { ModuleJob, PipelineLink } from '../types/workspace.types.ts';

export interface ExecutionStagePlan {
  stages: ModuleJob[][];
  hasCycle: boolean;
}

export function buildPipelineExecutionStages(
  jobs: ModuleJob[],
  links: PipelineLink[],
): ExecutionStagePlan {
  const activeJobs = jobs.filter((j) => j.enabled);
  const activeIds = new Set(activeJobs.map((j) => j.id));
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const job of activeJobs) {
    inDegree.set(job.id, 0);
    adjacency.set(job.id, []);
  }

  for (const link of links) {
    if (!activeIds.has(link.sourceJobId) || !activeIds.has(link.targetJobId)) {
      continue;
    }
    if (link.sourceJobId === link.targetJobId) continue;
    adjacency.get(link.sourceJobId)!.push(link.targetJobId);
    inDegree.set(link.targetJobId, (inDegree.get(link.targetJobId) ?? 0) + 1);
  }

  const jobMap = new Map(activeJobs.map((j) => [j.id, j]));
  const stages: ModuleJob[][] = [];
  let queue = activeJobs.filter((j) => (inDegree.get(j.id) ?? 0) === 0);
  let processed = 0;

  while (queue.length > 0) {
    stages.push(queue);
    const nextQueue: ModuleJob[] = [];
    for (const current of queue) {
      processed += 1;
      for (const neighborId of adjacency.get(current.id) ?? []) {
        const deg = (inDegree.get(neighborId) ?? 0) - 1;
        inDegree.set(neighborId, deg);
        if (deg === 0) {
          const neighbor = jobMap.get(neighborId);
          if (neighbor) nextQueue.push(neighbor);
        }
      }
    }
    queue = nextQueue;
  }

  const hasCycle = processed < activeJobs.length;
  if (hasCycle) {
    const visited = new Set(stages.flat().map((j) => j.id));
    const remaining = activeJobs.filter((j) => !visited.has(j.id));
    if (remaining.length > 0) stages.push(remaining);
  }

  return { stages, hasCycle };
}

function parseNumberSeries(raw: number | string): number[] {
  if (typeof raw === 'number' && Number.isFinite(raw)) return [raw];
  if (typeof raw !== 'string') return [];
  return raw
    .split(/[,;|]+/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
}

export function applyPipelineLinksToJob(
  job: ModuleJob,
  links: PipelineLink[],
  upstreamResults: Record<string, ModuleExecutionResult>,
): { updatedJob: ModuleJob; appliedNotes: string[] } {
  const incoming = links.filter((l) => l.targetJobId === job.id);
  if (incoming.length === 0) {
    return { updatedJob: job, appliedNotes: [] };
  }

  const clonedInput = structuredClone(job.input) as unknown as Record<string, unknown>;
  const appliedNotes: string[] = [];

  for (const link of incoming) {
    const sourceResult = upstreamResults[link.sourceJobId];
    if (!sourceResult) continue;
    const rawVal = sourceResult.derivedValues[link.sourceOutputKey];
    if (rawVal === undefined) continue;

    const mult = Number.isFinite(link.multiplier) && link.multiplier !== 0 ? link.multiplier : 1;
    const series = parseNumberSeries(rawVal).map((v) => v * mult);
    const numVal = typeof rawVal === 'number' && Number.isFinite(rawVal) ? rawVal * mult : series[0];

    if (
      link.targetField === 'demands' &&
      Array.isArray(clonedInput.demands) &&
      clonedInput.demands.length > 0 &&
      series.length > 0
    ) {
      const currentDemands = clonedInput.demands as number[];
      const nextDemands = currentDemands.map((_, t) => {
        const mapped = series[Math.min(t, series.length - 1)];
        return Math.max(0, Math.round(mapped));
      });
      clonedInput.demands = nextDemands;
      appliedNotes.push(
        `Pipeline: demands = [${nextDemands.join(', ')}] (dari ${sourceResult.jobTitle}.${link.sourceOutputKey})`,
      );
      continue;
    }

    if (
      link.targetField === 'grossRequirements' &&
      Array.isArray(clonedInput.items) &&
      series.length > 0
    ) {
      const items = clonedInput.items as {
        item: string;
        level: number;
        grossRequirements: number[];
      }[];
      const level0 = items.filter((it) => it.level === 0);
      const targets = level0.length > 0 ? level0 : items.slice(0, 1);
      for (const it of targets) {
        const len = it.grossRequirements.length;
        for (let t = 0; t < len; t += 1) {
          const val = series[t] ?? series[series.length - 1] ?? 0;
          it.grossRequirements[t] = Math.max(0, Math.round(val));
        }
      }
      appliedNotes.push(
        `Pipeline: MRP Level-0 grossRequirements = [${series.map((v) => Math.round(v)).join(', ')}] (dari ${sourceResult.jobTitle}.${link.sourceOutputKey})`,
      );
      continue;
    }

    if (numVal === undefined || !Number.isFinite(numVal)) continue;

    if (link.targetField in clonedInput && typeof clonedInput[link.targetField] === 'number') {
      clonedInput[link.targetField] = Number(numVal.toFixed(4));
      appliedNotes.push(
        `Pipeline: ${link.targetField} = ${clonedInput[link.targetField]} (dari ${sourceResult.jobTitle}.${link.sourceOutputKey})`,
      );
    } else if (
      link.targetField === 'firstPeriodDemand' &&
      Array.isArray(clonedInput.demands) &&
      clonedInput.demands.length > 0
    ) {
      const demands = [...(clonedInput.demands as number[])];
      demands[0] = Math.round(numVal);
      clonedInput.demands = demands;
      appliedNotes.push(
        `Pipeline: demands[0] = ${demands[0]} (dari ${sourceResult.jobTitle}.${link.sourceOutputKey})`,
      );
    } else if (
      link.targetField === 'firstJobProcessingTime' &&
      Array.isArray(clonedInput.jobs) &&
      clonedInput.jobs.length > 0
    ) {
      const jobsArr = clonedInput.jobs as { processingTime: number }[];
      jobsArr[0] = {
        ...jobsArr[0],
        processingTime: Number(Math.max(0.5, numVal).toFixed(2)),
      };
      appliedNotes.push(
        `Pipeline: Job #1 processingTime = ${jobsArr[0].processingTime} (dari ${sourceResult.jobTitle}.${link.sourceOutputKey})`,
      );
    } else if (
      link.targetField === 'processingTimeScale' &&
      Array.isArray(clonedInput.jobs) &&
      clonedInput.jobs.length > 0
    ) {
      const factor = Math.max(0.1, numVal);
      const jobsArr = clonedInput.jobs as { processingTime: number }[];
      clonedInput.jobs = jobsArr.map((j) => ({
        ...j,
        processingTime: Number(Math.max(0.5, j.processingTime * factor).toFixed(2)),
      }));
      appliedNotes.push(
        `Pipeline: Skala waktu proses job ×${factor.toFixed(2)} (dari ${sourceResult.jobTitle}.${link.sourceOutputKey})`,
      );
    }
  }

  return {
    updatedJob: { ...job, input: clonedInput as unknown as ModuleJob['input'] },
    appliedNotes,
  };
}

