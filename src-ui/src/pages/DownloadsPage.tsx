import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, CheckCircle2, AlertCircle, Loader2, X, Package } from 'lucide-react';
import { downloadManager } from '../services/downloads';
import type { Download as DlEntry } from '../services/downloads';
import styles from './DownloadsPage.module.css';

function statusIcon(status: DlEntry['status']) {
  switch (status) {
    case 'done': return <CheckCircle2 size={16} className={styles.iconDone} />;
    case 'error': return <AlertCircle size={16} className={styles.iconError} />;
    case 'queued':
    case 'downloading':
    case 'installing':
      return <Loader2 size={16} className={styles.spin} />;
  }
}

function statusLabel(dl: DlEntry): string {
  switch (dl.status) {
    case 'queued': return 'Queued';
    case 'downloading': return `Downloading ${Math.round(dl.progress)}%`;
    case 'installing': return `Installing ${Math.round(dl.progress)}%`;
    case 'done': return 'Installed';
    case 'error': return 'Failed';
  }
}

export default function DownloadsPage() {
  const [downloads, setDownloads] = useState<DlEntry[]>(downloadManager.getAll());

  useEffect(() => {
    return downloadManager.onChange(setDownloads);
  }, []);

  const active = downloads.filter(d => d.status !== 'done' && d.status !== 'error');
  const finished = downloads.filter(d => d.status === 'done' || d.status === 'error');

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>
          Downloads
          {active.length > 0 && (
            <span className={styles.activeBadge}>{active.length} active</span>
          )}
        </h1>
        {finished.length > 0 && (
          <button
            className={styles.clearBtn}
            onClick={() => finished.forEach(d => downloadManager.clear(d.modId))}
          >
            Clear Finished
          </button>
        )}
      </div>

      <div className={styles.content}>
        {downloads.length === 0 ? (
          <motion.div
            className={styles.empty}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Download size={48} className={styles.emptyIcon} />
            <h2>No downloads yet</h2>
            <p>Install mods from the Available tab to see them here</p>
          </motion.div>
        ) : (
          <div className={styles.list}>
            <AnimatePresence initial={false}>
              {downloads.map((dl) => (
                <motion.div
                  key={dl.id}
                  className={`${styles.item} ${dl.status === 'error' ? styles.itemError : dl.status === 'done' ? styles.itemDone : ''}`}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className={styles.itemIcon}>
                    <Package size={18} />
                  </div>
                  <div className={styles.itemInfo}>
                    <div className={styles.itemName}>{dl.modName}</div>
                    {dl.status === 'error' && dl.error && (
                      <div className={styles.itemError2}>{dl.error}</div>
                    )}
                    {(dl.status === 'downloading' || dl.status === 'installing') && (
                      <div className={styles.progressBar}>
                        <div className={styles.progressFill} style={{ width: `${dl.progress}%` }} />
                      </div>
                    )}
                    <div className={styles.itemMeta}>
                      <span className={`${styles.itemStatus} ${styles[`status_${dl.status}`]}`}>
                        {statusIcon(dl.status)}
                        {statusLabel(dl)}
                      </span>
                      <span className={styles.itemTime}>
                        {dl.completedAt
                          ? `Completed ${dl.completedAt.toLocaleTimeString()}`
                          : `Started ${dl.startedAt.toLocaleTimeString()}`}
                      </span>
                    </div>
                  </div>
                  {(dl.status === 'done' || dl.status === 'error') && (
                    <button
                      className={styles.dismissBtn}
                      onClick={() => downloadManager.clear(dl.modId)}
                      title="Dismiss"
                    >
                      <X size={14} />
                    </button>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
