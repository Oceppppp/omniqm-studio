import { formatNum, roundTo } from '../core/math/matrix.ts';
import type {
  BreakEvenInput,
  ModuleExecutionResult,
  ResultTable,
} from '../core/types/module.types.ts';

export function solveBreakEven(
  jobId: string,
  jobTitle: string,
  input: BreakEvenInput,
): ModuleExecutionResult {
  const start = performance.now();
  const fc = input.fixedCost;
  const vc = input.variableCostPerUnit;
  const p = input.sellingPricePerUnit;
  const cm = p - vc;

  if (cm <= 0) {
    return {
      jobId,
      moduleId: 'break-even',
      jobTitle,
      status: 'warning',
      executionMs: roundTo(performance.now() - start, 2),
      summaryText: 'Harga jual per unit harus lebih besar dari biaya variabel untuk mencapai titik impas (BEP).',
      kpis: [
        { label: 'Contribution Margin', value: formatNum(cm, 2), emphasis: 'danger' },
      ],
      tables: [],
      charts: [],
      warnings: ['Margin kontribusi ≤ 0: setiap unit terjual menghasilkan kerugian.'],
      analysis: {
        headline: 'Titik Impas Tidak Tercapai — Margin Kontribusi Negatif atau Nol',
        interpretation: `Harga jual per unit (${formatNum(p, 2)}) lebih rendah atau sama dengan biaya variabel per unit (${formatNum(vc, 2)}), menghasilkan margin kontribusi sebesar ${formatNum(cm, 2)}/unit. Peningkatan volume penjualan justru memperbesar kerugian total selain menanggung biaya tetap ${formatNum(fc, 2)}.`,
        sections: [
          {
            heading: 'Akar Masalah Struktur Biaya',
            body: `Agar setiap unit mulai menutup biaya tetap, selisih (P - VC) harus bernilai positif. Saat ini terdapat defisit minimal ${formatNum(Math.abs(cm) + 0.01, 2)}/unit sebelum margin menjadi positif.`,
            tone: 'critical',
          },
        ],
        recommendations: [
          `Naikkan harga jual minimal melampaui biaya variabel (> ${formatNum(vc, 2)}/unit) atau tekan biaya variabel di bawah harga jual (< ${formatNum(p, 2)}/unit).`,
          'Tinjau ulang negosiasi pemasok bahan baku, efisiensi tenaga kerja langsung, serta diferensiasi harga jual sebelum meningkatkan skala produksi.',
        ],
      },
      derivedValues: { contributionMargin: roundTo(cm, 4) },
    };
  }

  const bepUnits = Math.max(0, fc / cm);
  const bepRevenue = bepUnits * p;
  const cmRatio = p > 1e-9 ? (cm / p) * 100 : 0;
  const targetProfit = input.targetProfit ?? 0;
  const targetUnits = Math.max(0, (fc + targetProfit) / cm);
  const expectedVol = Math.max(0, input.expectedVolume ?? Math.ceil(bepUnits * 1.5));
  const expectedRevenue = expectedVol * p;
  const expectedTotalCost = fc + expectedVol * vc;
  const expectedProfit = expectedRevenue - expectedTotalCost;
  const marginOfSafetyUnits = expectedVol - bepUnits;
  const marginOfSafetyPct = expectedVol > 1e-9 ? (marginOfSafetyUnits / expectedVol) * 100 : 0;
  const dol = expectedProfit > 1e-9 ? (expectedVol * cm) / expectedProfit : null;

  const summaryTable: ResultTable = {
    id: 'bep-summary',
    title: 'Analisis Break-Even (Cost-Volume-Profit)',
    headers: ['Komponen', 'Nilai', 'Keterangan'],
    rows: [
      ['Biaya Tetap (Fixed Cost)', roundTo(fc, 2), 'FC'],
      ['Biaya Variabel / Unit', roundTo(vc, 2), 'VC'],
      ['Harga Jual / Unit', roundTo(p, 2), 'P'],
      ['Contribution Margin / Unit', roundTo(cm, 2), 'P - VC'],
      ['Contribution Margin Ratio', `${roundTo(cmRatio, 2)}%`, '(P - VC) / P'],
      ['BEP (Unit)', roundTo(bepUnits, 2), 'FC / (P - VC)'],
      ['BEP (Nilai Penjualan)', roundTo(bepRevenue, 2), 'BEP Unit × P'],
      ['Volume Target Laba', roundTo(targetUnits, 2), `Untuk laba ${formatNum(targetProfit, 2)}`],
      ['Laba pada Volume Ekspektasi', roundTo(expectedProfit, 2), `Pada volume ${formatNum(expectedVol, 0)} unit`],
      ['Margin of Safety (Unit)', roundTo(marginOfSafetyUnits, 2), 'Volume Ekspektasi - BEP'],
      ['Margin of Safety (%)', `${roundTo(marginOfSafetyPct, 2)}%`, '(Volume - BEP) / Volume'],
      [
        'Degree of Operating Leverage (DOL)',
        dol !== null ? `${roundTo(dol, 2)}x` : '-',
        dol !== null ? 'Sensitivitas %ΔLaba per 1% ΔPenjualan' : 'Hanya terdefinisi pada zona laba (> BEP)',
      ],
    ],
  };

  const tables: ResultTable[] = [summaryTable];
  const crossoverSummaries: string[] = [];

  if (input.alternatives && input.alternatives.length >= 2) {
    const crossoverRows: (string | number)[][] = [];
    for (let i = 0; i < input.alternatives.length; i += 1) {
      for (let j = i + 1; j < input.alternatives.length; j += 1) {
        const a1 = input.alternatives[i];
        const a2 = input.alternatives[j];
        const dv = a1.variableCost - a2.variableCost;
        const crossover = Math.abs(dv) > 1e-9 ? (a2.fixedCost - a1.fixedCost) / dv : null;
        let recommendation = '';
        if (crossover !== null && crossover >= 0) {
          const lowVolWinner = a1.fixedCost < a2.fixedCost ? a1.name : a2.name;
          const highVolWinner = a1.variableCost < a2.variableCost ? a1.name : a2.name;
          recommendation = `Q < ${formatNum(crossover, 0)}: ${lowVolWinner} | Q > ${formatNum(crossover, 0)}: ${highVolWinner}`;
          crossoverSummaries.push(`${a1.name} vs ${a2.name} berpotongan di ${formatNum(crossover, 1)} unit (${recommendation})`);
        } else {
          const cost1AtZero = a1.fixedCost;
          const cost2AtZero = a2.fixedCost;
          const cost1AtHigh = a1.fixedCost + a1.variableCost * Math.max(expectedVol, 1000);
          const cost2AtHigh = a2.fixedCost + a2.variableCost * Math.max(expectedVol, 1000);
          const dominant = cost1AtZero <= cost2AtZero && cost1AtHigh <= cost2AtHigh
            ? `${a1.name} selalu lebih hemat (Q ≥ 0)`
            : cost2AtZero <= cost1AtZero && cost2AtHigh <= cost1AtHigh
              ? `${a2.name} selalu lebih hemat (Q ≥ 0)`
              : 'Sejajar / identik';
          recommendation = dominant;
          crossoverSummaries.push(`${a1.name} vs ${a2.name}: ${dominant}`);
        }
        crossoverRows.push([
          `${a1.name} vs ${a2.name}`,
          crossover !== null && crossover >= 0 ? roundTo(crossover, 2) : 'Tidak berpotongan (≥0)',
          crossover !== null && crossover >= 0
            ? roundTo(a1.fixedCost + a1.variableCost * crossover, 2)
            : '-',
          recommendation,
        ]);
      }
    }

    tables.push({
      id: 'bep-crossover',
      title: 'Analisis Crossover Multi-Alternatif Proses',
      headers: ['Perbandingan Alternatif', 'Titik Crossover (Unit)', 'Total Biaya di Titik Crossover', 'Daerah Proses Termurah'],
      rows: crossoverRows,
    });
  }

  let bestAltAtExpected: { name: string; totalCost: number } | null = null;
  if (input.alternatives && input.alternatives.length >= 2) {
    bestAltAtExpected = input.alternatives
      .map((a) => ({ name: a.name, totalCost: a.fixedCost + a.variableCost * expectedVol }))
      .sort((a, b) => a.totalCost - b.totalCost)[0];
  }

  const maxPlotVol = Math.max(bepUnits * 2, expectedVol * 1.2, 10);
  const step = maxPlotVol / 5;
  const volPoints = Array.from({ length: 6 }, (_, i) => Math.round(i * step));

  const elapsed = roundTo(performance.now() - start, 2);
  const isProfitable = expectedProfit >= 0;

  return {
    jobId,
    moduleId: 'break-even',
    jobTitle,
    status: 'success',
    executionMs: elapsed,
    summaryText: `Titik impas (BEP) tercapai pada ${formatNum(bepUnits, 2)} unit (pendapatan ${formatNum(bepRevenue, 2)}).`,
    kpis: [
      { label: 'BEP (Unit)', value: formatNum(bepUnits, 2), unit: 'unit', emphasis: 'primary' },
      { label: 'BEP (Pendapatan)', value: formatNum(bepRevenue, 2), emphasis: 'success' },
      { label: 'Contribution Margin', value: formatNum(cm, 2), unit: `(${roundTo(cmRatio, 1)}%)` },
      {
        label: 'Laba Ekspektasi',
        value: formatNum(expectedProfit, 2),
        emphasis: isProfitable ? 'success' : 'danger',
      },
      {
        label: 'Margin of Safety',
        value: `${formatNum(marginOfSafetyPct, 1)}%`,
        unit: `${formatNum(marginOfSafetyUnits, 0)} unit`,
      },
    ],
    tables,
    charts: [
      {
        kind: 'line',
        id: 'bep-chart',
        title: 'Grafik Break-Even: Total Pendapatan vs Total Biaya',
        xLabel: 'Volume (Unit)',
        yLabel: 'Nilai Biaya / Pendapatan',
        series: [
          {
            name: 'Total Revenue (TR)',
            colorToken: 'var(--chart-2)',
            points: volPoints.map((v) => ({ x: v, y: roundTo(v * p, 2) })),
          },
          {
            name: 'Total Cost (TC)',
            colorToken: 'var(--chart-1)',
            points: volPoints.map((v) => ({ x: v, y: roundTo(fc + v * vc, 2) })),
          },
          {
            name: 'Fixed Cost (FC)',
            colorToken: 'var(--chart-3)',
            dashed: true,
            points: volPoints.map((v) => ({ x: v, y: roundTo(fc, 2) })),
          },
        ],
      },
    ],
    warnings: !isProfitable
      ? [`Volume ekspektasi (${formatNum(expectedVol, 0)} unit) masih berada di bawah titik impas (${formatNum(bepUnits, 2)} unit) sehingga berpotensi rugi ${formatNum(Math.abs(expectedProfit), 2)}.`]
      : [],
    auditSteps: [
      {
        title: '1. Contribution Margin & Titik Impas Unit',
        formula: `BEP_unit = FC / (P - VC) = ${formatNum(fc, 0)} / (${formatNum(p, 2)} - ${formatNum(vc, 2)}) = ${formatNum(bepUnits, 2)} unit`,
        detail: `Setiap unit menyumbang margin kontribusi ${formatNum(cm, 2)} (${roundTo(cmRatio, 2)}% dari harga jual).`,
      },
      {
        title: '2. Titik Impas Penjualan, Target Laba & Margin of Safety',
        formula: `BEP_Rp = BEP_unit × P = ${formatNum(bepRevenue, 2)} · Q_target = (FC + Laba) / (P - VC) = ${formatNum(targetUnits, 2)} unit · MOS = ${roundTo(marginOfSafetyPct, 2)}%`,
        detail: `Pada volume ekspektasi ${formatNum(expectedVol, 0)} unit, laba diperkirakan ${formatNum(expectedProfit, 2)}${dol !== null ? ` dengan Degree of Operating Leverage (DOL) = ${roundTo(dol, 2)}x` : ''}.`,
      },
      ...(input.alternatives && input.alternatives.length >= 2
        ? [
            {
              title: '3. Analisis Crossover Multi-Alternatif',
              formula: 'Q_crossover = (FC₂ - FC₁) / (VC₁ - VC₂)',
              detail: `Membandingkan ${input.alternatives.length} proses untuk menentukan batas volume perpindahan teknologi termurah.`,
            },
          ]
        : []),
    ],
    analysis: {
      headline: isProfitable
        ? `Zona Laba Tercapai dengan Margin of Safety ${formatNum(marginOfSafetyPct, 1)}% (${formatNum(marginOfSafetyUnits, 0)} Unit di Atas BEP)`
        : `Zona Rugi: Volume Ekspektasi Masih Kurang ${formatNum(Math.abs(marginOfSafetyUnits), 1)} Unit dari Titik Impas`,
      interpretation: `Bisnis mencapai titik impas (BEP) pada penjualan ${formatNum(bepUnits, 2)} unit atau pendapatan ${formatNum(bepRevenue, 2)}. Dengan margin kontribusi ${formatNum(cm, 2)}/unit (${roundTo(cmRatio, 2)}% dari harga jual), setiap unit setelah titik impas langsung menjadi laba operasi. Pada volume ekspektasi ${formatNum(expectedVol, 0)} unit, estimasi laba bersih operasional adalah ${formatNum(expectedProfit, 2)}.`,
      sections: [
        {
          heading: 'Bantalan Risiko (Margin of Safety)',
          body: isProfitable
            ? `Penjualan dapat turun hingga ${formatNum(marginOfSafetyUnits, 1)} unit (${formatNum(marginOfSafetyPct, 1)}%) dari proyeksi ${formatNum(expectedVol, 0)} unit sebelum bisnis memasuki area kerugian. ${marginOfSafetyPct >= 30 ? 'Bantalan keamanan tergolong kuat (>30%).' : marginOfSafetyPct >= 15 ? 'Bantalan keamanan moderat (15–30%); pantau fluktuasi permintaan.' : 'Bantalan keamanan tipis (<15%); sangat rentan terhadap penurunan penjualan.'}`
            : `Volume saat ini (${formatNum(expectedVol, 0)} unit) belum menutup biaya tetap ${formatNum(fc, 2)}, menyisakan defisit ${formatNum(Math.abs(expectedProfit), 2)}. Diperlukan tambahan minimal ${formatNum(Math.abs(marginOfSafetyUnits), 1)} unit hanya untuk mencapai titik impas.`,
          tone: !isProfitable ? 'critical' : marginOfSafetyPct >= 25 ? 'positive' : 'caution',
        },
        {
          heading: 'Daya Ungkit Operasi (Operating Leverage) & Target Laba',
          body: `${dol !== null ? `Degree of Operating Leverage (DOL) = ${roundTo(dol, 2)}x: setiap kenaikan penjualan 10% akan mendongkrak laba sekitar ${formatNum(dol * 10, 1)}% (dan penurunan 10% juga menurunkan laba dalam persentase sama). ` : ''}Untuk mencapai target laba ${formatNum(targetProfit, 2)}, diperlukan penjualan ${formatNum(targetUnits, 2)} unit (pendapatan ${formatNum(targetUnits * p, 2)}).`,
          tone: dol !== null && dol > 4 ? 'caution' : 'neutral',
        },
        ...(crossoverSummaries.length > 0 && bestAltAtExpected
          ? [
              {
                heading: 'Pemilihan Teknologi Proses (Crossover)',
                body: `Pada volume ekspektasi ${formatNum(expectedVol, 0)} unit, alternatif proses paling ekonomis adalah "${bestAltAtExpected.name}" (total biaya ${formatNum(bestAltAtExpected.totalCost, 2)}). Ringkasan batas perpindahan: ${crossoverSummaries.join('; ')}.`,
                tone: 'positive' as const,
              },
            ]
          : []),
      ],
      recommendations: [
        isProfitable
          ? `Jaga volume penjualan minimal di atas ${formatNum(Math.ceil(bepUnits), 0)} unit/periode dan fokuskan kapasitas produksi menuju target ${formatNum(Math.ceil(targetUnits), 0)} unit untuk merealisasikan laba ${formatNum(targetProfit, 2)}.`
          : `Tingkatkan volume penjualan minimal ${formatNum(Math.ceil(Math.abs(marginOfSafetyUnits)), 0)} unit, atau evaluasi kenaikan harga jual / efisiensi biaya variabel (VC) dan biaya tetap (FC) guna menurunkan ambang BEP.`,
        ...(bestAltAtExpected
          ? [
              `Gunakan proses "${bestAltAtExpected.name}" untuk proyeksi permintaan ${formatNum(expectedVol, 0)} unit; evaluasi ulang bila proyeksi volume melintasi titik crossover.`,
            ]
          : [
              `Karena CM Ratio = ${roundTo(cmRatio, 1)}%, setiap tambahan pendapatan 100 satuan menghasilkan tambahan margin kontribusi ${formatNum(cmRatio, 1)} satuan; prioritaskan strategi kenaikan harga/efisiensi VC sebelum ekspansi biaya tetap baru.`,
            ]),
      ],
    },
    derivedValues: {
      bepUnits: roundTo(bepUnits, 4),
      bepRevenue: roundTo(bepRevenue, 4),
      expectedProfit: roundTo(expectedProfit, 4),
      contributionMargin: roundTo(cm, 4),
      cmRatio: roundTo(cmRatio, 4),
      marginOfSafetyUnits: roundTo(marginOfSafetyUnits, 4),
      marginOfSafetyPct: roundTo(marginOfSafetyPct, 4),
      ...(dol !== null ? { dol: roundTo(dol, 4) } : {}),
    },
  };
}
