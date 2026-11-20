import { createContext, useContext } from 'react';
import type { ModuleId, ModuleInputData } from '../core/types/module.types.ts';
import type {
  BatchRunSummary,
  DetectedSheetCandidate,
  ModuleJob,
  PipelineLink,
  ScenarioSnapshot,
} from '../core/types/workspace.types.ts';

export type ActiveViewMode = 'batch-results' | 'module-editor' | 'file-upload' | 'pipeline';

export interface WorkspaceState {
  jobs: ModuleJob[];
  links: PipelineLink[];
  activeJobId: string | null;
  activeView: ActiveViewMode;
  isRunning: boolean;
  progress: { completed: number; total: number } | null;
  batchSummary: BatchRunSummary | null;
  scenarioSnapshot: ScenarioSnapshot | null;
  pendingCandidates: DetectedSheetCandidate[];
  showArchitectureModal: boolean;
}

export interface WorkspaceContextValue {
  state: WorkspaceState;
  setView: (view: ActiveViewMode) => void;
  selectJob: (jobId: string, openEditor?: boolean) => void;
  addModuleJob: (moduleId: ModuleId) => void;
  duplicateJob: (jobId: string) => void;
  updateJobInput: (jobId: string, input: ModuleInputData) => void;
  updateJobMeta: (jobId: string, patch: Partial<Pick<ModuleJob, 'title' | 'enabled'>>) => void;
  removeJob: (jobId: string) => void;
  addLink: (link: Omit<PipelineLink, 'id'>) => void;
  removeLink: (linkId: string) => void;
  loadSampleAll16: (autoRun?: boolean) => void;
  loadPpicPipelinePreset: (autoRun?: boolean) => void;
  clearWorkspace: () => void;
  saveScenarioSnapshot: (label?: string) => void;
  clearScenarioSnapshot: () => void;
  setPendingCandidates: (candidates: DetectedSheetCandidate[]) => void;
  updateCandidate: (id: string, patch: Partial<DetectedSheetCandidate>) => void;
  commitPendingCandidates: (replaceExisting: boolean, autoRun?: boolean) => void;
  importProjectJobs: (
    jobs: ModuleJob[],
    links: PipelineLink[],
    replace: boolean,
    autoRun?: boolean,
  ) => void;
  runAll: (switchToBatchView?: boolean) => Promise<void>;
  toggleArchModal: (open: boolean) => void;
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return ctx;
}
