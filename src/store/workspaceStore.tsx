import {
  useCallback,
  useEffect,
  useReducer,
  type ReactNode,
} from 'react';
import type { ModuleInputData } from '../core/types/module.types.ts';
import type {
  BatchRunSummary,
  DetectedSheetCandidate,
  ModuleJob,
  PipelineLink,
  ScenarioSnapshot,
} from '../core/types/workspace.types.ts';
import { mapGridToModuleInput } from '../io/parsers/moduleMapper.ts';
import {
  createAllModulesSamplePack,
  createJobForModule,
  createPpicPipelinePreset,
} from '../io/templates/sampleDatasets.ts';
import { runAllModulesSimultaneously } from '../workers/workerPool.ts';
import {
  WorkspaceContext,
  type ActiveViewMode,
  type WorkspaceContextValue,
  type WorkspaceState,
} from './workspaceContext.ts';

const STORAGE_KEY = 'omniqm_studio_workspace_v1';

type Action =
  | { type: 'SET_VIEW'; view: ActiveViewMode }
  | { type: 'SELECT_JOB'; jobId: string; openEditor?: boolean }
  | { type: 'ADD_JOB'; job: ModuleJob }
  | { type: 'ADD_MANY_JOBS'; jobs: ModuleJob[]; links?: PipelineLink[]; replace?: boolean }
  | { type: 'UPDATE_JOB_INPUT'; jobId: string; input: ModuleInputData }
  | { type: 'UPDATE_JOB_META'; jobId: string; patch: Partial<Pick<ModuleJob, 'title' | 'enabled'>> }
  | { type: 'REMOVE_JOB'; jobId: string }
  | { type: 'ADD_LINK'; link: PipelineLink }
  | { type: 'REMOVE_LINK'; linkId: string }
  | { type: 'SAVE_SNAPSHOT'; snapshot: ScenarioSnapshot }
  | { type: 'CLEAR_SNAPSHOT' }
  | { type: 'SET_PENDING_CANDIDATES'; candidates: DetectedSheetCandidate[] }
  | { type: 'UPDATE_CANDIDATE'; id: string; patch: Partial<DetectedSheetCandidate> }
  | { type: 'CLEAR_CANDIDATES' }
  | { type: 'RUN_START'; total: number }
  | { type: 'RUN_PROGRESS'; completed: number; total: number }
  | { type: 'RUN_COMPLETE'; summary: BatchRunSummary }
  | { type: 'TOGGLE_ARCH_MODAL'; open: boolean };

function loadInitialState(): WorkspaceState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { jobs?: ModuleJob[]; links?: PipelineLink[] };
      if (Array.isArray(parsed.jobs) && parsed.jobs.length > 0) {
        return {
          jobs: parsed.jobs,
          links: Array.isArray(parsed.links) ? parsed.links : [],
          activeJobId: parsed.jobs[0].id,
          activeView: 'module-editor',
          isRunning: false,
          progress: null,
          batchSummary: null,
          scenarioSnapshot: null,
          pendingCandidates: [],
          showArchitectureModal: false,
        };
      }
    }
  } catch {
    // Ignore invalid storage
  }

  const pack = createAllModulesSamplePack();
  return {
    jobs: pack.jobs,
    links: pack.links,
    activeJobId: pack.jobs[0]?.id ?? null,
    activeView: 'batch-results',
    isRunning: false,
    progress: null,
    batchSummary: null,
    scenarioSnapshot: null,
    pendingCandidates: [],
    showArchitectureModal: false,
  };
}

function reducer(state: WorkspaceState, action: Action): WorkspaceState {
  switch (action.type) {
    case 'SET_VIEW':
      return { ...state, activeView: action.view };
    case 'SELECT_JOB':
      return {
        ...state,
        activeJobId: action.jobId,
        activeView: action.openEditor ? 'module-editor' : state.activeView,
      };
    case 'ADD_JOB':
      return {
        ...state,
        jobs: [...state.jobs, action.job],
        activeJobId: action.job.id,
        activeView: 'module-editor',
      };
    case 'ADD_MANY_JOBS': {
      const nextJobs = action.replace ? action.jobs : [...state.jobs, ...action.jobs];
      const nextLinks = action.replace
        ? action.links ?? []
        : [...state.links, ...(action.links ?? [])];
      return {
        ...state,
        jobs: nextJobs,
        links: nextLinks,
        activeJobId: action.jobs[0]?.id ?? nextJobs[0]?.id ?? null,
        batchSummary: action.replace ? null : state.batchSummary,
      };
    }
    case 'UPDATE_JOB_INPUT':
      return {
        ...state,
        jobs: state.jobs.map((j) =>
          j.id === action.jobId ? { ...j, input: action.input, updatedAt: Date.now() } : j,
        ),
      };
    case 'UPDATE_JOB_META':
      return {
        ...state,
        jobs: state.jobs.map((j) =>
          j.id === action.jobId ? { ...j, ...action.patch, updatedAt: Date.now() } : j,
        ),
      };
    case 'REMOVE_JOB': {
      const remaining = state.jobs.filter((j) => j.id !== action.jobId);
      const nextActive =
        state.activeJobId === action.jobId ? remaining[0]?.id ?? null : state.activeJobId;
      return {
        ...state,
        jobs: remaining,
        links: state.links.filter(
          (l) => l.sourceJobId !== action.jobId && l.targetJobId !== action.jobId,
        ),
        activeJobId: nextActive,
      };
    }
    case 'ADD_LINK':
      return { ...state, links: [...state.links, action.link] };
    case 'REMOVE_LINK':
      return { ...state, links: state.links.filter((l) => l.id !== action.linkId) };
    case 'SAVE_SNAPSHOT':
      return { ...state, scenarioSnapshot: action.snapshot };
    case 'CLEAR_SNAPSHOT':
      return { ...state, scenarioSnapshot: null };
    case 'SET_PENDING_CANDIDATES':
      return { ...state, pendingCandidates: action.candidates, activeView: 'file-upload' };
    case 'UPDATE_CANDIDATE':
      return {
        ...state,
        pendingCandidates: state.pendingCandidates.map((c) =>
          c.id === action.id ? { ...c, ...action.patch } : c,
        ),
      };
    case 'CLEAR_CANDIDATES':
      return { ...state, pendingCandidates: [] };
    case 'RUN_START':
      return {
        ...state,
        isRunning: true,
        progress: { completed: 0, total: action.total },
      };
    case 'RUN_PROGRESS':
      return {
        ...state,
        progress: { completed: action.completed, total: action.total },
      };
    case 'RUN_COMPLETE':
      return {
        ...state,
        isRunning: false,
        progress: null,
        batchSummary: action.summary,
      };
    case 'TOGGLE_ARCH_MODAL':
      return { ...state, showArchitectureModal: action.open };
  }
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadInitialState);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ jobs: state.jobs, links: state.links }),
      );
    } catch {
      // Ignore quota exceeded errors
    }
  }, [state.jobs, state.links]);

  const executeBatch = useCallback(
    async (jobsToRun: ModuleJob[], linksToUse: PipelineLink[], switchToBatchView = true) => {
      const enabledCount = jobsToRun.filter((j) => j.enabled).length;
      if (enabledCount === 0) return;

      dispatch({ type: 'RUN_START', total: enabledCount });
      if (switchToBatchView) {
        dispatch({ type: 'SET_VIEW', view: 'batch-results' });
      }

      const summary = await runAllModulesSimultaneously(jobsToRun, linksToUse, (upd) => {
        dispatch({ type: 'RUN_PROGRESS', completed: upd.completed, total: upd.total });
      });

      dispatch({ type: 'RUN_COMPLETE', summary });
    },
    [],
  );

  // Auto-run initial workspace once on mount so user immediately sees all 16 modules solved simultaneously
  useEffect(() => {
    if (!state.batchSummary && state.jobs.length > 0) {
      void executeBatch(state.jobs, state.links, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runAll = useCallback(
    async (switchToBatchView = true) => {
      await executeBatch(state.jobs, state.links, switchToBatchView);
    },
    [executeBatch, state.jobs, state.links],
  );

  const loadSampleAll16 = useCallback(
    (autoRun = true) => {
      const pack = createAllModulesSamplePack();
      dispatch({ type: 'CLEAR_SNAPSHOT' });
      dispatch({ type: 'ADD_MANY_JOBS', jobs: pack.jobs, links: pack.links, replace: true });
      if (autoRun) {
        void executeBatch(pack.jobs, pack.links, true);
      }
    },
    [executeBatch],
  );

  const loadPpicPipelinePreset = useCallback(
    (autoRun = true) => {
      const pack = createPpicPipelinePreset();
      dispatch({ type: 'CLEAR_SNAPSHOT' });
      dispatch({ type: 'ADD_MANY_JOBS', jobs: pack.jobs, links: pack.links, replace: true });
      if (autoRun) {
        void executeBatch(pack.jobs, pack.links, false);
      }
    },
    [executeBatch],
  );

  const duplicateJob = useCallback(
    (jobId: string) => {
      const orig = state.jobs.find((j) => j.id === jobId);
      if (!orig) return;
      const cloned: ModuleJob = {
        ...structuredClone(orig),
        id: `job-${orig.moduleId}-${Math.random().toString(36).slice(2, 8)}`,
        title: `${orig.title} (Skenario Copy)`,
        updatedAt: Date.now(),
      };
      dispatch({ type: 'ADD_JOB', job: cloned });
    },
    [state.jobs],
  );

  const saveScenarioSnapshot = useCallback(
    (label?: string) => {
      if (!state.batchSummary) return;
      dispatch({
        type: 'SAVE_SNAPSHOT',
        snapshot: {
          id: `snap-${Date.now()}`,
          label: label?.trim() || `Baseline (${new Date(state.batchSummary.finishedAt).toLocaleTimeString('id-ID')})`,
          createdAt: Date.now(),
          summary: structuredClone(state.batchSummary),
        },
      });
    },
    [state.batchSummary],
  );

  const commitPendingCandidates = useCallback(
    (replaceExisting: boolean, autoRun = true) => {
      const selected = state.pendingCandidates.filter((c) => c.selected);
      if (selected.length === 0) return;

      const createdJobs: ModuleJob[] = selected.map((c) => ({
        id: `job-${c.suggestedModuleId}-${Math.random().toString(36).slice(2, 8)}`,
        moduleId: c.suggestedModuleId,
        title: c.sheetName || c.fileName,
        enabled: true,
        sourceFile: c.fileName,
        sourceSheet: c.sheetName,
        input: mapGridToModuleInput(c.suggestedModuleId, c.rawRows, {
          headerRowIndex: c.headerRowIndex,
          columnMapping: c.columnMapping,
        }),
        updatedAt: Date.now(),
      }));

      const nextJobs = replaceExisting ? createdJobs : [...state.jobs, ...createdJobs];
      const nextLinks = replaceExisting ? [] : state.links;

      dispatch({ type: 'ADD_MANY_JOBS', jobs: createdJobs, replace: replaceExisting });
      dispatch({ type: 'CLEAR_CANDIDATES' });

      if (autoRun) {
        void executeBatch(nextJobs, nextLinks, true);
      }
    },
    [executeBatch, state.jobs, state.links, state.pendingCandidates],
  );

  const importProjectJobs = useCallback(
    (jobs: ModuleJob[], links: PipelineLink[], replace: boolean, autoRun = true) => {
      dispatch({ type: 'ADD_MANY_JOBS', jobs, links, replace });
      if (autoRun) {
        const nextJobs = replace ? jobs : [...state.jobs, ...jobs];
        const nextLinks = replace ? links : [...state.links, ...links];
        void executeBatch(nextJobs, nextLinks, true);
      }
    },
    [executeBatch, state.jobs, state.links],
  );

  const value: WorkspaceContextValue = {
    state,
    setView: (view) => dispatch({ type: 'SET_VIEW', view }),
    selectJob: (jobId, openEditor = true) => dispatch({ type: 'SELECT_JOB', jobId, openEditor }),
    addModuleJob: (moduleId) => dispatch({ type: 'ADD_JOB', job: createJobForModule(moduleId) }),
    duplicateJob,
    updateJobInput: (jobId, input) => dispatch({ type: 'UPDATE_JOB_INPUT', jobId, input }),
    updateJobMeta: (jobId, patch) => dispatch({ type: 'UPDATE_JOB_META', jobId, patch }),
    removeJob: (jobId) => dispatch({ type: 'REMOVE_JOB', jobId }),
    addLink: (link) =>
      dispatch({
        type: 'ADD_LINK',
        link: { ...link, id: `link-${Math.random().toString(36).slice(2, 8)}` },
      }),
    removeLink: (linkId) => dispatch({ type: 'REMOVE_LINK', linkId }),
    loadSampleAll16,
    loadPpicPipelinePreset,
    clearWorkspace: () => {
      dispatch({ type: 'CLEAR_SNAPSHOT' });
      dispatch({ type: 'ADD_MANY_JOBS', jobs: [], links: [], replace: true });
    },
    saveScenarioSnapshot,
    clearScenarioSnapshot: () => dispatch({ type: 'CLEAR_SNAPSHOT' }),
    setPendingCandidates: (candidates) =>
      dispatch({ type: 'SET_PENDING_CANDIDATES', candidates }),
    updateCandidate: (id, patch) => dispatch({ type: 'UPDATE_CANDIDATE', id, patch }),
    commitPendingCandidates,
    importProjectJobs,
    runAll,
    toggleArchModal: (open) => dispatch({ type: 'TOGGLE_ARCH_MODAL', open }),
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
