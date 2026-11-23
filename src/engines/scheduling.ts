import { formatNum, roundTo } from '../core/math/matrix.ts';
import type {
  ModuleExecutionResult,
  ResultTable,
  SchedulingInput,
  SchedulingJobInput,
} from '../core/types/module.types.ts';

interface SingleMachineSlot {
  jobId: string;
  start: number;
  finish: number;
  dueDate: number;
  lateness: number;
  weight: number;
}

interface RuleEval {
  ruleName: string;
  sequence: string[];
  avgCompletion: number;
  weightedFlowTime: number;
  utilizationPct: number;
  avgJobsInSystem: number;
  avgLateness: number;
  maxLateness: number;
  tardyCount: number;
  makespan: number;
  slots: SingleMachineSlot[];
  detailRows: (string | number)[][];
}

function evaluateSingleMachineRule(
  ruleName: string,
  orderedJobs: SchedulingJobInput[],
): RuleEval {
  let time = 0;
  let sumFlow = 0;
  let sumWeightedFlow = 0;
  let sumProc = 0;
  let sumLateness = 0;
  let maxLateness = 0;
  let tardyCount = 0;
  const slots: SingleMachineSlot[] = [];
  const detailRows: (string | number)[][] = [];

  for (const job of orderedJobs) {
    const proc = Math.max(0, job.processingTime);
    const weight = job.weight !== undefined && Number.isFinite(job.weight) && job.weight > 0 ? job.weight : 1;
    const start = time;
    const finish = start + proc;
    const lateness = Math.max(0, finish - job.dueDate);
    if (lateness > 1e-9) tardyCount += 1;
    if (lateness > maxLateness) maxLateness = lateness;

    time = finish;
    sumFlow += finish;
    sumWeightedFlow += weight * finish;
    sumProc += proc;
    sumLateness += lateness;

    slots.push({ jobId: job.jobId, start, finish, dueDate: job.dueDate, lateness, weight });
    detailRows.push([
      job.jobId,
      roundTo(proc, 2),
      roundTo(weight, 2),
      roundTo(job.dueDate, 2),
      roundTo(start, 2),
      roundTo(finish, 2),
      roundTo(lateness, 2),
    ]);
  }

  const n = Math.max(1, orderedJobs.length);
  return {
    ruleName,
    sequence: orderedJobs.map((j) => j.jobId),
    avgCompletion: sumFlow / n,
    weightedFlowTime: sumWeightedFlow,
    utilizationPct: sumFlow > 0 ? (sumProc / sumFlow) * 100 : 100,
    avgJobsInSystem: sumProc > 0 ? sumFlow / sumProc : 1,
    avgLateness: sumLateness / n,
    maxLateness,
    tardyCount,
    makespan: time,
    slots,
    detailRows,
  };
}

interface JohnsonScheduleSlot {
  jobId: string;
  t1: number;
  t2: number;
  m1Start: number;
  m1End: number;
  m2Start: number;
  m2End: number;
  idleM2: number;
}

function solveJohnson(jobs: SchedulingJobInput[]): {
  sequence: SchedulingJobInput[];
  makespan: number;
  totalM1: number;
  totalM2: number;
  slots: JohnsonScheduleSlot[];
  rows: (string | number)[][];
} {
  const remaining = [...jobs];
  const left: SchedulingJobInput[] = [];
  const right: SchedulingJobInput[] = [];

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestTime = Infinity;
    let onMachine1 = true;

    remaining.forEach((j, idx) => {
      const t1 = Math.max(0, j.processingTime);
      const t2 = Math.max(0, j.processingTimeMachine2 ?? 0);
      if (t1 < bestTime) {
        bestTime = t1;
        bestIdx = idx;
        onMachine1 = true;
      }
      if (t2 < bestTime) {
        bestTime = t2;
        bestIdx = idx;
        onMachine1 = false;
      }
    });

    const [picked] = remaining.splice(bestIdx, 1);
    if (onMachine1) left.push(picked);
    else right.unshift(picked);
  }

  const sequence = [...left, ...right];
  let m1Time = 0;
  let m2Time = 0;
  let totalM1 = 0;
  let totalM2 = 0;
  const slots: JohnsonScheduleSlot[] = [];
  const rows: (string | number)[][] = [];

  for (const job of sequence) {
    const t1 = Math.max(0, job.processingTime);
    const t2 = Math.max(0, job.processingTimeMachine2 ?? 0);
    const m1Start = m1Time;
    const m1End = m1Start + t1;
    const m2Start = Math.max(m1End, m2Time);
    const m2End = m2Start + t2;
    const idleM2 = Math.max(0, m1End - m2Time);

    m1Time = m1End;
    m2Time = m2End;
    totalM1 += t1;
    totalM2 += t2;

    slots.push({ jobId: job.jobId, t1, t2, m1Start, m1End, m2Start, m2End, idleM2 });
    rows.push([
      job.jobId,
      roundTo(t1, 2),
      roundTo(t2, 2),
      `${roundTo(m1Start, 1)} – ${roundTo(m1End, 1)}`,
      `${roundTo(m2Start, 1)} – ${roundTo(m2End, 1)}`,
      roundTo(idleM2, 2),
    ]);
  }

  return { sequence, makespan: m2Time, totalM1, totalM2, slots, rows };
}

export function solveScheduling(
  jobId: string,
  jobTitle: string,
  input: SchedulingInput,
): ModuleExecutionResult {
  const start = performance.now();
  if (input.jobs.length === 0) {
    return {
      jobId,
      moduleId: 'scheduling',
      jobTitle,
      status: 'error',
      executionMs: 0,
      summaryText: 'Daftar job penjadwalan kosong.',
      kpis: [],
      tables: [],
      charts: [],
      warnings: ['Tambahkan minimal 1 pekerjaan (job).'],
      derivedValues: {},
      error: 'Daftar job kosong.',
    };
  }

  if (input.mode === 'johnson-two-machine') {
    const jRes = solveJohnson(input.jobs);
    const seqStr = jRes.sequence.map((j) => j.jobId).join(' → ');
    const totalIdleM2 = jRes.slots.reduce((s, slot) => s + slot.idleM2, 0);
    const totalIdleM1 = Math.max(0, jRes.makespan - jRes.totalM1);
    const utilM1 = jRes.makespan > 1e-9 ? (jRes.totalM1 / jRes.makespan) * 100 : 100;
    const utilM2 = jRes.makespan > 1e-9 ? (jRes.totalM2 / jRes.makespan) * 100 : 100;
    const bottleneckMachine = jRes.totalM1 >= jRes.totalM2 ? 'Mesin 1 (M1)' : 'Mesin 2 (M2)';

    const ganttTasks = jRes.slots.flatMap((slot) => [
      {
        id: `${slot.jobId}-M1`,
        label: `${slot.jobId} (M1)`,
        es: roundTo(slot.m1Start, 2),
        ef: roundTo(slot.m1End, 2),
        ls: roundTo(slot.m1Start, 2),
        lf: roundTo(slot.m1End, 2),
        slack: 0,
        isCritical: false,
      },
      {
        id: `${slot.jobId}-M2`,
        label: `${slot.jobId} (M2)`,
        es: roundTo(slot.m2Start, 2),
        ef: roundTo(slot.m2End, 2),
        ls: roundTo(slot.m2Start, 2),
        lf: roundTo(slot.m2End, 2),
        slack: 0,
        isCritical: true,
      },
    ]);

    return {
      jobId,
      moduleId: 'scheduling',
      jobTitle,
      status: 'success',
      executionMs: roundTo(performance.now() - start, 2),
      summaryText: `Aturan Johnson 2-Mesin: Urutan optimal ${seqStr} dengan Makespan = ${formatNum(jRes.makespan, 2)}.`,
      kpis: [
        { label: 'Urutan Optimal Johnson', value: seqStr, emphasis: 'primary' },
        { label: 'Total Makespan (C_max)', value: formatNum(jRes.makespan, 2), emphasis: 'success' },
        { label: 'Total Idle Time Mesin 2', value: formatNum(totalIdleM2, 2) },
        { label: 'Utilisasi M1 / M2', value: `${formatNum(utilM1, 1)}% / ${formatNum(utilM2, 1)}%` },
      ],
      tables: [
        {
          id: 'scheduling-johnson',
          title: 'Jadwal Flow Shop 2-Mesin (Algoritma Johnson)',
          headers: ['Job', 'Waktu Mesin 1', 'Waktu Mesin 2', 'Jadwal M1', 'Jadwal M2', 'Idle M2'],
          rows: jRes.rows,
        },
      ],
      charts: [
        {
          kind: 'gantt',
          id: 'scheduling-johnson-gantt',
          title: 'Gantt Chart Flow Shop 2-Mesin (Urutan Johnson)',
          subtitle: 'Biru = Mesin 1 (M1) · Merah = Mesin 2 (M2)',
          totalDuration: Math.max(1, roundTo(jRes.makespan, 2)),
          tasks: ganttTasks,
        },
      ],
      warnings: [],
      auditSteps: [
        {
          title: '1. Algoritma Johnson Flow-Shop 2 Mesin (Optimal C_max)',
          formula: 'Pilih min(M1ᵢ, M2ᵢ): jika di M1 tempatkan di urutan depan, jika di M2 di belakang',
          detail: `Menghasilkan urutan optimal ${seqStr} dengan makespan minimum ${formatNum(jRes.makespan, 2)}, total idle M2 = ${formatNum(totalIdleM2, 2)}, utilisasi M1 = ${formatNum(utilM1, 1)}% & M2 = ${formatNum(utilM2, 1)}%.`,
        },
      ],
      analysis: {
        headline: `Makespan Minimum ${formatNum(jRes.makespan, 2)} dengan Utilisasi M1 ${formatNum(utilM1, 1)}% & M2 ${formatNum(utilM2, 1)}%`,
        interpretation: `Algoritma Johnson menjamin makespan minimum global (C_max = ${formatNum(jRes.makespan, 2)}) untuk aliran flow-shop 2-mesin melalui urutan ${seqStr}. Total waktu proses pada Mesin 1 adalah ${formatNum(jRes.totalM1, 2)} (sisa idle akhir ${formatNum(totalIdleM1, 2)}) dan pada Mesin 2 adalah ${formatNum(jRes.totalM2, 2)} (waktu tunggu kumulatif M2 sebesar ${formatNum(totalIdleM2, 2)}).`,
        sections: [
          {
            heading: 'Keseimbangan Beban & Bottleneck Stasiun',
            body: `${bottleneckMachine} memikul beban kerja lebih besar (${formatNum(Math.max(jRes.totalM1, jRes.totalM2), 2)} vs ${formatNum(Math.min(jRes.totalM1, jRes.totalM2), 2)}). Pekerjaan pertama "${jRes.sequence[0].jobId}" hanya membuat Mesin 2 menunggu ${formatNum(jRes.slots[0].m1End, 2)} satuan waktu, dan pekerjaan terakhir "${jRes.sequence[jRes.sequence.length - 1].jobId}" meminimalkan waktu sisa pada Mesin 2 (${formatNum(jRes.slots[jRes.slots.length - 1].t2, 2)}).`,
            tone: totalIdleM2 <= jRes.slots[0].m1End + 1e-6 ? 'positive' : 'neutral',
          },
        ],
        recommendations: [
          `Jalankan seluruh ${input.jobs.length} pekerjaan sesuai urutan Johnson (${seqStr}) tanpa menyisipkan urutan ulang di antara Mesin 1 dan Mesin 2.`,
          `Fokuskan upaya perbaikan waktu siklus (setup reduction / SMED) pada ${bottleneckMachine} karena pengurangan waktu pada mesin bottleneck berdampak langsung menurunkan makespan total.`,
        ],
      },
      derivedValues: {
        makespan: roundTo(jRes.makespan, 4),
        totalIdleM2: roundTo(totalIdleM2, 4),
        utilizationM1: roundTo(utilM1, 2),
        utilizationM2: roundTo(utilM2, 2),
        sequence: seqStr,
      },
    };
  }

  const evals: RuleEval[] = [
    evaluateSingleMachineRule('FCFS (First Come First Served)', [...input.jobs]),
    evaluateSingleMachineRule(
      'SPT (Shortest Processing Time)',
      [...input.jobs].sort((a, b) => a.processingTime - b.processingTime),
    ),
    evaluateSingleMachineRule(
      'WSPT (Weighted SPT)',
      [...input.jobs].sort((a, b) => {
        const wa = a.weight !== undefined && Number.isFinite(a.weight) && a.weight > 0 ? a.weight : 1;
        const wb = b.weight !== undefined && Number.isFinite(b.weight) && b.weight > 0 ? b.weight : 1;
        return a.processingTime / wa - b.processingTime / wb;
      }),
    ),
    evaluateSingleMachineRule(
      'LPT (Longest Processing Time)',
      [...input.jobs].sort((a, b) => b.processingTime - a.processingTime),
    ),
    evaluateSingleMachineRule(
      'EDD (Earliest Due Date)',
      [...input.jobs].sort((a, b) => a.dueDate - b.dueDate),
    ),
    evaluateSingleMachineRule(
      'CR (Critical Ratio)',
      [...input.jobs].sort(
        (a, b) =>
          a.dueDate / Math.max(1e-6, a.processingTime) -
          b.dueDate / Math.max(1e-6, b.processingTime),
      ),
    ),
  ];

  const bestFlow = [...evals].sort((a, b) => a.avgCompletion - b.avgCompletion)[0];
  const bestWeighted = [...evals].sort((a, b) => a.weightedFlowTime - b.weightedFlowTime)[0];
  const bestAvgLate = [...evals].sort((a, b) => a.avgLateness - b.avgLateness)[0];
  const bestMaxLate = [...evals].sort((a, b) => a.maxLateness - b.maxLateness)[0];
  const fcfs = evals[0];
  const sptRule = evals[1];
  const wsptRule = evals[2];
  const eddRule = evals[4];
  const hasDistinctWeights = input.jobs.some(
    (j) => j.weight !== undefined && Number.isFinite(j.weight) && Math.abs(j.weight - 1) > 1e-6,
  );
  const ganttSource = hasDistinctWeights ? wsptRule : bestFlow;

  const compTable: ResultTable = {
    id: 'scheduling-rules',
    title: 'Perbandingan 6 Aturan Prioritas Penjadwalan (Single Machine)',
    headers: [
      'Aturan',
      'Urutan Job',
      'Rata-rata Flow Time',
      'Weighted Flow (∑w·C)',
      'Utilisasi (%)',
      'Rata-rata Job di Sistem',
      'Avg Tardiness',
      'Max Tardiness',
      'Job Terlambat',
    ],
    rows: evals.map((e) => [
      e.ruleName,
      e.sequence.join(' → '),
      roundTo(e.avgCompletion, 2),
      roundTo(e.weightedFlowTime, 2),
      `${roundTo(e.utilizationPct, 2)}%`,
      roundTo(e.avgJobsInSystem, 2),
      roundTo(e.avgLateness, 2),
      roundTo(e.maxLateness, 2),
      e.tardyCount,
    ]),
    highlightRowIndices: [
      evals.findIndex((e) => e.ruleName === (hasDistinctWeights ? wsptRule.ruleName : bestFlow.ruleName)),
    ],
  };

  const sptDetail: ResultTable = {
    id: 'scheduling-spt-detail',
    title: `Detail Jadwal Terpilih: ${ganttSource.ruleName}`,
    headers: ['Job', 'Waktu Proses', 'Bobot (w)', 'Due Date', 'Mulai', 'Selesai (Flow Time)', 'Keterlambatan'],
    rows: ganttSource.detailRows,
  };

  const singleGanttTasks = ganttSource.slots.map((slot) => ({
    id: `sm-${slot.jobId}`,
    label: `${slot.jobId}${hasDistinctWeights ? ` (w=${roundTo(slot.weight, 1)})` : ''}`,
    es: roundTo(slot.start, 2),
    ef: roundTo(slot.finish, 2),
    ls: roundTo(slot.start, 2),
    lf: roundTo(Math.max(slot.finish, slot.dueDate), 2),
    slack: roundTo(Math.max(0, slot.dueDate - slot.finish), 2),
    isCritical: slot.lateness > 1e-9,
  }));

  const flowSavingsVsFcfs = fcfs.avgCompletion - sptRule.avgCompletion;
  const flowSavingsPct = fcfs.avgCompletion > 1e-9 ? (flowSavingsVsFcfs / fcfs.avgCompletion) * 100 : 0;

  return {
    jobId,
    moduleId: 'scheduling',
    jobTitle,
    status: 'success',
    executionMs: roundTo(performance.now() - start, 2),
    summaryText: `SPT meminimalkan rata-rata Flow Time (${formatNum(bestFlow.avgCompletion, 2)}), WSPT meminimalkan Weighted Flow Time (${formatNum(wsptRule.weightedFlowTime, 2)}), EDD meminimalkan keterlambatan maksimum (${formatNum(eddRule.maxLateness, 2)}), dan ${bestAvgLate.ruleName.split(' ')[0]} menghasilkan keterlambatan rata-rata terkecil (${formatNum(bestAvgLate.avgLateness, 2)}).`,
    kpis: [
      { label: 'Flow Time Minimum (SPT)', value: formatNum(bestFlow.avgCompletion, 2), emphasis: 'primary' },
      { label: 'Weighted Flow (WSPT)', value: formatNum(wsptRule.weightedFlowTime, 2), emphasis: hasDistinctWeights ? 'primary' : undefined },
      { label: 'Min. Avg Tardiness', value: `${formatNum(bestAvgLate.avgLateness, 2)} (${bestAvgLate.ruleName.split(' ')[0]})`, emphasis: 'success' },
      { label: 'Min. Max Tardiness (EDD)', value: formatNum(bestMaxLate.maxLateness, 2) },
      { label: 'Total Makespan', value: formatNum(bestFlow.makespan, 2) },
    ],
    tables: [compTable, sptDetail],
    charts: [
      {
        kind: 'bar',
        id: 'scheduling-flow-bar',
        title: 'Perbandingan Rata-rata Flow Time & Keterlambatan per Aturan',
        xLabel: 'Aturan Prioritas',
        yLabel: 'Rata-rata Flow Time',
        bars: evals.map((e) => ({
          label: e.ruleName.split(' ')[0],
          value: roundTo(e.avgCompletion, 2),
          annotation: `Late: ${roundTo(e.avgLateness, 1)}`,
        })),
      },
      {
        kind: 'gantt',
        id: 'scheduling-single-gantt',
        title: `Gantt Chart Mesin Tunggal — ${ganttSource.ruleName}`,
        subtitle: 'Merah = Job melewati Due Date (Terlambat) · Hijau = Tepat Waktu · Abu-abu = Sisa Margin ke Due Date',
        totalDuration: Math.max(
          1,
          roundTo(
            Math.max(
              ganttSource.makespan,
              ...ganttSource.slots.map((s) => s.dueDate),
            ),
            2,
          ),
        ),
        tasks: singleGanttTasks,
      },
    ],
    warnings: [],
    auditSteps: [
      {
        title: '1. Perhitungan Flow Time, WSPT, Utilisasi & Keterlambatan',
        formula: 'Avg Flow = ∑Cᵢ/n · WSPT urutkan tᵢ/wᵢ menaik (min ∑wᵢCᵢ) · Tardinessᵢ = max(0, Cᵢ - dᵢ)',
        detail: `SPT menjamin rata-rata Flow Time minimum (${formatNum(bestFlow.avgCompletion, 2)}) dan WIP terendah (${formatNum(bestFlow.avgJobsInSystem, 2)} job); WSPT menjamin Weighted Flow Time minimum (${formatNum(wsptRule.weightedFlowTime, 2)}); EDD menjamin Max Tardiness minimum (${formatNum(eddRule.maxLateness, 2)}); rata-rata keterlambatan terendah dicapai oleh ${bestAvgLate.ruleName.split(' ')[0]} (${formatNum(bestAvgLate.avgLateness, 2)}).`,
      },
    ],
    analysis: {
      headline: `SPT Tekan Flow Time ${formatNum(flowSavingsPct, 1)}% vs FCFS; WSPT Kunci ∑w·C di ${formatNum(wsptRule.weightedFlowTime, 2)} & EDD Max Delay ${formatNum(eddRule.maxLateness, 2)}`,
      interpretation: `Pada penjadwalan mesin tunggal tanpa waktu setup antar-pekerjaan, total makespan konstan (${formatNum(bestFlow.makespan, 2)}) di seluruh 6 aturan, namun urutan dispatching berdampak tajam pada Work-In-Process (WIP), biaya prioritas bobot, dan ketepatan due date. SPT (${sptRule.sequence.join(' → ')}) meminimalkan rata-rata waktu selesai menjadi ${formatNum(sptRule.avgCompletion, 2)} dengan utilisasi ${formatNum(sptRule.utilizationPct, 1)}%, WSPT (${wsptRule.sequence.join(' → ')}) meminimalkan total weighted flow time (${formatNum(wsptRule.weightedFlowTime, 2)}), sedangkan EDD (${eddRule.sequence.join(' → ')}) meminimalkan keterlambatan terparah (Max Tardiness = ${formatNum(eddRule.maxLateness, 2)}).`,
      sections: [
        {
          heading: 'Trade-off Efisiensi Lantai Produksi (SPT/WSPT) vs Komitmen Pelanggan (EDD/CR)',
          body: `SPT mengurangi antrean rata-rata menjadi ${formatNum(sptRule.avgJobsInSystem, 2)} job (${sptRule.tardyCount} job terlambat, max tardiness ${formatNum(sptRule.maxLateness, 2)}). WSPT memprioritaskan pesanan berbobot/bernilai tinggi dengan rasio waktu-per-bobot terkecil (${bestWeighted.ruleName.split(' ')[0]} optimal di ${formatNum(bestWeighted.weightedFlowTime, 2)}). Sebaliknya, EDD memprioritaskan tenggat terdekat (${eddRule.tardyCount} job terlambat, avg tardiness ${formatNum(eddRule.avgLateness, 2)}, max tardiness ${formatNum(eddRule.maxLateness, 2)}).`,
          tone: bestAvgLate.avgLateness <= 1e-6 ? 'positive' : 'neutral',
        },
      ],
      recommendations: [
        `Terapkan aturan SPT (${sptRule.sequence.join(' → ')}) bila seluruh order setara dan KPI utama adalah meminimalkan antrean WIP, atau WSPT (${wsptRule.sequence.join(' → ')}) bila order memiliki bobot prioritas/penalti berbeda.`,
        `Terapkan aturan EDD (${eddRule.sequence.join(' → ')}) apabila kontrak pelanggan mengenakan penalti keterlambatan ekstrem (SLA max-delay), atau ${bestAvgLate.ruleName.split(' ')[0]} (${bestAvgLate.sequence.join(' → ')}) untuk meminimalkan keterlambatan rata-rata.`,
      ],
    },
    derivedValues: {
      bestFlowTime: roundTo(bestFlow.avgCompletion, 4),
      wsptWeightedFlow: roundTo(wsptRule.weightedFlowTime, 4),
      minAvgLateness: roundTo(bestAvgLate.avgLateness, 4),
      minMaxLateness: roundTo(bestMaxLate.maxLateness, 4),
      bestMaxLateRule: bestMaxLate.ruleName.split(' ')[0],
      makespan: roundTo(bestFlow.makespan, 4),
    },
  };
}
