import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Gamepad2, Folder, X, Trash2, AlertCircle, RefreshCw, Loader2, Check } from 'lucide-react';
import ckanIpc from '../services/ipc';
import { useT } from '../i18n';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { easeOut, dur, stagger } from '../styles/motion';
import styles from './InstancesPage.module.css';

interface BackendInstance {
  name: string;
  path: string;
  valid: boolean;
  version: string;
  game: string;
  active: boolean;
}

export default function InstancesPage() {
  const { t } = useT();
  const reducedMotion = useReducedMotion();
  const [instances, setInstances] = useState<BackendInstance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [error, setError] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState('');
  const [switchingName, setSwitchingName] = useState<string | null>(null);

  // Load instances from backend
  const loadInstances = useCallback(async () => {
    if (!ckanIpc.isConnected()) {
      setIsLoading(false);
      return;
    }
    try {
      const result = await ckanIpc.call<any, any>('game:list-instances', {});
      if (result?.instances && Array.isArray(result.instances)) {
        setInstances(result.instances);
      }
    } catch (err) {
      console.warn('[Instances] Failed to list instances:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInstances();
  }, [loadInstances]);

  const handleRefreshRepo = async () => {
    setIsRefreshing(true);
    setRefreshStatus(t('instances.refreshing'));
    try {
      const result = await ckanIpc.call<any, any>('repo:refresh', {});
      if (result?.success) {
        setRefreshStatus(`${t('instances.refreshRepo')} — ${result.modCount} mods`);
      } else {
        setRefreshStatus(`${result?.error || 'Unknown error'}`);
      }
    } catch (err) {
      setRefreshStatus(`${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsRefreshing(false);
      setTimeout(() => setRefreshStatus(''), 5000);
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

    try {
      const result = await ckanIpc.call<any, any>('game:add-instance', {
        name: name.trim(),
        path: path.trim(),
      });
      if (!result?.success) {
        setError(result?.error || 'Failed to add instance');
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add instance');
      return;
    }

    setShowAddForm(false);
    setName('');
    setPath('');
    // Reload from backend
    await loadInstances();
  };

  const handleRemove = async (instanceName: string) => {
    try {
      const result = await ckanIpc.call<any, any>('game:remove-instance', { name: instanceName });
      if (result?.success) {
        await loadInstances();
      }
    } catch (err) {
      console.warn('[Instances] Failed to remove instance:', err);
    }
  };

  const handleSetActive = async (instanceName: string) => {
    if (switchingName) return;
    setSwitchingName(instanceName);
    try {
      const result = await ckanIpc.call<any, any>('game:set-active', { name: instanceName });
      if (result?.active) {
        // Update local state immediately
        setInstances(prev => prev.map(inst => ({
          ...inst,
          active: inst.name === instanceName,
        })));
      }
    } catch (err) {
      console.warn('[Instances] Failed to set active instance:', err);
    } finally {
      setSwitchingName(null);
    }
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
          >
            {isRefreshing ? <Loader2 size={16} className={styles.spin} /> : <RefreshCw size={16} />}
            {isRefreshing ? t('instances.refreshing') : t('instances.refreshRepo')}
          </button>
          <button className={styles.addBtn} onClick={() => setShowAddForm(true)}>
            <Plus size={16} />
            {t('instances.add')}
          </button>
        </div>
      </div>
      <div className={styles.content}>
        {/* Refresh Status Banner */}
        <AnimatePresence>
          {refreshStatus && (
            <motion.div
              className={styles.statusBanner}
              data-error={refreshStatus.toLowerCase().includes('fail') || refreshStatus.toLowerCase().includes('error') ? '' : undefined}
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
              animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
              transition={{ duration: dur.dropdown, ease: easeOut }}
            >
              {isRefreshing && <Loader2 size={12} className={styles.spin} />}
              {refreshStatus}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Add Instance Form */}
        <AnimatePresence>
          {showAddForm && (
            <motion.div
              className={styles.formCard}
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
              animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
              transition={{ duration: dur.dropdown, ease: easeOut }}
              style={{ transformOrigin: 'top center' }}
            >
              <div className={styles.formHeader}>
                <h3>{t('instances.add')}</h3>
                <button className={styles.formClose} onClick={() => { setShowAddForm(false); setError(''); }}>
                  <X size={16} />
                </button>
              </div>
              <div className={styles.formBody}>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>{t('instances.name')}</label>
                  <input
                    className={styles.formInput}
                    placeholder={t('instances.namePlaceholder')}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>{t('instances.path')}</label>
                  <div className={styles.pathRow}>
                    <Folder size={14} className={styles.pathIcon} />
                    <input
                      className={styles.formInput}
                      placeholder={t('instances.pathPlaceholder')}
                      value={path}
                      onChange={(e) => setPath(e.target.value)}
                    />
                    <button
                      type="button"
                      className={styles.browseBtn}
                      onClick={async () => {
                        try {
                          const result = await ckanIpc.call<{ title: string }, { selected: boolean; path: string | null }>(
                            'app:browse-folder',
                            { title: 'Select KSP Installation Folder' }
                          );
                          if (result.selected && result.path) {
                            setPath(result.path);
                          }
                        } catch (err) {
                          console.warn('[Instances] Browse folder failed:', err);
                        }
                      }}
                    >
                      {t('instances.browse')}
                    </button>
                  </div>
                </div>
                {error && (
                  <div className={styles.formError}>
                    <AlertCircle size={12} /> {error}
                  </div>
                )}
                <div className={styles.formActions}>
                  <button className={styles.formBtnPrimary} onClick={handleAdd}>
                    {t('instances.add')}
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
        {isLoading ? (
          <div className={styles.empty}>
            <Loader2 size={32} className={styles.spin} style={{ color: 'var(--color-text-secondary)' }} />
          </div>
        ) : instances.length > 0 ? (
          <motion.div
            className={styles.instanceList}
            variants={stagger(0, reducedMotion ? 0 : 0.04)}
            initial="initial"
            animate="animate"
            /* Re-run stagger on instances list change */
            key={instances.map(i => i.name).join('|')}
          >
            {instances.map((inst) => (
              <motion.div
                key={inst.name}
                className={`${styles.instanceCard} ${inst.active ? styles.instanceCardActive : ''}`}
                variants={{
                  initial: reducedMotion ? { opacity: 0 } : { opacity: 0, y: 10 },
                  animate: reducedMotion
                    ? { opacity: 1 }
                    : { opacity: 1, y: 0, transition: { duration: dur.pop, ease: easeOut } },
                }}
                whileTap={reducedMotion || inst.active ? undefined : { scale: 0.98 }}
                transition={{ duration: dur.press, ease: easeOut }}
                onClick={() => !inst.active && handleSetActive(inst.name)}
                style={{ cursor: inst.active ? 'default' : 'pointer' }}
              >
                <div className={`${styles.instanceIcon} ${inst.active ? styles.instanceIconActive : ''}`}>
                  {switchingName === inst.name
                    ? <Loader2 size={20} className={styles.spin} />
                    : inst.active
                      ? <Check size={20} />
                      : <Gamepad2 size={20} />}
                </div>
                <div className={styles.instanceInfo}>
                  <div className={styles.instanceName}>
                    {inst.name}
                    {inst.active && <span className={styles.activeBadge}>{t('instances.active')}</span>}
                    {!inst.valid && <span className={styles.invalidBadge}>{t('instances.invalid')}</span>}
                  </div>
                  <div className={styles.instancePath}>{inst.path}</div>
                  <div className={styles.instanceMeta}>
                    <span>{inst.game} {inst.version}</span>
                  </div>
                </div>
                <button
                  className={styles.removeBtn}
                  onClick={(e) => { e.stopPropagation(); handleRemove(inst.name); }}
                  title={t('modlist.remove')}
                >
                  <Trash2 size={14} />
                </button>
              </motion.div>
            ))}
          </motion.div>
        ) : !showAddForm ? (
          <motion.div
            className={styles.empty}
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
            animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: dur.modal, ease: easeOut }}
          >
            <Gamepad2 size={48} className={styles.emptyIcon} />
            <h2>{t('instances.noInstances')}</h2>
            <p>{t('instances.addFirst')}</p>
            <button className={styles.addBtnLarge} onClick={() => setShowAddForm(true)}>
              <Plus size={16} />
              {t('instances.add')}
            </button>
          </motion.div>
        ) : null}
      </div>
    </div>
  );
}
