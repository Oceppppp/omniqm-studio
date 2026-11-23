import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, Download, RotateCcw, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class WorkspaceErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    errorMessage: '',
  };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error?.message || 'Terjadi kesalahan antarmuka yang tidak terduga.',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[OmniQM ErrorBoundary]', error, info.componentStack);
  }

  handleDownloadBackup = (): void => {
    try {
      const payload =
        localStorage.getItem('omniqm_studio_projects_v1') ??
        localStorage.getItem('omniqm_studio_workspace_v1') ??
        JSON.stringify({ jobs: [], links: [] });
      const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `omniqm_recovery_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      // Ignore fallback export failure
    }
  };

  handleSafeReset = (): void => {
    try {
      localStorage.removeItem('omniqm_studio_workspace_v1');
      localStorage.removeItem('omniqm_studio_projects_v1');
    } catch {
      // Ignore storage clear errors
    }
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="error-boundary-screen" role="alert">
        <div className="error-boundary-card">
          <div className="error-boundary-icon" aria-hidden="true">
            <AlertTriangle size={22} />
          </div>
          <div className="view-eyebrow">PEMULIHAN WORKSPACE · OMNIQM STUDIO</div>
          <h1 className="view-heading" style={{ marginBottom: '0.5rem' }}>
            Terjadi Kesalahan Tampilan Antarmuka
          </h1>
          <p className="view-lead" style={{ marginBottom: '1rem' }}>
            Data proyek Anda di penyimpanan lokal browser tetap aman. Anda dapat mengunduh cadangan JSON terlebih dahulu sebelum memuat ulang atau mereset workspace ke konfigurasi bawaan.
          </p>
          <pre className="error-boundary-detail mono-num">{this.state.errorMessage}</pre>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1.15rem' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => window.location.reload()}
            >
              <RefreshCw size={14} /> Muat Ulang Aplikasi
            </button>
            <button type="button" className="btn" onClick={this.handleDownloadBackup}>
              <Download size={14} /> Unduh Backup .json
            </button>
            <button type="button" className="btn" onClick={this.handleSafeReset}>
              <RotateCcw size={14} /> Reset Workspace Aman
            </button>
          </div>
        </div>
      </div>
    );
  }
}
