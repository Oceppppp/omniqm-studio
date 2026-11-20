import type { DetectedSheetCandidate } from '../../core/types/workspace.types.ts';
import { detectModuleFromGrid, type RawCell, type RawGrid } from './fileDetector.ts';

function splitCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCell(raw: string): RawCell {
  if (raw === '') return null;
  if (raw.toLowerCase() === 'true') return true;
  if (raw.toLowerCase() === 'false') return false;
  const num = Number(raw);
  if (!Number.isNaN(num) && /^-?\d+(\.\d+)?$/.test(raw)) return num;
  return raw;
}

export function parseCsvText(fileName: string, text: string): DetectedSheetCandidate[] {
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((l) => l.trim() !== '');

  if (lines.length === 0) return [];

  const firstLine = lines[0];
  const commaCount = (firstLine.match(/,/g) ?? []).length;
  const semiCount = (firstLine.match(/;/g) ?? []).length;
  const tabCount = (firstLine.match(/\t/g) ?? []).length;
  const delimiter = tabCount > commaCount && tabCount > semiCount ? '\t' : semiCount > commaCount ? ';' : ',';

  const rows: RawGrid = lines.map((line) => splitCsvLine(line, delimiter).map(parseCell));
  const sheetName = fileName.replace(/\.[^.]+$/, '');
  const detection = detectModuleFromGrid(fileName, sheetName, rows);

  return [
    {
      id: `cand-${fileName}-${Math.random().toString(36).slice(2, 7)}`,
      fileName,
      sheetName,
      suggestedModuleId: detection.moduleId,
      confidence: detection.confidence,
      reason: detection.reason,
      rawRows: rows,
      selected: true,
    },
  ];
}

export async function parseCsvFile(file: File): Promise<DetectedSheetCandidate[]> {
  const text = await file.text();
  return parseCsvText(file.name, text);
}
