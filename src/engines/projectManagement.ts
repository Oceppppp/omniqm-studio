import { normalCdf } from '../core/math/distributions.ts';
import { formatNum, roundTo } from '../core/math/matrix.ts';
import type {
  AuditStep,
  KpiMetric,
  ModuleExecutionResult,
  ProjectManagementInput,
  ResultTable,
} from '../core/types/module.types.ts';

interface ComputedActivity {
  id: string;
  name: string;
  predecessors: string[];
  duration: number;
  normalDuration: number;
  crashTime: number;
  normalCost: number;
  crashCost: number;
  crashSlope: number;
  canCrash: boolean;
  variance: number;
  es: number;
  ef: number;
  ls: number;
  lf: number;
  slack: number;
  layer: number;
  isCritical: boolean;
}

const EPS = 1e-6;

function computeSchedulePass(
  topoOrder: string[],
  map: Map<string, ComputedActivity>,
  successors: Map<string, string[]>,
  durations: Map<string, number>,
): { projectDuration: number; criticalIds: string[] } {
  let projectDuration = 0;
  for (const id of topoOrder) {
    const act = map.get(id)!;
    let maxPredEf = 0;
    for (const pred of act.predecessors) {
      const pAct = map.get(pred);
      if (pAct && pAct.ef > maxPredEf) maxPredEf = pAct.ef;
    }
    act.es = maxPredEf;
    act.ef = act.es + (durations.get(id) ?? act.duration);
    if (act.ef > projectDuration) projectDuration = act.ef;
  }

  for (let i = topoOrder.length - 1; i >= 0; i -= 1) {
    const id = topoOrder[i];
    const act = map.get(id)!;
    const succIds = successors.get(id) ?? [];
    if (succIds.length === 0) {
      act.lf = projectDuration;
    } else {
      let minSuccLs = Infinity;
      for (const sId of succIds) {
        const sAct = map.get(sId)!;
        if (sAct.ls < minSuccLs) minSuccLs = sAct.ls;
      }
      act.lf = minSuccLs;
    }
    act.ls = act.lf - (durations.get(id) ?? act.duration);
    act.slack = Math.max(0, act.ls - act.es);
    act.isCritical = act.slack < EPS;
  }

  const criticalIds = topoOrder.filter((id) => map.get(id)!.isCritical);
  return { projectDuration, criticalIds };
}

function evalProjectDurationOnly(
  topoOrder: string[],
  map: Map<string, ComputedActivity>,
  durations: Map<string, number>,
): number {
  const ef = new Map<string, number>();
  let total = 0;
  for (const id of topoOrder) {
    const act = map.get(id)!;
    let maxPredEf = 0;
    for (const pred of act.predecessors) {
      const pEf = ef.get(pred);
      if (pEf !== undefined && pEf > maxPredEf) maxPredEf = pEf;
    }
    const end = maxPredEf + (durations.get(id) ?? 0);
    ef.set(id, end);
    if (end > total) total = end;
  }
  return total;
}

interface CrashStepRecord {
  step: number;
  activitiesLabel: string;
  deltaDuration: number;
  newDuration: number;
  addedCost: number;
  cumulativeProjectCost: number;
}

function runProjectCrashing(
  topoOrder: string[],
  baseMap: Map<string, ComputedActivity>,
  successors: Map<string, string[]>,
  initialDuration: number,
  targetCrashDuration?: number,
): {
  steps: CrashStepRecord[];
  finalDuration: number;
  totalNormalCost: number;
  totalCrashAddedCost: number;
} | null {
  const crashableIds = topoOrder.filter((id) => baseMap.get(id)!.canCrash);
  if (crashableIds.length === 0) return null;

  const workingDurations = new Map<string, number>();
  let totalNormalCost = 0;
  for (const [id, act] of baseMap.entries()) {
    workingDurations.set(id, act.normalDuration);
    totalNormalCost += act.normalCost;
  }

  // Clone temp map for pass evaluations
  const tempMap = new Map<string, ComputedActivity>();
  for (const [id, act] of baseMap.entries()) {
    tempMap.set(id, { ...act });
  }

  const desiredTarget =
    targetCrashDuration !== undefined && Number.isFinite(targetCrashDuration)
      ? Math.max(0, targetCrashDuration)
      : 0;

  let currentDuration = initialDuration;
  let totalCrashAddedCost = 0;
  const steps: CrashStepRecord[] = [];
  let iter = 0;

  while (currentDuration > desiredTarget + EPS && iter < 40) {
    const { criticalIds } = computeSchedulePass(topoOrder, tempMap, successors, workingDurations);
    const critCrashable = criticalIds.filter((id) => {
      const a = tempMap.get(id)!;
      return a.canCrash && (workingDurations.get(id) ?? 0) - a.crashTime > EPS;
    });

    if (critCrashable.length === 0) break;

    // Sort crashable critical activities by ascending crash slope
    const sorted = [...critCrashable].sort(
      (a, b) => tempMap.get(a)!.crashSlope - tempMap.get(b)!.crashSlope,
    );

    // Search smallest-cost subset (size 1..min(5, sorted.length)) whose unit reduction lowers projectDuration
    let bestCut: string[] | null = null;
    let bestCutSlope = Infinity;
    const testEps = 1e-4;
    const maxSubsetSize = Math.min(5, sorted.length);

    const searchCut = (startIdx: number, chosen: string[], currentSlope: number, targetSize: number) => {
      if (currentSlope >= bestCutSlope - EPS) return;
      if (chosen.length === targetSize) {
        const probe = new Map(workingDurations);
        for (const cid of chosen) {
          probe.set(cid, (probe.get(cid) ?? 0) - testEps);
        }
        const nextDur = evalProjectDurationOnly(topoOrder, tempMap, probe);
        if (initialDuration > 0 && currentDuration - nextDur >= testEps * 0.9) {
          bestCut = [...chosen];
          bestCutSlope = currentSlope;
        }
        return;
      }
      for (let i = startIdx; i < sorted.length; i += 1) {
        const id = sorted[i];
        chosen.push(id);
        searchCut(i + 1, chosen, currentSlope + tempMap.get(id)!.crashSlope, targetSize);
        chosen.pop();
      }
    };

    for (let k = 1; k <= maxSubsetSize; k += 1) {
      searchCut(0, [], 0, k);
    }

    if (!bestCut) break;

    const cutIds: string[] = bestCut;
    let maxCutStep = Infinity;
    for (const cid of cutIds) {
      const remain = (workingDurations.get(cid) ?? 0) - tempMap.get(cid)!.crashTime;
      if (remain < maxCutStep) maxCutStep = remain;
    }
    const targetGap = currentDuration - desiredTarget;
    if (targetGap < maxCutStep) maxCutStep = targetGap;

    if (maxCutStep <= EPS) break;

    // Verify full linear reduction vs non-critical path tightening using binary search if needed
    const tryApply = (stepDelta: number): number => {
      const probe = new Map(workingDurations);
      for (const cid of cutIds) {
        probe.set(cid, (probe.get(cid) ?? 0) - stepDelta);
      }
      return currentDuration - evalProjectDurationOnly(topoOrder, tempMap, probe);
    };

    let chosenStep = maxCutStep;
    const fullGain = tryApply(chosenStep);
    if (fullGain < chosenStep - EPS) {
      let lo = EPS;
      let hi = chosenStep;
      for (let b = 0; b < 24; b += 1) {
        const mid = (lo + hi) / 2;
        if (tryApply(mid) >= mid - EPS) lo = mid;
        else hi = mid;
      }
      chosenStep = lo;
    }

    const actualGain = tryApply(chosenStep);
    if (actualGain <= EPS) break;

    for (const cid of cutIds) {
      workingDurations.set(cid, (workingDurations.get(cid) ?? 0) - chosenStep);
    }

    const addedCost = cutIds.reduce((sum, cid) => sum + tempMap.get(cid)!.crashSlope * chosenStep, 0);
    currentDuration -= actualGain;
    totalCrashAddedCost += addedCost;
    iter += 1;

    steps.push({
      step: iter,
      activitiesLabel: cutIds.join(' + '),
      deltaDuration: roundTo(actualGain, 3),
      newDuration: roundTo(currentDuration, 3),
      addedCost: roundTo(addedCost, 2),
      cumulativeProjectCost: roundTo(totalNormalCost + totalCrashAddedCost, 2),
    });
  }

  return {
    steps,
    finalDuration: currentDuration,
    totalNormalCost,
    totalCrashAddedCost,
  };
}

function enumerateCriticalPaths(
  orderedActs: ComputedActivity[],
  map: Map<string, ComputedActivity>,
  successors: Map<string, string[]>,
  projectDuration: number,
  maxPaths = 20,
): string[][] {
  const starts = orderedActs.filter((a) => a.isCritical && a.es < 1e-4);
  const paths: string[][] = [];

  const dfs = (id: string, current: string[]) => {
    if (paths.length >= maxPaths) return;
    const act = map.get(id)!;
    const critSuccs = (successors.get(id) ?? []).filter((sId) => {
      const sAct = map.get(sId);
      return Boolean(sAct && sAct.isCritical && Math.abs(act.ef - sAct.es) < 1e-4);
    });
    if (critSuccs.length === 0) {
      if (Math.abs(act.ef - projectDuration) < 1e-4) {
        paths.push([...current]);
      }
      return;
    }
    for (const nextId of critSuccs) {
      if (current.includes(nextId)) continue;
      current.push(nextId);
      dfs(nextId, current);
      current.pop();
    }
  };

  for (const s of starts) {
    dfs(s.id, [s.id]);
  }
  return paths;
}

export function solveProjectManagement(
  jobId: string,
  jobTitle: string,
  input: ProjectManagementInput,
): ModuleExecutionResult {
  const start = performance.now();
  const warnings: string[] = [];

  if (input.activities.length === 0) {
    return {
      jobId,
      moduleId: 'project-management',
      jobTitle,
      status: 'error',
      executionMs: 0,
      summaryText: 'Daftar aktivitas proyek kosong.',
      kpis: [],
      tables: [],
      charts: [],
      warnings: ['Tidak ada aktivitas untuk dijadwalkan.'],
      derivedValues: {},
      error: 'Daftar aktivitas proyek kosong.',
    };
  }

  const map = new Map<string, ComputedActivity>();
  const successors = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const act of input.activities) {
    let duration = Math.max(0, act.duration ?? 0);
    let variance = 0;

    if (input.mode === 'pert') {
      const a = act.optimistic ?? duration;
      const m = act.mostLikely ?? duration;
      const b = act.pessimistic ?? duration;
      if (a > m + EPS || m > b + EPS) {
        warnings.push(
          `Aktivitas "${act.id}": urutan waktu PERT seharusnya a ≤ m ≤ b (input: a=${a}, m=${m}, b=${b}).`,
        );
      }
      duration = (a + 4 * m + b) / 6;
      variance = ((b - a) / 6) ** 2;
    }

    const normalDuration = duration;
    const crashTime =
      act.crashTime !== undefined && act.crashTime >= 0
        ? Math.min(act.crashTime, normalDuration)
        : normalDuration;
    const normalCost = act.normalCost ?? 0;
    const crashCost = act.crashCost ?? normalCost;
    const maxCrash = normalDuration - crashTime;
    const crashSlope =
      maxCrash > EPS && act.crashCost !== undefined ? Math.max(0, crashCost - normalCost) / maxCrash : 0;

    map.set(act.id, {
      id: act.id,
      name: act.name,
      predecessors: act.predecessors.filter((p) => p.trim() !== '' && p !== '-'),
      duration,
      normalDuration,
      crashTime,
      normalCost,
      crashCost,
      crashSlope,
      canCrash: maxCrash > EPS && act.crashCost !== undefined,
      variance,
      es: 0,
      ef: 0,
      ls: 0,
      lf: 0,
      slack: 0,
      layer: 0,
      isCritical: false,
    });
    successors.set(act.id, []);
    inDegree.set(act.id, 0);
  }

  for (const act of map.values()) {
    for (const pred of act.predecessors) {
      if (!map.has(pred)) {
        warnings.push(`Predecessor "${pred}" pada aktivitas "${act.id}" tidak ditemukan dan diabaikan.`);
        continue;
      }
      successors.get(pred)!.push(act.id);
      inDegree.set(act.id, (inDegree.get(act.id) ?? 0) + 1);
    }
  }

  // Kahn's topological sort
  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id);
  }

  const topoOrder: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    topoOrder.push(id);
    for (const succId of successors.get(id) ?? []) {
      const nextDeg = (inDegree.get(succId) ?? 0) - 1;
      inDegree.set(succId, nextDeg);
      if (nextDeg === 0) queue.push(succId);
    }
  }

  if (topoOrder.length !== map.size) {
    return {
      jobId,
      moduleId: 'project-management',
      jobTitle,
      status: 'error',
      executionMs: roundTo(performance.now() - start, 2),
      summaryText: 'Terdeteksi ketergantungan melingkar (cycle) pada jaringan aktivitas proyek.',
      kpis: [{ label: 'Status Jaringan', value: 'Cycle Detected', emphasis: 'danger' }],
      tables: [],
      charts: [],
      warnings: ['Jaringan PERT/CPM tidak boleh memiliki siklus ketergantungan.'],
      derivedValues: {},
      error: 'Terdeteksi siklus (circular dependency) pada aktivitas.',
    };
  }

  // Forward pass & Backward pass
  const baseDurations = new Map<string, number>();
  for (const [id, act] of map.entries()) baseDurations.set(id, act.duration);

  const { projectDuration } = computeSchedulePass(topoOrder, map, successors, baseDurations);

  // Compute AON horizontal layer per node
  for (const id of topoOrder) {
    const act = map.get(id)!;
    let maxPredLayer = -1;
    for (const pred of act.predecessors) {
      const pAct = map.get(pred);
      if (pAct && pAct.layer > maxPredLayer) maxPredLayer = pAct.layer;
    }
    act.layer = maxPredLayer + 1;
  }

  const orderedActs = input.activities.map((a) => map.get(a.id)!);
  const criticalActs = orderedActs.filter((a) => a.isCritical);
  const criticalPaths = enumerateCriticalPaths(orderedActs, map, successors, projectDuration);
  const criticalPathStr =
    criticalPaths.length > 0
      ? criticalPaths.map((p) => p.join(' → ')).join(' | ')
      : criticalActs.map((a) => a.id).join(' → ');

  // Textbook PERT rule: if multiple parallel critical paths exist, take the maximum path variance
  // (never double-count variances across parallel branches).
  let criticalVariance = 0;
  if (criticalPaths.length > 0) {
    for (const p of criticalPaths) {
      const pVar = p.reduce((acc, id) => acc + (map.get(id)?.variance ?? 0), 0);
      if (pVar > criticalVariance) criticalVariance = pVar;
    }
  } else {
    criticalVariance = criticalActs.reduce((acc, a) => acc + a.variance, 0);
  }
  const projectStdDev = Math.sqrt(criticalVariance);

  let completionProb: number | null = null;
  let zScore: number | null = null;
  if (input.mode === 'pert' && input.targetTime !== undefined && Number.isFinite(input.targetTime) && projectStdDev > 1e-9) {
    zScore = (input.targetTime - projectDuration) / projectStdDev;
    completionProb = normalCdf(zScore) * 100;
  }

  const tables: ResultTable[] = [
    {
      id: 'cpm-schedule',
      title: `Jadwal Aktivitas Proyek (${input.mode.toUpperCase()})`,
      headers: [
        'ID',
        'Aktivitas',
        'Durasi',
        'ES',
        'EF',
        'LS',
        'LF',
        'Slack',
        'Kritis?',
        ...(input.mode === 'pert' ? ['Varians'] : []),
      ],
      rows: orderedActs.map((a) => [
        a.id,
        a.name,
        roundTo(a.duration, 2),
        roundTo(a.es, 2),
        roundTo(a.ef, 2),
        roundTo(a.ls, 2),
        roundTo(a.lf, 2),
        roundTo(a.slack, 2),
        a.isCritical ? 'YA (Kritis)' : 'Tidak',
        ...(input.mode === 'pert' ? [roundTo(a.variance, 3)] : []),
      ]),
      highlightRowIndices: orderedActs
        .map((a, idx) => (a.isCritical ? idx : -1))
        .filter((idx) => idx !== -1),
    },
  ];

  // Time-Cost Trade-Off (Crashing)
  const crashResult = runProjectCrashing(
    topoOrder,
    map,
    successors,
    projectDuration,
    input.targetCrashDuration,
  );

  if (crashResult && crashResult.steps.length > 0) {
    tables.push({
      id: 'cpm-crashing',
      title: 'Analisis Percepatan Proyek / Time-Cost Trade-Off (Project Crashing)',
      subtitle: `Biaya normal awal = ${formatNum(crashResult.totalNormalCost, 2)} | Total biaya crash tambahan = ${formatNum(crashResult.totalCrashAddedCost, 2)}.`,
      headers: [
        'Langkah',
        'Aktivitas Dipercepat',
        'Pengurangan Durasi',
        'Durasi Proyek Baru',
        'Biaya Crash Langkah',
        'Total Biaya Kumulatif',
      ],
      rows: crashResult.steps.map((s) => [
        s.step,
        s.activitiesLabel,
        s.deltaDuration,
        s.newDuration,
        s.addedCost,
        s.cumulativeProjectCost,
      ]),
    });
  }

  // AON Network diagram edges
  const networkEdges: { from: string; to: string; label?: string; isCritical?: boolean }[] = [];
  for (const act of orderedActs) {
    for (const pred of act.predecessors) {
      const pAct = map.get(pred);
      if (!pAct) continue;
      const edgeCritical =
        act.isCritical && pAct.isCritical && Math.abs(pAct.ef - act.es) < 1e-4;
      networkEdges.push({
        from: pAct.id,
        to: act.id,
        isCritical: edgeCritical,
      });
    }
  }

  const kpis: KpiMetric[] = [
    {
      label: 'Total Durasi Proyek',
      value: formatNum(projectDuration, 2),
      unit: 'satuan waktu',
      emphasis: 'primary',
    },
    {
      label: 'Jalur Kritis',
      value: criticalPathStr || '-',
      emphasis: 'warning',
    },
    {
      label: 'Aktivitas Kritis',
      value: `${criticalActs.length} / ${orderedActs.length}`,
    },
  ];

  if (input.mode === 'pert') {
    kpis.push({
      label: 'Standar Deviasi Jalur Kritis',
      value: formatNum(projectStdDev, 3),
    });
    if (completionProb !== null && zScore !== null) {
      kpis.push({
        label: `Prob. Selesai ≤ ${input.targetTime}`,
        value: `${formatNum(completionProb, 2)}% (Z=${formatNum(zScore, 2)})`,
        emphasis: completionProb >= 75 ? 'success' : 'warning',
      });
    }
  }

  if (crashResult && crashResult.steps.length > 0) {
    kpis.push({
      label: 'Durasi Crashed Optimal',
      value: formatNum(crashResult.finalDuration, 2),
      unit: `(+${formatNum(crashResult.totalCrashAddedCost, 0)})`,
      emphasis: 'success',
    });
  }

  const auditSteps: AuditStep[] = [
    {
      title: '1. Forward Pass (ES & EF)',
      formula: 'ESⱼ = max(EF_predecessor) · EFⱼ = ESⱼ + tⱼ',
      detail: `Durasi total proyek normal mencapai ${formatNum(projectDuration, 2)} satuan waktu.`,
    },
    {
      title: '2. Backward Pass & Jalur Kritis',
      formula: 'LFᵢ = min(LS_successor) · LSᵢ = LFᵢ - tᵢ · Slack = LS - ES',
      detail: `Ditemukan ${Math.max(1, criticalPaths.length)} jalur kritis (Slack = 0): ${criticalPathStr}.`,
    },
  ];

  if (input.mode === 'pert') {
    auditSteps.push({
      title: '3. Distribusi Probabilitas PERT',
      formula: 't_e = (a + 4m + b) / 6 · σ² = ((b - a) / 6)² · Z = (Target - T_kritis) / σ_kritis',
      detail: `Varians maksimum jalur kritis σ² = ${roundTo(criticalVariance, 4)} (σ = ${formatNum(projectStdDev, 3)})${
        zScore !== null ? `, sehingga Z = ${formatNum(zScore, 2)} (${formatNum(completionProb ?? 0, 2)}%).` : '.'
      }`,
    });
  }

  if (crashResult && crashResult.steps.length > 0) {
    auditSteps.push({
      title: `${auditSteps.length + 1}. Project Crashing (Time-Cost Trade-Off)`,
      formula: 'Cost Slope = (Crash Cost - Normal Cost) / (Normal Time - Crash Time)',
      detail: `Dipangkas dari ${formatNum(projectDuration, 2)} menjadi ${formatNum(crashResult.finalDuration, 2)} dalam ${crashResult.steps.length} langkah dengan tambahan biaya ${formatNum(crashResult.totalCrashAddedCost, 2)}.`,
    });
  }

  // Deep Analysis
  const nonCriticalActs = orderedActs
    .filter((a) => !a.isCritical)
    .sort((a, b) => a.slack - b.slack);
  const nearCritical = nonCriticalActs[0];
  const highestVarCrit = [...criticalActs].sort((a, b) => b.variance - a.variance)[0];
  const p95Duration = projectDuration + 1.6449 * projectStdDev;

  const pmSections = [
    {
      heading: 'Analisis Jalur Kritis & Risiko Paralel',
      body:
        criticalPaths.length > 1
          ? `Terdapat ${criticalPaths.length} jalur kritis paralel (${criticalPathStr}) yang melipatgandakan risiko keterlambatan proyek karena penundaan di salah satu cabang langsung menggeser tanggal selesai.`
          : `Jalur kritis tunggal (${criticalPathStr}) mencakup ${criticalActs.length} dari ${orderedActs.length} aktivitas (${formatNum((criticalActs.length / orderedActs.length) * 100, 0)}%) dengan Slack = 0. Setiap 1 satuan keterlambatan pada aktivitas ini akan menunda keseluruhan proyek.`,
      tone: (criticalPaths.length > 1 ? 'caution' : 'neutral') as 'caution' | 'neutral',
    },
    {
      heading: 'Kelonggaran Jadwal (Slack) & Aktivitas Hampir Kritis',
      body: nearCritical
        ? `Aktivitas non-kritis dengan cadangan terkecil adalah "${nearCritical.id} (${nearCritical.name})" (Slack = ${formatNum(nearCritical.slack, 2)}). Kelonggaran total dari ${nonCriticalActs.length} aktivitas non-kritis dapat dimanfaatkan untuk perataan sumber daya (resource leveling).`
        : 'Seluruh aktivitas berada di jalur kritis tanpa slack cadangan (jadwal sangat ketat).',
      tone: (nearCritical && nearCritical.slack <= 2 ? 'caution' : 'positive') as 'caution' | 'positive',
    },
  ];

  if (input.mode === 'pert') {
    pmSections.push({
      heading: 'Ketidakpastian Durasi & Risiko Target PERT',
      body: `Dengan standar deviasi jalur kritis σ = ${formatNum(projectStdDev, 3)}, durasi proyek pada tingkat keyakinan 95% adalah ${formatNum(p95Duration, 2)} satuan waktu.${
        completionProb !== null && input.targetTime !== undefined
          ? ` Peluang memenuhi target ≤ ${input.targetTime} sebesar ${formatNum(completionProb, 1)}% (${
              completionProb >= 80 ? 'risiko rendah' : completionProb >= 50 ? 'risiko moderat' : 'risiko tinggi — butuh percepatan'
            }).`
          : ''
      }${
        highestVarCrit && highestVarCrit.variance > 0
          ? ` Sumber ketidakpastian terbesar berasal dari aktivitas "${highestVarCrit.id} (${highestVarCrit.name})" (σ² = ${roundTo(highestVarCrit.variance, 3)}).`
          : ''
      }`,
      tone: (completionProb !== null && completionProb < 65 ? 'caution' : 'neutral') as 'caution' | 'neutral',
    });
  }

  if (crashResult && crashResult.steps.length > 0) {
    const savedTime = projectDuration - crashResult.finalDuration;
    const avgCrashRate = savedTime > EPS ? crashResult.totalCrashAddedCost / savedTime : 0;
    pmSections.push({
      heading: 'Efisiensi Percepatan (Time-Cost Trade-Off)',
      body: `Crashing memangkas durasi proyek sebesar ${formatNum(savedTime, 2)} satuan waktu (menjadi ${formatNum(crashResult.finalDuration, 2)}) dengan tambahan biaya ${formatNum(crashResult.totalCrashAddedCost, 2)} (rata-rata ${formatNum(avgCrashRate, 2)} per satuan waktu yang dihemat).`,
      tone: 'positive',
    });
  }

  const pmRecommendations: string[] = [
    `Fokuskan pengawasan harian pada aktivitas jalur kritis (${criticalActs.map((a) => a.id).join(', ')}) karena tidak memiliki toleransi keterlambatan.`,
  ];
  if (nearCritical && nearCritical.slack <= 3) {
    pmRecommendations.push(
      `Awasi aktivitas hampir kritis "${nearCritical.id}" (Slack = ${formatNum(nearCritical.slack, 2)}) agar tidak berubah menjadi jalur kritis baru.`,
    );
  }
  if (input.mode === 'pert' && highestVarCrit && highestVarCrit.variance > 0) {
    pmRecommendations.push(
      `Kunci kontrak/sumber daya lebih awal pada aktivitas "${highestVarCrit.id} (${highestVarCrit.name})" yang memiliki varians durasi terbesar (σ² = ${roundTo(highestVarCrit.variance, 3)}) untuk mempersempit risiko meleset.`,
    );
  }
  if (completionProb !== null && completionProb < 75 && input.targetTime !== undefined) {
    pmRecommendations.push(
      `Peluang selesai ≤ ${input.targetTime} hanya ${formatNum(completionProb, 1)}%; pertimbangkan Project Crashing atau buffer komitmen kontrak mendekati ${formatNum(p95Duration, 1)} (95% confidence).`,
    );
  }

  const elapsed = roundTo(performance.now() - start, 2);

  return {
    jobId,
    moduleId: 'project-management',
    jobTitle,
    status: warnings.length > 0 ? 'warning' : 'success',
    executionMs: elapsed,
    summaryText: `Durasi proyek total = ${formatNum(projectDuration, 2)} dengan jalur kritis ${criticalPathStr}.${
      crashResult && crashResult.steps.length > 0
        ? ` Crashing → ${formatNum(crashResult.finalDuration, 2)} (+${formatNum(crashResult.totalCrashAddedCost, 0)}).`
        : ''
    }`,
    kpis,
    tables,
    charts: [
      {
        kind: 'network',
        id: 'pert-aon-network',
        title: 'Diagram Jaringan Proyek (Activity-on-Node / AON)',
        subtitle: `Merah menandai jalur kritis (${criticalPathStr})`,
        nodes: orderedActs.map((a) => ({
          id: a.id,
          label: `${a.id} (${roundTo(a.duration, 1)})`,
          layer: a.layer,
          subtitle: `ES:${roundTo(a.es, 1)} EF:${roundTo(a.ef, 1)}`,
          meta: `LS:${roundTo(a.ls, 1)} LF:${roundTo(a.lf, 1)} · S:${roundTo(a.slack, 1)}`,
          isCritical: a.isCritical,
        })),
        edges: networkEdges,
      },
      {
        kind: 'gantt',
        id: 'pert-cpm-gantt',
        title: 'Gantt Chart & Jalur Kritis (PERT/CPM)',
        subtitle: `Total Durasi: ${formatNum(projectDuration, 2)} | Jalur Kritis: ${criticalPathStr}`,
        totalDuration: projectDuration,
        tasks: orderedActs.map((a) => ({
          id: a.id,
          label: `${a.id}: ${a.name}`,
          es: roundTo(a.es, 2),
          ef: roundTo(a.ef, 2),
          ls: roundTo(a.ls, 2),
          lf: roundTo(a.lf, 2),
          slack: roundTo(a.slack, 2),
          isCritical: a.isCritical,
        })),
      },
    ],
    warnings,
    auditSteps,
    analysis: {
      headline: `Durasi Proyek ${formatNum(projectDuration, 2)} Satuan Waktu · Jalur Kritis ${criticalPathStr}`,
      interpretation: `Penjadwalan ${input.mode.toUpperCase()} atas ${orderedActs.length} aktivitas menetapkan penyelesaian tercepat pada t = ${formatNum(projectDuration, 2)}${
        input.mode === 'pert'
          ? ` (dengan estimasi rentang 95% hingga ${formatNum(p95Duration, 2)} satuan waktu).`
          : '.'
      }`,
      sections: pmSections,
      recommendations: pmRecommendations,
    },
    derivedValues: {
      projectDuration: roundTo(projectDuration, 4),
      criticalPath: criticalPathStr,
      projectStdDev: roundTo(projectStdDev, 4),
      ...(completionProb !== null ? { completionProbability: roundTo(completionProb, 2) } : {}),
      ...(crashResult && crashResult.steps.length > 0
        ? {
            crashedDuration: roundTo(crashResult.finalDuration, 4),
            totalNormalCost: roundTo(crashResult.totalNormalCost, 2),
            totalCrashCost: roundTo(crashResult.totalCrashAddedCost, 2),
          }
        : {}),
    },
  };
}
