import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HardDrive, Plus, Gamepad2, RefreshCw, Trash2, FolderOpen, Check, AlertCircle } from 'lucide-react';
import { ckanIpc } from '../services/ipc';
import styles from './InstancesPage.module.css';

interface GameInstance {
  name: string;
  path: string;
  game: string;
  version: string | null;
  valid: boolean;
}

interface InstancesPageProps {
  // Future: callback when instance is changed
  // onInstanceChange?: (instance: GameInstance) => void;
}

export default function InstancesPage({}: InstancesPageProps) {
  const [instances, setInstances] = useState<GameInstance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load instances on mount
  useEffect(() => {
    loadInstances();
  }, []);

  const loadInstances = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await ckanIpc.call<{}, { instances: GameInstance[] }>('game:list-instances', {});
      setInstances(response.instances || []);
    } catch (err) {
      // In dev mode without .NET, we get an error - that's ok, show empty
      console.warn('Failed to load instances:', err);
      setInstances([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleScanForGames = async () => {
    setIsScanning(true);
    setError(null);
    try {
      const response = await ckanIpc.call<{}, { instances: GameInstance[] }>('game:scan', {});
      setInstances(response.instances || []);
    } catch (err) {
      console.warn('Scan failed:', err);
      // If no .NET, just stay empty
      setInstances([]);
    } finally {
      setIsScanning(false);
    }
  };

  const handleSetActive = async (instance: GameInstance) => {
    try {
      await ckanIpc.call('game:set-active', { name: instance.name });
      setInstances(prev => prev.map(i => ({ ...i, active: i.name === instance.name })));
    } catch (err) {
      console.error('Failed to set active:', err);
    }
  };

  const handleRemove = async (instance: GameInstance) => {
    if (!confirm(`Remove "${instance.name}" from CKAN? This won't delete the game files.`)) {
      return;
    }
    try {
      await ckanIpc.call('game:remove', { name: instance.name });
      setInstances(prev => prev.filter(i => i.name !== instance.name));
    } catch (err) {
      console.error('Failed to remove:', err);
    }
  };

  const handleAddManual = async () => {
    // This would call a folder picker via IPC
    // For now, prompt for path
    const path = prompt('Enter path to game folder:');
    if (path) {
      try {
        await ckanIpc.call('game:add', { path });
        await loadInstances();
      } catch (err) {
        alert(`Failed to add instance: ${err}`);
      }
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Game Instances</h1>
        <div className={styles.headerActions}>
          <button 
            className={styles.scanBtn} 
            onClick={handleScanForGames}
            disabled={isScanning}
          >
            <RefreshCw size={16} className={isScanning ? styles.spin : ''} />
            {isScanning ? 'Scanning...' : 'Scan for Games'}
          </button>
          <button className={styles.addBtn} onClick={handleAddManual}>
            <Plus size={16} />
            Add Manually
          </button>
        </div>
      </div>

      <div className={styles.content}>
        {isLoading ? (
          <div className={styles.loading}>
            <RefreshCw size={24} className={styles.spin} />
            <p>Loading game instances...</p>
          </div>
        ) : instances.length === 0 ? (
          <motion.div
            className={styles.empty}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Gamepad2 size={48} className={styles.emptyIcon} />
            <h2>No game instances found</h2>
            <p>Add a Kerbal Space Program installation to get started</p>
            <div className={styles.emptyActions}>
              <button className={styles.scanBtnLarge} onClick={handleScanForGames} disabled={isScanning}>
                <RefreshCw size={16} className={isScanning ? styles.spin : ''} />
                {isScanning ? 'Scanning Steam...' : 'Scan for Steam Games'}
              </button>
              <button className={styles.addBtnLarge} onClick={handleAddManual}>
                <FolderOpen size={16} />
                Add Game Folder
              </button>
            </div>
            {error && (
              <div className={styles.error}>
                <AlertCircle size={14} />
                {error}
              </div>
            )}
          </motion.div>
        ) : (
          <div className={styles.instanceList}>
            <AnimatePresence>
              {instances.map((instance) => (
                <motion.div
                  key={instance.name}
                  className={`${styles.instanceCard} ${instance.valid ? '' : styles.invalid}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  layout
                >
                  <div className={styles.instanceIcon}>
                    <HardDrive size={24} />
                  </div>
                  <div className={styles.instanceInfo}>
                    <div className={styles.instanceName}>{instance.name}</div>
                    <div className={styles.instancePath}>{instance.path}</div>
                    <div className={styles.instanceMeta}>
                      <span className={styles.gameBadge}>{instance.game}</span>
                      {instance.version && (
                        <span className={styles.versionBadge}>v{instance.version}</span>
                      )}
                      {!instance.valid && (
                        <span className={styles.invalidBadge}>Invalid</span>
                      )}
                    </div>
                  </div>
                  <div className={styles.instanceActions}>
                    {instance.valid && (
                      <button 
                        className={styles.setActiveBtn}
                        onClick={() => handleSetActive(instance)}
                        title="Set as active"
                      >
                        <Check size={16} />
                      </button>
                    )}
                    <button 
                      className={styles.removeBtn}
                      onClick={() => handleRemove(instance)}
                      title="Remove from CKAN"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {instances.length > 0 && (
          <div className={styles.footer}>
            <p className={styles.hint}>
              <AlertCircle size={12} />
              Click the checkmark to set an instance as active. This won't affect your game files.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}