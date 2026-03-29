import { useState, useEffect } from 'react';
import { Settings, Globe, User, Zap, Database, Sun, Moon } from 'lucide-react';
import styles from './SettingsPage.module.css';

export default function SettingsPage() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    // Load theme from localStorage or system preference
    const saved = localStorage.getItem('ckan-theme');
    if (saved) {
      setTheme(saved as 'dark' | 'light');
      document.documentElement.setAttribute('data-theme', saved);
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('ckan-theme', newTheme);
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Settings</h1>
      </div>
      <div className={styles.content}>
        {/* Appearance Section */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <Sun size={16} />
            Appearance
          </div>
          <div className={styles.card}>
            <div className={styles.settingRow}>
              <div>
                <div className={styles.settingLabel}>Theme</div>
                <div className={styles.settingDesc}>Choose between light and dark mode</div>
              </div>
              <button 
                className={styles.themeToggle} 
                onClick={toggleTheme}
                title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              >
                {theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
              </button>
            </div>
          </div>
        </div>

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
