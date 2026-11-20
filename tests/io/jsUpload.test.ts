import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { solveModuleJob } from '../../src/engines/index.ts';
import { parseJsonOrJsText } from '../../src/io/parsers/jsonParser.ts';
import { mapGridToModuleInput } from '../../src/io/parsers/moduleMapper.ts';
import { runAllModulesSimultaneously } from '../../src/workers/workerPool.ts';

describe('Universal JavaScript Upload (Any Filename & Any JS Data Structure)', () => {
  it('accepts ESM export default with arbitrary filename & partial module defaults merge', () => {
    const js = `
      // File konfigurasi acak dengan trailing comma dan single quote
      const tahun = 2026;
      const baseCost = 100 + 20 * 2;
      export default {
        moduleId: 'inventory',
        title: \`EOQ Tahun \${tahun}\`,
        annualDemand: 3600,
        orderingCost: baseCost,
        holdingCostPerUnit: 8,
      };
    `;
    const parsed = parseJsonOrJsText('abc_xyz.js', js);
    expect(parsed.jobs.length).toBe(1);
    const job = parsed.jobs[0];
    expect(job.moduleId).toBe('inventory');
    expect(job.title).toBe('EOQ Tahun 2026');

    const res = solveModuleJob(job);
    expect(res.status).toBe('success');
    // EOQ = sqrt(2 * 3600 * 140 / 8) = sqrt(126000) ≈ 354.96
    expect(res.derivedValues.optimalQ).toBeCloseTo(354.96, 1);
  });

  it('extracts multiple named exports and combined default + named exports from .mjs files', () => {
    const js = `
      const sharedPeriods = ['Jan', 'Feb', 'Mar', 'Apr'];
      export const ramalan = {
        modul: 'peramalan',
        periodLabels: sharedPeriods,
        values: [110, 125, 140, 155],
      };
      export let proyek: any = {
        module: 'pert',
        activities: [
          { id: 'A', name: 'Riset', predecessors: [], optimistic: 2, mostLikely: 4, pessimistic: 6 },
          { id: 'B', name: 'Produksi', predecessors: ['A'], optimistic: 3, mostLikely: 5, pessimistic: 7 },
        ],
      };
      export default {
        moduleId: 'break-even',
        fixedCost: 12000,
        variableCostPerUnit: 30,
        sellingPricePerUnit: 70,
      };
    `;
    const parsed = parseJsonOrJsText('tugas-uas-ppic-99.mjs', js);
    expect(parsed.jobs.length).toBe(3);
    const mods = parsed.jobs.map((j) => j.moduleId);
    expect(mods).toContain('break-even');
    expect(mods).toContain('forecasting');
    expect(mods).toContain('project-management');
  });

  it('supports CommonJS module.exports, bracket exports, exports.x, and window/globalThis/self', () => {
    const cjsSource = `
      module['exports']['lp'] = {
        moduleId: 'lp',
        sense: 'max',
        variableNames: ['Meja', 'Kursi'],
        objectiveCoeffs: [70, 50],
        constraints: [
          { name: 'Kayu', coeffs: [4, 3], sign: '<=', rhs: 240 },
          { name: 'Tenaga', coeffs: [2, 1], sign: '<=', rhs: 100 },
        ],
      };
      exports.tp = {
        supplies: [100, 150],
        demands: [120, 130],
        costs: [
          [8, 6],
          [5, 9],
        ],
      };
    `;
    const parsedCjs = parseJsonOrJsText('skrip_acak.cjs', cjsSource);
    expect(parsedCjs.jobs.map((j) => j.moduleId)).toEqual(['linear-programming', 'transportation']);
    expect(solveModuleJob(parsedCjs.jobs[0]).derivedValues.optimalZ).toBe(4100);

    const browserGlobalSource = `
      let note: string;
      window.jadwalOrder = [
        { jobId: 'J1', processingTime: 4, dueDate: 8 },
        { jobId: 'J2', processingTime: 2, dueDate: 5 },
      ];
      globalThis.jaringanRute = [
        { from: 'S', to: 'A', weight: 4 },
        { from: 'A', to: 'T', weight: 6 },
      ];
    `;
    const parsedWin = parseJsonOrJsText('001.js', browserGlobalSource);
    expect(parsedWin.jobs.map((j) => j.moduleId)).toEqual(['scheduling', 'network-models']);
  });

  it('unwraps functions, arrow functions, IIFE, UMD factories, JSONP, Object.freeze, and JSON.parse', () => {
    const arrowJs = `
      #!/usr/bin/env node
      /* Header comment */
      export default () => ({
        sense: 'max',
        variableNames: ['X1', 'X2'],
        objectiveCoeffs: [5, 4],
        constraints: [{ name: 'K1', coeffs: [6, 4], sign: '<=', rhs: 24 }]
      }) as const;
    `;
    expect(parseJsonOrJsText('data_tanpa_eks', arrowJs).jobs[0].moduleId).toBe('linear-programming');

    const umdJs = `
      (function (root, factory) {
        if (typeof module === 'object' && module.exports) { module.exports = factory(); }
        else { root.modelData = factory(); }
      }(this, function () {
        const prefix = 'Antrean';
        return Object.freeze({
          moduleId: 'waiting-lines',
          title: \`\${prefix} Kasir\`,
          arrivalRate: 12,
          serviceRate: 16,
          servers: 1
        });
      }));
    `;
    const parsedUmd = parseJsonOrJsText('berkas (final) v2.js', umdJs);
    expect(parsedUmd.jobs[0].moduleId).toBe('waiting-lines');
    expect(parsedUmd.jobs[0].title).toBe('Antrean Kasir');

    const jsonpJs = `onDataReady(JSON.parse('{"moduleId":"markov-analysis","stateNames":["A","B"],"initialShares":[0.5,0.5],"transitionMatrix":[[0.8,0.2],[0.3,0.7]],"steps":4}'));`;
    const parsedJsonp = parseJsonOrJsText('jsonp_data.js', jsonpJs);
    expect(parsedJsonp.jobs[0].moduleId).toBe('markov-analysis');
    expect(solveModuleJob(parsedJsonp.jobs[0]).status).toBe('success');
  });

  it('extracts tabular JS shapes (1D series, 2D arrays, record arrays, {headers, rows}, flat primitive objects, embedded CSV) and solves them end-to-end', async () => {
    // 1. 1D array
    const js1d = `export default [100, 115, 130, 142, 160, 175];`;
    const p1d = parseJsonOrJsText('angka_seri.js', js1d);
    expect(p1d.candidates.length).toBe(1);
    expect(p1d.candidates[0].suggestedModuleId).toBe('forecasting');

    // 2. Record array
    const jsRecords = `
      const dataset = [
        { Bulan: 'Jan', Permintaan: 210 },
        { Bulan: 'Feb', Permintaan: 240 },
        { Bulan: 'Mar', Permintaan: 255 },
        { Bulan: 'Apr', Permintaan: 290 },
      ];
      export default dataset;
    `;
    const pRec = parseJsonOrJsText('bebas_banget.js', jsRecords);
    expect(pRec.candidates[0].suggestedModuleId).toBe('forecasting');
    const fcInput = mapGridToModuleInput('forecasting', pRec.candidates[0].rawRows);
    expect(solveModuleJob({
      id: 'test-rec',
      moduleId: 'forecasting',
      title: 'Rec JS',
      enabled: true,
      input: fcInput,
      updatedAt: Date.now(),
    }).status).toBe('success');

    // 3. Flat period object { Jan: 100, Feb: 120, ... }
    const jsFlatPeriods = `module.exports = { Jan: 120, Feb: 135, Mar: 150, Apr: 162 };`;
    const pFlat = parseJsonOrJsText('musim.js', jsFlatPeriods);
    expect(pFlat.candidates[0].suggestedModuleId).toBe('forecasting');

    // 4. Embedded multi-line CSV inside template literal + execute full batch
    const jsEmbeddedCsv = `
      export const csvData = \`
ID,Aktivitas,Predecessor,Durasi
A,Persiapan,-,4
B,Perakitan,A,6
      \`;
    `;
    const pCsv = parseJsonOrJsText('modul_proyek_bebas.js', jsEmbeddedCsv);
    expect(pCsv.candidates[0].suggestedModuleId).toBe('project-management');
    const job = {
      id: 'js-csv-job',
      moduleId: pCsv.candidates[0].suggestedModuleId,
      title: 'JS Embedded CSV',
      enabled: true,
      input: mapGridToModuleInput(pCsv.candidates[0].suggestedModuleId, pCsv.candidates[0].rawRows),
      updatedAt: Date.now(),
    };
    const summary = await runAllModulesSimultaneously([job], []);
    expect(summary.successCount).toBe(1);
    expect(summary.resultsByJobId['js-csv-job'].derivedValues.projectDuration).toBe(10);
  });

  it('parses bundled samples/contoh_upload_bebas.js under any renamed arbitrary filename and executes all exported jobs', async () => {
    const samplePath = path.resolve(__dirname, '../../samples/contoh_upload_bebas.js');
    const source = fs.readFileSync(samplePath, 'utf8');
    const parsed = parseJsonOrJsText('nama_file_sembarang_123.js', source);
    expect(parsed.jobs.map((j) => j.moduleId).sort()).toEqual([
      'forecasting',
      'inventory',
      'linear-programming',
    ]);
    const summary = await runAllModulesSimultaneously(parsed.jobs, []);
    expect(summary.errorCount).toBe(0);
    expect(summary.successCount).toBe(3);
  });
});
