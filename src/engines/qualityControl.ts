import { getSpcConstants, normalCdf } from '../core/math/distributions.ts';
import { formatNum, roundTo } from '../core/math/matrix.ts';
import type {
  KpiMetric,
  ModuleExecutionResult,
  QualityControlInput,
  ResultTable,
} from '../core/types/module.types.ts';

function detectWesternElectricRun(values: number[], centerLine: number, runLength = 7): string | null {
  let above = 0;
  let below = 0;
  for (let i = 0; i < values.length; i += 1) {
    if (values[i] > centerLine + 1e-9) {
      above += 1;
      below = 0;
    } else if (values[i] < centerLine - 1e-9) {
      below += 1;
      above = 0;
    } else {
      above = 0;
      below = 0;
    }
    if (above >= runLength) {
      return `Terdeteksi ${above} titik berurutan di atas garis tengah (Western Electric Run Rule — indikasi pergeseran mean naik).`;
    }
    if (below >= runLength) {
      return `Terdeteksi ${below} titik berurutan di bawah garis tengah (Western Electric Run Rule — indikasi pergeseran mean turun).`;
    }
  }
  return null;
}

export function solveQualityControl(
  jobId: string,
  jobTitle: string,
  input: QualityControlInput,
): ModuleExecutionResult {
  const start = performance.now();
  const samples = input.samples;

  if (samples.length === 0) {
    return {
      jobId,
      moduleId: 'quality-control',
      jobTitle,
      status: 'error',
      executionMs: 0,
      summaryText: 'Data sampel SPC kosong.',
      kpis: [],
      tables: [],
      charts: [],
      warnings: ['Tambahkan data sampel kendali kualitas.'],
      derivedValues: {},
      error: 'Data sampel SPC kosong.',
    };
  }

  if (input.chartType === 'xbar-r') {
    const n = Math.max(2, input.subgroupSize || samples[0].values.length || 4);
    const consts = getSpcConstants(n);

    const sampleStats = samples.map((s) => {
      const vals = s.values;
      const mean = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
      const range = vals.length > 0 ? Math.max(...vals) - Math.min(...vals) : 0;
      return { label: s.label, mean, range };
    });

    const xDoubleBar = sampleStats.reduce((a, b) => a + b.mean, 0) / sampleStats.length;
    const rBar = sampleStats.reduce((a, b) => a + b.range, 0) / sampleStats.length;

    const uclX = xDoubleBar + consts.a2 * rBar;
    const lclX = xDoubleBar - consts.a2 * rBar;
    const uclR = consts.d4 * rBar;
    const lclR = consts.d3 * rBar;

    const outX = sampleStats.filter((s) => s.mean > uclX || s.mean < lclX).map((s) => s.label);
    const outR = sampleStats.filter((s) => s.range > uclR || s.range < lclR).map((s) => s.label);
    const sigmaEst = rBar / consts.d2;

    const warnings: string[] = [];
    if (outX.length > 0) warnings.push(`Titik di luar batas kendali X-bar: ${outX.join(', ')}`);
    if (outR.length > 0) warnings.push(`Titik di luar batas kendali R-chart: ${outR.join(', ')}`);

    const runWarn = detectWesternElectricRun(
      sampleStats.map((s) => s.mean),
      xDoubleBar,
      7,
    );
    if (runWarn) warnings.push(runWarn);

    let cp: number | null = null;
    let cpk: number | null = null;
    let estPpm: number | null = null;
    if (typeof input.usl === 'number' && typeof input.lsl === 'number') {
      if (input.usl <= input.lsl) {
        warnings.push(`Batas spesifikasi tidak valid (USL=${input.usl} ≤ LSL=${input.lsl}); Cp dan Cpk tidak dihitung.`);
      } else if (sigmaEst > 1e-9) {
        cp = (input.usl - input.lsl) / (6 * sigmaEst);
        cpk = Math.min(
          (input.usl - xDoubleBar) / (3 * sigmaEst),
          (xDoubleBar - input.lsl) / (3 * sigmaEst),
        );
        const pBelow = normalCdf((input.lsl - xDoubleBar) / sigmaEst);
        const pAbove = 1 - normalCdf((input.usl - xDoubleBar) / sigmaEst);
        estPpm = Math.max(0, (pBelow + pAbove) * 1_000_000);
      }
    }

    const table: ResultTable = {
      id: 'spc-xbar-r',
      title: `Peta Kendali X-bar & R (n=${n}, A₂=${consts.a2}, D₃=${consts.d3}, D₄=${consts.d4})`,
      headers: ['Sampel', 'Rata-rata (X̄)', 'Status X̄', 'Range (R)', 'Status R'],
      rows: sampleStats.map((s) => [
        s.label,
        roundTo(s.mean, 4),
        s.mean > uclX || s.mean < lclX ? 'OUT OF CONTROL' : 'In Control',
        roundTo(s.range, 4),
        s.range > uclR || s.range < lclR ? 'OUT OF CONTROL' : 'In Control',
      ]),
      highlightRowIndices: sampleStats
        .map((s, idx) =>
          s.mean > uclX || s.mean < lclX || s.range > uclR || s.range < lclR ? idx : -1,
        )
        .filter((idx) => idx !== -1),
    };

    const totalOoc = outX.length + outR.length;
    const kpis: KpiMetric[] = [
      { label: 'Center Line X̄̄', value: formatNum(xDoubleBar, 3), emphasis: 'primary' },
      { label: 'Batas X̄ (LCL / UCL)', value: `${formatNum(lclX, 3)} / ${formatNum(uclX, 3)}` },
      { label: 'Center Line R̄', value: formatNum(rBar, 3) },
      {
        label: 'Status Proses',
        value: totalOoc === 0 && !runWarn ? 'In Control' : totalOoc > 0 ? `${totalOoc} Out-of-Control` : 'Run Shift',
        emphasis: totalOoc === 0 && !runWarn ? 'success' : 'warning',
      },
    ];
    if (cpk !== null && cp !== null) {
      kpis.push({
        label: 'Cp / Cpk',
        value: `${formatNum(cp, 2)} / ${formatNum(cpk, 2)}`,
        emphasis: cpk >= 1.33 ? 'success' : cpk >= 1.0 ? 'warning' : 'danger',
      });
    }

    const capLabel =
      cpk === null
        ? null
        : cpk >= 1.67
          ? 'Sangat Kapabel (Kelas Dunia / ≥5σ)'
          : cpk >= 1.33
            ? 'Kapabel (Memenuhi Standar Industri ≥4σ)'
            : cpk >= 1.0
              ? 'Marginal (Cukup ketat, berisiko cacat bila mean bergeser)'
              : 'Tidak Kapabel (<1.0, menghasilkan cacat melampaui spesifikasi)';

    const capOffset = cp !== null && cpk !== null ? cp - cpk : 0;

    return {
      jobId,
      moduleId: 'quality-control',
      jobTitle,
      status: warnings.length > 0 ? 'warning' : 'success',
      executionMs: roundTo(performance.now() - start, 2),
      summaryText: `Peta X̄-R: CL_X = ${formatNum(xDoubleBar, 3)} [${formatNum(lclX, 3)}, ${formatNum(uclX, 3)}], ${totalOoc} titik di luar kendali.`,
      kpis,
      tables: [table],
      charts: [
        {
          kind: 'line',
          id: 'spc-xbar-chart',
          title: 'Control Chart X̄ (Rata-rata Subgrup)',
          xLabel: 'Sampel',
          yLabel: 'X̄',
          series: [
            {
              name: 'Rata-rata Sampel (X̄)',
              colorToken: 'var(--chart-1)',
              points: sampleStats.map((s) => ({ x: s.label, y: roundTo(s.mean, 4) })),
            },
          ],
          referenceLines: [
            { label: 'UCL', value: roundTo(uclX, 4), colorToken: 'var(--error)', dashed: true },
            { label: 'CL', value: roundTo(xDoubleBar, 4), colorToken: 'var(--success)' },
            { label: 'LCL', value: roundTo(lclX, 4), colorToken: 'var(--error)', dashed: true },
          ],
        },
        {
          kind: 'line',
          id: 'spc-r-chart',
          title: 'Control Chart R (Rentang Subgrup)',
          xLabel: 'Sampel',
          yLabel: 'R',
          series: [
            {
              name: 'Range Sampel (R)',
              colorToken: 'var(--chart-2)',
              points: sampleStats.map((s) => ({ x: s.label, y: roundTo(s.range, 4) })),
            },
          ],
          referenceLines: [
            { label: 'UCL_R', value: roundTo(uclR, 4), colorToken: 'var(--error)', dashed: true },
            { label: 'R̄', value: roundTo(rBar, 4), colorToken: 'var(--success)' },
            { label: 'LCL_R', value: roundTo(lclR, 4), colorToken: 'var(--error)', dashed: true },
          ],
        },
      ],
      warnings,
      auditSteps: [
        {
          title: '1. Batas Kendali X-bar & R-Chart (Konstanta ASTM)',
          formula: `UCL_X = X̄̄ + A₂·R̄ = ${roundTo(uclX, 4)} · LCL_X = X̄̄ - A₂·R̄ = ${roundTo(lclX, 4)} · [LCL_R, UCL_R] = [D₃·R̄, D₄·R̄] = [${roundTo(lclR, 4)}, ${roundTo(uclR, 4)}]`,
          detail: `Konstanta subgrup n=${n}: A₂=${consts.a2}, D₃=${consts.d3}, D₄=${consts.d4}, d₂=${consts.d2} (σ̂ = R̄/d₂ = ${roundTo(sigmaEst, 4)}).${cpk !== null ? ` Kapabilitas Cp=${roundTo(cp!, 2)}, Cpk=${roundTo(cpk, 2)} (estimasi ${formatNum(estPpm ?? 0, 1)} PPM).` : ''}`,
        },
      ],
      analysis: {
        headline:
          totalOoc === 0 && !runWarn
            ? `Proses Stabil Secara Statistik (In Control)${cpk !== null ? ` — Cpk ${formatNum(cpk, 2)}` : ''}`
            : `Terdeteksi Gangguan Penyebab Khusus (${totalOoc} Titik Out-of-Control${runWarn ? ' + Pergeseran Run' : ''})`,
        interpretation: `Dari ${samples.length} subgrup berukuran n=${n}, rata-rata proses X̄̄ = ${formatNum(xDoubleBar, 4)} dengan rata-rata rentang R̄ = ${formatNum(rBar, 4)} (estimasi simpangan baku dalam-subgrup σ̂ = R̄/d₂ = ${formatNum(sigmaEst, 4)}). ${totalOoc === 0 ? 'Seluruh titik berada dalam batas kendali ±3σ.' : `Ditemukan ${outX.length} pelanggaran batas pada peta X̄ dan ${outR.length} pada peta R.`}`,
        sections: [
          {
            heading: 'Stabilitas Variasi (R-Chart) & Rata-rata (X-bar)',
            body:
              outR.length > 0
                ? `Peta R menunjukkan ${outR.length} sampel di luar kendali (${outR.join(', ')}). Karena variansi proses belum stabil, batas kendali pada peta X̄ dan estimasi kapabilitas belum sepenuhnya andal sebelum variabilitas dispersi diatasi terlebih dahulu.`
                : outX.length > 0
                  ? `Variasi dalam subgrup (R-Chart) sudah stabil, namun rata-rata proses (X-bar) keluar batas pada sampel ${outX.join(', ')} — menandakan pergeseran penyetelan mesin, batch material, atau keausan alat.`
                  : runWarn
                    ? `Tidak ada titik melampaui batas ±3σ, tetapi ${runWarn}`
                    : 'Baik peta R (dispersi) maupun peta X̄ (pusat proses) terkendali secara statistik — hanya variasi penyebab umum (common cause) yang bekerja.',
            tone: outR.length > 0 ? 'critical' : outX.length > 0 || runWarn ? 'caution' : 'positive',
          },
          ...(cp !== null && cpk !== null && capLabel
            ? [
                {
                  heading: 'Indeks Kapabilitas Proses (Cp & Cpk)',
                  body: `Potensi kapabilitas Cp = ${formatNum(cp, 2)} dan kapabilitas aktual Cpk = ${formatNum(cpk, 2)} (${capLabel}). Estimasi tingkat ketidaksesuaian sekitar ${formatNum(estPpm ?? 0, 1)} PPM. ${capOffset > 0.15 ? `Selisih Cp - Cpk = ${formatNum(capOffset, 2)} menandakan rata-rata proses (X̄̄ = ${formatNum(xDoubleBar, 3)}) belum terpusat tepat di tengah spesifikasi (${formatNum((input.usl! + input.lsl!) / 2, 3)}).` : 'Pusat proses sudah cukup selaras dengan titik tengah spesifikasi.'}`,
                  tone: cpk >= 1.33 ? 'positive' : cpk >= 1.0 ? 'caution' : 'critical',
                } as const,
              ]
            : []),
        ],
        recommendations: [
          outR.length > 0
            ? `Prioritaskan investigasi akar masalah pada peta R (sampel ${outR.join(', ')}) — periksa keseragaman material, metode operator, atau kelonggaran fixture — sebelum menyetel rata-rata mesin.`
            : outX.length > 0
              ? `Audit sampel X-bar di luar batas (${outX.join(', ')}) untuk mengeliminasi penyebab khusus (special cause), lalu hitung ulang batas kendali revisi tanpa titik abnormal.`
              : 'Pertahankan standar operasi (SOP) saat ini dan lanjutkan pemantauan SPC berkala untuk mendeteksi tren dini.',
          ...(cp !== null && cpk !== null && capOffset > 0.15
            ? [
                `Lakukan re-centering rata-rata proses dari ${formatNum(xDoubleBar, 3)} menuju target tengah ${formatNum((input.usl! + input.lsl!) / 2, 3)}; langkah ini dapat menaikkan Cpk dari ${formatNum(cpk, 2)} mendekati Cp (${formatNum(cp, 2)}) tanpa investasi mesin baru.`,
              ]
            : cp !== null && cp < 1.33
              ? [
                  `Karena potensi Cp (${formatNum(cp, 2)}) masih di bawah 1.33, perbaikan harus menyasar pengurangan variansi inheren (σ̂ = ${formatNum(sigmaEst, 4)}) melalui kalibrasi presisi atau upgrade proses.`,
                ]
              : []),
        ],
      },
      derivedValues: {
        xDoubleBar: roundTo(xDoubleBar, 4),
        rBar: roundTo(rBar, 4),
        sigmaEst: roundTo(sigmaEst, 4),
        uclX: roundTo(uclX, 4),
        lclX: roundTo(lclX, 4),
        uclR: roundTo(uclR, 4),
        lclR: roundTo(lclR, 4),
        outOfControlCount: totalOoc,
        ...(cp !== null ? { cp: roundTo(cp, 4) } : {}),
        ...(cpk !== null ? { cpk: roundTo(cpk, 4) } : {}),
      },
    };
  }

  if (input.chartType === 'p-chart') {
    const defaultN = Math.max(1, input.subgroupSize || 50);
    const warnings: string[] = [];

    const sanitized = samples.map((s) => {
      const ni = Math.max(1, s.sampleSize ?? defaultN);
      const rawDefects = s.values[0] ?? 0;
      if (rawDefects < 0) {
        warnings.push(`Sampel "${s.label}" memiliki cacat negatif (${rawDefects}); dibatasi ke 0.`);
      } else if (rawDefects > ni) {
        warnings.push(`Sampel "${s.label}" memiliki jumlah cacat (${rawDefects}) > ukuran sampel (${ni}); dibatasi ke ${ni}.`);
      }
      const defects = Math.max(0, Math.min(ni, rawDefects));
      return { label: s.label, ni, defects };
    });

    const totalDefects = sanitized.reduce((s, x) => s + x.defects, 0);
    const totalInspected = sanitized.reduce((s, x) => s + x.ni, 0) || 1;
    const pBar = Math.max(0, Math.min(1, totalDefects / totalInspected));

    const rows = sanitized.map((s) => {
      const pi = s.defects / s.ni;
      const sp = Math.sqrt(Math.max(0, (pBar * (1 - pBar)) / s.ni));
      const ucl = Math.min(1, pBar + 3 * sp);
      const lcl = Math.max(0, pBar - 3 * sp);
      const ooc = pi > ucl + 1e-12 || pi < lcl - 1e-12;
      return { label: s.label, ni: s.ni, defects: s.defects, pi, ucl, lcl, ooc };
    });

    const oocRows = rows.filter((r) => r.ooc);
    const oocCount = oocRows.length;
    if (oocCount > 0) {
      warnings.push(`Terdapat ${oocCount} sampel proporsi cacat di luar batas kendali p-chart (${oocRows.map((r) => r.label).join(', ')}).`);
    }
    const runWarn = detectWesternElectricRun(
      rows.map((r) => r.pi),
      pBar,
      7,
    );
    if (runWarn) warnings.push(runWarn);

    const avgUcl = rows.reduce((a, r) => a + r.ucl, 0) / rows.length;
    const avgLcl = rows.reduce((a, r) => a + r.lcl, 0) / rows.length;
    const dpmo = pBar * 1_000_000;
    const worstSample = [...rows].sort((a, b) => b.pi - a.pi)[0];

    return {
      jobId,
      moduleId: 'quality-control',
      jobTitle,
      status: warnings.length > 0 ? 'warning' : 'success',
      executionMs: roundTo(performance.now() - start, 2),
      summaryText: `p-Chart: p̄ = ${formatNum(pBar * 100, 2)}%, ${oocCount} titik di luar kendali.`,
      kpis: [
        { label: 'Proporsi Cacat Rata-rata (p̄)', value: `${formatNum(pBar * 100, 2)}%`, emphasis: 'primary' },
        { label: 'Rata-rata UCL / LCL', value: `${formatNum(avgUcl, 4)} / ${formatNum(avgLcl, 4)}` },
        { label: 'Estimasi DPMO', value: formatNum(dpmo, 0), unit: 'cacat/juta' },
        {
          label: 'Titik Out-of-Control',
          value: oocCount,
          emphasis: oocCount === 0 ? 'success' : 'warning',
        },
      ],
      tables: [
        {
          id: 'spc-p-table',
          title: 'Hasil Peta Kendali Proporsi Cacat (p-Chart)',
          headers: ['Sampel', 'Ukuran (n)', 'Jumlah Cacat', 'Proporsi (p)', 'LCL', 'UCL', 'Status'],
          rows: rows.map((r) => [
            r.label,
            r.ni,
            r.defects,
            roundTo(r.pi, 4),
            roundTo(r.lcl, 4),
            roundTo(r.ucl, 4),
            r.ooc ? 'OUT OF CONTROL' : 'In Control',
          ]),
          highlightRowIndices: rows
            .map((r, idx) => (r.ooc ? idx : -1))
            .filter((idx) => idx !== -1),
        },
      ],
      charts: [
        {
          kind: 'line',
          id: 'spc-p-chart',
          title: 'Control Chart p (Proporsi Cacat)',
          xLabel: 'Sampel',
          yLabel: 'Proporsi (p)',
          series: [
            {
              name: 'Proporsi Cacat (p)',
              colorToken: 'var(--chart-1)',
              points: rows.map((r) => ({ x: r.label, y: roundTo(r.pi, 4) })),
            },
          ],
          referenceLines: [
            { label: 'UCL', value: roundTo(avgUcl, 4), colorToken: 'var(--error)', dashed: true },
            { label: 'p̄', value: roundTo(pBar, 4), colorToken: 'var(--success)' },
            { label: 'LCL', value: roundTo(avgLcl, 4), colorToken: 'var(--error)', dashed: true },
          ],
        },
      ],
      warnings,
      auditSteps: [
        {
          title: '1. Peta Kendali Proporsi Cacat (p-Chart)',
          formula: `p̄ = ∑cacat / ∑nᵢ = ${totalDefects} / ${totalInspected} = ${roundTo(pBar, 4)} · UCL/LCL = p̄ ± 3√(p̄(1-p̄)/nᵢ)`,
          detail: `Ditemukan ${oocCount} sampel di luar batas kendali p-chart (${formatNum(pBar * 100, 2)}% cacat rata-rata).`,
        },
      ],
      analysis: {
        headline:
          oocCount === 0
            ? `Proporsi Cacat Terkendali pada ${formatNum(pBar * 100, 2)}% (${formatNum(dpmo, 0)} DPMO)`
            : `Anomali Kualitas Atribut: ${oocCount} Sampel Melampaui Batas Kendali p-Chart`,
        interpretation: `Dari total ${formatNum(totalInspected, 0)} unit yang diinspeksi pada ${samples.length} lot, ditemukan ${formatNum(totalDefects, 0)} unit cacat (p̄ = ${formatNum(pBar * 100, 2)}%, setara ${formatNum(dpmo, 0)} DPMO). Batas kendali 3σ dihitung secara individual menyesuaikan ukuran sampel nᵢ masing-masing lot.`,
        sections: [
          {
            heading: 'Evaluasi Stabilitas Lot & Puncak Cacat',
            body:
              oocCount > 0
                ? `Sampel di luar batas kendali: ${oocRows.map((r) => `${r.label} (${formatNum(r.pi * 100, 2)}%)`).join(', ')}. Proporsi cacat tertinggi terjadi pada "${worstSample.label}" (${worstSample.defects}/${worstSample.ni} unit = ${formatNum(worstSample.pi * 100, 2)}%).`
                : `Seluruh lot berada dalam kendali statistik (puncak tertinggi "${worstSample.label}" = ${formatNum(worstSample.pi * 100, 2)}% masih di bawah UCL ${formatNum(worstSample.ucl * 100, 2)}%).${runWarn ? ` Catatan: ${runWarn}` : ''}`,
            tone: oocCount > 0 ? 'critical' : runWarn ? 'caution' : 'positive',
          },
        ],
        recommendations: [
          oocCount > 0
            ? `Karantina dan lakukan analisis 5-Why / Fishbone pada lot out-of-control (${oocRows.map((r) => r.label).join(', ')}) untuk memisahkan penyimpangan pemasok, shift, atau mesin.`
            : 'Karena proses sudah stabil (in control), penurunan tingkat cacat lebih lanjut memerlukan perbaikan sistemik (Desain Proses / Poka-Yoke) pada penyebab cacat dominan.',
          `Susun Diagram Pareto jenis cacat dari ${totalDefects} unit bermasalah agar 80% akar masalah tertangani lebih dulu.`,
        ],
      },
      derivedValues: { pBar: roundTo(pBar, 4), dpmo: roundTo(dpmo, 2), outOfControlCount: oocCount },
    };
  }

  // c-chart
  const warnings: string[] = [];
  const counts = samples.map((s) => {
    const rawC = s.values[0] ?? 0;
    if (rawC < 0) {
      warnings.push(`Sampel "${s.label}" memiliki jumlah cacat negatif (${rawC}); dibatasi ke 0.`);
    }
    return { label: s.label, c: Math.max(0, rawC) };
  });
  const totalDefects = counts.reduce((a, b) => a + b.c, 0);
  const cBar = totalDefects / counts.length;
  const uclC = cBar + 3 * Math.sqrt(Math.max(0, cBar));
  const lclC = Math.max(0, cBar - 3 * Math.sqrt(Math.max(0, cBar)));
  const oocItems = counts.filter((x) => x.c > uclC + 1e-12 || x.c < lclC - 1e-12);
  const oocCount = oocItems.length;
  if (oocCount > 0) {
    warnings.push(`Terdapat ${oocCount} titik di luar batas kendali c-chart (${oocItems.map((x) => x.label).join(', ')}).`);
  }
  const runWarn = detectWesternElectricRun(
    counts.map((x) => x.c),
    cBar,
    7,
  );
  if (runWarn) warnings.push(runWarn);

  const worstUnit = [...counts].sort((a, b) => b.c - a.c)[0];

  return {
    jobId,
    moduleId: 'quality-control',
    jobTitle,
    status: warnings.length > 0 ? 'warning' : 'success',
    executionMs: roundTo(performance.now() - start, 2),
    summaryText: `c-Chart: c̄ = ${formatNum(cBar, 2)} [${formatNum(lclC, 2)}, ${formatNum(uclC, 2)}], ${oocCount} titik di luar kendali.`,
    kpis: [
      { label: 'Rata-rata Cacat (c̄)', value: formatNum(cBar, 2), emphasis: 'primary' },
      { label: 'LCL / UCL', value: `${formatNum(lclC, 2)} / ${formatNum(uclC, 2)}` },
      {
        label: 'Out-of-Control',
        value: oocCount,
        emphasis: oocCount === 0 ? 'success' : 'warning',
      },
    ],
    tables: [
      {
        id: 'spc-c-table',
        title: 'Hasil Peta Kendali Jumlah Cacat (c-Chart)',
        headers: ['Unit / Sampel', 'Jumlah Cacat (c)', 'LCL', 'CL (c̄)', 'UCL', 'Status'],
        rows: counts.map((x) => [
          x.label,
          x.c,
          roundTo(lclC, 2),
          roundTo(cBar, 2),
          roundTo(uclC, 2),
          x.c > uclC + 1e-12 || x.c < lclC - 1e-12 ? 'OUT OF CONTROL' : 'In Control',
        ]),
        highlightRowIndices: counts
          .map((x, idx) => (x.c > uclC + 1e-12 || x.c < lclC - 1e-12 ? idx : -1))
          .filter((idx) => idx !== -1),
      },
    ],
    charts: [
      {
        kind: 'line',
        id: 'spc-c-chart',
        title: 'Control Chart c (Jumlah Cacat per Unit)',
        xLabel: 'Sampel',
        yLabel: 'Jumlah Cacat',
        series: [
          {
            name: 'Jumlah Cacat (c)',
            colorToken: 'var(--chart-1)',
            points: counts.map((x) => ({ x: x.label, y: x.c })),
          },
        ],
        referenceLines: [
          { label: 'UCL', value: roundTo(uclC, 2), colorToken: 'var(--error)', dashed: true },
          { label: 'c̄', value: roundTo(cBar, 2), colorToken: 'var(--success)' },
          { label: 'LCL', value: roundTo(lclC, 2), colorToken: 'var(--error)', dashed: true },
        ],
      },
    ],
    warnings,
    auditSteps: [
      {
        title: '1. Peta Kendali Atribut c-Chart (Distribusi Poisson 3σ)',
        formula: `CL = c̄ = ${roundTo(cBar, 2)} · UCL/LCL = c̄ ± 3√c̄ = [${roundTo(lclC, 2)}, ${roundTo(uclC, 2)}]`,
        detail: `Total ${totalDefects} temuan cacat pada ${counts.length} unit inspeksi; terdeteksi ${oocCount} titik di luar batas kendali.`,
      },
    ],
    analysis: {
      headline:
        oocCount === 0
          ? `Jumlah Cacat per Unit Stabil (c̄ = ${formatNum(cBar, 2)} Cacat/Unit)`
          : `Lonjakan Cacat Terdeteksi pada ${oocCount} Unit Inspeksi (Melampaui UCL ${formatNum(uclC, 2)})`,
      interpretation: `Berdasarkan model distribusi Poisson (c-Chart) untuk luas/unit inspeksi konstan, rata-rata cacat sebesar ${formatNum(cBar, 2)} per unit dengan batas kendali [${formatNum(lclC, 2)}, ${formatNum(uclC, 2)}]. ${oocCount === 0 ? 'Seluruh unit inspeksi berada dalam rentang variasi acak normal.' : `Terdapat ${oocCount} unit melampaui batas kendali yang menandakan gangguan khusus.`}`,
      sections: [
        {
          heading: 'Identifikasi Unit Kritis & Konsistensi',
          body: `Unit dengan jumlah cacat terbanyak adalah "${worstUnit.label}" (${worstUnit.c} cacat). ${oocCount > 0 ? `Unit out-of-control: ${oocItems.map((x) => `${x.label} (${x.c})`).join(', ')}.` : 'Tidak ada unit yang keluar dari batas kendali 3σ.'}${runWarn ? ` ${runWarn}` : ''}`,
          tone: oocCount > 0 ? 'critical' : runWarn ? 'caution' : 'positive',
        },
      ],
      recommendations: [
        oocCount > 0
          ? `Telusuri penyebab khusus pada unit "${oocItems.map((x) => x.label).join(', ')}" (mis. kerusakan cetakan, perubahan parameter suhu/tekanan, atau kegagalan inspeksi awal).`
          : 'Pastikan area/ukuran unit inspeksi tetap seragam pada setiap pengambilan sampel (jika area inspeksi bervariasi, gunakan u-Chart).',
        `Fokuskan perbaikan mutu pada jenis cacat paling sering muncul untuk menurunkan garis tengah c̄ dari ${formatNum(cBar, 2)} menuju target nol cacat.`,
      ],
    },
    derivedValues: { cBar: roundTo(cBar, 4), uclC: roundTo(uclC, 4), lclC: roundTo(lclC, 4), outOfControlCount: oocCount },
  };
}
