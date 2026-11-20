import { formatNum, roundTo } from '../core/math/matrix.ts';
import type {
  ModuleExecutionResult,
  NetworkModelsInput,
  ResultTable,
} from '../core/types/module.types.ts';

export function solveNetworkModels(
  jobId: string,
  jobTitle: string,
  input: NetworkModelsInput,
): ModuleExecutionResult {
  const start = performance.now();
  const edgeNodesSet = new Set<string>();
  for (const e of input.edges) {
    edgeNodesSet.add(e.from);
    edgeNodesSet.add(e.to);
  }
  const edgeNodes = Array.from(edgeNodesSet);
  const allNodesSet = new Set<string>(edgeNodes);
  if (input.sourceNode) allNodesSet.add(input.sourceNode);
  if (input.sinkNode) allNodesSet.add(input.sinkNode);
  const nodes = Array.from(allNodesSet);

  if (input.edges.length === 0 || edgeNodes.length === 0) {
    return {
      jobId,
      moduleId: 'network-models',
      jobTitle,
      status: 'error',
      executionMs: 0,
      summaryText: 'Jaringan tidak memiliki busur (edge).',
      kpis: [],
      tables: [],
      charts: [],
      warnings: ['Tambahkan minimal 1 sisi/busur jaringan.'],
      derivedValues: {},
      error: 'Jaringan kosong.',
    };
  }

  if (input.mode === 'shortest-route') {
    const dist = new Map<string, number>();
    const prev = new Map<string, string | null>();
    for (const n of nodes) {
      dist.set(n, Infinity);
      prev.set(n, null);
    }
    dist.set(input.sourceNode, 0);

    const relaxedEdges: { from: string; to: string; weight: number }[] = [];
    for (const e of input.edges) {
      relaxedEdges.push(e);
      if (!input.directed) {
        relaxedEdges.push({ from: e.to, to: e.from, weight: e.weight });
      }
    }

    // Bellman-Ford safe for negative weights + explicit negative-cycle detection
    for (let iter = 0; iter < nodes.length - 1; iter += 1) {
      let updated = false;
      for (const e of relaxedEdges) {
        const dFrom = dist.get(e.from) ?? Infinity;
        if (Number.isFinite(dFrom) && dFrom + e.weight < (dist.get(e.to) ?? Infinity) - 1e-12) {
          dist.set(e.to, dFrom + e.weight);
          prev.set(e.to, e.from);
          updated = true;
        }
      }
      if (!updated) break;
    }

    // N-th pass: detect negative-weight cycles reachable from source
    let hasNegativeCycle = false;
    for (const e of relaxedEdges) {
      const dFrom = dist.get(e.from) ?? Infinity;
      if (Number.isFinite(dFrom) && dFrom + e.weight < (dist.get(e.to) ?? Infinity) - 1e-9) {
        hasNegativeCycle = true;
        break;
      }
    }

    if (hasNegativeCycle) {
      return {
        jobId,
        moduleId: 'network-models',
        jobTitle,
        status: 'error',
        executionMs: roundTo(performance.now() - start, 2),
        summaryText: 'Siklus berbobot negatif (Negative Weight Cycle) terdeteksi — rute terpendek tidak terdefinisi (-∞).',
        kpis: [
          { label: 'Status Jaringan', value: 'Negative Cycle', emphasis: 'danger' },
          { label: 'Jumlah Node', value: nodes.length },
        ],
        tables: [],
        charts: [],
        warnings: ['Jaringan mengandung siklus berbobot negatif yang dapat dijangkau dari node sumber, sehingga jarak dapat terus menurun menuju -∞.'],
        analysis: {
          headline: 'Siklus Negatif Terdeteksi — Rute Terpendek Tidak Terbatas (-∞)',
          interpretation: `Pass verifikasi ke-${nodes.length} algoritma Bellman-Ford menemukan busur yang masih dapat direlaksasi. Artinya terdapat lintasan tertutup dengan jumlah bobot negatif yang dapat dilalui berulang kali tanpa batas.`,
          sections: [
            {
              heading: 'Implikasi Matematis',
              body: 'Dalam pemodelan jaringan transportasi/biaya, siklus negatif biasanya mengindikasikan kesalahan tanda bobot pada graf tak berarah (setiap sisi negatif tak berarah langsung membentuk siklus negatif 2-node) atau kesalahan input biaya.',
              tone: 'critical',
            },
          ],
          recommendations: [
            'Periksa kembali bobot sisi bernilai negatif pada tabel jaringan dan pastikan arah graf (directed vs undirected) sesuai dengan struktur nyata.',
          ],
        },
        derivedValues: { hasNegativeCycle: 1 },
        error: 'Negative weight cycle terdeteksi pada graf.',
      };
    }

    const totalDist = dist.get(input.sinkNode) ?? Infinity;
    const path: string[] = [];
    if (Number.isFinite(totalDist)) {
      let cur: string | null = input.sinkNode;
      const guard = new Set<string>();
      while (cur && !guard.has(cur)) {
        guard.add(cur);
        path.unshift(cur);
        if (cur === input.sourceNode) break;
        cur = prev.get(cur) ?? null;
      }
    }

    const pathSet = new Set(path);
    const isReachable = Number.isFinite(totalDist) && path[0] === input.sourceNode;
    const pathStr = isReachable ? path.join(' → ') : 'Tidak terjangkau';
    const unreachableNodes = nodes.filter((n) => !Number.isFinite(dist.get(n) ?? Infinity));

    const pathStepsTable: ResultTable = {
      id: 'network-shortest',
      title: `Jarak Terpendek dari "${input.sourceNode}" ke Semua Node`,
      headers: ['Node Tujuan', 'Jarak Minimum', 'Node Sebelumnya', 'Pada Rute Optimal'],
      rows: nodes.map((n) => [
        n,
        Number.isFinite(dist.get(n) ?? Infinity) ? roundTo(dist.get(n)!, 2) : '∞',
        prev.get(n) ?? '-',
        isReachable && pathSet.has(n) ? 'Ya ★' : '-',
      ]),
      highlightRowIndices: nodes
        .map((n, idx) => (isReachable && pathSet.has(n) ? idx : -1))
        .filter((idx) => idx !== -1),
    };

    const hopCount = isReachable ? Math.max(0, path.length - 1) : 0;

    return {
      jobId,
      moduleId: 'network-models',
      jobTitle,
      status: isReachable ? 'success' : 'warning',
      executionMs: roundTo(performance.now() - start, 2),
      summaryText: isReachable
        ? `Rute terpendek ${input.sourceNode} → ${input.sinkNode}: ${pathStr} (Total = ${formatNum(totalDist, 2)}).`
        : `Node tujuan "${input.sinkNode}" tidak terjangkau dari "${input.sourceNode}".`,
      kpis: [
        {
          label: `Jarak Terpendek (${input.sourceNode}→${input.sinkNode})`,
          value: isReachable ? formatNum(totalDist, 2) : '∞',
          emphasis: 'primary',
        },
        { label: 'Rute Optimal', value: pathStr, emphasis: isReachable ? 'success' : 'warning' },
        { label: 'Jumlah Segmen (Hop)', value: hopCount },
        { label: 'Jumlah Node', value: nodes.length },
      ],
      tables: [pathStepsTable],
      charts: [],
      warnings: isReachable ? [] : ['Tidak ada jalur yang menghubungkan sumber ke tujuan.'],
      auditSteps: [
        {
          title: '1. Pencarian Rute Terpendek (Bellman-Ford + Verifikasi Siklus Negatif)',
          formula: 'dist[v] = min(dist[v], dist[u] + weight(u, v)) · V-1 iterasi + pass deteksi siklus',
          detail: `Rute dari "${input.sourceNode}" ke "${input.sinkNode}": ${pathStr} (${hopCount} segmen) dengan total bobot = ${isReachable ? formatNum(totalDist, 2) : '∞'}.`,
        },
      ],
      analysis: {
        headline: isReachable
          ? `Lintasan Minimum ${input.sourceNode} → ${input.sinkNode} Sebesar ${formatNum(totalDist, 2)} Melalui ${hopCount} Segmen`
          : `Tujuan "${input.sinkNode}" Terisolasi dari Sumber "${input.sourceNode}"`,
        interpretation: isReachable
          ? `Algoritma Bellman-Ford menemukan lintasan optimal ${pathStr} pada graf ${input.directed ? 'berarah (directed)' : 'tak berarah (undirected)'} dengan bobot kumulatif ${formatNum(totalDist, 2)} (rata-rata ${formatNum(totalDist / Math.max(1, hopCount), 2)} per segmen). Sebanyak ${nodes.length - unreachableNodes.length} dari ${nodes.length} node dapat dijangkau dari "${input.sourceNode}".`
          : `Tidak ada rangkaian busur yang menghubungkan "${input.sourceNode}" ke "${input.sinkNode}" pada konfigurasi graf ${input.directed ? 'berarah' : 'tak berarah'} saat ini.`,
        sections: [
          {
            heading: 'Konektivitas & Jangkauan Jaringan',
            body:
              unreachableNodes.length === 0
                ? `Seluruh ${nodes.length} node jaringan dapat dicapai dari "${input.sourceNode}" tanpa siklus negatif.`
                : `${unreachableNodes.length} node tidak dapat dijangkau dari "${input.sourceNode}": ${unreachableNodes.join(', ')}.`,
            tone: unreachableNodes.length === 0 ? 'positive' : 'caution',
          },
        ],
        recommendations: [
          isReachable
            ? `Tetapkan koridor "${pathStr}" sebagai jalur distribusi/routing utama dan pantau keandalan ${hopCount} segmennya agar tidak terjadi hambatan.`
            : `Tambahkan busur penghubung menuju "${input.sinkNode}" atau ubah mode graf menjadi tak berarah apabila perjalanan dua arah diperbolehkan.`,
          'Lakukan analisis rute cadangan (menghapus 1 busur utama pada rute optimal) untuk menguji ketahanan jaringan apabila salah satu jalur terganggu.',
        ],
      },
      derivedValues: {
        shortestDistance: isReachable ? roundTo(totalDist, 4) : -1,
        path: pathStr,
        hopCount,
      },
    };
  }

  if (input.mode === 'mst') {
    // Kruskal's Algorithm strictly over nodes present in edges (ignore orphan source/sink fields)
    const parent = new Map<string, string>();
    for (const n of edgeNodes) parent.set(n, n);
    const find = (x: string): string => {
      let r = x;
      while (parent.get(r) !== r) r = parent.get(r)!;
      let curr = x;
      while (curr !== r) {
        const next = parent.get(curr)!;
        parent.set(curr, r);
        curr = next;
      }
      return r;
    };

    const sortedEdges = [...input.edges].sort((a, b) => a.weight - b.weight);
    const selected: typeof sortedEdges = [];
    let totalWeight = 0;

    for (const e of sortedEdges) {
      const ra = find(e.from);
      const rb = find(e.to);
      if (ra !== rb) {
        parent.set(ra, rb);
        selected.push(e);
        totalWeight += e.weight;
      }
    }

    const totalAllEdgesWeight = input.edges.reduce((acc, e) => acc + e.weight, 0);
    const redundancySavings = totalAllEdgesWeight - totalWeight;
    const savingsPct = totalAllEdgesWeight > 1e-9 ? (redundancySavings / totalAllEdgesWeight) * 100 : 0;
    const isConnected = selected.length === edgeNodes.length - 1;
    const warnings = isConnected
      ? []
      : [`Graf tidak terhubung penuh: MST hanya mencakup ${selected.length} dari ${edgeNodes.length - 1} sisi yang dibutuhkan (membentuk hutan ${edgeNodes.length - selected.length} komponen).`];

    const heaviestEdge = selected[selected.length - 1];

    return {
      jobId,
      moduleId: 'network-models',
      jobTitle,
      status: isConnected ? 'success' : 'warning',
      executionMs: roundTo(performance.now() - start, 2),
      summaryText: `Minimum Spanning Tree (Kruskal): total panjang/biaya = ${formatNum(totalWeight, 2)} dengan ${selected.length} cabang terpilih.`,
      kpis: [
        { label: 'Total Panjang / Biaya MST', value: formatNum(totalWeight, 2), emphasis: 'primary' },
        { label: 'Cabang Terpilih', value: `${selected.length} / ${Math.max(0, edgeNodes.length - 1)}`, emphasis: isConnected ? 'success' : 'warning' },
        { label: 'Hemat vs Semua Sisi', value: `${formatNum(savingsPct, 1)}%`, unit: formatNum(redundancySavings, 1) },
      ],
      tables: [
        {
          id: 'network-mst',
          title: 'Daftar Sisi Terpilih pada Minimum Spanning Tree',
          headers: ['Urutan', 'Dari Node', 'Ke Node', 'Bobot / Jarak'],
          rows: selected.map((e, idx) => [idx + 1, e.from, e.to, roundTo(e.weight, 2)]),
        },
      ],
      charts: [],
      warnings,
      auditSteps: [
        {
          title: '1. Minimum Spanning Tree (Algoritma Kruskal)',
          formula: 'Urutkan busur w_min → w_max, pilih sisi jika tidak membentuk siklus (Disjoint Set Union)',
          detail: `Terpilih ${selected.length} cabang menghubungkan ${edgeNodes.length} node dengan total bobot ${formatNum(totalWeight, 2)} (menghemat ${formatNum(redundancySavings, 2)} dari total seluruh kandidat sisi ${formatNum(totalAllEdgesWeight, 2)}).`,
        },
      ],
      analysis: {
        headline: isConnected
          ? `Jaringan Pohon Merentang Minimum Menghubungkan ${edgeNodes.length} Node dengan Total Bobot ${formatNum(totalWeight, 2)}`
          : `Graf Terpisah — Hanya ${selected.length} dari ${edgeNodes.length - 1} Cabang Terhubung`,
        interpretation: `Algoritma Kruskal memilih tepat ${selected.length} cabang termurah tanpa membentuk siklus, menghasilkan total panjang/biaya infrastruktur ${formatNum(totalWeight, 2)}. Dibanding membangun seluruh ${input.edges.length} koneksi kandidat (${formatNum(totalAllEdgesWeight, 2)}), topologi MST menghemat ${formatNum(redundancySavings, 2)} (${formatNum(savingsPct, 1)}%).`,
        sections: [
          {
            heading: 'Struktur Infrastruktur & Cabang Termahal',
            body: heaviestEdge
              ? `Cabang dengan bobot terbesar yang tetap wajib dibangun adalah ${heaviestEdge.from}–${heaviestEdge.to} (${formatNum(heaviestEdge.weight, 2)}). Karena MST tidak memiliki lintasan ganda (redundancy = 0), terputusnya satu cabang mana pun akan memisahkan jaringan.`
              : 'Tidak ada cabang terpilih.',
            tone: isConnected ? 'neutral' : 'caution',
          },
        ],
        recommendations: [
          `Bangun tepat ${selected.length} koneksi pada tabel MST untuk meminimalkan biaya instalasi kabel/pipa/jaringan.`,
          'Jika jaringan menuntut keandalan tinggi (failover), pertimbangkan menambah 1–2 cabang cadangan termurah dari sisi yang tidak terpilih untuk membentuk ring redundansi pada titik kritis.',
        ],
      },
      derivedValues: {
        mstWeight: roundTo(totalWeight, 4),
        selectedEdges: selected.length,
        isConnected: isConnected ? 1 : 0,
      },
    };
  }

  // Max Flow (Edmonds-Karp) + Minimum S-T Cut Verification
  if (input.sourceNode === input.sinkNode) {
    return {
      jobId,
      moduleId: 'network-models',
      jobTitle,
      status: 'warning',
      executionMs: roundTo(performance.now() - start, 2),
      summaryText: 'Node sumber dan tujuan tidak boleh sama pada analisis Maximal Flow.',
      kpis: [{ label: 'Maximal Flow', value: '0', emphasis: 'warning' }],
      tables: [],
      charts: [],
      warnings: ['Node sumber dan tujuan identik; pilih dua node berbeda untuk menghitung kapasitas arus maksimum.'],
      analysis: {
        headline: 'Sumber dan Tujuan Identik — Arus Maksimum Tidak Terdefinisi',
        interpretation: `Node sumber ("${input.sourceNode}") sama dengan node tujuan ("${input.sinkNode}").`,
        sections: [
          {
            heading: 'Validasi Topologi',
            body: 'Model Maximal Flow memerlukan satu node sumber (source) dan satu node tujuan (sink) yang berbeda untuk mencari lintasan augmentasi kapasitas.',
            tone: 'caution',
          },
        ],
        recommendations: ['Ubah Source Node atau Sink Node agar menunjuk dua titik berbeda di jaringan.'],
      },
      derivedValues: { maxFlow: 0 },
    };
  }

  const warnings: string[] = [];
  const cap = new Map<string, Map<string, number>>();
  const flow = new Map<string, Map<string, number>>();
  for (const n of nodes) {
    cap.set(n, new Map());
    flow.set(n, new Map());
  }

  for (const e of input.edges) {
    const w = Math.max(0, e.weight);
    if (e.weight < 0) {
      warnings.push(`Kapasitas negatif pada busur ${e.from}→${e.to} (${e.weight}) diperlakukan sebagai 0.`);
    }
    cap.get(e.from)!.set(e.to, (cap.get(e.from)!.get(e.to) ?? 0) + w);
    if (!input.directed) {
      cap.get(e.to)!.set(e.from, (cap.get(e.to)!.get(e.from) ?? 0) + w);
    }
  }

  let maxFlow = 0;
  let augmentingPaths = 0;
  while (true) {
    const parent = new Map<string, string>();
    const queue = [input.sourceNode];
    const visited = new Set<string>([input.sourceNode]);

    let foundSink = false;
    while (queue.length > 0 && !foundSink) {
      const u = queue.shift()!;
      const neighbors = new Set<string>([
        ...(cap.get(u)?.keys() ?? []),
        ...(flow.get(u)?.keys() ?? []),
      ]);
      for (const v of neighbors) {
        const c = cap.get(u)?.get(v) ?? 0;
        const f = flow.get(u)?.get(v) ?? 0;
        if (!visited.has(v) && c - f > 1e-9) {
          visited.add(v);
          parent.set(v, u);
          if (v === input.sinkNode) {
            foundSink = true;
            break;
          }
          queue.push(v);
        }
      }
    }

    if (!foundSink) break;

    let pathFlow = Infinity;
    let v = input.sinkNode;
    while (v !== input.sourceNode) {
      const u = parent.get(v)!;
      const residual = (cap.get(u)?.get(v) ?? 0) - (flow.get(u)?.get(v) ?? 0);
      pathFlow = Math.min(pathFlow, residual);
      v = u;
    }

    v = input.sinkNode;
    while (v !== input.sourceNode) {
      const u = parent.get(v)!;
      flow.get(u)!.set(v, (flow.get(u)!.get(v) ?? 0) + pathFlow);
      flow.get(v)!.set(u, (flow.get(v)!.get(u) ?? 0) - pathFlow);
      v = u;
    }

    maxFlow += pathFlow;
    augmentingPaths += 1;
  }

  // Compute Minimum S-T Cut via BFS on final residual graph (Max-Flow Min-Cut Theorem)
  const reachableS = new Set<string>([input.sourceNode]);
  const bfsQueue = [input.sourceNode];
  while (bfsQueue.length > 0) {
    const u = bfsQueue.shift()!;
    const neighbors = new Set<string>([
      ...(cap.get(u)?.keys() ?? []),
      ...(flow.get(u)?.keys() ?? []),
    ]);
    for (const v of neighbors) {
      const residual = (cap.get(u)?.get(v) ?? 0) - (flow.get(u)?.get(v) ?? 0);
      if (!reachableS.has(v) && residual > 1e-9) {
        reachableS.add(v);
        bfsQueue.push(v);
      }
    }
  }

  const minCutArcs: { from: string; to: string; cap: number }[] = [];
  for (const e of input.edges) {
    const w = Math.max(0, e.weight);
    if (w <= 1e-9) continue;
    if (reachableS.has(e.from) && !reachableS.has(e.to)) {
      minCutArcs.push({ from: e.from, to: e.to, cap: w });
    } else if (!input.directed && reachableS.has(e.to) && !reachableS.has(e.from)) {
      minCutArcs.push({ from: e.to, to: e.from, cap: w });
    }
  }
  const minCutCap = minCutArcs.reduce((s, a) => s + a.cap, 0);

  // Allocate aggregate net flow cleanly across parallel & undirected edges
  const remainingPairFlow = new Map<string, number>();
  for (const [u, inner] of flow.entries()) {
    for (const [v, val] of inner.entries()) {
      if (val > 1e-9) {
        remainingPairFlow.set(`${u}=>${v}`, val);
      }
    }
  }

  const bottleneckIndices: number[] = [];
  const flowRows = input.edges.map((e, idx) => {
    const w = Math.max(0, e.weight);
    const fwdKey = `${e.from}=>${e.to}`;
    const revKey = `${e.to}=>${e.from}`;
    const availFwd = remainingPairFlow.get(fwdKey) ?? 0;
    const availRev = !input.directed ? (remainingPairFlow.get(revKey) ?? 0) : 0;

    let used = 0;
    let directionLabel = `${e.from} → ${e.to}`;
    if (availFwd > 1e-9) {
      used = Math.min(w, availFwd);
      remainingPairFlow.set(fwdKey, availFwd - used);
    } else if (availRev > 1e-9) {
      used = Math.min(w, availRev);
      remainingPairFlow.set(revKey, availRev - used);
      directionLabel = `${e.to} → ${e.from} (balik)`;
    }

    const utilPct = w > 1e-9 ? (used / w) * 100 : 0;
    const isMinCut =
      (reachableS.has(e.from) && !reachableS.has(e.to)) ||
      (!input.directed && reachableS.has(e.to) && !reachableS.has(e.from));
    if (isMinCut && w > 1e-9) bottleneckIndices.push(idx);

    return [
      directionLabel,
      roundTo(w, 2),
      roundTo(used, 2),
      `${roundTo(utilPct, 1)}%`,
      isMinCut && w > 1e-9 ? 'Min-Cut Bottleneck' : utilPct >= 99.9 ? 'Jenuh' : 'Longgar',
    ];
  });

  const minCutLabels = minCutArcs.map((a) => `${a.from}→${a.to} (${formatNum(a.cap, 1)})`);

  return {
    jobId,
    moduleId: 'network-models',
    jobTitle,
    status: warnings.length > 0 ? 'warning' : 'success',
    executionMs: roundTo(performance.now() - start, 2),
    summaryText: `Arus Maksimum (Max Flow) dari "${input.sourceNode}" ke "${input.sinkNode}" = ${formatNum(maxFlow, 2)} (Min-Cut = ${formatNum(minCutCap, 2)}).`,
    kpis: [
      { label: 'Maximal Flow', value: formatNum(maxFlow, 2), emphasis: 'primary' },
      { label: 'Kapasitas Min-Cut', value: formatNum(minCutCap, 2), emphasis: 'success' },
      { label: 'Sumber → Tujuan', value: `${input.sourceNode} → ${input.sinkNode}` },
      { label: 'Busur Bottleneck', value: minCutArcs.length, unit: 'busur' },
    ],
    tables: [
      {
        id: 'network-maxflow',
        title: 'Alokasi Arus & Identifikasi Min-Cut (Edmonds-Karp)',
        headers: ['Arah Arus', 'Kapasitas', 'Arus Terpakai', 'Utilisasi', 'Status Kapasitas'],
        rows: flowRows,
        highlightRowIndices: bottleneckIndices,
      },
    ],
    charts: [],
    warnings,
    auditSteps: [
      {
        title: '1. Edmonds-Karp Maximum Flow & Teorema Max-Flow Min-Cut',
        formula: `Max Flow = Min-Cut Capacity = ∑ c(u,v) [u∈S, v∉S] = ${formatNum(maxFlow, 2)}`,
        detail: `Ditemukan dalam ${augmentingPaths} lintasan augmentasi BFS. Partisi sumber S = {${Array.from(reachableS).join(', ')}} terpotong oleh ${minCutArcs.length} busur bottleneck (${minCutLabels.join(', ') || '-'}).`,
      },
    ],
    analysis: {
      headline: `Throughput Maksimum = ${formatNum(maxFlow, 2)} Terkunci pada ${minCutArcs.length} Busur Min-Cut`,
      interpretation: `Kapasitas aliran tertinggi yang dapat disalurkan dari "${input.sourceNode}" ke "${input.sinkNode}" adalah ${formatNum(maxFlow, 2)} unit arus. Sesuai Teorema Max-Flow Min-Cut, kapasitas irisan minimum (Min-Cut = ${formatNum(minCutCap, 2)}) persis menyamai arus maksimum — membuktikan solusi optimal global telah tercapai.`,
      sections: [
        {
          heading: 'Identifikasi Bottleneck (Minimum S-T Cut)',
          body:
            minCutArcs.length > 0
              ? `Busur pembatas utama (utilisasi 100% pada batas partisi S → T) adalah: ${minCutLabels.join(', ')}. Menambah kapasitas pada busur di luar daftar ini tidak akan menaikkan total arus jaringan.`
              : `Tidak ada jalur berkapasitas positif dari "${input.sourceNode}" menuju "${input.sinkNode}" (Max Flow = 0).`,
          tone: minCutArcs.length > 0 ? 'caution' : 'critical',
        },
      ],
      recommendations: [
        minCutArcs.length > 0
          ? `Fokuskan investasi ekspansi kapasitas secara eksklusif pada busur Min-Cut (${minCutArcs.map((a) => `${a.from}→${a.to}`).join(', ')}) — hanya pelebaran busur inilah yang dapat meningkatkan throughput di atas ${formatNum(maxFlow, 2)}.`
          : `Bangun koneksi baru berkapasitas positif yang menghubungkan himpunan sumber {${Array.from(reachableS).join(', ')}} menuju tujuan "${input.sinkNode}".`,
        'Evaluasi busur berstatus "Longgar" (utilisasi rendah) untuk potensi realokasi kapasitas atau penjadwalan pemeliharaan tanpa menurunkan arus maksimum.',
      ],
    },
    derivedValues: {
      maxFlow: roundTo(maxFlow, 4),
      minCutCapacity: roundTo(minCutCap, 4),
    },
  };
}
