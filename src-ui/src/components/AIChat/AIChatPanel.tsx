import { useState, useRef, useEffect, useSyncExternalStore } from 'react';
import { motion } from 'framer-motion';
import { X, Send, Bot, User, Sparkles, Download, Trash2, Search, RefreshCw, Square } from 'lucide-react';
import { aiService, AI_PROVIDERS, getCustomApiKey, getSelectedProvider, setSelectedProvider, getSelectedModel, setSelectedModel, chatViaProvider } from '../../services/ai';
import type { ChatMessage, CustomProvider } from '../../services/ai';
import { chatStore } from '../../services/chatStore';
import type { ChatMsg } from '../../services/chatStore';
import { supabase } from '../../services/supabase';
import ckanIpc from '../../services/ipc';
import { useT } from '../../services/i18n';
import styles from './AIChatPanel.module.css';

const DAILY_LIMIT = 20;

interface AIChatPanelProps {
  onClose: () => void;
}

export default function AIChatPanel({ onClose }: AIChatPanelProps) {
  const { t } = useT();
  // Use persistent chat store
  const messages = useSyncExternalStore(chatStore.subscribe, chatStore.get);

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [remainingToday, setRemainingToday] = useState<number | null>(null);
  const [userTier, setUserTier] = useState<string>('free');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  // Model selector state
  const [curProvider, setCurProvider] = useState<CustomProvider | 'ckan-cloud'>(getSelectedProvider());
  const [curModel, setCurModel] = useState<string>(() => {
    const p = getSelectedProvider();
    return p === 'ckan-cloud' ? '' : getSelectedModel(p);
  });
  const [customModelInput, setCustomModelInput] = useState('');
  const allProviders = Object.keys(AI_PROVIDERS) as CustomProvider[];

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
      } catch {
        // Silently fail
      }
    })();
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Track mount state to prevent state updates after unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Validate provider from localStorage — reset to 'ckan-cloud' if corrupted
  useEffect(() => {
    if (curProvider !== 'ckan-cloud' && !(AI_PROVIDERS as Record<string, unknown>)[curProvider]) {
      setCurProvider('ckan-cloud');
      setSelectedProvider('ckan-cloud');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

    // Create a new AbortController for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setInput('');
    setIsLoading(true);

    try {
      chatStore.push(userMessage);
      if (!mountedRef.current) return;

      // Build chat history
      const chatHistory: ChatMessage[] = messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
      chatHistory.push({ role: 'user', content: userMessage.content });

      let reply: string;

      // Use the unified provider router — handles CKAN Cloud, Ollama detection,
      // custom providers, and graceful fallback when auth is unavailable.
      const response = await chatViaProvider(chatHistory, { signal: abortController.signal });
      if (!mountedRef.current) return;

      if (curProvider === 'ckan-cloud' && response.remaining_today !== undefined) {
        setRemainingToday(response.remaining_today);
      }
      reply = response.reply;

      if (!mountedRef.current) return;
      chatStore.push({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: reply,
        timestamp: Date.now(),
      });

      // Execute any action commands in the AI's response
      executeAiActions(reply);
    } catch (err) {
      if (!mountedRef.current) return;
      // Silently ignore user-initiated abort
      if (err instanceof DOMException && err.name === 'AbortError') return;

      chatStore.push({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: t('ai.errorOccurred', { error: err instanceof Error ? err.message : t('common.unknownError') }),
        timestamp: Date.now(),
      });
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
        abortControllerRef.current = null;
        inputRef.current?.focus();
      }
    }
  };

  const handleStop = () => {
    abortControllerRef.current?.abort();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /** Execute action commands embedded in AI responses */
  const executeAiActions = (text: string) => {
    // [INSTALL:ModId]
    const installMatches = text.matchAll(/\[INSTALL:([^\]]+)\]/g);
    for (const m of installMatches) {
      ckanIpc.call('mod:install', { identifier: m[1] }).catch(() => {});
    }
    // [UNINSTALL:ModId]
    const uninstallMatches = text.matchAll(/\[UNINSTALL:([^\]]+)\]/g);
    for (const m of uninstallMatches) {
      ckanIpc.call('mod:uninstall', { identifier: m[1] }).catch(() => {});
    }
    // [REFRESH_REPO]
    if (text.includes('[REFRESH_REPO]')) {
      ckanIpc.call('repo:refresh', {}).catch(() => {});
    }
  };

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
              <Download size={12} /> {t('ai.action.install', { modId })}
            </button>
          );
        } else if (match[6]) {
          const modId = match[6];
          parts.push(
            <button
              key={`${keyPrefix}-uninstall-${match.index}`}
              className={styles.installCmd}
              style={{ borderColor: 'rgba(255,80,80,0.4)', color: '#ff7070' }}
              onClick={() => {
                ckanIpc.call('mod:uninstall', { identifier: modId });
              }}
            >
              <Trash2 size={12} /> {t('ai.action.uninstall', { modId })}
            </button>
          );
        } else if (match[7]) {
          const query = match[7];
          parts.push(
            <button
              key={`${keyPrefix}-search-${match.index}`}
              className={styles.installCmd}
              style={{ borderColor: 'rgba(96,205,255,0.4)', color: 'var(--color-accent-primary)' }}
              onClick={() => {
                // Will be handled by parent — for now just visual
              }}
            >
              <Search size={12} /> {t('ai.action.search', { query })}
            </button>
          );
        } else if (match[0] === '[REFRESH_REPO]') {
          parts.push(
            <button
              key={`${keyPrefix}-refresh-${match.index}`}
              className={styles.installCmd}
              style={{ borderColor: 'rgba(108,203,95,0.4)', color: 'var(--color-success, #6ccb5f)' }}
              onClick={() => {
                ckanIpc.call('repo:refresh', {});
              }}
            >
              <RefreshCw size={12} /> {t('ai.action.refreshRepo')}
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
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 320, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
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
        <button className={styles.closeBtn} onClick={onClose} title={t('ai.close')}>
          <X size={16} />
        </button>
      </div>

      {/* Model Selector — always visible */}
      <div className={styles.modelBar}>
        <div className={styles.modelSelect}>
          <label className={styles.modelLabel}>{t('ai.provider')}</label>
          <select
            value={curProvider}
            onChange={(e) => handleProviderChange(e.target.value)}
          >
            <option value="ckan-cloud">{t('ai.ckanCloud')}</option>
            {allProviders.map((p) => (
              <option key={p} value={p}>
                {AI_PROVIDERS[p].label}{getCustomApiKey(p) ? '' : ` ${t('ai.noKey')}`}
              </option>
            ))}
          </select>
        </div>
        {curProvider !== 'ckan-cloud' && (AI_PROVIDERS as Record<string, unknown>)[curProvider] && (
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
                {t('ai.noApiKey')}
              </div>
            )}
          </>
        )}
      </div>

      {/* Messages */}
      <div className={styles.messages}>
        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            className={`${styles.message} ${styles[msg.role]}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className={styles.messageAvatar}>
              {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
            </div>
            <div className={styles.messageContent}>
              <div className={styles.messageText}>{renderMarkdown(msg.content)}</div>
            </div>
          </motion.div>
        ))}

        {isLoading && (
          <motion.div
            className={`${styles.message} ${styles.assistant}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
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

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className={styles.inputArea}>
        <div className={styles.inputWrapper}>
          <textarea
            ref={inputRef}
            className={styles.input}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('ai.askAnything')}
            rows={1}
            disabled={isLoading}
          />
          {isLoading ? (
            <button
              className={styles.stopBtn}
              onClick={handleStop}
              title={t('ai.stop')}
            >
              <Square size={16} />
            </button>
          ) : (
            <button
              className={styles.sendBtn}
              onClick={handleSend}
              disabled={!input.trim()}
            >
              <Send size={16} />
            </button>
          )}
        </div>
        <div className={styles.inputHint}>
          {curProvider === 'ckan-cloud' || !(AI_PROVIDERS as Record<string, unknown>)[curProvider]
            ? `${t('ai.poweredBy')} · ${aiService.getModelName()}`
            : t('ai.using', { provider: AI_PROVIDERS[curProvider].label })}
        </div>
      </div>
    </motion.aside>
  );
}
