import { useState, useEffect } from 'react';
import {
  Globe, User, Zap, Database, LogIn, LogOut, Mail, AlertCircle, Check,
  Eye, EyeOff, Sun, Moon, Palette, Loader2, MailCheck, ShieldCheck, Coins
} from 'lucide-react';

const GithubIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
  </svg>
);

import { authService } from '../services/auth';
import type { AuthState } from '../services/auth';
import { creditsService } from '../services/credits';
import type { CreditsState } from '../services/credits';
import { isSupabaseConfigured } from '../services/supabase';
import { aiService } from '../services/ai';
import { themeService } from '../services/theme';
import type { Theme } from '../services/theme';
import styles from './SettingsPage.module.css';

type AuthFormMode = 'signin' | 'signup' | 'confirm';

export default function SettingsPage() {
  const [auth, setAuth] = useState<AuthState>(authService.getState());
  const [credits, setCredits] = useState<CreditsState>(creditsService.getState());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authMode, setAuthMode] = useState<AuthFormMode>('signin');
  const [showAuthForm, setShowAuthForm] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);

  const [sfKeyInput, setSfKeyInput] = useState('');
  const [sfShowKey, setSfShowKey] = useState(false);
  const [sfEditing, setSfEditing] = useState(false);
  const [sfSaved, setSfSaved] = useState(false);
  const sfIsCustom = aiService.isUsingCustomKey();

  const [theme, setTheme] = useState<Theme>(themeService.getTheme());

  useEffect(() => { return authService.onChange(setAuth); }, []);
  useEffect(() => { return creditsService.onChange(setCredits); }, []);
  useEffect(() => { return themeService.onChange(setTheme); }, []);

  const handleEmailAuth = async () => {
    if (!email.trim() || !password.trim()) return;
    setIsSigningIn(true);
    setAuthError('');

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
      } else if (result.needsConfirmation) {
        setAuthMode('confirm');
      } else {
        setShowAuthForm(false);
        setEmail('');
        setPassword('');
      }
    }

    setIsSigningIn(false);
  };

  const handleOAuth = async (provider: 'github' | 'google' | 'discord') => {
    setAuthError('');
    const result = await authService.signInWithOAuth(provider);
    if (result.error) setAuthError(result.error);
  };

  const closeForm = () => {
    setShowAuthForm(false);
    setAuthMode('signin');
    setEmail('');
    setPassword('');
    setAuthError('');
  };

  const configured = isSupabaseConfigured();

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Settings</h1>
      </div>
      <div className={styles.content}>

        {/* ─── Account ─── */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}><User size={16} /> Account</div>
          <div className={styles.card}>

            {!configured ? (
              <div className={styles.settingRow}>
                <div>
                  <div className={styles.settingLabel}>
                    <AlertCircle size={14} style={{ color: 'var(--color-warning)', marginRight: 6 }} />
                    Supabase Not Configured
                  </div>
                  <div className={styles.settingDesc}>Run the schema SQL in your Supabase SQL Editor to enable auth</div>
                </div>
              </div>

            ) : auth.loading ? (
              <div className={styles.authLoading}>
                <Loader2 size={18} className={styles.spin} />
                <span>Restoring session...</span>
              </div>

            ) : auth.user ? (
              <div className={styles.userCard}>
                <div className={styles.userCardAvatar}>
                  {auth.user.avatarUrl
                    ? <img src={auth.user.avatarUrl} alt={auth.user.displayName} className={styles.userCardAvatarImg} />
                    : <span>{auth.user.displayName[0].toUpperCase()}</span>
                  }
                </div>
                <div className={styles.userCardInfo}>
                  <div className={styles.userCardName}>{auth.user.displayName}</div>
                  <div className={styles.userCardEmail}>{auth.user.email}</div>
                  <div className={styles.userCardStats}>
                    <span className={styles.tierBadge}>{auth.user.tier.toUpperCase()}</span>
                    <span className={styles.pointsPill}>
                      <Coins size={11} /> {auth.user.points} pts
                    </span>
                  </div>
                </div>
                <button className={styles.btnSecondary} onClick={() => authService.signOut()}>
                  <LogOut size={14} /> Sign Out
                </button>
              </div>

            ) : showAuthForm && authMode === 'confirm' ? (
              <div className={styles.confirmBox}>
                <MailCheck size={32} className={styles.confirmIcon} />
                <div className={styles.confirmTitle}>Check your email</div>
                <div className={styles.confirmDesc}>
                  Sent a confirmation link to <strong>{email}</strong>. Click it to activate your account, then come back and sign in.
                </div>
                <button className={styles.btnSecondary} onClick={closeForm}>Back to Sign In</button>
              </div>

            ) : showAuthForm ? (
              <div className={styles.authForm}>
                <div className={styles.authTabs}>
                  <button
                    className={`${styles.authTab} ${authMode === 'signin' ? styles.authTabActive : ''}`}
                    onClick={() => { setAuthMode('signin'); setAuthError(''); }}
                  >Sign In</button>
                  <button
                    className={`${styles.authTab} ${authMode === 'signup' ? styles.authTabActive : ''}`}
                    onClick={() => { setAuthMode('signup'); setAuthError(''); }}
                  >Create Account</button>
                </div>

                <input
                  className={styles.authInput}
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isSigningIn}
                  autoFocus
                />
                <input
                  className={styles.authInput}
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleEmailAuth()}
                  disabled={isSigningIn}
                />

                {authError && (
                  <div className={styles.authError}>
                    <AlertCircle size={13} /> {authError}
                  </div>
                )}

                <button
                  className={styles.btnPrimary}
                  onClick={handleEmailAuth}
                  disabled={isSigningIn || !email.trim() || !password.trim()}
                >
                  {isSigningIn ? <Loader2 size={14} className={styles.spin} /> : <Mail size={14} />}
                  {authMode === 'signin' ? 'Sign In' : 'Create Account'}
                </button>

                <div className={styles.authDivider}><span>or</span></div>

                <button className={styles.btnGithub} onClick={() => handleOAuth('github')} disabled={isSigningIn}>
                  <GithubIcon /> Continue with GitHub
                </button>

                <button className={styles.btnSecondary} onClick={closeForm} style={{ marginTop: 4 }}>
                  Cancel
                </button>
              </div>

            ) : (
              <div className={styles.signInPrompt}>
                <ShieldCheck size={24} className={styles.signInPromptIcon} />
                <div style={{ flex: 1 }}>
                  <div className={styles.settingLabel}>Sign in to CKAN</div>
                  <div className={styles.settingDesc}>Sync installs and AI points across devices</div>
                </div>
                <button className={styles.btnPrimary} onClick={() => setShowAuthForm(true)}>
                  <LogIn size={14} /> Sign In
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ─── Appearance ─── */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}><Palette size={16} /> Appearance</div>
          <div className={styles.card}>
            <div className={styles.settingRow}>
              <div>
                <div className={styles.settingLabel}>Theme</div>
                <div className={styles.settingDesc}>{theme === 'dark' ? 'Dark mode active' : 'Light mode active'}</div>
              </div>
              <button className={styles.btnSecondary} onClick={() => themeService.toggle()}>
                {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
              </button>
            </div>
          </div>
        </div>

        {/* ─── AI ─── */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}><Zap size={16} /> AI Assistant</div>
          <div className={styles.card}>
            <div className={styles.settingRow}>
              <div>
                <div className={styles.settingLabel}>Model</div>
                <div className={styles.settingDesc}>{aiService.getModelName()} (Free tier)</div>
              </div>
              <span className={styles.tierBadge}>FREE</span>
            </div>
            <div className={styles.divider} />
            {/* Credits status */}
            <div className={styles.settingRow}>
              <div>
                <div className={styles.settingLabel}>
                  <Coins size={13} style={{ marginRight: 5 }} />
                  Monthly Credits
                </div>
                <div className={styles.settingDesc}>
                  {credits.loaded
                    ? credits.degraded
                      ? `Out of credits — resets ${creditsService.timeUntilReset() ? `in ${creditsService.timeUntilReset()}` : 'soon'}`
                      : `${credits.balance} / ${credits.tier === 'pro' ? '500' : '50'} remaining · resets ${creditsService.timeUntilReset() ? `in ${creditsService.timeUntilReset()}` : 'soon'}`
                    : 'Sign in to track credits'
                  }
                </div>
              </div>
              <span className={`${styles.tierBadge} ${credits.tier === 'pro' ? styles.tierBadgePro : ''}`}>
                {credits.tier.toUpperCase()}
              </span>
            </div>
            {credits.tier === 'free' && (
              <>
                <div className={styles.divider} />
                <div className={styles.settingRow}>
                  <div>
                    <div className={styles.settingLabel}>Upgrade to Pro</div>
                    <div className={styles.settingDesc}>500 credits/month · priority responses · early access</div>
                  </div>
                  <span className={styles.tierBadge} style={{ opacity: 0.5 }}>SOON</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ─── Silicon Flow ─── */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}><Globe size={16} /> Silicon Flow</div>
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
                  <button className={styles.btnSecondary} onClick={() => setSfShowKey(!sfShowKey)} style={{ padding: '8px 12px' }}>
                    {sfShowKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <button className={styles.btnPrimary} onClick={() => { aiService.setApiKey(sfKeyInput); setSfEditing(false); setSfSaved(true); setTimeout(() => setSfSaved(false), 2000); }}>
                    <Check size={14} /> Save
                  </button>
                  <button className={styles.btnSecondary} onClick={() => { aiService.setApiKey(''); setSfKeyInput(''); setSfEditing(false); }}>
                    Reset to Default
                  </button>
                  <button className={styles.btnSecondary} onClick={() => setSfEditing(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className={styles.settingRow}>
                <div>
                  <div className={styles.settingLabel}>
                    API Key {sfSaved && <span style={{ color: 'var(--color-accent-primary)', fontSize: 12, marginLeft: 8 }}>Saved!</span>}
                  </div>
                  <div className={styles.settingDesc}>{sfIsCustom ? 'Using your custom key' : 'Using built-in key (free tier)'}</div>
                </div>
                <button className={styles.btnSecondary} onClick={() => { setSfKeyInput(sfIsCustom ? aiService.getApiKey() : ''); setSfEditing(true); }}>
                  {sfIsCustom ? 'Edit' : 'Override'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ─── Registry ─── */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}><Database size={16} /> CKAN Registry</div>
          <div className={styles.card}>
            <div className={styles.settingRow}>
              <div>
                <div className={styles.settingLabel}>Repository</div>
                <div className={styles.settingDesc}>master · https://github.com/KSP-CKAN/CKAN-meta</div>
              </div>
              <button className={styles.btnSecondary}>Manage</button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
