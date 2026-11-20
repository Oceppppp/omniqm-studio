import type {
  AggregatePlanningInput,
  AssignmentInput,
  BreakEvenInput,
  DecisionAnalysisInput,
  ForecastingInput,
  IntegerProgrammingInput,
  InventoryInput,
  LinearProgrammingInput,
  MarkovAnalysisInput,
  ModuleExecutionResult,
  MrpInput,
  NetworkModelsInput,
  ProjectManagementInput,
  QualityControlInput,
  SchedulingInput,
  TransportationInput,
  WaitingLinesInput,
} from '../core/types/module.types.ts';
import type { ModuleJob } from '../core/types/workspace.types.ts';
import { solveAggregatePlanning } from './aggregatePlanning.ts';
import { solveAssignment } from './assignment.ts';
import { solveBreakEven } from './breakEven.ts';
import { solveDecisionAnalysis } from './decisionAnalysis.ts';
import { solveForecasting } from './forecasting.ts';
import { solveIntegerProgramming } from './integerProgramming.ts';
import { solveInventory } from './inventory.ts';
import { solveLinearProgramming } from './linearProgramming.ts';
import { solveMarkovAnalysis } from './markovAnalysis.ts';
import { solveMrp } from './mrp.ts';
import { solveNetworkModels } from './networkModels.ts';
import { solveProjectManagement } from './projectManagement.ts';
import { solveQualityControl } from './qualityControl.ts';
import { solveScheduling } from './scheduling.ts';
import { solveTransportation } from './transportation.ts';
import { solveWaitingLines } from './waitingLines.ts';

export function solveModuleJob(job: ModuleJob): ModuleExecutionResult {
  try {
    switch (job.moduleId) {
      case 'linear-programming':
        return solveLinearProgramming(job.id, job.title, job.input as LinearProgrammingInput);
      case 'integer-programming':
        return solveIntegerProgramming(job.id, job.title, job.input as IntegerProgrammingInput);
      case 'transportation':
        return solveTransportation(job.id, job.title, job.input as TransportationInput);
      case 'assignment':
        return solveAssignment(job.id, job.title, job.input as AssignmentInput);
      case 'project-management':
        return solveProjectManagement(job.id, job.title, job.input as ProjectManagementInput);
      case 'forecasting':
        return solveForecasting(job.id, job.title, job.input as ForecastingInput);
      case 'inventory':
        return solveInventory(job.id, job.title, job.input as InventoryInput);
      case 'waiting-lines':
        return solveWaitingLines(job.id, job.title, job.input as WaitingLinesInput);
      case 'break-even':
        return solveBreakEven(job.id, job.title, job.input as BreakEvenInput);
      case 'decision-analysis':
        return solveDecisionAnalysis(job.id, job.title, job.input as DecisionAnalysisInput);
      case 'quality-control':
        return solveQualityControl(job.id, job.title, job.input as QualityControlInput);
      case 'network-models':
        return solveNetworkModels(job.id, job.title, job.input as NetworkModelsInput);
      case 'markov-analysis':
        return solveMarkovAnalysis(job.id, job.title, job.input as MarkovAnalysisInput);
      case 'mrp':
        return solveMrp(job.id, job.title, job.input as MrpInput);
      case 'aggregate-planning':
        return solveAggregatePlanning(job.id, job.title, job.input as AggregatePlanningInput);
      case 'scheduling':
        return solveScheduling(job.id, job.title, job.input as SchedulingInput);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      jobId: job.id,
      moduleId: job.moduleId,
      jobTitle: job.title,
      status: 'error',
      executionMs: 0,
      summaryText: `Gagal menjalankan modul: ${message}`,
      kpis: [],
      tables: [],
      charts: [],
      warnings: [message],
      derivedValues: {},
      error: message,
    };
  }
}
