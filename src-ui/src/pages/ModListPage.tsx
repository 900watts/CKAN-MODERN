import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Filter, Grid3X3, List, Package, Download, ArrowDownWideNarrow,
  X, ExternalLink, Tag, User, Clock, HardDrive, Loader2, CheckCircle, AlertCircle,
  FolderSearch, FolderOpen, ArrowUpCircle, ChevronDown
} from 'lucide-react';
import { registryService } from '../services/registry';
import type { CkanModule, SearchFilters } from '../services/registry';
import ckanIpc from '../services/ipc';
import styles from './ModListPage.module.css';
import { useT } from '../i18n';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { easeOut, dur, spring, stagger } from '../styles/motion';

interface UnmanagedMod {
  folder: string;
  path: string;
  file_count: number;
  size: number;
  managed: false;
}

interface ModListPageProps {
  view: 'available' | 'installed';
  onInstallChange?: () => void;
  installTick?: number;
}

interface UpdatableMod {
  identifier: string;
  name: string;
  installed_version: string;
  latest_version: string;
  download_size: number;
}

const BATCH_SIZE = 60;

// Track mods that have been updated this session so they don't reappear
// after component remount (key={activePage} destroys + recreates state).
const updatedThisSession = new Set<string>();

export default function ModListPage({ view, onInstallChange, installTick }: ModListPageProps) {
  const { t } = useT();
  const reducedMotion = useReducedMotion();
  const [search, setSearch] = useState('');
  const [gridView, setGridView] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [allMods, setAllMods] = useState<CkanModule[]>([]);
  const [displayCount, setDisplayCount] = useState(BATCH_SIZE);
  const [selectedMod, setSelectedMod] = useState<CkanModule | null>(null);
  const [sortBy, setSortBy] = useState<SearchFilters['sortBy']>('downloads');
  const [activeTag, setActiveTag] = useState<string | undefined>();
  const [showFilters, setShowFilters] = useState(false);
  const [tags, setTags] = useState<{ tag: string; count: number }[]>([]);
  const [installingIds, setInstallingIds] = useState<Set<string>>(new Set());
  const [installStatus, setInstallStatus] = useState<{ id: string; msg: string; type: 'success' | 'error' } | null>(null);
  const [unmanagedMods, setUnmanagedMods] = useState<UnmanagedMod[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [updatableMods, setUpdatableMods] = useState<UpdatableMod[]>([]);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [updatesExpanded, setUpdatesExpanded] = useState(false);
  const [providerChoice, setProviderChoice] = useState<{
    identifier: string;
    requested: string;
    requester: string;
    providers: { identifier: string; name: string; abstract: string }[];
  } | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const loadMods = useCallback(() => {
    setIsLoading(true);
    registryService.load().then(async () => {
      const filters: SearchFilters = { sortBy, tag: activeTag };
      let mods: CkanModule[];

      if (view === 'installed') {
        // Try to get real installed list from CKAN Core backend
        if (ckanIpc.isConnected()) {
          try {
            const result = await ckanIpc.call<any, any>('mod:list-installed', {});
            if (result?.mods && Array.isArray(result.mods) && result.mods.length > 0) {
              // Map backend DTOs to CkanModule shape, filling missing fields with defaults
              mods = result.mods.map((m: any) => ({
                identifier: m.identifier || '',
                name: m.name || m.identifier || '',
                abstract: m.abstract || m.description || '',
                author: Array.isArray(m.author) ? m.author : (m.author ? [m.author] : []),
                license: Array.isArray(m.license) ? m.license : (m.license ? [m.license] : []),
                tags: m.tags || [],
                resources: m.resources || {},
                version: m.version || '',
                download_size: m.download_size || 0,
                install_size: m.install_size || 0,
                ksp_version: m.ksp_version || null,
                ksp_version_min: m.ksp_version_min || null,
                ksp_version_max: m.ksp_version_max || null,
                release_date: m.release_date || null,
                depends: m.depends || [],
                recommends: m.recommends || [],
                conflicts: m.conflicts || [],
                description: m.description || m.abstract || '',
                download: null,
                download_count: m.download_count || 0,
                version_count: m.version_count || 1,
                all_versions: m.all_versions || [m.version || ''],
              } as CkanModule));

              // Sync installed state to registryService so badges work
              for (const m of mods) {
                registryService.install(m.identifier);
              }
            } else {
              // Backend returned empty — no mods installed, clear stale state
              registryService.clearInstalled();
              mods = [];
            }
          } catch (err) {
            console.warn('[ModList] IPC list-installed failed:', err);
            registryService.clearInstalled();
            mods = [];
          }
        } else {
          // Dev mode — use localStorage
          mods = registryService.getInstalledModules();
        }

        if (search.trim()) {
          const q = search.toLowerCase();
          mods = mods.filter(m =>
            m.name.toLowerCase().includes(q) ||
            m.identifier.toLowerCase().includes(q)
          );
        }

        // Apply tag filter
        if (activeTag) {
          mods = mods.filter(m => m.tags.includes(activeTag));
        }

        // Apply sorting
        if (sortBy) {
          mods = [...mods].sort((a, b) => {
            switch (sortBy) {
              case 'name': return a.name.localeCompare(b.name);
              case 'downloads': return b.download_count - a.download_count;
              case 'updated': return (b.release_date ?? '').localeCompare(a.release_date ?? '');
              default: return 0;
            }
          });
        }
      } else {
        // Available tab — try static registry first, fallback to backend
        mods = registryService.search(search, filters);

        // If static registry returned nothing and backend is connected, try IPC
        if (mods.length === 0 && ckanIpc.isConnected()) {
          try {
            const result = await ckanIpc.call<any, any>('mod:search', { query: search || '' });
            if (result?.mods && Array.isArray(result.mods) && result.mods.length > 0) {
              mods = result.mods.map((m: any) => ({
                identifier: m.identifier || '',
                name: m.name || m.identifier || '',
                abstract: m.abstract || m.description || '',
                author: Array.isArray(m.author) ? m.author : (m.author ? [m.author] : []),
                license: Array.isArray(m.license) ? m.license : (m.license ? [m.license] : []),
                tags: m.tags || [],
                resources: m.resources || {},
                version: m.version || '',
                download_size: m.download_size || 0,
                install_size: m.install_size || 0,
                ksp_version: m.ksp_version || null,
                ksp_version_min: m.ksp_version_min || null,
                ksp_version_max: m.ksp_version_max || null,
                release_date: m.release_date || null,
                depends: m.depends || [],
                recommends: m.recommends || [],
                conflicts: m.conflicts || [],
                description: m.description || m.abstract || '',
                download: null,
                download_count: m.download_count || 0,
                version_count: m.version_count || 1,
                all_versions: m.all_versions || [m.version || ''],
              } as CkanModule));
            }
          } catch {
            // Silent fail — keep whatever we have
          }
        }
      }
      setAllMods(mods);
      setDisplayCount(BATCH_SIZE);
      setTags(registryService.getAllTags().slice(0, 30));
      setIsLoading(false);
    }).catch(() => {
      // registry.json failed to load — try backend as fallback
      if (ckanIpc.isConnected()) {
        ckanIpc.call<any, any>('mod:search', { query: '' }).then((result) => {
          if (result?.mods && Array.isArray(result.mods)) {
            const mods = result.mods.map((m: any) => ({
              identifier: m.identifier || '',
              name: m.name || m.identifier || '',
              abstract: m.abstract || m.description || '',
              author: Array.isArray(m.author) ? m.author : (m.author ? [m.author] : []),
              license: Array.isArray(m.license) ? m.license : (m.license ? [m.license] : []),
              tags: m.tags || [],
              resources: m.resources || {},
              version: m.version || '',
              download_size: m.download_size || 0,
              install_size: m.install_size || 0,
              ksp_version: m.ksp_version || null,
              ksp_version_min: m.ksp_version_min || null,
              ksp_version_max: m.ksp_version_max || null,
              release_date: m.release_date || null,
              depends: m.depends || [],
              recommends: m.recommends || [],
              conflicts: m.conflicts || [],
              description: m.description || m.abstract || '',
              download: null,
              download_count: m.download_count || 0,
              version_count: m.version_count || 1,
              all_versions: m.all_versions || [m.version || ''],
            } as CkanModule));
            setAllMods(mods);
            setTags([]);
          }
        }).catch(() => {
          setAllMods([]);
        }).finally(() => setIsLoading(false));
      } else {
        setAllMods([]);
        setIsLoading(false);
      }
    });
  }, [search, view, sortBy, activeTag, installTick]);

  useEffect(() => {
    loadMods();
  }, [loadMods]);

  // Auto-scan GameData for unmanaged mods when viewing Installed tab
  const scanGameData = useCallback(async () => {
    if (!ckanIpc.isConnected()) return;
    setIsScanning(true);
    try {
      const result = await ckanIpc.call<any, any>('mod:scan-gamedata', {});
      if (result?.scanned && result.unmanaged) {
        setUnmanagedMods(result.unmanaged);
      }
      setHasScanned(true);
    } catch (err) {
      console.warn('[ModList] Scan GameData failed:', err);
      setHasScanned(true);
    } finally {
      setIsScanning(false);
    }
  }, []);

  useEffect(() => {
    if (view === 'installed') {
      scanGameData();
    } else {
      setUnmanagedMods([]);
      setHasScanned(false);
    }
  }, [view, scanGameData]);

  // Check for mod updates when viewing installed tab
  const checkForUpdates = useCallback(async () => {
    if (!ckanIpc.isConnected()) return;
    setIsCheckingUpdates(true);
    try {
      const result = await ckanIpc.call<any, any>('mod:check-updates', {});
      if (result?.updates && Array.isArray(result.updates)) {
        setUpdatableMods(result.updates.filter(
          (u: UpdatableMod) => !updatedThisSession.has(u.identifier)
        ));
      }
    } catch (err) {
      console.warn('[ModList] Update check failed:', err);
    } finally {
      setIsCheckingUpdates(false);
    }
  }, []);

  useEffect(() => {
    if (view === 'installed') {
      checkForUpdates();
    } else {
      setUpdatableMods([]);
    }
  }, [view, checkForUpdates]);

  // Infinite scroll
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const onScroll = () => {
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
        setDisplayCount(prev => Math.min(prev + BATCH_SIZE, allMods.length));
      }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [allMods.length]);

  // Listen for install/uninstall push events from .NET backend
  useEffect(() => {
    const unsub1 = ckanIpc.on('install:complete', (data: any) => {
      setInstallingIds(prev => { const next = new Set(prev); next.delete(data?.identifier); return next; });
      registryService.install(data?.identifier);
      setInstallStatus({ id: data?.identifier, msg: `${data?.name || data?.identifier} installed`, type: 'success' });
      onInstallChange?.();
    });
    const unsub2 = ckanIpc.on('install:error', (data: any) => {
      setInstallingIds(prev => { const next = new Set(prev); next.delete(data?.identifier); return next; });
      setInstallStatus({ id: data?.identifier, msg: `Install failed: ${data?.error}`, type: 'error' });
    });
    const unsub3 = ckanIpc.on('uninstall:complete', (data: any) => {
      setInstallingIds(prev => { const next = new Set(prev); next.delete(data?.identifier); return next; });
      registryService.uninstall(data?.identifier);
      onInstallChange?.();
    });
    const unsub4 = ckanIpc.on('uninstall:error', (data: any) => {
      setInstallingIds(prev => { const next = new Set(prev); next.delete(data?.identifier); return next; });
      setInstallStatus({ id: data?.identifier, msg: `Uninstall failed: ${data?.error}`, type: 'error' });
    });
    return () => { unsub1(); unsub2(); unsub3(); unsub4(); };
  }, [onInstallChange]);

  // Reload mod list when backend finishes a repository refresh (including auto-refresh on startup)
  useEffect(() => {
    const unsub = ckanIpc.on('repo:refresh-complete', () => {
      loadMods();
    });
    return () => unsub();
  }, [loadMods]);

  // Clear stale state when switching instances
  useEffect(() => {
    const unsub = ckanIpc.on('instance:switched', () => {
      updatedThisSession.clear();
      setUpdatableMods([]);
      setUnmanagedMods([]);
      loadMods();
    });
    return () => unsub();
  }, [loadMods]);

  // Auto-clear status toast after 4 seconds
  useEffect(() => {
    if (!installStatus) return;
    const timer = setTimeout(() => setInstallStatus(null), 4000);
    return () => clearTimeout(timer);
  }, [installStatus]);

  const visibleMods = allMods.slice(0, displayCount);

  const handleInstall = async (mod: CkanModule) => {
    const isInstalled = registryService.isInstalled(mod.identifier);
    const isConnected = ckanIpc.isConnected();

    // Mark as in-progress
    setInstallingIds(prev => new Set(prev).add(mod.identifier));

    if (isConnected) {
      // Use IPC to trigger real CKAN Core install/uninstall
      try {
        if (isInstalled) {
          const result = await ckanIpc.call<any, any>('mod:uninstall', { identifier: mod.identifier });
          if (result?.status === 'removed') {
            registryService.uninstall(mod.identifier);
            setInstallStatus({ id: mod.identifier, msg: `${mod.name} removed`, type: 'success' });
          } else if (result?.status === 'error') {
            setInstallStatus({ id: mod.identifier, msg: `Uninstall failed: ${result.error}`, type: 'error' });
          }
        } else {
          const result = await ckanIpc.call<any, any>('mod:install', { identifier: mod.identifier });
          if (result?.status === 'installed') {
            registryService.install(mod.identifier);
            setInstallStatus({ id: mod.identifier, msg: `${mod.name} installed`, type: 'success' });
          } else if (result?.status === 'needs_provider_choice') {
            setProviderChoice({
              identifier: mod.identifier,
              requested: result.requested,
              requester: result.requester,
              providers: result.providers,
            });
          } else if (result?.status === 'error') {
            setInstallStatus({ id: mod.identifier, msg: `Install failed: ${result.error}`, type: 'error' });
          }
        }
      } catch (err) {
        setInstallStatus({
          id: mod.identifier,
          msg: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
          type: 'error',
        });
      }
    } else {
      // Dev mode fallback — just toggle localStorage
      if (isInstalled) {
        registryService.uninstall(mod.identifier);
      } else {
        registryService.install(mod.identifier);
      }
      setInstallStatus({
        id: mod.identifier,
        msg: isInstalled ? `${mod.name} removed (dev mode)` : `${mod.name} installed (dev mode)`,
        type: 'success',
      });
    }

    setInstallingIds(prev => { const next = new Set(prev); next.delete(mod.identifier); return next; });
    onInstallChange?.();
  };

  const handleUpdate = async (identifier: string, name: string) => {
    setInstallingIds(prev => new Set(prev).add(identifier));
    const isConnected = ckanIpc.isConnected();

    if (isConnected) {
      try {
        const result = await ckanIpc.call<any, any>('mod:install', { identifier });
        if (result?.status === 'installed') {
          setInstallStatus({ id: identifier, msg: `${name} updated`, type: 'success' });
          // Remove from updatable list and remember for this session
          updatedThisSession.add(identifier);
          setUpdatableMods(prev => prev.filter(m => m.identifier !== identifier));
        } else if (result?.status === 'needs_provider_choice') {
          setProviderChoice({
            identifier,
            requested: result.requested,
            requester: result.requester,
            providers: result.providers,
          });
        } else if (result?.status === 'error') {
          setInstallStatus({ id: identifier, msg: `Update failed: ${result.error}`, type: 'error' });
        }
      } catch (err) {
        setInstallStatus({
          id: identifier,
          msg: `Update error: ${err instanceof Error ? err.message : 'Unknown error'}`,
          type: 'error',
        });
      }
    } else {
      updatedThisSession.add(identifier);
      setUpdatableMods(prev => prev.filter(m => m.identifier !== identifier));
      setInstallStatus({ id: identifier, msg: `${name} updated (dev mode)`, type: 'success' });
    }

    setInstallingIds(prev => { const next = new Set(prev); next.delete(identifier); return next; });
    onInstallChange?.();
  };

  const handleProviderSelect = async (providerIdentifier: string) => {
    if (!providerChoice) return;
    const origId = providerChoice.identifier;
    setProviderChoice(null);
    setInstallingIds(prev => new Set(prev).add(origId));

    try {
      // First install the selected provider
      await ckanIpc.call<any, any>('mod:install', { identifier: providerIdentifier });
      // Then retry the original mod install
      const result = await ckanIpc.call<any, any>('mod:install', { identifier: origId });
      if (result?.status === 'installed') {
        registryService.install(origId);
        setInstallStatus({ id: origId, msg: `Installed successfully`, type: 'success' });
      } else if (result?.status === 'needs_provider_choice') {
        // Another provider choice needed (nested deps)
        setProviderChoice({
          identifier: origId,
          requested: result.requested,
          requester: result.requester,
          providers: result.providers,
        });
      } else if (result?.status === 'error') {
        setInstallStatus({ id: origId, msg: `Install failed: ${result.error}`, type: 'error' });
      }
    } catch (err) {
      setInstallStatus({
        id: origId,
        msg: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
        type: 'error',
      });
    }

    setInstallingIds(prev => { const next = new Set(prev); next.delete(origId); return next; });
    onInstallChange?.();
  };

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>
            {view === 'available' ? t('modlist.title.available') : t('modlist.title.installed')}
            {!isLoading && (
              <span className={styles.titleCount}>{allMods.length.toLocaleString()}</span>
            )}
          </h1>
          <div className={styles.headerActions}>
            <div className={styles.sortSelect}>
              <ArrowDownWideNarrow size={14} />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SearchFilters['sortBy'])}
                className={styles.select}
              >
                <option value="downloads">{t('modlist.sort.popular')}</option>
                <option value="name">{t('modlist.sort.name')}</option>
                <option value="updated">{t('modlist.sort.updated')}</option>
              </select>
            </div>
            <div className={styles.viewToggle}>
              <button
                className={`${styles.viewBtn} ${gridView ? styles.viewBtnActive : ''}`}
                onClick={() => setGridView(true)}
                title={t('modlist.view.grid')}
              >
                <Grid3X3 size={15} />
              </button>
              <button
                className={`${styles.viewBtn} ${!gridView ? styles.viewBtnActive : ''}`}
                onClick={() => setGridView(false)}
                title={t('modlist.view.list')}
              >
                <List size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className={styles.searchRow}>
          <div className={styles.searchBar}>
            <Search size={16} className={styles.searchIcon} />
            <input
              type="text"
              className={styles.searchInput}
              placeholder={view === 'available' ? t('modlist.search.available') : t('modlist.search.installed')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setSearch('')}
            />
            {search && (
              <button className={styles.clearBtn} onClick={() => setSearch('')}>
                <X size={14} />
              </button>
            )}
          </div>
          <button
            className={`${styles.filterBtn} ${showFilters ? styles.filterBtnActive : ''}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter size={15} />
            {t('modlist.tags')}
          </button>
        </div>

        {/* Tag Filters */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              className={styles.tagBar}
              initial={reducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
              animate={reducedMotion ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
              exit={reducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={reducedMotion ? { duration: 0 } : { duration: dur.dropdown, ease: easeOut }}
              style={{ overflow: 'hidden' }}
            >
              <div className={styles.tagList}>
                {activeTag && (
                  <button className={styles.tagClear} onClick={() => setActiveTag(undefined)}>
                    <X size={12} /> {t('modlist.tags.clear')}
                  </button>
                )}
                {tags.map((tagItem) => (
                  <button
                    key={tagItem.tag}
                    className={`${styles.tagChip} ${activeTag === tagItem.tag ? styles.tagChipActive : ''}`}
                    onClick={() => setActiveTag(activeTag === tagItem.tag ? undefined : tagItem.tag)}
                  >
                    {tagItem.tag} <span className={styles.tagCount}>{tagItem.count}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Updates Available Banner — collapsible */}
      {view === 'installed' && updatableMods.length > 0 && (
        <div className={styles.updatesSection}>
          <div
            className={styles.updatesHeader}
            onClick={() => setUpdatesExpanded(!updatesExpanded)}
            style={{ cursor: 'pointer', userSelect: 'none' }}
          >
            <ArrowUpCircle size={16} />
            <h3>{t('modlist.updates.title')}</h3>
            <span className={styles.updatesCount}>{updatableMods.length}</span>
            <ChevronDown
              size={14}
              style={{
                marginLeft: 'auto',
                transition: 'transform 0.2s ease',
                transform: updatesExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
              }}
            />
          </div>
          {updatesExpanded && (
            <div className={styles.updatesList}>
              {updatableMods.map((um) => (
                <div key={um.identifier} className={styles.updateCard}>
                  <div className={styles.updateInfo}>
                    <span className={styles.updateName}>{um.name}</span>
                    <span className={styles.updateVersions}>
                      v{um.installed_version} <span className={styles.updateArrow}>&rarr;</span> v{um.latest_version}
                    </span>
                  </div>
                  <button
                    className={styles.updateBtn}
                    onClick={() => handleUpdate(um.identifier, um.name)}
                    disabled={installingIds.has(um.identifier)}
                  >
                    {installingIds.has(um.identifier) ? (
                      <><Loader2 size={12} className={styles.spin} /> {t('modlist.updates.updating')}</>
                    ) : t('modlist.updates.update')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {view === 'installed' && isCheckingUpdates && (
        <div className={styles.updatesChecking}>
          <Loader2 size={14} className={styles.spin} />
          <span>{t('modlist.updates.checking')}</span>
        </div>
      )}

      {/* Content */}
      <div className={styles.contentWrapper}>
        <div className={styles.content} ref={contentRef}>
          {isLoading ? (
            <div className={styles.loading}>
              <Loader2 size={32} className={styles.spin} />
              <span>{t('modlist.loading')}</span>
            </div>
          ) : allMods.length === 0 ? (
            <motion.div
              className={styles.empty}
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
              animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: dur.modal, ease: easeOut }}
            >
              <Package size={48} className={styles.emptyIcon} />
              <h2>{view === 'installed' ? t('modlist.empty.noInstalled') : t('modlist.empty.noResults')}</h2>
              <p>{view === 'installed' ? t('modlist.empty.noInstalled.hint') : t('modlist.empty.noResults.hint')}</p>
            </motion.div>
          ) : gridView ? (
            <motion.div
              className={styles.grid}
              variants={stagger(0, reducedMotion ? 0 : 0.02)}
              initial="initial"
              animate="animate"
              /* Re-run the stagger on key change so switching
                 available↔installed always replays the cascade. */
              key={`grid-${view}-${search}-${sortBy}-${activeTag ?? ''}`}
            >
              {visibleMods.map((mod) => (
                <motion.div
                  key={mod.identifier}
                  className={`${styles.modCard} ${selectedMod?.identifier === mod.identifier ? styles.modCardSelected : ''}`}
                  onClick={() => setSelectedMod(mod)}
                  variants={{
                    initial: reducedMotion ? { opacity: 0 } : { opacity: 0, y: 10 },
                    animate: reducedMotion
                      ? { opacity: 1 }
                      : { opacity: 1, y: 0, transition: { duration: dur.pop, ease: easeOut } },
                  }}
                  whileTap={reducedMotion ? undefined : { scale: 0.98 }}
                  whileHover={reducedMotion ? undefined : { y: -2 }}
                  transition={{ duration: dur.press, ease: easeOut }}
                >
                  <div className={styles.modCardHeader}>
                    <div className={styles.modIcon}>
                      <Package size={20} />
                    </div>
                    {installingIds.has(mod.identifier) ? (
                      <span className={styles.installingBadge}><Loader2 size={10} className={styles.spin} /> {t('modlist.installing')}</span>
                    ) : registryService.isInstalled(mod.identifier) ? (
                      <span className={styles.installedBadge}>{t('modlist.installed')}</span>
                    ) : null}
                  </div>
                  <h3 className={styles.modName}>{mod.name}</h3>
                  <p className={styles.modAbstract}>{mod.abstract}</p>
                  <div className={styles.modMeta}>
                    <span className={styles.modVersion}>v{mod.version}</span>
                    <span className={styles.modDl}>
                      <Download size={11} />
                      {registryService.formatDownloads(mod.download_count)}
                    </span>
                    <span className={styles.modSize}>
                      {registryService.formatSize(mod.download_size)}
                    </span>
                  </div>
                  <div className={styles.modAuthor}>
                    <User size={11} />
                    {mod.author.slice(0, 2).join(', ')}
                  </div>
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <motion.div
              className={styles.list}
              variants={stagger(0, reducedMotion ? 0 : 0.018)}
              initial="initial"
              animate="animate"
              key={`list-${view}-${search}-${sortBy}-${activeTag ?? ''}`}
            >
              <div className={styles.listHeader}>
                <span className={styles.listColIcon}></span>
                <span className={styles.listColName}>{t('modlist.col.name')}</span>
                <span className={styles.listColAuthor}>{t('modlist.col.author')}</span>
                <span className={styles.listColVersion}>{t('modlist.col.version')}</span>
                <span className={styles.listColDl}>{t('modlist.col.downloads')}</span>
                <span className={styles.listColSize}>{t('modlist.col.size')}</span>
                <span className={styles.listColAction}></span>
              </div>
              {visibleMods.map((mod) => (
                <motion.div
                  key={mod.identifier}
                  className={`${styles.modRow} ${selectedMod?.identifier === mod.identifier ? styles.modRowSelected : ''}`}
                  onClick={() => setSelectedMod(mod)}
                  variants={{
                    initial: reducedMotion ? { opacity: 0 } : { opacity: 0, x: -8 },
                    animate: reducedMotion
                      ? { opacity: 1 }
                      : { opacity: 1, x: 0, transition: { duration: dur.pop, ease: easeOut } },
                  }}
                >
                  <span className={styles.listColIcon}>
                    <div className={styles.modRowIcon}><Package size={16} /></div>
                  </span>
                  <span className={styles.listColName}>
                    <span className={styles.modRowName}>{mod.name}</span>
                    <span className={styles.modRowAbstract}>{mod.abstract}</span>
                  </span>
                  <span className={styles.listColAuthor}>{mod.author[0] || '--'}</span>
                  <span className={styles.listColVersion}>{mod.version}</span>
                  <span className={styles.listColDl}>{registryService.formatDownloads(mod.download_count)}</span>
                  <span className={styles.listColSize}>{registryService.formatSize(mod.download_size)}</span>
                  <span className={styles.listColAction}>
                    <motion.button
                      className={`${styles.installBtn} ${registryService.isInstalled(mod.identifier) ? styles.removeBtn : ''}`}
                      onClick={(e) => { e.stopPropagation(); handleInstall(mod); }}
                      disabled={installingIds.has(mod.identifier)}
                      whileTap={reducedMotion || installingIds.has(mod.identifier) ? undefined : { scale: 0.94 }}
                      transition={{ duration: dur.press, ease: easeOut }}
                    >
                      {installingIds.has(mod.identifier) ? (
                        <><Loader2 size={12} className={styles.spin} /> {t('modlist.working')}</>
                      ) : registryService.isInstalled(mod.identifier) ? t('modlist.remove') : t('modlist.install')}
                    </motion.button>
                  </span>
                </motion.div>
              ))}
            </motion.div>
          )}

          {displayCount < allMods.length && !isLoading && (
            <div className={styles.loadMore}>
              {t('modlist.showMore', { shown: displayCount.toLocaleString(), total: allMods.length.toLocaleString() })}
            </div>
          )}

          {/* Unmanaged Mods Detection (Installed view only) */}
          {view === 'installed' && hasScanned && unmanagedMods.length > 0 && (
            <div className={styles.unmanagedSection}>
              <div className={styles.unmanagedHeader}>
                <FolderSearch size={16} />
                <h3>{t('modlist.unmanaged.title')} ({unmanagedMods.length})</h3>
                <span className={styles.unmanagedHint}>{t('modlist.unmanaged.hint')}</span>
              </div>
              <div className={styles.unmanagedList}>
                {unmanagedMods.map((mod) => (
                  <div key={mod.folder} className={styles.unmanagedCard}>
                    <div className={styles.unmanagedIcon}>
                      <FolderOpen size={16} />
                    </div>
                    <div className={styles.unmanagedInfo}>
                      <span className={styles.unmanagedName}>{mod.folder}</span>
                      <span className={styles.unmanagedMeta}>
                        {mod.file_count} files &middot; {registryService.formatSize(mod.size)}
                      </span>
                    </div>
                    <span className={styles.unmanagedBadge}>{t('modlist.unmanaged.badge')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {view === 'installed' && !hasScanned && isScanning && (
            <div className={styles.scanningBar}>
              <Loader2 size={14} className={styles.spin} />
              <span>{t('modlist.unmanaged.scanning')}</span>
            </div>
          )}

          {view === 'installed' && hasScanned && unmanagedMods.length === 0 && allMods.length === 0 && (
            <div className={styles.scanResult}>
              <FolderSearch size={16} />
              <span>{t('modlist.unmanaged.none')}</span>
            </div>
          )}
        </div>

        {/* Detail Panel */}
        <AnimatePresence>
          {selectedMod && (
            <ModDetailPanel
              mod={selectedMod}
              onClose={() => setSelectedMod(null)}
              onInstall={() => handleInstall(selectedMod)}
              installing={installingIds.has(selectedMod.identifier)}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Provider Choice Modal */}
      <AnimatePresence>
        {providerChoice && (
          <motion.div
            className={styles.modalOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setProviderChoice(null)}
          >
            <motion.div
              className={styles.providerModal}
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.providerModalHeader}>
                <Package size={18} />
                <div>
                  <h3>{t('modlist.provider.title')}</h3>
                  <p>
                    {t('modlist.provider.desc', { requester: providerChoice.requester, requested: providerChoice.requested })}
                  </p>
                </div>
                <button className={styles.providerModalClose} onClick={() => setProviderChoice(null)}>
                  <X size={16} />
                </button>
              </div>
              <div className={styles.providerList}>
                {providerChoice.providers.map((p) => (
                  <button
                    key={p.identifier}
                    className={styles.providerOption}
                    onClick={() => handleProviderSelect(p.identifier)}
                  >
                    <div className={styles.providerOptionIcon}>
                      <Package size={16} />
                    </div>
                    <div className={styles.providerOptionInfo}>
                      <span className={styles.providerOptionName}>{p.name}</span>
                      <span className={styles.providerOptionId}>{p.identifier}</span>
                      {p.abstract && (
                        <span className={styles.providerOptionDesc}>{p.abstract}</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
              <div className={styles.providerModalFooter}>
                <button className={styles.providerCancelBtn} onClick={() => setProviderChoice(null)}>
                  {t('modlist.provider.cancel')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Install Status Toast — slides up from bottom, snappier with custom curve */}
      <AnimatePresence>
        {installStatus && (
          <motion.div
            className={`${styles.toast} ${installStatus.type === 'error' ? styles.toastError : styles.toastSuccess}`}
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }}
            animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 }}
            transition={reducedMotion ? { duration: 0 } : { duration: dur.modal, ease: easeOut }}
            style={{ transformOrigin: 'bottom center' }}
            role="status"
            aria-live="polite"
          >
            {installStatus.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            <span>{installStatus.msg}</span>
            <button className={styles.toastClose} onClick={() => setInstallStatus(null)} aria-label="Dismiss"><X size={14} /></button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Mod Detail Panel ─── */
function ModDetailPanel({
  mod, onClose, onInstall, installing,
}: {
  mod: CkanModule; onClose: () => void; onInstall: () => void; installing?: boolean;
}) {
  const { t } = useT();
  const reducedMotion = useReducedMotion();
  const installed = registryService.isInstalled(mod.identifier);
  return (
    <motion.aside
      className={styles.detailPanel}
      initial={reducedMotion ? { opacity: 0 } : { x: 24, opacity: 0 }}
      animate={reducedMotion ? { opacity: 1 } : { x: 0, opacity: 1 }}
      exit={reducedMotion ? { opacity: 0 } : { x: 24, opacity: 0 }}
      transition={reducedMotion ? { duration: 0 } : spring.snappy}
    >
      <div className={styles.detailHeader}>
        <h2 className={styles.detailTitle}>{mod.name}</h2>
        <button className={styles.detailClose} onClick={onClose}><X size={16} /></button>
      </div>
      <div className={styles.detailBody}>
        <div className={styles.detailMeta}>
          <span className={styles.detailVersion}>v{mod.version}</span>
          {mod.license[0] && <span className={styles.detailLicense}>{mod.license[0]}</span>}
        </div>
        <p className={styles.detailAbstract}>{mod.abstract}</p>
        {mod.description && mod.description !== mod.abstract && (
          <p className={styles.detailDesc}>{mod.description}</p>
        )}
        <div className={styles.detailStats}>
          <div className={styles.detailStat}>
            <Download size={14} /><span>{mod.download_count.toLocaleString()} {t('modlist.detail.downloadPlural')}</span>
          </div>
          <div className={styles.detailStat}>
            <HardDrive size={14} /><span>{registryService.formatSize(mod.download_size)} {t('modlist.detail.download')}</span>
          </div>
          {mod.install_size > 0 && (
            <div className={styles.detailStat}>
              <HardDrive size={14} /><span>{registryService.formatSize(mod.install_size)} {t('modlist.detail.installedSize')}</span>
            </div>
          )}
          <div className={styles.detailStat}>
            <User size={14} /><span>{mod.author.join(', ')}</span>
          </div>
          {mod.release_date && (
            <div className={styles.detailStat}>
              <Clock size={14} /><span>{new Date(mod.release_date).toLocaleDateString()}</span>
            </div>
          )}
        </div>
        {mod.tags.length > 0 && (
          <div className={styles.detailSection}>
            <h3><Tag size={14} /> Tags</h3>
            <div className={styles.detailTags}>
              {mod.tags.map((tag) => <span key={tag} className={styles.detailTag}>{tag}</span>)}
            </div>
          </div>
        )}
        {(mod.ksp_version || mod.ksp_version_min || mod.ksp_version_max) && (
          <div className={styles.detailSection}>
            <h3>{t('modlist.detail.compatibility')}</h3>
            <p className={styles.detailCompat}>
              {mod.ksp_version ? `KSP ${mod.ksp_version}` : `KSP ${mod.ksp_version_min || '?'} — ${mod.ksp_version_max || 'latest'}`}
            </p>
          </div>
        )}
        {mod.depends.length > 0 && (
          <div className={styles.detailSection}>
            <h3>{t('modlist.detail.dependencies')} ({mod.depends.length})</h3>
            <div className={styles.depList}>
              {mod.depends.map((d, i) => <span key={i} className={styles.depItem}>{d.name}</span>)}
            </div>
          </div>
        )}
        {mod.conflicts.length > 0 && (
          <div className={styles.detailSection}>
            <h3>{t('modlist.detail.conflicts')} ({mod.conflicts.length})</h3>
            <div className={styles.depList}>
              {mod.conflicts.map((d, i) => <span key={i} className={styles.depItemConflict}>{d.name}</span>)}
            </div>
          </div>
        )}
        {mod.version_count > 1 && (
          <div className={styles.detailSection}>
            <h3>{t('modlist.detail.versions')} ({mod.version_count})</h3>
            <div className={styles.versionList}>
              {mod.all_versions.slice(0, 10).map((v) => <span key={v} className={styles.versionItem}>{v}</span>)}
              {mod.all_versions.length > 10 && <span className={styles.versionMore}>+{mod.all_versions.length - 10} more</span>}
            </div>
          </div>
        )}
        {mod.resources && Object.keys(mod.resources).length > 0 && (
          <div className={styles.detailSection}>
            <h3><ExternalLink size={14} /> Links</h3>
            <div className={styles.linkList}>
              {mod.resources.homepage && <a href={mod.resources.homepage} target="_blank" rel="noopener" className={styles.link}>{t('modlist.detail.homepage')}</a>}
              {mod.resources.repository && <a href={mod.resources.repository} target="_blank" rel="noopener" className={styles.link}>{t('modlist.detail.source')}</a>}
              {mod.resources.spacedock && <a href={mod.resources.spacedock} target="_blank" rel="noopener" className={styles.link}>{t('modlist.detail.spacedock')}</a>}
              {mod.resources.bugtracker && <a href={mod.resources.bugtracker} target="_blank" rel="noopener" className={styles.link}>{t('modlist.detail.bugtracker')}</a>}
            </div>
          </div>
        )}
      </div>
      <div className={styles.detailFooter}>
        <motion.button
          className={`${styles.detailInstallBtn} ${installed ? styles.detailRemoveBtn : ''}`}
          onClick={onInstall}
          disabled={installing}
          whileTap={reducedMotion || installing ? undefined : { scale: 0.97 }}
          transition={{ duration: dur.press, ease: easeOut }}
        >
          {installing ? (
            <><Loader2 size={14} className={styles.spin} /> {t('modlist.working')}</>
          ) : installed ? t('modlist.uninstall') : t('modlist.installMod')}
        </motion.button>
      </div>
    </motion.aside>
  );
}
