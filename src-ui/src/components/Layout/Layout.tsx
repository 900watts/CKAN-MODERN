import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Download, FolderOpen, Package, Settings, Database, PanelLeftClose, PanelLeftOpen, Terminal, Loader2, X } from 'lucide-react';
import AIChatPanel from '../AIChat/AIChatPanel';
import UpdateBanner from '../UpdateBanner/UpdateBanner';
import { registryService } from '../../services/registry';
import ckanIpc from '../../services/ipc';
import { useT } from '../../i18n';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { easeOut, dur, spring, stagger } from '../../styles/motion';
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
  const { t } = useT();
  const reducedMotion = useReducedMotion();
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [navExpanded, setNavExpanded] = useState(true);
  const [modCount, setModCount] = useState(0);
  const [installedCount, setInstalledCount] = useState(0);

  // Fetch the real installed count from the backend
  const refreshInstalledCount = () => {
    if (!ckanIpc.isConnected()) return;
    ckanIpc.call<any, any>('mod:list-installed', {}).then((result) => {
      if (result?.mods && Array.isArray(result.mods)) {
        setInstalledCount(result.mods.length);
      }
    }).catch((err) => console.warn('[Layout] Failed to refresh installed count:', err));
  };

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

  const [cliError, setCliError] = useState('');
  const [showCliPanel, setShowCliPanel] = useState(false);
  const [cliDownloading, setCliDownloading] = useState(false);

  const handleOpenCli = async () => {
    setCliError('');
    try {
      const result = await ckanIpc.call<any, any>('app:open-cli');
      if (result && !result.success) {
        if (result.notInstalled) {
          setShowCliPanel(true);
        } else {
          setCliError(result.error || t('nav.cliNotFound'));
          setTimeout(() => setCliError(''), 5000);
        }
      }
    } catch {
      setShowCliPanel(true);
    }
  };

  const handleDownloadCli = async () => {
    setCliDownloading(true);
    setCliError('');
    try {
      const result = await ckanIpc.call<any, any>('app:download-cli');
      if (result?.success) {
        setShowCliPanel(false);
        // Auto-open CLI after download
        handleOpenCli();
      } else {
        setCliError(result?.error || 'Download failed');
      }
    } catch (err) {
      setCliError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setCliDownloading(false);
    }
  };

  const navItems: NavItemDef[] = [
    { id: 'available', label: t('nav.available'), icon: <Package size={20} />, badge: modCount || undefined },
    { id: 'installed', label: t('nav.installed'), icon: <FolderOpen size={20} />, badge: installedCount || undefined },
    { id: 'downloads', label: t('nav.downloads'), icon: <Download size={20} /> },
    { id: 'instances', label: t('nav.instances'), icon: <Database size={20} /> },
    { id: 'settings', label: t('nav.settings'), icon: <Settings size={20} /> },
  ];

  // Variants respect reduced motion — use opacity-only, no transform.
  const navVariants = {
    initial: {},
    animate: { transition: { delayChildren: 0.05, staggerChildren: reducedMotion ? 0 : 0.035 } },
  };
  const navItemVariants = {
    initial: reducedMotion ? { opacity: 0 } : { opacity: 0, x: -8 },
    animate: reducedMotion
      ? { opacity: 1 }
      : { opacity: 1, x: 0, transition: { duration: dur.dropdown, ease: easeOut } },
  };

  return (
    <div className={styles.layout}>
      <UpdateBanner />
      <div className={styles.body}>
        {/* Navigation Rail — animated width via CSS, spring-like */}
        <motion.nav
          className={`${styles.navRail} ${navExpanded ? '' : styles.navRailCollapsed}`}
          initial={false}
          animate={{ width: navExpanded ? 220 : 56, minWidth: navExpanded ? 220 : 56 }}
          transition={reducedMotion ? { duration: 0 } : spring.layout}
        >
          <motion.div
            className={styles.navTop}
            variants={navVariants}
            initial="initial"
            animate="animate"
          >
            <motion.div
              className={styles.logo}
              variants={navItemVariants}
            >
              <span className={styles.logoText}>CKAN</span>
              <AnimatePresence initial={false}>
                {navExpanded && (
                  <motion.span
                    className={styles.logoBadge}
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    transition={{ duration: dur.pop, ease: easeOut }}
                  >
                    MOD
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.div>

            {navItems.map((item) => (
              <motion.button
                key={item.id}
                className={`${styles.navItem} ${activePage === item.id ? styles.navItemActive : ''}`}
                onClick={() => onNavigate?.(item.id)}
                title={item.label}
                variants={navItemVariants}
                whileTap={reducedMotion ? undefined : { scale: 0.97 }}
                transition={{ duration: dur.press, ease: easeOut }}
              >
                {/* Active indicator — slides between items via layoutId */}
                {activePage === item.id && (
                  <motion.span
                    className={styles.navIndicator}
                    layoutId="navActiveIndicator"
                    transition={reducedMotion ? { duration: 0 } : spring.snappy}
                  />
                )}
                <span className={styles.navIcon}>{item.icon}</span>
                <AnimatePresence initial={false}>
                  {navExpanded && (
                    <motion.span
                      className={styles.navLabel}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1, transition: { duration: dur.pop, ease: easeOut, delay: 0.05 } }}
                      exit={{ opacity: 0, transition: { duration: dur.press, ease: easeOut } }}
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
                <AnimatePresence initial={false}>
                  {navExpanded && item.badge !== undefined && (
                    <motion.span
                      className={styles.navBadge}
                      initial={{ opacity: 0, scale: 0.7 }}
                      animate={{ opacity: 1, scale: 1, transition: { duration: dur.pop, ease: easeOut, delay: 0.08 } }}
                      exit={{ opacity: 0, scale: 0.7, transition: { duration: dur.press, ease: easeOut } }}
                    >
                      {item.badge}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            ))}
          </motion.div>

          <div className={styles.navBottom}>
            <motion.button
              className={styles.navItem}
              onClick={handleOpenCli}
              title={t('nav.openCli')}
              whileTap={reducedMotion ? undefined : { scale: 0.97 }}
              transition={{ duration: dur.press, ease: easeOut }}
            >
              <span className={styles.navIcon}><Terminal size={20} /></span>
              <AnimatePresence initial={false}>
                {navExpanded && (
                  <motion.span
                    className={styles.navLabel}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: dur.pop, ease: easeOut }}
                  >
                    {t('nav.openCli')}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>

            <motion.button
              className={`${styles.navItem} ${aiPanelOpen ? styles.navItemActive : ''}`}
              onClick={() => setAiPanelOpen(!aiPanelOpen)}
              title={t('nav.aiAssistant')}
              whileTap={reducedMotion ? undefined : { scale: 0.97 }}
              transition={{ duration: dur.press, ease: easeOut }}
            >
              <span className={styles.navIcon}><Bot size={20} /></span>
              <AnimatePresence initial={false}>
                {navExpanded && (
                  <motion.span
                    className={styles.navLabel}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: dur.pop, ease: easeOut }}
                  >
                    {t('nav.aiAssistant')}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>

            <motion.button
              className={styles.navItem}
              onClick={() => setNavExpanded(!navExpanded)}
              title={navExpanded ? t('nav.collapse') : t('nav.expand')}
              whileTap={reducedMotion ? undefined : { scale: 0.97 }}
              transition={{ duration: dur.press, ease: easeOut }}
            >
              <span className={styles.navIcon}>
                {navExpanded ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
              </span>
              <AnimatePresence initial={false}>
                {navExpanded && (
                  <motion.span
                    className={styles.navLabel}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: dur.pop, ease: easeOut }}
                  >
                    {t('nav.collapse')}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          </div>
        </motion.nav>

        {/* Main Content */}
        <main className={styles.main}>
          <div className={styles.content}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activePage}
                initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
                animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                transition={{ duration: dur.crossfade, ease: easeOut }}
                className={styles.pageWrapper}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* CLI Install Panel — animated dialog */}
          <AnimatePresence>
            {showCliPanel && (
              <>
                <motion.div
                  className={styles.cliOverlay}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: dur.press, ease: 'linear' }}
                >
                  <motion.div
                    className={styles.cliPanel}
                    initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
                    animate={reducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
                    exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
                    transition={{ duration: dur.modal, ease: easeOut }}
                    style={{ transformOrigin: 'center' }}
                  >
                    <div className={styles.cliPanelHeader}>
                      <Terminal size={18} />
                      <span>{t('nav.cliTitle')}</span>
                      <button className={styles.cliPanelClose} onClick={() => { setShowCliPanel(false); setCliError(''); }}>
                        <X size={14} />
                      </button>
                    </div>
                    <div className={styles.cliPanelBody}>
                      <p>{t('nav.cliDesc')}</p>
                      <ul>
                        <li>{t('nav.cliFeature1')}</li>
                        <li>{t('nav.cliFeature2')}</li>
                        <li>{t('nav.cliFeature3')}</li>
                      </ul>
                      {cliError && <div className={styles.cliError}>{cliError}</div>}
                    </div>
                    <div className={styles.cliPanelFooter}>
                      <motion.button
                        className={styles.cliInstallBtn}
                        onClick={handleDownloadCli}
                        disabled={cliDownloading}
                        whileTap={reducedMotion ? undefined : { scale: 0.97 }}
                        transition={{ duration: dur.press, ease: easeOut }}
                      >
                        {cliDownloading ? (
                          <><Loader2 size={14} className={styles.spin} /> {t('nav.cliDownloading')}</>
                        ) : (
                          <><Download size={14} /> {t('nav.cliInstall')}</>
                        )}
                      </motion.button>
                      <button className={styles.cliCancelBtn} onClick={() => { setShowCliPanel(false); setCliError(''); }}>
                        {t('common.cancel')}
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          {/* AI Panel */}
          <AnimatePresence>
            {aiPanelOpen && (
              <AIChatPanel onClose={() => setAiPanelOpen(false)} />
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* Status Bar — dot pulses when registry is loading, settles when ready */}
      <footer className={styles.statusBar}>
        <div className={styles.statusLeft}>
          <motion.span
            className={styles.statusDot}
            animate={
              reducedMotion || modCount > 0
                ? { scale: 1, opacity: 1 }
                : { scale: [1, 1.4, 1], opacity: [1, 0.5, 1] }
            }
            transition={
              reducedMotion || modCount > 0
                ? { duration: 0 }
                : { duration: 1.6, repeat: Infinity, ease: easeOut }
            }
          />
          <span>{modCount > 0 ? t('nav.modsLoaded', { count: modCount.toLocaleString() }) : t('nav.loadingRegistry')}</span>
        </div>
        <div className={styles.statusRight}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={installedCount}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: dur.pop, ease: easeOut }}
            >
              {t('nav.installed.count', { count: installedCount })}
            </motion.span>
          </AnimatePresence>
          <span className={styles.statusSep}>|</span>
          <span>v2.0.0-dev</span>
        </div>
      </footer>
    </div>
  );
}
