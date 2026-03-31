import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Filter, Grid3X3, List, Package, Download, ArrowDownWideNarrow,
  X, ExternalLink, Tag, User, Clock, HardDrive, Loader2
} from 'lucide-react';
import { registryService } from '../services/registry';
import type { CkanModule, SearchFilters } from '../services/registry';
import styles from './ModListPage.module.css';

interface ModListPageProps {
  view: 'available' | 'installed';
  onInstallChange?: () => void;
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
  const contentRef = useRef<HTMLDivElement>(null);

  const loadMods = useCallback(() => {
    setIsLoading(true);
    registryService.load().then(() => {
      const filters: SearchFilters = { sortBy, tag: activeTag };
      let mods: CkanModule[];
      if (view === 'installed') {
        mods = registryService.getInstalledModules();
        if (search.trim()) {
          const q = search.toLowerCase();
          mods = mods.filter(m =>
            m.name.toLowerCase().includes(q) ||
            m.identifier.toLowerCase().includes(q)
          );
        }
      } else {
        mods = registryService.search(search, filters);
      }
      setAllMods(mods);
      setDisplayCount(BATCH_SIZE);
      setTags(registryService.getAllTags().slice(0, 30));
      setIsLoading(false);
    });
  }, [search, view, sortBy, activeTag]);

  useEffect(() => {
    loadMods();
  }, [loadMods]);

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

  const visibleMods = allMods.slice(0, displayCount);

  const handleInstall = (mod: CkanModule) => {
    if (registryService.isInstalled(mod.identifier)) {
      registryService.uninstall(mod.identifier);
    } else {
      registryService.install(mod.identifier);
    }
    onInstallChange?.();
    loadMods();
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
              initial={{ opacity: 0, y: 20 }}
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
                    {registryService.isInstalled(mod.identifier) && (
                      <span className={styles.installedBadge}>Installed</span>
                    )}
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
                      className={`${styles.installBtn} ${registryService.isInstalled(mod.identifier) ? styles.removeBtn : ''}`}
                      onClick={(e) => { e.stopPropagation(); handleInstall(mod); }}
                    >
                      {registryService.isInstalled(mod.identifier) ? 'Remove' : 'Install'}
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
        </div>

        {/* Detail Panel */}
        <AnimatePresence>
          {selectedMod && (
            <ModDetailPanel
              mod={selectedMod}
              onClose={() => setSelectedMod(null)}
              onInstall={() => handleInstall(selectedMod)}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ─── Mod Detail Panel ─── */
function ModDetailPanel({
  mod, onClose, onInstall,
}: {
  mod: CkanModule; onClose: () => void; onInstall: () => void;
}) {
  const installed = registryService.isInstalled(mod.identifier);
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
        <button className={`${styles.detailInstallBtn} ${installed ? styles.detailRemoveBtn : ''}`} onClick={onInstall}>
          {installed ? 'Uninstall' : 'Install Mod'}
        </button>
      </div>
    </motion.aside>
  );
}
