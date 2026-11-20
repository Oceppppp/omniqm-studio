import * as XLSX from 'xlsx';
import { MODULE_MAP, MODULE_REGISTRY } from '../../core/registry/moduleRegistry.ts';
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
  ModuleId,
  ModuleInputData,
  MrpInput,
  NetworkModelsInput,
  ProjectManagementInput,
  QualityControlInput,
  SchedulingInput,
  TransportationInput,
  WaitingLinesInput,
} from '../../core/types/module.types.ts';
import type { BatchRunSummary, ModuleJob } from '../../core/types/workspace.types.ts';
import { DEFAULT_MODULE_INPUTS } from '../templates/sampleDatasets.ts';

function sanitizeSheetName(raw: string, used: Set<string>): string {
  const cleaned = raw.replace(/[\\/?*[\]:]/g, '_').slice(0, 28) || 'Sheet';
  let name = cleaned;
  let counter = 2;
  while (used.has(name.toLowerCase())) {
    name = `${cleaned.slice(0, 25)}_${counter}`;
    counter += 1;
  }
  used.add(name.toLowerCase());
  return name;
}

export function moduleInputToSheetRows(
  moduleId: ModuleId,
  input: ModuleInputData,
): (string | number | boolean | null)[][] {
  switch (moduleId) {
    case 'linear-programming': {
      const d = input as LinearProgrammingInput;
      return [
        ['#module', 'linear-programming'],
        ['sense', d.sense],
        ['Komponen', ...d.variableNames, 'Sign', 'RHS'],
        ['Objective Z', ...d.objectiveCoeffs, '', ''],
        ...d.constraints.map((c) => [c.name, ...c.coeffs, c.sign, c.rhs]),
      ];
    }
    case 'integer-programming': {
      const d = input as IntegerProgrammingInput;
      return [
        ['#module', 'integer-programming'],
        ['sense', d.sense],
        ['Komponen', ...d.variableNames, 'Sign', 'RHS'],
        ['Objective Z', ...d.objectiveCoeffs, '', ''],
        ['Type', ...d.variableTypes, '', ''],
        ...d.constraints.map((c) => [c.name, ...c.coeffs, c.sign, c.rhs]),
      ];
    }
    case 'transportation': {
      const d = input as TransportationInput;
      return [
        ['#module', 'transportation'],
        ['sense', d.sense],
        ['Sumber \\ Tujuan', ...d.destinationNames, 'Supply'],
        ...d.sourceNames.map((s, i) => [s, ...d.costs[i], d.supplies[i]]),
        ['Demand', ...d.demands, ''],
      ];
    }
    case 'assignment': {
      const d = input as AssignmentInput;
      return [
        ['#module', 'assignment'],
        ['sense', d.sense],
        ['Agen \\ Tugas', ...d.taskNames],
        ...d.agentNames.map((a, i) => [a, ...d.costs[i]]),
      ];
    }
    case 'project-management': {
      const d = input as ProjectManagementInput;
      const hasCrash = d.activities.some(
        (a) => a.crashTime !== undefined || a.normalCost !== undefined || a.crashCost !== undefined,
      );
      return [
        ['#module', 'project-management'],
        ['mode', d.mode],
        ['targetTime', d.targetTime ?? ''],
        ['targetCrashDuration', d.targetCrashDuration ?? ''],
        [
          'ID',
          'Aktivitas',
          'Predecessors',
          'Optimistic',
          'MostLikely',
          'Pessimistic',
          ...(hasCrash ? ['CrashTime', 'NormalCost', 'CrashCost'] : []),
        ],
        ...d.activities.map((a) => [
          a.id,
          a.name,
          a.predecessors.join(', ') || '-',
          a.optimistic ?? a.duration ?? 1,
          a.mostLikely ?? a.duration ?? 1,
          a.pessimistic ?? a.duration ?? 1,
          ...(hasCrash ? [a.crashTime ?? '', a.normalCost ?? '', a.crashCost ?? ''] : []),
        ]),
      ];
    }
    case 'forecasting': {
      const d = input as ForecastingInput;
      return [
        ['#module', 'forecasting'],
        ['movingAvgWindow', d.movingAvgWindow],
        ['alpha', d.alpha],
        ['beta', d.beta],
        ...(d.gamma !== undefined ? [['gamma', d.gamma]] : []),
        ...(d.seasonalPeriod !== undefined ? [['seasonalPeriod', d.seasonalPeriod]] : []),
        ...(d.seasonalType ? [['seasonalType', d.seasonalType]] : []),
        ...(d.autoOptimize ? [['autoOptimize', String(d.autoOptimize)]] : []),
        ['horizon', d.horizon],
        ['Periode', 'Permintaan'],
        ...d.periodLabels.map((lbl, i) => [lbl, d.values[i] ?? 0]),
      ];
    }
    case 'inventory': {
      const d = input as InventoryInput;
      return [
        ['#module', 'inventory'],
        ['model', d.model],
        ['annualDemand', d.annualDemand],
        ['orderingCost', d.orderingCost],
        ['holdingCostPerUnit', d.holdingCostPerUnit],
        ['unitPrice', d.unitPrice],
        ['dailyDemandRate', d.dailyDemandRate ?? 24],
        ['dailyProductionRate', d.dailyProductionRate ?? 60],
        ['leadTimeDays', d.leadTimeDays ?? 5],
        ['demandStdDevDaily', d.demandStdDevDaily ?? 4],
        ['serviceLevelZ', d.serviceLevelZ ?? 1.645],
        ['workingDaysPerYear', d.workingDaysPerYear ?? 300],
      ];
    }
    case 'waiting-lines': {
      const d = input as WaitingLinesInput;
      return [
        ['#module', 'waiting-lines'],
        ['model', d.model],
        ['arrivalRate', d.arrivalRate],
        ['serviceRate', d.serviceRate],
        ['servers', d.servers],
        ['systemCapacity', d.systemCapacity ?? 12],
        ['waitingCostPerHour', d.waitingCostPerHour ?? 35],
        ['serverCostPerHour', d.serverCostPerHour ?? 22],
        ['timeUnit', d.timeUnit ?? 'jam'],
      ];
    }
    case 'break-even': {
      const d = input as BreakEvenInput;
      return [
        ['#module', 'break-even'],
        ['fixedCost', d.fixedCost],
        ['variableCostPerUnit', d.variableCostPerUnit],
        ['sellingPricePerUnit', d.sellingPricePerUnit],
        ['targetProfit', d.targetProfit ?? 0],
        ['expectedVolume', d.expectedVolume ?? 5000],
        ['Alternative', 'FixedCost', 'VariableCost'],
        ...(d.alternatives ?? []).map((a) => [a.name, a.fixedCost, a.variableCost]),
      ];
    }
    case 'decision-analysis': {
      const d = input as DecisionAnalysisInput;
      return [
        ['#module', 'decision-analysis'],
        ['hurwiczAlpha', d.hurwiczAlpha],
        ['isCostTable', String(Boolean(d.isCostTable))],
        ['Alternatif', ...d.stateNames],
        ['Probability', ...d.probabilities],
        ...d.alternativeNames.map((alt, i) => [alt, ...d.payoffs[i]]),
      ];
    }
    case 'quality-control': {
      const d = input as QualityControlInput;
      const maxCols = Math.max(1, ...d.samples.map((s) => s.values.length));
      return [
        ['#module', 'quality-control'],
        ['chartType', d.chartType],
        ['subgroupSize', d.subgroupSize],
        ['usl', d.usl ?? ''],
        ['lsl', d.lsl ?? ''],
        ['Sampel', ...Array.from({ length: maxCols }, (_, i) => `Obs_${i + 1}`)],
        ...d.samples.map((s) => [s.label, ...s.values]),
      ];
    }
    case 'network-models': {
      const d = input as NetworkModelsInput;
      return [
        ['#module', 'network-models'],
        ['mode', d.mode],
        ['sourceNode', d.sourceNode],
        ['sinkNode', d.sinkNode],
        ['directed', String(d.directed)],
        ['From', 'To', 'Weight'],
        ...d.edges.map((e) => [e.from, e.to, e.weight]),
      ];
    }
    case 'markov-analysis': {
      const d = input as MarkovAnalysisInput;
      return [
        ['#module', 'markov-analysis'],
        ['steps', d.steps],
        ['From \\ To', ...d.stateNames],
        ['Initial', ...d.initialVector],
        ...d.stateNames.map((s, i) => [s, ...d.transitionMatrix[i]]),
      ];
    }
    case 'mrp': {
      const d = input as MrpInput;
      return [
        ['#module', 'mrp'],
        [
          'Item',
          'Level',
          'Parent',
          'QtyPerParent',
          'LeadTime',
          'OnHand',
          'SafetyStock',
          'LotSizing',
          'FOQ',
          'POQPeriods',
          'SetupCost',
          'HoldingCost',
          ...d.periodLabels,
        ],
        ...d.items.map((it) => [
          it.item,
          it.level,
          it.parent ?? '',
          it.qtyPerParent,
          it.leadTime,
          it.onHand,
          it.safetyStock,
          it.lotSizing,
          it.fixedOrderQty ?? 0,
          it.fixedOrderPeriods ?? 2,
          it.setupCost ?? 100,
          it.holdingCostPerUnit ?? 2,
          ...it.grossRequirements,
        ]),
      ];
    }
    case 'aggregate-planning': {
      const d = input as AggregatePlanningInput;
      return [
        ['#module', 'aggregate-planning'],
        ['initialInventory', d.initialInventory],
        ['initialWorkforce', d.initialWorkforce],
        ['unitsPerWorker', d.unitsPerWorker],
        ['regularCostPerUnit', d.regularCostPerUnit],
        ['overtimeCostPerUnit', d.overtimeCostPerUnit],
        ['subcontractCostPerUnit', d.subcontractCostPerUnit],
        ['holdingCostPerUnit', d.holdingCostPerUnit],
        ['backorderCostPerUnit', d.backorderCostPerUnit],
        ['hiringCostPerWorker', d.hiringCostPerWorker],
        ['firingCostPerWorker', d.firingCostPerWorker],
        ['Komponen', ...d.periodLabels],
        ['Demand', ...d.demands],
        ['Regular', ...d.regularCapacity],
        ['Overtime', ...d.overtimeCapacity],
        ['Subcontract', ...d.subcontractCapacity],
      ];
    }
    case 'scheduling': {
      const d = input as SchedulingInput;
      return [
        ['#module', 'scheduling'],
        ['mode', d.mode],
        ['JobID', 'ProcessingTime', 'DueDate', 'Machine2Time'],
        ...d.jobs.map((j) => [
          j.jobId,
          j.processingTime,
          j.dueDate,
          j.processingTimeMachine2 ?? 0,
        ]),
      ];
    }
  }
}

export function buildMasterTemplateBuffer(): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();

  const readmeRows = [
    ['OmniQM Studio — Master Template Multi-Modul POM-QM (16 Modul)'],
    ['Petunjuk Penggunaan:'],
    ['1. Setiap sheet di workbook ini merepresentasikan 1 modul POM-QM.'],
    ['2. Jangan hapus baris #module di baris 1 karena digunakan untuk auto-deteksi instan.'],
    ['3. Anda dapat mengedit angka, menambah baris/kolom, atau menghapus sheet yang tidak diperlukan.'],
    ['4. Upload kembali file .xlsx ini ke OmniQM Studio, lalu klik "Jalankan Semua Sekaligus".'],
    [],
    ['Daftar Modul Tersedia:', 'ID Modul', 'Nama Sheet'],
    ...MODULE_REGISTRY.map((m) => [m.indonesianName, m.id, `${m.code}_${m.id.slice(0, 20)}`]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(readmeRows), sanitizeSheetName('README', used));

  for (const mod of MODULE_REGISTRY) {
    const rows = moduleInputToSheetRows(mod.id, DEFAULT_MODULE_INPUTS[mod.id]);
    const sheetName = sanitizeSheetName(`${mod.code}_${mod.id}`, used);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheetName);
  }

  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}

export function downloadMasterTemplateExcel(): void {
  const buf = buildMasterTemplateBuffer();
  triggerDownload(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    'Master_Template_16_Modul_OmniQM.xlsx',
  );
}

export function downloadSingleModuleTemplateExcel(job: ModuleJob): void {
  const wb = XLSX.utils.book_new();
  const rows = moduleInputToSheetRows(job.moduleId, job.input);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), MODULE_MAP[job.moduleId].code);
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  triggerDownload(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `Template_${job.moduleId}.xlsx`,
  );
}

export function exportBatchResultsExcel(jobs: ModuleJob[], summary: BatchRunSummary): void {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();

  const execRows: (string | number)[][] = [
    ['Laporan Eksekusi Multi-Modul OmniQM Studio'],
    ['Waktu Eksekusi', new Date(summary.finishedAt).toLocaleString('id-ID')],
    ['Total Modul Dijalankan', summary.totalJobs, 'Sukses', summary.successCount, 'Peringatan', summary.warningCount, 'Error', summary.errorCount],
    ['Total Durasi Batch (ms)', summary.totalDurationMs],
    [],
    ['Kode', 'Modul', 'Judul Pekerjaan', 'Status', 'KPI Utama', 'Ringkasan Hasil', 'Durasi (ms)'],
  ];

  for (const job of jobs) {
    const res = summary.resultsByJobId[job.id];
    if (!res) continue;
    const meta = MODULE_MAP[job.moduleId];
    const mainKpi = res.kpis[0] ? `${res.kpis[0].label}: ${res.kpis[0].value}` : '-';
    execRows.push([
      meta.code,
      meta.indonesianName,
      job.title,
      res.status.toUpperCase(),
      mainKpi,
      res.summaryText,
      res.executionMs,
    ]);
  }

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(execRows),
    sanitizeSheetName('Ringkasan_Eksekutif', used),
  );

  for (const job of jobs) {
    const res = summary.resultsByJobId[job.id];
    if (!res) continue;
    const meta = MODULE_MAP[job.moduleId];
    const sheetRows: (string | number)[][] = [
      [`${meta.code} — ${job.title} (${meta.indonesianName})`],
      ['Status', res.status.toUpperCase(), 'Durasi (ms)', res.executionMs],
      ['Ringkasan', res.summaryText],
      [],
      ['KPI Utama', 'Nilai', 'Satuan'],
      ...res.kpis.map((k) => [k.label, String(k.value), k.unit ?? '']),
    ];

    if (res.analysis) {
      sheetRows.push([]);
      sheetRows.push(['ANALISIS MENDALAM & INTERPRETASI MANAJERIAL']);
      sheetRows.push(['Kesimpulan Utama', res.analysis.headline]);
      sheetRows.push(['Interpretasi Perhitungan', res.analysis.interpretation]);
      for (const sec of res.analysis.sections) {
        sheetRows.push([sec.heading, sec.body]);
      }
      if (res.analysis.recommendations.length > 0) {
        sheetRows.push(['Rekomendasi Tindak Lanjut']);
        res.analysis.recommendations.forEach((rec, idx) => {
          sheetRows.push([`${idx + 1}.`, rec]);
        });
      }
    }

    for (const tbl of res.tables) {
      sheetRows.push([]);
      sheetRows.push([tbl.title]);
      sheetRows.push(tbl.headers);
      for (const r of tbl.rows) sheetRows.push(r);
    }

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(sheetRows),
      sanitizeSheetName(`${meta.code}_${job.title}`, used),
    );
  }

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  triggerDownload(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `Laporan_Hasil_OmniQM_${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
