import type { ModuleId, ModuleInputMap } from '../../core/types/module.types.ts';
import type { ModuleJob, PipelineLink } from '../../core/types/workspace.types.ts';

export const DEFAULT_MODULE_INPUTS: ModuleInputMap = {
  'linear-programming': {
    sense: 'max',
    variableNames: ['Meja', 'Kursi'],
    objectiveCoeffs: [70, 50],
    constraints: [
      { name: 'Jam Pertukangan', coeffs: [4, 3], sign: '<=', rhs: 240 },
      { name: 'Jam Pengecatan', coeffs: [2, 1], sign: '<=', rhs: 100 },
      { name: 'Maksimal Kursi', coeffs: [0, 1], sign: '<=', rhs: 60 },
    ],
  },
  'integer-programming': {
    sense: 'max',
    variableNames: ['Proyek A', 'Proyek B', 'Proyek C', 'Proyek D'],
    objectiveCoeffs: [150, 210, 120, 95],
    variableTypes: ['binary', 'binary', 'binary', 'binary'],
    constraints: [
      { name: 'Anggaran Tahun 1', coeffs: [40, 65, 35, 25], sign: '<=', rhs: 110 },
      { name: 'Tenaga Ahli', coeffs: [3, 4, 2, 2], sign: '<=', rhs: 8 },
    ],
  },
  transportation: {
    sense: 'min',
    sourceNames: ['Pabrik Jakarta', 'Pabrik Bandung', 'Pabrik Surabaya'],
    destinationNames: ['Gudang Medan', 'Gudang Semarang', 'Gudang Makassar', 'Gudang Bali'],
    costs: [
      [12, 8, 18, 15],
      [14, 6, 16, 12],
      [19, 10, 11, 7],
    ],
    supplies: [300, 450, 350],
    demands: [250, 320, 280, 250],
  },
  assignment: {
    sense: 'min',
    agentNames: ['Tim Alpha', 'Tim Beta', 'Tim Gamma', 'Tim Delta'],
    taskNames: ['Lini Perakitan', 'Lini Pengemasan', 'Quality Audit', 'Kalibrasi CNC'],
    costs: [
      [14, 18, 22, 16],
      [19, 12, 15, 21],
      [15, 20, 11, 14],
      [21, 16, 19, 12],
    ],
  },
  'project-management': {
    mode: 'pert',
    targetTime: 26,
    activities: [
      { id: 'A', name: 'Desain Produk', predecessors: [], optimistic: 3, mostLikely: 4, pessimistic: 5 },
      { id: 'B', name: 'Riset Supplier', predecessors: [], optimistic: 2, mostLikely: 3, pessimistic: 4 },
      { id: 'C', name: 'Pembuatan Cetakan', predecessors: ['A'], optimistic: 5, mostLikely: 7, pessimistic: 11 },
      { id: 'D', name: 'Pengadaan Material', predecessors: ['B'], optimistic: 4, mostLikely: 6, pessimistic: 8 },
      { id: 'E', name: 'Uji Prototipe', predecessors: ['C', 'D'], optimistic: 4, mostLikely: 5, pessimistic: 8 },
      { id: 'F', name: 'Setup Lini Produksi', predecessors: ['C'], optimistic: 3, mostLikely: 4, pessimistic: 7 },
      { id: 'G', name: 'Produksi Perdana', predecessors: ['E', 'F'], optimistic: 5, mostLikely: 6, pessimistic: 9 },
    ],
  },
  forecasting: {
    periodLabels: ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'],
    values: [410, 435, 420, 460, 485, 470, 510, 535, 525, 560, 590, 610],
    movingAvgWindow: 3,
    weightedWeights: [0.5, 0.3, 0.2],
    alpha: 0.35,
    beta: 0.25,
    horizon: 3,
  },
  inventory: {
    model: 'eoq',
    annualDemand: 7200,
    orderingCost: 150,
    holdingCostPerUnit: 12,
    unitPrice: 45,
    dailyDemandRate: 24,
    dailyProductionRate: 60,
    leadTimeDays: 5,
    demandStdDevDaily: 4,
    serviceLevelZ: 1.645,
    workingDaysPerYear: 300,
    discountTiers: [
      { minQty: 1, maxQty: 499, unitPrice: 45 },
      { minQty: 500, maxQty: 999, unitPrice: 42 },
      { minQty: 1000, maxQty: null, unitPrice: 39 },
    ],
    abcItems: [
      { sku: 'Motor Servo', annualUsage: 1200, unitCost: 85 },
      { sku: 'Panel Kontrol', annualUsage: 800, unitCost: 62 },
      { sku: 'Bearing Baja', annualUsage: 6500, unitCost: 4.5 },
      { sku: 'Kabel Sensor', annualUsage: 9000, unitCost: 1.8 },
      { sku: 'Baut M8', annualUsage: 25000, unitCost: 0.25 },
    ],
  },
  'waiting-lines': {
    model: 'mms',
    arrivalRate: 18,
    serviceRate: 8,
    servers: 3,
    systemCapacity: 12,
    waitingCostPerHour: 35,
    serverCostPerHour: 22,
    timeUnit: 'jam',
  },
  'break-even': {
    fixedCost: 120000,
    variableCostPerUnit: 32,
    sellingPricePerUnit: 58,
    targetProfit: 75000,
    expectedVolume: 7200,
    alternatives: [
      { name: 'Proses Manual', fixedCost: 45000, variableCost: 45 },
      { name: 'Semi-Otomatis', fixedCost: 120000, variableCost: 32 },
      { name: 'Otomasi Penuh', fixedCost: 240000, variableCost: 18 },
    ],
  },
  'decision-analysis': {
    alternativeNames: ['Bangun Pabrik Besar', 'Bangun Pabrik Sedang', 'Ekspansi Bertahap', 'Subkontrak'],
    stateNames: ['Pasar Tinggi', 'Pasar Sedang', 'Pasar Lesu'],
    probabilities: [0.35, 0.45, 0.2],
    payoffs: [
      [420, 190, -110],
      [260, 210, -25],
      [190, 150, 40],
      [130, 105, 65],
    ],
    hurwiczAlpha: 0.65,
    isCostTable: false,
  },
  'quality-control': {
    chartType: 'xbar-r',
    subgroupSize: 4,
    usl: 50.8,
    lsl: 49.2,
    samples: [
      { label: 'S1', values: [50.1, 49.9, 50.2, 50.0] },
      { label: 'S2', values: [50.3, 50.0, 49.8, 50.1] },
      { label: 'S3', values: [49.7, 50.1, 50.2, 49.9] },
      { label: 'S4', values: [50.4, 50.3, 50.1, 50.2] },
      { label: 'S5', values: [49.8, 49.6, 50.0, 49.9] },
      { label: 'S6', values: [50.2, 50.1, 50.3, 50.0] },
      { label: 'S7', values: [50.6, 50.7, 50.5, 50.8] },
      { label: 'S8', values: [50.0, 49.9, 50.1, 50.0] },
    ],
  },
  'network-models': {
    mode: 'shortest-route',
    sourceNode: 'Gudang Pusat',
    sinkNode: 'Pelabuhan',
    directed: false,
    edges: [
      { from: 'Gudang Pusat', to: 'Hub Barat', weight: 14 },
      { from: 'Gudang Pusat', to: 'Hub Tengah', weight: 10 },
      { from: 'Hub Barat', to: 'Hub Utara', weight: 12 },
      { from: 'Hub Tengah', to: 'Hub Utara', weight: 9 },
      { from: 'Hub Tengah', to: 'Hub Selatan', weight: 16 },
      { from: 'Hub Utara', to: 'Pelabuhan', weight: 15 },
      { from: 'Hub Selatan', to: 'Pelabuhan', weight: 8 },
      { from: 'Hub Barat', to: 'Hub Selatan', weight: 11 },
    ],
  },
  'markov-analysis': {
    stateNames: ['Brand Kita', 'Kompetitor A', 'Kompetitor B'],
    initialVector: [0.4, 0.35, 0.25],
    transitionMatrix: [
      [0.82, 0.11, 0.07],
      [0.14, 0.76, 0.1],
      [0.12, 0.08, 0.8],
    ],
    steps: 6,
  },
  mrp: {
    periodLabels: ['M1', 'M2', 'M3', 'M4', 'M5', 'M6'],
    items: [
      {
        item: 'Produk Meja',
        level: 0,
        qtyPerParent: 1,
        leadTime: 1,
        onHand: 30,
        safetyStock: 0,
        lotSizing: 'L4L',
        grossRequirements: [0, 50, 40, 70, 60, 80],
        scheduledReceipts: [0, 20, 0, 0, 0, 0],
      },
      {
        item: 'Kaki Meja',
        level: 1,
        parent: 'Produk Meja',
        qtyPerParent: 4,
        leadTime: 1,
        onHand: 100,
        safetyStock: 20,
        lotSizing: 'FOQ',
        fixedOrderQty: 150,
        grossRequirements: [0, 0, 0, 0, 0, 0],
        scheduledReceipts: [0, 0, 0, 0, 0, 0],
      },
      {
        item: 'Papan Atas',
        level: 1,
        parent: 'Produk Meja',
        qtyPerParent: 1,
        leadTime: 1,
        onHand: 25,
        safetyStock: 10,
        lotSizing: 'L4L',
        grossRequirements: [0, 0, 0, 0, 0, 0],
        scheduledReceipts: [0, 0, 0, 0, 0, 0],
      },
    ],
  },
  'aggregate-planning': {
    periodLabels: ['Q1', 'Q2', 'Q3', 'Q4'],
    demands: [1200, 1650, 1900, 1450],
    regularCapacity: [1400, 1400, 1400, 1400],
    overtimeCapacity: [250, 250, 300, 250],
    subcontractCapacity: [300, 300, 350, 300],
    initialInventory: 150,
    initialWorkforce: 28,
    unitsPerWorker: 50,
    regularCostPerUnit: 25,
    overtimeCostPerUnit: 36,
    subcontractCostPerUnit: 42,
    holdingCostPerUnit: 4,
    backorderCostPerUnit: 18,
    hiringCostPerWorker: 400,
    firingCostPerWorker: 600,
  },
  scheduling: {
    mode: 'single-machine',
    jobs: [
      { jobId: 'Order-101', processingTime: 6, processingTimeMachine2: 4, dueDate: 12 },
      { jobId: 'Order-102', processingTime: 3, processingTimeMachine2: 7, dueDate: 7 },
      { jobId: 'Order-103', processingTime: 9, processingTimeMachine2: 5, dueDate: 24 },
      { jobId: 'Order-104', processingTime: 4, processingTimeMachine2: 8, dueDate: 10 },
      { jobId: 'Order-105', processingTime: 7, processingTimeMachine2: 3, dueDate: 18 },
    ],
  },
};

export function createJobForModule(
  moduleId: ModuleId,
  customTitle?: string,
  sourceFile?: string,
  sourceSheet?: string,
): ModuleJob {
  return {
    id: `job-${moduleId}-${Math.random().toString(36).slice(2, 8)}`,
    moduleId,
    title: customTitle ?? defaultTitleForModule(moduleId),
    enabled: true,
    sourceFile,
    sourceSheet,
    input: structuredClone(DEFAULT_MODULE_INPUTS[moduleId]),
    updatedAt: Date.now(),
  };
}

function defaultTitleForModule(moduleId: ModuleId): string {
  const titles: Record<ModuleId, string> = {
    'linear-programming': 'Optimasi Bauran Produk (LP)',
    'integer-programming': 'Seleksi Proyek Investasi (IP)',
    transportation: 'Distribusi Antar Pabrik-Gudang',
    assignment: 'Penugasan Tim Produksi',
    'project-management': 'Peluncuran Produk Baru (PERT/CPM)',
    forecasting: 'Peramalan Permintaan 12 Bulan',
    inventory: 'Pengendalian Persediaan (EOQ/ROP)',
    'waiting-lines': 'Antrean Layanan Pelanggan (M/M/s)',
    'break-even': 'Analisis Titik Impas & Proses',
    'decision-analysis': 'Keputusan Ekspansi Kapasitas',
    'quality-control': 'Peta Kendali X-bar & R',
    'network-models': 'Rute Terpendek Jaringan Logistik',
    'markov-analysis': 'Prediksi Pangsa Pasar Markov',
    mrp: 'MRP Multi-Level Meja Kerja',
    'aggregate-planning': 'Perencanaan Agregat 4 Kuartal',
    scheduling: 'Penjadwalan Order Produksi',
  };
  return titles[moduleId];
}

export function createAllModulesSamplePack(): {
  jobs: ModuleJob[];
  links: PipelineLink[];
} {
  const order: ModuleId[] = [
    'forecasting',
    'inventory',
    'break-even',
    'linear-programming',
    'integer-programming',
    'transportation',
    'assignment',
    'project-management',
    'waiting-lines',
    'decision-analysis',
    'quality-control',
    'network-models',
    'markov-analysis',
    'mrp',
    'aggregate-planning',
    'scheduling',
  ];

  const jobs = order.map((id) => createJobForModule(id));
  const forecastJob = jobs.find((j) => j.moduleId === 'forecasting')!;
  const inventoryJob = jobs.find((j) => j.moduleId === 'inventory')!;
  const bepJob = jobs.find((j) => j.moduleId === 'break-even')!;

  const links: PipelineLink[] = [
    {
      id: 'link-fc-to-inv',
      sourceJobId: forecastJob.id,
      sourceOutputKey: 'annualizedForecast12',
      targetJobId: inventoryJob.id,
      targetField: 'annualDemand',
      multiplier: 1,
    },
    {
      id: 'link-fc-to-bep',
      sourceJobId: forecastJob.id,
      sourceOutputKey: 'annualizedForecast12',
      targetJobId: bepJob.id,
      targetField: 'expectedVolume',
      multiplier: 1,
    },
  ];

  return { jobs, links };
}

export function createPpicPipelinePreset(): {
  jobs: ModuleJob[];
  links: PipelineLink[];
} {
  const fc = createJobForModule('forecasting', 'Tahap 1: Peramalan Permintaan (Forecast)');
  const agg = createJobForModule('aggregate-planning', 'Tahap 2: Perencanaan Agregat & MPS');
  const mrp = createJobForModule('mrp', 'Tahap 3: MRP & Ledakan BOM Material');
  const inv = createJobForModule('inventory', 'Tahap 4: Pengendalian Persediaan EOQ/ROP');
  const sch = createJobForModule('scheduling', 'Tahap 5: Penjadwalan Lantai Produksi');

  const links: PipelineLink[] = [
    {
      id: 'ppic-fc-to-agg',
      sourceJobId: fc.id,
      sourceOutputKey: 'horizonForecasts',
      targetJobId: agg.id,
      targetField: 'demands',
      multiplier: 1,
    },
    {
      id: 'ppic-agg-to-mrp',
      sourceJobId: agg.id,
      sourceOutputKey: 'mpsProductionSchedule',
      targetJobId: mrp.id,
      targetField: 'grossRequirements',
      multiplier: 0.05,
    },
    {
      id: 'ppic-mrp-to-inv',
      sourceJobId: mrp.id,
      sourceOutputKey: 'totalPlannedReleases',
      targetJobId: inv.id,
      targetField: 'annualDemand',
      multiplier: 12,
    },
    {
      id: 'ppic-inv-to-sch',
      sourceJobId: inv.id,
      sourceOutputKey: 'optimalQ',
      targetJobId: sch.id,
      targetField: 'processingTimeScale',
      multiplier: 0.002,
    },
  ];

  return {
    jobs: [fc, agg, mrp, inv, sch],
    links,
  };
}

