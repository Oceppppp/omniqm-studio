import {
  formatNum,
  invertMatrix,
  multiplyMatrices,
  multiplyVectorMatrix,
  roundTo,
  solveLinearSystem,
} from '../core/math/matrix.ts';
import type {
  KpiMetric,
  MarkovAnalysisInput,
  ModuleExecutionResult,
  ResultTable,
} from '../core/types/module.types.ts';

export function solveMarkovAnalysis(
  jobId: string,
  jobTitle: string,
  input: MarkovAnalysisInput,
): ModuleExecutionResult {
  const start = performance.now();
  const n = input.stateNames.length;
  const warnings: string[] = [];

  if (n === 0 || input.transitionMatrix.length !== n) {
    return {
      jobId,
      moduleId: 'markov-analysis',
      jobTitle,
      status: 'error',
      executionMs: 0,
      summaryText: 'Dimensi matriks transisi Markov tidak valid.',
      kpis: [],
      tables: [],
      charts: [],
      warnings: ['Pastikan matriks transisi berbentuk persegi n × n.'],
      derivedValues: {},
      error: 'Matriks transisi tidak valid.',
    };
  }

  // Sanitize & normalize rows to sum to 1
  const P = input.transitionMatrix.map((row, idx) => {
    const cleanRow = Array.from({ length: n }, (_, j) => {
      const raw = row[j] ?? 0;
      if (raw < 0) {
        warnings.push(`Entri probabilitas negatif P[${input.stateNames[idx]}→${input.stateNames[j]}] (${raw}) diubah menjadi 0.`);
        return 0;
      }
      return raw;
    });
    const sum = cleanRow.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1) > 0.01 && sum > 0) {
      warnings.push(`Baris ${input.stateNames[idx]} berjumlah ${roundTo(sum, 4)}, dinormalisasi ke 1.0.`);
    } else if (sum <= 1e-12) {
      warnings.push(`Baris ${input.stateNames[idx]} berjumlah 0; otomatis ditetapkan tetap di state sendiri (P[i][i] = 1).`);
    }
    return sum > 1e-12 ? cleanRow.map((v) => v / sum) : cleanRow.map((_, j) => (j === idx ? 1 : 0));
  });

  const cleanInit = Array.from({ length: n }, (_, j) => {
    const raw = input.initialVector[j] ?? 0;
    if (raw < 0) {
      warnings.push(`Vektor awal negatif pada "${input.stateNames[j]}" (${raw}) diubah menjadi 0.`);
      return 0;
    }
    return raw;
  });
  const initSum = cleanInit.reduce((a, b) => a + b, 0);
  const pi0 =
    initSum > 1e-12
      ? cleanInit.map((v) => v / initSum)
      : Array<number>(n).fill(1 / n);

  const steps = Math.max(1, Math.min(200, Math.round(input.steps || 5)));
  const trajectory: number[][] = [pi0];
  let curr = pi0;
  for (let t = 1; t <= steps; t += 1) {
    curr = multiplyVectorMatrix(curr, P);
    trajectory.push(curr);
  }

  // Identify absorbing states (P[i][i] >= 1 - 1e-7)
  const absorbingIndices: number[] = [];
  const transientIndices: number[] = [];
  for (let i = 0; i < n; i += 1) {
    if (Math.abs(P[i][i] - 1) < 1e-7) absorbingIndices.push(i);
    else transientIndices.push(i);
  }

  const tables: ResultTable[] = [
    {
      id: 'markov-trajectory',
      title: `Distribusi Probabilitas State hingga Langkah ke-${steps}`,
      headers: ['Langkah (t)', ...input.stateNames],
      rows: trajectory.map((vec, t) => [t, ...vec.map((v) => roundTo(v, 4))]),
    },
  ];

  const derivedValues: Record<string, number | string> = {};
  input.stateNames.forEach((name, j) => {
    derivedValues[`step${steps}_${name}`] = roundTo(curr[j], 4);
  });

  let steadyStateSummary = '';
  const kpis: KpiMetric[] = [
    { label: 'Jumlah State', value: n },
    { label: 'Horizon Langkah', value: steps },
  ];

  let analysisHeadline = `Proyeksi Rantai Markov ${n} State pada Langkah ke-${steps}`;
  let analysisInterpretation = `Simulasi transisi probabilistik selama ${steps} langkah telah diselesaikan dari distribusi awal π₀.`;
  const analysisSections: { heading: string; body: string; tone?: 'neutral' | 'positive' | 'caution' | 'critical' }[] = [];
  const analysisRecommendations: string[] = [];

  if (absorbingIndices.length === n) {
    // All-absorbing identity chain
    warnings.push('Seluruh state bersifat absorbing (P = I); distribusi probabilitas konstan sama dengan π₀.');
    steadyStateSummary = `Seluruh ${n} state bersifat absorbing (matriks identitas); distribusi tetap sama dengan kondisi awal π₀.`;
    kpis.push({ label: 'Tipe Rantai', value: 'All-Absorbing (I)', emphasis: 'warning' });
    input.stateNames.forEach((name, j) => {
      derivedValues[`steady_${name}`] = roundTo(pi0[j], 4);
    });
    analysisHeadline = 'Seluruh State Bersifat Absorbing (Tidak Ada Perpindahan Antar-State)';
    analysisInterpretation = `Setiap baris matriks transisi memiliki P[i][i] = 1, sehingga sistem sepenuhnya statis dan distribusi pada setiap langkah t identik dengan distribusi awal π₀.`;
    analysisSections.push({
      heading: 'Struktur Matriks Identitas',
      body: 'Tidak terdapat state transien; setiap entitas terkunci selamanya pada state awalnya.',
      tone: 'caution',
    });
    analysisRecommendations.push('Periksa kembali matriks transisi jika sebenarnya diharapkan terjadi perpindahan probabilistik antar-state.');
  } else if (absorbingIndices.length > 0 && transientIndices.length > 0) {
    // Absorbing Markov Chain: N = (I - Q)^(-1), B = N * R
    const iMinusQ = transientIndices.map((ti, r) =>
      transientIndices.map((tj, c) => (r === c ? 1 : 0) - P[ti][tj]),
    );
    const fundamental = invertMatrix(iMinusQ);

    if (fundamental) {
      const rMat = transientIndices.map((ti) => absorbingIndices.map((aj) => P[ti][aj]));
      const bMat = multiplyMatrices(fundamental, rMat);
      const expectedSteps = fundamental.map((row) => row.reduce((a, b) => a + b, 0));

      tables.push({
        id: 'markov-absorbing',
        title: 'Matriks Absorpsi (Probabilitas Penyerapan & Harapan Langkah)',
        headers: [
          'State Transien Awal',
          ...absorbingIndices.map((aj) => `P(→ ${input.stateNames[aj]})`),
          'Rata-rata Langkah hingga Absorpsi',
        ],
        rows: transientIndices.map((ti, idx) => [
          input.stateNames[ti],
          ...bMat[idx].map((val) => `${roundTo(val * 100, 2)}%`),
          roundTo(expectedSteps[idx], 2),
        ]),
      });

      // Overall long-run absorption probabilities starting from initial vector pi0
      const overallAbsorb = absorbingIndices.map((aj, colIdx) => {
        let prob = pi0[aj];
        for (let r = 0; r < transientIndices.length; r += 1) {
          prob += pi0[transientIndices[r]] * bMat[r][colIdx];
        }
        return prob;
      });
      const expectedStepsFromInit = transientIndices.reduce(
        (acc, ti, r) => acc + pi0[ti] * expectedSteps[r],
        0,
      );

      absorbingIndices.forEach((aj, colIdx) => {
        derivedValues[`absorb_${input.stateNames[aj]}`] = roundTo(overallAbsorb[colIdx], 4);
      });
      derivedValues.expectedStepsFromInit = roundTo(expectedStepsFromInit, 4);

      const maxStepsIdx = expectedSteps.indexOf(Math.max(...expectedSteps));
      const dominantAbsIdx = overallAbsorb.indexOf(Math.max(...overallAbsorb));
      const dominantAbsName = input.stateNames[absorbingIndices[dominantAbsIdx]];

      steadyStateSummary = `Rantai Absorbing (${absorbingIndices.length} state penyerap). Dari π₀, peluang terbesar berakhir di "${dominantAbsName}" (${formatNum(overallAbsorb[dominantAbsIdx] * 100, 2)}%), rata-rata ${formatNum(expectedStepsFromInit, 2)} langkah.`;
      kpis.push(
        { label: 'Tipe Rantai', value: 'Absorbing Chain', emphasis: 'warning' },
        {
          label: 'Penyerapan Dominan (dari π₀)',
          value: `${dominantAbsName} (${formatNum(overallAbsorb[dominantAbsIdx] * 100, 1)}%)`,
          emphasis: 'primary',
        },
        { label: 'Rata-rata Langkah Absorpsi', value: formatNum(expectedStepsFromInit, 2), unit: 'langkah' },
      );

      analysisHeadline = `Rantai Absorbing: ${formatNum(overallAbsorb[dominantAbsIdx] * 100, 1)}% Akhirnya Terserap ke "${dominantAbsName}" dalam ~${formatNum(expectedStepsFromInit, 2)} Langkah`;
      analysisInterpretation = `Sistem memiliki ${absorbingIndices.length} state penyerap (${absorbingIndices.map((i) => input.stateNames[i]).join(', ')}) dan ${transientIndices.length} state transien (${transientIndices.map((i) => input.stateNames[i]).join(', ')}). Menggunakan Matriks Fundamental N = (I - Q)⁻¹ dan Matriks Absorpsi B = N·R, distribusi akhir jangka panjang dari π₀ adalah: ${absorbingIndices.map((aj, k) => `${input.stateNames[aj]} = ${formatNum(overallAbsorb[k] * 100, 2)}%`).join(', ')}.`;
      analysisSections.push({
        heading: 'Durasi State Transien (Matriks Fundamental N)',
        body: `State transien dengan masa tinggal terlama sebelum terserap adalah "${input.stateNames[transientIndices[maxStepsIdx]]}" dengan rata-rata ${formatNum(expectedSteps[maxStepsIdx], 2)} langkah. Dari vektor awal π₀, sistem membutuhkan rata-rata ${formatNum(expectedStepsFromInit, 2)} langkah hingga seluruh entitas mencapai state penyerap.`,
        tone: 'neutral',
      });
      analysisRecommendations.push(
        `Fokuskan intervensi kebijakan pada baris transisi state transien "${input.stateNames[transientIndices[maxStepsIdx]]}" karena perubahan kecil pada probabilitas keluarnya paling besar pengaruhnya terhadap proporsi penyerapan akhir.`,
        'Jika salah satu state penyerap merepresentasikan kegagalan/piutang macet (bad debt), gunakan hasil B = N·R untuk menghitung cadangan kerugian ekspektasi secara akurat per kategori awal.',
      );
    } else {
      warnings.push('Matriks (I - Q) bersifat singular: terdapat sub-kelas state non-absorbing tertutup yang tidak pernah menuju state absorbing.');
      steadyStateSummary = 'Rantai memiliki state absorbing, namun terdapat kelas rekuren tertutup (I - Q singular).';
      kpis.push({ label: 'Tipe Rantai', value: 'Reducible / Singular', emphasis: 'danger' });
      analysisHeadline = 'Rantai Reducible — Matriks Fundamental (I - Q) Singular';
      analysisInterpretation = 'Terdapat satu atau lebih kelompok state non-absorbing yang saling bertransisi di antara mereka sendiri tanpa jalur keluar menuju state absorbing, sehingga matriks (I - Q) tidak dapat diinvers.';
      analysisSections.push({
        heading: 'Diagnosis Topologi Transisi',
        body: 'Periksa baris state transien yang tidak memiliki probabilitas positif (langsung maupun tidak langsung) menuju state absorbing.',
        tone: 'critical',
      });
      analysisRecommendations.push('Pastikan setiap state transien memiliki lintasan berpeluang positif menuju minimal satu state absorbing, atau analisis sub-kelas rekurennya secara terpisah.');
    }
  } else {
    // Ergodic / Regular steady-state: solve (P^T - I)*pi = 0 with sum(pi) = 1
    const sysA = Array.from({ length: n }, (_, row) =>
      Array.from({ length: n }, (_, col) => {
        if (row === n - 1) return 1;
        return P[col][row] - (row === col ? 1 : 0);
      }),
    );
    const sysB = Array.from({ length: n }, (_, row) => (row === n - 1 ? 1 : 0));
    const steady = solveLinearSystem(sysA, sysB);

    const isResidualValid = (vec: number[]): boolean => {
      const next = multiplyVectorMatrix(vec, P);
      return next.every((v, j) => Math.abs(v - vec[j]) < 1e-4);
    };

    if (steady && steady.every((v) => v >= -1e-6) && isResidualValid(steady.map((v) => Math.max(0, v)))) {
      const rawClean = steady.map((v) => Math.max(0, v));
      const sSum = rawClean.reduce((a, b) => a + b, 0) || 1;
      const cleanSteady = rawClean.map((v) => v / sSum);
      const l1Gap = cleanSteady.reduce((acc, s, j) => acc + Math.abs(curr[j] - s), 0);

      tables.push({
        id: 'markov-steady',
        title: 'Probabilitas Steady-State (Jangka Panjang)',
        headers: ['State', 'Probabilitas Awal (π₀)', `Langkah ke-${steps}`, 'Steady-State (π*)', 'Perubahan (π* - π₀)'],
        rows: input.stateNames.map((name, j) => [
          name,
          `${roundTo(pi0[j] * 100, 2)}%`,
          `${roundTo(curr[j] * 100, 2)}%`,
          `${roundTo(cleanSteady[j] * 100, 2)}% (${roundTo(cleanSteady[j], 4)})`,
          `${cleanSteady[j] - pi0[j] >= 0 ? '+' : ''}${roundTo((cleanSteady[j] - pi0[j]) * 100, 2)}%`,
        ]),
        highlightRowIndices: [cleanSteady.indexOf(Math.max(...cleanSteady))],
      });

      const dominantIdx = cleanSteady.indexOf(Math.max(...cleanSteady));
      const deltas = cleanSteady.map((s, j) => ({ name: input.stateNames[j], delta: s - pi0[j], retention: P[j][j] }));
      const biggestGainer = [...deltas].sort((a, b) => b.delta - a.delta)[0];
      const biggestLoser = [...deltas].sort((a, b) => a.delta - b.delta)[0];

      steadyStateSummary = `Steady-state dominan pada "${input.stateNames[dominantIdx]}" (${formatNum(cleanSteady[dominantIdx] * 100, 2)}%).`;
      kpis.push(
        {
          label: 'State Dominan (Steady-State)',
          value: `${input.stateNames[dominantIdx]} (${formatNum(cleanSteady[dominantIdx] * 100, 1)}%)`,
          emphasis: 'primary',
        },
        {
          label: `Jarak ke Ekuilibrium (t=${steps})`,
          value: `${formatNum(l1Gap * 100, 2)}%`,
          emphasis: l1Gap < 0.02 ? 'success' : 'warning',
        },
      );
      input.stateNames.forEach((name, j) => {
        derivedValues[`steady_${name}`] = roundTo(cleanSteady[j], 4);
      });
      derivedValues.l1ConvergenceGap = roundTo(l1Gap, 6);

      analysisHeadline = `Keseimbangan Jangka Panjang (Steady-State) Didominasi "${input.stateNames[dominantIdx]}" (${formatNum(cleanSteady[dominantIdx] * 100, 1)}%)`;
      analysisInterpretation = `Rantai Markov bersifat ergodik dengan solusi steady-state unik yang independen terhadap distribusi awal π₀. Dalam jangka panjang, distribusi konvergen ke: ${input.stateNames.map((nm, j) => `${nm} = ${formatNum(cleanSteady[j] * 100, 2)}%`).join(', ')}.`;
      analysisSections.push(
        {
          heading: 'Pergeseran Pangsa / Proporsi (π₀ → π*)',
          body: `Peningkatan terbesar dialami "${biggestGainer.name}" (${biggestGainer.delta >= 0 ? '+' : ''}${formatNum(biggestGainer.delta * 100, 2)} poin persen, retensi diri ${formatNum(biggestGainer.retention * 100, 1)}%), sementara penurunan terbesar terjadi pada "${biggestLoser.name}" (${biggestLoser.delta >= 0 ? '+' : ''}${formatNum(biggestLoser.delta * 100, 2)} poin persen, retensi diri ${formatNum(biggestLoser.retention * 100, 1)}%).`,
          tone: biggestLoser.delta < -0.05 ? 'caution' : 'neutral',
        },
        {
          heading: 'Kecepatan Konvergensi',
          body:
            l1Gap < 0.02
              ? `Pada langkah ke-${steps}, deviasi total L1 terhadap steady-state tinggal ${formatNum(l1Gap * 100, 2)}% — sistem praktis sudah mencapai kondisi ekuilibrium.`
              : `Pada langkah ke-${steps}, deviasi L1 terhadap steady-state masih ${formatNum(l1Gap * 100, 2)}% — sistem masih dalam fase transisi; tambah jumlah langkah untuk melihat titik konvergensi penuh.`,
          tone: l1Gap < 0.02 ? 'positive' : 'neutral',
        },
      );
      analysisRecommendations.push(
        `Karena steady-state tidak bergantung pada π₀, satu-satunya cara mengubah keseimbangan jangka panjang (mis. meningkatkan porsi "${biggestLoser.name}") adalah memperbaiki matriks transisi P — menaikkan retensi diagonal P[i][i] atau menarik perpindahan dari "${input.stateNames[dominantIdx]}".`,
        'Lakukan simulasi sensitivitas dengan menaikkan retensi sebesar +5% pada state target untuk mengkuantifikasi dampak terhadap keseimbangan jangka panjang.',
      );
    } else {
      warnings.push('Rantai Markov tidak memiliki steady-state tunggal (reducible / multi-kelas tertutup atau periodik).');
      steadyStateSummary = `Simulasi ${steps} langkah selesai (steady-state tunggal tidak ada — rantai reducible).`;
      kpis.push({ label: 'Tipe Rantai', value: 'Reducible / Multi-Kelas', emphasis: 'warning' });
      analysisHeadline = 'Rantai Reducible — Tidak Terdapat Steady-State Tunggal';
      analysisInterpretation = `Sistem memiliki beberapa kelas tertutup yang terpisah sehingga distribusi jangka panjang bergantung pada bobot kondisi awal π₀ di masing-masing kelas. Gunakan tabel proyeksi langkah ke-${steps} untuk melihat evolusi sistem.`;
      analysisSections.push({
        heading: 'Implikasi Struktural',
        body: 'Matriks (Pᵀ - I) memiliki lebih dari satu vektor eigen bernilai 1, menandakan state-state terbagi ke dalam sub-sistem independen.',
        tone: 'caution',
      });
      analysisRecommendations.push('Pisahkan analisis per sub-kelas tertutup atau verifikasi apakah ada entri probabilitas transisi bernilai 0 yang seharusnya positif.');
    }
  }

  return {
    jobId,
    moduleId: 'markov-analysis',
    jobTitle,
    status: warnings.length > 0 ? 'warning' : 'success',
    executionMs: roundTo(performance.now() - start, 2),
    summaryText: steadyStateSummary || `Simulasi rantai Markov ${n} state selama ${steps} langkah selesai.`,
    kpis,
    tables,
    charts: [
      {
        kind: 'line',
        id: 'markov-chart',
        title: 'Evolusi Probabilitas State Rantai Markov',
        xLabel: 'Langkah (t)',
        yLabel: 'Probabilitas',
        series: input.stateNames.map((name, idx) => ({
          name,
          colorToken: `var(--chart-${(idx % 6) + 1})`,
          points: trajectory.map((vec, t) => ({ x: t, y: roundTo(vec[idx], 4) })),
        })),
      },
    ],
    warnings,
    auditSteps: [
      {
        title: '1. Proyeksi Transisi n-Langkah & Steady-State / Absorpsi',
        formula: absorbingIndices.length > 0 && transientIndices.length > 0 ? 'N = (I - Q)⁻¹ · B = N × R' : 'π(t) = π₀ × Pᵗ · π* × P = π* (∑πᵢ = 1)',
        detail: steadyStateSummary || `Dihitung ${steps} langkah rantai Markov untuk ${n} state.`,
      },
    ],
    analysis: {
      headline: analysisHeadline,
      interpretation: analysisInterpretation,
      sections: analysisSections,
      recommendations: analysisRecommendations,
    },
    derivedValues,
  };
}
