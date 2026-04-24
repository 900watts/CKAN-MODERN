import { useState, useEffect } from 'react';
import { User, Zap, Database, LogIn, LogOut, Mail, AlertCircle, Sun, Moon, Palette, Key, Check } from 'lucide-react';
import { authService } from '../services/auth';
import type { AuthState } from '../services/auth';
import { isSupabaseConfigured } from '../services/supabase';
import { aiService, AI_PROVIDERS } from '../services/ai';
import type { CustomProvider } from '../services/ai';
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

  const [authSuccess, setAuthSuccess] = useState('');

  // Theme state
  const [theme, setTheme] = useState<Theme>(themeService.getTheme());

  // API key state
  const providers: CustomProvider[] = ['openrouter', 'google', 'openai'];
  const [apiKeys, setApiKeys] = useState<Record<CustomProvider, string>>({
    openrouter: '',
    google: '',
    openai: '',
  });
  const [savedKeys, setSavedKeys] = useState<Record<CustomProvider, boolean>>({
    openrouter: !!aiService.getCustomApiKey('openrouter'),
    google: !!aiService.getCustomApiKey('google'),
    openai: !!aiService.getCustomApiKey('openai'),
  });

  const handleSaveApiKey = (provider: CustomProvider) => {
    const key = apiKeys[provider].trim();
    if (!key) return;
    aiService.setApiKey(provider, key);
    setSavedKeys((prev) => ({ ...prev, [provider]: true }));
    setApiKeys((prev) => ({ ...prev, [provider]: '' }));
  };

  const handleClearApiKey = (provider: CustomProvider) => {
    aiService.clearApiKeyFor(provider);
    setSavedKeys((prev) => ({ ...prev, [provider]: false }));
    setApiKeys((prev) => ({ ...prev, [provider]: '' }));
  };

  useEffect(() => {
    return authService.onChange(setAuth);
  }, []);

  useEffect(() => {
    return themeService.onChange(setTheme);
  }, []);

  const handleEmailAuth = async () => {
    setAuthError('');
    setAuthSuccess('');
    if (authMode === 'signin') {
      const result = await authService.signInWithEmail(email, password);
      if (result.error) {
        setAuthError(result.error);
      } else {
        setShowAuthForm(false);
        setEmail('');
        setPassword('');
      }
    } else {
      const result = await authService.signUpWithEmail(email, password);
      if (result.error) {
        setAuthError(result.error);
      } else {
        setAuthSuccess('Account created! Check your email inbox and click the verification link to activate your account.');
        setEmail('');
        setPassword('');
      }
    }
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
                {authSuccess && <div className={styles.authSuccess}>{authSuccess}</div>}

                <button className={styles.btnPrimary} onClick={handleEmailAuth}>
                  <Mail size={14} />
                  {authMode === 'signin' ? 'Sign In with Email' : 'Create Account'}
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
                  {aiService.getModelName()}
                </div>
              </div>
              <span className={styles.tierBadge}>FREE</span>
            </div>
            <div className={styles.divider} />
            <div className={styles.settingRow}>
              <div>
                <div className={styles.settingLabel}>Usage Limits</div>
                <div className={styles.settingDesc}>Free: 20 requests/day | Paid: Unlimited (1 point/request)</div>
              </div>
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

        {/* AI API Keys Section */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <Key size={16} />
            AI API Keys
          </div>
          <div className={styles.card}>
            <div className={styles.settingRow}>
              <div>
                <div className={styles.settingLabel}>Custom Providers</div>
                <div className={styles.settingDesc}>
                  Add your own API keys to use different AI models
                </div>
              </div>
            </div>
            {providers.map((provider) => (
              <div key={provider}>
                <div className={styles.divider} />
                <div className={styles.apiKeyRow}>
                  <span className={styles.providerLabel}>
                    {AI_PROVIDERS[provider].name}
                  </span>
                  {savedKeys[provider] ? (
                    <>
                      <span className={styles.apiKeySaved}>
                        <Check size={14} /> Key saved
                      </span>
                      <button
                        className={styles.btnDanger}
                        onClick={() => handleClearApiKey(provider)}
                      >
                        Clear
                      </button>
                    </>
                  ) : (
                    <>
                      <input
                        className={styles.apiKeyInput}
                        type="password"
                        placeholder={`Enter ${AI_PROVIDERS[provider].name} API key`}
                        value={apiKeys[provider]}
                        onChange={(e) =>
                          setApiKeys((prev) => ({
                            ...prev,
                            [provider]: e.target.value,
                          }))
                        }
                        onKeyDown={(e) =>
                          e.key === 'Enter' && handleSaveApiKey(provider)
                        }
                      />
                      <button
                        className={styles.btnPrimary}
                        onClick={() => handleSaveApiKey(provider)}
                        disabled={!apiKeys[provider].trim()}
                        style={{ padding: '6px 14px', fontSize: '12px' }}
                      >
                        Save
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
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
