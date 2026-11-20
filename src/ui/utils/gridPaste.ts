export function parseClipboardGrid(rawText: string): string[][] {
  const cleaned = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = cleaned.split('\n');
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }
  if (lines.length === 0) return [];

  const hasTabs = lines.some((l) => l.includes('\t'));
  const delimiter = hasTabs ? '\t' : lines[0].includes(';') ? ';' : ',';

  return lines.map((line) => line.split(delimiter).map((cell) => cell.trim()));
}

export function parseClipboardNumber(raw: string, fallback = 0): number {
  const cleaned = raw.replace(/\s+/g, '').replace(/,/g, '');
  if (!cleaned) return fallback;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : fallback;
}
