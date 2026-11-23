import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SchedulingInput } from '../../src/core/types/module.types.ts';
import type { BatchRunSummary, ScenarioSnapshot } from '../../src/core/types/workspace.types.ts';
import { solveScheduling } from '../../src/engines/scheduling.ts';
import {
  buildBatchResultsBuffer,
  computeAutoColWidths,
} from '../../src/io/exporters/excelExporter.ts';
import { createAllModulesSamplePack } from '../../src/io/templates/sampleDatasets.ts';
import {
  MAX_HISTORY_STEPS,
  MAX_SCENARIO_SNAPSHOTS,
  appendScenarioSnapshot,
  pushHistoryEntry,
} from '../../src/store/workspaceHistory.ts';
import { runAllModulesSimultaneously, runSingleJobAsync } from '../../src/workers/workerPool.ts';

const ROOT = path.resolve(__dirname, '../..');

describe('Tahap 1 & Tahap 2 Upgrades (v1.1 & v1.2)', () => {
  it('evaluates WSPT optimal weighted flow time and emits Single-Machine Gantt Chart in scheduling', () => {
    const input: SchedulingInput = {
      mode: 'single-machine',
      jobs: [
        { jobId: 'VIP', processingTime: 6, dueDate: 8, weight: 10 }, // t/w = 0.6
        { jobId: 'Std-A', processingTime: 4, dueDate: 12, weight: 1 }, // t/w = 4.0
        { jobId: 'Std-B', processingTime: 2, dueDate: 5, weight: 1 }, // t/w = 2.0
      ],
    };

    const res = solveScheduling('sc-wspt', 'Weighted Single Machine', input);
    expect(res.status).toBe('success');

    const rulesTable = res.tables.find((t) => t.id === 'scheduling-rules')!;
    expect(rulesTable.rows.length).toBe(6);

    const wsptRow = rulesTable.rows.find((r) => String(r[0]).startsWith('WSPT'))!;
    const sptRow = rulesTable.rows.find((r) => String(r[0]).startsWith('SPT'))!;
    // WSPT order: VIP (6, w=10) -> Std-B (8, w=1) -> Std-A (12, w=1) => ∑wC = 60 + 8 + 12 = 80
    expect(wsptRow[1]).toBe('VIP → Std-B → Std-A');
    expect(Number(wsptRow[3])).toBeCloseTo(80, 4);
    expect(Number(wsptRow[3])).toBeLessThan(Number(sptRow[3]));
    expect(res.derivedValues.wsptWeightedFlow).toBeCloseTo(80, 4);

    const gantt = res.charts.find((c) => c.kind === 'gantt');
    expect(gantt).toBeDefined();
    if (gantt && gantt.kind === 'gantt') {
      expect(gantt.tasks.length).toBe(3);
      // Std-B finishes at 8 > dueDate 5 => tardy (isCritical = true)
      const stdB = gantt.tasks.find((t) => t.id === 'sm-Std-B')!;
      expect(stdB.isCritical).toBe(true);
      const vip = gantt.tasks.find((t) => t.id === 'sm-VIP')!;
      expect(vip.isCritical).toBe(false);
    }
  });

  it('computes clamped auto column widths and exports multi-sheet Excel results lazily', async () => {
    const widths = computeAutoColWidths([
      ['A', 'Header Panjang Sekali', 'X'.repeat(120)],
      [1, 'Baris 1\nBaris Kedua Lebih Panjang', 'short'],
    ]);
    expect(widths).toEqual([{ wch: 12 }, { wch: 28 }, { wch: 64 }]);

    const pack = createAllModulesSamplePack();
    const subset = pack.jobs.slice(0, 3);
    const summary = await runAllModulesSimultaneously(subset, []);
    const buf = await buildBatchResultsBuffer(subset, summary);
    expect(buf.byteLength).toBeGreaterThan(2000);

    const XLSX = await import('xlsx');
    const wb = XLSX.read(buf, { type: 'array', cellStyles: true });
    expect(wb.SheetNames[0]).toBe('Ringkasan_Eksekutif');
    expect(wb.SheetNames.length).toBe(4);
    expect(wb.Sheets['Ringkasan_Eksekutif']['!cols']?.length).toBeGreaterThanOrEqual(7);
  });

  it('keeps xlsx out of static top-level imports so Vite emits it as a lazy async chunk', () => {
    const exporterSrc = fs.readFileSync(path.join(ROOT, 'src/io/exporters/excelExporter.ts'), 'utf8');
    const parserSrc = fs.readFileSync(path.join(ROOT, 'src/io/parsers/excelParser.ts'), 'utf8');
    expect(exporterSrc).not.toMatch(/^import\s+.*from\s+['"]xlsx['"]/m);
    expect(parserSrc).not.toMatch(/^import\s+.*from\s+['"]xlsx['"]/m);
    expect(exporterSrc).toContain("await import('xlsx')");
    expect(parserSrc).toContain("await import('xlsx')");
  });

  it('executes single job previews asynchronously via runSingleJobAsync', async () => {
    const pack = createAllModulesSamplePack();
    const lpJob = pack.jobs.find((j) => j.moduleId === 'linear-programming')!;
    const res = await runSingleJobAsync(lpJob);
    expect(res.status).toBe('success');
    expect(res.derivedValues.optimalZ).toBeCloseTo(4100, 1);
  });

  it('enforces 30-step history cap with deep isolation and 5-scenario snapshot cap', () => {
    const pack = createAllModulesSamplePack();
    let past: ReturnType<typeof pushHistoryEntry> = [];
    for (let i = 0; i < MAX_HISTORY_STEPS + 8; i += 1) {
      past = pushHistoryEntry(past, {
        jobs: pack.jobs.slice(0, 1),
        links: [],
        activeJobId: `job-${i}`,
      });
    }
    expect(past.length).toBe(MAX_HISTORY_STEPS);
    expect(past[0].activeJobId).toBe('job-8');
    expect(past[past.length - 1].activeJobId).toBe(`job-${MAX_HISTORY_STEPS + 7}`);

    // Mutating original jobs should not corrupt stored snapshot
    const originalTitle = past[0].jobs[0].title;
    pack.jobs[0].title = 'MUTATED_TITLE';
    expect(past[0].jobs[0].title).toBe(originalTitle);

    const dummySummary: BatchRunSummary = {
      runId: 'r1',
      startedAt: 0,
      finishedAt: 1,
      totalDurationMs: 1,
      totalJobs: 1,
      successCount: 1,
      warningCount: 0,
      errorCount: 0,
      resultsByJobId: {},
    };
    let snaps: ScenarioSnapshot[] = [];
    for (let i = 1; i <= MAX_SCENARIO_SNAPSHOTS + 2; i += 1) {
      snaps = appendScenarioSnapshot(snaps, {
        id: `s-${i}`,
        label: `Skenario ${i}`,
        createdAt: i,
        summary: dummySummary,
      });
    }
    expect(snaps.length).toBe(MAX_SCENARIO_SNAPSHOTS);
    expect(snaps[0].id).toBe('s-3');
    expect(snaps[snaps.length - 1].id).toBe('s-7');
  });
});
