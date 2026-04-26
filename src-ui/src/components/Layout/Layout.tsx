import { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Bot, Download, FolderOpen, Package, Settings, Database, PanelLeftClose, PanelLeftOpen, BookMarked } from 'lucide-react';
import AIChatPanel from '../AIChat/AIChatPanel';
import { registryService } from '../../services/registry';
import styles from './Layout.module.css';

export type NavItem = 'available' | 'installed' | 'downloads' | 'instances' | 'repos' | 'settings';

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
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [navExpanded, setNavExpanded] = useState(true);
  const [modCount, setModCount] = useState(0);
  const [installedCount, setInstalledCount] = useState(0);

  useEffect(() => {
    registryService.load().then(() => {
      setModCount(registryService.getModuleCount());
      setInstalledCount(registryService.getInstalledCount());
    });
  }, []);

  // Refresh installed count when navigating
  useEffect(() => {
    setInstalledCount(registryService.getInstalledCount());
  }, [activePage]);

  const navItems: NavItemDef[] = [
    { id: 'available', label: 'Available', icon: <Package size={20} />, badge: modCount || undefined },
    { id: 'installed', label: 'Installed', icon: <FolderOpen size={20} />, badge: installedCount || undefined },
    { id: 'downloads', label: 'Downloads', icon: <Download size={20} /> },
    { id: 'instances', label: 'Instances', icon: <Database size={20} /> },
    // FIX: Added missing Repos nav item — ReposPage existed but was unreachable
    { id: 'repos', label: 'Repositories', icon: <BookMarked size={20} /> },
    { id: 'settings', label: 'Settings', icon: <Settings size={20} /> },
  ];

  return (
    <div className={styles.layout}>
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
              title="AI Assistant"
            >
              <span className={styles.navIcon}><Bot size={20} /></span>
              {navExpanded && <span className={styles.navLabel}>AI Assistant</span>}
            </button>

            <button
              className={styles.navItem}
              onClick={() => setNavExpanded(!navExpanded)}
              title={navExpanded ? 'Collapse' : 'Expand'}
            >
              <span className={styles.navIcon}>
                {navExpanded ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
              </span>
              {navExpanded && <span className={styles.navLabel}>Collapse</span>}
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
          <span>{modCount > 0 ? `${modCount.toLocaleString()} mods loaded` : 'Loading registry...'}</span>
        </div>
        <div className={styles.statusRight}>
          <span>{installedCount} installed</span>
          <span className={styles.statusSep}>|</span>
          <span>v2.0.0-dev</span>
        </div>
      </footer>
    </div>
  );
}
