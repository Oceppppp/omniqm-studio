import type { DetectedSheetCandidate } from '../../core/types/workspace.types.ts';
import { detectModuleFromGrid, type RawGrid } from './fileDetector.ts';

export async function parseExcelFile(file: File): Promise<DetectedSheetCandidate[]> {
  const buffer = await file.arrayBuffer();
  return parseExcelArrayBuffer(file.name, buffer);
}

export async function parseExcelArrayBuffer(
  fileName: string,
  buffer: ArrayBuffer,
): Promise<DetectedSheetCandidate[]> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, { type: 'array' });
  const candidates: DetectedSheetCandidate[] = [];

  for (const sheetName of workbook.SheetNames) {
    if (sheetName.toLowerCase().startsWith('ringkasan') || sheetName.toLowerCase() === 'readme') {
      continue;
    }
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: null,
      blankrows: false,
    }) as RawGrid;

    if (!rows || rows.length === 0) continue;

    const detection = detectModuleFromGrid(fileName, sheetName, rows);
    candidates.push({
      id: `cand-${fileName}-${sheetName}-${Math.random().toString(36).slice(2, 7)}`,
      fileName,
      sheetName,
      suggestedModuleId: detection.moduleId,
      confidence: detection.confidence,
      reason: detection.reason,
      rawRows: rows,
      selected: true,
    });
  }

  return candidates;
}
