import { useState, useEffect } from 'react';
import { User, Zap, Database, LogIn, LogOut, Mail, AlertCircle, Sun, Moon, Palette, Key, Check, X } from 'lucide-react';
import { authService } from '../services/auth';
import type { AuthState } from '../services/auth';
import { isSupabaseConfigured } from '../services/supabase';
import { aiService, AI_PROVIDERS, getCustomApiKey, setApiKey, clearApiKeyFor, getKerbalModelOverride, setKerbalModelOverride } from '../services/ai';
import type { CustomProvider } from '../services/ai';
import { themeService } from '../services/theme';
import type { Theme } from '../services/theme';
import { i18n, t } from '../services/i18n';
import type { Language } from '../services/i18n';
import { idleBanter } from '../kerbal-control/Chat/IdleBanter';
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

  const [idleChatEnabled, setIdleChatEnabled] = useState(() => idleBanter.getConfig().enabled);
  const [kerbalModel, setKerbalModel] = useState(() => getKerbalModelOverride());
  const [language, setLanguage] = useState<Language>(i18n.language);

  const handleToggleIdleChat = () => {
    const next = !idleChatEnabled;
    setIdleChatEnabled(next);
    idleBanter.updateConfig({ enabled: next });
  };

  // API key state
  const providers = Object.keys(AI_PROVIDERS) as CustomProvider[];
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [savedKeys, setSavedKeys] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    providers.forEach((p) => { init[p] = !!getCustomApiKey(p); });
    return init;
  });

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

  useEffect(() => {
    return i18n.subscribe(() => setLanguage((prev) => {
      const cur = i18n.language;
      return prev === cur ? prev : cur;
    }));
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
        setAuthSuccess(t('settings.authSuccess'));
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
                    {t('settings.supabaseConfigHint')}
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
                    <LogOut size={14} /> {t('common.signOut')}
                  </button>
                </div>
              </>
            ) : showAuthForm ? (
              <div className={styles.authForm}>
                <div className={styles.authTabs}>
                  <button
                    className={`${styles.authTab} ${authMode === 'signin' ? styles.authTabActive : ''}`}
                    onClick={() => setAuthMode('signin')}
                  >{t('common.signIn')}</button>
                  <button
                    className={`${styles.authTab} ${authMode === 'signup' ? styles.authTabActive : ''}`}
                    onClick={() => setAuthMode('signup')}
                  >{t('common.signUp')}</button>
                </div>

                <input
                  className={styles.authInput}
                  type="email"
                  placeholder={t('common.email')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <input
                  className={styles.authInput}
                  type="password"
                  placeholder={t('common.password')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleEmailAuth()}
                />

                {authError && <div className={styles.authError}>{authError}</div>}
                {authSuccess && <div className={styles.authSuccess}>{authSuccess}</div>}

                <button className={styles.btnPrimary} onClick={handleEmailAuth}>
                  <Mail size={14} />
                  {authMode === 'signin' ? t('common.signInEmail') : t('common.createAccount')}
                </button>

                <button className={styles.btnSecondary} onClick={() => setShowAuthForm(false)} style={{ marginTop: 8 }}>
                  {t('common.cancel')}
                </button>
              </div>
            ) : (
              <div className={styles.settingRow}>
                <div>
                  <div className={styles.settingLabel}>{t('settings.signInPrompt')}</div>
                  <div className={styles.settingDesc}>{t('settings.signInPromptDesc')}</div>
                </div>
                <button className={styles.btnPrimary} onClick={() => setShowAuthForm(true)}>
                  <LogIn size={14} /> {t('common.signIn')}
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
                  {theme === 'dark' ? t('settings.darkMode') : t('settings.lightMode')}
                </div>
              </div>
              <button
                className={styles.btnSecondary}
                onClick={() => themeService.toggle()}
              >
                {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                {theme === 'dark' ? t('settings.light') : t('settings.dark')}
              </button>
            </div>
            <div className={styles.divider} />
            <div className={styles.settingRow}>
              <div>
                <div className={styles.settingLabel}>{t('settings.language')}</div>
                <div className={styles.settingDesc}>{t('settings.languageDesc')}</div>
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  className={language === 'en' ? styles.btnPrimary : styles.btnSecondary}
                  onClick={() => { setLanguage('en'); i18n.setLanguage('en'); }}
                  style={{ padding: '6px 12px', fontSize: '12px' }}
                >
                  EN
                </button>
                <button
                  className={language === 'zh' ? styles.btnPrimary : styles.btnSecondary}
                  onClick={() => { setLanguage('zh'); i18n.setLanguage('zh'); }}
                  style={{ padding: '6px 12px', fontSize: '12px' }}
                >
                  中文
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* AI Section */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <Zap size={16} />
            {t('settings.aiAssistant')}
          </div>
          <div className={styles.card}>
            <div className={styles.settingRow}>
              <div>
                <div className={styles.settingLabel}>{t('settings.model')}</div>
                <div className={styles.settingDesc}>
                  {aiService.getModelName()}
                </div>
              </div>
              <span className={styles.tierBadge}>{t('common.free')}</span>
            </div>
            <div className={styles.divider} />
            <div className={styles.settingRow}>
              <div>
                <div className={styles.settingLabel}>{t('settings.missionChatter')}</div>
                <div className={styles.settingDesc}>
                  {idleChatEnabled
                    ? t('settings.missionChatterOn')
                    : t('settings.missionChatterOff')}
                </div>
              </div>
              <button
                className={idleChatEnabled ? styles.btnPrimary : styles.btnSecondary}
                onClick={handleToggleIdleChat}
                style={{ padding: '6px 14px', fontSize: '12px', minWidth: '70px' }}
              >
                {idleChatEnabled ? t('common.on') : t('common.off')}
              </button>
            </div>
            {idleChatEnabled && (
              <>
                <div className={styles.divider} />
                <div style={{ padding: '8px 0', fontSize: '11px', color: 'var(--color-warning)', lineHeight: '1.5' }}>
                  {t('settings.chatterDisclaimer')}
                </div>
              </>
            )}
            <div className={styles.divider} />
            <div className={styles.settingRow}>
              <div>
                <div className={styles.settingLabel}>{t('settings.kerbalModel')}</div>
                <div className={styles.settingDesc}>
                  {t('settings.kerbalModelDesc')} {t('settings.kerbalModelExample')}
                </div>
              </div>
              <input
                className={styles.apiKeyInput}
                type="text"
                placeholder={t('common.auto')}
                value={kerbalModel}
                onChange={(e) => setKerbalModel(e.target.value)}
                onBlur={() => setKerbalModelOverride(kerbalModel)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setKerbalModelOverride(kerbalModel);
                }}
                style={{ width: '140px', padding: '6px 10px', fontSize: '12px' }}
              />
            </div>
            <div className={styles.divider} />
            <div className={styles.settingRow}>
              <div>
                <div className={styles.settingLabel}>{t('settings.usageLimits')}</div>
                <div className={styles.settingDesc}>{t('settings.usageDesc')}</div>
              </div>
            </div>
            <div className={styles.divider} />
            <div className={styles.settingRow}>
              <div>
                <div className={styles.settingLabel}>{t('settings.paidTier')}</div>
                <div className={styles.settingDesc}>{t('settings.comingSoon')}</div>
              </div>
              <span className={styles.tierBadge} style={{ opacity: 0.4 }}>{t('common.soon')}</span>
            </div>
          </div>
        </div>

        {/* AI API Keys Section */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <Key size={16} />
            {t('settings.apiKeys')}
          </div>
          <div className={styles.card}>
            <div className={styles.settingDesc} style={{ marginBottom: 12 }}>
              {t('settings.apiKeysDesc')}
            </div>
            {providers.map((provider, i) => {
              const isOllama = provider === 'ollama';
              return (
              <div key={provider}>
                {i > 0 && <div className={styles.divider} />}
                <div className={styles.apiKeyRow}>
                  <div className={styles.providerLabel}>{AI_PROVIDERS[provider].label}</div>
                  {isOllama ? (
                    <div className={styles.settingDesc} style={{ color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Check size={14} /> {t('settings.runsLocally')}
                    </div>
                  ) : savedKeys[provider] ? (
                    <div className={styles.apiKeySaved}>
                      <Check size={14} /> {t('settings.keySaved')}
                      <button className={styles.btnDanger} onClick={() => handleClearApiKey(provider)}>
                        <X size={12} /> {t('common.clear')}
                      </button>
                    </div>
                  ) : (
                    <div className={styles.apiKeyInputRow}>
                      <input
                        className={styles.apiKeyInput}
                        type="password"
                        placeholder={t('common.placeholder')}
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
            )})}
          </div>
        </div>

        {/* Registry */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <Database size={16} />
            {t('settings.registry')}
          </div>
          <div className={styles.card}>
            <div className={styles.settingRow}>
              <div>
                <div className={styles.settingLabel}>{t('settings.repository')}</div>
                <div className={styles.settingDesc}>{t('settings.repositoryDesc')}</div>
              </div>
              <button className={styles.btnSecondary}>{t('settings.manage')}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
