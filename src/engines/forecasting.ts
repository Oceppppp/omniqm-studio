import { formatNum, roundTo } from '../core/math/matrix.ts';
import type {
  ForecastingInput,
  ModuleExecutionResult,
  ResultTable,
} from '../core/types/module.types.ts';

interface MethodEvaluation {
  name: string;
  fitted: (number | null)[];
  future: number[];
  mad: number;
  mse: number;
  rmse: number;
  mape: number;
  bias: number;
  trackingSignal: number;
}

function evaluateErrors(
  actual: number[],
  fitted: (number | null)[],
  future: number[],
  name: string,
): MethodEvaluation {
  let count = 0;
  let sumErr = 0;
  let sumAbs = 0;
  let sumSq = 0;
  let sumPct = 0;
  let pctCount = 0;

  for (let i = 0; i < actual.length; i += 1) {
    const f = fitted[i];
    if (f === null || !Number.isFinite(f)) continue;
    const err = actual[i] - f;
    count += 1;
    sumErr += err;
    sumAbs += Math.abs(err);
    sumSq += err * err;
    if (Math.abs(actual[i]) > 1e-9) {
      sumPct += (Math.abs(err) / Math.abs(actual[i])) * 100;
      pctCount += 1;
    }
  }

  const mad = count > 0 ? sumAbs / count : Infinity;
  const mse = count > 0 ? sumSq / count : Infinity;
  const rmse = Number.isFinite(mse) ? Math.sqrt(mse) : Infinity;
  const mape = pctCount > 0 ? sumPct / pctCount : Infinity;
  const bias = count > 0 ? sumErr / count : 0;
  const trackingSignal = mad > 1e-9 && Number.isFinite(mad) ? sumErr / mad : 0;

  return { name, fitted, future, mad, mse, rmse, mape, bias, trackingSignal };
}

export function solveForecasting(
  jobId: string,
  jobTitle: string,
  input: ForecastingInput,
): ModuleExecutionResult {
  const start = performance.now();
  const y = input.values;
  const n = y.length;
  const horizon = Math.max(1, input.horizon || 1);

  if (n < 3) {
    return {
      jobId,
      moduleId: 'forecasting',
      jobTitle,
      status: 'error',
      executionMs: 0,
      summaryText: 'Data historis peramalan minimal membutuhkan 3 periode.',
      kpis: [],
      tables: [],
      charts: [],
      warnings: ['Tambahkan minimal 3 titik data historis.'],
      derivedValues: {},
      error: 'Minimal 3 titik data diperlukan untuk peramalan.',
    };
  }

  const methods: MethodEvaluation[] = [];

  // 1. Naive
  const naiveFitted: (number | null)[] = y.map((_, i) => (i === 0 ? null : y[i - 1]));
  const naiveFuture = Array<number>(horizon).fill(y[n - 1]);
  methods.push(evaluateErrors(y, naiveFitted, naiveFuture, 'Naive'));

  // 2. Simple Moving Average
  const k = Math.max(2, Math.min(n - 1, Math.round(input.movingAvgWindow || 3)));
  const smaFitted: (number | null)[] = y.map((_, i) => {
    if (i < k) return null;
    let sum = 0;
    for (let j = i - k; j < i; j += 1) sum += y[j];
    return sum / k;
  });
  const lastKAvg = y.slice(n - k).reduce((a, b) => a + b, 0) / k;
  methods.push(
    evaluateErrors(
      y,
      smaFitted,
      Array<number>(horizon).fill(lastKAvg),
      `Moving Average (k=${k})`,
    ),
  );

  // 3. Weighted Moving Average
  const rawWeights =
    (input.weightedWeights?.length ?? 0) > 0 ? input.weightedWeights : [0.5, 0.3, 0.2];
  const kw = Math.max(1, Math.min(rawWeights.length, n - 1));
  const slicedWeights = rawWeights.slice(0, kw);
  const wSum = slicedWeights.reduce((a, b) => a + b, 0) || 1;
  const weights = slicedWeights.map((w) => w / wSum); // weights[0] applies to most recent
  const wmaFitted: (number | null)[] = y.map((_, i) => {
    if (i < kw) return null;
    let val = 0;
    for (let offset = 0; offset < kw; offset += 1) {
      val += y[i - 1 - offset] * weights[offset];
    }
    return val;
  });
  let wmaNext = 0;
  for (let offset = 0; offset < kw; offset += 1) {
    wmaNext += y[n - 1 - offset] * weights[offset];
  }
  methods.push(
    evaluateErrors(
      y,
      wmaFitted,
      Array<number>(horizon).fill(wmaNext),
      `Weighted MA (${kw} periode)`,
    ),
  );

  // 4. Simple Exponential Smoothing (SES)
  let sesAlpha = Math.max(0.01, Math.min(0.99, input.alpha || 0.3));
  const runSes = (a: number) => {
    const fitted: (number | null)[] = [null];
    let lvl = y[0];
    for (let i = 1; i < n; i += 1) {
      fitted.push(lvl);
      lvl = a * y[i] + (1 - a) * lvl;
    }
    return { fitted, lastLevel: lvl };
  };

  let tunedNote = '';
  if (input.autoOptimize) {
    let bestMad = Infinity;
    let bestA = sesAlpha;
    for (let a = 0.05; a <= 0.951; a += 0.05) {
      const roundedA = roundTo(a, 2);
      const { fitted, lastLevel } = runSes(roundedA);
      const ev = evaluateErrors(y, fitted, [lastLevel], 'temp');
      if (ev.mad < bestMad) {
        bestMad = ev.mad;
        bestA = roundedA;
      }
    }
    sesAlpha = bestA;
    tunedNote = `α*=${bestA}`;
  }

  const sesRes = runSes(sesAlpha);
  methods.push(
    evaluateErrors(
      y,
      sesRes.fitted,
      Array<number>(horizon).fill(sesRes.lastLevel),
      `Exponential Smoothing (α=${sesAlpha}${input.autoOptimize ? ', Auto' : ''})`,
    ),
  );

  // 5. Holt's Trend-Adjusted Exponential Smoothing
  let holtAlpha = Math.max(0.01, Math.min(0.99, input.alpha || 0.3));
  let holtBeta = Math.max(0.01, Math.min(0.99, input.beta || 0.2));
  const runHolt = (a: number, b: number) => {
    const fitted: (number | null)[] = [null];
    let hLevel = y[0];
    let hTrend = y[1] - y[0];
    for (let i = 1; i < n; i += 1) {
      fitted.push(hLevel + hTrend);
      const prevLevel = hLevel;
      hLevel = a * y[i] + (1 - a) * (hLevel + hTrend);
      hTrend = b * (hLevel - prevLevel) + (1 - b) * hTrend;
    }
    const future = Array.from({ length: horizon }, (_, h) => hLevel + (h + 1) * hTrend);
    return { fitted, future };
  };

  if (input.autoOptimize) {
    let bestMad = Infinity;
    let bestA = holtAlpha;
    let bestB = holtBeta;
    for (let a = 0.1; a <= 0.91; a += 0.1) {
      for (let b = 0.1; b <= 0.91; b += 0.1) {
        const ra = roundTo(a, 2);
        const rb = roundTo(b, 2);
        const { fitted, future } = runHolt(ra, rb);
        const ev = evaluateErrors(y, fitted, future, 'temp');
        if (ev.mad < bestMad) {
          bestMad = ev.mad;
          bestA = ra;
          bestB = rb;
        }
      }
    }
    holtAlpha = bestA;
    holtBeta = bestB;
    tunedNote = `${tunedNote ? `${tunedNote}; ` : ''}Holt(α*=${bestA}, β*=${bestB})`;
  }

  const holtRes = runHolt(holtAlpha, holtBeta);
  methods.push(
    evaluateErrors(
      y,
      holtRes.fitted,
      holtRes.future,
      `Trend Exp. Smoothing (α=${holtAlpha}, β=${holtBeta}${input.autoOptimize ? ', Auto' : ''})`,
    ),
  );

  // 6. Linear Trend Regression (Y = a + b*t, t = 1..n)
  const sumT = (n * (n + 1)) / 2;
  const sumT2 = (n * (n + 1) * (2 * n + 1)) / 6;
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumTY = y.reduce((acc, val, idx) => acc + (idx + 1) * val, 0);
  const denom = n * sumT2 - sumT * sumT;
  const slope = Math.abs(denom) > 1e-9 ? (n * sumTY - sumT * sumY) / denom : 0;
  const intercept = (sumY - slope * sumT) / n;
  const regFitted = y.map((_, idx) => intercept + slope * (idx + 1));
  const regFuture = Array.from({ length: horizon }, (_, h) => intercept + slope * (n + h + 1));
  methods.push(evaluateErrors(y, regFitted, regFuture, 'Linear Trend / Regresi'));

  // 7. Classical Seasonal Decomposition & Holt-Winters (when seasonalPeriod >= 2)
  const tables: ResultTable[] = [];
  const L = input.seasonalPeriod ? Math.round(input.seasonalPeriod) : 0;
  const seasonalMode = input.seasonalType ?? 'multiplicative';
  let seasonalIndices: number[] | null = null;

  if (L >= 2 && n >= L) {
    const rawBuckets: number[][] = Array.from({ length: L }, () => []);
    for (let i = 0; i < n; i += 1) {
      const tr = regFitted[i];
      if (seasonalMode === 'multiplicative') {
        rawBuckets[i % L].push(Math.abs(tr) > 1e-6 ? y[i] / tr : 1);
      } else {
        rawBuckets[i % L].push(y[i] - tr);
      }
    }

    const rawAvg = rawBuckets.map((b) =>
      b.length > 0 ? b.reduce((s, v) => s + v, 0) / b.length : seasonalMode === 'multiplicative' ? 1 : 0,
    );

    if (seasonalMode === 'multiplicative') {
      const avgFactor = rawAvg.reduce((s, v) => s + v, 0) / L || 1;
      seasonalIndices = rawAvg.map((v) => v / avgFactor);
    } else {
      const meanOffset = rawAvg.reduce((s, v) => s + v, 0) / L;
      seasonalIndices = rawAvg.map((v) => v - meanOffset);
    }

    const decFitted = y.map((_, i) =>
      seasonalMode === 'multiplicative'
        ? regFitted[i] * seasonalIndices![i % L]
        : regFitted[i] + seasonalIndices![i % L],
    );
    const decFuture = Array.from({ length: horizon }, (_, h) => {
      const sIdx = seasonalIndices![(n + h) % L];
      return seasonalMode === 'multiplicative' ? regFuture[h] * sIdx : regFuture[h] + sIdx;
    });
    methods.push(
      evaluateErrors(
        y,
        decFitted,
        decFuture,
        `Dekomposisi Musiman (${seasonalMode === 'multiplicative' ? 'Mult' : 'Add'}, L=${L})`,
      ),
    );

    if (n >= L * 2) {
      const gamma = Math.max(0.01, Math.min(0.99, input.gamma ?? 0.3));
      const seasonFactors = [...seasonalIndices];
      let hwLevel = y.slice(0, L).reduce((a, b) => a + b, 0) / L;
      let hwTrend =
        (y.slice(L, L * 2).reduce((a, b) => a + b, 0) / L - hwLevel) / L;
      const hwFitted: (number | null)[] = Array<number | null>(L).fill(null);

      for (let i = L; i < n; i += 1) {
        const s = i % L;
        const pred =
          seasonalMode === 'multiplicative'
            ? (hwLevel + hwTrend) * (Math.abs(seasonFactors[s]) > 1e-6 ? seasonFactors[s] : 1)
            : hwLevel + hwTrend + seasonFactors[s];
        hwFitted.push(pred);

        const prevLvl = hwLevel;
        if (seasonalMode === 'multiplicative') {
          const sf = Math.abs(seasonFactors[s]) > 1e-6 ? seasonFactors[s] : 1;
          hwLevel = holtAlpha * (y[i] / sf) + (1 - holtAlpha) * (hwLevel + hwTrend);
          hwTrend = holtBeta * (hwLevel - prevLvl) + (1 - holtBeta) * hwTrend;
          seasonFactors[s] = gamma * (y[i] / Math.max(1e-6, hwLevel)) + (1 - gamma) * sf;
        } else {
          hwLevel = holtAlpha * (y[i] - seasonFactors[s]) + (1 - holtAlpha) * (hwLevel + hwTrend);
          hwTrend = holtBeta * (hwLevel - prevLvl) + (1 - holtBeta) * hwTrend;
          seasonFactors[s] = gamma * (y[i] - hwLevel) + (1 - gamma) * seasonFactors[s];
        }
      }

      const hwFuture = Array.from({ length: horizon }, (_, h) => {
        const sf = seasonFactors[(n + h) % L];
        return seasonalMode === 'multiplicative'
          ? (hwLevel + (h + 1) * hwTrend) * sf
          : hwLevel + (h + 1) * hwTrend + sf;
      });
      methods.push(
        evaluateErrors(
          y,
          hwFitted,
          hwFuture,
          `Holt-Winters (${seasonalMode === 'multiplicative' ? 'Mult' : 'Add'}, L=${L})`,
        ),
      );
    }
  }

  // Pick best method by lowest MAD (tiebreak MSE)
  const ranked = [...methods].sort((a, b) => a.mad - b.mad || a.mse - b.mse);
  const best = ranked[0];

  const compTable: ResultTable = {
    id: 'forecast-comparison',
    title: 'Perbandingan Akurasi Metode Peramalan',
    headers: ['Metode', 'MAD', 'MSE', 'RMSE', 'MAPE (%)', 'Bias', 'Tracking Signal', 'Ramalan Berikutnya'],
    rows: ranked.map((m) => [
      m.name,
      roundTo(m.mad, 3),
      roundTo(m.mse, 3),
      roundTo(m.rmse, 3),
      Number.isFinite(m.mape) ? `${roundTo(m.mape, 2)}%` : 'N/A',
      roundTo(m.bias, 3),
      roundTo(m.trackingSignal, 2),
      roundTo(m.future[0], 2),
    ]),
    highlightRowIndices: [0],
  };

  const futureLabels = Array.from({ length: horizon }, (_, i) => `Forecast +${i + 1}`);
  const detailTable: ResultTable = {
    id: 'forecast-series',
    title: `Detail Aktual vs Ramalan (${best.name})`,
    headers: ['Periode', 'Aktual', 'Ramalan Terbaik', 'Error (A - F)', 'Regresi Tren'],
    rows: [
      ...y.map((val, i) => {
        const bf = best.fitted[i];
        return [
          input.periodLabels[i] ?? `P${i + 1}`,
          roundTo(val, 2),
          bf !== null ? roundTo(bf, 2) : '-',
          bf !== null ? roundTo(val - bf, 2) : '-',
          roundTo(regFitted[i], 2),
        ];
      }),
      ...futureLabels.map((lbl, h) => [
        lbl,
        '-',
        roundTo(best.future[h], 2),
        '-',
        roundTo(regFuture[h], 2),
      ]),
    ],
  };

  tables.push(compTable, detailTable);

  if (seasonalIndices) {
    tables.push({
      id: 'forecast-seasonal-indices',
      title: `Indeks Musiman (${seasonalMode === 'multiplicative' ? 'Multiplikatif' : 'Aditif'}, Panjang Siklus L=${L})`,
      headers: ['Sub-Periode Siklus', 'Contoh Label', 'Indeks / Faktor Musiman'],
      rows: seasonalIndices.map((idxVal, sIdx) => [
        `Musim ${sIdx + 1}`,
        input.periodLabels[sIdx] ?? `P${sIdx + 1}`,
        roundTo(idxVal, 4),
      ]),
    });
  }

  const allLabels = [...input.periodLabels.slice(0, n), ...futureLabels];
  const chartSeries = [
    {
      name: 'Data Aktual',
      colorToken: 'var(--chart-1)',
      points: y.map((val, i) => ({ x: allLabels[i] ?? `P${i + 1}`, y: roundTo(val, 2) })),
    },
    {
      name: `Terbaik: ${best.name}`,
      colorToken: 'var(--chart-2)',
      points: [
        ...best.fitted
          .map((f, i) => (f !== null ? { x: allLabels[i] ?? `P${i + 1}`, y: roundTo(f, 2) } : null))
          .filter((p): p is NonNullable<typeof p> => p !== null),
        ...best.future.map((f, h) => ({ x: futureLabels[h], y: roundTo(f, 2) })),
      ],
    },
    {
      name: 'Regresi Tren',
      colorToken: 'var(--chart-3)',
      dashed: true,
      points: [
        ...regFitted.map((f, i) => ({ x: allLabels[i] ?? `P${i + 1}`, y: roundTo(f, 2) })),
        ...regFuture.map((f, h) => ({ x: futureLabels[h], y: roundTo(f, 2) })),
      ],
    },
  ];

  const yMean = sumY / n;
  const ssTot = y.reduce((s, val) => s + (val - yMean) ** 2, 0);
  const ssRes = y.reduce((s, val, i) => s + (val - regFitted[i]) ** 2, 0);
  const rSquared = ssTot > 1e-9 ? Math.max(0, 1 - ssRes / ssTot) : 1;

  const runnerUp = ranked[1];
  const mapeGrade =
    !Number.isFinite(best.mape)
      ? 'tidak terdefinisi (terdapat nilai aktual 0)'
      : best.mape < 10
        ? 'sangat akurat (MAPE < 10%)'
        : best.mape < 20
          ? 'baik (MAPE 10–20%)'
          : best.mape < 50
            ? 'cukup wajar (MAPE 20–50%)'
            : 'kurang akurat (MAPE > 50%)';
  const tsAbs = Math.abs(best.trackingSignal);
  const tsWarning = tsAbs > 4;
  const warnings: string[] = tsWarning
    ? [
        `Tracking Signal metode "${best.name}" bernilai ${roundTo(best.trackingSignal, 2)} (di luar batas kendali ±4), menandakan potensi bias sistematis.`,
      ]
    : [];

  let seasonalInsight = '';
  if (seasonalIndices && seasonalIndices.length >= 2) {
    const peakIdx = seasonalIndices.indexOf(Math.max(...seasonalIndices));
    const troughIdx = seasonalIndices.indexOf(Math.min(...seasonalIndices));
    seasonalInsight = ` Pola musiman (L=${L}, ${seasonalMode}) memuncak pada Musim ${peakIdx + 1} (${roundTo(seasonalIndices[peakIdx], 3)}) dan terendah pada Musim ${troughIdx + 1} (${roundTo(seasonalIndices[troughIdx], 3)}).`;
  }

  const elapsed = roundTo(performance.now() - start, 2);

  return {
    jobId,
    moduleId: 'forecasting',
    jobTitle,
    status: warnings.length > 0 ? 'warning' : 'success',
    executionMs: elapsed,
    summaryText: `Metode terbaik: ${best.name} (MAD=${formatNum(best.mad, 2)}, MAPE=${formatNum(best.mape, 2)}%). Ramalan periode depan: ${formatNum(best.future[0], 2)}.${tunedNote ? ` [Auto-Tune: ${tunedNote}]` : ''}`,
    kpis: [
      { label: 'Metode Terbaik (MAD Terkecil)', value: best.name, emphasis: 'success' },
      { label: 'Ramalan Periode +1', value: formatNum(best.future[0], 2), emphasis: 'primary' },
      { label: 'MAD Terbaik', value: formatNum(best.mad, 2) },
      { label: 'MAPE Terbaik', value: Number.isFinite(best.mape) ? `${formatNum(best.mape, 2)}%` : 'N/A' },
    ],
    tables,
    charts: [
      {
        kind: 'line',
        id: 'forecast-chart',
        title: 'Grafik Historis & Proyeksi Peramalan',
        subtitle: `Persamaan Tren: Y = ${formatNum(intercept, 2)} + ${formatNum(slope, 2)}t (R² = ${roundTo(rSquared, 3)})`,
        xLabel: 'Periode',
        yLabel: 'Nilai',
        series: chartSeries,
      },
    ],
    warnings,
    auditSteps: [
      {
        title: '1. Regresi Tren Linear',
        formula: `Ŷ(t) = ${formatNum(intercept, 2)} + ${formatNum(slope, 2)}·t · R² = ${roundTo(rSquared, 4)}`,
        detail: `Dihitung atas ${n} titik historis menggunakan metode kuadrat terkecil (OLS).`,
      },
      {
        title: '2. Evaluasi Error & Seleksi Metode',
        formula: 'MAD = ∑|Yₜ - Ŷₜ| / k · MSE = ∑(Yₜ - Ŷₜ)² / k · MAPE = 100% × ∑|eₜ/Yₜ| / k',
        detail: `Metode terpilih "${best.name}" memiliki MAD terkecil (${formatNum(best.mad, 3)}) dan Tracking Signal ${formatNum(best.trackingSignal, 2)}.`,
      },
      ...(tunedNote
        ? [
            {
              title: '3. Auto-Optimize Parameter Smoothing (Grid Search)',
              formula: tunedNote,
              detail: 'Grid search mengevaluasi kombinasi α ∈ [0.05..0.95] dan β ∈ [0.1..0.9] untuk meminimalkan MAD historis.',
            },
          ]
        : []),
    ],
    analysis: {
      headline: `"${best.name}" Terpilih dengan Akurasi ${mapeGrade}`,
      interpretation: `Dari ${methods.length} metode yang diuji atas ${n} periode historis, "${best.name}" mencatat galat absolut terkecil (MAD = ${formatNum(best.mad, 2)}, RMSE = ${formatNum(best.rmse, 2)}, MAPE = ${Number.isFinite(best.mape) ? `${formatNum(best.mape, 2)}%` : 'N/A'}), memproyeksikan permintaan periode +1 sebesar ${formatNum(best.future[0], 2)} (proyeksi ${horizon} periode: ${best.future.map((v) => formatNum(v, 1)).join(' → ')}).`,
      sections: [
        {
          heading: 'Pola Tren & Kekuatan Determinasi (R²)',
          body: `Persamaan regresi linear menunjukkan arah tren ${
            Math.abs(slope) < 0.01 * Math.max(1, Math.abs(yMean))
              ? 'stasioner / datar'
              : slope > 0
                ? `naik sebesar +${formatNum(slope, 2)} unit/periode`
                : `turun sebesar ${formatNum(slope, 2)} unit/periode`
          } dengan R² = ${formatNum(rSquared * 100, 1)}% (${
            rSquared >= 0.75 ? 'tren linear dominan' : rSquared >= 0.4 ? 'tren moderat dengan fluktuasi' : 'fluktuasi siklikal/acak dominan'
          }).${seasonalInsight}`,
          tone: 'neutral',
        },
        {
          heading: 'Stabilitas Bias & Tracking Signal',
          body: `Bias rata-rata = ${formatNum(best.bias, 2)} (${
            Math.abs(best.bias) < best.mad * 0.15
              ? 'hampir tanpa bias'
              : best.bias > 0
                ? 'cenderung under-forecast (aktual > ramalan)'
                : 'cenderung over-forecast (ramalan > aktual)'
          }) dengan Tracking Signal = ${formatNum(best.trackingSignal, 2)} (${
            tsWarning ? 'DI LUAR batas kendali ±4 — perlu kalibrasi ulang!' : 'aman dalam batas kendali ±4'
          }).`,
          tone: tsWarning ? 'caution' : 'positive',
        },
        ...(runnerUp
          ? [
              {
                heading: 'Komparasi Peringkat Kedua (Runner-Up)',
                body: `Metode terbaik kedua adalah "${runnerUp.name}" (MAD = ${formatNum(runnerUp.mad, 2)}, selisih +${formatNum(runnerUp.mad - best.mad, 2)} lebih besar dibanding pemenang). Selisih kecil menandakan kedua metode konsisten dalam memprediksi arah permintaan.`,
                tone: 'neutral' as const,
              },
            ]
          : []),
      ],
      recommendations: [
        `Gunakan proyeksi "${best.name}" (${formatNum(best.future[0], 2)} pada periode depan) sebagai masukan kapasitas Aggregate Planning / MRP, disertai cadangan safety stock sekitar ±${formatNum(1.25 * best.mad, 1)} unit (estimasi 1σ ≈ 1.25·MAD).`,
        ...(tsWarning
          ? [
              'Aktifkan fitur Auto-Optimize atau tambahkan komponen tren/musiman karena Tracking Signal telah melampaui batas ±4.',
            ]
          : [
              'Perbarui data aktual secara berkala setiap penutupan periode dan pantau agar Tracking Signal tetap dalam rentang [-4, +4].',
            ]),
      ],
    },
    derivedValues: {
      nextPeriodForecast: roundTo(best.future[0], 4),
      annualizedForecast12: roundTo(best.future[0] * 12, 4),
      horizonForecasts: best.future.map((v) => roundTo(v, 2)).join(', '),
      bestMethod: best.name,
      trendSlope: roundTo(slope, 4),
      rSquared: roundTo(rSquared, 4),
      bestMad: roundTo(best.mad, 4),
      tunedAlpha: sesAlpha,
      tunedBeta: holtBeta,
    },
  };
}

