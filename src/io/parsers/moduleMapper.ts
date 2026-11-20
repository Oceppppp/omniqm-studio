import type {
  AggregatePlanningInput,
  AssignmentInput,
  BreakEvenInput,
  ConstraintSign,
  DecisionAnalysisInput,
  ForecastingInput,
  IntegerProgrammingInput,
  InventoryInput,
  LinearProgrammingInput,
  MarkovAnalysisInput,
  ModuleId,
  ModuleInputData,
  MrpInput,
  MrpLotSizingMethod,
  NetworkModelsInput,
  ObjectiveSense,
  ProjectManagementInput,
  QualityControlInput,
  SchedulingInput,
  TransportationInput,
  VariableDomain,
  WaitingLinesInput,
} from '../../core/types/module.types.ts';
import { DEFAULT_MODULE_INPUTS } from '../templates/sampleDatasets.ts';
import { isMetadataRow } from './columnMapping.ts';
import type { RawCell, RawGrid } from './fileDetector.ts';

export interface ModuleMapOptions {
  headerRowIndex?: number;
  columnMapping?: Record<string, number>;
}

function asStr(cell: RawCell, fallback = ''): string {
  if (cell === null || cell === undefined) return fallback;
  return String(cell).trim();
}

function asNum(cell: RawCell, fallback = 0): number {
  if (typeof cell === 'number' && Number.isFinite(cell)) return cell;
  if (typeof cell === 'string') {
    const cleaned = cell.replace(/,/g, '').trim();
    if (cleaned === '') return fallback;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function nonEmptyRows(rows: RawGrid): RawGrid {
  return rows.filter((row) => row.some((c) => c !== null && c !== undefined && String(c).trim() !== ''));
}

function stripMetadataAndGetKv(
  rows: RawGrid,
  explicitHeaderRowIndex?: number,
): {
  kv: Record<string, string>;
  tableRows: RawGrid;
} {
  const cleanRows = nonEmptyRows(rows);
  const kv: Record<string, string> = {};

  if (
    explicitHeaderRowIndex !== undefined &&
    Number.isInteger(explicitHeaderRowIndex) &&
    explicitHeaderRowIndex >= 0 &&
    explicitHeaderRowIndex < cleanRows.length
  ) {
    for (let r = 0; r < explicitHeaderRowIndex; r += 1) {
      const c0 = asStr(cleanRows[r][0]).toLowerCase();
      if (c0) kv[c0.replace(/^#/, '').replace(/[\s_-]+/g, '')] = asStr(cleanRows[r][1]);
    }
    return { kv, tableRows: cleanRows.slice(explicitHeaderRowIndex) };
  }

  const tableRows: RawGrid = [];
  let inTable = false;

  for (const row of cleanRows) {
    const c0 = asStr(row[0]).toLowerCase();
    if (!inTable && isMetadataRow(row)) {
      kv[c0.replace(/^#/, '').replace(/[\s_-]+/g, '')] = asStr(row[1]);
      continue;
    }
    inTable = true;
    tableRows.push(row);
  }
  return { kv, tableRows };
}

function parseOptNum(val: string | undefined, fallback: number): number {
  if (val === undefined || val === '') return fallback;
  return asNum(val, fallback);
}

function parseOptionalNum(val: string | undefined): number | undefined {
  if (val === undefined || val === '') return undefined;
  const cleaned = val.replace(/,/g, '').trim();
  if (cleaned === '') return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

function parseSense(val: string | undefined, defaultSense: ObjectiveSense = 'max'): ObjectiveSense {
  if (!val || val.trim() === '') return defaultSense;
  const lower = val.trim().toLowerCase();
  if (lower.startsWith('min')) return 'min';
  if (lower.startsWith('max')) return 'max';
  return defaultSense;
}

function normalizeLotSizing(raw: string): MrpLotSizingMethod {
  const up = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (up === 'FOQ' || up === 'FIXED' || up === 'FIXEDORDERQTY') return 'FOQ';
  if (up === 'POQ' || up === 'PERIODICORDERQTY') return 'POQ';
  if (up === 'EOQ' || up === 'ECONOMICORDERQTY') return 'EOQ';
  if (up === 'SM' || up === 'SILVERMEAL') return 'SM';
  return 'L4L';
}

export function mapGridToModuleInput(
  moduleId: ModuleId,
  rawRows: RawGrid,
  options?: ModuleMapOptions,
): ModuleInputData {
  const { kv, tableRows } = stripMetadataAndGetKv(rawRows, options?.headerRowIndex);
  const colMap = options?.columnMapping ?? {};
  const fallback = structuredClone(DEFAULT_MODULE_INPUTS[moduleId]);
  if (tableRows.length === 0 && Object.keys(kv).length === 0) return fallback;

  switch (moduleId) {
    case 'linear-programming':
    case 'integer-programming': {
      const header = tableRows[0] ?? [];
      const signCol = header.findIndex((h) => asStr(h).toLowerCase() === 'sign' || asStr(h).toLowerCase() === 'tanda');
      const rhsCol = header.findIndex((h) => asStr(h).toLowerCase() === 'rhs');
      const varEnd = signCol > 1 ? signCol : Math.max(2, header.length - 2);
      const variableNames = header.slice(1, varEnd).map((h, i) => asStr(h, `X${i + 1}`));
      if (variableNames.length === 0) return fallback;

      let objectiveCoeffs = variableNames.map(() => 1);
      let variableTypes: VariableDomain[] = variableNames.map(() => 'integer');
      const constraints: LinearProgrammingInput['constraints'] = [];

      for (let r = 1; r < tableRows.length; r += 1) {
        const row = tableRows[r];
        const label = asStr(row[0], `K${r}`);
        const lower = label.toLowerCase();
        if (lower.includes('objective') || lower === 'z' || lower.includes('tujuan')) {
          objectiveCoeffs = variableNames.map((_, j) => asNum(row[1 + j], 0));
        } else if (lower.includes('type') || lower.includes('tipe')) {
          variableTypes = variableNames.map((_, j) => {
            const t = asStr(row[1 + j]).toLowerCase();
            if (t.startsWith('bin')) return 'binary';
            if (t.startsWith('cont')) return 'continuous';
            return 'integer';
          });
        } else {
          const sIdx = signCol > 0 ? signCol : 1 + variableNames.length;
          const rIdx = rhsCol > 0 ? rhsCol : sIdx + 1;
          const rawSign = asStr(row[sIdx], '<=');
          const sign: ConstraintSign =
            rawSign === '>=' || rawSign === '=' ? rawSign : '<=';
          constraints.push({
            name: label,
            coeffs: variableNames.map((_, j) => asNum(row[1 + j], 0)),
            sign,
            rhs: asNum(row[rIdx], 0),
          });
        }
      }

      if (constraints.length === 0) return fallback;
      const base: LinearProgrammingInput = {
        sense: parseSense(kv.sense),
        variableNames,
        objectiveCoeffs,
        constraints,
      };
      if (moduleId === 'integer-programming') {
        return { ...base, variableTypes } satisfies IntegerProgrammingInput;
      }
      return base;
    }

    case 'transportation': {
      const header = tableRows[0] ?? [];
      const supIdx = header.findIndex((h) => asStr(h).toLowerCase().includes('supply'));
      const endCol = supIdx > 1 ? supIdx : header.length - 1;
      const destinationNames = header.slice(1, endCol).map((h, i) => asStr(h, `Tujuan ${i + 1}`));
      const sourceNames: string[] = [];
      const costs: number[][] = [];
      const supplies: number[] = [];
      let demands = destinationNames.map(() => 0);

      for (let r = 1; r < tableRows.length; r += 1) {
        const row = tableRows[r];
        const name = asStr(row[0]);
        if (name.toLowerCase().includes('demand')) {
          demands = destinationNames.map((_, j) => asNum(row[1 + j], 0));
        } else {
          sourceNames.push(name || `Sumber ${r}`);
          costs.push(destinationNames.map((_, j) => asNum(row[1 + j], 0)));
          supplies.push(asNum(row[endCol], 0));
        }
      }
      if (sourceNames.length === 0 || destinationNames.length === 0) return fallback;
      return {
        sense: parseSense(kv.sense, 'min'),
        sourceNames,
        destinationNames,
        costs,
        supplies,
        demands,
      } satisfies TransportationInput;
    }

    case 'assignment': {
      const header = tableRows[0] ?? [];
      const taskNames = header.slice(1).map((h, i) => asStr(h, `Tugas ${i + 1}`));
      const agentNames: string[] = [];
      const costs: number[][] = [];
      for (let r = 1; r < tableRows.length; r += 1) {
        const row = tableRows[r];
        agentNames.push(asStr(row[0], `Agen ${r}`));
        costs.push(taskNames.map((_, j) => asNum(row[1 + j], 0)));
      }
      if (agentNames.length === 0 || taskNames.length === 0) return fallback;
      return {
        sense: parseSense(kv.sense, 'min'),
        agentNames,
        taskNames,
        costs,
      } satisfies AssignmentInput;
    }

    case 'project-management': {
      const header = (tableRows[0] ?? []).map((h) => asStr(h).toLowerCase().replace(/[^a-z0-9]/g, ''));
      const col = (key: string, defaultIdx: number, aliases: string[] = []): number => {
        if (colMap[key] !== undefined) return colMap[key];
        const idx = header.findIndex((h) => aliases.some((a) => h === a || h.includes(a)));
        return idx >= 0 ? idx : defaultIdx;
      };

      const idCol = col('id', 0, ['id', 'kode']);
      const nameCol = col('name', 1, ['aktivitas', 'activity', 'nama']);
      const predCol = col('predecessors', 2, ['predecessor', 'pendahulu', 'pred']);
      const optCol = colMap.optimistic ?? header.findIndex((h) => h.includes('optimis') || h === 'a');
      const mlCol = colMap.mostLikely ?? header.findIndex((h) => h.includes('mostlikely') || h === 'likely' || h === 'm');
      const pesCol = colMap.pessimistic ?? header.findIndex((h) => h.includes('pessimis') || h.includes('pesimis') || h === 'b');
      const durCol = col('duration', 3, ['duration', 'durasi', 'waktu']);
      const crashTimeCol = colMap.crashTime ?? header.findIndex((h) => h.includes('crashtime'));
      const normalCostCol = colMap.normalCost ?? header.findIndex((h) => h.includes('normalcost'));
      const crashCostCol = colMap.crashCost ?? header.findIndex((h) => h.includes('crashcost'));

      const hasPertCols = optCol >= 0 || pesCol >= 0 || mlCol >= 0;
      const activities = tableRows.slice(1).map((row, idx) => {
        const id = asStr(row[idCol], String.fromCharCode(65 + idx));
        const name = asStr(row[nameCol], `Aktivitas ${id}`);
        const predRaw = asStr(row[predCol]);
        const predecessors =
          predRaw === '' || predRaw === '-'
            ? []
            : predRaw.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);

        const crashFields =
          crashTimeCol >= 0 && normalCostCol >= 0 && crashCostCol >= 0
            ? {
                crashTime: asNum(row[crashTimeCol], 1),
                normalCost: asNum(row[normalCostCol], 0),
                crashCost: asNum(row[crashCostCol], 0),
              }
            : {};

        if (hasPertCols || (colMap.duration === undefined && row.length >= 6 && crashTimeCol < 0)) {
          const oIdx = optCol >= 0 ? optCol : 3;
          const mIdx = mlCol >= 0 ? mlCol : 4;
          const pIdx = pesCol >= 0 ? pesCol : 5;
          return {
            id,
            name,
            predecessors,
            optimistic: asNum(row[oIdx], 1),
            mostLikely: asNum(row[mIdx], 2),
            pessimistic: asNum(row[pIdx], 3),
            ...crashFields,
          };
        }
        return {
          id,
          name,
          predecessors,
          duration: asNum(row[durCol], 1),
          ...crashFields,
        };
      });
      if (activities.length === 0) return fallback;
      const inferredCpm = kv.mode?.toLowerCase() === 'cpm' || (!hasPertCols && colMap.optimistic === undefined);
      return {
        mode: inferredCpm ? 'cpm' : 'pert',
        targetTime: parseOptionalNum(kv.targettime),
        targetCrashDuration: parseOptionalNum(kv.targetcrashduration),
        activities,
      } satisfies ProjectManagementInput;
    }

    case 'forecasting': {
      const valCol = colMap.value ?? 1;
      const periodCol = colMap.period ?? 0;
      const firstVal = tableRows[0]?.[valCol];
      const hasHeader =
        options?.headerRowIndex !== undefined ||
        (typeof firstVal === 'string' && Number.isNaN(Number(firstVal.replace(/,/g, '').trim())));
      const dataRows = hasHeader && tableRows.length > 1 ? tableRows.slice(1) : tableRows;
      const periodLabels: string[] = [];
      const values: number[] = [];
      for (let i = 0; i < dataRows.length; i += 1) {
        const row = dataRows[i];
        periodLabels.push(asStr(row[periodCol], `P${i + 1}`));
        values.push(asNum(row[valCol], 0));
      }
      if (values.length < 3) return fallback;
      return {
        periodLabels,
        values,
        movingAvgWindow: parseOptNum(kv.movingavgwindow, 3),
        weightedWeights: [0.5, 0.3, 0.2],
        alpha: parseOptNum(kv.alpha, 0.35),
        beta: parseOptNum(kv.beta, 0.25),
        gamma: parseOptionalNum(kv.gamma),
        seasonalPeriod: parseOptionalNum(kv.seasonalperiod),
        seasonalType: kv.seasonaltype?.toLowerCase() === 'additive' ? 'additive' : undefined,
        autoOptimize: kv.autooptimize === 'true',
        horizon: parseOptNum(kv.horizon, 3),
      } satisfies ForecastingInput;
    }

    case 'inventory': {
      const mergedKv = { ...kv };
      const abcItems: { sku: string; annualUsage: number; unitCost: number }[] = [];
      const discountTiers: { minQty: number; maxQty: number | null; unitPrice: number }[] = [];
      const header0 = asStr(tableRows[0]?.[0]).toLowerCase();

      if (
        colMap.sku !== undefined ||
        header0.includes('sku') ||
        header0.includes('item') ||
        header0.includes('barang')
      ) {
        const skuCol = colMap.sku ?? 0;
        const usageCol = colMap.annualUsage ?? 1;
        const costCol = colMap.unitCost ?? 2;
        for (let r = 1; r < tableRows.length; r += 1) {
          abcItems.push({
            sku: asStr(tableRows[r][skuCol], `SKU-${r}`),
            annualUsage: asNum(tableRows[r][usageCol], 0),
            unitCost: asNum(tableRows[r][costCol], 0),
          });
        }
      } else if (colMap.minQty !== undefined || header0.includes('minqty') || header0.includes('min')) {
        const minCol = colMap.minQty ?? 0;
        const maxCol = colMap.maxQty ?? 1;
        const priceCol = colMap.unitCost ?? 2;
        for (let r = 1; r < tableRows.length; r += 1) {
          const maxRaw = asStr(tableRows[r][maxCol]);
          discountTiers.push({
            minQty: asNum(tableRows[r][minCol], 1),
            maxQty: maxRaw === '' || maxRaw === '∞' ? null : asNum(tableRows[r][maxCol], 999),
            unitPrice: asNum(tableRows[r][priceCol], 10),
          });
        }
      } else {
        for (const row of tableRows) {
          const k = asStr(row[0]).toLowerCase().replace(/[\s_-]+/g, '');
          if (k) mergedKv[k] = asStr(row[1]);
        }
      }

      const def = fallback as InventoryInput;
      const modelRaw = (
        mergedKv.model ??
        (abcItems.length > 0 ? 'abc' : discountTiers.length > 0 ? 'quantity-discount' : def.model)
      ).toLowerCase();
      const model: InventoryInput['model'] =
        modelRaw === 'poq' || modelRaw === 'quantity-discount' || modelRaw === 'abc'
          ? modelRaw
          : 'eoq';

      return {
        ...def,
        model,
        annualDemand: parseOptNum(mergedKv.annualdemand, def.annualDemand),
        orderingCost: parseOptNum(mergedKv.orderingcost, def.orderingCost),
        holdingCostPerUnit: parseOptNum(mergedKv.holdingcostperunit, def.holdingCostPerUnit),
        unitPrice: parseOptNum(mergedKv.unitprice, def.unitPrice),
        dailyDemandRate: parseOptNum(mergedKv.dailydemandrate, def.dailyDemandRate ?? 24),
        dailyProductionRate: parseOptNum(mergedKv.dailyproductionrate, def.dailyProductionRate ?? 60),
        leadTimeDays: parseOptNum(mergedKv.leadtimedays, def.leadTimeDays ?? 5),
        demandStdDevDaily: parseOptNum(mergedKv.demandstddevdaily, def.demandStdDevDaily ?? 4),
        serviceLevelZ: parseOptNum(mergedKv.servicelevelz, def.serviceLevelZ ?? 1.645),
        workingDaysPerYear: parseOptNum(mergedKv.workingdaysperyear, def.workingDaysPerYear ?? 300),
        abcItems: abcItems.length > 0 ? abcItems : def.abcItems,
        discountTiers: discountTiers.length > 0 ? discountTiers : def.discountTiers,
      };
    }

    case 'waiting-lines': {
      const mergedKv = { ...kv };
      for (const row of tableRows) {
        const k = asStr(row[0]).toLowerCase().replace(/[\s_-]+/g, '');
        if (k) mergedKv[k] = asStr(row[1]);
      }
      const def = fallback as WaitingLinesInput;
      const m = (mergedKv.model ?? def.model).toLowerCase();
      return {
        model: m === 'mm1' || m === 'mms' || m === 'mm1k' || m === 'md1' ? m : def.model,
        arrivalRate: parseOptNum(mergedKv.arrivalrate, def.arrivalRate),
        serviceRate: parseOptNum(mergedKv.servicerate, def.serviceRate),
        servers: parseOptNum(mergedKv.servers, def.servers),
        systemCapacity: parseOptNum(mergedKv.systemcapacity, def.systemCapacity ?? 12),
        waitingCostPerHour: parseOptNum(mergedKv.waitingcostperhour, def.waitingCostPerHour ?? 35),
        serverCostPerHour: parseOptNum(mergedKv.servercostperhour, def.serverCostPerHour ?? 22),
        timeUnit: mergedKv.timeunit || def.timeUnit,
      };
    }

    case 'break-even': {
      const mergedKv = { ...kv };
      const alternatives: BreakEvenInput['alternatives'] = [];
      let inAlt = false;
      const nameCol = colMap.name ?? 0;
      const fcCol = colMap.fixedCost ?? 1;
      const vcCol = colMap.variableCost ?? 2;
      for (const row of tableRows) {
        const c0 = asStr(row[nameCol]).toLowerCase().replace(/\s+/g, '');
        if (c0 === 'alternative' || c0 === 'alternatif') {
          inAlt = true;
          continue;
        }
        if (inAlt) {
          alternatives.push({
            name: asStr(row[nameCol], 'Alternatif'),
            fixedCost: asNum(row[fcCol], 0),
            variableCost: asNum(row[vcCol], 0),
          });
        } else if (c0) {
          mergedKv[c0] = asStr(row[1]);
        }
      }
      const def = fallback as BreakEvenInput;
      return {
        fixedCost: parseOptNum(mergedKv.fixedcost, def.fixedCost),
        variableCostPerUnit: parseOptNum(mergedKv.variablecostperunit, def.variableCostPerUnit),
        sellingPricePerUnit: parseOptNum(mergedKv.sellingpriceperunit, def.sellingPricePerUnit),
        targetProfit: parseOptNum(mergedKv.targetprofit, def.targetProfit ?? 0),
        expectedVolume: parseOptNum(mergedKv.expectedvolume, def.expectedVolume ?? 5000),
        alternatives: alternatives.length > 0 ? alternatives : def.alternatives,
      };
    }

    case 'decision-analysis': {
      const header = tableRows[0] ?? [];
      const stateNames = header.slice(1).map((h, i) => asStr(h, `Kondisi ${i + 1}`));
      let probabilities = stateNames.map(() => 1 / Math.max(1, stateNames.length));
      const alternativeNames: string[] = [];
      const payoffs: number[][] = [];

      for (let r = 1; r < tableRows.length; r += 1) {
        const row = tableRows[r];
        const label = asStr(row[0]);
        if (label.toLowerCase().includes('prob')) {
          probabilities = stateNames.map((_, j) => asNum(row[1 + j], 0));
        } else {
          alternativeNames.push(label || `Alternatif ${r}`);
          payoffs.push(stateNames.map((_, j) => asNum(row[1 + j], 0)));
        }
      }
      if (alternativeNames.length === 0) return fallback;
      return {
        alternativeNames,
        stateNames,
        probabilities,
        payoffs,
        hurwiczAlpha: parseOptNum(kv.hurwiczalpha, 0.6),
        isCostTable: kv.iscosttable === 'true',
      } satisfies DecisionAnalysisInput;
    }

    case 'quality-control': {
      const dataRows = tableRows.slice(1);
      const samples = dataRows.map((row, idx) => ({
        label: asStr(row[0], `S${idx + 1}`),
        values: row
          .slice(1)
          .filter((c) => c !== null && c !== undefined && asStr(c) !== '')
          .map((c) => asNum(c, 0)),
      }));
      if (samples.length === 0) return fallback;
      const chartTypeRaw = (kv.charttype ?? 'xbar-r').toLowerCase();
      const chartType: QualityControlInput['chartType'] =
        chartTypeRaw === 'p-chart' || chartTypeRaw === 'c-chart' ? chartTypeRaw : 'xbar-r';
      return {
        chartType,
        subgroupSize: parseOptNum(kv.subgroupsize, samples[0].values.length || 4),
        usl: parseOptionalNum(kv.usl),
        lsl: parseOptionalNum(kv.lsl),
        samples,
      } satisfies QualityControlInput;
    }

    case 'network-models': {
      const fromCol = colMap.from ?? 0;
      const toCol = colMap.to ?? 1;
      const weightCol = colMap.weight ?? 2;
      const edges = tableRows.slice(1).map((row) => ({
        from: asStr(row[fromCol], 'A'),
        to: asStr(row[toCol], 'B'),
        weight: asNum(row[weightCol], 1),
      }));
      if (edges.length === 0) return fallback;
      const modeRaw = (kv.mode ?? 'shortest-route').toLowerCase();
      const mode: NetworkModelsInput['mode'] =
        modeRaw === 'mst' || modeRaw === 'max-flow' ? modeRaw : 'shortest-route';
      return {
        mode,
        sourceNode: kv.sourcenode || edges[0].from,
        sinkNode: kv.sinknode || edges[edges.length - 1].to,
        directed: kv.directed === 'true',
        edges,
      } satisfies NetworkModelsInput;
    }

    case 'markov-analysis': {
      const header = tableRows[0] ?? [];
      const stateNames = header.slice(1).map((h, i) => asStr(h, `State ${i + 1}`));
      let initialVector = stateNames.map(() => 1 / Math.max(1, stateNames.length));
      const transitionMatrix: number[][] = [];
      for (let r = 1; r < tableRows.length; r += 1) {
        const row = tableRows[r];
        const label = asStr(row[0]).toLowerCase();
        if (label.includes('initial') || label.includes('awal')) {
          initialVector = stateNames.map((_, j) => asNum(row[1 + j], 0));
        } else {
          transitionMatrix.push(stateNames.map((_, j) => asNum(row[1 + j], 0)));
        }
      }
      if (transitionMatrix.length !== stateNames.length) return fallback;
      return {
        stateNames,
        initialVector,
        transitionMatrix,
        steps: parseOptNum(kv.steps, 6),
      } satisfies MarkovAnalysisInput;
    }

    case 'mrp': {
      const header = tableRows[0] ?? [];
      const norm = header.map((h) => asStr(h).toLowerCase().replace(/[^a-z0-9]/g, ''));
      const findIdx = (key: string, aliases: string[], defaultIdx?: number): number => {
        if (colMap[key] !== undefined) return colMap[key];
        const found = norm.findIndex((h) => aliases.includes(h));
        if (found >= 0) return found;
        return defaultIdx ?? -1;
      };

      const itemCol = findIdx('item', ['item', 'material', 'komponen', 'part', 'sku'], 0);
      const levelCol = findIdx('level', ['level', 'lvl', 'llc', 'tingkat']);
      const parentCol = findIdx('parent', ['parent', 'induk']);
      const qtyCol = findIdx('qtyPerParent', ['qtyperparent', 'qty', 'jumlah']);
      const ltCol = findIdx('leadTime', ['leadtime', 'lt']);
      const ohCol = findIdx('onHand', ['onhand', 'stok']);
      const ssCol = findIdx('safetyStock', ['safetystock', 'safety', 'ss']);
      const lotCol = findIdx('lotSizing', ['lotsizing', 'lotsize', 'lot']);
      const foqCol = findIdx('fixedOrderQty', ['foq', 'fixedorderqty', 'orderqty']);
      const poqCol = findIdx('fixedOrderPeriods', ['poqperiods', 'fixedorderperiods', 'p']);
      const setupCol = findIdx('setupCost', ['setupcost', 'ordercost', 'biayapesan']);
      const holdCol = findIdx('holdingCostPerUnit', ['holdingcost', 'holdingcostperunit', 'biayasimpan']);

      const usedMetaCols = new Set(
        [itemCol, levelCol, parentCol, qtyCol, ltCol, ohCol, ssCol, lotCol, foqCol, poqCol, setupCol, holdCol].filter(
          (x) => x >= 0,
        ),
      );
      const periodIndices: number[] = [];
      for (let c = 0; c < header.length; c += 1) {
        if (!usedMetaCols.has(c)) periodIndices.push(c);
      }
      if (periodIndices.length === 0) return fallback;

      const periodLabels = periodIndices.map((c, i) => asStr(header[c], `P${i + 1}`));
      const items = tableRows.slice(1).map((row) => ({
        item: asStr(row[itemCol], 'Item'),
        level: levelCol >= 0 ? asNum(row[levelCol], 0) : 0,
        parent: parentCol >= 0 ? asStr(row[parentCol]) || undefined : undefined,
        qtyPerParent: qtyCol >= 0 ? asNum(row[qtyCol], 1) : 1,
        leadTime: ltCol >= 0 ? asNum(row[ltCol], 1) : 1,
        onHand: ohCol >= 0 ? asNum(row[ohCol], 0) : 0,
        safetyStock: ssCol >= 0 ? asNum(row[ssCol], 0) : 0,
        lotSizing: lotCol >= 0 ? normalizeLotSizing(asStr(row[lotCol])) : ('L4L' as const),
        fixedOrderQty: foqCol >= 0 ? asNum(row[foqCol], 100) : 100,
        fixedOrderPeriods: poqCol >= 0 ? Math.max(1, asNum(row[poqCol], 2)) : 2,
        setupCost: setupCol >= 0 ? asNum(row[setupCol], 100) : 100,
        holdingCostPerUnit: holdCol >= 0 ? asNum(row[holdCol], 2) : 2,
        grossRequirements: periodIndices.map((c) => asNum(row[c], 0)),
        scheduledReceipts: periodIndices.map(() => 0),
      }));
      if (items.length === 0) return fallback;
      return { periodLabels, items } satisfies MrpInput;
    }

    case 'aggregate-planning': {
      const header = tableRows[0] ?? [];
      const periodLabels = header.slice(1).map((h, i) => asStr(h, `P${i + 1}`));
      const def = fallback as AggregatePlanningInput;
      const rowMap: Record<string, number[]> = {};
      for (let r = 1; r < tableRows.length; r += 1) {
        const key = asStr(tableRows[r][0]).toLowerCase().replace(/[^a-z]/g, '');
        rowMap[key] = periodLabels.map((_, j) => asNum(tableRows[r][1 + j], 0));
      }
      const demands = rowMap.demand ?? rowMap.demands ?? rowMap.permintaan;
      if (!demands || demands.length === 0) return fallback;
      return {
        ...def,
        periodLabels,
        demands,
        regularCapacity: rowMap.regular ?? rowMap.regularcapacity ?? demands.map(() => 1400),
        overtimeCapacity: rowMap.overtime ?? rowMap.overtimecapacity ?? demands.map(() => 250),
        subcontractCapacity: rowMap.subcontract ?? rowMap.subcontractcapacity ?? demands.map(() => 300),
        initialInventory: parseOptNum(kv.initialinventory, def.initialInventory),
        initialWorkforce: parseOptNum(kv.initialworkforce, def.initialWorkforce),
        unitsPerWorker: parseOptNum(kv.unitsperworker, def.unitsPerWorker),
        regularCostPerUnit: parseOptNum(kv.regularcostperunit, def.regularCostPerUnit),
        overtimeCostPerUnit: parseOptNum(kv.overtimecostperunit, def.overtimeCostPerUnit),
        subcontractCostPerUnit: parseOptNum(kv.subcontractcostperunit, def.subcontractCostPerUnit),
        holdingCostPerUnit: parseOptNum(kv.holdingcostperunit, def.holdingCostPerUnit),
        backorderCostPerUnit: parseOptNum(kv.backordercostperunit, def.backorderCostPerUnit),
        hiringCostPerWorker: parseOptNum(kv.hiringcostperworker, def.hiringCostPerWorker),
        firingCostPerWorker: parseOptNum(kv.firingcostperworker, def.firingCostPerWorker),
      };
    }

    case 'scheduling': {
      const idCol = colMap.jobId ?? 0;
      const p1Col = colMap.processingTime ?? 1;
      const dueCol = colMap.dueDate ?? 2;
      const p2Col = colMap.processingTimeMachine2 ?? 3;
      const jobs = tableRows.slice(1).map((row, i) => ({
        jobId: asStr(row[idCol], `Job-${i + 1}`),
        processingTime: asNum(row[p1Col], 1),
        dueDate: asNum(row[dueCol], 10),
        processingTimeMachine2: row.length > p2Col ? asNum(row[p2Col], 0) : undefined,
      }));
      if (jobs.length === 0) return fallback;
      return {
        mode: kv.mode === 'johnson-two-machine' ? 'johnson-two-machine' : 'single-machine',
        jobs,
      } satisfies SchedulingInput;
    }
  }
}
