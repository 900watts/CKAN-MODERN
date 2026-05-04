import { Download } from 'lucide-react';
import styles from './DownloadsPage.module.css';

export default function DownloadsPage() {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Downloads</h1>
      </div>
      <div className={styles.content}>
        <div className={styles.empty}>
          <Download size={48} className={styles.emptyIcon} />
          <h2>No active downloads</h2>
          <p>Start installing mods to see them here</p>
        </div>
      </div>
    </div>
  );
}
