import { useEffect, useState } from 'react';
import { AlertTriangle, FileJson, RefreshCw, X } from 'lucide-react';
import { exportWorkspaceBundleJson } from '../../io/exporters/jsonExporter.ts';
import { useWorkspace } from '../../store/workspaceContext.ts';

const SW_UPDATE_EVENT = 'omniqm:sw-update-available';

export function SystemStatusBanners() {
  const { state, dismissStorageWarning } = useWorkspace();
  const [waitingReg, setWaitingReg] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    const onSwUpdate = (evt: Event) => {
      const detail = (evt as CustomEvent<{ registration?: ServiceWorkerRegistration }>).detail;
      if (detail?.registration) {
        setWaitingReg(detail.registration);
      }
    };
    window.addEventListener(SW_UPDATE_EVENT, onSwUpdate);
    return () => window.removeEventListener(SW_UPDATE_EVENT, onSwUpdate);
  }, []);

  const applySwUpdate = () => {
    if (!waitingReg?.waiting) {
      window.location.reload();
      return;
    }
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      () => {
        window.location.reload();
      },
      { once: true },
    );
    waitingReg.waiting.postMessage({ type: 'SKIP_WAITING' });
  };

  if (!waitingReg && !state.storageWarning) return null;

  return (
    <div className="system-banners no-print" aria-live="polite">
      {state.storageWarning && (
        <div className="system-banner system-banner-warning" role="alert">
          <div className="system-banner-text">
            <AlertTriangle size={14} style={{ flexShrink: 0 }} />
            <span>{state.storageWarning}</span>
          </div>
          <div className="system-banner-actions">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => exportWorkspaceBundleJson(state.jobs, state.links)}
            >
              <FileJson size={12} /> Simpan .json
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={dismissStorageWarning}
              aria-label="Tutup peringatan penyimpanan"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      )}

      {waitingReg && (
        <div className="system-banner system-banner-info" role="status">
          <div className="system-banner-text">
            <RefreshCw size={14} style={{ flexShrink: 0 }} />
            <span>
              <strong>Versi baru OmniQM Studio tersedia.</strong> Muat ulang saat Anda siap agar tidak mengganggu pengeditan.
            </span>
          </div>
          <div className="system-banner-actions">
            <button type="button" className="btn btn-sm btn-primary" onClick={applySwUpdate}>
              Muat Ulang Sekarang
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => setWaitingReg(null)}
              aria-label="Nanti saja"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
