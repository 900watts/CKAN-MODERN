import { useEffect, useSyncExternalStore } from 'react';
import { Download, Loader2, CheckCircle, AlertCircle, Trash2, RotateCcw } from 'lucide-react';
import { downloadStore } from '../services/downloadStore';
import { useT } from '../i18n';
import styles from './DownloadsPage.module.css';

export default function DownloadsPage() {
  const { t } = useT();
  // Initialize store listeners (idempotent)
  useEffect(() => { downloadStore.init(); }, []);

  const ops = useSyncExternalStore(downloadStore.subscribe, downloadStore.getAll);

  const active = ops.filter((o) => o.status === 'active');
  const completed = ops.filter((o) => o.status === 'completed');
  const failed = ops.filter((o) => o.status === 'failed');
  const hasHistory = completed.length > 0 || failed.length > 0;

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (ops.length === 0) {
    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <h1 className={styles.title}>{t('downloads.title')}</h1>
        </div>
        <div className={styles.content}>
          <div className={styles.empty}>
            <Download size={48} className={styles.emptyIcon} />
            <h2>{t('downloads.empty')}</h2>
            <p>{t('downloads.emptyHint')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t('downloads.title')}</h1>
        {hasHistory && (
          <button className={styles.clearBtn} onClick={() => downloadStore.clearHistory()}>
            <Trash2 size={14} /> {t('downloads.clearHistory')}
          </button>
        )}
      </div>
      <div className={styles.content}>
        {/* Active Operations */}
        {active.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              <Loader2 size={14} className={styles.spin} />
              {t('downloads.active')} ({active.length})
            </div>
            {active.map((op) => (
              <div key={op.id} className={styles.opCard}>
                <div className={styles.opIcon + ' ' + styles.opActive}>
                  <Loader2 size={16} className={styles.spin} />
                </div>
                <div className={styles.opInfo}>
                  <span className={styles.opName}>{op.name || op.identifier}</span>
                  <span className={styles.opMeta}>
                    {op.type === 'install' ? t('downloads.installing') : t('downloads.uninstalling')} · Started {formatTime(op.startedAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Failed Operations */}
        {failed.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionTitle + ' ' + styles.sectionFailed}>
              <AlertCircle size={14} />
              {t('downloads.failed')} ({failed.length})
            </div>
            {failed.map((op) => (
              <div key={op.id} className={styles.opCard + ' ' + styles.opCardFailed}>
                <div className={styles.opIcon + ' ' + styles.opFailed}>
                  <AlertCircle size={16} />
                </div>
                <div className={styles.opInfo}>
                  <span className={styles.opName}>{op.name || op.identifier}</span>
                  <span className={styles.opError}>{op.error}</span>
                  <span className={styles.opMeta}>
                    {op.type === 'install' ? 'Install' : 'Uninstall'} failed · {formatTime(op.finishedAt || op.startedAt)}
                  </span>
                </div>
                <button className={styles.retryBtn} onClick={() => downloadStore.retry(op)}>
                  <RotateCcw size={12} /> Retry
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Completed Operations */}
        {completed.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionTitle + ' ' + styles.sectionCompleted}>
              <CheckCircle size={14} />
              {t('downloads.completed')} ({completed.length})
            </div>
            {completed.map((op) => (
              <div key={op.id} className={styles.opCard}>
                <div className={styles.opIcon + ' ' + styles.opCompleted}>
                  <CheckCircle size={16} />
                </div>
                <div className={styles.opInfo}>
                  <span className={styles.opName}>{op.name || op.identifier}</span>
                  <span className={styles.opMeta}>
                    {op.type === 'install' ? t('downloads.installed') : t('downloads.uninstalled')} · {formatTime(op.finishedAt || op.startedAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
