import { useState } from 'react';
import Layout from './components/Layout/Layout';
import ModListPage from './pages/ModListPage';
import SettingsPage from './pages/SettingsPage';
import InstancesPage from './pages/InstancesPage';
import DownloadsPage from './pages/DownloadsPage';
import ReposPage from './pages/ReposPage';
import { ckanIpc } from './services/ipc';

type NavItem = 'available' | 'installed' | 'downloads' | 'instances' | 'repos' | 'settings';

function App() {
  const [activePage, setActivePage] = useState<NavItem>('available');

  // Initialize IPC bridge
  // The actual .NET reference will be injected by the WebView2 control
  const initBridge = (dotNetRef: unknown) => {
    ckanIpc.init(dotNetRef);
  };

  // Expose initBridge globally for .NET to call
  (window as any).initCKANBridge = initBridge;

  const renderPage = () => {
    switch (activePage) {
      case 'available':
      case 'installed':
        return <ModListPage view={activePage} />;
      case 'settings':
        return <SettingsPage />;
      case 'instances':
        return <InstancesPage />;
      case 'downloads':
        return <DownloadsPage />;
      case 'repos':
        return <ReposPage />;
      default:
        return <ModListPage view="available" />;
    }
  };

  return (
    <Layout activePage={activePage} onNavigate={setActivePage}>
      {renderPage()}
    </Layout>
  );
}

export default App;
