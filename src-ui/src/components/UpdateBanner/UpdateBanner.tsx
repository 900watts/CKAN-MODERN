import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, ExternalLink, Loader2 } from 'lucide-react';
import ckanIpc from '../../services/ipc';
import { useT } from '../../i18n';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { easeOut, dur } from '../../styles/motion';
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
  const reducedMotion = useReducedMotion();
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

  // Banner slide-down + fade, springs back on dismiss.
  const bannerVariants = {
    initial: reducedMotion ? { opacity: 0 } : { y: '-100%', opacity: 0 },
    animate: reducedMotion
      ? { opacity: 1 }
      : { y: 0, opacity: 1, transition: { duration: dur.banner, ease: easeOut } },
    exit: reducedMotion
      ? { opacity: 0 }
      : { y: '-100%', opacity: 0, transition: { duration: dur.panel, ease: easeOut } },
  };

  return (
    <AnimatePresence>
      {update && !dismissed && (
        <motion.div
          className={styles.banner}
          variants={bannerVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          role="status"
          aria-live="polite"
        >
          <div className={styles.content}>
            <motion.span
              className={styles.iconWrap}
              initial={false}
              animate={
                updating
                  ? { rotate: [0, -8, 8, 0] }
                  : { rotate: 0 }
              }
              transition={
                updating
                  ? { duration: 1.4, repeat: Infinity, ease: 'easeInOut' }
                  : { duration: dur.press, ease: easeOut }
              }
            >
              <Download size={16} className={styles.icon} />
            </motion.span>
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
                    {/* Animated width — Framer animates from previous to new % smoothly.
                        Avoids the "snap" of pure CSS width updates on every IPC tick. */}
                    <motion.div
                      className={styles.progressFill}
                      initial={false}
                      animate={{ width: `${progress.percent}%` }}
                      transition={{ duration: dur.dropdown, ease: easeOut }}
                    />
                  </div>
                )}
              </div>
            ) : (
              <>
                <motion.button
                  className={styles.updateBtn}
                  onClick={handleUpdate}
                  whileTap={reducedMotion ? undefined : { scale: 0.97 }}
                  whileHover={reducedMotion ? undefined : { scale: 1.02 }}
                  transition={{ duration: dur.press, ease: easeOut }}
                >
                  {t('update.install', { fallback: 'Update Now' })}
                </motion.button>
                <motion.a
                  className={styles.releaseLink}
                  href={update.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="View release notes"
                  whileTap={reducedMotion ? undefined : { scale: 0.92 }}
                  transition={{ duration: dur.press, ease: easeOut }}
                >
                  <ExternalLink size={14} />
                </motion.a>
                <motion.button
                  className={styles.dismissBtn}
                  onClick={() => setDismissed(true)}
                  whileTap={reducedMotion ? undefined : { scale: 0.9 }}
                  transition={{ duration: dur.press, ease: easeOut }}
                  aria-label="Dismiss update"
                >
                  <X size={14} />
                </motion.button>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
