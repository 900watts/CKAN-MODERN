import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Filter, Grid3X3, List, Package, Download, ArrowDownWideNarrow,
  X, ExternalLink, Tag, User, Clock, HardDrive, Loader2, CheckCircle, AlertCircle,
  FolderSearch, FolderOpen, ArrowUpCircle
} from 'lucide-react';
import { registryService } from '../services/registry';
import type { CkanModule, SearchFilters } from '../services/registry';
import ckanIpc from '../services/ipc';
import styles from './ModListPage.module.css';

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
}

interface UpdatableMod {
  identifier: string;
  name: string;
  installed_version: string;
  latest_version: string;
  download_size: number;
}

const BATCH_SIZE = 60;

export default function ModListPage({ view, onInstallChange }: ModListPageProps) {
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
  // FIX: installingIds tracks in-progress ops; installedIds is reactive installed state
  // so card buttons/badges re-render correctly without needing a full loadMods() call.
  const [installingIds, setInstallingIds] = useState<Set<string>>(new Set());
  const [installedIds, setInstalledIds] = useState<Set<string>>(() => new Set(registryService.getInstalledIds()));
  const [installStatus, setInstallStatus] = useState<{ id: string; msg: string; type: 'success' | 'error' } | null>(null);
  const [unmanagedMods, setUnmanagedMods] = useState<UnmanagedMod[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [updatableMods, setUpdatableMods] = useState<UpdatableMod[]>([]);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Helper: sync installedIds state from registryService
  const syncInstalled = useCallback(() => {
    setInstalledIds(new Set(registryService.getInstalledIds()));
  }, []);

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

              // Sync installed state to registryService
              // FIX: rebuild installed set from authoritative backend list instead of additive installs
              registryService.setInstalledFromList(mods.map(m => m.identifier));
            } else {
              mods = registryService.getInstalledModules();
            }
          } catch {
            mods = registryService.getInstalledModules();
          }
        } else {
          mods = registryService.getInstalledModules();
        }

        if (search.trim()) {
          const q = search.toLowerCase();
          mods = mods.filter(m =>
            m.name.toLowerCase().includes(q) ||
            m.identifier.toLowerCase().includes(q)
          );
        }

        if (activeTag) {
          mods = mods.filter(m => m.tags.includes(activeTag));
        }

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
        mods = registryService.search(search, filters);
      }

      setAllMods(mods);
      setDisplayCount(BATCH_SIZE);
      setTags(registryService.getAllTags().slice(0, 30));
      setIsLoading(false);
      // FIX: always sync reactive installedIds after loading so cards reflect real state
      syncInstalled();
    });
  }, [search, view, sortBy, activeTag, syncInstalled]);

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
    } catch {
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
        setUpdatableMods(result.updates);
      }
    } catch {
      // Silent fail
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

  // FIX: IPC push event listeners — separated from loadMods dependency so they don't
  // re-register on every filter change. Use syncInstalled() for instant UI update,
  // then reload the full list once.
  useEffect(() => {
    const unsub1 = ckanIpc.on('install:complete', (data: any) => {
      const id = data?.identifier;
      setInstallingIds(prev => { const next = new Set(prev); next.delete(id); return next; });
      registryService.install(id);
      syncInstalled();
      setInstallStatus({ id, msg: `${data?.name || id} installed`, type: 'success' });
      onInstallChange?.();
      loadMods();
    });
    const unsub2 = ckanIpc.on('install:error', (data: any) => {
      const id = data?.identifier;
      setInstallingIds(prev => { const next = new Set(prev); next.delete(id); return next; });
      setInstallStatus({ id, msg: `Install failed: ${data?.error}`, type: 'error' });
    });
    const unsub3 = ckanIpc.on('uninstall:complete', (data: any) => {
      const id = data?.identifier;
      setInstallingIds(prev => { const next = new Set(prev); next.delete(id); return next; });
      registryService.uninstall(id);
      syncInstalled();
      onInstallChange?.();
      loadMods();
    });
    const unsub4 = ckanIpc.on('uninstall:error', (data: any) => {
      const id = data?.identifier;
      setInstallingIds(prev => { const next = new Set(prev); next.delete(id); return next; });
      setInstallStatus({ id, msg: `Uninstall failed: ${data?.error}`, type: 'error' });
    });
    return () => { unsub1(); unsub2(); unsub3(); unsub4(); };
  // FIX: Only depend on stable callbacks — not loadMods (which changes with filters)
  // so listeners don't get torn down/re-added on every search keystroke.
  }, [onInstallChange, syncInstalled, loadMods]);

  // Auto-clear status toast after 4 seconds
  useEffect(() => {
    if (!installStatus) return;
    const t = setTimeout(() => setInstallStatus(null), 4000);
    return () => clearTimeout(t);
  }, [installStatus]);

  const visibleMods = allMods.slice(0, displayCount);

  const handleInstall = async (mod: CkanModule) => {
    // FIX: Read installed state from reactive installedIds, not registryService directly,
    // so we always get the most current state at click time.
    const isInstalled = installedIds.has(mod.identifier);
    const isConnected = ckanIpc.isConnected();

    // Prevent double-clicks
    if (installingIds.has(mod.identifier)) return;

    setInstallingIds(prev => new Set(prev).add(mod.identifier));

    if (isConnected) {
      // FIX: For IPC path, do NOT clear installingIds or call loadMods here —
      // the install:complete / install:error push events will handle that.
      // Clearing early caused the spinner to disappear before the op finished.
      try {
        if (isInstalled) {
          const result = await ckanIpc.call<any, any>('mod:uninstall', { identifier: mod.identifier });
          // If the backend returned a synchronous result (no push event coming), handle it now
          if (result?.status === 'removed') {
            setInstallingIds(prev => { const next = new Set(prev); next.delete(mod.identifier); return next; });
            registryService.uninstall(mod.identifier);
            syncInstalled();
            setInstallStatus({ id: mod.identifier, msg: `${mod.name} removed`, type: 'success' });
            onInstallChange?.();
            loadMods();
          } else if (result?.status === 'error') {
            setInstallingIds(prev => { const next = new Set(prev); next.delete(mod.identifier); return next; });
            setInstallStatus({ id: mod.identifier, msg: `Uninstall failed: ${result.error}`, type: 'error' });
          }
          // If result is 'pending', the push event will fire — leave installingIds set
        } else {
          const result = await ckanIpc.call<any, any>('mod:install', { identifier: mod.identifier });
          if (result?.status === 'installed') {
            setInstallingIds(prev => { const next = new Set(prev); next.delete(mod.identifier); return next; });
            registryService.install(mod.identifier);
            syncInstalled();
            setInstallStatus({ id: mod.identifier, msg: `${mod.name} installed`, type: 'success' });
            onInstallChange?.();
            loadMods();
          } else if (result?.status === 'error') {
            setInstallingIds(prev => { const next = new Set(prev); next.delete(mod.identifier); return next; });
            setInstallStatus({ id: mod.identifier, msg: `Install failed: ${result.error}`, type: 'error' });
          }
          // If result is 'pending', the push event will fire — leave installingIds set
        }
      } catch (err) {
        setInstallingIds(prev => { const next = new Set(prev); next.delete(mod.identifier); return next; });
        setInstallStatus({
          id: mod.identifier,
          msg: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
          type: 'error',
        });
      }
    } else {
      // Dev mode — toggle localStorage immediately
      if (isInstalled) {
        registryService.uninstall(mod.identifier);
      } else {
        registryService.install(mod.identifier);
      }
      syncInstalled();
      setInstallStatus({
        id: mod.identifier,
        msg: isInstalled ? `${mod.name} removed (dev mode)` : `${mod.name} installed (dev mode)`,
        type: 'success',
      });
      setInstallingIds(prev => { const next = new Set(prev); next.delete(mod.identifier); return next; });
      onInstallChange?.();
      loadMods();
    }
  };

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>
            {view === 'available' ? 'Available Mods' : 'Installed Mods'}
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
                <option value="downloads">Most Popular</option>
                <option value="name">Name A-Z</option>
                <option value="updated">Recently Updated</option>
              </select>
            </div>
            <div className={styles.viewToggle}>
              <button
                className={`${styles.viewBtn} ${gridView ? styles.viewBtnActive : ''}`}
                onClick={() => setGridView(true)}
                title="Grid view"
              >
                <Grid3X3 size={15} />
              </button>
              <button
                className={`${styles.viewBtn} ${!gridView ? styles.viewBtnActive : ''}`}
                onClick={() => setGridView(false)}
                title="List view"
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
              placeholder={view === 'available' ? 'Search mods...' : 'Search installed mods...'}
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
            Tags
          </button>
        </div>

        {/* Tag Filters */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              className={styles.tagBar}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <div className={styles.tagList}>
                {activeTag && (
                  <button className={styles.tagClear} onClick={() => setActiveTag(undefined)}>
                    <X size={12} /> Clear
                  </button>
                )}
                {tags.map((t) => (
                  <button
                    key={t.tag}
                    className={`${styles.tagChip} ${activeTag === t.tag ? styles.tagChipActive : ''}`}
                    onClick={() => setActiveTag(activeTag === t.tag ? undefined : t.tag)}
                  >
                    {t.tag} <span className={styles.tagCount}>{t.count}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Updates Available Banner */}
      {view === 'installed' && updatableMods.length > 0 && (
        <div className={styles.updatesSection}>
          <div className={styles.updatesHeader}>
            <ArrowUpCircle size={16} />
            <h3>Updates Available</h3>
            <span className={styles.updatesCount}>{updatableMods.length}</span>
          </div>
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
                  onClick={() => handleInstall({ identifier: um.identifier, name: um.name } as CkanModule)}
                  disabled={installingIds.has(um.identifier)}
                >
                  {installingIds.has(um.identifier) ? (
                    <><Loader2 size={12} className={styles.spin} /> Updating...</>
                  ) : 'Update'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {view === 'installed' && isCheckingUpdates && (
        <div className={styles.updatesChecking}>
          <Loader2 size={14} className={styles.spin} />
          <span>Checking for updates...</span>
        </div>
      )}

      {/* Content */}
      <div className={styles.contentWrapper}>
        <div className={styles.content} ref={contentRef}>
          {isLoading ? (
            <div className={styles.loading}>
              <Loader2 size={32} className={styles.spin} />
              <span>Loading registry...</span>
            </div>
          ) : allMods.length === 0 ? (
            <motion.div
              className={styles.empty}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Package size={48} className={styles.emptyIcon} />
              <h2>{view === 'installed' ? 'No mods installed' : 'No mods found'}</h2>
              <p>{view === 'installed' ? 'Browse available mods and install some' : 'Try a different search or clear filters'}</p>
            </motion.div>
          ) : gridView ? (
            <div className={styles.grid}>
              {visibleMods.map((mod) => (
                <div
                  key={mod.identifier}
                  className={`${styles.modCard} ${selectedMod?.identifier === mod.identifier ? styles.modCardSelected : ''}`}
                  onClick={() => setSelectedMod(mod)}
                >
                  <div className={styles.modCardHeader}>
                    <div className={styles.modIcon}>
                      <Package size={20} />
                    </div>
                    {installingIds.has(mod.identifier) ? (
                      <span className={styles.installingBadge}><Loader2 size={10} className={styles.spin} /> Installing...</span>
                    ) : installedIds.has(mod.identifier) ? (
                      <span className={styles.installedBadge}>Installed</span>
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
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.list}>
              <div className={styles.listHeader}>
                <span className={styles.listColIcon}></span>
                <span className={styles.listColName}>Name</span>
                <span className={styles.listColAuthor}>Author</span>
                <span className={styles.listColVersion}>Version</span>
                <span className={styles.listColDl}>Downloads</span>
                <span className={styles.listColSize}>Size</span>
                <span className={styles.listColAction}></span>
              </div>
              {visibleMods.map((mod) => (
                <div
                  key={mod.identifier}
                  className={`${styles.modRow} ${selectedMod?.identifier === mod.identifier ? styles.modRowSelected : ''}`}
                  onClick={() => setSelectedMod(mod)}
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
                    <button
                      className={`${styles.installBtn} ${installedIds.has(mod.identifier) ? styles.removeBtn : ''}`}
                      onClick={(e) => { e.stopPropagation(); handleInstall(mod); }}
                      disabled={installingIds.has(mod.identifier)}
                    >
                      {installingIds.has(mod.identifier) ? (
                        <><Loader2 size={12} className={styles.spin} /> Working...</>
                      ) : installedIds.has(mod.identifier) ? 'Remove' : 'Install'}
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}

          {displayCount < allMods.length && !isLoading && (
            <div className={styles.loadMore}>
              Showing {displayCount.toLocaleString()} of {allMods.length.toLocaleString()} — scroll for more
            </div>
          )}

          {/* Unmanaged Mods Detection (Installed view only) */}
          {view === 'installed' && hasScanned && unmanagedMods.length > 0 && (
            <div className={styles.unmanagedSection}>
              <div className={styles.unmanagedHeader}>
                <FolderSearch size={16} />
                <h3>Detected in GameData ({unmanagedMods.length})</h3>
                <span className={styles.unmanagedHint}>Not managed by CKAN</span>
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
                    <span className={styles.unmanagedBadge}>Manual</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {view === 'installed' && !hasScanned && isScanning && (
            <div className={styles.scanningBar}>
              <Loader2 size={14} className={styles.spin} />
              <span>Scanning GameData for manually installed mods...</span>
            </div>
          )}

          {view === 'installed' && hasScanned && unmanagedMods.length === 0 && allMods.length === 0 && (
            <div className={styles.scanResult}>
              <FolderSearch size={16} />
              <span>No manually installed mods detected in GameData</span>
            </div>
          )}
        </div>

        {/* Detail Panel */}
        <AnimatePresence>
          {selectedMod && (
            <ModDetailPanel
              mod={selectedMod}
              installedIds={installedIds}
              onClose={() => setSelectedMod(null)}
              onInstall={() => handleInstall(selectedMod)}
              installing={installingIds.has(selectedMod.identifier)}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Install Status Toast */}
      <AnimatePresence>
        {installStatus && (
          <motion.div
            className={`${styles.toast} ${installStatus.type === 'error' ? styles.toastError : styles.toastSuccess}`}
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.2 }}
          >
            {installStatus.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            <span>{installStatus.msg}</span>
            <button className={styles.toastClose} onClick={() => setInstallStatus(null)}><X size={14} /></button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Mod Detail Panel ─── */
function ModDetailPanel({
  mod, installedIds, onClose, onInstall, installing,
}: {
  mod: CkanModule;
  installedIds: Set<string>;
  onClose: () => void;
  onInstall: () => void;
  installing?: boolean;
}) {
  // FIX: Use passed-in installedIds (reactive state) instead of calling registryService directly
  const installed = installedIds.has(mod.identifier);
  return (
    <motion.aside
      className={styles.detailPanel}
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 380, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      <div className={styles.detailHeader}>
        <h2 className={styles.detailTitle}>{mod.name}</h2>
        <button className={styles.detailClose} onClick={onClose}><X size={16} /></button>
      </div>
      <div className={styles.detailBody}>
        <div className={styles.detailMeta}>
          <span className={styles.detailVersion}>v{mod.version}</span>
          {mod.license[0] && <span className={styles.detailLicense}>{mod.license[0]}</span>}
          {installed && <span className={styles.installedBadge} style={{ fontSize: '11px', padding: '2px 8px' }}>Installed</span>}
        </div>
        <p className={styles.detailAbstract}>{mod.abstract}</p>
        {mod.description && mod.description !== mod.abstract && (
          <p className={styles.detailDesc}>{mod.description}</p>
        )}
        <div className={styles.detailStats}>
          <div className={styles.detailStat}>
            <Download size={14} /><span>{mod.download_count.toLocaleString()} downloads</span>
          </div>
          <div className={styles.detailStat}>
            <HardDrive size={14} /><span>{registryService.formatSize(mod.download_size)} download</span>
          </div>
          {mod.install_size > 0 && (
            <div className={styles.detailStat}>
              <HardDrive size={14} /><span>{registryService.formatSize(mod.install_size)} installed</span>
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
              {mod.tags.map((t) => <span key={t} className={styles.detailTag}>{t}</span>)}
            </div>
          </div>
        )}
        {(mod.ksp_version || mod.ksp_version_min || mod.ksp_version_max) && (
          <div className={styles.detailSection}>
            <h3>Compatibility</h3>
            <p className={styles.detailCompat}>
              {mod.ksp_version ? `KSP ${mod.ksp_version}` : `KSP ${mod.ksp_version_min || '?'} — ${mod.ksp_version_max || 'latest'}`}
            </p>
          </div>
        )}
        {mod.depends.length > 0 && (
          <div className={styles.detailSection}>
            <h3>Dependencies ({mod.depends.length})</h3>
            <div className={styles.depList}>
              {mod.depends.map((d, i) => <span key={i} className={styles.depItem}>{d.name}</span>)}
            </div>
          </div>
        )}
        {mod.conflicts.length > 0 && (
          <div className={styles.detailSection}>
            <h3>Conflicts ({mod.conflicts.length})</h3>
            <div className={styles.depList}>
              {mod.conflicts.map((d, i) => <span key={i} className={styles.depItemConflict}>{d.name}</span>)}
            </div>
          </div>
        )}
        {mod.version_count > 1 && (
          <div className={styles.detailSection}>
            <h3>Versions ({mod.version_count})</h3>
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
              {mod.resources.homepage && <a href={mod.resources.homepage} target="_blank" rel="noopener" className={styles.link}>Homepage</a>}
              {mod.resources.repository && <a href={mod.resources.repository} target="_blank" rel="noopener" className={styles.link}>Source Code</a>}
              {mod.resources.spacedock && <a href={mod.resources.spacedock} target="_blank" rel="noopener" className={styles.link}>SpaceDock</a>}
              {mod.resources.bugtracker && <a href={mod.resources.bugtracker} target="_blank" rel="noopener" className={styles.link}>Bug Tracker</a>}
            </div>
          </div>
        )}
      </div>
      <div className={styles.detailFooter}>
        <button
          className={`${styles.detailInstallBtn} ${installed ? styles.detailRemoveBtn : ''}`}
          onClick={onInstall}
          disabled={installing}
        >
          {installing ? (
            <><Loader2 size={14} className={styles.spin} /> Working...</>
          ) : installed ? 'Uninstall' : 'Install Mod'}
        </button>
      </div>
    </motion.aside>
  );
}
