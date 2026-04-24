import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Gamepad2, Folder, X, Trash2, AlertCircle } from 'lucide-react';
import ckanIpc from '../services/ipc';
import styles from './InstancesPage.module.css';

interface GameInstance {
  id: string;
  name: string;
  path: string;
  version: string;
  addedAt: string;
}

const STORAGE_KEY = 'ckan_instances';

function loadInstances(): GameInstance[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveInstances(instances: GameInstance[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(instances));
}

export default function InstancesPage() {
  const [instances, setInstances] = useState<GameInstance[]>(loadInstances);
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [version, setVersion] = useState('1.12.5');
  const [error, setError] = useState('');

  const handleAdd = () => {
    setError('');
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (!path.trim()) {
      setError('Game path is required');
      return;
    }

    const newInstance: GameInstance = {
      id: crypto.randomUUID(),
      name: name.trim(),
      path: path.trim(),
      version: version.trim() || '1.12.5',
      addedAt: new Date().toISOString(),
    };

    const updated = [...instances, newInstance];
    setInstances(updated);
    saveInstances(updated);
    setShowAddForm(false);
    setName('');
    setPath('');
    setVersion('1.12.5');
  };

  const handleRemove = (id: string) => {
    const updated = instances.filter((i) => i.id !== id);
    setInstances(updated);
    saveInstances(updated);
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Game Instances</h1>
        <button className={styles.addBtn} onClick={() => setShowAddForm(true)}>
          <Plus size={16} />
          Add Instance
        </button>
      </div>
      <div className={styles.content}>
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
                <h3>Add Game Instance</h3>
                <button className={styles.formClose} onClick={() => { setShowAddForm(false); setError(''); }}>
                  <X size={16} />
                </button>
              </div>
              <div className={styles.formBody}>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>Instance Name</label>
                  <input
                    className={styles.formInput}
                    placeholder="e.g. KSP 1.12 Modded"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>Game Path</label>
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
                        try {
                          const result = await ckanIpc.call<{ title: string }, { selected: boolean; path: string | null }>(
                            'app:browse-folder',
                            { title: 'Select KSP Installation Folder' }
                          );
                          if (result.selected && result.path) {
                            setPath(result.path);
                          }
                        } catch {
                          // Fallback: just let them type
                        }
                      }}
                    >
                      Browse
                    </button>
                  </div>
                  <span className={styles.formHint}>Paste the full path to your KSP installation folder</span>
                </div>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>KSP Version</label>
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
                    Add Instance
                  </button>
                  <button className={styles.formBtnSecondary} onClick={() => { setShowAddForm(false); setError(''); }}>
                    Cancel
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
                key={inst.id}
                className={styles.instanceCard}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className={styles.instanceIcon}>
                  <Gamepad2 size={20} />
                </div>
                <div className={styles.instanceInfo}>
                  <div className={styles.instanceName}>{inst.name}</div>
                  <div className={styles.instancePath}>{inst.path}</div>
                  <div className={styles.instanceMeta}>
                    <span>KSP {inst.version}</span>
                    <span>Added {new Date(inst.addedAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <button
                  className={styles.removeBtn}
                  onClick={() => handleRemove(inst.id)}
                  title="Remove instance"
                >
                  <Trash2 size={14} />
                </button>
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
            <h2>No game instances found</h2>
            <p>Add a Kerbal Space Program installation to get started</p>
            <button className={styles.addBtnLarge} onClick={() => setShowAddForm(true)}>
              <Plus size={16} />
              Add Your First Game
            </button>
          </motion.div>
        ) : null}
      </div>
    </div>
  );
}
