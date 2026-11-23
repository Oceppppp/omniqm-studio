import { useEffect } from 'react';
import { useWorkspace } from '../../store/workspaceContext.ts';
import { ArchitectureModal } from '../components/ArchitectureModal.tsx';
import { BatchDashboard } from '../components/BatchDashboard.tsx';
import { CommandPaletteModal } from '../components/CommandPaletteModal.tsx';
import { FileDropzone } from '../components/FileDropzone.tsx';
import { FullPrintReport } from '../components/FullPrintReport.tsx';
import { ModuleCatalog } from '../components/ModuleCatalog.tsx';
import { ModuleInputPanel } from '../components/ModuleInputPanel.tsx';
import { PipelineLinker } from '../components/PipelineLinker.tsx';
import { SystemStatusBanners } from '../components/SystemStatusBanners.tsx';
import { TopBar } from '../components/TopBar.tsx';

export function AppShell() {
  const {
    state,
    canUndo,
    canRedo,
    undo,
    redo,
    runAll,
    setShowCommandPalette,
    setSidebarOpen,
  } = useWorkspace();

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [state.activeView]);

  // Global analytical workbench keyboard shortcuts (Ctrl+K, Ctrl+Enter, Ctrl+Z/Y)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) {
        if (e.key === 'Escape' && state.sidebarOpen) {
          setSidebarOpen(false);
        }
        return;
      }

      const key = e.key.toLowerCase();
      if (key === 'k') {
        e.preventDefault();
        setShowCommandPalette(!state.showCommandPalette);
        return;
      }

      if (key === 'enter') {
        e.preventDefault();
        if (!state.isRunning && state.jobs.some((j) => j.enabled)) {
          void runAll(true);
        }
        return;
      }

      // Avoid hijacking native text undo inside form controls
      const tag = (e.target as HTMLElement | null)?.tagName;
      const isTextControl = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (isTextControl) return;

      if (key === 'z' && !e.shiftKey && canUndo) {
        e.preventDefault();
        undo();
      } else if ((key === 'y' || (key === 'z' && e.shiftKey)) && canRedo) {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    canRedo,
    canUndo,
    redo,
    runAll,
    setShowCommandPalette,
    setSidebarOpen,
    state.isRunning,
    state.jobs,
    state.showCommandPalette,
    state.sidebarOpen,
    undo,
  ]);

  return (
    <div className={`app-root ${state.printMode === 'full' ? 'app-root-full-print' : ''}`}>
      <TopBar />
      <SystemStatusBanners />

      <div className="app-shell">
        {state.sidebarOpen && (
          <div
            className="sidebar-backdrop no-print"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}
        <ModuleCatalog />
        <main className="main-pane">
          <div className="workspace-container">
            {state.activeView === 'batch-results' && <BatchDashboard />}
            {state.activeView === 'module-editor' && <ModuleInputPanel />}
            {state.activeView === 'file-upload' && <FileDropzone />}
            {state.activeView === 'pipeline' && <PipelineLinker />}
          </div>
        </main>
      </div>

      <FullPrintReport />
      <ArchitectureModal />
      <CommandPaletteModal />
    </div>
  );
}
