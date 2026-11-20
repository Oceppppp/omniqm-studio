import { formatNum, roundTo } from '../core/math/matrix.ts';
import type {
  ModuleExecutionResult,
  MrpInput,
  MrpItemInput,
  MrpLotSizingMethod,
  ResultTable,
} from '../core/types/module.types.ts';

interface SimulatedItemSchedule {
  poh: number[];
  netReq: number[];
  plannedRec: number[];
  plannedRel: number[];
  pastDue: number;
  orderCount: number;
  setupCostTotal: number;
  holdingCostTotal: number;
  totalRelevantCost: number;
  effectiveParamNote: string;
}

const ALL_LOT_METHODS: MrpLotSizingMethod[] = ['L4L', 'FOQ', 'POQ', 'EOQ', 'SM'];

function parseParents(parentStr?: string): string[] {
  if (!parentStr) return [];
  return parentStr
    .split(/[,;|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function computeLowLevelOrder(items: MrpItemInput[]): {
  ordered: (MrpItemInput & { effectiveLevel: number; parentList: string[] })[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const byName = new Map<string, MrpItemInput>();
  for (const it of items) {
    byName.set(it.item, it);
  }

  const effectiveLevel = new Map<string, number>();
  const visiting = new Set<string>();

  const resolveLevel = (name: string): number => {
    if (effectiveLevel.has(name)) return effectiveLevel.get(name)!;
    const item = byName.get(name);
    if (!item) return 0;
    if (visiting.has(name)) {
      warnings.push(`Siklus BOM terdeteksi melibatkan "${name}"; menggunakan level input manual.`);
      return item.level;
    }
    visiting.add(name);
    let maxParentLvl = -1;
    for (const pName of parseParents(item.parent)) {
      if (byName.has(pName)) {
        maxParentLvl = Math.max(maxParentLvl, resolveLevel(pName));
      }
    }
    visiting.delete(name);
    const lvl = Math.max(item.level, maxParentLvl + 1);
    effectiveLevel.set(name, lvl);
    return lvl;
  };

  for (const it of items) resolveLevel(it.item);

  const enriched = items.map((it) => ({
    ...it,
    effectiveLevel: effectiveLevel.get(it.item) ?? it.level,
    parentList: parseParents(it.parent),
  }));

  enriched.sort((a, b) => a.effectiveLevel - b.effectiveLevel || a.level - b.level);
  return { ordered: enriched, warnings };
}

function computeFutureIncrementalNeeds(
  startT: number,
  initialAvailableAfterOrderZero: number,
  gross: number[],
  sched: number[],
  safetyStock: number,
): number[] {
  const T = gross.length;
  const reqK: number[] = [];
  let proj = initialAvailableAfterOrderZero;

  for (let t = startT + 1; t < T; t += 1) {
    const avail = proj + sched[t];
    const need = gross[t] + safetyStock;
    if (avail < need) {
      const shortage = need - avail;
      reqK.push(shortage);
      proj = safetyStock;
    } else {
      reqK.push(0);
      proj = avail - gross[t];
    }
  }
  return reqK;
}

function simulateItemSchedule(
  item: MrpItemInput,
  method: MrpLotSizingMethod,
  gross: number[],
  sched: number[],
): SimulatedItemSchedule {
  const T = gross.length;
  const poh = Array<number>(T).fill(0);
  const netReq = Array<number>(T).fill(0);
  const plannedRec = Array<number>(T).fill(0);
  const plannedRel = Array<number>(T).fill(0);
  let pastDue = 0;
  let orderCount = 0;

  const setupCost = item.setupCost ?? 100;
  const holdingCost = item.holdingCostPerUnit ?? 2;
  const totalGross = gross.reduce((a, b) => a + b, 0);
  const avgDemand = Math.max(1e-6, totalGross / Math.max(1, T));
  const rawEoq = Math.sqrt((2 * avgDemand * Math.max(0, setupCost)) / Math.max(1e-6, holdingCost));
  const eoqQty = Math.max(1, Math.round(rawEoq));
  const poqPeriods = Math.max(
    1,
    Math.round(item.fixedOrderPeriods && item.fixedOrderPeriods >= 1 ? item.fixedOrderPeriods : eoqQty / avgDemand),
  );
  const foqQty = Math.max(1, item.fixedOrderQty ?? eoqQty);

  let effectiveParamNote: string = method;
  if (method === 'FOQ') effectiveParamNote = `FOQ=${foqQty}`;
  else if (method === 'EOQ') effectiveParamNote = `EOQ=${eoqQty}`;
  else if (method === 'POQ') effectiveParamNote = `POQ=${poqPeriods} per`;
  else if (method === 'SM') effectiveParamNote = 'Silver-Meal';

  let prevOh = item.onHand;
  for (let t = 0; t < T; t += 1) {
    const available = prevOh + sched[t];
    const need = gross[t] + item.safetyStock;

    if (available >= need) {
      netReq[t] = 0;
      plannedRec[t] = 0;
      poh[t] = available - gross[t];
    } else {
      netReq[t] = need - available;
      let orderQty = netReq[t];

      if (method === 'FOQ') {
        orderQty = Math.ceil(netReq[t] / foqQty) * foqQty;
      } else if (method === 'EOQ') {
        orderQty = Math.ceil(netReq[t] / eoqQty) * eoqQty;
      } else if (method === 'POQ') {
        const futureNeeds = computeFutureIncrementalNeeds(
          t,
          item.safetyStock,
          gross,
          sched,
          item.safetyStock,
        );
        const span = Math.min(poqPeriods - 1, futureNeeds.length);
        for (let k = 0; k < span; k += 1) {
          orderQty += futureNeeds[k];
        }
      } else if (method === 'SM') {
        const futureNeeds = computeFutureIncrementalNeeds(
          t,
          item.safetyStock,
          gross,
          sched,
          item.safetyStock,
        );
        let bestAvgCost = setupCost;
        let holdAcc = 0;
        let candQty = orderQty;
        for (let k = 0; k < futureNeeds.length; k += 1) {
          const stepsAhead = k + 1;
          holdAcc += stepsAhead * holdingCost * futureNeeds[k];
          const avgCost = (setupCost + holdAcc) / (stepsAhead + 1);
          if (avgCost <= bestAvgCost + 1e-9) {
            bestAvgCost = avgCost;
            candQty += futureNeeds[k];
            orderQty = candQty;
          } else {
            break;
          }
        }
      }

      plannedRec[t] = orderQty;
      poh[t] = available + plannedRec[t] - gross[t];
    }

    if (plannedRec[t] > 0) {
      orderCount += 1;
      const relPeriod = t - Math.max(0, Math.round(item.leadTime));
      if (relPeriod >= 0) {
        plannedRel[relPeriod] += plannedRec[t];
      } else {
        pastDue += plannedRec[t];
      }
    }

    prevOh = poh[t];
  }

  const setupCostTotal = orderCount * setupCost;
  const holdingCostTotal = poh.reduce((sum, q) => sum + Math.max(0, q) * holdingCost, 0);

  return {
    poh,
    netReq,
    plannedRec,
    plannedRel,
    pastDue,
    orderCount,
    setupCostTotal,
    holdingCostTotal,
    totalRelevantCost: setupCostTotal + holdingCostTotal,
    effectiveParamNote,
  };
}

export function solveMrp(
  jobId: string,
  jobTitle: string,
  input: MrpInput,
): ModuleExecutionResult {
  const start = performance.now();
  const T = input.periodLabels.length;
  if (T === 0 || input.items.length === 0) {
    return {
      jobId,
      moduleId: 'mrp',
      jobTitle,
      status: 'error',
      executionMs: 0,
      summaryText: 'Data MRP atau horizon periode kosong.',
      kpis: [],
      tables: [],
      charts: [],
      warnings: ['Masukkan minimal 1 item BOM dan 1 periode perencanaan.'],
      derivedValues: {},
      error: 'Data MRP kosong.',
    };
  }

  const { ordered: sortedItems, warnings: bomWarnings } = computeLowLevelOrder(input.items);
  const releasesByItem = new Map<string, number[]>();
  const pastDueByItem = new Map<string, number>();
  const tables: ResultTable[] = [];
  const warnings: string[] = [...bomWarnings];
  let totalPlannedReleases = 0;
  let totalOrders = 0;
  let totalSelectedCost = 0;
  let totalSetupCost = 0;
  let totalHoldingCost = 0;
  let optimalCostSum = 0;
  let totalPastDueUnits = 0;
  const pastDueItems: string[] = [];
  const suboptimalNotes: string[] = [];
  const itemTotals: { item: string; totalRelease: number }[] = [];
  const comparisonRows: (string | number)[][] = [];
  const level0Releases = Array<number>(T).fill(0);
  const maxBomLevel = sortedItems.reduce((mx, it) => Math.max(mx, it.effectiveLevel), 0);

  for (const item of sortedItems) {
    const gross = Array.from({ length: T }, (_, t) => item.grossRequirements[t] ?? 0);

    // Explode all parents' Planned Order Releases into child Gross Requirements (Common Parts support)
    for (const parentName of item.parentList) {
      if (releasesByItem.has(parentName)) {
        const parentRel = releasesByItem.get(parentName)!;
        for (let t = 0; t < T; t += 1) {
          gross[t] += parentRel[t] * (item.qtyPerParent || 1);
        }
        const parentPastDue = pastDueByItem.get(parentName) ?? 0;
        if (parentPastDue > 0) {
          const urgentChildQty = parentPastDue * (item.qtyPerParent || 1);
          warnings.push(
            `Item "${item.item}": induk "${parentName}" memiliki Past Due ${roundTo(parentPastDue, 2)} unit, memicu kebutuhan mendesak ${roundTo(urgentChildQty, 2)} unit di luar jendela horizon.`,
          );
        }
      } else {
        warnings.push(`Parent "${parentName}" untuk item "${item.item}" tidak ditemukan pada daftar BOM.`);
      }
    }

    const sched = Array.from({ length: T }, (_, t) => item.scheduledReceipts[t] ?? 0);
    const chosen = simulateItemSchedule(item, item.lotSizing, gross, sched);

    if (chosen.pastDue > 0) {
      totalPastDueUnits += chosen.pastDue;
      pastDueItems.push(`${item.item} (${formatNum(chosen.pastDue, 0)} unit)`);
      for (let t = 0; t < Math.min(T, Math.max(0, Math.round(item.leadTime))); t += 1) {
        if (chosen.plannedRec[t] > 0) {
          warnings.push(
            `Item "${item.item}": order ${roundTo(chosen.plannedRec[t], 2)} unit pada ${input.periodLabels[t]} melewati lead time (Past Due).`,
          );
        }
      }
    }

    releasesByItem.set(item.item, chosen.plannedRel);
    pastDueByItem.set(item.item, chosen.pastDue);
    if (item.effectiveLevel === 0) {
      for (let t = 0; t < T; t += 1) level0Releases[t] += chosen.plannedRel[t];
    }

    const itemSumRel = chosen.plannedRel.reduce((a, b) => a + b, 0) + chosen.pastDue;
    totalPlannedReleases += itemSumRel;
    totalOrders += chosen.orderCount;
    totalSelectedCost += chosen.totalRelevantCost;
    totalSetupCost += chosen.setupCostTotal;
    totalHoldingCost += chosen.holdingCostTotal;
    itemTotals.push({ item: item.item, totalRelease: itemSumRel });

    const allSims = ALL_LOT_METHODS.map((m) => ({
      method: m,
      sim: simulateItemSchedule(item, m, gross, sched),
    }));
    const bestSim = [...allSims].sort(
      (a, b) => a.sim.totalRelevantCost - b.sim.totalRelevantCost,
    )[0];
    optimalCostSum += bestSim.sim.totalRelevantCost;

    if (
      item.lotSizing !== bestSim.method &&
      chosen.totalRelevantCost > bestSim.sim.totalRelevantCost + 1e-6
    ) {
      const save = chosen.totalRelevantCost - bestSim.sim.totalRelevantCost;
      suboptimalNotes.push(
        `${item.item}: ubah ${chosen.effectiveParamNote} → ${bestSim.sim.effectiveParamNote} (hemat ${formatNum(save, 2)})`,
      );
    }

    for (const entry of allSims) {
      comparisonRows.push([
        item.item,
        `${entry.sim.effectiveParamNote}${entry.method === item.lotSizing ? ' (Dipilih)' : ''}${entry.method === bestSim.method ? ' ★' : ''}`,
        entry.sim.orderCount,
        roundTo(entry.sim.setupCostTotal, 2),
        roundTo(entry.sim.holdingCostTotal, 2),
        roundTo(entry.sim.totalRelevantCost, 2),
      ]);
    }

    tables.push({
      id: `mrp-${item.item}`,
      title: `Jadwal MRP: ${item.item} (LLC Level ${item.effectiveLevel}, LT=${item.leadTime}, On-Hand=${item.onHand}, ${chosen.effectiveParamNote})`,
      headers: ['Baris MRP', ...(chosen.pastDue > 0 ? ['Past Due'] : []), ...input.periodLabels],
      rows: [
        ['Gross Requirements', ...(chosen.pastDue > 0 ? ['-'] : []), ...gross.map((v) => roundTo(v, 2))],
        ['Scheduled Receipts', ...(chosen.pastDue > 0 ? ['-'] : []), ...sched.map((v) => roundTo(v, 2))],
        ['Projected On-Hand', ...(chosen.pastDue > 0 ? [item.onHand] : []), ...chosen.poh.map((v) => roundTo(v, 2))],
        ['Net Requirements', ...(chosen.pastDue > 0 ? ['-'] : []), ...chosen.netReq.map((v) => roundTo(v, 2))],
        ['Planned Order Receipts', ...(chosen.pastDue > 0 ? ['-'] : []), ...chosen.plannedRec.map((v) => roundTo(v, 2))],
        [
          'Planned Order Releases',
          ...(chosen.pastDue > 0 ? [roundTo(chosen.pastDue, 2)] : []),
          ...chosen.plannedRel.map((v) => roundTo(v, 2)),
        ],
      ],
      highlightRowIndices: [5],
    });
  }

  tables.push({
    id: 'mrp-lotsize-comparison',
    title: 'Perbandingan Biaya Lot-Sizing MRP (L4L vs FOQ vs POQ vs EOQ vs Silver-Meal)',
    subtitle: 'Simulasi Setup Cost + Holding Cost per item (★ menandai biaya termurah).',
    headers: ['Item BOM', 'Metode Lot-Sizing', 'Jumlah Order', 'Biaya Setup', 'Biaya Simpan', 'Total Biaya Relevan'],
    rows: comparisonRows,
  });

  const potentialSavings = Math.max(0, totalSelectedCost - optimalCostSum);
  const savingsPct = totalSelectedCost > 1e-9 ? (potentialSavings / totalSelectedCost) * 100 : 0;
  const setupShare = totalSelectedCost > 1e-9 ? (totalSetupCost / totalSelectedCost) * 100 : 0;
  const holdingShare = totalSelectedCost > 1e-9 ? (totalHoldingCost / totalSelectedCost) * 100 : 0;

  return {
    jobId,
    moduleId: 'mrp',
    jobTitle,
    status: warnings.length > 0 ? 'warning' : 'success',
    executionMs: roundTo(performance.now() - start, 2),
    summaryText: `Ledakan BOM MRP (${sortedItems.length} komponen, Low-Level Coding) menghasilkan ${totalOrders} pemesanan, total release ${formatNum(totalPlannedReleases, 0)} unit, biaya relevan ${formatNum(totalSelectedCost, 2)}.`,
    kpis: [
      { label: 'Total Item / Komponen', value: sortedItems.length, emphasis: 'primary' },
      { label: 'Total Rencana Order Release', value: formatNum(totalPlannedReleases, 0), unit: 'unit', emphasis: 'success' },
      { label: 'Total Biaya Lot-Sizing', value: formatNum(totalSelectedCost, 2) },
      { label: 'Potensi Hemat Lot-Sizing', value: formatNum(potentialSavings, 2), emphasis: potentialSavings > 1e-6 ? 'warning' : 'success' },
      { label: 'Peringatan BOM / Past-Due', value: warnings.length, emphasis: warnings.length > 0 ? 'warning' : 'success' },
    ],
    tables,
    charts: [
      {
        kind: 'bar',
        id: 'mrp-releases-bar',
        title: 'Total Planned Order Release per Komponen BOM',
        xLabel: 'Komponen',
        yLabel: 'Total Unit Release',
        bars: itemTotals.map((it) => ({
          label: it.item,
          value: roundTo(it.totalRelease, 2),
        })),
      },
    ],
    warnings,
    auditSteps: [
      {
        title: '1. Low-Level Coding & BOM Explosion',
        formula: 'Gross(Child, t) += ∑ PlannedOrderRelease(Parentᵢ, t) × QtyPerParent',
        detail: `Diurutkan ${sortedItems.length} komponen (kedalaman ${maxBomLevel + 1} level) secara topologis agar common parts menghitung seluruh permintaan induk terlebih dahulu.`,
      },
      {
        title: '2. Netting & Lot-Sizing (L4L / FOQ / POQ / EOQ / Silver-Meal)',
        formula: 'NetReq(t) = max(0, Gross(t) + SafetyStock - OnHand(t-1) - SchedRec(t))',
        detail: `Silver-Meal meminimalkan rata-rata biaya periode (S + H·∑k·Dₖ)/(n), sementara EOQ = √(2·D_avg·S/H).`,
      },
      {
        title: '3. Evaluasi Biaya Setup + Simpan',
        formula: `Total Biaya = ∑(Orders × S) + ∑(ProjectedOnHand × H) = ${formatNum(totalSetupCost, 2)} + ${formatNum(totalHoldingCost, 2)} = ${formatNum(totalSelectedCost, 2)}`,
        detail: `Jika seluruh item mengadopsi aturan lot-sizing termurah (★), total biaya turun menjadi ${formatNum(optimalCostSum, 2)} (hemat ${formatNum(potentialSavings, 2)}).`,
      },
    ],
    analysis: {
      headline:
        potentialSavings > 1e-6
          ? `BOM ${maxBomLevel + 1}-Level Selesai — Peluang Penghematan ${formatNum(potentialSavings, 2)} (${formatNum(savingsPct, 1)}%) Lewat Optimasi Lot-Sizing`
          : `Jadwal MRP Optimal pada Biaya Minimum ${formatNum(totalSelectedCost, 2)} untuk ${sortedItems.length} Item`,
      interpretation: `Ledakan Bill of Materials (${sortedItems.length} item, ${T} periode) memicu ${totalOrders} kali rilis order dengan total volume ${formatNum(totalPlannedReleases, 0)} unit. Struktur biaya relevan terdiri dari biaya setup/pesan ${formatNum(totalSetupCost, 2)} (${formatNum(setupShare, 1)}%) dan biaya simpan ${formatNum(totalHoldingCost, 2)} (${formatNum(holdingShare, 1)}%).`,
      sections: [
        {
          heading: 'Audit Efisiensi Metode Lot-Sizing',
          body:
            suboptimalNotes.length > 0
              ? `Ditemukan ${suboptimalNotes.length} komponen yang masih dapat dihemat jika mengganti aturan lot-sizing: ${suboptimalNotes.join('; ')}. Total biaya dapat diturunkan dari ${formatNum(totalSelectedCost, 2)} menjadi ${formatNum(optimalCostSum, 2)}.`
              : `Seluruh ${sortedItems.length} komponen sudah menggunakan aturan lot-sizing paling ekonomis di antara 5 metode (L4L, FOQ, POQ, EOQ, Silver-Meal).`,
          tone: suboptimalNotes.length > 0 ? 'caution' : 'positive',
        },
        {
          heading: 'Kelaikan Lead Time & Status Past-Due',
          body:
            totalPastDueUnits > 0
              ? `Terdapat total ${formatNum(totalPastDueUnits, 0)} unit order berstatus Past Due pada: ${pastDueItems.join(', ')}. Artinya jadwal induk (MPS) berada terlalu dekat dibanding waktu tunggu (lead time) komponen sehingga memerlukan tindakan expediting segera.`
              : 'Seluruh Planned Order Releases jatuh di dalam horizon perencanaan (0 unit Past Due); jadwal pengadaan material sepenuhnya layak secara lead time.',
          tone: totalPastDueUnits > 0 ? 'critical' : 'positive',
        },
      ],
      recommendations: [
        ...(suboptimalNotes.length > 0
          ? [
              `Terapkan perpindahan aturan lot-sizing optimal (${suboptimalNotes.slice(0, 3).join('; ')}) untuk langsung menghemat ${formatNum(potentialSavings, 2)}.`,
            ]
          : ['Pertahankan aturan lot-sizing saat ini karena sudah menghasilkan titik biaya relevan terendah.']),
        totalPastDueUnits > 0
          ? `Segera lakukan expediting pemasok, lembur produksi, atau revisi mundur jadwal MPS untuk menutup order Past Due (${pastDueItems.join(', ')}) agar lini perakitan tidak terhenti.`
          : 'Kunci jadwal rilis order (Firm Planned Orders) pada periode awal dalam time fence dan sinkronkan Purchase Order ke pemasok sesuai tanggal rilis MRP.',
      ],
    },
    derivedValues: {
      totalPlannedReleases: roundTo(totalPlannedReleases, 2),
      totalOrders,
      totalMrpCost: roundTo(totalSelectedCost, 2),
      optimalLotSizingCost: roundTo(optimalCostSum, 2),
      potentialSavings: roundTo(potentialSavings, 2),
      totalPastDueUnits: roundTo(totalPastDueUnits, 2),
      level0PlannedReleases: level0Releases.map((v) => roundTo(v, 2)).join(', '),
    },
  };
}

