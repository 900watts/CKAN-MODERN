import { useState } from 'react';
import Layout from './components/Layout/Layout';
import type { NavItem } from './components/Layout/Layout';
import ModListPage from './pages/ModListPage';
import SettingsPage from './pages/SettingsPage';
import InstancesPage from './pages/InstancesPage';
import DownloadsPage from './pages/DownloadsPage';
import ReposPage from './pages/ReposPage';
import { ckanIpc } from './services/ipc';
import { downloadStore } from './services/downloadStore';

// Initialize download store listeners early so events are captured
// even before the Downloads tab is opened
downloadStore.init();

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
        // FIX: Only key on activePage+refreshKey here — do NOT put key on <Layout>
        return <ModListPage key={`${activePage}-${refreshKey}`} view={activePage} onInstallChange={handleInstallChange} />;
      case 'settings':
        return <SettingsPage />;
      case 'instances':
        return <InstancesPage />;
      case 'downloads':
        return <DownloadsPage />;
      case 'repos':
        return <ReposPage />;
      default:
        return <ModListPage view="available" onInstallChange={handleInstallChange} />;
    }
  };

  return (
    // FIX: Removed key={refreshKey} from Layout — it was causing full Layout remount on every install,
    // resetting the sidebar expanded/collapsed state, AI panel open state, and causing a visible flash.
    <Layout activePage={activePage} onNavigate={setActivePage}>
      {renderPage()}
    </Layout>
  );
}

export default App;
