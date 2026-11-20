export interface ChartSeries {
  name: string;
  colorToken: string;
  points: { x: number | string; y: number }[];
  dashed?: boolean;
}

export interface LineChartSpec {
  kind: 'line';
  id: string;
  title: string;
  subtitle?: string;
  xLabel: string;
  yLabel: string;
  series: ChartSeries[];
  referenceLines?: {
    label: string;
    value: number;
    colorToken: string;
    dashed?: boolean;
  }[];
}

export interface BarChartSpec {
  kind: 'bar';
  id: string;
  title: string;
  subtitle?: string;
  xLabel: string;
  yLabel: string;
  bars: {
    label: string;
    value: number;
    colorToken?: string;
    annotation?: string;
  }[];
}

export interface GanttChartSpec {
  kind: 'gantt';
  id: string;
  title: string;
  subtitle?: string;
  totalDuration: number;
  tasks: {
    id: string;
    label: string;
    es: number;
    ef: number;
    ls: number;
    lf: number;
    slack: number;
    isCritical: boolean;
  }[];
}

export interface Lp2dChartSpec {
  kind: 'lp2d';
  id: string;
  title: string;
  subtitle?: string;
  x1Label: string;
  x2Label: string;
  maxX1: number;
  maxX2: number;
  feasiblePolygon: { x1: number; x2: number }[];
  constraintLines: {
    label: string;
    p1: { x1: number; x2: number };
    p2: { x1: number; x2: number };
  }[];
  optimalPoint: { x1: number; x2: number; z: number } | null;
}

export interface NetworkNodeSpec {
  id: string;
  label: string;
  layer: number;
  subtitle?: string;
  meta?: string;
  isCritical?: boolean;
}

export interface NetworkEdgeSpec {
  from: string;
  to: string;
  label?: string;
  isCritical?: boolean;
}

export interface NetworkChartSpec {
  kind: 'network';
  id: string;
  title: string;
  subtitle?: string;
  nodes: NetworkNodeSpec[];
  edges: NetworkEdgeSpec[];
}

export type ModuleChartSpec =
  | LineChartSpec
  | BarChartSpec
  | GanttChartSpec
  | Lp2dChartSpec
  | NetworkChartSpec;

