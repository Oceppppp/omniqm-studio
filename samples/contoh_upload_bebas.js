// Contoh file JavaScript (.js / .mjs / .cjs dengan nama file bebas) untuk OmniQM Studio.
// Anda dapat langsung drag-and-drop file JS seperti ini ke menu Upload File!

export const dataPeramalanPenjualan = {
  moduleId: 'forecasting',
  title: 'Data Penjualan Bulanan (Impor JS)',
  periodLabels: ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu'],
  values: [140, 155, 175, 168, 190, 215, 232, 248],
  seasonalPeriod: 4,
  seasonalType: 'multiplicative',
  autoOptimize: true,
  horizon: 4,
};

export const dataOptimasiProduk = {
  sense: 'max',
  variableNames: ['Meja Belajar', 'Rak Buku'],
  objectiveCoeffs: [120, 95],
  constraints: [
    { name: 'Kayu Solid (m2)', coeffs: [4, 3], sign: '<=', rhs: 240 },
    { name: 'Jam Mesin (jam)', coeffs: [2, 1.5], sign: '<=', rhs: 115 },
    { name: 'Permintaan Maks Rak', coeffs: [0, 1], sign: '<=', rhs: 50 },
  ],
};

export default {
  moduleId: 'inventory',
  title: 'Pengendalian Bahan Baku Kayu (EOQ)',
  annualDemand: 4800,
  orderingCost: 150,
  holdingCostPerUnit: 6,
  unitPrice: 80,
};
