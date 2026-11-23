import type { ModuleJob, PipelineLink, ScenarioSnapshot } from '../core/types/workspace.types.ts';

export interface WorkspaceHistoryEntry {
  jobs: ModuleJob[];
  links: PipelineLink[];
  activeJobId: string | null;
}

export const MAX_HISTORY_STEPS = 30;
export const MAX_SCENARIO_SNAPSHOTS = 5;

export function pushHistoryEntry(
  past: WorkspaceHistoryEntry[],
  current: WorkspaceHistoryEntry,
): WorkspaceHistoryEntry[] {
  const cloned: WorkspaceHistoryEntry = {
    jobs: structuredClone(current.jobs),
    links: structuredClone(current.links),
    activeJobId: current.activeJobId,
  };
  const next = [...past, cloned];
  return next.length > MAX_HISTORY_STEPS ? next.slice(next.length - MAX_HISTORY_STEPS) : next;
}

export function appendScenarioSnapshot(
  existing: ScenarioSnapshot[],
  snapshot: ScenarioSnapshot,
): ScenarioSnapshot[] {
  const next = [...existing, snapshot];
  return next.length > MAX_SCENARIO_SNAPSHOTS
    ? next.slice(next.length - MAX_SCENARIO_SNAPSHOTS)
    : next;
}
