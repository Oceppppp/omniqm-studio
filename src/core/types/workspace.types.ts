import type { ModuleExecutionResult, ModuleId, ModuleInputData } from './module.types.ts';

export interface ModuleJob<M extends ModuleId = ModuleId> {
  id: string;
  moduleId: M;
  title: string;
  enabled: boolean;
  sourceFile?: string;
  sourceSheet?: string;
  input: ModuleInputData;
  updatedAt: number;
}

export interface PipelineLink {
  id: string;
  sourceJobId: string;
  sourceOutputKey: string;
  targetJobId: string;
  targetField: string;
  multiplier: number;
}

export interface BatchRunSummary {
  runId: string;
  startedAt: number;
  finishedAt: number;
  totalDurationMs: number;
  totalJobs: number;
  successCount: number;
  warningCount: number;
  errorCount: number;
  resultsByJobId: Record<string, ModuleExecutionResult>;
}

export interface DetectedSheetCandidate {
  id: string;
  fileName: string;
  sheetName: string;
  suggestedModuleId: ModuleId;
  confidence: number;
  reason: string;
  rawRows: (string | number | boolean | null)[][];
  selected: boolean;
  headerRowIndex?: number;
  columnMapping?: Record<string, number>;
}

export interface ScenarioSnapshot {
  id: string;
  label: string;
  createdAt: number;
  summary: BatchRunSummary;
}

