import { useEffect, useSyncExternalStore } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Loader2, CheckCircle, AlertCircle, Trash2, RotateCcw } from 'lucide-react';
import { downloadStore } from '../services/downloadStore';
import { useT } from '../i18n';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { easeOut, dur, stagger } from '../styles/motion';
import styles from './DownloadsPage.module.css';

export default function DownloadsPage() {
  const { t } = useT();
  const reducedMotion = useReducedMotion();
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

  // Shared opCard enter — opacity + small y. Used by all 3 sections.
  const opCardVariants = {
    initial: reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 },
    animate: reducedMotion
      ? { opacity: 1 }
      : { opacity: 1, y: 0, transition: { duration: dur.pop, ease: easeOut } },
    exit: reducedMotion
      ? { opacity: 0 }
      : { opacity: 0, y: -4, transition: { duration: dur.press, ease: easeOut } },
  };

  if (ops.length === 0) {
    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <h1 className={styles.title}>{t('downloads.title')}</h1>
        </div>
        <div className={styles.content}>
          <motion.div
            className={styles.empty}
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
            animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: dur.modal, ease: easeOut }}
          >
            <Download size={48} className={styles.emptyIcon} />
            <h2>{t('downloads.empty')}</h2>
            <p>{t('downloads.emptyHint')}</p>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t('downloads.title')}</h1>
        {hasHistory && (
          <motion.button
            className={styles.clearBtn}
            onClick={() => downloadStore.clearHistory()}
            whileTap={reducedMotion ? undefined : { scale: 0.97 }}
            transition={{ duration: dur.press, ease: easeOut }}
          >
            <Trash2 size={14} /> {t('downloads.clearHistory')}
          </motion.button>
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
            <motion.div
              variants={stagger(0, reducedMotion ? 0 : 0.04)}
              initial="initial"
              animate="animate"
            >
              <AnimatePresence initial={false}>
                {active.map((op) => (
                  <motion.div
                    key={op.id}
                    className={styles.opCard}
                    variants={opCardVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    layout="position"
                  >
                    <div className={styles.opIcon + ' ' + styles.opActive}>
                      <Loader2 size={16} className={styles.spin} />
                    </div>
                    <div className={styles.opInfo}>
                      <span className={styles.opName}>{op.name || op.identifier}</span>
                      <span className={styles.opMeta}>
                        {op.type === 'install' ? t('downloads.installing') : t('downloads.uninstalling')} · Started {formatTime(op.startedAt)}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          </div>
        )}

        {/* Failed Operations */}
        {failed.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionTitle + ' ' + styles.sectionFailed}>
              <AlertCircle size={14} />
              {t('downloads.failed')} ({failed.length})
            </div>
            <motion.div
              variants={stagger(0, reducedMotion ? 0 : 0.04)}
              initial="initial"
              animate="animate"
            >
              <AnimatePresence initial={false}>
                {failed.map((op) => (
                  <motion.div
                    key={op.id}
                    className={styles.opCard + ' ' + styles.opCardFailed}
                    variants={opCardVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    layout="position"
                  >
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
                    <motion.button
                      className={styles.retryBtn}
                      onClick={() => downloadStore.retry(op)}
                      whileTap={reducedMotion ? undefined : { scale: 0.95 }}
                      transition={{ duration: dur.press, ease: easeOut }}
                    >
                      <RotateCcw size={12} /> Retry
                    </motion.button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          </div>
        )}

        {/* Completed Operations */}
        {completed.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionTitle + ' ' + styles.sectionCompleted}>
              <CheckCircle size={14} />
              {t('downloads.completed')} ({completed.length})
            </div>
            <motion.div
              variants={stagger(0, reducedMotion ? 0 : 0.04)}
              initial="initial"
              animate="animate"
            >
              <AnimatePresence initial={false}>
                {completed.map((op) => (
                  <motion.div
                    key={op.id}
                    className={styles.opCard}
                    variants={opCardVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    layout="position"
                  >
                    <div className={styles.opIcon + ' ' + styles.opCompleted}>
                      <CheckCircle size={16} />
                    </div>
                    <div className={styles.opInfo}>
                      <span className={styles.opName}>{op.name || op.identifier}</span>
                      <span className={styles.opMeta}>
                        {op.type === 'install' ? t('downloads.installed') : t('downloads.uninstalled')} · {formatTime(op.finishedAt || op.startedAt)}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}
