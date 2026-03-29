import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Pause, Play, FileArchive, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { ckanIpc } from '../services/ipc';
import styles from './DownloadsPage.module.css';

interface DownloadItem {
  id: string;
  name: string;
  version: string;
  size: number;
  downloaded: number;
  status: 'pending' | 'downloading' | 'paused' | 'completed' | 'failed';
  speed?: number; // bytes per second
  error?: string;
}

export default function DownloadsPage() {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);

  // Subscribe to download events from .NET
  useEffect(() => {
    const unsubProgress = ckanIpc.on('download:progress', (data: any) => {
      setDownloads(prev => {
        const idx = prev.findIndex(d => d.id === data.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], ...data };
          return updated;
        }
        // New download
        return [...prev, {
          id: data.id,
          name: data.name,
          version: data.version || 'Unknown',
          size: data.size || 0,
          downloaded: data.downloaded || 0,
          status: 'downloading',
          speed: data.speed,
        }];
      });
    });

    const unsubComplete = ckanIpc.on('download:complete', (data: any) => {
      setDownloads(prev => prev.map(d => 
        d.id === data.id ? { ...d, status: 'completed' as const, downloaded: d.size } : d
      ));
    });

    const unsubFailed = ckanIpc.on('download:failed', (data: any) => {
      setDownloads(prev => prev.map(d => 
        d.id === data.id ? { ...d, status: 'failed' as const, error: data.error } : d
      ));
    });

    // Load any existing downloads on mount
    ckanIpc.call<{}, { downloads: DownloadItem[] }>('download:list', {}).then(res => {
      if (res.downloads) {
        setDownloads(res.downloads);
      }
    }).catch(() => {});

    return () => {
      unsubProgress();
      unsubComplete();
      unsubFailed();
    };
  }, []);

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatSpeed = (bytesPerSec: number): string => {
    return formatSize(bytesPerSec) + '/s';
  };

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  const handlePause = async (id: string) => {
    try {
      await ckanIpc.call('download:pause', { id });
    } catch (err) {
      console.error('Pause failed:', err);
    }
  };

  const handleResume = async (id: string) => {
    try {
      await ckanIpc.call('download:resume', { id });
    } catch (err) {
      console.error('Resume failed:', err);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Cancel this download?')) return;
    try {
      await ckanIpc.call('download:cancel', { id });
      setDownloads(prev => prev.filter(d => d.id !== id));
    } catch (err) {
      console.error('Cancel failed:', err);
    }
  };

  const handleClearCompleted = () => {
    setDownloads(prev => prev.filter(d => d.status !== 'completed'));
  };

  const activeDownloads = downloads.filter(d => d.status !== 'completed');
  const completedDownloads = downloads.filter(d => d.status === 'completed');

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Downloads</h1>
        {completedDownloads.length > 0 && (
          <button className={styles.clearBtn} onClick={handleClearCompleted}>
            Clear completed
          </button>
        )}
      </div>

      <div className={styles.content}>
        {downloads.length === 0 ? (
          <div className={styles.empty}>
            <Download size={48} className={styles.emptyIcon} />
            <h2>No active downloads</h2>
            <p>Start installing mods to see them here</p>
          </div>
        ) : (
          <div className={styles.downloadList}>
            <AnimatePresence>
              {activeDownloads.map((download) => {
                const progress = download.size > 0 ? (download.downloaded / download.size) * 100 : 0;
                const eta = download.speed && download.speed > 0 
                  ? (download.size - download.downloaded) / download.speed 
                  : null;

                return (
                  <motion.div
                    key={download.id}
                    className={styles.downloadCard}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    layout
                  >
                    <div className={styles.downloadIcon}>
                      <FileArchive size={20} />
                    </div>
                    <div className={styles.downloadInfo}>
                      <div className={styles.downloadName}>{download.name}</div>
                      <div className={styles.downloadMeta}>
                        v{download.version} · {formatSize(download.size)}
                      </div>
                      <div className={styles.progressBar}>
                        <motion.div 
                          className={styles.progressFill}
                          initial={{ width: 0 }}
                          animate={{ width: `${progress}%` }}
                        />
                      </div>
                      <div className={styles.downloadStatus}>
                        {download.status === 'downloading' && download.speed && (
                          <span className={styles.speed}>{formatSpeed(download.speed)}</span>
                        )}
                        {download.status === 'paused' && (
                          <span className={styles.paused}>Paused</span>
                        )}
                        {download.status === 'downloading' && eta !== null && (
                          <span className={styles.eta}>
                            <Clock size={12} />
                            {formatTime(eta)} remaining
                          </span>
                        )}
                        {download.status === 'failed' && (
                          <span className={styles.error}>
                            <AlertCircle size={12} />
                            {download.error || 'Download failed'}
                          </span>
                        )}
                        <span className={styles.progress}>
                          {formatSize(download.downloaded)} / {formatSize(download.size)}
                        </span>
                      </div>
                    </div>
                    <div className={styles.downloadActions}>
                      {download.status === 'downloading' && (
                        <button 
                          className={styles.actionBtn} 
                          onClick={() => handlePause(download.id)}
                          title="Pause"
                        >
                          <Pause size={16} />
                        </button>
                      )}
                      {download.status === 'paused' && (
                        <button 
                          className={styles.actionBtn} 
                          onClick={() => handleResume(download.id)}
                          title="Resume"
                        >
                          <Play size={16} />
                        </button>
                      )}
                      <button 
                        className={styles.cancelBtn} 
                        onClick={() => handleCancel(download.id)}
                        title="Cancel"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {completedDownloads.length > 0 && (
              <div className={styles.completedSection}>
                <h3 className={styles.completedTitle}>Completed</h3>
                <AnimatePresence>
                  {completedDownloads.map((download) => (
                    <motion.div
                      key={download.id}
                      className={`${styles.downloadCard} ${styles.completed}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <div className={`${styles.downloadIcon} ${styles.completedIcon}`}>
                        <CheckCircle size={20} />
                      </div>
                      <div className={styles.downloadInfo}>
                        <div className={styles.downloadName}>{download.name}</div>
                        <div className={styles.downloadMeta}>
                          v{download.version} · {formatSize(download.size)}
                        </div>
                      </div>
                      <div className={styles.downloadActions}>
                        <button 
                          className={styles.cancelBtn} 
                          onClick={() => handleCancel(download.id)}
                          title="Remove"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}