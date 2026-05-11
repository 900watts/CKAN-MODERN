import { Database } from 'lucide-react';
import { useT } from '../services/i18n';
import styles from './ReposPage.module.css';

export default function ReposPage() {
  const { t } = useT();
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t('repos.title')}</h1>
      </div>
      <div className={styles.content}>
        <div className={styles.empty}>
          <Database size={48} className={styles.emptyIcon} />
          <h2>{t('repos.defaultConfigured')}</h2>
          <p>{t('repos.defaultDesc')}</p>
        </div>
      </div>
    </div>
  );
}
