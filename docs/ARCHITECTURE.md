# Arsitektur Sistem OmniQM Studio

OmniQM Studio dirancang menggunakan **Modular Layered Architecture** (*Clean Separation of Concerns*) untuk mengatasi dua keterbatasan utama POM-QM klasik:
1. Eksekusi hanya satu modul pada satu jendela waktu.
2. Input data sel satu per satu secara manual.

## 1. Diagram Lapisan Arsitektur

```text
+-------------------------------------------------------------------+
| Presentation Layer (src/ui/ & src/styles/)                        |
| - TopBar, ModuleCatalog, BatchDashboard, FileDropzone             |
| - Modular Editors (Optimization, Operations, Planning)            |
| - Pure SVG Charts (Line, Bar, Gantt, LP 2D Plot)                  |
+---------------------------------+---------------------------------+
                                  |
                                  v
+---------------------------------+---------------------------------+
| State & Orchestration Layer (src/store/ & src/workers/)           |
| - WorkspaceProvider (React Reducer + LocalStorage Persistence)    |
| - WorkerPool (DAG Stage Scheduler + Web Worker Parallel Runner)   |
+---------------------------------+---------------------------------+
                                  |
             +--------------------+--------------------+
             v                                         v
+------------+--------------------+       +------------+------------+
| Domain & Pipeline Layer         |       | Ingestion & Export Layer  |
| (src/core/)                     |       | (src/io/)                 |
| - module.types.ts               |       | - excelParser.ts (.xlsx)  |
| - moduleRegistry.ts (16 Modul)  |       | - csvParser.ts (.csv)     |
| - pipelineResolver.ts (DAG)     |       | - fileDetector.ts         |
| - matrix.ts & distributions.ts  |       | - moduleMapper.ts         |
+------------+--------------------+       | - excelExporter.ts        |
             |                            +-------------------------+
             v
+------------+------------------------------------------------------+
| Pure Quantitative Engines Layer (src/engines/) — 16 Modul Murni   |
| - linearProgramming.ts     - decisionAnalysis.ts                  |
| - integerProgramming.ts    - qualityControl.ts                    |
| - transportation.ts        - networkModels.ts                     |
| - assignment.ts            - markovAnalysis.ts                    |
| - projectManagement.ts     - mrp.ts                               |
| - forecasting.ts           - aggregatePlanning.ts                 |
| - inventory.ts             - scheduling.ts                        |
| - waitingLines.ts          - breakEven.ts                         |
+-------------------------------------------------------------------+
```

## 2. Alur Eksekusi Paralel & Pipeline (DAG + Web Workers)

1. **Ingestion (`src/io/parsers/`)**:
   - User mengunggah 1 file Excel multi-sheet (`.xlsx`/`.xls`), beberapa file `.csv`, atau bundle `.omniqm.json`.
   - `fileDetector.ts` membaca tag `#module`, nama sheet/file, serta pola header kolom untuk menebak modul POM-QM yang sesuai.
   - `moduleMapper.ts` memetakan baris tabel mentah menjadi tipe input terstruktur untuk masing-masing modul.
2. **DAG Planning (`src/core/pipeline/pipelineResolver.ts`)**:
   - Apabila user menautkan output modul ke input modul lain (misalnya `Forecasting.annualizedForecast12` $\rightarrow$ `Inventory.annualDemand`), algoritma Kahn membangun tahapan eksekusi (*Stage 1*, *Stage 2*, dst.).
   - Modul yang tidak saling bergantung masuk ke tahap yang sama.
3. **Parallel Execution (`src/workers/workerPool.ts` + `solver.worker.ts`)**:
   - Setiap modul pada tahap yang sama dieksekusi **secara paralel** di Web Worker terpisah agar UI tetap responsif.
   - Setelah seluruh modul selesai, `BatchDashboard` merangkum semua KPI, grafik, dan tabel dalam satu tampilan eksekutif yang dapat diekspor menjadi 1 file Excel multi-sheet (`Laporan_Hasil_OmniQM.xlsx`).
