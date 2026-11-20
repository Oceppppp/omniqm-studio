import { MODULE_REGISTRY } from '../../core/registry/moduleRegistry.ts';
import type { ModuleId } from '../../core/types/module.types.ts';

export type RawCell = string | number | boolean | null;
export type RawGrid = RawCell[][];

export interface DetectionOutcome {
  moduleId: ModuleId;
  confidence: number;
  reason: string;
}

const VALID_IDS = new Set<string>(MODULE_REGISTRY.map((m) => m.id));

export function detectModuleFromGrid(
  fileName: string,
  sheetName: string,
  rows: RawGrid,
): DetectionOutcome {
  const flatText = rows
    .slice(0, 12)
    .flat()
    .map((c) => String(c ?? '').trim().toLowerCase())
    .join(' ');

  // 1. Explicit module tag inside first few cells (used in Master Template)
  for (let r = 0; r < Math.min(5, rows.length); r += 1) {
    const first = String(rows[r][0] ?? '').trim().toLowerCase();
    const second = String(rows[r][1] ?? '').trim().toLowerCase();
    if (first === '#module' || first === 'module' || first === 'modul') {
      if (VALID_IDS.has(second)) {
        return {
          moduleId: second as ModuleId,
          confidence: 0.99,
          reason: `Tag eksplisit #module = ${second}`,
        };
      }
    }
  }

  // 2. Match sheet name or file name against aliases
  const combinedNames = `${sheetName} ${fileName}`.toLowerCase().replace(/\.[^.]+$/, '');
  for (const mod of MODULE_REGISTRY) {
    if (combinedNames.includes(mod.id)) {
      return {
        moduleId: mod.id,
        confidence: 0.94,
        reason: `Nama sheet/file cocok dengan ID modul "${mod.id}"`,
      };
    }
    for (const alias of mod.supportedSheetAliases) {
      const regex = new RegExp(`(^|[^a-z])${alias}([^a-z]|$)`, 'i');
      if (regex.test(combinedNames)) {
        return {
          moduleId: mod.id,
          confidence: 0.88,
          reason: `Nama sheet/file cocok dengan alias "${alias}"`,
        };
      }
    }
  }

  // 3. Heuristic header/content matching
  if (
    (flatText.includes('predecessor') || flatText.includes('pendahulu')) &&
    (flatText.includes('optimistic') || flatText.includes('durasi') || flatText.includes('duration'))
  ) {
    return {
      moduleId: 'project-management',
      confidence: 0.9,
      reason: 'Kolom aktivitas & predecessor terdeteksi (PERT/CPM)',
    };
  }
  if (flatText.includes('supply') && flatText.includes('demand')) {
    return {
      moduleId: 'transportation',
      confidence: 0.88,
      reason: 'Baris/kolom Supply & Demand terdeteksi (Transportation)',
    };
  }
  if (flatText.includes('<=') || flatText.includes('>=') || flatText.includes('rhs')) {
    if (flatText.includes('binary') || flatText.includes('integer')) {
      return {
        moduleId: 'integer-programming',
        confidence: 0.88,
        reason: 'Kendala & tipe variabel integer/biner terdeteksi',
      };
    }
    return {
      moduleId: 'linear-programming',
      confidence: 0.86,
      reason: 'Struktur kendala (<=, >=, RHS) terdeteksi (Linear Programming)',
    };
  }
  if (flatText.includes('lot') && (flatText.includes('onhand') || flatText.includes('on hand') || flatText.includes('leadtime'))) {
    return {
      moduleId: 'mrp',
      confidence: 0.85,
      reason: 'Kolom BOM/On-Hand/Lead-Time terdeteksi (MRP)',
    };
  }
  if (flatText.includes('overtime') && flatText.includes('subcontract')) {
    return {
      moduleId: 'aggregate-planning',
      confidence: 0.85,
      reason: 'Kolom kapasitas reguler/overtime/subkontrak terdeteksi',
    };
  }
  if (flatText.includes('duedate') || flatText.includes('due date') || flatText.includes('processingtime')) {
    return {
      moduleId: 'scheduling',
      confidence: 0.84,
      reason: 'Kolom waktu proses & due date terdeteksi (Scheduling)',
    };
  }
  if (flatText.includes('arrivalrate') || flatText.includes('servicerate')) {
    return {
      moduleId: 'waiting-lines',
      confidence: 0.85,
      reason: 'Parameter kedatangan & layanan terdeteksi (Waiting Lines)',
    };
  }
  if (flatText.includes('annualdemand') || flatText.includes('orderingcost') || flatText.includes('holdingcost')) {
    return {
      moduleId: 'inventory',
      confidence: 0.85,
      reason: 'Parameter EOQ/persediaan terdeteksi (Inventory)',
    };
  }
  if (flatText.includes('fixedcost') && flatText.includes('sellingprice')) {
    return {
      moduleId: 'break-even',
      confidence: 0.85,
      reason: 'Parameter biaya tetap & harga jual terdeteksi (Break-Even)',
    };
  }
  if (flatText.includes('from') && flatText.includes('to') && flatText.includes('weight')) {
    return {
      moduleId: 'network-models',
      confidence: 0.84,
      reason: 'Daftar sisi jaringan (From, To, Weight) terdeteksi',
    };
  }
  if (flatText.includes('probability') || flatText.includes('probabilitas') || flatText.includes('hurwicz')) {
    return {
      moduleId: 'decision-analysis',
      confidence: 0.8,
      reason: 'Tabel probabilitas kondisi alam terdeteksi (Decision Analysis)',
    };
  }

  return {
    moduleId: 'forecasting',
    confidence: 0.45,
    reason: 'Fallback default ke Forecasting (ubah modul di pratinjau jika perlu)',
  };
}
