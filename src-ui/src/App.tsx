import { useState, useEffect } from 'react';
import { supabase } from './utils/supabase';
import Layout from './components/Layout/Layout';
import type { NavItem } from './components/Layout/Layout';
import ModListPage from './pages/ModListPage';
import SettingsPage from './pages/SettingsPage';
import InstancesPage from './pages/InstancesPage';
import DownloadsPage from './pages/DownloadsPage';
import { ckanIpc } from './services/ipc';
import { authService } from './services/auth';

function App() {
  const [activePage, setActivePage] = useState<NavItem>('available');
  const [refreshKey, setRefreshKey] = useState(0);

  // Initialize IPC bridge (called by .NET WebView2)
  (window as any).initCKANBridge = (dotNetRef: unknown) => ckanIpc.init(dotNetRef);

  // Wire Supabase session into authService
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) (authService as any).loadUserProfile(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        (authService as any).loadUserProfile(session);
      } else {
        (authService as any).updateState({ user: null, session: null, loading: false });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleInstallChange = () => setRefreshKey((k) => k + 1);

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
