import type { ModuleExecutionResult } from '../../core/types/module.types.ts';
import type { ModuleJob } from '../../core/types/workspace.types.ts';
import { moduleInputToSheetRows, triggerDownload } from './excelExporter.ts';

function toCsvCell(val: string | number | boolean | null | undefined): string {
  const str = val === null || val === undefined ? '' : String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function rowsToCsv(rows: (string | number | boolean | null)[][]): string {
  return rows.map((row) => row.map(toCsvCell).join(',')).join('\n');
}

export function exportModuleInputCsv(job: ModuleJob): void {
  const rows = moduleInputToSheetRows(job.moduleId, job.input);
  const csv = rowsToCsv(rows);
  triggerDownload(
    new Blob([csv], { type: 'text/csv;charset=utf-8' }),
    `Input_${job.moduleId}.csv`,
  );
}

export function exportModuleResultCsv(job: ModuleJob, result: ModuleExecutionResult): void {
  const rows: (string | number | boolean | null)[][] = [
    ['Modul', job.moduleId],
    ['Judul', job.title],
    ['Ringkasan', result.summaryText],
    [],
  ];
  if (result.analysis) {
    rows.push(['ANALISIS MENDALAM', result.analysis.headline]);
    rows.push(['Interpretasi', result.analysis.interpretation]);
    for (const sec of result.analysis.sections) {
      rows.push([sec.heading, sec.body]);
    }
    if (result.analysis.recommendations.length > 0) {
      rows.push(['Rekomendasi Manajerial']);
      result.analysis.recommendations.forEach((rec, idx) => {
        rows.push([`${idx + 1}.`, rec]);
      });
    }
    rows.push([]);
  }
  for (const tbl of result.tables) {
    rows.push([tbl.title]);
    rows.push(tbl.headers);
    for (const r of tbl.rows) rows.push(r);
    rows.push([]);
  }
  triggerDownload(
    new Blob([rowsToCsv(rows)], { type: 'text/csv;charset=utf-8' }),
    `Hasil_${job.moduleId}.csv`,
  );
}
