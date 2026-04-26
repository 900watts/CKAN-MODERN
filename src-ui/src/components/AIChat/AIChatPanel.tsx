import { useState, useRef, useEffect, useSyncExternalStore } from 'react';
import { motion } from 'framer-motion';
import { X, Send, Bot, User, Loader2, Sparkles, Download } from 'lucide-react';
import { aiService, AI_PROVIDERS, hasAnyCustomKey, getConfiguredProviders, getSelectedProvider, setSelectedProvider, getSelectedModel, setSelectedModel, chatWithCustomProvider } from '../../services/ai';
import type { ChatMessage, CustomProvider } from '../../services/ai';
import { chatStore } from '../../services/chatStore';
import type { ChatMsg } from '../../services/chatStore';
import { supabase } from '../../services/supabase';
import ckanIpc from '../../services/ipc';
import styles from './AIChatPanel.module.css';

const DAILY_LIMIT = 20;

interface AIChatPanelProps {
  onClose: () => void;
}

export default function AIChatPanel({ onClose }: AIChatPanelProps) {
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
  const configuredProviders = getConfiguredProviders();
  const showModelBar = hasAnyCustomKey();

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
    if (curProvider !== 'ckan-cloud') {
      setSelectedModel(curProvider, val);
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
      const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[INSTALL:(.+?)\])/g;
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
          <span className={styles.headerTitle}>CKAN AI</span>
          <span className={styles.tierBadge}>{userTier.toUpperCase()}</span>
          {curProvider === 'ckan-cloud' && remainingToday !== null && (
            <span className={styles.pointsBadge}>{remainingToday}/{DAILY_LIMIT}</span>
          )}
        </div>
        <button className={styles.closeBtn} onClick={onClose} title="Close">
          <X size={16} />
        </button>
      </div>

      {/* Model Selector */}
      {showModelBar && (
        <div className={styles.modelBar}>
          <div className={styles.modelSelect}>
            <label className={styles.modelLabel}>Provider</label>
            <select
              value={curProvider}
              onChange={(e) => handleProviderChange(e.target.value)}
            >
              <option value="ckan-cloud">CKAN Cloud</option>
              {configuredProviders.map((p) => (
                <option key={p} value={p}>{AI_PROVIDERS[p].label}</option>
              ))}
            </select>
          </div>
          {curProvider !== 'ckan-cloud' && (
            <div className={styles.modelSelect}>
              <label className={styles.modelLabel}>Model</label>
              <select
                value={curModel}
                onChange={(e) => handleModelChange(e.target.value)}
              >
                {AI_PROVIDERS[curProvider].models.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

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
            placeholder="Ask me anything..."
            rows={1}
            disabled={isLoading}
          />
          <button
            className={styles.sendBtn}
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
          >
            {isLoading ? <Loader2 size={16} className={styles.spin} /> : <Send size={16} />}
          </button>
        </div>
        <div className={styles.inputHint}>
          {curProvider === 'ckan-cloud'
            ? 'Powered by CKAN Cloud · GLM-Z1-9B'
            : `Using ${AI_PROVIDERS[curProvider].label}`}
        </div>
      </div>
    </motion.aside>
  );
}
