import type { ModuleId } from '../../core/types/module.types.ts';
import type { RawCell, RawGrid } from './fileDetector.ts';

export interface ColumnFieldSpec {
  key: string;
  label: string;
  required?: boolean;
  aliases: string[];
}

const META_ROW_KEYS = new Set([
  'sense',
  'mode',
  'model',
  'charttype',
  'targettime',
  'targetcrashduration',
  'alpha',
  'beta',
  'gamma',
  'seasonalperiod',
  'seasonaltype',
  'autooptimize',
  'horizon',
  'movingavgwindow',
  'hurwiczalpha',
  'iscosttable',
  'subgroupsize',
  'usl',
  'lsl',
  'sourcenode',
  'sinknode',
  'directed',
  'steps',
  'annualdemand',
  'orderingcost',
  'holdingcostperunit',
  'unitprice',
  'dailydemandrate',
  'dailyproductionrate',
  'leadtimedays',
  'demandstddevdaily',
  'servicelevelz',
  'workingdaysperyear',
  'arrivalrate',
  'servicerate',
  'servers',
  'systemcapacity',
  'waitingcostperhour',
  'servercostperhour',
  'timeunit',
  'fixedcost',
  'variablecostperunit',
  'sellingpriceperunit',
  'targetprofit',
  'expectedvolume',
  'initialinventory',
  'initialworkforce',
  'unitsperworker',
  'regularcostperunit',
  'overtimecostperunit',
  'subcontractcostperunit',
  'backordercostperunit',
  'hiringcostperworker',
  'firingcostperworker',
]);

export function isMetadataRow(row: RawCell[]): boolean {
  const c0 = String(row[0] ?? '').trim().toLowerCase();
  if (!c0) return false;
  if (c0.startsWith('#') || c0 === 'module' || c0 === 'modul') return true;
  const nonEmptyCount = row.filter((c) => String(c ?? '').trim() !== '').length;
  return nonEmptyCount <= 2 && META_ROW_KEYS.has(c0.replace(/[\s_-]+/g, ''));
}

export function detectHeaderRowIndex(rows: RawGrid): number {
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row.some((c) => c !== null && c !== undefined && String(c).trim() !== '')) continue;
    if (isMetadataRow(row)) continue;
    return i;
  }
  return 0;
}

export function getModuleMappingFields(moduleId: ModuleId): ColumnFieldSpec[] {
  switch (moduleId) {
    case 'forecasting':
      return [
        { key: 'period', label: 'Label Periode', aliases: ['periode', 'period', 'bulan', 'month', 'tgl', 'tanggal', 'date', 'tahun', 'year', 'kuartal', 'minggu', 'week'] },
        { key: 'value', label: 'Permintaan / Aktual', required: true, aliases: ['permintaan', 'demand', 'aktual', 'actual', 'qty', 'jumlah', 'penjualan', 'sales', 'value', 'nilai', 'jumlahunit'] },
      ];
    case 'project-management':
      return [
        { key: 'id', label: 'ID Aktivitas', required: true, aliases: ['id', 'kode', 'code', 'act', 'activityid'] },
        { key: 'name', label: 'Nama Aktivitas', aliases: ['aktivitas', 'activity', 'nama', 'name', 'kegiatan', 'task', 'pekerjaan'] },
        { key: 'predecessors', label: 'Predecessor', aliases: ['predecessor', 'predecessors', 'pendahulu', 'pred', 'prasyarat', 'dependensi'] },
        { key: 'duration', label: 'Durasi (CPM)', aliases: ['duration', 'durasi', 'waktu', 'time', 'normaltime'] },
        { key: 'optimistic', label: 'Optimis (a)', aliases: ['optimistic', 'optimis', 'a', 'min'] },
        { key: 'mostLikely', label: 'Most Likely (m)', aliases: ['mostlikely', 'likely', 'normal', 'm', 'moderat'] },
        { key: 'pessimistic', label: 'Pesimis (b)', aliases: ['pessimistic', 'pesimis', 'b', 'max'] },
        { key: 'crashTime', label: 'Crash Time', aliases: ['crashtime', 'minwaktu', 'waktucrash', 'crashdur'] },
        { key: 'normalCost', label: 'Normal Cost', aliases: ['normalcost', 'biayanormal'] },
        { key: 'crashCost', label: 'Crash Cost', aliases: ['crashcost', 'biayacrash'] },
      ];
    case 'scheduling':
      return [
        { key: 'jobId', label: 'Job / Order ID', required: true, aliases: ['jobid', 'job', 'order', 'kodeorder', 'id', 'nama'] },
        { key: 'processingTime', label: 'Waktu Proses (Mesin 1)', required: true, aliases: ['processingtime', 'waktuproses', 'proses', 'mesin1', 'machine1', 'durasi', 'p1', 'time'] },
        { key: 'dueDate', label: 'Due Date / Tenggat', aliases: ['duedate', 'due', 'tenggat', 'deadline', 'batas'] },
        { key: 'processingTimeMachine2', label: 'Waktu Proses Mesin 2', aliases: ['machine2time', 'processingtimemachine2', 'mesin2', 'machine2', 'p2'] },
      ];
    case 'network-models':
      return [
        { key: 'from', label: 'Dari Node (From)', required: true, aliases: ['from', 'dari', 'asal', 'source', 'nodea', 'start'] },
        { key: 'to', label: 'Ke Node (To)', required: true, aliases: ['to', 'ke', 'tujuan', 'target', 'dest', 'nodeb', 'end'] },
        { key: 'weight', label: 'Bobot / Jarak / Kapasitas', required: true, aliases: ['weight', 'bobot', 'jarak', 'distance', 'cost', 'biaya', 'capacity', 'kapasitas', 'nilai'] },
      ];
    case 'mrp':
      return [
        { key: 'item', label: 'Nama Item', required: true, aliases: ['item', 'material', 'komponen', 'part', 'sku', 'nama'] },
        { key: 'level', label: 'Level BOM', aliases: ['level', 'lvl', 'llc', 'tingkat'] },
        { key: 'parent', label: 'Parent Assembly', aliases: ['parent', 'induk', 'assembly'] },
        { key: 'qtyPerParent', label: 'Qty / Parent', aliases: ['qtyperparent', 'qty', 'jumlah', 'pemakaian', 'bomqty'] },
        { key: 'leadTime', label: 'Lead Time', aliases: ['leadtime', 'lt', 'tunggu', 'waktu'] },
        { key: 'onHand', label: 'On Hand Stock', aliases: ['onhand', 'stok', 'inventory', 'persediaan'] },
        { key: 'safetyStock', label: 'Safety Stock', aliases: ['safetystock', 'safety', 'stokpengaman', 'ss'] },
        { key: 'lotSizing', label: 'Metode Lot-Sizing', aliases: ['lotsizing', 'lotsize', 'lot', 'metode'] },
        { key: 'fixedOrderQty', label: 'FOQ / EOQ Qty', aliases: ['foq', 'fixedorderqty', 'orderqty'] },
        { key: 'fixedOrderPeriods', label: 'POQ Period (p)', aliases: ['poqperiods', 'fixedorderperiods', 'p'] },
        { key: 'setupCost', label: 'Setup / Order Cost (S)', aliases: ['setupcost', 'ordercost', 'biayapesan'] },
        { key: 'holdingCostPerUnit', label: 'Holding Cost (H)', aliases: ['holdingcost', 'holdingcostperunit', 'biayasimpan'] },
      ];
    case 'inventory':
      return [
        { key: 'sku', label: 'Nama SKU (ABC)', aliases: ['sku', 'item', 'barang', 'produk', 'material'] },
        { key: 'annualUsage', label: 'Pemakaian Tahunan (ABC)', aliases: ['annualusage', 'usage', 'pemakaian', 'demand', 'qty'] },
        { key: 'unitCost', label: 'Harga Unit (ABC / Tier)', aliases: ['unitcost', 'unitprice', 'harga', 'price', 'cost'] },
        { key: 'minQty', label: 'Min Qty (Diskon)', aliases: ['minqty', 'min', 'minimum'] },
        { key: 'maxQty', label: 'Max Qty (Diskon)', aliases: ['maxqty', 'max', 'maksimum'] },
      ];
    case 'break-even':
      return [
        { key: 'name', label: 'Nama Alternatif / Key', aliases: ['alternative', 'alternatif', 'nama', 'name', 'parameter'] },
        { key: 'fixedCost', label: 'Fixed Cost / Value', aliases: ['fixedcost', 'fc', 'biayatetap', 'value', 'nilai'] },
        { key: 'variableCost', label: 'Variable Cost / Unit', aliases: ['variablecost', 'vc', 'biayavariabel'] },
      ];
    default:
      return [];
  }
}

function normHeader(val: RawCell): string {
  return String(val ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function autoSuggestColumnMapping(
  moduleId: ModuleId,
  headerRow: RawCell[] = [],
): Record<string, number> {
  const fields = getModuleMappingFields(moduleId);
  const mapping: Record<string, number> = {};
  const normalizedHeaders = headerRow.map(normHeader);
  const usedCols = new Set<number>();

  for (const field of fields) {
    const exactIdx = normalizedHeaders.findIndex(
      (h, colIdx) => !usedCols.has(colIdx) && field.aliases.includes(h),
    );
    if (exactIdx >= 0) {
      mapping[field.key] = exactIdx;
      usedCols.add(exactIdx);
      continue;
    }
    const partialIdx = normalizedHeaders.findIndex(
      (h, colIdx) =>
        !usedCols.has(colIdx) &&
        h.length > 0 &&
        field.aliases.some((alias) => alias.length >= 3 && (h.includes(alias) || alias.includes(h))),
    );
    if (partialIdx >= 0) {
      mapping[field.key] = partialIdx;
      usedCols.add(partialIdx);
    }
  }

  return mapping;
}
