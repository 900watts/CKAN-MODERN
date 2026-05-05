import { useState, useEffect } from 'react';
import { User, Zap, Database, LogIn, LogOut, Mail, AlertCircle, Sun, Moon, Palette, Key, Check, X, Globe } from 'lucide-react';
import { authService } from '../services/auth';
import type { AuthState } from '../services/auth';
import { isSupabaseConfigured } from '../services/supabase';
import { aiService, AI_PROVIDERS, getCustomApiKey, setApiKey, clearApiKeyFor } from '../services/ai';
import type { CustomProvider } from '../services/ai';
import { themeService } from '../services/theme';
import type { Theme } from '../services/theme';
import { useT } from '../i18n';
import type { Locale } from '../i18n';
import ckanIpc from '../services/ipc';
import styles from './SettingsPage.module.css';

export default function SettingsPage() {
  const { t, locale, setLocale } = useT();
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
  const providers = Object.keys(AI_PROVIDERS) as CustomProvider[];
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [savedKeys, setSavedKeys] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    providers.forEach((p) => { init[p] = !!getCustomApiKey(p); });
    return init;
  });

  // Mirror state
  const MIRROR_PRESETS: Record<string, string> = {
    github: 'https://github.com/KSP-CKAN/CKAN-meta/archive/master.tar.gz',
    gitee: 'https://gitee.com/KSP-CKAN-mirror/CKAN-meta/repository/archive/master.tar.gz',
  };
  const [mirrorMode, setMirrorMode] = useState<'github' | 'gitee' | 'custom'>(() => {
    const saved = localStorage.getItem('ckan_mirror_mode');
    return (saved as 'github' | 'gitee' | 'custom') || 'github';
  });
  const [customMirrorUrl, setCustomMirrorUrl] = useState(() => {
    return localStorage.getItem('ckan_mirror_custom') || '';
  });
  const [mirrorSaved, setMirrorSaved] = useState(false);

  const handleMirrorChange = (mode: 'github' | 'gitee' | 'custom') => {
    setMirrorMode(mode);
    localStorage.setItem('ckan_mirror_mode', mode);
    const url = mode === 'custom' ? customMirrorUrl : (MIRROR_PRESETS[mode] || '');
    if (url && ckanIpc.isConnected()) {
      ckanIpc.call('repo:set-mirror', { url }).catch(() => {});
    }
    setMirrorSaved(true);
    setTimeout(() => setMirrorSaved(false), 2000);
  };

  const handleCustomMirrorSave = () => {
    const url = customMirrorUrl.trim();
    if (!url) return;
    localStorage.setItem('ckan_mirror_custom', url);
    if (ckanIpc.isConnected()) {
      ckanIpc.call('repo:set-mirror', { url }).catch(() => {});
    }
    setMirrorSaved(true);
    setTimeout(() => setMirrorSaved(false), 2000);
  };

  // Load mirror from backend on mount + acceleration status
  useEffect(() => {
    if (ckanIpc.isConnected()) {
      ckanIpc.call<any, any>('repo:get-mirror', {}).then((result) => {
        if (result?.url) {
          // Only override if not in 'auto' mode
          const saved = localStorage.getItem('ckan_mirror_mode');
          if (saved && saved !== 'auto') {
            if (result.url === MIRROR_PRESETS.github) setMirrorMode('github');
            else if (result.url === MIRROR_PRESETS.gitee) setMirrorMode('gitee');
            else {
              setMirrorMode('custom');
              setCustomMirrorUrl(result.url);
            }
          }
        }
      }).catch(() => {});
    }
  }, []);

  const handleSaveApiKey = (provider: CustomProvider) => {
    const key = apiKeys[provider]?.trim();
    if (!key) return;
    setApiKey(provider, key);
    setSavedKeys((prev) => ({ ...prev, [provider]: true }));
    setApiKeys((prev) => ({ ...prev, [provider]: '' }));
  };

  const handleClearApiKey = (provider: CustomProvider) => {
    clearApiKeyFor(provider);
    setSavedKeys((prev) => ({ ...prev, [provider]: false }));
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
        <h1 className={styles.title}>{t('settings.title')}</h1>
      </div>
      <div className={styles.content}>
        {/* Account Section */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <User size={16} />
            {t('settings.account')}
          </div>
          <div className={styles.card}>
            {!configured ? (
              <div className={styles.settingRow}>
                <div>
                  <div className={styles.settingLabel}>
                    <AlertCircle size={14} style={{ color: 'var(--color-warning)', marginRight: 6 }} />
                    {t('settings.supabaseNotConfigured')}
                  </div>
                  <div className={styles.settingDesc}>
                    {t('settings.supabaseHint')}
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
                    <LogOut size={14} /> {t('settings.signOut')}
                  </button>
                </div>
              </>
            ) : showAuthForm ? (
              <div className={styles.authForm}>
                <div className={styles.authTabs}>
                  <button
                    className={`${styles.authTab} ${authMode === 'signin' ? styles.authTabActive : ''}`}
                    onClick={() => setAuthMode('signin')}
                  >{t('settings.signIn')}</button>
                  <button
                    className={`${styles.authTab} ${authMode === 'signup' ? styles.authTabActive : ''}`}
                    onClick={() => setAuthMode('signup')}
                  >{t('settings.signUp')}</button>
                </div>

                <input
                  className={styles.authInput}
                  type="email"
                  placeholder={t('settings.email')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <input
                  className={styles.authInput}
                  type="password"
                  placeholder={t('settings.password')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleEmailAuth()}
                />

                {authError && <div className={styles.authError}>{authError}</div>}
                {authSuccess && <div className={styles.authSuccess}>{authSuccess}</div>}

                <button className={styles.btnPrimary} onClick={handleEmailAuth}>
                  <Mail size={14} />
                  {authMode === 'signin' ? t('settings.signInEmail') : t('settings.createAccount')}
                </button>

                <button className={styles.btnSecondary} onClick={() => setShowAuthForm(false)} style={{ marginTop: 8 }}>
                  {t('common.cancel')}
                </button>
              </div>
            ) : (
              <div className={styles.settingRow}>
                <div>
                  <div className={styles.settingLabel}>{t('settings.signInTo')}</div>
                  <div className={styles.settingDesc}>{t('settings.syncHint')}</div>
                </div>
                <button className={styles.btnPrimary} onClick={() => setShowAuthForm(true)}>
                  <LogIn size={14} /> {t('settings.signIn')}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Appearance Section */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <Palette size={16} />
            {t('settings.appearance')}
          </div>
          <div className={styles.card}>
            <div className={styles.settingRow}>
              <div>
                <div className={styles.settingLabel}>{t('settings.theme')}</div>
                <div className={styles.settingDesc}>
                  {theme === 'dark' ? t('settings.darkActive') : t('settings.lightActive')}
                </div>
              </div>
              <button
                className={styles.btnSecondary}
                onClick={() => themeService.toggle()}
              >
                {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                {theme === 'dark' ? t('settings.lightMode') : t('settings.darkMode')}
              </button>
            </div>
            <div className={styles.divider} />
            <div className={styles.settingRow}>
              <div>
                <div className={styles.settingLabel}>
                  <Globe size={14} style={{ marginRight: 6 }} />
                  {t('settings.language')}
                </div>
              </div>
              <select
                className={styles.btnSecondary}
                value={locale}
                onChange={(e) => setLocale(e.target.value as Locale)}
                style={{ padding: '6px 12px', cursor: 'pointer' }}
              >
                <option value="zh">简体中文</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>
        </div>

        {/* AI Section */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <Zap size={16} />
            {t('settings.ai')}
          </div>
          <div className={styles.card}>
            <div className={styles.settingRow}>
              <div>
                <div className={styles.settingLabel}>{t('settings.model')}</div>
                <div className={styles.settingDesc}>
                  {aiService.getModelName()}
                </div>
              </div>
              <span className={styles.tierBadge}>{t('settings.free')}</span>
            </div>
            <div className={styles.divider} />
            <div className={styles.settingRow}>
              <div>
                <div className={styles.settingLabel}>{t('settings.usageLimits')}</div>
                <div className={styles.settingDesc}>{t('settings.usageLimitDesc')}</div>
              </div>
            </div>
            <div className={styles.divider} />
            <div className={styles.settingRow}>
              <div>
                <div className={styles.settingLabel}>{t('settings.paidTier')}</div>
                <div className={styles.settingDesc}>{t('settings.paidTierDesc')}</div>
              </div>
              <span className={styles.tierBadge} style={{ opacity: 0.4 }}>{t('settings.soon')}</span>
            </div>
          </div>
        </div>

        {/* AI API Keys Section */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <Key size={16} />
            {t('settings.aiKeys')}
          </div>
          <div className={styles.card}>
            <div className={styles.settingDesc} style={{ marginBottom: 12 }}>
              {t('settings.apiKeysDesc')}
            </div>
            {providers.map((provider, i) => (
              <div key={provider}>
                {i > 0 && <div className={styles.divider} />}
                <div className={styles.apiKeyRow}>
                  <div className={styles.providerLabel}>{AI_PROVIDERS[provider].label}</div>
                  {savedKeys[provider] ? (
                    <div className={styles.apiKeySaved}>
                      <Check size={14} /> {t('settings.keySaved')}
                      <button className={styles.btnDanger} onClick={() => handleClearApiKey(provider)}>
                        <X size={12} /> {t('settings.clear')}
                      </button>
                    </div>
                  ) : (
                    <div className={styles.apiKeyInputRow}>
                      <input
                        className={styles.apiKeyInput}
                        type="password"
                        placeholder={t('settings.pasteKey')}
                        value={apiKeys[provider] || ''}
                        onChange={(e) => setApiKeys((prev) => ({ ...prev, [provider]: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveApiKey(provider)}
                      />
                      <button
                        className={styles.btnPrimary}
                        onClick={() => handleSaveApiKey(provider)}
                        disabled={!apiKeys[provider]?.trim()}
                        style={{ padding: '6px 12px', fontSize: '12px' }}
                      >
                        {t('common.save')}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Registry + Mirror */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <Database size={16} />
            {t('settings.registry')}
          </div>
          <div className={styles.card}>
            <div className={styles.settingRow}>
              <div>
                <div className={styles.settingLabel}>{t('settings.repository')}</div>
                <div className={styles.settingDesc}>master https://github.com/KSP-CKAN/CKAN-meta</div>
              </div>
              <button className={styles.btnSecondary}>{t('settings.manage')}</button>
            </div>
            <div className={styles.divider} />
            <div className={styles.settingRow} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div className={styles.settingLabel}>{t('settings.mirror')}</div>
                  <div className={styles.settingDesc}>
                    {t('settings.mirror.hint')}
                  </div>
                </div>
                {mirrorSaved && (
                  <span className={styles.tierBadge} style={{ background: 'rgba(108, 203, 95, 0.15)', color: '#7ed673' }}>
                    <Check size={12} /> {t('settings.mirror.saved')}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  className={mirrorMode === 'github' ? styles.btnPrimary : styles.btnSecondary}
                  onClick={() => handleMirrorChange('github')}
                  style={{ padding: '6px 12px', fontSize: '12px' }}
                >
                  {t('settings.mirror.github')}
                </button>
                <button
                  className={mirrorMode === 'gitee' ? styles.btnPrimary : styles.btnSecondary}
                  onClick={() => handleMirrorChange('gitee')}
                  style={{ padding: '6px 12px', fontSize: '12px' }}
                >
                  {t('settings.mirror.gitee')}
                </button>
                <button
                  className={mirrorMode === 'custom' ? styles.btnPrimary : styles.btnSecondary}
                  onClick={() => handleMirrorChange('custom')}
                  style={{ padding: '6px 12px', fontSize: '12px' }}
                >
                  {t('settings.mirror.custom')}
                </button>
              </div>
              {mirrorMode === 'custom' && (
                <div className={styles.apiKeyInputRow}>
                  <input
                    className={styles.apiKeyInput}
                    type="url"
                    placeholder={t('settings.mirror.customPlaceholder')}
                    value={customMirrorUrl}
                    onChange={(e) => setCustomMirrorUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCustomMirrorSave()}
                  />
                  <button
                    className={styles.btnPrimary}
                    onClick={handleCustomMirrorSave}
                    disabled={!customMirrorUrl.trim()}
                    style={{ padding: '6px 12px', fontSize: '12px' }}
                  >
                    {t('settings.mirror.saveCurrent')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
