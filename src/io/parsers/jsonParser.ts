import { MODULE_MAP, MODULE_REGISTRY } from '../../core/registry/moduleRegistry.ts';
import type {
  ForecastingInput,
  ModuleId,
  ModuleInputData,
  MrpInput,
} from '../../core/types/module.types.ts';
import type {
  DetectedSheetCandidate,
  ModuleJob,
  PipelineLink,
} from '../../core/types/workspace.types.ts';
import { DEFAULT_MODULE_INPUTS } from '../templates/sampleDatasets.ts';
import { parseCsvText } from './csvParser.ts';
import { detectModuleFromGrid, type RawCell, type RawGrid } from './fileDetector.ts';
import { extractJsModuleValue } from './jsDataParser.ts';

export interface ParsedJsonImport {
  jobs: ModuleJob[];
  links: PipelineLink[];
  candidates: DetectedSheetCandidate[];
}

function normStr(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const EXTRA_ALIASES: Record<string, ModuleId> = {
  lp: 'linear-programming',
  linearprogramming: 'linear-programming',
  simpleks: 'linear-programming',
  simplex: 'linear-programming',
  ip: 'integer-programming',
  milp: 'integer-programming',
  integerprogramming: 'integer-programming',
  transport: 'transportation',
  transportation: 'transportation',
  transportasi: 'transportation',
  assign: 'assignment',
  assignment: 'assignment',
  penugasan: 'assignment',
  hungarian: 'assignment',
  pert: 'project-management',
  cpm: 'project-management',
  pertcpm: 'project-management',
  projectmanagement: 'project-management',
  proyek: 'project-management',
  forecast: 'forecasting',
  forecasting: 'forecasting',
  peramalan: 'forecasting',
  ramalan: 'forecasting',
  eoq: 'inventory',
  poq: 'inventory',
  inventory: 'inventory',
  inventorycontrol: 'inventory',
  persediaan: 'inventory',
  abc: 'inventory',
  queue: 'waiting-lines',
  queuing: 'waiting-lines',
  waitinglines: 'waiting-lines',
  antrean: 'waiting-lines',
  antrian: 'waiting-lines',
  bep: 'break-even',
  breakeven: 'break-even',
  cvp: 'break-even',
  titikimpas: 'break-even',
  decision: 'decision-analysis',
  decisionanalysis: 'decision-analysis',
  keputusan: 'decision-analysis',
  payoff: 'decision-analysis',
  qc: 'quality-control',
  spc: 'quality-control',
  qualitycontrol: 'quality-control',
  kualitas: 'quality-control',
  xbar: 'quality-control',
  network: 'network-models',
  networkmodels: 'network-models',
  jaringan: 'network-models',
  shortestroute: 'network-models',
  mst: 'network-models',
  maxflow: 'network-models',
  markov: 'markov-analysis',
  markovanalysis: 'markov-analysis',
  mrp: 'mrp',
  bom: 'mrp',
  materialrequirementsplanning: 'mrp',
  aggregate: 'aggregate-planning',
  aggregateplanning: 'aggregate-planning',
  agregat: 'aggregate-planning',
  mps: 'aggregate-planning',
  scheduling: 'scheduling',
  schedule: 'scheduling',
  penjadwalan: 'scheduling',
  jobshopscheduling: 'scheduling',
  johnson: 'scheduling',
};

export function resolveModuleAlias(raw?: string): ModuleId | null {
  if (!raw || typeof raw !== 'string') return null;
  if (raw in MODULE_MAP) return raw as ModuleId;
  const normalized = normStr(raw);
  if (!normalized) return null;
  if (normalized in EXTRA_ALIASES) return EXTRA_ALIASES[normalized];

  for (const mod of MODULE_REGISTRY) {
    if (normStr(mod.id) === normalized) return mod.id;
    if (normStr(mod.code) === normalized) return mod.id;
    if (normStr(mod.name) === normalized) return mod.id;
    if (normStr(mod.indonesianName) === normalized) return mod.id;
    if (mod.supportedSheetAliases.some((a) => normStr(a) === normalized)) return mod.id;
  }

  // Substring hint match (only for meaningful strings >= 3 chars)
  if (normalized.length >= 3) {
    for (const [alias, modId] of Object.entries(EXTRA_ALIASES)) {
      if (alias.length >= 3 && (normalized.includes(alias) || alias.includes(normalized))) {
        return modId;
      }
    }
  }
  return null;
}

function inferModuleFromObjectKeys(obj: Record<string, unknown>): ModuleId | null {
  if ('objectiveCoeffs' in obj && 'constraints' in obj) {
    return 'variableTypes' in obj ? 'integer-programming' : 'linear-programming';
  }
  if ('supplies' in obj && 'demands' in obj && 'costs' in obj) return 'transportation';
  if ('agentNames' in obj || ('taskNames' in obj && 'costs' in obj)) return 'assignment';
  if (Array.isArray(obj.activities)) return 'project-management';
  if (Array.isArray(obj.values) && obj.values.every((v) => typeof v === 'number')) {
    return 'forecasting';
  }
  if (
    'annualDemand' in obj ||
    'orderingCost' in obj ||
    Array.isArray(obj.abcItems) ||
    Array.isArray(obj.discountTiers)
  ) {
    return 'inventory';
  }
  if ('arrivalRate' in obj || 'serviceRate' in obj) return 'waiting-lines';
  if ('fixedCost' in obj && 'sellingPricePerUnit' in obj) return 'break-even';
  if (Array.isArray(obj.alternativeNames) || Array.isArray(obj.payoffs)) return 'decision-analysis';
  if (Array.isArray(obj.samples)) return 'quality-control';
  if (Array.isArray(obj.edges)) return 'network-models';
  if (Array.isArray(obj.transitionMatrix)) return 'markov-analysis';
  if (
    Array.isArray(obj.items) &&
    obj.items.some(
      (it) => it && typeof it === 'object' && ('grossRequirements' in it || 'leadTime' in it),
    )
  ) {
    return 'mrp';
  }
  if (
    Array.isArray(obj.demands) &&
    ('regularCapacity' in obj || 'overtimeCapacity' in obj || 'subcontractCapacity' in obj)
  ) {
    return 'aggregate-planning';
  }
  if (
    Array.isArray(obj.jobs) &&
    obj.jobs.some((j) => j && typeof j === 'object' && 'processingTime' in j)
  ) {
    return 'scheduling';
  }
  return null;
}

function mergeWithDefaults(moduleId: ModuleId, rawInput: Record<string, unknown>): ModuleInputData {
  const base = structuredClone(DEFAULT_MODULE_INPUTS[moduleId]);
  const merged: Record<string, unknown> = { ...(base as unknown as Record<string, unknown>), ...rawInput };

  if (moduleId === 'forecasting') {
    const fc = merged as unknown as ForecastingInput;
    if (!Array.isArray(rawInput.weightedWeights) && Array.isArray(rawInput.weights)) {
      fc.weightedWeights = rawInput.weights as number[];
    }
    if (!Array.isArray(rawInput.periodLabels) && Array.isArray(fc.values)) {
      fc.periodLabels = fc.values.map((_, i) => `P${i + 1}`);
    }
  } else if (moduleId === 'markov-analysis') {
    const iv =
      (Array.isArray(rawInput.initialVector) ? rawInput.initialVector : undefined) ??
      (Array.isArray(rawInput.initialShares) ? rawInput.initialShares : undefined) ??
      (Array.isArray(rawInput.initialProbabilities) ? rawInput.initialProbabilities : undefined);
    const mat =
      (Array.isArray(rawInput.transitionMatrix) ? rawInput.transitionMatrix : undefined) ??
      (Array.isArray(rawInput.matrix) ? rawInput.matrix : undefined);
    if (mat) merged.transitionMatrix = mat;
    const stateCount = Array.isArray(merged.transitionMatrix)
      ? merged.transitionMatrix.length
      : Array.isArray(merged.stateNames)
        ? merged.stateNames.length
        : 2;
    if (iv) {
      merged.initialVector = iv;
    } else if (!Array.isArray(merged.initialVector) || merged.initialVector.length !== stateCount) {
      merged.initialVector = Array.from({ length: stateCount }, () => 1 / Math.max(1, stateCount));
    }
    if (!Array.isArray(rawInput.stateNames) && Array.isArray(merged.stateNames) && merged.stateNames.length !== stateCount) {
      merged.stateNames = Array.from({ length: stateCount }, (_, i) => `State ${i + 1}`);
    }
  } else if (moduleId === 'linear-programming' || moduleId === 'integer-programming') {
    if (!Array.isArray(rawInput.objectiveCoeffs) && Array.isArray(rawInput.objective)) {
      merged.objectiveCoeffs = rawInput.objective;
    }
  } else if (moduleId === 'mrp') {
    const mrp = merged as unknown as MrpInput;
    const len = mrp.periodLabels?.length ?? 6;
    if (Array.isArray(mrp.items)) {
      mrp.items = mrp.items.map((it) => ({
        ...it,
        qtyPerParent: it.qtyPerParent ?? 1,
        leadTime: it.leadTime ?? 1,
        onHand: it.onHand ?? 0,
        safetyStock: it.safetyStock ?? 0,
        lotSizing: it.lotSizing ?? 'L4L',
        grossRequirements: it.grossRequirements ?? Array<number>(len).fill(0),
        scheduledReceipts: it.scheduledReceipts ?? Array<number>(len).fill(0),
      }));
    }
  }

  return merged as unknown as ModuleInputData;
}

function createJob(
  moduleId: ModuleId,
  title: string,
  fileName: string,
  rawInput: Record<string, unknown>,
  sheetName?: string,
): ModuleJob {
  return {
    id: `job-${moduleId}-${Math.random().toString(36).slice(2, 8)}`,
    moduleId,
    title: title || MODULE_MAP[moduleId].indonesianName,
    enabled: true,
    sourceFile: fileName,
    sourceSheet: sheetName,
    input: mergeWithDefaults(moduleId, rawInput),
    updatedAt: Date.now(),
  };
}

function toRawCell(v: unknown): RawCell {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  if (Array.isArray(v)) return v.join(', ');
  return JSON.stringify(v);
}

function gridToCandidate(
  fileName: string,
  sheetName: string,
  grid: RawGrid,
): DetectedSheetCandidate | null {
  const clean = grid.filter((r) => r.some((c) => c !== null && String(c).trim() !== ''));
  if (clean.length === 0) return null;
  const detection = detectModuleFromGrid(fileName, sheetName, clean);
  return {
    id: `cand-${fileName}-${sheetName}-${Math.random().toString(36).slice(2, 7)}`,
    fileName,
    sheetName,
    suggestedModuleId: detection.moduleId,
    confidence: detection.confidence,
    reason: `${detection.reason} (JS Data)`,
    rawRows: clean,
    selected: true,
  };
}

function collectFromValue(
  value: unknown,
  fileName: string,
  labelHint: string,
  out: ParsedJsonImport,
  depth = 0,
): void {
  if (value === null || value === undefined || depth > 5) return;

  // Embedded string: JSON string or CSV/TSV dataset
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      try {
        const inner = JSON.parse(trimmed) as unknown;
        collectFromValue(inner, fileName, labelHint, out, depth + 1);
        return;
      } catch {
        // fall through to CSV check
      }
    }
    if (trimmed.includes('\n') && /[,;\t]/.test(trimmed)) {
      const cands = parseCsvText(`${fileName}${labelHint ? ` · ${labelHint}` : ''}`, trimmed);
      out.candidates.push(...cands);
    }
    return;
  }

  // Arrays
  if (Array.isArray(value)) {
    if (value.length === 0) return;

    // Case A: 1D numeric array -> Forecasting series table
    if (value.every((v) => typeof v === 'number' && Number.isFinite(v))) {
      const nums = value as number[];
      if (nums.length >= 3) {
        const grid: RawGrid = [
          ['#module', 'forecasting'],
          ['Periode', 'Permintaan'],
          ...nums.map((n, idx) => [`P${idx + 1}`, n]),
        ];
        const cand = gridToCandidate(fileName, labelHint || 'Data Serial Angka', grid);
        if (cand) out.candidates.push(cand);
      }
      return;
    }

    // Case B: 2D array (table / matrix)
    if (Array.isArray(value[0])) {
      const grid: RawGrid = value.map((row) =>
        Array.isArray(row) ? row.map(toRawCell) : [toRawCell(row)],
      );
      const cand = gridToCandidate(fileName, labelHint || 'Tabel Array 2D', grid);
      if (cand) out.candidates.push(cand);
      return;
    }

    // Case C: Array of objects
    if (value.every((v) => v && typeof v === 'object' && !Array.isArray(v))) {
      const items = value as Record<string, unknown>[];

      // C1: Array of OmniQM job objects [{ moduleId, input, ... }]
      const hasModuleWrapper = items.some(
        (it) =>
          typeof it.moduleId === 'string' ||
          typeof it.module === 'string' ||
          typeof it.modul === 'string' ||
          typeof it.moduleType === 'string',
      );
      if (hasModuleWrapper) {
        for (let i = 0; i < items.length; i += 1) {
          collectFromValue(items[i], fileName, `${labelHint || 'Modul'}_${i + 1}`, out, depth + 1);
        }
        return;
      }

      // C2: Direct domain arrays (PERT activities, edges, scheduling jobs, MRP items, ABC items)
      if ('from' in items[0] && 'to' in items[0] && ('weight' in items[0] || 'distance' in items[0] || 'capacity' in items[0])) {
        const edges = items.map((it) => ({
          from: String(it.from ?? 'A'),
          to: String(it.to ?? 'B'),
          weight: Number(it.weight ?? it.distance ?? it.capacity ?? 1) || 1,
        }));
        out.jobs.push(
          createJob('network-models', labelHint || 'Network JS Import', fileName, {
            mode: 'shortest-route',
            sourceNode: edges[0].from,
            sinkNode: edges[edges.length - 1].to,
            directed: false,
            edges,
          }),
        );
        return;
      }

      if ('predecessors' in items[0] || 'optimistic' in items[0] || ('id' in items[0] && 'duration' in items[0])) {
        const hasPert = 'optimistic' in items[0] || 'pessimistic' in items[0];
        const activities = items.map((it, idx) => ({
          id: String(it.id ?? String.fromCharCode(65 + idx)),
          name: String(it.name ?? it.aktivitas ?? `Aktivitas ${idx + 1}`),
          predecessors: Array.isArray(it.predecessors)
            ? it.predecessors.map(String)
            : typeof it.predecessors === 'string'
              ? it.predecessors.split(/[,;|]/).map((s) => s.trim()).filter(Boolean)
              : [],
          duration: it.duration !== undefined ? Number(it.duration) : undefined,
          optimistic: it.optimistic !== undefined ? Number(it.optimistic) : undefined,
          mostLikely: it.mostLikely !== undefined ? Number(it.mostLikely) : undefined,
          pessimistic: it.pessimistic !== undefined ? Number(it.pessimistic) : undefined,
          crashTime: it.crashTime !== undefined ? Number(it.crashTime) : undefined,
          normalCost: it.normalCost !== undefined ? Number(it.normalCost) : undefined,
          crashCost: it.crashCost !== undefined ? Number(it.crashCost) : undefined,
        }));
        out.jobs.push(
          createJob('project-management', labelHint || 'Proyek PERT/CPM JS', fileName, {
            mode: hasPert ? 'pert' : 'cpm',
            activities,
          }),
        );
        return;
      }

      if ('processingTime' in items[0]) {
        const jobsArr = items.map((it, i) => ({
          jobId: String(it.jobId ?? it.id ?? `Job-${i + 1}`),
          processingTime: Number(it.processingTime ?? 1),
          dueDate: Number(it.dueDate ?? 10),
          processingTimeMachine2:
            it.processingTimeMachine2 !== undefined ? Number(it.processingTimeMachine2) : undefined,
        }));
        const hasM2 = jobsArr.some((j) => (j.processingTimeMachine2 ?? 0) > 0);
        out.jobs.push(
          createJob('scheduling', labelHint || 'Penjadwalan JS', fileName, {
            mode: hasM2 ? 'johnson-two-machine' : 'single-machine',
            jobs: jobsArr,
          }),
        );
        return;
      }

      // C3: Generic array of record objects [{ Bulan: 'Jan', Qty: 120 }, ...] -> Tabular Candidate!
      const headerSet: string[] = [];
      for (const rowObj of items) {
        for (const key of Object.keys(rowObj)) {
          if (!headerSet.includes(key)) headerSet.push(key);
        }
      }
      if (headerSet.length > 0) {
        const grid: RawGrid = [
          headerSet,
          ...items.map((rowObj) => headerSet.map((h) => toRawCell(rowObj[h]))),
        ];
        const cand = gridToCandidate(fileName, labelHint || 'Tabel Objek JS', grid);
        if (cand) out.candidates.push(cand);
      }
      return;
    }
    return;
  }

  // Plain Object
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;

    // 1. Full OmniQM project bundle { jobs, links }
    if (
      Array.isArray(obj.jobs) &&
      obj.jobs.some((j) => j && typeof j === 'object' && 'moduleId' in j)
    ) {
      const jobs = (obj.jobs as ModuleJob[]).filter(
        (j) => j && typeof j.moduleId === 'string' && j.moduleId in MODULE_MAP,
      );
      const links = Array.isArray(obj.links) ? (obj.links as PipelineLink[]) : [];
      out.jobs.push(
        ...jobs.map((j) => ({
          ...j,
          sourceFile: j.sourceFile ?? fileName,
          input: mergeWithDefaults(j.moduleId, j.input as unknown as Record<string, unknown>),
        })),
      );
      out.links.push(...links);
      return;
    }

    // 2. Explicit Tabular wrapper { headers/columns, rows/data }
    const rawHeaders = Array.isArray(obj.headers)
      ? obj.headers
      : Array.isArray(obj.columns)
        ? obj.columns
        : null;
    const rawRows = Array.isArray(obj.rows)
      ? obj.rows
      : Array.isArray(obj.data) && Array.isArray(obj.data[0])
        ? obj.data
        : null;
    if (rawHeaders && rawRows) {
      const grid: RawGrid = [
        rawHeaders.map(toRawCell),
        ...(rawRows as unknown[]).map((r) => (Array.isArray(r) ? r.map(toRawCell) : [toRawCell(r)])),
      ];
      const modHint =
        resolveModuleAlias(
          typeof obj.moduleId === 'string'
            ? obj.moduleId
            : typeof obj.module === 'string'
              ? obj.module
              : typeof obj.modul === 'string'
                ? obj.modul
                : undefined,
        ) ?? undefined;
      const cand = gridToCandidate(fileName, String(obj.title ?? obj.name ?? (labelHint || 'Data Tabel JS')), grid);
      if (cand) {
        if (modHint) {
          cand.suggestedModuleId = modHint;
          cand.confidence = 0.96;
        }
        out.candidates.push(cand);
      }
      return;
    }

    // 3. Single module descriptor { moduleId | module | modul | type | moduleType, input | data | params | payload | config }
    const rawModType =
      typeof obj.moduleId === 'string'
        ? obj.moduleId
        : typeof obj.module === 'string'
          ? obj.module
          : typeof obj.modul === 'string'
            ? obj.modul
            : typeof obj.moduleType === 'string'
              ? obj.moduleType
              : typeof obj.type === 'string'
                ? obj.type
                : undefined;

    const resolvedModId = resolveModuleAlias(rawModType);
    const titleStr = String(obj.title ?? obj.name ?? obj.label ?? obj.jobTitle ?? (labelHint || ''));

    if (resolvedModId) {
      const nestedInput = obj.input ?? obj.data ?? obj.params ?? obj.payload ?? obj.config;
      if (nestedInput && typeof nestedInput === 'object' && !Array.isArray(nestedInput)) {
        out.jobs.push(
          createJob(
            resolvedModId,
            titleStr || MODULE_MAP[resolvedModId].name,
            fileName,
            nestedInput as Record<string, unknown>,
            labelHint || undefined,
          ),
        );
        return;
      }

      if (Array.isArray(nestedInput)) {
        collectFromValue(nestedInput, fileName, titleStr || resolvedModId, out, depth + 1);
        const lastCand = out.candidates[out.candidates.length - 1];
        if (lastCand) {
          lastCand.suggestedModuleId = resolvedModId;
          lastCand.confidence = 0.96;
        }
        return;
      }

      // Flat object where module fields are alongside moduleId/title
      const stripped: Record<string, unknown> = {};
      const metaKeys = new Set([
        'moduleId',
        'module',
        'modul',
        'moduleType',
        'type',
        'title',
        'name',
        'label',
        'jobTitle',
      ]);
      for (const [k, v] of Object.entries(obj)) {
        if (!metaKeys.has(k)) stripped[k] = v;
      }
      out.jobs.push(
        createJob(
          resolvedModId,
          titleStr || MODULE_MAP[resolvedModId].name,
          fileName,
          stripped,
          labelHint || undefined,
        ),
      );
      return;
    }

    // 4. Unlabeled object matching an engine input signature directly!
    const inferredMod = inferModuleFromObjectKeys(obj);
    if (inferredMod) {
      out.jobs.push(
        createJob(
          inferredMod,
          titleStr || labelHint || MODULE_MAP[inferredMod].indonesianName,
          fileName,
          obj,
          labelHint || undefined,
        ),
      );
      return;
    }

    // 5. Key-value wrapper or dictionary of multiple datasets / modules (e.g. multiple `export const ...` or `{ fc: ..., mrp: ... }`)
    const beforeJobs = out.jobs.length;
    const beforeCands = out.candidates.length;
    for (const [key, val] of Object.entries(obj)) {
      if (key === 'default' || val === undefined || val === null) continue;
      if (typeof val === 'object' || typeof val === 'string') {
        const keyHint = key;
        collectFromValue(val, fileName, keyHint, out, depth + 1);
      }
    }

    // 6. Flat primitive JS object fallback (e.g. `{ Jan: 120, Feb: 140, Mar: 165 }` or `{ demand: 2400, cost: 50, price: 80 }`)
    if (out.jobs.length === beforeJobs && out.candidates.length === beforeCands) {
      const entries = Object.entries(obj).filter(
        ([k, v]) =>
          k !== 'default' &&
          (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean'),
      );
      if (entries.length >= 2) {
        const allNumeric = entries.every(([, v]) => typeof v === 'number' && Number.isFinite(v));
        const looksLikePeriods =
          allNumeric &&
          entries.length >= 3 &&
          entries.every(([k]) =>
            /^(jan|feb|mar|apr|mei|may|jun|jul|agu|aug|sep|okt|oct|nov|des|dec|p\d+|q\d+|m\d+|w\d+|t\d+|bln|bulan|minggu|tahun|period|20\d{2}|19\d{2})/i.test(
              k.trim(),
            ),
          );
        const grid: RawGrid = looksLikePeriods
          ? [['Periode', 'Permintaan'], ...entries.map(([k, v]) => [k, toRawCell(v)])]
          : [['Parameter', 'Nilai'], ...entries.map(([k, v]) => [k, toRawCell(v)])];
        const cand = gridToCandidate(fileName, labelHint || 'Objek Data JS', grid);
        if (cand) out.candidates.push(cand);
      }
    }
  }
}

export function parseJsonOrJsText(fileName: string, text: string): ParsedJsonImport {
  const out: ParsedJsonImport = { jobs: [], links: [], candidates: [] };
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error(`File "${fileName}" kosong.`);
  }

  let parsedRoot: unknown;
  let usedJsParser = false;

  try {
    parsedRoot = JSON.parse(trimmed) as unknown;
  } catch {
    usedJsParser = true;
    const extracted = extractJsModuleValue(trimmed);
    parsedRoot = extracted.rootValue;

    // Collect top-level value first
    if (parsedRoot !== undefined) {
      collectFromValue(parsedRoot, fileName, '', out, 0);
    }

    // Collect any extra named exports that weren't already visited as rootValue
    const namedKeys = Object.keys(extracted.namedExports);
    if (extracted.defaultExport !== undefined && namedKeys.length > 0) {
      const extraNamed: Record<string, unknown> = {};
      for (const k of namedKeys) {
        if (extracted.namedExports[k] !== extracted.defaultExport) {
          extraNamed[k] = extracted.namedExports[k];
        }
      }
      if (Object.keys(extraNamed).length > 0) {
        collectFromValue(extraNamed, fileName, '', out, 0);
      }
    }

    // Fallback to scope bindings if nothing matched from exports
    if (out.jobs.length === 0 && out.candidates.length === 0) {
      if (extracted.defaultExport !== undefined && extracted.defaultExport !== parsedRoot) {
        collectFromValue(extracted.defaultExport, fileName, 'default', out, 0);
      }
      if (namedKeys.length > 0 && extracted.namedExports !== parsedRoot) {
        collectFromValue(extracted.namedExports, fileName, '', out, 0);
      }
      if (out.jobs.length === 0 && out.candidates.length === 0 && Object.keys(extracted.scopeBindings).length > 0) {
        collectFromValue(extracted.scopeBindings, fileName, '', out, 0);
      }
    }
  }

  if (!usedJsParser) {
    collectFromValue(parsedRoot, fileName, fileName.replace(/\.[^.]+$/, ''), out, 0);
  }

  // Fallback: if plain CSV/TSV inside text file with .js extension
  if (out.jobs.length === 0 && out.candidates.length === 0 && trimmed.includes('\n') && /[,;\t]/.test(trimmed)) {
    const csvCands = parseCsvText(fileName, trimmed);
    out.candidates.push(...csvCands);
  }

  // Enhance detection using filename alias if module confidence was fallback
  const fileModHint = resolveModuleAlias(fileName.replace(/\.[^.]+$/, ''));
  if (fileModHint) {
    for (const c of out.candidates) {
      if (c.confidence < 0.7) {
        c.suggestedModuleId = fileModHint;
        c.confidence = 0.85;
        c.reason = `Disesuaikan dengan nama file "${fileName}"`;
      }
    }
  }

  if (out.jobs.length === 0 && out.candidates.length === 0) {
    throw new Error(
      `Format data JS/JSON pada "${fileName}" belum dikenali. Pastikan file mengekspor objek modul, array angka/tabel, atau CSV.`,
    );
  }

  return out;
}

export async function parseJsonOrJsFile(file: File): Promise<ParsedJsonImport> {
  const text = await file.text();
  return parseJsonOrJsText(file.name, text);
}

// Backward-compatible exports
export const parseJsonText = parseJsonOrJsText;
export const parseJsonFile = parseJsonOrJsFile;
