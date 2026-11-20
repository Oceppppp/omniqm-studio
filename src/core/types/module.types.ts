import type { ModuleChartSpec } from './chart.types.ts';

export type ModuleId =
  | 'linear-programming'
  | 'integer-programming'
  | 'transportation'
  | 'assignment'
  | 'project-management'
  | 'forecasting'
  | 'inventory'
  | 'waiting-lines'
  | 'break-even'
  | 'decision-analysis'
  | 'quality-control'
  | 'network-models'
  | 'markov-analysis'
  | 'mrp'
  | 'aggregate-planning'
  | 'scheduling';

export type ModuleCategory =
  | 'Optimization'
  | 'Operations & Inventory'
  | 'Forecasting & Decision'
  | 'Project & Network'
  | 'Quality & Scheduling';

export interface ModuleMetadata {
  id: ModuleId;
  code: string;
  name: string;
  indonesianName: string;
  category: ModuleCategory;
  shortDesc: string;
  supportedSheetAliases: string[];
  exportableOutputs: { key: string; label: string }[];
  injectableTargets: { field: string; label: string }[];
}

export type ObjectiveSense = 'max' | 'min';
export type ConstraintSign = '<=' | '>=' | '=';
export type VariableDomain = 'continuous' | 'integer' | 'binary';

export interface LinearProgrammingInput {
  sense: ObjectiveSense;
  variableNames: string[];
  objectiveCoeffs: number[];
  constraints: {
    name: string;
    coeffs: number[];
    sign: ConstraintSign;
    rhs: number;
  }[];
}

export interface IntegerProgrammingInput extends LinearProgrammingInput {
  variableTypes: VariableDomain[];
}

export interface TransportationInput {
  sense: ObjectiveSense;
  sourceNames: string[];
  destinationNames: string[];
  costs: number[][];
  supplies: number[];
  demands: number[];
}

export interface AssignmentInput {
  sense: ObjectiveSense;
  agentNames: string[];
  taskNames: string[];
  costs: number[][];
}

export interface ProjectActivityInput {
  id: string;
  name: string;
  predecessors: string[];
  duration?: number;
  optimistic?: number;
  mostLikely?: number;
  pessimistic?: number;
  crashTime?: number;
  normalCost?: number;
  crashCost?: number;
}

export interface ProjectManagementInput {
  mode: 'cpm' | 'pert';
  targetTime?: number;
  targetCrashDuration?: number;
  activities: ProjectActivityInput[];
}

export interface ForecastingInput {
  periodLabels: string[];
  values: number[];
  movingAvgWindow: number;
  weightedWeights: number[];
  alpha: number;
  beta: number;
  gamma?: number;
  seasonalPeriod?: number;
  seasonalType?: 'multiplicative' | 'additive';
  autoOptimize?: boolean;
  horizon: number;
}

export interface InventoryInput {
  model: 'eoq' | 'poq' | 'quantity-discount' | 'abc';
  annualDemand: number;
  orderingCost: number;
  holdingCostPerUnit: number;
  unitPrice: number;
  dailyDemandRate?: number;
  dailyProductionRate?: number;
  leadTimeDays?: number;
  demandStdDevDaily?: number;
  serviceLevelZ?: number;
  workingDaysPerYear?: number;
  discountTiers?: { minQty: number; maxQty: number | null; unitPrice: number }[];
  abcItems?: { sku: string; annualUsage: number; unitCost: number }[];
}

export interface WaitingLinesInput {
  model: 'mm1' | 'mms' | 'mm1k' | 'md1';
  arrivalRate: number;
  serviceRate: number;
  servers: number;
  systemCapacity?: number;
  waitingCostPerHour?: number;
  serverCostPerHour?: number;
  timeUnit?: string;
}

export interface BreakEvenInput {
  fixedCost: number;
  variableCostPerUnit: number;
  sellingPricePerUnit: number;
  targetProfit?: number;
  expectedVolume?: number;
  alternatives?: {
    name: string;
    fixedCost: number;
    variableCost: number;
  }[];
}

export interface DecisionAnalysisInput {
  alternativeNames: string[];
  stateNames: string[];
  probabilities: number[];
  payoffs: number[][];
  hurwiczAlpha: number;
  isCostTable?: boolean;
}

export interface QualityControlInput {
  chartType: 'xbar-r' | 'p-chart' | 'c-chart';
  subgroupSize: number;
  usl?: number;
  lsl?: number;
  samples: {
    label: string;
    values: number[];
    sampleSize?: number;
  }[];
}

export interface NetworkModelsInput {
  mode: 'shortest-route' | 'mst' | 'max-flow';
  sourceNode: string;
  sinkNode: string;
  directed: boolean;
  edges: {
    from: string;
    to: string;
    weight: number;
  }[];
}

export interface MarkovAnalysisInput {
  stateNames: string[];
  initialVector: number[];
  transitionMatrix: number[][];
  steps: number;
}

export type MrpLotSizingMethod = 'L4L' | 'FOQ' | 'POQ' | 'EOQ' | 'SM';

export interface MrpItemInput {
  item: string;
  level: number;
  parent?: string;
  qtyPerParent: number;
  leadTime: number;
  onHand: number;
  safetyStock: number;
  lotSizing: MrpLotSizingMethod;
  fixedOrderQty?: number;
  fixedOrderPeriods?: number;
  setupCost?: number;
  holdingCostPerUnit?: number;
  grossRequirements: number[];
  scheduledReceipts: number[];
}

export interface MrpInput {
  periodLabels: string[];
  items: MrpItemInput[];
}

export interface AggregatePlanningInput {
  periodLabels: string[];
  demands: number[];
  regularCapacity: number[];
  overtimeCapacity: number[];
  subcontractCapacity: number[];
  initialInventory: number;
  initialWorkforce: number;
  unitsPerWorker: number;
  regularCostPerUnit: number;
  overtimeCostPerUnit: number;
  subcontractCostPerUnit: number;
  holdingCostPerUnit: number;
  backorderCostPerUnit: number;
  hiringCostPerWorker: number;
  firingCostPerWorker: number;
}

export interface SchedulingJobInput {
  jobId: string;
  processingTime: number;
  processingTimeMachine2?: number;
  dueDate: number;
  weight?: number;
}

export interface SchedulingInput {
  mode: 'single-machine' | 'johnson-two-machine';
  jobs: SchedulingJobInput[];
}

export type ModuleInputMap = {
  'linear-programming': LinearProgrammingInput;
  'integer-programming': IntegerProgrammingInput;
  transportation: TransportationInput;
  assignment: AssignmentInput;
  'project-management': ProjectManagementInput;
  forecasting: ForecastingInput;
  inventory: InventoryInput;
  'waiting-lines': WaitingLinesInput;
  'break-even': BreakEvenInput;
  'decision-analysis': DecisionAnalysisInput;
  'quality-control': QualityControlInput;
  'network-models': NetworkModelsInput;
  'markov-analysis': MarkovAnalysisInput;
  mrp: MrpInput;
  'aggregate-planning': AggregatePlanningInput;
  scheduling: SchedulingInput;
};

export type ModuleInputData = ModuleInputMap[ModuleId];

export interface KpiMetric {
  label: string;
  value: string | number;
  unit?: string;
  emphasis?: 'primary' | 'success' | 'warning' | 'danger';
}

export interface ResultTable {
  id: string;
  title: string;
  subtitle?: string;
  headers: string[];
  rows: (string | number)[][];
  highlightRowIndices?: number[];
}

export interface AuditStep {
  title: string;
  formula?: string;
  detail: string;
}

export interface AnalysisSection {
  heading: string;
  body: string;
  tone?: 'neutral' | 'positive' | 'caution' | 'critical';
}

export interface DeepAnalysis {
  headline: string;
  interpretation: string;
  sections: AnalysisSection[];
  recommendations: string[];
}

export interface ModuleExecutionResult {
  jobId: string;
  moduleId: ModuleId;
  jobTitle: string;
  status: 'success' | 'warning' | 'error';
  executionMs: number;
  summaryText: string;
  kpis: KpiMetric[];
  tables: ResultTable[];
  charts: ModuleChartSpec[];
  warnings: string[];
  derivedValues: Record<string, number | string>;
  auditSteps?: AuditStep[];
  analysis?: DeepAnalysis;
  error?: string;
}

