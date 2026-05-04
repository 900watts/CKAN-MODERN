import { Database } from 'lucide-react';
import styles from './ReposPage.module.css';

export default function ReposPage() {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Repositories</h1>
      </div>
      <div className={styles.content}>
        <div className={styles.empty}>
          <Database size={48} className={styles.emptyIcon} />
          <h2>Default repository configured</h2>
          <p>CKAN-meta at github.com/KSP-CKAN/CKAN-meta</p>
        </div>
      </div>
    </div>
  );
}
