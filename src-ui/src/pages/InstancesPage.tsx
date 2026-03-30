import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Gamepad2, FolderOpen, CheckCircle2, X, Loader2, HardDrive, ChevronRight } from 'lucide-react';
import { ckanIpc } from '../services/ipc';
import styles from './InstancesPage.module.css';

interface GameInstance {
  id: string;
  name: string;
  path: string;
  version: string;
  active: boolean;
}

export default function InstancesPage() {
  const [instances, setInstances] = useState<GameInstance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addPath, setAddPath] = useState('');
  const [addName, setAddName] = useState('');
  const [addError, setAddError] = useState('');
  const [addLoading, setAddLoading] = useState(false);

  const loadInstances = () => {
    setIsLoading(true);
    ckanIpc
      .call<unknown, { instances: GameInstance[] }>('game:list-instances')
      .then((data) => setInstances(data.instances ?? []))
      .catch(() => setInstances([]))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadInstances();
  }, []);

  const handleSetActive = async (id: string) => {
    try {
      await ckanIpc.call('game:set-active', { id });
      setInstances((prev) =>
        prev.map((inst) => ({ ...inst, active: inst.id === id }))
      );
    } catch {
      // Best-effort
    }
  };

  const handleAdd = async () => {
    if (!addPath.trim()) {
      setAddError('Please enter the path to your KSP installation');
      return;
    }
    setAddLoading(true);
    setAddError('');
    try {
      await ckanIpc.call('game:add-instance', {
        name: addName.trim() || 'KSP',
        path: addPath.trim(),
      });
      setShowAddDialog(false);
      setAddPath('');
      setAddName('');
      loadInstances();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add instance — check that the path is a valid KSP installation');
    } finally {
      setAddLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Game Instances</h1>
        <button className={styles.addBtn} onClick={() => setShowAddDialog(true)}>
          <Plus size={16} />
          Add Instance
        </button>
      </div>

      <div className={styles.content}>
        {isLoading ? (
          <div className={styles.loading}>
            <Loader2 size={28} className={styles.spin} />
            <span>Loading instances...</span>
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
            <button className={styles.addBtnLarge} onClick={() => setShowAddDialog(true)}>
              <Plus size={16} />
              Add Your First Game
            </button>
          </motion.div>
        ) : (
          <div className={styles.instanceList}>
            {instances.map((inst) => (
              <motion.div
                key={inst.id}
                className={`${styles.instanceCard} ${inst.active ? styles.instanceCardActive : ''}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className={styles.instanceIcon}>
                  <HardDrive size={24} />
                </div>
                <div className={styles.instanceInfo}>
                  <div className={styles.instanceName}>
                    {inst.name}
                    {inst.active && (
                      <span className={styles.activeBadge}>
                        <CheckCircle2 size={12} /> Active
                      </span>
                    )}
                  </div>
                  <div className={styles.instanceVersion}>KSP {inst.version}</div>
                  <div className={styles.instancePath}>
                    <FolderOpen size={12} />
                    {inst.path}
                  </div>
                </div>
                {!inst.active && (
                  <button
                    className={styles.setActiveBtn}
                    onClick={() => handleSetActive(inst.id)}
                    title="Set as active instance"
                  >
                    Use <ChevronRight size={14} />
                  </button>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Add Instance Dialog */}
      <AnimatePresence>
        {showAddDialog && (
          <motion.div
            className={styles.dialogOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => e.target === e.currentTarget && setShowAddDialog(false)}
          >
            <motion.div
              className={styles.dialog}
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
            >
              <div className={styles.dialogHeader}>
                <h2>Add Game Instance</h2>
                <button className={styles.dialogClose} onClick={() => setShowAddDialog(false)}>
                  <X size={16} />
                </button>
              </div>
              <div className={styles.dialogBody}>
                <label className={styles.fieldLabel}>Instance Name (optional)</label>
                <input
                  className={styles.fieldInput}
                  type="text"
                  placeholder="KSP 1.12.5"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                />
                <label className={styles.fieldLabel}>KSP Installation Path</label>
                <input
                  className={styles.fieldInput}
                  type="text"
                  placeholder="C:\Program Files\Steam\steamapps\common\Kerbal Space Program"
                  value={addPath}
                  onChange={(e) => setAddPath(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                />
                {addError && <div className={styles.dialogError}>{addError}</div>}
              </div>
              <div className={styles.dialogFooter}>
                <button className={styles.btnSecondary} onClick={() => setShowAddDialog(false)}>
                  Cancel
                </button>
                <button className={styles.btnPrimary} onClick={handleAdd} disabled={addLoading}>
                  {addLoading ? <Loader2 size={14} className={styles.spin} /> : <Plus size={14} />}
                  Add Instance
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
