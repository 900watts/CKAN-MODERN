import { useState, useCallback } from 'react';
import Layout from './components/Layout/Layout';
import type { NavItem } from './components/Layout/Layout';
import ModListPage from './pages/ModListPage';
import SettingsPage from './pages/SettingsPage';
import InstancesPage from './pages/InstancesPage';
import DownloadsPage from './pages/DownloadsPage';
import MissionControl from './kerbal-control/MissionControl';
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary';
import { ckanIpc } from './services/ipc';
import { downloadStore } from './services/downloadStore';
import { worldContext } from './kerbal-control/WorldContext';

// Initialize download store listeners early so events are captured
// even before the Downloads tab is opened
downloadStore.init();

function App() {
  const [activePage, setActivePage] = useState<NavItem>('available');

  // Initialize IPC bridge
  const initBridge = (dotNetRef: unknown) => {
    ckanIpc.init(dotNetRef);
  };
  (window as any).initCKANBridge = initBridge;

  // Lightweight install change signal — no full tree remount
  const [installTick, setInstallTick] = useState(0);
  const handleInstallChange = useCallback(() => {
    setInstallTick((t) => t + 1);
  }, []);

  const handleNavigate = useCallback((page: NavItem) => {
    setActivePage(page);
    worldContext.setPage(page);
    worldContext.markActivity();
  }, []);

  const renderPage = () => {
    switch (activePage) {
      case 'available':
      case 'installed':
        return <ModListPage key={activePage} view={activePage} onInstallChange={handleInstallChange} installTick={installTick} />;
      case 'settings':
        return <SettingsPage />;
      case 'instances':
        return <InstancesPage />;
      case 'downloads':
        return <DownloadsPage />;
      case 'mission-control':
        return (
          <ErrorBoundary>
            <MissionControl />
          </ErrorBoundary>
        );
      default:
        return <ModListPage view="available" onInstallChange={handleInstallChange} installTick={installTick} />;
    }
  };

  return (
    <Layout activePage={activePage} onNavigate={handleNavigate}>
      {renderPage()}
    </Layout>
  );
}

export default App;
