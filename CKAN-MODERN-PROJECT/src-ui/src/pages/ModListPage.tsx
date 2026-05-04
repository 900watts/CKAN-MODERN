import { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Filter, Grid3X3, List, Package, Download, ExternalLink } from 'lucide-react';
import { ckanIpc } from '../services/ipc';
import styles from './ModListPage.module.css';

interface Mod {
  id: string;
  name: string;
  version: string;
  abstract: string;
  author: string;
  downloadSize: string;
  isInstalled: boolean;
}

interface ModListPageProps {
  view: 'available' | 'installed';
}

export default function ModListPage({ view }: ModListPageProps) {
  const [search, setSearch] = useState('');
  const [gridView, setGridView] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [mods, setMods] = useState<Mod[]>([]);

  const handleSearch = async () => {
    if (!search.trim()) return;
    setIsLoading(true);
    try {
      const res = await ckanIpc.call<{ query: string }, any>('mod:search', { query: search });
      setMods(res.mods || []);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{view === 'available' ? 'Available Mods' : 'Installed Mods'}</h1>
          <div className={styles.viewToggle}>
            <button
              className={`${styles.viewBtn} ${gridView ? styles.viewBtnActive : ''}`}
              onClick={() => setGridView(true)}
            >
              <Grid3X3 size={16} />
            </button>
            <button
              className={`${styles.viewBtn} ${!gridView ? styles.viewBtnActive : ''}`}
              onClick={() => setGridView(false)}
            >
              <List size={16} />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className={styles.searchBar}>
          <Search size={16} className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search mods..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button className={styles.filterBtn}>
            <Filter size={16} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className={styles.content}>
        {isLoading ? (
          <div className={styles.loading}>
            <motion.div
              className={styles.spinner}
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            />
            <span>Loading mods...</span>
          </div>
        ) : mods.length === 0 ? (
          <motion.div
            className={styles.empty}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Package size={48} className={styles.emptyIcon} />
            <h2>No mods found</h2>
            <p>Try a different search term or browse the repository</p>
          </motion.div>
        ) : gridView ? (
          <div className={styles.grid}>
            {mods.map((mod, i) => (
              <motion.div
                key={mod.id}
                className={styles.modCard}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                <div className={styles.modIcon}>
                  <Package size={24} />
                </div>
                <div className={styles.modInfo}>
                  <h3 className={styles.modName}>{mod.name}</h3>
                  <p className={styles.modAbstract}>{mod.abstract}</p>
                  <div className={styles.modMeta}>
                    <span className={styles.modVersion}>v{mod.version}</span>
                    <span className={styles.modSize}>{mod.downloadSize}</span>
                  </div>
                </div>
                <div className={styles.modActions}>
                  <button className={styles.installBtn}>
                    {view === 'installed' ? 'Remove' : 'Install'}
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className={styles.list}>
            {mods.map((mod, i) => (
              <motion.div
                key={mod.id}
                className={styles.modRow}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.02 }}
              >
                <div className={styles.modRowIcon}><Package size={18} /></div>
                <div className={styles.modRowInfo}>
                  <span className={styles.modRowName}>{mod.name}</span>
                  <span className={styles.modRowAbstract}>{mod.abstract}</span>
                </div>
                <span className={styles.modRowVersion}>v{mod.version}</span>
                <span className={styles.modRowSize}>{mod.downloadSize}</span>
                <button className={styles.installBtn}>
                  {view === 'installed' ? 'Remove' : 'Install'}
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
