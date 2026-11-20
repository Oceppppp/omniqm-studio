import { WorkspaceProvider } from './store/workspaceStore.tsx';
import { AppShell } from './ui/layouts/AppShell.tsx';

export function App() {
  return (
    <WorkspaceProvider>
      <AppShell />
    </WorkspaceProvider>
  );
}

export default App;
