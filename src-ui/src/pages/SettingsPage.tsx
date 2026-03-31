import { useState, useEffect } from 'react';
import { Globe, User, Zap, Database, LogIn, LogOut, Mail, AlertCircle, Check, Eye, EyeOff, Sun, Moon, Palette } from 'lucide-react';
const GithubIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
);
import { authService } from '../services/auth';
import type { AuthState } from '../services/auth';
import { isSupabaseConfigured } from '../services/supabase';
import { aiService } from '../services/ai';
import { themeService } from '../services/theme';
import type { Theme } from '../services/theme';
import styles from './SettingsPage.module.css';

export default function SettingsPage() {
  const [auth, setAuth] = useState<AuthState>(authService.getState());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [showAuthForm, setShowAuthForm] = useState(false);

  // Silicon Flow API key state
  const [sfKeyInput, setSfKeyInput] = useState('');
  const [sfShowKey, setSfShowKey] = useState(false);
  const [sfEditing, setSfEditing] = useState(false);
  const [sfSaved, setSfSaved] = useState(false);
  const sfIsCustom = aiService.isUsingCustomKey();

  // Theme state
  const [theme, setTheme] = useState<Theme>(themeService.getTheme());

  useEffect(() => {
    return authService.onChange(setAuth);
  }, []);

  useEffect(() => {
    return themeService.onChange(setTheme);
  }, []);

  const handleEmailAuth = async () => {
    setAuthError('');
    const result = authMode === 'signin'
      ? await authService.signInWithEmail(email, password)
      : await authService.signUpWithEmail(email, password);

    if (result.error) {
      setAuthError(result.error);
    } else {
      setShowAuthForm(false);
      setEmail('');
      setPassword('');
    }
  };

  const handleOAuth = async (provider: 'github' | 'google' | 'discord') => {
    const result = await authService.signInWithOAuth(provider);
    if (result.error) setAuthError(result.error);
  };

  const configured = isSupabaseConfigured();

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Settings</h1>
      </div>
      <div className={styles.content}>
        {/* Account Section */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <User size={16} />
            Account
          </div>
          <div className={styles.card}>
            {!configured ? (
              <div className={styles.settingRow}>
                <div>
                  <div className={styles.settingLabel}>
                    <AlertCircle size={14} style={{ color: 'var(--color-warning)', marginRight: 6 }} />
                    Supabase Not Configured
                  </div>
                  <div className={styles.settingDesc}>
                    Add your anon key in src/services/supabase.ts to enable auth
                  </div>
                </div>
              </div>
            ) : auth.user ? (
              <>
                <div className={styles.settingRow}>
                  <div>
                    <div className={styles.settingLabel}>{auth.user.displayName}</div>
                    <div className={styles.settingDesc}>{auth.user.email}</div>
                  </div>
                  <button className={styles.btnSecondary} onClick={() => authService.signOut()}>
                    <LogOut size={14} /> Sign Out
                  </button>
                </div>
              </>
            ) : showAuthForm ? (
              <div className={styles.authForm}>
                <div className={styles.authTabs}>
                  <button
                    className={`${styles.authTab} ${authMode === 'signin' ? styles.authTabActive : ''}`}
                    onClick={() => setAuthMode('signin')}
                  >Sign In</button>
                  <button
                    className={`${styles.authTab} ${authMode === 'signup' ? styles.authTabActive : ''}`}
                    onClick={() => setAuthMode('signup')}
                  >Sign Up</button>
                </div>

                <input
                  className={styles.authInput}
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <input
                  className={styles.authInput}
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleEmailAuth()}
                />

                {authError && <div className={styles.authError}>{authError}</div>}

                <button className={styles.btnPrimary} onClick={handleEmailAuth}>
                  <Mail size={14} />
                  {authMode === 'signin' ? 'Sign In with Email' : 'Create Account'}
                </button>

                <div className={styles.authDivider}><span>or</span></div>

                <button className={styles.btnGithub} onClick={() => handleOAuth('github')}>
                  <GithubIcon /> Continue with GitHub
                </button>

                <button className={styles.btnSecondary} onClick={() => setShowAuthForm(false)} style={{ marginTop: 8 }}>
                  Cancel
                </button>
              </div>
            ) : (
              <div className={styles.settingRow}>
                <div>
                  <div className={styles.settingLabel}>Sign in to CKAN</div>
                  <div className={styles.settingDesc}>Sync mods and AI points across devices</div>
                </div>
                <button className={styles.btnPrimary} onClick={() => setShowAuthForm(true)}>
                  <LogIn size={14} /> Sign In
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Appearance Section */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <Palette size={16} />
            Appearance
          </div>
          <div className={styles.card}>
            <div className={styles.settingRow}>
              <div>
                <div className={styles.settingLabel}>Theme</div>
                <div className={styles.settingDesc}>
                  {theme === 'dark' ? 'Dark mode active' : 'Light mode active'}
                </div>
              </div>
              <button
                className={styles.btnSecondary}
                onClick={() => themeService.toggle()}
              >
                {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
              </button>
            </div>
          </div>
        </div>

        {/* AI Section */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <Zap size={16} />
            AI Assistant
          </div>
          <div className={styles.card}>
            <div className={styles.settingRow}>
              <div>
                <div className={styles.settingLabel}>Model</div>
                <div className={styles.settingDesc}>
                  {aiService.getModelName()} (Free tier)
                </div>
              </div>
              <span className={styles.tierBadge}>FREE</span>
            </div>
            <div className={styles.divider} />
            <div className={styles.settingRow}>
              <div>
                <div className={styles.settingLabel}>Paid Tier</div>
                <div className={styles.settingDesc}>Coming soon — credits system in development</div>
              </div>
              <span className={styles.tierBadge} style={{ opacity: 0.4 }}>SOON</span>
            </div>
          </div>
        </div>

        {/* Silicon Flow */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <Globe size={16} />
            Silicon Flow
          </div>
          <div className={styles.card}>
            {sfEditing ? (
              <div className={styles.authForm}>
                <div className={styles.settingLabel}>API Key</div>
                <div className={styles.settingDesc} style={{ marginBottom: 8 }}>
                  Enter your own Silicon Flow API key, or leave blank to use the built-in default.
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className={styles.authInput}
                    type={sfShowKey ? 'text' : 'password'}
                    placeholder="sk-..."
                    value={sfKeyInput}
                    onChange={(e) => setSfKeyInput(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button
                    className={styles.btnSecondary}
                    onClick={() => setSfShowKey(!sfShowKey)}
                    style={{ padding: '8px 12px' }}
                  >
                    {sfShowKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <button
                    className={styles.btnPrimary}
                    onClick={() => {
                      aiService.setApiKey(sfKeyInput);
                      setSfEditing(false);
                      setSfSaved(true);
                      setTimeout(() => setSfSaved(false), 2000);
                    }}
                  >
                    <Check size={14} /> Save
                  </button>
                  <button
                    className={styles.btnSecondary}
                    onClick={() => {
                      aiService.setApiKey('');
                      setSfKeyInput('');
                      setSfEditing(false);
                    }}
                  >
                    Reset to Default
                  </button>
                  <button
                    className={styles.btnSecondary}
                    onClick={() => setSfEditing(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.settingRow}>
                <div>
                  <div className={styles.settingLabel}>
                    API Key {sfSaved && <span style={{ color: 'var(--color-accent-primary)', fontSize: 12, marginLeft: 8 }}>Saved!</span>}
                  </div>
                  <div className={styles.settingDesc}>
                    {sfIsCustom ? 'Using your custom key' : 'Using built-in key (free tier)'}
                  </div>
                </div>
                <button className={styles.btnSecondary} onClick={() => { setSfKeyInput(sfIsCustom ? aiService.getApiKey() : ''); setSfEditing(true); }}>
                  {sfIsCustom ? 'Edit' : 'Override'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Registry */}
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
