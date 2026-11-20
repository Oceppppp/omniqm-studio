import { formatNum, roundTo } from '../core/math/matrix.ts';
import type {
  DecisionAnalysisInput,
  ModuleExecutionResult,
  ResultTable,
} from '../core/types/module.types.ts';

export function solveDecisionAnalysis(
  jobId: string,
  jobTitle: string,
  input: DecisionAnalysisInput,
): ModuleExecutionResult {
  const start = performance.now();
  const alts = input.alternativeNames;
  const states = input.stateNames;
  const rawPayoffs = input.payoffs;
  const isCost = Boolean(input.isCostTable);

  if (alts.length === 0 || states.length === 0) {
    return {
      jobId,
      moduleId: 'decision-analysis',
      jobTitle,
      status: 'error',
      executionMs: 0,
      summaryText: 'Matriks keputusan kosong.',
      kpis: [],
      tables: [],
      charts: [],
      warnings: ['Minimal harus ada 1 alternatif dan 1 kondisi alam.'],
      derivedValues: {},
      error: 'Matriks keputusan kosong.',
    };
  }

  // Sanitize & normalize probabilities
  const warnings: string[] = [];
  const rawProbs = states.map((_, j) => {
    const raw = input.probabilities[j] ?? 0;
    if (raw < 0) {
      warnings.push(`Probabilitas negatif pada kondisi "${states[j]}" (${raw}) diubah menjadi 0.`);
      return 0;
    }
    return raw;
  });
  const probSum = rawProbs.reduce((a, b) => a + b, 0);
  const probs =
    probSum > 1e-9
      ? rawProbs.map((p) => p / probSum)
      : Array<number>(states.length).fill(1 / states.length);

  if (Math.abs(probSum - 1) > 0.01 && probSum > 1e-9) {
    warnings.push(`Total probabilitas (${roundTo(probSum, 4)}) dinormalisasi otomatis menjadi 1.0.`);
  } else if (probSum <= 1e-9) {
    warnings.push('Probabilitas semua kondisi alam bernilai 0; otomatis menggunakan bobot seragam (Laplace).');
  }

  // Work in benefit space for unified calculations (negate costs if cost table)
  const effective = rawPayoffs.map((row) =>
    states.map((_, j) => {
      const v = row[j] ?? 0;
      return isCost ? -v : v;
    }),
  );
  const alpha = Math.max(0, Math.min(1, input.hurwiczAlpha ?? 0.5));

  // Best in each state column for Regret and EVwPI
  const bestInCol = states.map((_, j) => {
    let m = -Infinity;
    for (let i = 0; i < alts.length; i += 1) {
      if (effective[i][j] > m) m = effective[i][j];
    }
    return m;
  });

  const regretTable = effective.map((row) =>
    row.map((val, j) => bestInCol[j] - val),
  );

  const rowsStats = alts.map((name, i) => {
    const rowEff = effective[i];
    const rowRaw = rawPayoffs[i];
    const maxEff = Math.max(...rowEff);
    const minEff = Math.min(...rowEff);
    const hurwiczEff = alpha * maxEff + (1 - alpha) * minEff;
    const laplaceEff = rowEff.reduce((a, b) => a + b, 0) / states.length;
    const emvEff = rowEff.reduce((acc, v, j) => acc + v * probs[j], 0);
    const maxRegret = Math.max(...regretTable[i]);
    const eol = regretTable[i].reduce((acc, r, j) => acc + r * probs[j], 0);

    const sign = isCost ? -1 : 1;
    return {
      name,
      optimistic: sign * maxEff,
      pessimistic: sign * minEff,
      hurwicz: sign * hurwiczEff,
      laplace: sign * laplaceEff,
      emv: sign * emvEff,
      emvEff,
      maxRegret,
      eol,
      rawRow: rowRaw,
    };
  });

  // Identify winners under each criterion
  const bestOptimistic = [...rowsStats].sort((a, b) =>
    isCost ? a.optimistic - b.optimistic : b.optimistic - a.optimistic,
  )[0];
  const bestPessimistic = [...rowsStats].sort((a, b) =>
    isCost ? a.pessimistic - b.pessimistic : b.pessimistic - a.pessimistic,
  )[0];
  const bestHurwicz = [...rowsStats].sort((a, b) =>
    isCost ? a.hurwicz - b.hurwicz : b.hurwicz - a.hurwicz,
  )[0];
  const bestLaplace = [...rowsStats].sort((a, b) =>
    isCost ? a.laplace - b.laplace : b.laplace - a.laplace,
  )[0];
  const bestMinimaxRegret = [...rowsStats].sort((a, b) => a.maxRegret - b.maxRegret)[0];
  const sortedByEmv = [...rowsStats].sort((a, b) => b.emvEff - a.emvEff);
  const bestEmvRow = sortedByEmv[0];
  const runnerUpRow = sortedByEmv[1];

  const evwpiEff = bestInCol.reduce((acc, val, j) => acc + val * probs[j], 0);
  const evwpi = (isCost ? -1 : 1) * evwpiEff;
  const evpi = Math.abs(evwpiEff - bestEmvRow.emvEff);

  const summaryTable: ResultTable = {
    id: 'decision-summary',
    title: 'Evaluasi Multi-Kriteria Keputusan',
    headers: [
      'Alternatif',
      isCost ? 'Minimin (Optimis)' : 'Maximax (Optimis)',
      isCost ? 'Minimax (Pesimis)' : 'Maximin (Pesimis)',
      `Hurwicz (α=${alpha})`,
      'Laplace (Equal)',
      'Max Regret',
      'EMV',
      'EOL',
    ],
    rows: rowsStats.map((r) => [
      r.name,
      roundTo(r.optimistic, 2),
      roundTo(r.pessimistic, 2),
      roundTo(r.hurwicz, 2),
      roundTo(r.laplace, 2),
      roundTo(r.maxRegret, 2),
      roundTo(r.emv, 2),
      roundTo(r.eol, 2),
    ]),
    highlightRowIndices: [rowsStats.findIndex((r) => r.name === bestEmvRow.name)],
  };

  const criteriaTable: ResultTable = {
    id: 'decision-criteria',
    title: 'Rekomendasi Keputusan per Kriteria',
    headers: ['Kriteria Keputusan', 'Alternatif Terbaik', 'Nilai'],
    rows: [
      [isCost ? 'Minimin (Optimistic / Min Cost)' : 'Maximax (Optimistic)', bestOptimistic.name, roundTo(bestOptimistic.optimistic, 2)],
      [isCost ? 'Minimax (Pessimistic / Min Worst Cost)' : 'Maximin (Pessimistic)', bestPessimistic.name, roundTo(bestPessimistic.pessimistic, 2)],
      [`Hurwicz (α=${alpha})`, bestHurwicz.name, roundTo(bestHurwicz.hurwicz, 2)],
      ['Laplace (Equal Likelihood)', bestLaplace.name, roundTo(bestLaplace.laplace, 2)],
      ['Minimax Regret', bestMinimaxRegret.name, roundTo(bestMinimaxRegret.maxRegret, 2)],
      ['Expected Monetary Value (EMV)', bestEmvRow.name, roundTo(bestEmvRow.emv, 2)],
      ['Expected Value w/ Perfect Info (EVwPI)', '-', roundTo(evwpi, 2)],
      ['Expected Value of Perfect Info (EVPI)', '-', roundTo(evpi, 2)],
    ],
  };

  const regretResTable: ResultTable = {
    id: 'decision-regret',
    title: 'Tabel Opportunity Loss (Regret)',
    headers: ['Alternatif', ...states.map((s, j) => `${s} (p=${roundTo(probs[j], 2)})`), 'Max Regret', 'EOL'],
    rows: rowsStats.map((r, i) => [
      r.name,
      ...regretTable[i].map((v) => roundTo(v, 2)),
      roundTo(r.maxRegret, 2),
      roundTo(r.eol, 2),
    ]),
    highlightRowIndices: [rowsStats.findIndex((r) => r.name === bestEmvRow.name)],
  };

  const allWinners = [
    bestOptimistic.name,
    bestPessimistic.name,
    bestHurwicz.name,
    bestLaplace.name,
    bestMinimaxRegret.name,
    bestEmvRow.name,
  ];
  const consensusCount = allWinners.filter((w) => w === bestEmvRow.name).length;
  const emvAdvantage = runnerUpRow ? Math.abs(bestEmvRow.emvEff - runnerUpRow.emvEff) : 0;
  const elapsed = roundTo(performance.now() - start, 2);

  return {
    jobId,
    moduleId: 'decision-analysis',
    jobTitle,
    status: warnings.length > 0 ? 'warning' : 'success',
    executionMs: elapsed,
    summaryText: `Rekomendasi EMV terbaik: "${bestEmvRow.name}" (EMV = ${formatNum(bestEmvRow.emv, 2)}, EVPI = ${formatNum(evpi, 2)}).`,
    kpis: [
      { label: 'Alternatif Terbaik (EMV)', value: bestEmvRow.name, emphasis: 'primary' },
      { label: 'Nilai EMV Optimal', value: formatNum(bestEmvRow.emv, 2), emphasis: 'success' },
      { label: 'EVPI (Nilai Info Sempurna)', value: formatNum(evpi, 2) },
      { label: 'Minimax Regret', value: bestMinimaxRegret.name },
    ],
    tables: [summaryTable, criteriaTable, regretResTable],
    charts: [
      {
        kind: 'bar',
        id: 'decision-emv-bars',
        title: `Perbandingan EMV Antar Alternatif (${isCost ? 'Biaya — Lebih Rendah Lebih Baik' : 'Payoff — Lebih Tinggi Lebih Baik'})`,
        xLabel: 'Alternatif',
        yLabel: 'EMV',
        bars: rowsStats.map((r) => ({
          label: r.name,
          value: roundTo(r.emv, 2),
          colorToken: r.name === bestEmvRow.name ? 'var(--chart-1)' : 'var(--chart-2)',
        })),
      },
    ],
    warnings,
    auditSteps: [
      {
        title: '1. Kriteria Ketidakpastian & Risiko (EMV / Hurwicz / Regret)',
        formula: `EMVᵢ = ∑(${isCost ? 'Costᵢⱼ' : 'Payoffᵢⱼ'} × pⱼ) · Hurwicz = α·Best + (1-α)·Worst · EVPI = |EVwPI - EMV*| = min(EOL)`,
        detail: `Alternatif optimal menurut EMV & min(EOL) adalah "${bestEmvRow.name}" (EMV = ${formatNum(bestEmvRow.emv, 2)}, EOL = ${formatNum(bestEmvRow.eol, 2)}), dengan EVPI = ${formatNum(evpi, 2)}.`,
      },
    ],
    analysis: {
      headline: `"${bestEmvRow.name}" Unggul secara EMV (${consensusCount} dari 6 Kriteria Sepakat) dengan EVPI = ${formatNum(evpi, 2)}`,
      interpretation: `Berdasarkan tabel ${isCost ? 'biaya (minimasi)' : 'payoff (maksimasi)'} pada ${states.length} kondisi alam, alternatif "${bestEmvRow.name}" memberikan Expected Monetary Value (EMV) paling optimal sebesar ${formatNum(bestEmvRow.emv, 2)} sekaligus meminimalkan Expected Opportunity Loss (EOL = ${formatNum(bestEmvRow.eol, 2)}).${runnerUpRow ? ` Selisih keunggulan terhadap runner-up "${runnerUpRow.name}" (EMV = ${formatNum(runnerUpRow.emv, 2)}) adalah ${formatNum(emvAdvantage, 2)}.` : ''}`,
      sections: [
        {
          heading: 'Konsensus & Sensitivitas Profil Risiko',
          body:
            consensusCount >= 5
              ? `Keputusan sangat kokoh: ${consensusCount} dari 6 kriteria (termasuk EMV) memilih "${bestEmvRow.name}". Risiko divergensi antar profil pengambil keputusan sangat rendah.`
              : `Terdapat perbedaan antar profil risiko: pengambil keputusan agresif (${isCost ? 'Minimin' : 'Maximax'}) memilih "${bestOptimistic.name}" (${formatNum(bestOptimistic.optimistic, 2)}), konservatif (${isCost ? 'Minimax' : 'Maximin'}) memilih "${bestPessimistic.name}" (${formatNum(bestPessimistic.pessimistic, 2)}), dan penghindar penyesalan (Minimax Regret) memilih "${bestMinimaxRegret.name}" (max regret ${formatNum(bestMinimaxRegret.maxRegret, 2)}).`,
          tone: consensusCount >= 5 ? 'positive' : 'caution',
        },
        {
          heading: 'Nilai Ekonomis Informasi Sempurna (EVPI)',
          body: `Expected Value with Perfect Information (EVwPI) = ${formatNum(evwpi, 2)}, sehingga EVPI = ${formatNum(evpi, 2)} (identik dengan minimum EOL = ${formatNum(bestEmvRow.eol, 2)}). Angka ini merupakan plafon maksimum biaya yang layak dibayarkan untuk survei pasar, konsultansi, atau peramalan sempurna guna menghilangkan ketidakpastian.`,
          tone: 'neutral',
        },
      ],
      recommendations: [
        `Pilih "${bestEmvRow.name}" jika keputusan diambil berulang atau berorientasi pada nilai harapan matematis (risk-neutral) dengan estimasi probabilitas saat ini.`,
        evpi > 1e-6
          ? `Jangan membayar biaya riset/informasi tambahan melebihi ${formatNum(evpi, 2)} (EVPI); bila tersedia riset yang akurat dengan biaya jauh di bawah EVPI, lakukan riset sebelum eksekusi.`
          : 'EVPI = 0: satu alternatif mendominasi di seluruh kondisi alam relevan sehingga riset informasi tambahan tidak memberi nilai tambah ekonomis.',
        ...(bestPessimistic.name !== bestEmvRow.name
          ? [
              `Jika perusahaan memiliki toleransi risiko rendah dan tidak sanggup menanggung skenario terburuk, pertimbangkan opsi defensif "${bestPessimistic.name}" (${isCost ? 'biaya' : 'payoff'} terburuk ${formatNum(bestPessimistic.pessimistic, 2)}).`,
            ]
          : []),
      ],
    },
    derivedValues: {
      bestEmv: roundTo(bestEmvRow.emv, 4),
      bestAlternative: bestEmvRow.name,
      evpi: roundTo(evpi, 4),
      evwpi: roundTo(evwpi, 4),
    },
  };
}
