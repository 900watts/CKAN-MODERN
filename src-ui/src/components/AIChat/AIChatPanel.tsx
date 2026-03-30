import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Bot, User, Loader2, Sparkles, Zap, Package, Download } from 'lucide-react';
import { aiService } from '../../services/ai';
import { creditsService } from '../../services/credits';
import type { ChatMessage } from '../../services/ai';
import type { CreditsState } from '../../services/credits';
import { registryService } from '../../services/registry';
import { downloadManager } from '../../services/downloads';
import type { CkanModule } from '../../services/registry';
import styles from './AIChatPanel.module.css';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

interface AIChatPanelProps {
  onClose: () => void;
}

/* ─── Markdown Renderer ─── */
function parseInline(text: string, key: number): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    if (match[2]) parts.push(<strong key={`${key}-b-${i++}`}>{match[2]}</strong>);
    else if (match[3]) parts.push(<em key={`${key}-i-${i++}`}>{match[3]}</em>);
    else if (match[4]) parts.push(<code key={`${key}-c-${i++}`} className={styles.inlineCode}>{match[4]}</code>);
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

function MarkdownText({ content }: { content: string }) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let blockCode = false;
  let blockLines: string[] = [];

  const flushList = (idx: number) => {
    if (listItems.length > 0) {
      elements.push(<ul key={`ul-${idx}`} className={styles.mdList}>{listItems}</ul>);
      listItems = [];
    }
  };

  lines.forEach((line, i) => {
    if (line.startsWith('```')) {
      if (!blockCode) { blockCode = true; blockLines = []; }
      else {
        flushList(i);
        elements.push(<pre key={`code-${i}`} className={styles.codeBlock}><code>{blockLines.join('\n')}</code></pre>);
        blockCode = false;
      }
      return;
    }
    if (blockCode) { blockLines.push(line); return; }

    if (line.match(/^[-•]\s/)) {
      listItems.push(<li key={i}>{parseInline(line.slice(2), i)}</li>);
    } else if (line.match(/^#{1,3}\s/)) {
      flushList(i);
      elements.push(<p key={i} className={styles.mdHeading}>{parseInline(line.replace(/^#{1,3}\s/, ''), i)}</p>);
    } else {
      flushList(i);
      if (line.trim()) elements.push(<p key={i} className={styles.mdPara}>{parseInline(line, i)}</p>);
    }
  });
  flushList(lines.length);

  return <div className={styles.markdown}>{elements}</div>;
}

/* ─── Mod Chips ─── */
function extractModChips(text: string): CkanModule[] {
  const seen = new Set<string>();
  const mods: CkanModule[] = [];
  // Match backtick-wrapped words that could be identifiers
  for (const [, id] of text.matchAll(/`([A-Za-z][A-Za-z0-9_-]{2,})`/g)) {
    if (!seen.has(id)) {
      seen.add(id);
      const mod = registryService.getModById(id);
      if (mod) mods.push(mod);
    }
  }
  return mods;
}

function ModChip({ mod }: { mod: CkanModule }) {
  const [installed, setInstalled] = useState(registryService.isInstalled(mod.identifier));
  const [busy, setBusy] = useState(false);

  const handleInstall = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      if (installed) {
        await downloadManager.uninstall(mod.identifier);
        registryService.uninstall(mod.identifier);
        setInstalled(false);
      } else {
        registryService.install(mod.identifier);
        await downloadManager.install(mod);
        setInstalled(true);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.modChip}>
      <Package size={11} />
      <span className={styles.modChipName}>{mod.name}</span>
      <button
        className={`${styles.modChipBtn} ${installed ? styles.modChipBtnInstalled : ''}`}
        onClick={handleInstall}
        disabled={busy}
      >
        {busy ? <Loader2 size={10} className={styles.spin} /> : installed ? 'Installed' : <><Download size={10} /> Install</>}
      </button>
    </div>
  );
}

export default function AIChatPanel({ onClose }: AIChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: "Hi! I'm your CKAN AI assistant. I can help you find mods, install them, explain what they do, and more. What would you like to do?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [credits, setCredits] = useState<CreditsState>(creditsService.getState());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Subscribe to live credit balance
  useEffect(() => {
    return creditsService.onChange(setCredits);
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      if (!aiService.isConfigured()) {
        throw new Error('Silicon Flow API key not configured. Go to Settings > Silicon Flow to add your key.');
      }

      // Deduct 1 credit; returns false if already out (degraded mode = shorter response)
      const hadCredits = await creditsService.deduct();

      const chatHistory: ChatMessage[] = messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
      chatHistory.push({ role: 'user', content: userMessage.content });

      const response = await aiService.chat(chatHistory, {
        maxTokens: hadCredits ? 1024 : 300,
      });

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.reply,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Sorry, I ran into an issue: ${err instanceof Error ? err.message : 'Unknown error'}. Please try again.`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
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

  const balanceLabel = credits.loaded
    ? credits.degraded
      ? 'Out of credits'
      : `${credits.balance} credits`
    : null;

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
          {balanceLabel && (
            <span className={`${styles.creditsBadge} ${credits.degraded ? styles.creditsBadgeDepleted : ''}`}>
              {balanceLabel}
            </span>
          )}
        </div>
        <button className={styles.closeBtn} onClick={onClose} title="Close">
          <X size={16} />
        </button>
      </div>

      {/* Degraded mode banner */}
      <AnimatePresence>
        {credits.degraded && (
          <motion.div
            className={styles.degradedBanner}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Zap size={12} />
            <span>
              Credits used up — responses are shorter until reset
              {creditsService.timeUntilReset() ? ` in ${creditsService.timeUntilReset()}` : ''}.
            </span>
          </motion.div>
        )}
      </AnimatePresence>

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
              {msg.role === 'user'
                ? <div className={styles.messageText}>{msg.content}</div>
                : <>
                    <div className={`${styles.messageText} ${styles.messageTextAssistant}`}>
                      <MarkdownText content={msg.content} />
                    </div>
                    {extractModChips(msg.content).length > 0 && (
                      <div className={styles.modChips}>
                        {extractModChips(msg.content).map((mod) => (
                          <ModChip key={mod.identifier} mod={mod} />
                        ))}
                      </div>
                    )}
                  </>
              }
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
          Powered by Silicon Flow · GLM-Z1-9B (Free)
        </div>
      </div>
    </motion.aside>
  );
}
