import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Bot, Download, FolderOpen, Package, Settings, Database, PanelLeftClose, PanelLeftOpen, Rocket } from 'lucide-react';
import AIChatPanel from '../AIChat/AIChatPanel';
import UpdateBanner from '../UpdateBanner/UpdateBanner';
import { registryService } from '../../services/registry';
import ckanIpc from '../../services/ipc';
import { useT } from '../../i18n';
import styles from './Layout.module.css';

export type NavItem = 'available' | 'installed' | 'downloads' | 'instances' | 'mission-control' | 'repos' | 'settings';

interface NavItemDef {
  id: NavItem;
  label: string;
  icon: React.ReactNode;
  badge?: string | number;
}

interface LayoutProps {
  children: React.ReactNode;
  activePage?: NavItem;
  onNavigate?: (page: NavItem) => void;
}

export default function Layout({ children, activePage = 'available', onNavigate }: LayoutProps) {
  const { t } = useT();
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [navExpanded, setNavExpanded] = useState(true);
  const [modCount, setModCount] = useState(0);
  const [installedCount, setInstalledCount] = useState(0);

  // Fetch the real installed count from the backend
  const refreshInstalledCount = useCallback(() => {
    if (!ckanIpc.isConnected()) return;
    ckanIpc.call<any, any>('mod:list-installed', {}).then((result) => {
      if (result?.mods && Array.isArray(result.mods)) {
        setInstalledCount(result.mods.length);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    registryService.load().then(() => {
      setModCount(registryService.getModuleCount());
    });
    refreshInstalledCount();
  }, []);

  // Listen for any event that changes counts and re-fetch from backend
  useEffect(() => {
    const unsub1 = ckanIpc.on('instance:switched', (data: any) => {
      registryService.clearInstalled();
      if (data?.modCount != null) setModCount(data.modCount);
      if (data?.installedCount != null) setInstalledCount(data.installedCount);
    });
    const unsub2 = ckanIpc.on('repo:refresh-complete', (data: any) => {
      if (data?.modCount != null) setModCount(data.modCount);
      // Installed count may also change after refresh
      refreshInstalledCount();
    });
    // After install/uninstall completes, re-fetch the real count from backend
    // (don't do naive +1/-1 — installs bring dependencies, count can jump)
    const unsub3 = ckanIpc.on('install:complete', () => {
      refreshInstalledCount();
    });
    const unsub4 = ckanIpc.on('uninstall:complete', () => {
      refreshInstalledCount();
    });
    return () => { unsub1(); unsub2(); unsub3(); unsub4(); };
  }, []);

  const navItems: NavItemDef[] = [
    { id: 'available', label: t('nav.available'), icon: <Package size={20} />, badge: modCount || undefined },
    { id: 'installed', label: t('nav.installed'), icon: <FolderOpen size={20} />, badge: installedCount || undefined },
    { id: 'downloads', label: t('nav.downloads'), icon: <Download size={20} /> },
    { id: 'instances', label: t('nav.instances'), icon: <Database size={20} /> },
    { id: 'mission-control', label: t('nav.missionControl'), icon: <Rocket size={20} /> },
    { id: 'settings', label: t('nav.settings'), icon: <Settings size={20} /> },
  ];

  return (
    <div className={styles.layout}>
      <UpdateBanner />
      <div className={styles.body}>
        {/* Navigation Rail */}
        <nav className={`${styles.navRail} ${navExpanded ? '' : styles.navRailCollapsed}`}>
          <div className={styles.navTop}>
            <div className={styles.logo}>
              <span className={styles.logoText}>CKAN</span>
              {navExpanded && <span className={styles.logoBadge}>MOD</span>}
            </div>

            {navItems.map((item) => (
              <button
                key={item.id}
                className={`${styles.navItem} ${activePage === item.id ? styles.navItemActive : ''}`}
                onClick={() => onNavigate?.(item.id)}
                title={item.label}
              >
                <span className={styles.navIcon}>{item.icon}</span>
                {navExpanded && (
                  <span className={styles.navLabel}>{item.label}</span>
                )}
                {navExpanded && item.badge !== undefined && (
                  <span className={styles.navBadge}>{item.badge}</span>
                )}
              </button>
            ))}
          </div>

          <div className={styles.navBottom}>
            <button
              className={`${styles.navItem} ${aiPanelOpen ? styles.navItemActive : ''}`}
              onClick={() => setAiPanelOpen(!aiPanelOpen)}
              title={t('nav.aiAssistant')}
            >
              <span className={styles.navIcon}><Bot size={20} /></span>
              {navExpanded && <span className={styles.navLabel}>{t('nav.aiAssistant')}</span>}
            </button>

            <button
              className={styles.navItem}
              onClick={() => setNavExpanded(!navExpanded)}
              title={navExpanded ? t('nav.collapse') : t('nav.expand')}
            >
              <span className={styles.navIcon}>
                {navExpanded ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
              </span>
              {navExpanded && <span className={styles.navLabel}>{t('nav.collapse')}</span>}
            </button>
          </div>
        </nav>

        {/* Main Content */}
        <main className={styles.main}>
          <div className={styles.content}>
            {children}
          </div>

          {/* AI Panel */}
          <AnimatePresence>
            {aiPanelOpen && (
              <AIChatPanel onClose={() => setAiPanelOpen(false)} />
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* Status Bar */}
      <footer className={styles.statusBar}>
        <div className={styles.statusLeft}>
          <span className={styles.statusDot} />
          <span>{modCount > 0 ? t('nav.modsLoaded', { count: modCount.toLocaleString() }) : t('nav.loadingRegistry')}</span>
        </div>
        <div className={styles.statusRight}>
          <span>{t('nav.installed.count', { count: installedCount })}</span>
          <span className={styles.statusSep}>|</span>
          <span>v2.0.0-dev</span>
        </div>
      </footer>
    </div>
  );
}
