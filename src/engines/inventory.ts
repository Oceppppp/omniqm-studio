import { formatNum, roundTo } from '../core/math/matrix.ts';
import type {
  InventoryInput,
  ModuleExecutionResult,
  ResultTable,
} from '../core/types/module.types.ts';

export function solveInventory(
  jobId: string,
  jobTitle: string,
  input: InventoryInput,
): ModuleExecutionResult {
  const start = performance.now();

  if (input.model === 'abc') {
    const items = input.abcItems ?? [];
    if (items.length === 0) {
      return {
        jobId,
        moduleId: 'inventory',
        jobTitle,
        status: 'error',
        executionMs: 0,
        summaryText: 'Daftar item ABC kosong.',
        kpis: [],
        tables: [],
        charts: [],
        warnings: ['Masukkan minimal 1 item untuk analisis ABC.'],
        derivedValues: {},
        error: 'Daftar item ABC kosong.',
      };
    }

    const enriched = items
      .map((it) => ({
        ...it,
        annualDollar: it.annualUsage * it.unitCost,
      }))
      .sort((a, b) => b.annualDollar - a.annualDollar);

    const totalDollar = enriched.reduce((s, it) => s + it.annualDollar, 0) || 1;
    let cumPct = 0;

    const classified = enriched.map((it) => {
      const sharePct = (it.annualDollar / totalDollar) * 100;
      const prevCum = cumPct;
      cumPct += sharePct;
      const klass = prevCum < 80 - 1e-6 ? 'A' : prevCum < 95 - 1e-6 ? 'B' : 'C';
      return { ...it, sharePct, cumPct, klass };
    });

    const classA = classified.filter((c) => c.klass === 'A');
    const classB = classified.filter((c) => c.klass === 'B');
    const classC = classified.filter((c) => c.klass === 'C');
    const countA = classA.length;
    const countB = classB.length;
    const countC = classC.length;
    const valuePctA = classA.reduce((s, c) => s + c.sharePct, 0);
    const valuePctB = classB.reduce((s, c) => s + c.sharePct, 0);
    const valuePctC = classC.reduce((s, c) => s + c.sharePct, 0);

    const abcTable: ResultTable = {
      id: 'inventory-abc',
      title: 'Klasifikasi Persediaan ABC (Pareto)',
      headers: ['SKU / Item', 'Pemakaian/Tahun', 'Harga Unit', 'Nilai Tahunan', 'Porsi (%)', 'Kumulatif (%)', 'Kelas'],
      rows: classified.map((c) => [
        c.sku,
        roundTo(c.annualUsage, 2),
        roundTo(c.unitCost, 2),
        roundTo(c.annualDollar, 2),
        `${roundTo(c.sharePct, 2)}%`,
        `${roundTo(c.cumPct, 2)}%`,
        c.klass,
      ]),
    };

    return {
      jobId,
      moduleId: 'inventory',
      jobTitle,
      status: 'success',
      executionMs: roundTo(performance.now() - start, 2),
      summaryText: `Analisis ABC dari ${classified.length} SKU: Kelas A=${countA}, Kelas B=${countB}, Kelas C=${countC} (Total nilai: ${formatNum(totalDollar)}).`,
      kpis: [
        { label: 'Total Nilai Tahunan', value: formatNum(totalDollar, 2), emphasis: 'primary' },
        { label: 'Item Kelas A', value: countA, emphasis: 'warning' },
        { label: 'Item Kelas B', value: countB },
        { label: 'Item Kelas C', value: countC },
      ],
      tables: [abcTable],
      charts: [
        {
          kind: 'bar',
          id: 'abc-pareto-bars',
          title: 'Nilai Pemakaian Tahunan per SKU (Pareto ABC)',
          xLabel: 'SKU',
          yLabel: 'Nilai Tahunan',
          bars: classified.slice(0, 12).map((c) => ({
            label: `${c.sku} (${c.klass})`,
            value: roundTo(c.annualDollar, 2),
            colorToken:
              c.klass === 'A'
                ? 'var(--chart-1)'
                : c.klass === 'B'
                  ? 'var(--chart-2)'
                  : 'var(--chart-3)',
          })),
        },
      ],
      warnings: [],
      auditSteps: [
        {
          title: '1. Perhitungan Nilai Pemakaian Tahunan (Pareto ABC)',
          formula: 'Annual Value = Annual Usage × Unit Cost',
          detail: `Mengurutkan ${classified.length} SKU dari nilai tahunan terbesar (Total = ${formatNum(totalDollar, 2)}) dan membagi ke Kelas A (<80%), B (80–95%), dan C (95–100%).`,
        },
      ],
      analysis: {
        headline: `Konsentrasi Pareto: ${countA} SKU Kelas A (${formatNum((countA / classified.length) * 100, 1)}% Item) Menyumbang ${formatNum(valuePctA, 1)}% Nilai Persediaan`,
        interpretation: `Dari total nilai pemakaian tahunan ${formatNum(totalDollar, 2)}, Kelas A menguasai ${formatNum(valuePctA, 1)}% (${classA.map((c) => c.sku).join(', ')}), Kelas B ${formatNum(valuePctB, 1)}% (${countB} item), dan Kelas C ${formatNum(valuePctC, 1)}% (${countC} item).`,
        sections: [
          {
            heading: 'Kebijakan Kendali Kelas A (Prioritas Tinggi)',
            body: `SKU Kelas A (${classA.map((c) => c.sku).join(', ') || '-'}) memerlukan pencatatan perpetual real-time, perhitungan EOQ/ROP presisi, cycle counting bulanan, serta negosiasi ketat dengan pemasok.`,
            tone: 'caution',
          },
          {
            heading: 'Kebijakan Kendali Kelas B & C',
            body: `Kelas B (${countB} SKU, ${formatNum(valuePctB, 1)}%) cukup dengan review berkala (bulanan/kuartalan). Kelas C (${countC} SKU, ${formatNum(valuePctC, 1)}%) cocok memakai sistem two-bin atau pemesanan dalam lot besar agar biaya administrasi tetap rendah.`,
            tone: 'positive',
          },
        ],
        recommendations: [
          `Fokuskan minimal 70% perhatian audit stok dan optimasi lead time pada ${countA} item Kelas A.`,
          `Sederhanakan prosedur pembelian ${countC} item Kelas C agar biaya pemesanan administratif tidak melebihi nilai barangnya.`,
        ],
      },
      derivedValues: { totalDollar: roundTo(totalDollar, 2), countA, countB, countC },
    };
  }

  const D = Math.max(0, input.annualDemand);
  const S = Math.max(0, input.orderingCost);
  const H = Math.max(1e-9, input.holdingCostPerUnit);
  const P = Math.max(0, input.unitPrice);
  const days = Math.max(1, input.workingDaysPerYear ?? 250);

  if (input.model === 'quantity-discount' && input.discountTiers && input.discountTiers.length > 0) {
    const tierRows: (string | number)[][] = [];
    let bestTierIdx = -1;
    let bestTotalCost = Infinity;
    let bestQ = 0;
    let bestSetupHold = 0;
    let baseTierTotalCost = 0;

    const sortedTiers = [...input.discountTiers].sort((a, b) => a.minQty - b.minQty);
    sortedTiers.forEach((tier, idx) => {
      const eoq = Math.sqrt((2 * D * S) / H);
      let adjQ = eoq;
      let statusNote = 'EOQ Layak';
      if (eoq < tier.minQty) {
        adjQ = tier.minQty;
        statusNote = `Disesuaikan ke min (${tier.minQty})`;
      } else if (tier.maxQty !== null && eoq > tier.maxQty) {
        adjQ = tier.maxQty;
        statusNote = `Disesuaikan ke max (${tier.maxQty})`;
      }
      const orderCost = adjQ > 0 ? (D / adjQ) * S : 0;
      const holdCost = (adjQ / 2) * H;
      const setupHold = orderCost + holdCost;
      const purchaseCost = D * tier.unitPrice;
      const totalCost = purchaseCost + setupHold;
      if (idx === 0) baseTierTotalCost = totalCost;

      if (totalCost < bestTotalCost) {
        bestTotalCost = totalCost;
        bestTierIdx = idx;
        bestQ = adjQ;
        bestSetupHold = setupHold;
      }

      tierRows.push([
        `${tier.minQty} – ${tier.maxQty ?? '∞'}`,
        roundTo(tier.unitPrice, 2),
        roundTo(eoq, 2),
        roundTo(adjQ, 2),
        statusNote,
        roundTo(setupHold, 2),
        roundTo(purchaseCost, 2),
        roundTo(totalCost, 2),
      ]);
    });

    const discountTable: ResultTable = {
      id: 'inventory-discount',
      title: 'Evaluasi Model Quantity Discount',
      headers: [
        'Rentang Kuantitas',
        'Harga Unit',
        'EOQ Awal',
        'Q Terpakai',
        'Keterangan',
        'Biaya Pesan+Simpan',
        'Biaya Beli',
        'Total Biaya',
      ],
      rows: tierRows,
      highlightRowIndices: bestTierIdx >= 0 ? [bestTierIdx] : [],
    };

    const chosenTier = sortedTiers[bestTierIdx];
    const discountSavings = Math.max(0, baseTierTotalCost - bestTotalCost);

    return {
      jobId,
      moduleId: 'inventory',
      jobTitle,
      status: 'success',
      executionMs: roundTo(performance.now() - start, 2),
      summaryText: `Kuantitas pesan optimal = ${formatNum(bestQ, 2)} unit dengan total biaya minimum ${formatNum(bestTotalCost, 2)}.`,
      kpis: [
        { label: 'Order Quantity Optimal (Q*)', value: formatNum(bestQ, 2), emphasis: 'primary' },
        { label: 'Total Biaya Tahunan', value: formatNum(bestTotalCost, 2), emphasis: 'success' },
        { label: 'Frekuensi Pesan / Tahun', value: formatNum(D / Math.max(1, bestQ), 2) },
        { label: 'Penghematan vs Tier 1', value: formatNum(discountSavings, 2) },
      ],
      tables: [discountTable],
      charts: [],
      warnings: [],
      auditSteps: [
        {
          title: '1. Evaluasi Rentang Harga & EOQ Tier',
          formula: `EOQ = √(2·D·S / H) · Total Biaya = (D×P) + (D/Q)×S + (Q/2)×H`,
          detail: `Menguji ${sortedTiers.length} rentang diskon dan menyesuaikan ke batas minimum/maksimum kuota jika EOQ berada di luar rentang. Q* terbaik = ${formatNum(bestQ, 2)} unit.`,
        },
      ],
      analysis: {
        headline: `Ambil Rentang Diskon ${chosenTier.minQty}–${chosenTier.maxQty ?? '∞'} Unit (Harga ${formatNum(chosenTier.unitPrice, 2)}/unit)`,
        interpretation: `Pemesanan sebesar Q* = ${formatNum(bestQ, 2)} unit (${formatNum(D / Math.max(1, bestQ), 2)} kali/tahun) menghasilkan total biaya terendah ${formatNum(bestTotalCost, 2)} — terdiri dari biaya pembelian ${formatNum(D * chosenTier.unitPrice, 2)} dan biaya pesan+simpan ${formatNum(bestSetupHold, 2)}.`,
        sections: [
          {
            heading: 'Trade-Off Diskon Harga vs Biaya Penyimpanan',
            body:
              bestTierIdx > 0
                ? `Walaupun memesan lebih besar menaikkan rata-rata stok gudang (${formatNum(bestQ / 2, 1)} unit), potongan harga unit dari ${formatNum(sortedTiers[0].unitPrice, 2)} menjadi ${formatNum(chosenTier.unitPrice, 2)} memberi penghematan bersih sebesar ${formatNum(discountSavings, 2)}/tahun dibanding Tier 1.`
                : 'Diskon pada tier lebih tinggi tidak cukup menutupi lonjakan biaya simpan tambahan, sehingga tetap optimal memesan pada rentang dasar.',
            tone: bestTierIdx > 0 ? 'positive' : 'neutral',
          },
        ],
        recommendations: [
          `Pastikan kapasitas gudang mampu menampung stok puncak ${formatNum(bestQ, 0)} unit serta umur simpan barang aman selama siklus ${formatNum((days * bestQ) / Math.max(1, D), 1)} hari.`,
          'Verifikasi dengan pemasok apakah diskon bersifat all-units (berlaku untuk seluruh unit dalam pesanan) sesuai asumsi model.',
        ],
      },
      derivedValues: {
        optimalQ: roundTo(bestQ, 4),
        totalInventoryCost: roundTo(bestSetupHold, 4),
        totalCost: roundTo(bestTotalCost, 4),
        totalCostWithPurchase: roundTo(bestTotalCost, 4),
      },
    };
  }

  // EOQ or POQ
  let qStar = 0;
  let maxInv = 0;
  let factor = 1;
  const warnings: string[] = [];
  const effectiveDailyDemand =
    input.dailyDemandRate !== undefined && input.dailyDemandRate > 0
      ? input.dailyDemandRate
      : D / days;

  if (input.model === 'poq') {
    const dRate = effectiveDailyDemand;
    const pRate =
      input.dailyProductionRate !== undefined && input.dailyProductionRate > 0
        ? input.dailyProductionRate
        : dRate * 2;
    if (pRate <= dRate) {
      warnings.push('Laju produksi harian harus lebih besar dari laju permintaan harian; menggunakan fallback EOQ.');
      qStar = Math.sqrt((2 * D * S) / H);
      maxInv = qStar;
    } else {
      factor = 1 - dRate / pRate;
      qStar = Math.sqrt((2 * D * S) / (H * factor));
      maxInv = qStar * factor;
    }
  } else {
    qStar = Math.sqrt((2 * D * S) / H);
    maxInv = qStar;
  }

  const avgInv = maxInv / 2;
  const ordersPerYear = qStar > 0 ? D / qStar : 0;
  const annualOrderingCost = ordersPerYear * S;
  const annualHoldingCost = avgInv * H;
  const purchaseCost = D * P;
  const totalSetupHolding = annualOrderingCost + annualHoldingCost;
  const totalCostWithPurchase = totalSetupHolding + purchaseCost;
  const cycleDays = ordersPerYear > 0 ? days / ordersPerYear : 0;
  const runDays =
    input.model === 'poq' && input.dailyProductionRate && input.dailyProductionRate > 0
      ? qStar / input.dailyProductionRate
      : null;

  // Reorder Point & Safety Stock
  const dailyDemand = effectiveDailyDemand;
  const leadTime = Math.max(0, input.leadTimeDays ?? 0);
  const z = input.serviceLevelZ ?? 1.645;
  const stdDaily = Math.max(0, input.demandStdDevDaily ?? 0);
  const safetyStock = z * stdDaily * Math.sqrt(leadTime);
  const rop = dailyDemand * leadTime + safetyStock;
  const safetyHoldingCost = safetyStock * H;

  const summaryTable: ResultTable = {
    id: 'inventory-summary',
    title: `Ringkasan Parameter & Hasil (${input.model.toUpperCase()})`,
    headers: ['Metrik', 'Nilai', 'Keterangan'],
    rows: [
      ['Kuantitas Pesan Optimal (Q*)', roundTo(qStar, 2), 'Unit per siklus pemesanan/produksi'],
      ['Persediaan Maksimum (I_max)', roundTo(maxInv, 2), 'Unit puncak di gudang'],
      ['Rata-rata Persediaan', roundTo(avgInv, 2), 'I_max / 2'],
      ['Frekuensi Pesan / Tahun', roundTo(ordersPerYear, 2), 'D / Q*'],
      ['Siklus Antar Pesanan', roundTo(cycleDays, 2), `Hari (basis ${days} hari kerja)`],
      ...(runDays !== null
        ? [['Durasi Run Produksi (Q* / p)', roundTo(runDays, 2), 'Hari produksi per batch POQ']]
        : []),
      ['Biaya Pemesanan / Setup Tahunan', roundTo(annualOrderingCost, 2), '(D / Q*) × S'],
      ['Biaya Penyimpanan Tahunan', roundTo(annualHoldingCost, 2), '(I_max / 2) × H'],
      ['Total Biaya Persediaan (Setup + Simpan)', roundTo(totalSetupHolding, 2), 'Tanpa biaya beli barang'],
      ['Total Biaya Keseluruhan (+ Pembelian)', roundTo(totalCostWithPurchase, 2), 'Termasuk D × Harga Unit'],
      ['Safety Stock (SS)', roundTo(safetyStock, 2), `Cadangan pengaman (biaya simpan ${roundTo(safetyHoldingCost, 2)}/thn)`],
      ['Reorder Point (ROP)', roundTo(rop, 2), 'Titik pemesanan ulang'],
    ],
  };

  // Cost curve around Q*
  const qSteps = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((mult) => Math.max(1, qStar * mult));
  const chartSeries = [
    {
      name: 'Total Biaya (Setup + Simpan)',
      colorToken: 'var(--chart-1)',
      points: qSteps.map((q) => ({
        x: Math.round(q),
        y: roundTo((D / q) * S + ((q * factor) / 2) * H, 2),
      })),
    },
    {
      name: 'Biaya Simpan',
      colorToken: 'var(--chart-2)',
      dashed: true,
      points: qSteps.map((q) => ({
        x: Math.round(q),
        y: roundTo(((q * factor) / 2) * H, 2),
      })),
    },
    {
      name: 'Biaya Pesan',
      colorToken: 'var(--chart-3)',
      dashed: true,
      points: qSteps.map((q) => ({
        x: Math.round(q),
        y: roundTo((D / q) * S, 2),
      })),
    },
  ];

  return {
    jobId,
    moduleId: 'inventory',
    jobTitle,
    status: warnings.length > 0 ? 'warning' : 'success',
    executionMs: roundTo(performance.now() - start, 2),
    summaryText: `Q* optimal = ${formatNum(qStar, 2)} unit (${formatNum(ordersPerYear, 2)}x/tahun), total biaya pesan+simpan = ${formatNum(totalSetupHolding, 2)}.`,
    kpis: [
      { label: 'EOQ / POQ Optimal (Q*)', value: formatNum(qStar, 2), unit: 'unit', emphasis: 'primary' },
      { label: 'Total Biaya Pesan + Simpan', value: formatNum(totalSetupHolding, 2), emphasis: 'success' },
      { label: 'Reorder Point (ROP)', value: formatNum(rop, 2), unit: 'unit' },
      { label: 'Frekuensi Pesan', value: `${formatNum(ordersPerYear, 2)}x / thn` },
    ],
    tables: [summaryTable],
    charts: [
      {
        kind: 'line',
        id: 'eoq-cost-curve',
        title: 'Kurva Trade-Off Biaya Persediaan vs Kuantitas Pesan (Q)',
        xLabel: 'Kuantitas Pesan (Q)',
        yLabel: 'Biaya Tahunan',
        series: chartSeries,
      },
    ],
    warnings,
    auditSteps: [
      {
        title: `1. Kuantitas Pesan Optimal (${input.model.toUpperCase()})`,
        formula:
          input.model === 'poq'
            ? `Q* = √(2·D·S / (H·(1 - d/p))) = √(2·${formatNum(D, 0)}·${formatNum(S, 0)} / (${formatNum(H, 2)}·${roundTo(factor, 3)})) = ${formatNum(qStar, 2)} unit`
            : `Q* = √(2·D·S / H) = √(2·${formatNum(D, 0)}·${formatNum(S, 0)} / ${formatNum(H, 2)}) = ${formatNum(qStar, 2)} unit`,
        detail: `Frekuensi pemesanan ${formatNum(ordersPerYear, 2)} kali/tahun dengan total biaya setup+simpan ${formatNum(totalSetupHolding, 2)}.`,
      },
      {
        title: '2. Safety Stock & Reorder Point (ROP)',
        formula: `SS = Z·σ_d·√L = ${roundTo(safetyStock, 2)} · ROP = d·L + SS = ${roundTo(rop, 2)} unit`,
        detail: `Dihitung dengan rata-rata permintaan harian ${formatNum(dailyDemand, 2)} unit/hari dan lead time ${leadTime} hari.`,
      },
    ],
    analysis: {
      headline: `Pesan ${formatNum(qStar, 0)} Unit Setiap ${formatNum(cycleDays, 1)} Hari Kerja Saat Stok Mencapai ${formatNum(rop, 0)} Unit`,
      interpretation: `Titik keseimbangan optimal tercapai saat biaya pemesanan tahunan (${formatNum(annualOrderingCost, 2)}) tepat sama dengan biaya penyimpanan tahunan (${formatNum(annualHoldingCost, 2)}), menghasilkan total biaya persediaan minimum ${formatNum(totalSetupHolding, 2)}/tahun (${formatNum(ordersPerYear, 2)} siklus/tahun).`,
      sections: [
        {
          heading: 'Keseimbangan Biaya & Sensitivitas Kurva EOQ',
          body: `Kurva biaya total EOQ/POQ bersifat landai di sekitar Q*: penyimpangan lot pesan ±20% dari Q* hanya menaikkan biaya setup+simpan kurang dari 2%, sehingga Q* dapat dibulatkan ke kelipatan kemasan standar pemasok tanpa penalti biaya berarti.`,
          tone: 'positive',
        },
        {
          heading: 'Proteksi Stockout (ROP & Safety Stock)',
          body:
            leadTime > 0
              ? `Dengan lead time ${leadTime} hari dan permintaan ${formatNum(dailyDemand, 2)} unit/hari, permintaan selama waktu tunggu = ${formatNum(dailyDemand * leadTime, 1)} unit. Ditambah Safety Stock ${formatNum(safetyStock, 1)} unit (Z = ${z}, biaya simpan cadangan ${formatNum(safetyHoldingCost, 2)}/thn), pemesanan ulang wajib dipicu saat stok menyentuh ${formatNum(rop, 1)} unit.`
              : 'Lead time = 0 hari (pengiriman instan), sehingga pemesanan ulang dipicu tepat ketika stok mendekati nol.',
          tone: 'neutral',
        },
        ...(runDays !== null
          ? [
              {
                heading: 'Siklus Produksi POQ',
                body: `Setiap batch Q* = ${formatNum(qStar, 1)} unit diproduksi selama ${formatNum(runDays, 1)} hari kerja dengan stok puncak di gudang hanya ${formatNum(maxInv, 1)} unit (lebih hemat ruang ${formatNum((1 - factor) * 100, 1)}% dibanding penerimaan sekaligus EOQ).`,
                tone: 'positive' as const,
              },
            ]
          : []),
      ],
      recommendations: [
        `Atur pemicu pemesanan otomatis (alert ERP/gudang) pada level ROP = ${formatNum(rop, 0)} unit dengan ukuran lot sekitar ${formatNum(qStar, 0)} unit.`,
        `Untuk menurunkan total biaya persediaan lebih jauh secara struktural, fokuskan pengurangan biaya setup/administrasi pesan (S = ${formatNum(S, 2)}) atau pemangkasan lead time pemasok (${leadTime} hari).`,
      ],
    },
    derivedValues: {
      optimalQ: roundTo(qStar, 4),
      totalInventoryCost: roundTo(totalSetupHolding, 4),
      totalCostWithPurchase: roundTo(totalCostWithPurchase, 4),
      rop: roundTo(rop, 4),
    },
  };
}
