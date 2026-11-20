import { useEffect } from 'react';
import { useWorkspace } from '../../store/workspaceContext.ts';
import { ArchitectureModal } from '../components/ArchitectureModal.tsx';
import { BatchDashboard } from '../components/BatchDashboard.tsx';
import { FileDropzone } from '../components/FileDropzone.tsx';
import { ModuleCatalog } from '../components/ModuleCatalog.tsx';
import { ModuleInputPanel } from '../components/ModuleInputPanel.tsx';
import { PipelineLinker } from '../components/PipelineLinker.tsx';
import { TopBar } from '../components/TopBar.tsx';

export function AppShell() {
  const { state } = useWorkspace();

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [state.activeView]);

  return (
    <div className="app-root">
      <TopBar />
      <div className="app-shell">
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
      <ArchitectureModal />
    </div>
  );
}
