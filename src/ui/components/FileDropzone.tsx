import { useRef, useState, type DragEvent } from 'react';
import {
  FileSpreadsheet,
  Play,
  UploadCloud,
  CheckSquare,
  SlidersHorizontal,
} from 'lucide-react';
import { MODULE_REGISTRY } from '../../core/registry/moduleRegistry.ts';
import type { ModuleId } from '../../core/types/module.types.ts';
import type { DetectedSheetCandidate } from '../../core/types/workspace.types.ts';
import { downloadMasterTemplateExcel } from '../../io/exporters/excelExporter.ts';
import {
  autoSuggestColumnMapping,
  detectHeaderRowIndex,
  getModuleMappingFields,
} from '../../io/parsers/columnMapping.ts';
import { parseCsvFile, parseCsvText } from '../../io/parsers/csvParser.ts';
import { parseExcelFile } from '../../io/parsers/excelParser.ts';
import { parseJsonOrJsFile, parseJsonOrJsText } from '../../io/parsers/jsonParser.ts';
import { useWorkspace } from '../../store/workspaceContext.ts';

function enrichCandidateDefaults(cand: DetectedSheetCandidate): DetectedSheetCandidate {
  const headerIdx = cand.headerRowIndex ?? detectHeaderRowIndex(cand.rawRows);
  const headerRow = cand.rawRows[headerIdx] ?? [];
  const columnMapping =
    cand.columnMapping ?? autoSuggestColumnMapping(cand.suggestedModuleId, headerRow);
  return {
    ...cand,
    headerRowIndex: headerIdx,
    columnMapping,
  };
}

export function FileDropzone() {
  const {
    state,
    setPendingCandidates,
    updateCandidate,
    commitPendingCandidates,
    importProjectJobs,
  } = useWorkspace();

  const [dragging, setDragging] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [openMapperIds, setOpenMapperIds] = useState<Record<string, boolean>>({});
  const inputRef = useRef<HTMLInputElement | null>(null);

  const toggleMapper = (id: string) => {
    setOpenMapperIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setErrorMsg(null);
    setInfoMsg(null);
    const collected: DetectedSheetCandidate[] = [];
    const directJobs: typeof state.jobs = [];
    const directLinks: typeof state.links = [];
    const unsupported: string[] = [];

    try {
      for (const file of Array.from(fileList)) {
        const lower = file.name.toLowerCase();
        if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.ods')) {
          const sheets = await parseExcelFile(file);
          collected.push(...sheets.map(enrichCandidateDefaults));
        } else if (lower.endsWith('.csv') || lower.endsWith('.tsv')) {
          const sheets = await parseCsvFile(file);
          collected.push(...sheets.map(enrichCandidateDefaults));
        } else if (
          lower.endsWith('.json') ||
          lower.endsWith('.js') ||
          lower.endsWith('.mjs') ||
          lower.endsWith('.cjs')
        ) {
          const parsed = await parseJsonOrJsFile(file);
          directJobs.push(...parsed.jobs);
          directLinks.push(...parsed.links);
          collected.push(...parsed.candidates.map(enrichCandidateDefaults));
        } else {
          // Accept arbitrary extensions / extensionless text/JS/JSON/CSV files cleanly
          const text = await file.text();
          if (text.includes('\u0000')) {
            unsupported.push(file.name);
            continue;
          }
          try {
            const parsed = parseJsonOrJsText(file.name, text);
            directJobs.push(...parsed.jobs);
            directLinks.push(...parsed.links);
            collected.push(...parsed.candidates.map(enrichCandidateDefaults));
          } catch {
            const csvSheets = parseCsvText(file.name, text);
            if (csvSheets.length > 0 && csvSheets[0].rawRows.some((r) => r.length > 1)) {
              collected.push(...csvSheets.map(enrichCandidateDefaults));
            } else {
              unsupported.push(file.name);
            }
          }
        }
      }

      if (unsupported.length > 0) {
        setErrorMsg(
          `Format file tidak didukung / biner: ${unsupported.join(', ')}. Gunakan Excel (.xlsx/.xls/.ods), CSV/TSV, JSON, atau JavaScript (.js/.mjs/.cjs dengan nama bebas).`,
        );
      }

      if (directJobs.length > 0) {
        const hasPendingTables = collected.length > 0;
        importProjectJobs(directJobs, directLinks, replaceExisting, !hasPendingTables);
        if (hasPendingTables) {
          setReplaceExisting(false);
          setInfoMsg(
            `${directJobs.length} modul dari file JS/JSON telah dimuat ke antrean. Silakan tinjau ${collected.length} tabel di bawah lalu klik Impor.`,
          );
        }
      }

      if (collected.length > 0) {
        setPendingCandidates(collected);
      } else if (directJobs.length === 0 && unsupported.length === 0) {
        setErrorMsg('Tidak ada lembar data atau ekspor modul yang terbaca dari file yang diunggah.');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal membaca file.');
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    void handleFiles(e.dataTransfer.files);
  };

  const selectedCount = state.pendingCandidates.filter((c) => c.selected).length;

  return (
    <>
      <header className="view-header">
        <div>
          <div className="view-eyebrow">INGESTI DATA OTOMATIS · PEMETAAN KOLOM</div>
          <h1 className="view-heading">Impor Data Massal Multi-Format</h1>
          <p className="view-lead">
            Unggah workbook Excel banyak sheet, CSV/TSV, JSON, atau skrip JavaScript dengan nama berkas apa pun — parser berjalan 100% lokal di browser tanpa <code>eval()</code>.
          </p>
        </div>
        <div className="view-header-actions no-print">
          <button
            type="button"
            id="btn-dropzone-template"
            className="btn btn-sm"
            onClick={() => void downloadMasterTemplateExcel()}
          >
            <FileSpreadsheet size={14} /> Unduh Master Template (.xlsx)
          </button>
        </div>
      </header>

      <section className="format-spec-strip" aria-label="Spesifikasi Format Berkas yang Didukung">
        <div className="format-spec-cell">
          <div className="format-spec-title">
            <span>Excel Multi-Sheet</span>
            <span className="badge mono-num">.xlsx / .xls / .ods</span>
          </div>
          <div className="format-spec-desc">
            Membaca seluruh sheet dalam 1 file dan mendeteksi modul + kolom secara otomatis.
          </div>
        </div>
        <div className="format-spec-cell">
          <div className="format-spec-title">
            <span>CSV &amp; Delimiter</span>
            <span className="badge mono-num">.csv / .tsv / .txt</span>
          </div>
          <div className="format-spec-desc">
            Mendukung pemisah koma, titik-koma (locale Indonesia), dan tab langsung dari clipboard.
          </div>
        </div>
        <div className="format-spec-cell">
          <div className="format-spec-title">
            <span>OmniQM Project</span>
            <span className="badge mono-num">.json / .omniqm.json</span>
          </div>
          <div className="format-spec-desc">
            Memulihkan antrean pekerjaan beserta sambungan pipeline antar-modul secara utuh.
          </div>
        </div>
        <div className="format-spec-cell">
          <div className="format-spec-title">
            <span>Universal JavaScript</span>
            <span className="badge mono-num" style={{ whiteSpace: 'nowrap' }}>.js / bebas</span>
          </div>
          <div className="format-spec-desc">
            Nama file bebas (<code>.js</code>, <code>.mjs</code>, <code>.cjs</code>); mengekstrak ESM, CommonJS, UMD, JSONP, IIFE, maupun array/objek.
          </div>
        </div>
      </section>

      <section className="surface-panel" aria-label="Upload Multi-File dan Excel Multi-Sheet">
        <div
          className={`dropzone ${dragging ? 'dragging' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <UploadCloud size={30} style={{ color: 'var(--primary)', marginBottom: '0.55rem' }} />
          <div style={{ fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--text-primary)', marginBottom: '0.3rem' }}>
            Tarik &amp; Lepas File Excel, CSV, JSON, atau File JavaScript ke Area Ini
          </div>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: '1rem', maxWidth: '58ch', marginInline: 'auto' }}>
            Mendukung multi-file sekaligus dan seluruh pola ekspor JS (<code>export default</code>, <code>export const</code>, <code>module.exports</code>, array 1D/2D, atau objek parameter) secara aman.
          </p>
          <input
            ref={inputRef}
            id="file-upload-input"
            type="file"
            multiple
            accept=".xlsx,.xls,.ods,.csv,.tsv,.txt,.json,.js,.mjs,.cjs"
            style={{ display: 'none' }}
            onChange={(e) => void handleFiles(e.target.files)}
          />
          <button
            type="button"
            id="btn-browse-files"
            className="btn btn-primary"
            onClick={() => inputRef.current?.click()}
          >
            Pilih File dari Komputer
          </button>
        </div>

        {infoMsg && (
          <div className="alert-strip alert-info" style={{ marginTop: '0.85rem' }}>
            {infoMsg}
          </div>
        )}

        {errorMsg && (
          <div className="alert-strip alert-warning" style={{ marginTop: '0.85rem' }}>
            {errorMsg}
          </div>
        )}

        {state.pendingCandidates.length > 0 && (
          <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h2 className="panel-title">
                  Pratinjau Deteksi Otomatis ({state.pendingCandidates.length} Sheet / Tabel)
                </h2>
                <div className="panel-subtitle">
                  Periksa modul terdeteksi atau sesuaikan baris header &amp; pemetaan kolom sebelum mengeksekusi batch.
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: 'var(--text-xs)' }}>
                  <input
                    type="checkbox"
                    checked={replaceExisting}
                    onChange={(e) => setReplaceExisting(e.target.checked)}
                  />
                  Ganti antrean saat ini
                </label>
                <button
                  type="button"
                  id="btn-commit-upload-run"
                  className="btn btn-primary"
                  disabled={selectedCount === 0}
                  onClick={() => commitPendingCandidates(replaceExisting, true)}
                >
                  <Play size={14} /> Impor {selectedCount} Modul &amp; Jalankan Sekaligus
                </button>
              </div>
            </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Impor</th>
                  <th>File / Sheet</th>
                  <th>Modul Terdeteksi (Dapat Diubah)</th>
                  <th>Kepercayaan</th>
                  <th>Alasan Deteksi</th>
                  <th>Mapping &amp; Dimensi</th>
                </tr>
              </thead>
              <tbody>
                {state.pendingCandidates.map((cand) => {
                  const isMapperOpen = openMapperIds[cand.id] ?? false;
                  const headerIdx = cand.headerRowIndex ?? detectHeaderRowIndex(cand.rawRows);
                  const headerRow = cand.rawRows[headerIdx] ?? [];
                  const maxCols = Math.max(
                    headerRow.length,
                    cand.rawRows[headerIdx + 1]?.length ?? 0,
                  );
                  const fields = getModuleMappingFields(cand.suggestedModuleId);
                  const mapping = cand.columnMapping ?? {};
                  const maxHeaderOptions = Math.min(8, cand.rawRows.length);
                  const previewRows = cand.rawRows.slice(headerIdx, headerIdx + 4);

                  return (
                    <FragmentRow
                      key={cand.id}
                      cand={cand}
                      isMapperOpen={isMapperOpen}
                      headerIdx={headerIdx}
                      headerRow={headerRow}
                      maxCols={maxCols}
                      fields={fields}
                      mapping={mapping}
                      maxHeaderOptions={maxHeaderOptions}
                      previewRows={previewRows}
                      onToggleMapper={() => toggleMapper(cand.id)}
                      onUpdate={(patch) => updateCandidate(cand.id, patch)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </section>
    </>
  );
}

interface FragmentRowProps {
  cand: DetectedSheetCandidate;
  isMapperOpen: boolean;
  headerIdx: number;
  headerRow: (string | number | boolean | null)[];
  maxCols: number;
  fields: ReturnType<typeof getModuleMappingFields>;
  mapping: Record<string, number>;
  maxHeaderOptions: number;
  previewRows: (string | number | boolean | null)[][];
  onToggleMapper: () => void;
  onUpdate: (patch: Partial<DetectedSheetCandidate>) => void;
}

function FragmentRow({
  cand,
  isMapperOpen,
  headerIdx,
  headerRow,
  maxCols,
  fields,
  mapping,
  maxHeaderOptions,
  previewRows,
  onToggleMapper,
  onUpdate,
}: FragmentRowProps) {
  return (
    <>
      <tr>
        <td>
          <input
            type="checkbox"
            checked={cand.selected}
            onChange={(e) => onUpdate({ selected: e.target.checked })}
          />
        </td>
        <td>
          <strong>{cand.sheetName}</strong>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{cand.fileName}</div>
        </td>
        <td>
          <select
            className="form-control"
            value={cand.suggestedModuleId}
            onChange={(e) => {
              const newModId = e.target.value as ModuleId;
              const hIdx = cand.headerRowIndex ?? detectHeaderRowIndex(cand.rawRows);
              const hdr = cand.rawRows[hIdx] ?? [];
              onUpdate({
                suggestedModuleId: newModId,
                headerRowIndex: hIdx,
                columnMapping: autoSuggestColumnMapping(newModId, hdr),
              });
            }}
          >
            {MODULE_REGISTRY.map((m) => (
              <option key={m.id} value={m.id}>
                {m.code} — {m.indonesianName}
              </option>
            ))}
          </select>
        </td>
        <td>
          <span
            className={`badge ${cand.confidence >= 0.85 ? 'badge-success' : 'badge-warning'}`}
          >
            <CheckSquare size={11} /> {Math.round(cand.confidence * 100)}%
          </span>
        </td>
        <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{cand.reason}</td>
        <td>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }} className="mono-num">
              {cand.rawRows.length}×{cand.rawRows[0]?.length ?? 0}
            </span>
            <button
              type="button"
              className="btn btn-sm"
              onClick={onToggleMapper}
              title="Sesuaikan baris header dan pemetaan kolom"
            >
              <SlidersHorizontal size={12} /> {isMapperOpen ? 'Tutup Mapping' : 'Mapping Kolom'}
            </button>
          </div>
        </td>
      </tr>

      {isMapperOpen && (
        <tr>
          <td colSpan={6} style={{ background: 'var(--bg-subtle)', padding: '0.75rem' }}>
            <div className="column-mapper-panel">
              <div className="form-grid" style={{ marginBottom: '0.75rem' }}>
                <div className="field-group">
                  <label className="field-label">Baris Header Tabel</label>
                  <select
                    className="form-control"
                    value={headerIdx}
                    onChange={(e) => {
                      const newIdx = Number(e.target.value) || 0;
                      const newHdr = cand.rawRows[newIdx] ?? [];
                      onUpdate({
                        headerRowIndex: newIdx,
                        columnMapping: autoSuggestColumnMapping(cand.suggestedModuleId, newHdr),
                      });
                    }}
                  >
                    {Array.from({ length: maxHeaderOptions }, (_, rIdx) => {
                      const preview = cand.rawRows[rIdx]
                        .slice(0, 4)
                        .map((c) => String(c ?? '').trim())
                        .filter(Boolean)
                        .join(' | ');
                      return (
                        <option key={rIdx} value={rIdx}>
                          Baris {rIdx + 1}: {preview || '(kosong)'}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {fields.map((field) => (
                  <div key={field.key} className="field-group">
                    <label className="field-label">
                      {field.label}
                      {field.required ? ' *' : ''}
                    </label>
                    <select
                      className="form-control"
                      value={mapping[field.key] ?? ''}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const nextMap = { ...mapping };
                        if (raw === '') {
                          delete nextMap[field.key];
                        } else {
                          nextMap[field.key] = Number(raw);
                        }
                        onUpdate({ columnMapping: nextMap });
                      }}
                    >
                      <option value="">-- Otomatis / Tidak Dipakai --</option>
                      {Array.from({ length: maxCols }, (_, colIdx) => (
                        <option key={colIdx} value={colIdx}>
                          Kolom {colIdx + 1}: {String(headerRow[colIdx] ?? '(kosong)').slice(0, 26)}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {fields.length === 0 && (
                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>
                  Modul ini menggunakan struktur matriks/parameter otomatis penuh (sesuaikan Baris Header di atas jika file memiliki baris metadata di bagian atas).
                </div>
              )}

              {previewRows.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                    Pratinjau 4 Baris Mulai dari Baris Header {headerIdx + 1}:
                  </div>
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          {Array.from({ length: maxCols }, (_, cIdx) => (
                            <th key={cIdx}>
                              Kol {cIdx + 1}: {String(previewRows[0]?.[cIdx] ?? '')}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.slice(1).map((row, rIdx) => (
                          <tr key={rIdx}>
                            {Array.from({ length: maxCols }, (_, cIdx) => (
                              <td key={cIdx} className="mono-num">
                                {String(row[cIdx] ?? '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
