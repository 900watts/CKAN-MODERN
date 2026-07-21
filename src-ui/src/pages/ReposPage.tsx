import { motion } from 'framer-motion';
import { Database } from 'lucide-react';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { dur, easeOut } from '../styles/motion';
import styles from './ReposPage.module.css';

export default function ReposPage() {
  const reducedMotion = useReducedMotion();
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Repositories</h1>
      </div>
      <div className={styles.content}>
        <motion.div
          className={styles.empty}
          initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
          animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: dur.modal, ease: easeOut }}
        >
          <Database size={48} className={styles.emptyIcon} />
          <h2>Default repository configured</h2>
          <p>CKAN-meta at github.com/KSP-CKAN/CKAN-meta</p>
        </motion.div>
      </div>
    </div>
  );
}
