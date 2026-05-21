import { useState, useEffect } from 'react';
import { Download, X, ExternalLink, Loader2 } from 'lucide-react';
import ckanIpc from '../../services/ipc';
import { useT } from '../../i18n';
import styles from './UpdateBanner.module.css';

interface UpdateData {
  tag: string;
  name: string;
  notes: string;
  url: string;
  publishedAt: string;
  liteUrl?: string;
  bundledUrl?: string;
  liteSize: number;
  bundledSize: number;
}

export default function UpdateBanner() {
  const { t } = useT();
  const [update, setUpdate] = useState<UpdateData | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [progress, setProgress] = useState({ message: '', percent: 0 });

  useEffect(() => {
    // Listen for update:available push event from backend (auto-check on startup)
    const unsub = ckanIpc.on('update:available', (data: unknown) => {
      setUpdate(data as UpdateData);
    });

    // Also listen for download progress
    const unsub2 = ckanIpc.on('update:progress', (data: any) => {
      if (data?.message) setProgress({ message: data.message, percent: data.percent ?? 0 });
    });

    return () => { unsub(); unsub2(); };
  }, []);

  const handleUpdate = async () => {
    if (!update) return;

    // Determine which exe to download — use lite by default (smaller),
    // fall back to bundled if lite isn't available
    const downloadUrl = update.liteUrl || update.bundledUrl;
    if (!downloadUrl) {
      // No direct download — open the release page instead
      window.open(update.url, '_blank');
      return;
    }

    setUpdating(true);
    try {
      await ckanIpc.call('app:apply-update', { downloadUrl });
    } catch (err) {
      console.warn('[UpdateBanner] IPC apply-update failed, opening release page:', err);
      window.open(update.url, '_blank');
      setUpdating(false);
    }
  };

  if (!update || dismissed) return null;

  return (
    <div className={styles.banner}>
      <div className={styles.content}>
        <Download size={16} className={styles.icon} />
        <span className={styles.text}>
          <strong>{update.name || update.tag}</strong>
          {' — '}
          <span>{t('update.available', { fallback: 'A new version is available' })}</span>
        </span>
      </div>
      <div className={styles.actions}>
        {updating ? (
          <div className={styles.progress}>
            <Loader2 size={14} className={styles.spinner} />
            <span>{progress.message || 'Updating...'}</span>
            {progress.percent > 0 && (
              <div className={styles.progressBar}>
                <div className={styles.progressFill} style={{ width: `${progress.percent}%` }} />
              </div>
            )}
          </div>
        ) : (
          <>
            <button className={styles.updateBtn} onClick={handleUpdate}>
              {t('update.install', { fallback: 'Update Now' })}
            </button>
            <a
              className={styles.releaseLink}
              href={update.url}
              target="_blank"
              rel="noopener noreferrer"
              title="View release notes"
            >
              <ExternalLink size={14} />
            </a>
            <button className={styles.dismissBtn} onClick={() => setDismissed(true)}>
              <X size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
