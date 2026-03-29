import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Filter, Grid3X3, List, Package, Download, Check, Trash2, Update, X } from 'lucide-react';
import { ckanIpc } from '../services/ipc';
import styles from './ModListPage.module.css';

interface Mod {
  identifier: string;
  name: string;
  version: string;
  abstract: string;
  description?: string;
  author?: string;
  size?: number;
  isInstalled: boolean;
  hasUpdate?: boolean;
  tags?: string[];
  dependencies?: string[];
}

interface ModListPageProps {
  view: 'available' | 'installed';
}

export default function ModListPage({ view }: ModListPageProps) {
  const [search, setSearch] = useState('');
  const [gridView, setGridView] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [mods, setMods] = useState<Mod[]>([]);
  const [selectedMod, setSelectedMod] = useState<Mod | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);

  // Load mods on mount or when view changes
  useEffect(() => {
    if (view === 'installed') {
      loadInstalledMods();
    } else {
      // Load some default mods on available tab
      loadMods('');
    }
  }, [view]);

  const loadInstalledMods = async () => {
    setIsLoading(true);
    try {
      const res = await ckanIpc.call<{}, { mods: Mod[] }>('mod:list-installed', {});
      setMods(res.mods || []);
    } catch (err) {
      console.error('Failed to load installed mods:', err);
      setMods(mockInstalledMods); // Fallback mock
    } finally {
      setIsLoading(false);
    }
  };

  const loadMods = async (query: string) => {
    setIsLoading(true);
    try {
      const res = await ckanIpc.call<{ query: string }, { mods: Mod[] }>('mod:search', { query });
      setMods(res.mods || []);
    } catch (err) {
      console.error('Search failed:', err);
      // Fallback to mock data
      setMods(query ? mockMods.filter(m => 
        m.name.toLowerCase().includes(query.toLowerCase()) ||
        m.identifier.toLowerCase().includes(query.toLowerCase())
      ) : mockMods);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = () => {
    loadMods(search);
  };

  const handleInstall = async (mod: Mod) => {
    if (mod.isInstalled || installing) return;
    
    setInstalling(mod.identifier);
    try {
      await ckanIpc.call('mod:install', { identifier: mod.identifier });
      setMods(prev => prev.map(m => 
        m.identifier === mod.identifier ? { ...m, isInstalled: true } : m
      ));
    } catch (err) {
      console.error('Install failed:', err);
      alert(`Failed to install ${mod.name}: ${err}`);
    } finally {
      setInstalling(null);
    }
  };

  const handleUninstall = async (mod: Mod) => {
    if (!mod.isInstalled || installing) return;
    
    if (!confirm(`Remove ${mod.name}?`)) return;
    
    setInstalling(mod.identifier);
    try {
      await ckanIpc.call('mod:uninstall', { identifier: mod.identifier });
      setMods(prev => prev.map(m => 
        m.identifier === mod.identifier ? { ...m, isInstalled: false } : m
      ));
    } catch (err) {
      console.error('Uninstall failed:', err);
    } finally {
      setInstalling(null);
    }
  };

  const formatSize = (bytes?: number): string => {
    if (!bytes) return 'Unknown';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>
            {view === 'available' ? 'Available Mods' : 'Installed Mods'}
            {mods.length > 0 && <span className={styles.count}>({mods.length})</span>}
          </h1>
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
            placeholder="Search mods by name or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button className={styles.filterBtn} title="Filters">
            <Filter size={16} />
          </button>
          {search && (
            <button className={styles.clearBtn} onClick={() => { setSearch(''); loadMods(''); }}>
              <X size={14} />
            </button>
          )}
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
            <span>{view === 'installed' ? 'Loading installed mods...' : 'Searching mods...'}</span>
          </div>
        ) : mods.length === 0 ? (
          <motion.div
            className={styles.empty}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Package size={48} className={styles.emptyIcon} />
            <h2>{view === 'installed' ? 'No mods installed' : 'No mods found'}</h2>
            <p>{view === 'installed' 
              ? 'Go to Available to browse and install mods' 
              : 'Try a different search term'}</p>
            {view === 'available' && (
              <button className={styles.browseAllBtn} onClick={() => loadMods('')}>
                Browse All Mods
              </button>
            )}
          </motion.div>
        ) : gridView ? (
          <div className={styles.grid}>
            <AnimatePresence>
              {mods.map((mod, i) => (
                <motion.div
                  key={mod.identifier}
                  className={`${styles.modCard} ${mod.isInstalled ? styles.installed : ''} ${mod.hasUpdate ? styles.hasUpdate : ''}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  onClick={() => setSelectedMod(selectedMod?.identifier === mod.identifier ? null : mod)}
                  layout
                >
                  <div className={styles.modIcon}>
                    {mod.isInstalled ? <Check size={24} /> : <Package size={24} />}
                    {mod.hasUpdate && <span className={styles.updateDot} />}
                  </div>
                  <div className={styles.modInfo}>
                    <h3 className={styles.modName}>
                      {mod.name}
                      {mod.isInstalled && <span className={styles.installedBadge}>Installed</span>}
                    </h3>
                    <p className={styles.modAbstract}>{mod.abstract}</p>
                    <div className={styles.modMeta}>
                      <span className={styles.modVersion}>v{mod.version}</span>
                      {mod.size && <span className={styles.modSize}>{formatSize(mod.size)}</span>}
                      {mod.author && <span className={styles.modAuthor}>{mod.author}</span>}
                    </div>
                  </div>
                  <div className={styles.modActions}>
                    {mod.isInstalled ? (
                      <button 
                        className={`${styles.actionBtn} ${styles.removeBtn}`}
                        onClick={(e) => { e.stopPropagation(); handleUninstall(mod); }}
                        disabled={!!installing}
                      >
                        {installing === mod.identifier ? (
                          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                            <X size={14} />
                          </motion.div>
                        ) : (
                          <Trash2 size={14} />
                        )}
                        Remove
                      </button>
                    ) : (
                      <button 
                        className={`${styles.actionBtn} ${styles.installBtn}`}
                        onClick={(e) => { e.stopPropagation(); handleInstall(mod); }}
                        disabled={!!installing}
                      >
                        {installing === mod.identifier ? (
                          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                            <Download size={14} />
                          </motion.div>
                        ) : (
                          <Download size={14} />
                        )}
                        Install
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <div className={styles.list}>
            <AnimatePresence>
              {mods.map((mod, i) => (
                <motion.div
                  key={mod.identifier}
                  className={`${styles.modRow} ${mod.isInstalled ? styles.installed : ''}`}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.02 }}
                  onClick={() => setSelectedMod(selectedMod?.identifier === mod.identifier ? null : mod)}
                >
                  <div className={styles.modRowIcon}>
                    {mod.isInstalled ? <Check size={18} /> : <Package size={18} />}
                  </div>
                  <div className={styles.modRowInfo}>
                    <span className={styles.modRowName}>
                      {mod.name}
                      {mod.hasUpdate && <Update size={12} className={styles.updateIcon} />}
                    </span>
                    <span className={styles.modRowAbstract}>{mod.abstract}</span>
                  </div>
                  <span className={styles.modRowVersion}>v{mod.version}</span>
                  {mod.size && <span className={styles.modRowSize}>{formatSize(mod.size)}</span>}
                  <button 
                    className={`${styles.actionBtn} ${mod.isInstalled ? styles.removeBtn : styles.installBtn}`}
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      mod.isInstalled ? handleUninstall(mod) : handleInstall(mod); 
                    }}
                    disabled={!!installing}
                  >
                    {mod.isInstalled ? <Trash2 size={14} /> : <Download size={14} />}
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

// Mock data for development without .NET backend
const mockMods: Mod[] = [
  { identifier: 'realfuels', name: 'Real Fuels', version: '1.4.1', abstract: 'Realistic fuel tanks with more realistic performance', author: 'RealFuels Team', size: 25165824, isInstalled: false },
  { identifier: 'realismoverhaul', name: 'Realism Overhaul', version: '1.11.0', abstract: 'Scales Kerbal Space Program to realistic values', author: 'RO Team', size: 104857600, isInstalled: false },
  { identifier: 'mechjeb2', name: 'MechJeb2', version: '2.14.0', abstract: 'Flight assistance and automation plugin', author: 'MechJeb Team', size: 6291456, isInstalled: true },
  { identifier: 'engineeringtoolskit', name: 'Engineering Tools Kit', version: '1.4.6', abstract: 'In-game calculators for delta-v, orbits, and more', author: 'Micha', size: 3145728, isInstalled: false },
  { identifier: 'kOS', name: 'kOS', version: '1.4.0', abstract: 'Scriptable Autopilot System - program your own autopilot', author: 'kOS Team', size: 5242880, isInstalled: false, hasUpdate: true },
  { identifier: 'TACLS', name: 'TAC Life Support', version: '1.1.2', abstract: 'Add life support systems - oxygen, food, water, electricity', author: 'TAC', size: 8388608, isInstalled: false },
  { identifier: 'remotetech2', name: 'RemoteTech', version: '1.9.1', abstract: 'Realistic communications network for tracking stations', author: 'RemoteTech Team', size: 12582912, isInstalled: false },
  { identifier: 'b9partswitch', name: 'B9 Part Switch', version: '2.6.0', abstract: 'Switch between part configurations and tank types', author: 'bac9', size: 2097152, isInstalled: false },
  { identifier: 'interstellarfutures', name: 'Interstellar Futures', version: '3.8.0', abstract: 'Future tech parts for nuclear and electric propulsion', author: 'Future Tech Team', size: 16777216, isInstalled: false },
  { identifier: 'kspinterstellar', name: 'KSP Interstellar Extended', version: '1.3.1', abstract: 'Nuclear and exotic propulsion technologies', author: 'Nuclear', size: 20971520, isInstalled: false },
];

const mockInstalledMods: Mod[] = mockMods.filter(m => m.isInstalled);