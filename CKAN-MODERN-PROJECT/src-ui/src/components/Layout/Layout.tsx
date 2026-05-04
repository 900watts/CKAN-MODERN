import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Download, FolderOpen, Package, Settings, Database, ChevronRight } from 'lucide-react';
import AIChatPanel from '../AIChat/AIChatPanel';
import styles from './Layout.module.css';

type NavItem = 'available' | 'installed' | 'downloads' | 'instances' | 'repos' | 'settings';

interface NavItemDef {
  id: NavItem;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItemDef[] = [
  { id: 'available', label: 'Available', icon: <Package size={20} /> },
  { id: 'installed', label: 'Installed', icon: <FolderOpen size={20} /> },
  { id: 'downloads', label: 'Downloads', icon: <Download size={20} /> },
  { id: 'instances', label: 'Instances', icon: <Database size={20} /> },
  { id: 'repos', label: 'Repos', icon: <ChevronRight size={20} /> },
  { id: 'settings', label: 'Settings', icon: <Settings size={20} /> },
];

interface LayoutProps {
  children: React.ReactNode;
  activePage?: NavItem;
  onNavigate?: (page: NavItem) => void;
}

export default function Layout({ children, activePage = 'available', onNavigate }: LayoutProps) {
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [navExpanded, setNavExpanded] = useState(true);

  return (
    <div className={styles.layout}>
      {/* Navigation Rail */}
      <nav className={styles.navRail}>
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
              <AnimatePresence>
                {navExpanded && (
                  <motion.span
                    className={styles.navLabel}
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
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
            <AnimatePresence>
              {navExpanded && (
                <motion.span
                  className={styles.navLabel}
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  AI
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className={`${styles.main} ${aiPanelOpen ? styles.mainWithAi : ''}`}>
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

      {/* Status Bar */}
      <footer className={styles.statusBar}>
        <div className={styles.statusLeft}>
          <span className={styles.statusDot} />
          <span>Ready</span>
        </div>
        <div className={styles.statusRight}>
          <span>v2.0.0-dev</span>
        </div>
      </footer>
    </div>
  );
}
