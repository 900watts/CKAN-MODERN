import { Settings, Globe, User, Zap, Database } from 'lucide-react';
import styles from './SettingsPage.module.css';

export default function SettingsPage() {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Settings</h1>
      </div>
      <div className={styles.content}>
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <User size={16} />
            Account
          </div>
          <div className={styles.card}>
            <div className={styles.settingRow}>
              <div>
                <div className={styles.settingLabel}>Sign in with Supabase</div>
                <div className={styles.settingDesc}>Sync your mods and AI points across devices</div>
              </div>
              <button className={styles.btnPrimary}>Sign In</button>
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <Zap size={16} />
            AI Assistant
          </div>
          <div className={styles.card}>
            <div className={styles.settingRow}>
              <div>
                <div className={styles.settingLabel}>Current Tier</div>
                <div className={styles.settingDesc}>Free tier — Limited to Qwen/DeepSeek models</div>
              </div>
              <span className={styles.tierBadge}>FREE</span>
            </div>
            <div className={styles.divider} />
            <div className={styles.settingRow}>
              <div>
                <div className={styles.settingLabel}>Points Balance</div>
                <div className={styles.settingDesc}>100 points remaining</div>
              </div>
              <button className={styles.btnSecondary}>Buy Points</button>
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <Globe size={16} />
            Silicon Flow
          </div>
          <div className={styles.card}>
            <div className={styles.settingRow}>
              <div>
                <div className={styles.settingLabel}>API Key</div>
                <div className={styles.settingDesc}>Your Silicon Flow API key for AI model access</div>
              </div>
              <button className={styles.btnSecondary}>Configure</button>
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <Database size={16} />
            CKAN Registry
          </div>
          <div className={styles.card}>
            <div className={styles.settingRow}>
              <div>
                <div className={styles.settingLabel}>Repository</div>
                <div className={styles.settingDesc}>master https://github.com/KSP-CKAN/CKAN-meta</div>
              </div>
              <button className={styles.btnSecondary}>Manage</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
