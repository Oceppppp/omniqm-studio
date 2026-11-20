import { describe, expect, it } from 'vitest';
import { buildPipelineExecutionStages, applyPipelineLinksToJob } from '../../src/core/pipeline/pipelineResolver.ts';
import { MODULE_REGISTRY } from '../../src/core/registry/moduleRegistry.ts';
import type { ForecastingInput } from '../../src/core/types/module.types.ts';
import { solveModuleJob } from '../../src/engines/index.ts';
import { buildMasterTemplateBuffer } from '../../src/io/exporters/excelExporter.ts';
import {
  autoSuggestColumnMapping,
  detectHeaderRowIndex,
} from '../../src/io/parsers/columnMapping.ts';
import { parseCsvText } from '../../src/io/parsers/csvParser.ts';
import { parseExcelArrayBuffer } from '../../src/io/parsers/excelParser.ts';
import { mapGridToModuleInput } from '../../src/io/parsers/moduleMapper.ts';
import { createAllModulesSamplePack } from '../../src/io/templates/sampleDatasets.ts';
import { parseClipboardGrid, parseClipboardNumber } from '../../src/ui/utils/gridPaste.ts';

describe('Multi-Sheet Excel Ingestion, CSV Parsing, & Parallel Pipeline Execution', () => {
  it('round-trips all 16 modules from Master Excel Workbook and executes every module cleanly', () => {
    const buf = buildMasterTemplateBuffer();
    const candidates = parseExcelArrayBuffer('Master_Template_16_Modul_OmniQM.xlsx', buf);

    expect(candidates.length).toBe(MODULE_REGISTRY.length);
    for (const cand of candidates) {
      expect(cand.confidence).toBeGreaterThan(0.9);
      const input = mapGridToModuleInput(cand.suggestedModuleId, cand.rawRows);
      const res = solveModuleJob({
        id: `test-${cand.suggestedModuleId}`,
        moduleId: cand.suggestedModuleId,
        title: cand.sheetName,
        enabled: true,
        input,
        updatedAt: Date.now(),
      });
      expect(res.status).not.toBe('error');
      expect(res.tables.length).toBeGreaterThan(0);
    }
  });

  it('auto-detects module type from CSV without explicit #module tag', () => {
    const pertCsv = [
      'ID,Aktivitas,Predecessor,Optimistic,MostLikely,Pessimistic',
      'A,Analisis,-,2,4,6',
      'B,Desain,A,3,5,7',
      'C,Implementasi,B,4,6,10',
    ].join('\n');

    const cands = parseCsvText('jadwal_proyek.csv', pertCsv);
    expect(cands.length).toBe(1);
    expect(cands[0].suggestedModuleId).toBe('project-management');

    const input = mapGridToModuleInput(cands[0].suggestedModuleId, cands[0].rawRows);
    const res = solveModuleJob({
      id: 'csv-pert',
      moduleId: 'project-management',
      title: 'CSV PERT',
      enabled: true,
      input,
      updatedAt: Date.now(),
    });
    expect(res.status).toBe('success');
    expect(res.derivedValues.projectDuration).toBeCloseTo(15.3333, 2);
  });

  it('plans DAG stages and propagates Forecasting output into Inventory & Break-Even', () => {
    const pack = createAllModulesSamplePack();
    const plan = buildPipelineExecutionStages(pack.jobs, pack.links);
    expect(plan.hasCycle).toBe(false);
    expect(plan.stages.length).toBe(2);

    const stage1Results: Record<string, ReturnType<typeof solveModuleJob>> = {};
    for (const j of plan.stages[0]) {
      stage1Results[j.id] = solveModuleJob(j);
    }

    const invJob = pack.jobs.find((j) => j.moduleId === 'inventory')!;
    const { updatedJob, appliedNotes } = applyPipelineLinksToJob(invJob, pack.links, stage1Results);
    expect(appliedNotes.length).toBe(1);
    expect((updatedJob.input as { annualDemand: number }).annualDemand).not.toBe(7200);
  });

  it('detects metadata rows, auto-suggests custom column mappings, and applies user mapping overrides', () => {
    const rawGrid = [
      ['#module', 'forecasting'],
      ['alpha', 0.4],
      ['Periode', 'Catatan', 'Qty_Aktual'],
      ['Jan', 'Promo', 120],
      ['Feb', 'Normal', 150],
      ['Mar', 'Normal', 180],
    ];
    const headerIdx = detectHeaderRowIndex(rawGrid);
    expect(headerIdx).toBe(2);

    const suggested = autoSuggestColumnMapping('forecasting', rawGrid[headerIdx]);
    expect(suggested.period).toBe(0);
    expect(suggested.value).toBe(2);

    const mapped = mapGridToModuleInput('forecasting', rawGrid, {
      headerRowIndex: headerIdx,
      columnMapping: suggested,
    }) as ForecastingInput;

    expect(mapped.alpha).toBe(0.4);
    expect(mapped.periodLabels).toEqual(['Jan', 'Feb', 'Mar']);
    expect(mapped.values).toEqual([120, 150, 180]);
  });

  it('parses tab-delimited and semicolon clipboard text cleanly for Excel Ctrl+V paste', () => {
    const tsv = '10\t20\t30\r\n40\t50\t60\r\n';
    expect(parseClipboardGrid(tsv)).toEqual([
      ['10', '20', '30'],
      ['40', '50', '60'],
    ]);
    expect(parseClipboardNumber('1,250.5')).toBe(1250.5);
  });
});
