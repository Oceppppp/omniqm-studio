import type { ModuleJob, PipelineLink } from '../../core/types/workspace.types.ts';
import { triggerDownload } from './excelExporter.ts';

export function exportWorkspaceBundleJson(
  jobs: ModuleJob[],
  links: PipelineLink[],
): void {
  const payload = {
    app: 'OmniQM Studio',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    jobs,
    links,
  };
  const json = JSON.stringify(payload, null, 2);
  triggerDownload(
    new Blob([json], { type: 'application/json;charset=utf-8' }),
    `Proyek_OmniQM_${new Date().toISOString().slice(0, 10)}.omniqm.json`,
  );
}
