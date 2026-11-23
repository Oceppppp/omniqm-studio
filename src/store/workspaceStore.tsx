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
  SavedProjectMeta,
  ScenarioSnapshot,
  ThemeMode,
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
  type PrintReportMode,
  type WorkspaceContextValue,
  type WorkspaceState,
} from './workspaceContext.ts';
import {
  appendScenarioSnapshot,
  pushHistoryEntry,
  type WorkspaceHistoryEntry,
} from './workspaceHistory.ts';

const LEGACY_STORAGE_KEY = 'omniqm_studio_workspace_v1';
const PROJECTS_STORAGE_KEY = 'omniqm_studio_projects_v1';
const THEME_STORAGE_KEY = 'omniqm_studio_theme_v1';

interface StoredProjectRecord {
  id: string;
  name: string;
  updatedAt: number;
  jobs: ModuleJob[];
  links: PipelineLink[];
}

interface StoredProjectsBundle {
  activeProjectId: string;
  projects: StoredProjectRecord[];
}

function readTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    // Ignore storage errors
  }
  return 'light';
}

function toProjectMeta(rec: StoredProjectRecord): SavedProjectMeta {
  return {
    id: rec.id,
    name: rec.name,
    updatedAt: rec.updatedAt,
    jobCount: rec.jobs.length,
    linkCount: rec.links.length,
  };
}

function readProjectsBundle(): StoredProjectsBundle | null {
  try {
    const raw = localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredProjectsBundle>;
    if (!Array.isArray(parsed.projects) || parsed.projects.length === 0) return null;
    const valid = parsed.projects.filter(
      (p): p is StoredProjectRecord =>
        Boolean(p && typeof p.id === 'string' && typeof p.name === 'string' && Array.isArray(p.jobs)),
    );
    if (valid.length === 0) return null;
    const activeId =
      typeof parsed.activeProjectId === 'string' && valid.some((p) => p.id === parsed.activeProjectId)
        ? parsed.activeProjectId
        : valid[0].id;
    return { activeProjectId: activeId, projects: valid };
  } catch {
    return null;
  }
}

function writeProjectsBundle(bundle: StoredProjectsBundle): string | null {
  try {
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(bundle));
    const active = bundle.projects.find((p) => p.id === bundle.activeProjectId);
    if (active) {
      localStorage.setItem(
        LEGACY_STORAGE_KEY,
        JSON.stringify({ jobs: active.jobs, links: active.links }),
      );
    }
    return null;
  } catch {
    return 'Penyimpanan lokal browser (localStorage) penuh atau dibatasi. Simpan pekerjaan Anda via tombol "Simpan .json" agar tidak hilang saat menutup tab.';
  }
}

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
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'SAVE_SNAPSHOT'; snapshot: ScenarioSnapshot }
  | { type: 'REMOVE_SNAPSHOT'; snapshotId: string }
  | { type: 'CLEAR_SNAPSHOT' }
  | {
      type: 'LOAD_PROJECT';
      projectId: string;
      projectName: string;
      projects: SavedProjectMeta[];
      jobs: ModuleJob[];
      links: PipelineLink[];
    }
  | { type: 'SYNC_PROJECTS_META'; projects: SavedProjectMeta[]; activeProjectName?: string }
  | { type: 'SET_PENDING_CANDIDATES'; candidates: DetectedSheetCandidate[] }
  | { type: 'UPDATE_CANDIDATE'; id: string; patch: Partial<DetectedSheetCandidate> }
  | { type: 'CLEAR_CANDIDATES' }
  | { type: 'RUN_START'; total: number }
  | { type: 'RUN_PROGRESS'; completed: number; total: number }
  | { type: 'RUN_COMPLETE'; summary: BatchRunSummary }
  | { type: 'TOGGLE_ARCH_MODAL'; open: boolean }
  | { type: 'SET_COMMAND_PALETTE'; open: boolean }
  | { type: 'SET_SIDEBAR_OPEN'; open: boolean }
  | { type: 'SET_THEME'; theme: ThemeMode }
  | { type: 'SET_PRINT_MODE'; mode: PrintReportMode }
  | { type: 'SET_STORAGE_WARNING'; warning: string | null };

function loadInitialState(): WorkspaceState {
  const theme = readTheme();
  const bundle = readProjectsBundle();
  if (bundle) {
    const active = bundle.projects.find((p) => p.id === bundle.activeProjectId) ?? bundle.projects[0];
    return {
      activeProjectId: active.id,
      activeProjectName: active.name,
      projects: bundle.projects.map(toProjectMeta),
      jobs: active.jobs,
      links: Array.isArray(active.links) ? active.links : [],
      activeJobId: active.jobs[0]?.id ?? null,
      activeView: 'batch-results',
      isRunning: false,
      progress: null,
      batchSummary: null,
      scenarioSnapshots: [],
      pendingCandidates: [],
      showArchitectureModal: false,
      showCommandPalette: false,
      sidebarOpen: false,
      theme,
      printMode: 'current',
      storageWarning: null,
      past: [],
      future: [],
    };
  }

  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { jobs?: ModuleJob[]; links?: PipelineLink[] };
      if (Array.isArray(parsed.jobs) && parsed.jobs.length > 0) {
        const defaultRec: StoredProjectRecord = {
          id: 'proj-default',
          name: 'Workspace Utama',
          updatedAt: Date.now(),
          jobs: parsed.jobs,
          links: Array.isArray(parsed.links) ? parsed.links : [],
        };
        writeProjectsBundle({ activeProjectId: defaultRec.id, projects: [defaultRec] });
        return {
          activeProjectId: defaultRec.id,
          activeProjectName: defaultRec.name,
          projects: [toProjectMeta(defaultRec)],
          jobs: defaultRec.jobs,
          links: defaultRec.links,
          activeJobId: defaultRec.jobs[0].id,
          activeView: 'module-editor',
          isRunning: false,
          progress: null,
          batchSummary: null,
          scenarioSnapshots: [],
          pendingCandidates: [],
          showArchitectureModal: false,
          showCommandPalette: false,
          sidebarOpen: false,
          theme,
          printMode: 'current',
          storageWarning: null,
          past: [],
          future: [],
        };
      }
    }
  } catch {
    // Ignore invalid storage
  }

  const pack = createAllModulesSamplePack();
  const initialRec: StoredProjectRecord = {
    id: 'proj-default',
    name: 'Workspace Utama (16 Modul)',
    updatedAt: Date.now(),
    jobs: pack.jobs,
    links: pack.links,
  };
  writeProjectsBundle({ activeProjectId: initialRec.id, projects: [initialRec] });
  return {
    activeProjectId: initialRec.id,
    activeProjectName: initialRec.name,
    projects: [toProjectMeta(initialRec)],
    jobs: pack.jobs,
    links: pack.links,
    activeJobId: pack.jobs[0]?.id ?? null,
    activeView: 'batch-results',
    isRunning: false,
    progress: null,
    batchSummary: null,
    scenarioSnapshots: [],
    pendingCandidates: [],
    showArchitectureModal: false,
    showCommandPalette: false,
    sidebarOpen: false,
    theme,
    printMode: 'current',
    storageWarning: null,
    past: [],
    future: [],
  };
}

function withHistory(state: WorkspaceState): Pick<WorkspaceState, 'past' | 'future'> {
  return {
    past: pushHistoryEntry(state.past, {
      jobs: state.jobs,
      links: state.links,
      activeJobId: state.activeJobId,
    }),
    future: [],
  };
}

function reducer(state: WorkspaceState, action: Action): WorkspaceState {
  switch (action.type) {
    case 'SET_VIEW':
      return { ...state, activeView: action.view, sidebarOpen: false };
    case 'SELECT_JOB':
      return {
        ...state,
        activeJobId: action.jobId,
        activeView: action.openEditor ? 'module-editor' : state.activeView,
        sidebarOpen: false,
      };
    case 'ADD_JOB':
      return {
        ...state,
        ...withHistory(state),
        jobs: [...state.jobs, action.job],
        activeJobId: action.job.id,
        activeView: 'module-editor',
        sidebarOpen: false,
      };
    case 'ADD_MANY_JOBS': {
      const nextJobs = action.replace ? action.jobs : [...state.jobs, ...action.jobs];
      const nextLinks = action.replace
        ? action.links ?? []
        : [...state.links, ...(action.links ?? [])];
      return {
        ...state,
        ...withHistory(state),
        jobs: nextJobs,
        links: nextLinks,
        activeJobId: action.jobs[0]?.id ?? nextJobs[0]?.id ?? null,
        batchSummary: action.replace ? null : state.batchSummary,
      };
    }
    case 'UPDATE_JOB_INPUT':
      return {
        ...state,
        ...withHistory(state),
        jobs: state.jobs.map((j) =>
          j.id === action.jobId ? { ...j, input: action.input, updatedAt: Date.now() } : j,
        ),
      };
    case 'UPDATE_JOB_META':
      return {
        ...state,
        ...withHistory(state),
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
        ...withHistory(state),
        jobs: remaining,
        links: state.links.filter(
          (l) => l.sourceJobId !== action.jobId && l.targetJobId !== action.jobId,
        ),
        activeJobId: nextActive,
      };
    }
    case 'ADD_LINK':
      return {
        ...state,
        ...withHistory(state),
        links: [...state.links, action.link],
      };
    case 'REMOVE_LINK':
      return {
        ...state,
        ...withHistory(state),
        links: state.links.filter((l) => l.id !== action.linkId),
      };
    case 'UNDO': {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      const currentEntry: WorkspaceHistoryEntry = {
        jobs: structuredClone(state.jobs),
        links: structuredClone(state.links),
        activeJobId: state.activeJobId,
      };
      return {
        ...state,
        jobs: previous.jobs,
        links: previous.links,
        activeJobId: previous.activeJobId ?? previous.jobs[0]?.id ?? null,
        past: state.past.slice(0, -1),
        future: [currentEntry, ...state.future].slice(0, 30),
      };
    }
    case 'REDO': {
      if (state.future.length === 0) return state;
      const [next, ...restFuture] = state.future;
      const currentEntry: WorkspaceHistoryEntry = {
        jobs: structuredClone(state.jobs),
        links: structuredClone(state.links),
        activeJobId: state.activeJobId,
      };
      return {
        ...state,
        jobs: next.jobs,
        links: next.links,
        activeJobId: next.activeJobId ?? next.jobs[0]?.id ?? null,
        past: [...state.past, currentEntry].slice(-30),
        future: restFuture,
      };
    }
    case 'SAVE_SNAPSHOT':
      return {
        ...state,
        scenarioSnapshots: appendScenarioSnapshot(state.scenarioSnapshots, action.snapshot),
      };
    case 'REMOVE_SNAPSHOT':
      return {
        ...state,
        scenarioSnapshots: state.scenarioSnapshots.filter((s) => s.id !== action.snapshotId),
      };
    case 'CLEAR_SNAPSHOT':
      return { ...state, scenarioSnapshots: [] };
    case 'LOAD_PROJECT':
      return {
        ...state,
        activeProjectId: action.projectId,
        activeProjectName: action.projectName,
        projects: action.projects,
        jobs: action.jobs,
        links: action.links,
        activeJobId: action.jobs[0]?.id ?? null,
        batchSummary: null,
        scenarioSnapshots: [],
        past: [],
        future: [],
        sidebarOpen: false,
      };
    case 'SYNC_PROJECTS_META':
      return {
        ...state,
        projects: action.projects,
        activeProjectName: action.activeProjectName ?? state.activeProjectName,
      };
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
    case 'SET_COMMAND_PALETTE':
      return { ...state, showCommandPalette: action.open };
    case 'SET_SIDEBAR_OPEN':
      return { ...state, sidebarOpen: action.open };
    case 'SET_THEME':
      return { ...state, theme: action.theme };
    case 'SET_PRINT_MODE':
      return { ...state, printMode: action.mode };
    case 'SET_STORAGE_WARNING':
      return { ...state, storageWarning: action.warning };
  }
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadInitialState);

  // Sync theme to document root & localStorage
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', state.theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, state.theme);
    } catch {
      // Ignore theme storage failures
    }
  }, [state.theme]);

  // Persist active project jobs & links safely with QuotaExceeded detection
  useEffect(() => {
    const existing = readProjectsBundle();
    const now = Date.now();
    const projectsList: StoredProjectRecord[] = existing ? [...existing.projects] : [];
    const idx = projectsList.findIndex((p) => p.id === state.activeProjectId);
    const updatedRec: StoredProjectRecord = {
      id: state.activeProjectId,
      name: state.activeProjectName,
      updatedAt: now,
      jobs: state.jobs,
      links: state.links,
    };
    if (idx >= 0) {
      projectsList[idx] = updatedRec;
    } else {
      projectsList.push(updatedRec);
    }

    const warning = writeProjectsBundle({
      activeProjectId: state.activeProjectId,
      projects: projectsList,
    });
    if (warning !== state.storageWarning) {
      dispatch({ type: 'SET_STORAGE_WARNING', warning });
    }
  }, [state.activeProjectId, state.activeProjectName, state.jobs, state.links, state.storageWarning]);

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

  // Reset full print mode after printing finishes
  useEffect(() => {
    const onAfterPrint = () => {
      dispatch({ type: 'SET_PRINT_MODE', mode: 'current' });
    };
    window.addEventListener('afterprint', onAfterPrint);
    return () => window.removeEventListener('afterprint', onAfterPrint);
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
      const idx = state.scenarioSnapshots.length + 1;
      const defaultLabel =
        idx === 1
          ? `Baseline (${new Date(state.batchSummary.finishedAt).toLocaleTimeString('id-ID')})`
          : `Skenario ${idx} (${new Date(state.batchSummary.finishedAt).toLocaleTimeString('id-ID')})`;
      dispatch({
        type: 'SAVE_SNAPSHOT',
        snapshot: {
          id: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          label: label?.trim() || defaultLabel,
          createdAt: Date.now(),
          summary: structuredClone(state.batchSummary),
        },
      });
    },
    [state.batchSummary, state.scenarioSnapshots.length],
  );

  const createProject = useCallback(
    (name: string, preset: 'empty' | 'sample16' | 'ppic' = 'sample16') => {
      const cleanName = name.trim() || `Proyek ${state.projects.length + 1}`;
      const pack =
        preset === 'ppic'
          ? createPpicPipelinePreset()
          : preset === 'sample16'
            ? createAllModulesSamplePack()
            : { jobs: [] as ModuleJob[], links: [] as PipelineLink[] };

      const newRec: StoredProjectRecord = {
        id: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: cleanName,
        updatedAt: Date.now(),
        jobs: pack.jobs,
        links: pack.links,
      };
      const existing = readProjectsBundle()?.projects ?? [];
      const nextProjects = [...existing, newRec];
      const warning = writeProjectsBundle({ activeProjectId: newRec.id, projects: nextProjects });
      if (warning) dispatch({ type: 'SET_STORAGE_WARNING', warning });

      dispatch({
        type: 'LOAD_PROJECT',
        projectId: newRec.id,
        projectName: newRec.name,
        projects: nextProjects.map(toProjectMeta),
        jobs: newRec.jobs,
        links: newRec.links,
      });

      if (pack.jobs.length > 0) {
        void executeBatch(pack.jobs, pack.links, preset !== 'ppic');
      }
    },
    [executeBatch, state.projects.length],
  );

  const switchProject = useCallback(
    (projectId: string) => {
      if (projectId === state.activeProjectId) return;
      const bundle = readProjectsBundle();
      if (!bundle) return;
      const target = bundle.projects.find((p) => p.id === projectId);
      if (!target) return;

      writeProjectsBundle({ activeProjectId: target.id, projects: bundle.projects });
      dispatch({
        type: 'LOAD_PROJECT',
        projectId: target.id,
        projectName: target.name,
        projects: bundle.projects.map(toProjectMeta),
        jobs: target.jobs,
        links: target.links,
      });

      if (target.jobs.length > 0) {
        void executeBatch(target.jobs, target.links, true);
      }
    },
    [executeBatch, state.activeProjectId],
  );

  const renameProject = useCallback(
    (projectId: string, name: string) => {
      const clean = name.trim();
      if (!clean) return;
      const bundle = readProjectsBundle();
      if (!bundle) return;
      const updated = bundle.projects.map((p) =>
        p.id === projectId ? { ...p, name: clean, updatedAt: Date.now() } : p,
      );
      writeProjectsBundle({ activeProjectId: bundle.activeProjectId, projects: updated });
      dispatch({
        type: 'SYNC_PROJECTS_META',
        projects: updated.map(toProjectMeta),
        activeProjectName: projectId === state.activeProjectId ? clean : undefined,
      });
    },
    [state.activeProjectId],
  );

  const deleteProject = useCallback(
    (projectId: string) => {
      const bundle = readProjectsBundle();
      if (!bundle || bundle.projects.length <= 1) return;
      const remaining = bundle.projects.filter((p) => p.id !== projectId);
      const nextActive =
        projectId === state.activeProjectId
          ? remaining[0]
          : remaining.find((p) => p.id === state.activeProjectId) ?? remaining[0];

      writeProjectsBundle({ activeProjectId: nextActive.id, projects: remaining });
      if (projectId === state.activeProjectId) {
        dispatch({
          type: 'LOAD_PROJECT',
          projectId: nextActive.id,
          projectName: nextActive.name,
          projects: remaining.map(toProjectMeta),
          jobs: nextActive.jobs,
          links: nextActive.links,
        });
        if (nextActive.jobs.length > 0) {
          void executeBatch(nextActive.jobs, nextActive.links, true);
        }
      } else {
        dispatch({ type: 'SYNC_PROJECTS_META', projects: remaining.map(toProjectMeta) });
      }
    },
    [executeBatch, state.activeProjectId],
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

  const triggerFullPdfReport = useCallback(() => {
    dispatch({ type: 'SET_PRINT_MODE', mode: 'full' });
    requestAnimationFrame(() => {
      setTimeout(() => {
        window.print();
      }, 120);
    });
  }, []);

  const value: WorkspaceContextValue = {
    state,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    undo: () => dispatch({ type: 'UNDO' }),
    redo: () => dispatch({ type: 'REDO' }),
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
    removeScenarioSnapshot: (snapshotId) => dispatch({ type: 'REMOVE_SNAPSHOT', snapshotId }),
    clearScenarioSnapshot: () => dispatch({ type: 'CLEAR_SNAPSHOT' }),
    createProject,
    switchProject,
    renameProject,
    deleteProject,
    setPendingCandidates: (candidates) =>
      dispatch({ type: 'SET_PENDING_CANDIDATES', candidates }),
    updateCandidate: (id, patch) => dispatch({ type: 'UPDATE_CANDIDATE', id, patch }),
    commitPendingCandidates,
    importProjectJobs,
    runAll,
    toggleArchModal: (open) => dispatch({ type: 'TOGGLE_ARCH_MODAL', open }),
    setShowCommandPalette: (open) => dispatch({ type: 'SET_COMMAND_PALETTE', open }),
    setSidebarOpen: (open) => dispatch({ type: 'SET_SIDEBAR_OPEN', open }),
    toggleTheme: () =>
      dispatch({ type: 'SET_THEME', theme: state.theme === 'light' ? 'dark' : 'light' }),
    triggerFullPdfReport,
    dismissStorageWarning: () => dispatch({ type: 'SET_STORAGE_WARNING', warning: null }),
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
