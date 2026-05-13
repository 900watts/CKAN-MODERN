import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Gamepad2, Folder, X, Trash2, AlertCircle, RefreshCw, Loader2, Search } from 'lucide-react';
import ckanIpc from '../services/ipc';
import { useT } from '../services/i18n';
import styles from './InstancesPage.module.css';

interface GameInstance {
  name: string;
  path: string;
  version: string;
  valid: boolean;
  game: string;
  active: boolean;
}

/** Normalize backend instances (which don't have ids) for React keys. */
function keyForInstance(inst: GameInstance): string {
  return inst.name.toLowerCase().replace(/\s+/g, '-');
}

export default function InstancesPage() {
  const { t } = useT();
  const [instances, setInstances] = useState<GameInstance[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [version, setVersion] = useState('1.12.5');
  const [error, setError] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState('');
  const [refreshIsError, setRefreshIsError] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const statusTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Clean up status timeout on unmount
  useEffect(() => {
    return () => clearTimeout(statusTimeoutRef.current);
  }, []);

  // On mount, load instances from the backend (discover existing KSP installations)
  useEffect(() => {
    loadBackendInstances();
  }, []);

  async function loadBackendInstances() {
    try {
      const result = await ckanIpc.call<any, { success?: boolean; instances?: GameInstance[] }>('game:list-instances', {});
      if (result?.instances) {
        setInstances(result.instances);
      }
    } catch (err) {
      console.warn('[CKAN] Failed to load instances from backend:', err);
    }
  }

  const handleScan = async () => {
    setError('');
    setIsScanning(true);
    setRefreshIsError(false);
    setRefreshStatus(t('instances.scanning'));
    try {
      const result = await ckanIpc.call<any, { success?: boolean; instances?: GameInstance[]; error?: string; newCount?: number }>('game:scan', {});
      if (result?.success) {
        // Scan succeeded — always update instances list even if nothing new was found
        if (result.instances) {
          setInstances(result.instances);
        }

        const newCount = result.newCount ?? 0;
        if (newCount > 0) {
          setRefreshStatus(t('instances.scanComplete', { count: newCount }));
        } else {
          setRefreshStatus(t('instances.scanCompleteNone'));
        }
      } else {
        // Scan reported failure
        setRefreshIsError(true);
        setRefreshStatus(t('instances.scanFailed', { error: result?.error || t('instances.noResults') }));
      }
    } catch (err) {
      setRefreshIsError(true);
      setRefreshStatus(t('instances.scanFailed', { error: err instanceof Error ? err.message : t('common.unknownError') }));
    } finally {
      setIsScanning(false);
      clearTimeout(statusTimeoutRef.current);
      statusTimeoutRef.current = setTimeout(() => setRefreshStatus(''), 5000);
    }
  };

  const handleRefreshRepo = async () => {
    setIsRefreshing(true);
    setRefreshIsError(false);
    setRefreshStatus(t('instances.downloadingRepo'));
    try {
      const result = await ckanIpc.call<any, any>('repo:refresh', {});
      if (result?.success) {
        setRefreshStatus(t('instances.repoUpdated', { modCount: result.modCount }));
      } else {
        setRefreshIsError(true);
        setRefreshStatus(`${t('instances.repoRefreshFailed')}: ${result?.error || t('common.unknownError')}`);
      }
    } catch (err) {
      setRefreshIsError(true);
      setRefreshStatus(`${t('instances.repoRefreshFailed')}: ${err instanceof Error ? err.message : t('common.unknownError')}`);
    } finally {
      setIsRefreshing(false);
      clearTimeout(statusTimeoutRef.current);
      statusTimeoutRef.current = setTimeout(() => setRefreshStatus(''), 5000);
    }
  };

  const handleAdd = async () => {
    setError('');
    if (!name.trim()) {
      setError(t('instances.nameRequired'));
      return;
    }
    if (!path.trim()) {
      setError(t('instances.pathRequired'));
      return;
    }

    // Send to backend via IPC
    if (ckanIpc.isConnected()) {
      try {
        const result = await ckanIpc.call<any, any>('game:add-instance', {
          name: name.trim(),
          path: path.trim(),
        });
        if (!result?.success) {
          setError(result?.error || t('instances.failedToAdd'));
          return;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t('instances.failedToAdd'));
        return;
      }
    } else {
      setError(t('instances.appLoading'));
      return;
    }

    setShowAddForm(false);
    setName('');
    setPath('');
    setVersion('1.12.5');
    setRefreshStatus(t('instances.syncing'));

    // Reload from backend to get fresh state
    await loadBackendInstances();
  };

  const handleRemove = async (name: string) => {
    setError('');
    if (ckanIpc.isConnected()) {
      try {
        await ckanIpc.call<any, any>('game:remove-instance', { name });
      } catch (err) {
        setError(err instanceof Error ? err.message : t('instances.failedToRemove'));
        return;
      }
    }
    await loadBackendInstances();
  };

  const handleSetActive = async (name: string) => {
    setError('');
    if (ckanIpc.isConnected()) {
      try {
        await ckanIpc.call<any, any>('game:set-active', { name });
      } catch (err) {
        setError(err instanceof Error ? err.message : t('instances.failedToSwitch'));
        return;
      }
    }
    await loadBackendInstances();
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t('instances.title')}</h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className={styles.addBtn}
            onClick={handleRefreshRepo}
            disabled={isRefreshing}
            title={t('instances.refreshRepoTooltip')}
          >
            {isRefreshing ? <Loader2 size={16} className={styles.spin} /> : <RefreshCw size={16} />}
            {isRefreshing ? t('instances.refreshing') : t('instances.refreshRepo')}
          </button>
          <button
            className={styles.addBtn}
            onClick={handleScan}
            disabled={isScanning}
            title={t('instances.scanBtnTooltip')}
          >
            {isScanning ? <Loader2 size={16} className={styles.spin} /> : <Search size={16} />}
            {isScanning ? t('instances.scanningBtn') : t('instances.scanForGames')}
          </button>
          <button className={styles.addBtn} onClick={() => setShowAddForm(true)}>
            <Plus size={16} />
            {t('instances.addInstance')}
          </button>
        </div>
      </div>
      <div className={styles.content}>
        {/* Refresh Status Banner */}
        <AnimatePresence>
          {refreshStatus && (
            <motion.div
              className={styles.formError}
              style={{ marginBottom: 16, color: refreshIsError ? '#ff5050' : 'var(--color-accent-primary)', borderColor: refreshIsError ? 'rgba(255,80,80,0.3)' : 'rgba(96,205,255,0.3)', background: refreshIsError ? 'rgba(255,80,80,0.08)' : 'rgba(96,205,255,0.08)', padding: '10px 14px', borderRadius: '8px', border: '1px solid', fontSize: '13px' }}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              {(isRefreshing || isScanning) && <Loader2 size={12} className={styles.spin} />}
              {refreshStatus}
            </motion.div>
          )}
        </AnimatePresence>
        {/* Add Instance Form */}
        <AnimatePresence>
          {showAddForm && (
            <motion.div
              className={styles.formCard}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className={styles.formHeader}>
                <h3>{t('instances.addGameInstance')}</h3>
                <button className={styles.formClose} onClick={() => { setShowAddForm(false); setError(''); }}>
                  <X size={16} />
                </button>
              </div>
              <div className={styles.formBody}>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>{t('instances.instanceName')}</label>
                  <input
                    className={styles.formInput}
                    placeholder={t('instances.instanceNamePlaceholder')}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>{t('instances.gamePath')}</label>
                  <div className={styles.pathRow}>
                    <Folder size={14} className={styles.pathIcon} />
                    <input
                      className={styles.formInput}
                      placeholder="C:\Program Files (x86)\Steam\steamapps\common\Kerbal Space Program"
                      value={path}
                      onChange={(e) => setPath(e.target.value)}
                    />
                    <button
                      type="button"
                      className={styles.browseBtn}
                      onClick={async () => {
                        setError('');
                        if (!ckanIpc.isConnected()) {
                          setError(t('instances.appLoading'));
                          return;
                        }
                        try {
                          const result = await ckanIpc.call<{ title: string }, { selected: boolean; path: string | null }>(
                            'app:browse-folder',
                            { title: t('instances.selectKspFolder') }
                          );
                          if (result.selected && result.path) {
                            setPath(result.path);
                          }
                        } catch (err) {
                          setError(err instanceof Error ? err.message : t('instances.failedToBrowse'));
                        }
                      }}
                    >
                      {t('instances.browse')}
                    </button>
                  </div>
                  <span className={styles.formHint}>{t('instances.pathHint')}</span>
                </div>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>{t('instances.kspVersion')}</label>
                  <select
                    className={styles.formInput}
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                  >
                    <option value="1.12.5">1.12.5</option>
                    <option value="1.12.4">1.12.4</option>
                    <option value="1.12.3">1.12.3</option>
                    <option value="1.11.2">1.11.2</option>
                    <option value="1.10.1">1.10.1</option>
                    <option value="1.9.1">1.9.1</option>
                    <option value="1.8.1">1.8.1</option>
                  </select>
                </div>
                {error && (
                  <div className={styles.formError}>
                    <AlertCircle size={12} /> {error}
                  </div>
                )}
                <div className={styles.formActions}>
                  <button className={styles.formBtnPrimary} onClick={handleAdd}>
                    {t('instances.addInstance')}
                  </button>
                  <button className={styles.formBtnSecondary} onClick={() => { setShowAddForm(false); setError(''); }}>
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Instance List */}
        {instances.length > 0 ? (
          <div className={styles.instanceList}>
            {instances.map((inst) => (
              <motion.div
                key={keyForInstance(inst)}
                className={`${styles.instanceCard} ${inst.active ? styles.activeCard : ''}`}
                style={inst.active ? { borderColor: 'var(--color-accent-primary, #60cdff)', borderWidth: '1px' } : {}}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className={styles.instanceIcon}>
                  <Gamepad2 size={20} />
                </div>
                <div className={styles.instanceInfo}>
                  <div className={styles.instanceName}>
                    {inst.name}
                    {inst.active && (
                      <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--color-accent-primary)', fontWeight: 600 }}>
                        {t('instances.active')}
                      </span>
                    )}
                  </div>
                  <div className={styles.instancePath}>{inst.path}</div>
                  <div className={styles.instanceMeta}>
                    <span>{inst.game} {inst.version || '—'}</span>
                    {!inst.valid && (
                      <span style={{ color: '#ff5050' }}>{t('instances.invalid')}</span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {!inst.active && (
                    <button
                      className={styles.addBtn}
                      style={{ padding: '4px 10px', fontSize: 12 }}
                      onClick={() => handleSetActive(inst.name)}
                      title={t('instances.setActive')}
                    >
                      {t('instances.select')}
                    </button>
                  )}
                  <button
                    className={styles.removeBtn}
                    onClick={() => handleRemove(inst.name)}
                    title={t('instances.removeInstance')}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        ) : !showAddForm ? (
          <motion.div
            className={styles.empty}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Gamepad2 size={48} className={styles.emptyIcon} />
            <h2>{t('instances.empty')}</h2>
            <p>{t('instances.emptyHint')}</p>
            <button className={styles.addBtnLarge} onClick={() => setShowAddForm(true)}>
              <Plus size={16} />
              {t('instances.addFirstGame')}
            </button>
          </motion.div>
        ) : null}
      </div>
    </div>
  );
}
