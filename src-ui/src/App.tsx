import { useState } from 'react';
import Layout from './components/Layout/Layout';
import type { NavItem } from './components/Layout/Layout';
import ModListPage from './pages/ModListPage';
import SettingsPage from './pages/SettingsPage';
import InstancesPage from './pages/InstancesPage';
import DownloadsPage from './pages/DownloadsPage';
import { ckanIpc } from './services/ipc';

function App() {
  const [activePage, setActivePage] = useState<NavItem>('available');
  const [refreshKey, setRefreshKey] = useState(0);

  // Initialize IPC bridge
  const initBridge = (dotNetRef: unknown) => {
    ckanIpc.init(dotNetRef);
  };
  (window as any).initCKANBridge = initBridge;

  const handleInstallChange = () => {
    setRefreshKey((k) => k + 1);
  };

  const renderPage = () => {
    switch (activePage) {
      case 'available':
      case 'installed':
        return <ModListPage key={`${activePage}-${refreshKey}`} view={activePage} onInstallChange={handleInstallChange} />;
      case 'settings':
        return <SettingsPage />;
      case 'instances':
        return <InstancesPage />;
      case 'downloads':
        return <DownloadsPage />;
      default:
        return <ModListPage view="available" onInstallChange={handleInstallChange} />;
    }
  };

  return (
    <Layout activePage={activePage} onNavigate={setActivePage} key={refreshKey}>
      {renderPage()}
    </Layout>
  );
}

export default App;
