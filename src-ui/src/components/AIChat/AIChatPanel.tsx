import { useState, useRef, useEffect, useSyncExternalStore } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Bot, User, Loader2, Sparkles, Download, Trash2, Search, RefreshCw, Wifi, WifiOff, AlertTriangle } from 'lucide-react';
import { aiService, AI_PROVIDERS, getCustomApiKey, getSelectedProvider, setSelectedProvider, getSelectedModel, setSelectedModel, chatWithCustomProvider, getOllamaUrl, setOllamaUrl, checkOllamaStatus } from '../../services/ai';
import type { ChatMessage, CustomProvider } from '../../services/ai';
import { chatStore } from '../../services/chatStore';
import type { ChatMsg } from '../../services/chatStore';
import { supabase } from '../../services/supabase';
import ckanIpc from '../../services/ipc';
import { useT } from '../../i18n';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { easeOut, dur, spring, stagger } from '../../styles/motion';
import styles from './AIChatPanel.module.css';

const DAILY_LIMIT = 20;

interface AIChatPanelProps {
  onClose: () => void;
}

export default function AIChatPanel({ onClose }: AIChatPanelProps) {
  const { t } = useT();
  const reducedMotion = useReducedMotion();
  // Use persistent chat store
  const messages = useSyncExternalStore(chatStore.subscribe, chatStore.get);

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [remainingToday, setRemainingToday] = useState<number | null>(null);
  const [userTier, setUserTier] = useState<string>('free');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Model selector state
  const [curProvider, setCurProvider] = useState<CustomProvider | 'ckan-cloud'>(getSelectedProvider());
  const [curModel, setCurModel] = useState<string>(() => {
    const p = getSelectedProvider();
    return p === 'ckan-cloud' ? '' : getSelectedModel(p);
  });
  const [customModelInput, setCustomModelInput] = useState('');
  const allProviders = Object.keys(AI_PROVIDERS) as CustomProvider[];

  // Ollama connection state
  const [ollamaUrl, setOllamaUrlState] = useState(getOllamaUrl());
  const [ollamaConnected, setOllamaConnected] = useState(false);
  const [ollamaChecking, setOllamaChecking] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaError, setOllamaError] = useState('');

  // Pending AI action confirmation
  const [pendingActions, setPendingActions] = useState<{ type: string; identifier: string }[]>([]);

  const handleOllamaConnect = async (url?: string) => {
    const targetUrl = url ?? ollamaUrl;
    setOllamaChecking(true);
    setOllamaError('');
    try {
      const result = await checkOllamaStatus(targetUrl);
      if (result.connected) {
        setOllamaConnected(true);
        setOllamaModels(result.models || []);
        setOllamaUrl(targetUrl);
        // Auto-select first model if none selected
        if (result.models?.length && !curModel) {
          const m = result.models[0];
          setCurModel(m);
          setSelectedModel('ollama', m);
        }
      } else {
        setOllamaConnected(false);
        setOllamaModels([]);
        setOllamaError(result.error || 'Cannot connect');
      }
    } catch {
      setOllamaConnected(false);
      setOllamaError('Connection failed');
    } finally {
      setOllamaChecking(false);
    }
  };

  const handleOllamaDisconnect = () => {
    setOllamaConnected(false);
    setOllamaModels([]);
    setOllamaError('');
  };

  // Auto-check Ollama status when provider switches to ollama
  useEffect(() => {
    if (curProvider === 'ollama') {
      handleOllamaConnect();
    }
  }, [curProvider]);

  // Fetch tier + daily usage from Supabase on mount
  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;

        const { data: profile } = await supabase
          .from('profiles')
          .select('tier')
          .eq('id', session.user.id)
          .single();
        if (profile?.tier) setUserTier(profile.tier);

        const { data: usageCount } = await supabase.rpc('get_daily_ai_usage', {
          p_user_id: session.user.id,
        });
        const used = usageCount ?? 0;
        setRemainingToday(DAILY_LIMIT - used);
      } catch (err) {
        console.warn('[AIChat] Failed to fetch usage/tier info:', err);
      }
    })();
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleProviderChange = (val: string) => {
    const p = val as CustomProvider | 'ckan-cloud';
    setCurProvider(p);
    setSelectedProvider(p);
    if (p !== 'ckan-cloud') {
      const m = getSelectedModel(p);
      setCurModel(m);
    } else {
      setCurModel('');
    }
  };

  const handleModelChange = (val: string) => {
    setCurModel(val);
    setCustomModelInput('');
    if (curProvider !== 'ckan-cloud') {
      setSelectedModel(curProvider, val);
    }
  };

  const handleCustomModelCommit = () => {
    const model = customModelInput.trim();
    if (model && curProvider !== 'ckan-cloud') {
      setCurModel(model);
      setSelectedModel(curProvider, model);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMsg = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    };

    chatStore.push(userMessage);
    setInput('');
    setIsLoading(true);

    try {
      // Build chat history
      const chatHistory: ChatMessage[] = messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
      chatHistory.push({ role: 'user', content: userMessage.content });

      let reply: string;

      if (curProvider !== 'ckan-cloud') {
        // Use custom provider
        const response = await chatWithCustomProvider(curProvider, curModel, chatHistory);
        reply = response.reply;
      } else {
        // Use CKAN Cloud (Silicon Flow via Supabase)
        if (!(await aiService.isConfigured())) {
          throw new Error('Sign in to use CKAN AI. Go to Settings > Account to create a free account.');
        }
        const response = await aiService.chat(chatHistory);
        if (response.remaining_today !== undefined) {
          setRemainingToday(response.remaining_today);
        }
        reply = response.reply;
      }

      chatStore.push({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: reply,
        timestamp: Date.now(),
      });

      // Execute any action commands in the AI's response
      executeAiActions(reply);
    } catch (err) {
      chatStore.push({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Sorry, I ran into an issue: ${err instanceof Error ? err.message : 'Unknown error'}. Please try again.`,
        timestamp: Date.now(),
      });
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /** Parse action commands from AI response and queue for user confirmation */
  const executeAiActions = (text: string) => {
    const actions: { type: string; identifier: string }[] = [];

    for (const m of text.matchAll(/\[INSTALL:([^\]]+)\]/g)) {
      actions.push({ type: 'install', identifier: m[1] });
    }
    for (const m of text.matchAll(/\[UNINSTALL:([^\]]+)\]/g)) {
      actions.push({ type: 'uninstall', identifier: m[1] });
    }
    if (text.includes('[REFRESH_REPO]')) {
      actions.push({ type: 'refresh', identifier: '' });
    }

    if (actions.length > 0) {
      setPendingActions(actions);
    }
  };

  const confirmPendingActions = async () => {
    for (const action of pendingActions) {
      try {
        if (action.type === 'install') {
          await ckanIpc.call('mod:install', { identifier: action.identifier });
        } else if (action.type === 'uninstall') {
          await ckanIpc.call('mod:uninstall', { identifier: action.identifier });
        } else if (action.type === 'refresh') {
          await ckanIpc.call('repo:refresh', {});
        }
      } catch (err) {
        console.warn(`[AI Action] Failed to ${action.type} ${action.identifier}:`, err);
      }
    }
    setPendingActions([]);
  };

  const dismissPendingActions = () => setPendingActions([]);

  function renderMarkdown(text: string): React.ReactNode {
    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    let listItems: React.ReactNode[] = [];

    const flushList = () => {
      if (listItems.length > 0) {
        elements.push(<ul key={`ul-${elements.length}`} className={styles.mdList}>{listItems}</ul>);
        listItems = [];
      }
    };

    const parseInline = (line: string, keyPrefix: string): React.ReactNode[] => {
      const parts: React.ReactNode[] = [];
      const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[INSTALL:(.+?)\]|\[UNINSTALL:(.+?)\]|\[SEARCH:(.+?)\]|\[REFRESH_REPO\])/g;
      let lastIndex = 0;
      let match;

      while ((match = regex.exec(line)) !== null) {
        if (match.index > lastIndex) {
          parts.push(line.slice(lastIndex, match.index));
        }
        if (match[2]) {
          parts.push(<strong key={`${keyPrefix}-b-${match.index}`}>{match[2]}</strong>);
        } else if (match[3]) {
          parts.push(<em key={`${keyPrefix}-i-${match.index}`}>{match[3]}</em>);
        } else if (match[4]) {
          parts.push(<code key={`${keyPrefix}-c-${match.index}`} className={styles.mdCode}>{match[4]}</code>);
        } else if (match[5]) {
          const modId = match[5];
          parts.push(
            <button
              key={`${keyPrefix}-install-${match.index}`}
              className={styles.installCmd}
              onClick={() => {
                ckanIpc.call('mod:install', { identifier: modId });
              }}
            >
              <Download size={12} /> Install {modId}
            </button>
          );
        } else if (match[6]) {
          const modId = match[6];
          parts.push(
            <button
              key={`${keyPrefix}-uninstall-${match.index}`}
              className={styles.uninstallCmd}
              onClick={() => {
                ckanIpc.call('mod:uninstall', { identifier: modId });
              }}
            >
              <Trash2 size={12} /> Uninstall {modId}
            </button>
          );
        } else if (match[7]) {
          const query = match[7];
          parts.push(
            <button
              key={`${keyPrefix}-search-${match.index}`}
              className={styles.searchCmd}
              onClick={() => {
                // Will be handled by parent — for now just visual
              }}
            >
              <Search size={12} /> Search: {query}
            </button>
          );
        } else if (match[0] === '[REFRESH_REPO]') {
          parts.push(
            <button
              key={`${keyPrefix}-refresh-${match.index}`}
              className={styles.refreshCmd}
              onClick={() => {
                ckanIpc.call('repo:refresh', {});
              }}
            >
              <RefreshCw size={12} /> Refresh Repository
            </button>
          );
        }
        lastIndex = regex.lastIndex;
      }

      if (lastIndex < line.length) {
        parts.push(line.slice(lastIndex));
      }

      return parts.length > 0 ? parts : [line];
    };

    lines.forEach((line, i) => {
      const trimmed = line.trim();

      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        listItems.push(
          <li key={`li-${i}`}>{parseInline(trimmed.slice(2), `li-${i}`)}</li>
        );
      } else {
        flushList();
        if (trimmed === '') {
          elements.push(<br key={`br-${i}`} />);
        } else {
          elements.push(
            <span key={`p-${i}`}>
              {parseInline(line, `p-${i}`)}
              {i < lines.length - 1 && <br />}
            </span>
          );
        }
      }
    });

    flushList();
    return <>{elements}</>;
  }

  return (
    <motion.aside
      className={styles.panel}
      initial={reducedMotion ? { opacity: 0 } : { x: 24, opacity: 0 }}
      animate={reducedMotion ? { opacity: 1 } : { x: 0, opacity: 1 }}
      exit={reducedMotion ? { opacity: 0 } : { x: 24, opacity: 0 }}
      transition={reducedMotion ? { duration: 0 } : spring.snappy}
    >
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <Sparkles size={16} className={styles.headerIcon} />
          <span className={styles.headerTitle}>{t('ai.title')}</span>
          <span className={styles.tierBadge}>{userTier.toUpperCase()}</span>
          {curProvider === 'ckan-cloud' && (
            <span className={styles.pointsBadge}>{remainingToday ?? DAILY_LIMIT}/{DAILY_LIMIT}</span>
          )}
        </div>
        <motion.button
          className={styles.closeBtn}
          onClick={onClose}
          title="Close"
          whileTap={reducedMotion ? undefined : { scale: 0.9 }}
          transition={{ duration: dur.press, ease: easeOut }}
        >
          <X size={16} />
        </motion.button>
      </div>

      {/* Model Selector — always visible */}
      <div className={styles.modelBar}>
        <div className={styles.modelSelect}>
          <label className={styles.modelLabel}>{t('ai.provider')}</label>
          <select
            value={curProvider}
            onChange={(e) => handleProviderChange(e.target.value)}
          >
            <option value="ckan-cloud">CKAN Cloud</option>
            {allProviders.map((p) => (
              <option key={p} value={p}>
                {AI_PROVIDERS[p].label}{getCustomApiKey(p) ? '' : ' (no key)'}
              </option>
            ))}
          </select>
        </div>
        {curProvider !== 'ckan-cloud' && (
          <>
            {curProvider === 'ollama' ? (
              /* ─── Ollama Connection UI ─── */
              <div className={styles.ollamaSection}>
                <div className={styles.ollamaUrlRow}>
                  <input
                    className={styles.customModelInput}
                    value={ollamaUrl}
                    onChange={(e) => setOllamaUrlState(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleOllamaConnect(); }}
                    placeholder="http://localhost:11434"
                    spellCheck={false}
                  />
                  {ollamaConnected ? (
                    <button className={styles.ollamaDisconnectBtn} onClick={handleOllamaDisconnect}>
                      <WifiOff size={12} />
                    </button>
                  ) : (
                    <button
                      className={styles.ollamaConnectBtn}
                      onClick={() => handleOllamaConnect()}
                      disabled={ollamaChecking}
                    >
                      {ollamaChecking ? <Loader2 size={12} className={styles.spin} /> : <Wifi size={12} />}
                    </button>
                  )}
                </div>
                <div className={styles.ollamaStatus}>
                  {ollamaChecking ? (
                    <span className={styles.ollamaStatusChecking}>{t('ai.ollamaChecking')}</span>
                  ) : ollamaConnected ? (
                    <span className={styles.ollamaStatusOk}>{t('ai.ollamaConnected', { count: ollamaModels.length })}</span>
                  ) : ollamaError ? (
                    <span className={styles.ollamaStatusErr}>{ollamaError}</span>
                  ) : (
                    <span className={styles.ollamaStatusOff}>{t('ai.ollamaDisconnected')}</span>
                  )}
                </div>
                {ollamaConnected && ollamaModels.length > 0 && (
                  <div className={styles.modelSelect}>
                    <label className={styles.modelLabel}>{t('ai.model')}</label>
                    <select
                      value={curModel}
                      onChange={(e) => handleModelChange(e.target.value)}
                    >
                      {ollamaModels.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className={styles.modelSelect}>
                  <label className={styles.modelLabel}>{t('ai.customModel')}</label>
                  <input
                    className={styles.customModelInput}
                    value={customModelInput}
                    onChange={(e) => setCustomModelInput(e.target.value)}
                    onBlur={handleCustomModelCommit}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCustomModelCommit(); }}
                    placeholder={t('ai.ollamaModelPlaceholder')}
                    spellCheck={false}
                  />
                </div>
              </div>
            ) : (
              /* ─── Standard provider UI ─── */
              <>
                <div className={styles.modelSelect}>
                  <label className={styles.modelLabel}>{t('ai.model')}</label>
                  <select
                    value={curModel}
                    onChange={(e) => handleModelChange(e.target.value)}
                  >
                    {AI_PROVIDERS[curProvider].models.map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                </div>
                {AI_PROVIDERS[curProvider].allowCustomModel && (
                  <div className={styles.modelSelect}>
                    <label className={styles.modelLabel}>{t('ai.customModel')}</label>
                    <input
                      className={styles.customModelInput}
                      value={customModelInput}
                      onChange={(e) => setCustomModelInput(e.target.value)}
                      onBlur={handleCustomModelCommit}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleCustomModelCommit(); }}
                      placeholder={t('ai.customModelPlaceholder')}
                      spellCheck={false}
                    />
                  </div>
                )}
                {!getCustomApiKey(curProvider) && (
                  <div className={styles.noKeyWarning}>
                    {t('ai.noKey')}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Messages */}
      <motion.div
        className={styles.messages}
        variants={stagger(0, 0.04)}
        initial="initial"
        animate="animate"
      >
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              className={`${styles.message} ${styles[msg.role]}`}
              variants={{
                initial: reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 },
                animate: reducedMotion
                  ? { opacity: 1 }
                  : { opacity: 1, y: 0, transition: { duration: dur.pop, ease: easeOut } },
                exit: reducedMotion
                  ? { opacity: 0 }
                  : { opacity: 0, y: -4, transition: { duration: dur.press, ease: easeOut } },
              }}
              initial="initial"
              animate="animate"
              exit="exit"
              layout="position"
            >
              <div className={styles.messageAvatar}>
                {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
              </div>
              <div className={styles.messageContent}>
                <div className={styles.messageText}>{renderMarkdown(msg.content)}</div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        <AnimatePresence>
          {isLoading && (
            <motion.div
              className={`${styles.message} ${styles.assistant}`}
              variants={{
                initial: reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 },
                animate: reducedMotion
                  ? { opacity: 1 }
                  : { opacity: 1, y: 0, transition: { duration: dur.pop, ease: easeOut } },
                exit: reducedMotion
                  ? { opacity: 0 }
                  : { opacity: 0, transition: { duration: dur.press, ease: easeOut } },
              }}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <div className={styles.messageAvatar}>
                <Bot size={14} />
              </div>
              <div className={styles.messageContent}>
                <div className={styles.typingIndicator}>
                  <span /><span /><span />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={messagesEndRef} />
      </motion.div>

      {/* Input */}
      <div className={styles.inputArea}>
        <div className={styles.inputWrapper}>
          <textarea
            ref={inputRef}
            className={styles.input}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('ai.placeholder')}
            rows={1}
            disabled={isLoading}
          />
          <motion.button
            className={styles.sendBtn}
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            whileTap={reducedMotion || !input.trim() || isLoading ? undefined : { scale: 0.9 }}
            whileHover={reducedMotion || !input.trim() || isLoading ? undefined : { scale: 1.05 }}
            animate={
              // Subtle breath when idle and ready; flat when disabled.
              !input.trim() || isLoading
                ? { scale: 1 }
                : { scale: 1 }
            }
            transition={{ duration: dur.press, ease: easeOut }}
            aria-label="Send message"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={isLoading ? 'loading' : 'send'}
                initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.5, rotate: -45 }}
                animate={reducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, rotate: 0 }}
                exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.5, rotate: 45 }}
                transition={{ duration: dur.pop, ease: easeOut }}
                style={{ display: 'inline-flex' }}
              >
                {isLoading ? <Loader2 size={16} className={styles.spin} /> : <Send size={16} />}
              </motion.span>
            </AnimatePresence>
          </motion.button>
        </div>
        <div className={styles.inputHint}>
          {curProvider === 'ckan-cloud'
            ? t('ai.poweredBy')
            : t('ai.using', { provider: AI_PROVIDERS[curProvider].label })}
        </div>
      </div>

      {/* AI Action Confirmation Dialog — modal with backdrop + spring */}
      <AnimatePresence>
        {pendingActions.length > 0 && (
          <motion.div
            className={styles.confirmOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: dur.press, ease: 'linear' }}
          >
            <motion.div
              className={styles.confirmDialog}
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 8 }}
              animate={reducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
              transition={reducedMotion ? { duration: 0 } : { duration: dur.modal, ease: easeOut }}
              style={{ transformOrigin: 'center' }}
            >
              <div className={styles.confirmHeader}>
                <AlertTriangle size={16} />
                <span>Confirm AI Actions</span>
              </div>
              <div className={styles.confirmBody}>
                <p>The AI wants to perform the following actions:</p>
              <ul className={styles.confirmList}>
                {pendingActions.map((a, i) => (
                  <li key={i}>
                    {a.type === 'install' && <>Install <strong>{a.identifier}</strong></>}
                    {a.type === 'uninstall' && <>Uninstall <strong>{a.identifier}</strong></>}
                    {a.type === 'refresh' && <>Refresh mod repository</>}
                  </li>
                ))}
              </ul>
            </div>
            <div className={styles.confirmActions}>
              <motion.button
                className={styles.confirmDeny}
                onClick={dismissPendingActions}
                whileTap={reducedMotion ? undefined : { scale: 0.97 }}
                transition={{ duration: dur.press, ease: easeOut }}
              >
                Cancel
              </motion.button>
              <motion.button
                className={styles.confirmAllow}
                onClick={confirmPendingActions}
                whileTap={reducedMotion ? undefined : { scale: 0.97 }}
                transition={{ duration: dur.press, ease: easeOut }}
              >
                Allow
              </motion.button>
            </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.aside>
  );
}
