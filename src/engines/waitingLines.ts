import { formatNum, roundTo } from '../core/math/matrix.ts';
import type {
  ModuleExecutionResult,
  ResultTable,
  WaitingLinesInput,
} from '../core/types/module.types.ts';

interface QueueMetrics {
  utilization: number;
  p0: number;
  lq: number;
  ls: number;
  wq: number;
  ws: number;
  pw: number;
  pBlocked?: number;
}

function computeMms(lambda: number, mu: number, s: number): QueueMetrics | null {
  if (lambda < 0 || mu <= 0 || s < 1) return null;
  const r = lambda / mu;
  const rho = r / s;
  if (rho >= 1) return null;

  // Overflow-safe iterative Erlang-C term recurrence (never calls factorial(s))
  let term = 1;
  let sumTerms = 1;
  for (let k = 1; k < s; k += 1) {
    term *= r / k;
    sumTerms += term;
  }
  const sTerm = term * (r / s);
  const tailTerm = sTerm / (1 - rho);
  const p0 = 1 / (sumTerms + tailTerm);
  const pw = tailTerm * p0;
  const lq = (pw * rho) / (1 - rho);
  const ls = lq + r;
  const wq = lambda > 0 ? lq / lambda : 0;
  const ws = wq + 1 / mu;

  return { utilization: rho, p0, lq, ls, wq, ws, pw };
}

function computeMm1k(lambda: number, mu: number, kCap: number): QueueMetrics | null {
  if (lambda < 0 || mu <= 0 || kCap < 1) return null;
  const a = lambda / mu;
  let p0: number;
  let ls: number;
  let pBlocked: number;

  if (Math.abs(a - 1) < 1e-8) {
    p0 = 1 / (kCap + 1);
    ls = kCap / 2;
    pBlocked = p0;
  } else if (a < 1) {
    const aPowK = a ** kCap;
    const aPowK1 = aPowK * a;
    p0 = (1 - a) / (1 - aPowK1);
    pBlocked = p0 * aPowK;
    ls =
      (a * (1 - (kCap + 1) * aPowK + kCap * aPowK1)) /
      ((1 - a) * (1 - aPowK1));
  } else {
    // Overflow-safe formulation for a > 1 using reciprocal b = 1/a < 1
    const b = 1 / a;
    const bPowK = b ** kCap;
    const bPowK1 = bPowK * b;
    pBlocked = (1 - b) / (1 - bPowK1);
    p0 = pBlocked * bPowK;
    ls =
      kCap -
      (b * (1 - (kCap + 1) * bPowK + kCap * bPowK1)) /
        ((1 - b) * (1 - bPowK1));
  }

  const lambdaEff = lambda * (1 - pBlocked);
  const lq = Math.max(0, ls - (1 - p0));
  const ws = lambdaEff > 0 ? ls / lambdaEff : 0;
  const wq = lambdaEff > 0 ? lq / lambdaEff : 0;
  // Probability an arriving customer joins the queue (neither empty nor blocked)
  const pw = Math.max(0, 1 - p0 - pBlocked);

  return {
    utilization: lambdaEff / mu,
    p0,
    lq,
    ls,
    wq,
    ws,
    pw,
    pBlocked,
  };
}

function computeMd1(lambda: number, mu: number): QueueMetrics | null {
  if (lambda < 0 || mu <= 0) return null;
  const rho = lambda / mu;
  if (rho >= 1) return null;
  const lq = (rho * rho) / (2 * (1 - rho));
  const ls = lq + rho;
  const wq = lambda > 0 ? lq / lambda : 0;
  const ws = wq + 1 / mu;
  return { utilization: rho, p0: 1 - rho, lq, ls, wq, ws, pw: rho };
}

export function solveWaitingLines(
  jobId: string,
  jobTitle: string,
  input: WaitingLinesInput,
): ModuleExecutionResult {
  const start = performance.now();
  const lambda = input.arrivalRate;
  const mu = input.serviceRate;
  const s = input.model === 'mms' ? Math.max(1, Math.round(input.servers || 1)) : 1;
  const unit = (input.timeUnit ?? 'jam').trim() || 'jam';
  const isHourUnit = /^(jam|hour|hours|hr|hrs|h)$/i.test(unit);
  const displayWaitVal = (rawTime: number) => (isHourUnit ? rawTime * 60 : rawTime);
  const displayWaitUnit = isHourUnit ? 'menit' : unit;

  let metrics: QueueMetrics | null = null;
  if (input.model === 'mm1') metrics = computeMms(lambda, mu, 1);
  else if (input.model === 'mms') metrics = computeMms(lambda, mu, s);
  else if (input.model === 'mm1k') metrics = computeMm1k(lambda, mu, Math.max(1, Math.round(input.systemCapacity ?? 5)));
  else if (input.model === 'md1') metrics = computeMd1(lambda, mu);

  if (!metrics) {
    const rawRho = mu > 0 ? lambda / (s * mu) : Infinity;
    const minNeededS = mu > 0 ? Math.floor(lambda / mu) + 1 : s + 1;
    return {
      jobId,
      moduleId: 'waiting-lines',
      jobTitle,
      status: 'error',
      executionMs: roundTo(performance.now() - start, 2),
      summaryText: `Sistem antrean tidak stabil: tingkat kedatangan (${lambda}) melebihi atau sama dengan kapasitas layanan (${s * mu}).`,
      kpis: [
        { label: 'Utilisasi (ρ)', value: Number.isFinite(rawRho) ? `${formatNum(rawRho * 100, 1)}%` : '∞', emphasis: 'danger' },
        { label: 'Status Sistem', value: 'Unstable (ρ ≥ 1)', emphasis: 'danger' },
      ],
      tables: [],
      charts: [],
      warnings: [`Tingkatkan jumlah server minimal menjadi s = ${minNeededS} atau naikkan laju layanan μ > ${formatNum(lambda / s, 2)} agar ρ < 1.`],
      analysis: {
        headline: 'Sistem Antrean Melewati Batas Stabilitas (ρ ≥ 100%)',
        interpretation: `Laju kedatangan λ = ${lambda}/${unit} menumpuk lebih cepat dibanding kapasitas layanan total s·μ = ${formatNum(s * mu, 2)}/${unit}, sehingga panjang antrean akan tumbuh menuju tak hingga seiring waktu.`,
        sections: [
          {
            heading: 'Syarat Minimum Stabilitas',
            body: `Agar sistem mencapai steady-state (ρ < 1), diperlukan minimal s = ${minNeededS} server (utilisasi menjadi ${formatNum((lambda / (minNeededS * Math.max(1e-9, mu))) * 100, 1)}%) atau peningkatan kecepatan layanan di atas ${formatNum(lambda / s, 2)} pelanggan/${unit} per server.`,
            tone: 'critical',
          },
        ],
        recommendations: [
          `Tambahkan kapasitas layanan hingga minimal ${minNeededS} server aktif pada jam sibuk.`,
          'Jika jumlah server tidak bisa ditambah, pertimbangkan batas kapasitas antrean (M/M/1/K) atau sistem reservasi/penjadwalan kedatangan.',
        ],
      },
      derivedValues: {},
      error: 'Sistem antrean tidak stabil (ρ ≥ 1).',
    };
  }

  const waitCostRate = input.waitingCostPerHour ?? 0;
  const srvCostRate = input.serverCostPerHour ?? 0;
  const totalWaitingCost = metrics.ls * waitCostRate;
  const totalServerCost = s * srvCostRate;
  const totalCost = totalWaitingCost + totalServerCost;
  const hasCostData = waitCostRate + srvCostRate > 0;

  const mainTable: ResultTable = {
    id: 'queue-metrics',
    title: `Parameter Kinerja Antrean (${input.model.toUpperCase()})`,
    headers: ['Parameter', 'Simbol', 'Nilai', 'Satuan / Keterangan'],
    rows: [
      ['Utilisasi Server', 'ρ', `${roundTo(metrics.utilization * 100, 2)}%`, 'Proporsi waktu server sibuk'],
      ['Probabilitas Sistem Kosong', 'P₀', roundTo(metrics.p0, 4), 'Peluang 0 pelanggan dalam sistem'],
      ['Rata-rata Pelanggan di Antrean', 'Lq', roundTo(metrics.lq, 4), 'pelanggan'],
      ['Rata-rata Pelanggan di Sistem', 'Ls', roundTo(metrics.ls, 4), 'pelanggan (antre + dilayani)'],
      [
        'Rata-rata Waktu Tunggu di Antrean',
        'Wq',
        roundTo(metrics.wq, 4),
        isHourUnit ? `${unit} (${roundTo(metrics.wq * 60, 2)} menit)` : unit,
      ],
      [
        'Rata-rata Waktu di Sistem',
        'Ws',
        roundTo(metrics.ws, 4),
        isHourUnit ? `${unit} (${roundTo(metrics.ws * 60, 2)} menit)` : unit,
      ],
      ['Probabilitas Mengantre', 'Pw', `${roundTo(metrics.pw * 100, 2)}%`, 'Peluang pelanggan datang harus menunggu'],
      ...(metrics.pBlocked !== undefined
        ? [['Probabilitas Penolakan (Penuh)', 'Pk', `${roundTo(metrics.pBlocked * 100, 2)}%`, `Kapasitas maksimum K = ${Math.round(input.systemCapacity ?? 5)}`]]
        : []),
      ['Biaya Tunggu per Periode', 'Cw·Ls', roundTo(totalWaitingCost, 2), `per ${unit}`],
      ['Biaya Server per Periode', 'Cs·s', roundTo(totalServerCost, 2), `per ${unit}`],
      ['Total Biaya Sistem', 'TC', roundTo(totalCost, 2), `per ${unit}`],
    ],
  };

  // Sensitivity across s = minStableS..maxS
  const minStableS = Math.max(1, Math.floor(lambda / mu) + 1);
  const maxS = Math.max(s + 3, minStableS + 3);
  const sensitivityEntries: {
    candS: number;
    rho: number;
    lq: number;
    wqDisp: number;
    ls: number;
    tc: number;
  }[] = [];

  for (let candS = minStableS; candS <= maxS; candS += 1) {
    const m = computeMms(lambda, mu, candS);
    if (!m) continue;
    const tc = m.ls * waitCostRate + candS * srvCostRate;
    sensitivityEntries.push({
      candS,
      rho: m.utilization,
      lq: m.lq,
      wqDisp: displayWaitVal(m.wq),
      ls: m.ls,
      tc,
    });
  }

  const bestServerEntry = hasCostData
    ? [...sensitivityEntries].sort((a, b) => a.tc - b.tc)[0]
    : sensitivityEntries.find((e) => e.rho <= 0.75) ?? sensitivityEntries[0];

  const sensitivityTable: ResultTable = {
    id: 'queue-sensitivity',
    title: 'Analisis Sensitivitas Jumlah Server (Model M/M/s)',
    headers: ['Server (s)', 'Utilisasi (ρ)', 'Lq', `Wq (${displayWaitUnit})`, 'Ls', 'Total Biaya'],
    rows: sensitivityEntries.map((e) => [
      e.candS,
      `${roundTo(e.rho * 100, 1)}%`,
      roundTo(e.lq, 3),
      roundTo(e.wqDisp, 2),
      roundTo(e.ls, 3),
      roundTo(e.tc, 2),
    ]),
    highlightRowIndices: bestServerEntry
      ? [sensitivityEntries.findIndex((e) => e.candS === bestServerEntry.candS)]
      : [],
  };

  const chartBars = sensitivityEntries.map((e) => ({
    label: `s=${e.candS}`,
    value: roundTo(hasCostData ? e.tc : e.wqDisp, 2),
    colorToken: e.candS === s ? 'var(--chart-1)' : 'var(--chart-2)',
  }));

  const rhoPct = metrics.utilization * 100;
  const congestionLevel =
    rhoPct >= 90
      ? 'sangat padat (zona kritis >90%)'
      : rhoPct >= 80
        ? 'padat (zona rawan macet 80–90%)'
        : rhoPct >= 60
          ? 'seimbang (zona operasional ideal 60–80%)'
          : 'longgar (utilisasi <60%)';
  const congestionTone: 'critical' | 'caution' | 'positive' | 'neutral' =
    rhoPct >= 90 ? 'critical' : rhoPct >= 80 ? 'caution' : rhoPct >= 60 ? 'positive' : 'neutral';

  const costDiffVsOpt =
    hasCostData && bestServerEntry ? totalCost - bestServerEntry.tc : 0;

  const elapsed = roundTo(performance.now() - start, 2);

  return {
    jobId,
    moduleId: 'waiting-lines',
    jobTitle,
    status: 'success',
    executionMs: elapsed,
    summaryText: `Utilisasi = ${formatNum(rhoPct, 1)}%, Wq = ${formatNum(displayWaitVal(metrics.wq), 2)} ${displayWaitUnit}, Ls = ${formatNum(metrics.ls, 2)} pelanggan.`,
    kpis: [
      { label: 'Utilisasi Server (ρ)', value: `${formatNum(rhoPct, 1)}%`, emphasis: 'primary' },
      { label: 'Waktu Tunggu Antrean (Wq)', value: `${formatNum(displayWaitVal(metrics.wq), 2)} ${displayWaitUnit}` },
      { label: 'Panjang Antrean (Lq)', value: formatNum(metrics.lq, 2), unit: 'pelanggan' },
      { label: 'Total Biaya Sistem', value: formatNum(totalCost, 2), emphasis: 'success' },
    ],
    tables: [mainTable, sensitivityTable],
    charts: [
      {
        kind: 'bar',
        id: 'queue-server-comparison',
        title: hasCostData
          ? 'Perbandingan Total Biaya vs Jumlah Server'
          : `Perbandingan Waktu Tunggu Wq (${displayWaitUnit}) vs Jumlah Server`,
        xLabel: 'Jumlah Server',
        yLabel: hasCostData ? 'Total Biaya' : `Wq (${displayWaitUnit})`,
        bars: chartBars,
      },
    ],
    warnings: [],
    auditSteps: [
      {
        title: '1. Utilisasi & Hukum Little (Antrean)',
        formula: `ρ = λ / (s·μ) = ${lambda} / (${s}·${mu}) = ${roundTo(metrics.utilization, 4)} · Wq = Lq / λ_eff · Ls = λ_eff·Ws`,
        detail: `Model ${input.model.toUpperCase()} stabil (ρ < 1). Rata-rata antre Wq = ${roundTo(displayWaitVal(metrics.wq), 2)} ${displayWaitUnit} dengan panjang antrean Lq = ${roundTo(metrics.lq, 3)} pelanggan.`,
      },
      {
        title: '2. Analisis Biaya Total Antrean',
        formula: `TC = (Cw × Ls) + (Cs × s) = (${waitCostRate} × ${roundTo(metrics.ls, 3)}) + (${srvCostRate} × ${s}) = ${formatNum(totalCost, 2)}`,
        detail: 'Bandingkan baris tabel sensitivitas server untuk menemukan jumlah loket/server dengan total biaya minimum.',
      },
    ],
    analysis: {
      headline: `Sistem ${input.model.toUpperCase()} Berada di Zona ${congestionLevel}`,
      interpretation: `Pada laju kedatangan λ = ${lambda}/${unit} dan kapasitas ${s} × ${mu}/${unit}, rata-rata pelanggan menunggu ${formatNum(displayWaitVal(metrics.wq), 2)} ${displayWaitUnit} sebelum dilayani (total waktu di sistem ${formatNum(displayWaitVal(metrics.ws), 2)} ${displayWaitUnit}) dengan ${formatNum(metrics.pw * 100, 1)}% pelanggan harus mengantre.${
        metrics.pBlocked !== undefined
          ? ` Karena kapasitas terbatas (K = ${Math.round(input.systemCapacity ?? 5)}), sekitar ${formatNum(metrics.pBlocked * 100, 2)}% kedatangan ditolak.`
          : ''
      }`,
      sections: [
        {
          heading: 'Diagnosis Kepadatan & Risiko Lonjakan Antrean',
          body: `Utilisasi server saat ini ${formatNum(rhoPct, 1)}% (${formatNum((1 - metrics.utilization) * 100, 1)}% waktu luang). Pada teori antrean, waktu tunggu meningkat non-linear/eksponensial ketika utilisasi melampaui 80–85%.`,
          tone: congestionTone,
        },
        {
          heading: 'Keseimbangan Biaya Tunggu vs Biaya Server',
          body: hasCostData
            ? `Total biaya sistem ${formatNum(totalCost, 2)}/${unit} terbagi menjadi biaya tunggu pelanggan ${formatNum(totalWaitingCost, 2)} (${formatNum((totalWaitingCost / Math.max(1e-6, totalCost)) * 100, 1)}%) dan biaya operasional server ${formatNum(totalServerCost, 2)} (${formatNum((totalServerCost / Math.max(1e-6, totalCost)) * 100, 1)}%).${
                bestServerEntry
                  ? ` Jumlah server paling ekonomis secara matematis adalah s* = ${bestServerEntry.candS} dengan total biaya ${formatNum(bestServerEntry.tc, 2)}/${unit}.`
                  : ''
              }`
            : `Masukkan biaya tunggu (Cw) dan biaya server (Cs) untuk menghitung jumlah server optimal biaya; dari sisi layanan, s = ${bestServerEntry?.candS ?? s} menjaga utilisasi ≤ 75%.`,
          tone: costDiffVsOpt > 1 ? 'caution' : 'positive',
        },
      ],
      recommendations: [
        ...(hasCostData && bestServerEntry && bestServerEntry.candS !== s
          ? [
              `${bestServerEntry.candS > s ? 'Tambah' : 'Kurangi'} jumlah server dari s = ${s} menjadi s* = ${bestServerEntry.candS} untuk menghemat biaya sistem sebesar ${formatNum(costDiffVsOpt, 2)}/${unit} (Wq menjadi ${formatNum(bestServerEntry.wqDisp, 2)} ${displayWaitUnit}).`,
            ]
          : [
              `Konfigurasi s = ${s} server sudah berada pada titik total biaya minimum (${formatNum(totalCost, 2)}/${unit}).`,
            ]),
        ...(input.model === 'mm1'
          ? [
              'Mengurangi variasi waktu layanan menuju deterministik (M/D/1 melalui SOP standar/otomasi) dapat memotong panjang antrean Lq hingga tepat 50%.',
            ]
          : []),
        ...(metrics.pBlocked !== undefined && metrics.pBlocked > 0.05
          ? [
              `Tingkat penolakan pelanggan (${formatNum(metrics.pBlocked * 100, 1)}%) melampaui 5%; pertimbangkan memperbesar ruang tunggu K atau menambah kecepatan layanan.`,
            ]
          : []),
      ],
    },
    derivedValues: {
      utilization: roundTo(metrics.utilization, 4),
      p0: roundTo(metrics.p0, 4),
      pw: roundTo(metrics.pw, 4),
      lq: roundTo(metrics.lq, 4),
      ls: roundTo(metrics.ls, 4),
      wq: roundTo(metrics.wq, 4),
      ws: roundTo(metrics.ws, 4),
      ...(metrics.pBlocked !== undefined ? { pBlocked: roundTo(metrics.pBlocked, 4) } : {}),
      totalCost: roundTo(totalCost, 4),
    },
  };
}
