import React, { useState, useRef, useEffect, useCallback } from 'react';
import { kerbalStore } from '../KerbalStore';
import { SoulLoader, statsToApiParams } from '../SoulLoader';
import type { KerbalSoul } from '../SoulLoader';
import { timeSystem, getTimeOfDayDescription } from '../TimeSystem';
import { chatViaProvider, EMPTY_RESPONSE } from '../../services/ai';
import { worldContext } from '../WorldContext';
import { MessageRouter } from './MessageRouter';
import type { RoutedMessage, RouteReason } from './MessageRouter';
import type { BanterMessage } from './IdleBanter';
import { KerbalMemory } from '../KerbalMemory';
import { moodSystem } from '../MoodSystem';
import { storyEngine } from '../StoryEngine';
import { buildToolsPrompt, parseToolCalls, executeToolCall, stripToolCalls } from '../AgentSkills';
import type { ProactiveMessage } from '../ProactiveAgent';
import { t } from '../../services/i18n';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MessageRole = 'user' | 'kerbal' | 'system';

interface ChatMessage {
  id: string;
  role: MessageRole;
  senderName: string;            // display name ("You" or Kerbal name)
  kerbalId?: string;             // internal kerbal name (lowercase), only for kerbal messages
  content: string;
  timestamp: number;             // epoch ms
  routeReason?: RouteReason;     // why this kerbal responded (for kerbal messages)
}

export interface ChatResponse {
  kerbalId: string;
  kerbalName: string;
  content: string;
  reason: RouteReason;
}

interface ChatBarProps {
  onMessageSent?: (message: string, responses: ChatResponse[]) => void;
  /** Banter messages from the idle-banter system, displayed as kerbal messages. */
  banterMessages?: BanterMessage[];
  /** Proactive kerbal-initiated messages. */
  proactiveMessages?: ProactiveMessage[];
  /** Called when the user interacts with the chat (typing, clicking, sending). */
  onActivity?: () => void;
  /** Opens the smartphone modal — used for off-shift kerbal routing. */
  onOpenPhone?: () => void;
}

// ---------------------------------------------------------------------------
// Kerbal avatar colour palette
// ---------------------------------------------------------------------------

const KERBAL_COLORS: Record<string, string> = {
  jeb:     '#F27405',   // orange
  bill:    '#2E6B2E',   // green
  bob:     '#4A90D9',   // blue
  valentina: '#C44D8B', // pink
  wernher: '#6C5CE7',   // purple
  gene:    '#D4A017',   // gold
  walt:    '#E17055',   // coral
  mortimer:'#6C7A89',   // grey-blue
  linus:   '#00B894',   // teal
};

const DEFAULT_KERBAL_COLOR = '#718096';

function getKerbalColor(name: string): string {
  return KERBAL_COLORS[name.toLowerCase()] ?? DEFAULT_KERBAL_COLOR;
}

function getKerbalInitial(name: string): string {
  return name.charAt(0).toUpperCase();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let nextId = 1;
function uid(): string {
  return `msg-${Date.now()}-${nextId++}-${Math.random().toString(36).slice(2, 7)}`;
}

/** A trivial markdown-to-HTML conversion for inline messages. */
function renderMarkdown(raw: string): string {
  return raw
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Inline code
    .replace(/`(.+?)`/g, '<code class="bg-gray-700 px-1 rounded text-sm font-mono">$1</code>')
    // Newlines
    .replace(/\n/g, '<br/>');
}

// ---------------------------------------------------------------------------
// localStorage persistence
// ---------------------------------------------------------------------------

const HISTORY_KEY = 'kerbal-control:chat-history';
const MAX_STORED = 100;

function loadHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.slice(-MAX_STORED);
    }
  } catch {}
  return [];
}

function saveHistory(messages: ChatMessage[]): void {
  try {
    const toSave = messages.slice(-MAX_STORED);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(toSave));
  } catch {}
}

// ---------------------------------------------------------------------------
// TypingIndicator
// ---------------------------------------------------------------------------

interface TypingIndicatorProps {
  kerbalName: string;
}

const TypingIndicator: React.FC<TypingIndicatorProps> = ({ kerbalName }) => {
  return (
    <div className="flex items-start gap-3 px-4 py-2 animate-fadeIn">
      {/* Avatar placeholder */}
      <div
        className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-white text-sm font-bold"
        style={{ backgroundColor: getKerbalColor(kerbalName) }}
      >
        {getKerbalInitial(kerbalName)}
      </div>

      {/* Bubble */}
      <div className="bg-[#2A2A2A] rounded-2xl rounded-tl-sm px-4 py-2 max-w-[75%]">
        <p className="text-xs text-gray-400 font-semibold mb-1">{kerbalName}</p>
        <div className="flex gap-1.5 py-1">
          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// MessageBubble
// ---------------------------------------------------------------------------

interface MessageBubbleProps {
  message: ChatMessage;
}

const ROUTE_REASON_LABEL: Record<string, string> = {
  broadcast: 'route.broadcast',
  'unprompted-chime': 'route.chimed',
  'proactive-checkin': 'route.checkin',
  mentioned: 'route.mentioned',
};

const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const isUser = message.role === 'user';
  const isBanter = message.routeReason === 'idle-banter';
  const kerbalColor = isUser
    ? '#4B5563'
    : getKerbalColor(message.senderName);

  const timeStr = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  let bubbleClass = 'bg-[#2A2A2A] rounded-tl-sm';
  if (isUser) {
    bubbleClass = 'bg-[#3A3A3A] rounded-tr-sm';
  } else if (isBanter) {
    bubbleClass = 'bg-[#2A2A35] rounded-tl-sm border-l-2 border-purple-500/30';
  }

  const showRouteBadge = message.routeReason
    && message.routeReason !== 'auto-domain'
    && message.routeReason !== 'idle-banter';
  const routeBadgeKey = message.routeReason ? ROUTE_REASON_LABEL[message.routeReason] : undefined;

  return (
    <div
      className={`flex items-start gap-3 px-4 py-2 ${
        isUser ? 'flex-row-reverse' : ''
      }`}
    >
      {/* Avatar */}
      <div
        className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-white text-sm font-bold"
        style={{ backgroundColor: kerbalColor }}
      >
        {isUser ? 'Y' : getKerbalInitial(message.senderName)}
      </div>

      {/* Bubble */}
      <div
        className={`rounded-2xl px-4 py-2 max-w-[75%] ${bubbleClass}`}
      >
        {/* Sender name + timestamp */}
        <div className={`flex items-center gap-2 mb-1 ${isUser ? 'justify-end' : ''}`}>
          <p
            className="text-xs font-semibold"
            style={{ color: kerbalColor }}
          >
            {isUser ? 'You' : message.senderName}
          </p>
          <span className="text-xs text-gray-500">{timeStr}</span>
          {isBanter && (
            <span className="text-[10px] text-purple-400 italic">
              ({t('banter.tag')})
            </span>
          )}
          {showRouteBadge && routeBadgeKey && (
            <span className="text-[10px] text-gray-600 italic">
              ({t(routeBadgeKey)})
            </span>
          )}
        </div>

        {/* Content */}
        <div
          className="text-sm text-gray-200 leading-relaxed break-words [overflow-wrap:anywhere]"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
        />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// ChatBar
// ---------------------------------------------------------------------------

const ChatBar: React.FC<ChatBarProps> = ({ onMessageSent, banterMessages, proactiveMessages, onActivity, onOpenPhone }) => {
  // ---- State ----------------------------------------------------------
  const [inputValue, setInputValue] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadHistory());
  const [typingKerbals, setTypingKerbals] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);

  // ---- Refs -----------------------------------------------------------
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * Tracks which banter messages have already been added to the chat,
   * keyed by a composite "kerbalName::timestamp" string so duplicates
   * are never injected.
   */
  const seenBanterRef = useRef<Set<string>>(new Set());

  // ---- auto-save to localStorage -------------------------------------
  // Only persist user messages and kerbal responses (not banter or system msgs).

  useEffect(() => {
    const toPersist = messages.filter(
      (m) => m.role === 'user' || m.role === 'kerbal',
    );
    saveHistory(toPersist);
  }, [messages]);

  // ---- clear history -------------------------------------------------

  const clearHistory = useCallback(() => {
    setMessages([]);
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch {}
  }, []);

  // ---- Auto-scroll ----------------------------------------------------
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, typingKerbals, scrollToBottom]);

  // ---- Focus input on mount -------------------------------------------
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // ---- Watch incoming banter messages ---------------------------------

  useEffect(() => {
    if (!banterMessages || banterMessages.length === 0) return;

    // Only append banter messages we haven't seen yet
    for (const bm of banterMessages) {
      const key = `${bm.kerbalName}::${bm.timestamp}`;
      if (seenBanterRef.current.has(key)) continue;
      seenBanterRef.current.add(key);

      const chatMsg: ChatMessage = {
        id: uid(),
        role: 'kerbal',
        senderName: bm.kerbalName,
        kerbalId: bm.kerbalName.toLowerCase(),
        content: bm.content,
        timestamp: bm.timestamp,
        routeReason: 'idle-banter',
      };

      setMessages((prev) => [...prev, chatMsg]);
    }
  }, [banterMessages]);

  // ---- Watch incoming proactive messages ------------------------------

  useEffect(() => {
    if (!proactiveMessages || proactiveMessages.length === 0) return;

    for (const pm of proactiveMessages) {
      const key = `${pm.kerbalName}::${pm.timestamp}`;
      if (seenBanterRef.current.has(key)) continue;
      seenBanterRef.current.add(key);

      const chatMsg: ChatMessage = {
        id: uid(),
        role: 'kerbal',
        senderName: pm.kerbalName,
        kerbalId: pm.kerbalName.toLowerCase(),
        content: pm.content,
        timestamp: pm.timestamp,
        routeReason: 'proactive-checkin',
      };

      setMessages((prev) => [...prev, chatMsg]);
    }
  }, [proactiveMessages]);

  // ---- Helpers --------------------------------------------------------

  /** Mark a Kerbal as currently typing. */
  function setTyping(name: string, active: boolean): void {
    setTypingKerbals((prev) => {
      const next = new Set(prev);
      if (active) {
        next.add(name);
      } else {
        next.delete(name);
      }
      return next;
    });
  }

  function addMessage(msg: ChatMessage): void {
    setMessages((prev) => [...prev, msg]);

    if (msg.role === 'kerbal' && msg.kerbalId) {
      kerbalStore.addToHistory(msg.kerbalId, {
        role: 'assistant',
        content: msg.content,
      });
    }
  }

  function addSystemMessage(key: string, replaceName?: string): void {
    let content = t(key);
    if (replaceName) content = content.replace('{name}', replaceName);
    addMessage({
      id: uid(),
      role: 'system',
      senderName: 'Mission Control',
      content,
      timestamp: Date.now(),
    });
  }

  // ---- Off-shift mention detection ----------------------------------------

  /**
   * Check if the user message mentions an off-shift kerbal by name or
   * @mention. Returns the kerbal's name if found, null otherwise.
   */
  function checkOffShiftMention(input: string): string | null {
    // @mention check
    const atMention = MessageRouter.extractMention(input);
    if (atMention) {
      const allKerbals = kerbalStore.getAll();
      const match = allKerbals.find(
        (k) => k.name.toLowerCase() === atMention.toLowerCase() && !k.present,
      );
      if (match) return match.name;
    }

    // Name mention check
    const lower = input.toLowerCase();
    const present = kerbalStore.getPresent();
    const presentNames = new Set(present.map((k) => k.name.toLowerCase()));
    const allKerbals = kerbalStore.getAll().filter((k) => !presentNames.has(k.name.toLowerCase()));

    for (const k of allKerbals) {
      const nameLower = k.name.toLowerCase();
      if (lower.includes(nameLower)) return k.name;
    }

    return null;
  }

  // ---- Core flow: route -> AI call per Kerbal -> stream -> append -------

  async function processMessage(userText: string): Promise<void> {
    // Check for off-shift kerbal mentions — redirect to phone
    const offShiftMention = checkOffShiftMention(userText);
    if (offShiftMention) {
      addSystemMessage('mc.offShiftPhone', offShiftMention);
      return;
    }

    const presentKerbals = kerbalStore.getAvailable();
    const routed = MessageRouter.route(userText, presentKerbals);

    if (routed.length === 0) {
      addSystemMessage('mc.noKerbals');
      return;
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const responsePromises = routed.map((route) =>
      generateKerbalResponse(route, controller.signal),
    );

    try {
      const responses = await Promise.all(responsePromises);
      const successful = responses.filter(
        (r): r is ChatResponse => r !== null,
      );

      if (onMessageSent && successful.length > 0) {
        onMessageSent(userText, successful);
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // AbortError is expected when navigating away; no recovery needed
      } else {
        console.error('[ChatBar] Failed to generate responses:', err);
        addSystemMessage('mc.signalLost');
      }
    }

    abortControllerRef.current = null;
  }

  /**
   * Generate a Kerbal response for a single RoutedMessage.
   * Loads the soul, builds AI-call messages, streams tokens into a local
   * message, and persists the final content to history.
   */
  async function generateKerbalResponse(
    routed: RoutedMessage,
    signal: AbortSignal,
  ): Promise<ChatResponse | null> {
    const kerbalId = routed.targetKerbal.toLowerCase();
    const kerbalState = kerbalStore.getByName(kerbalId);
    if (!kerbalState) return null;

    // Skip kerbals who are on break (they're away)
    if (kerbalStore.isOnBreak(kerbalState.name)) {
      addMessage({
        id: uid(),
        role: 'system',
        senderName: 'Mission Control',
        content: `${kerbalState.name} ${kerbalState.position === 'bathroom' ? t('mc.awayBathroom') : t('mc.awayLunch')}`,
        timestamp: Date.now(),
      });
      return null;
    }

    setTyping(kerbalState.name, true);

    try {
      // Load the Kerbal's soul
      const soul: KerbalSoul = await SoulLoader.load(kerbalId);

      // Build the conversation messages for the AI call
      const conversationHistory =
        (kerbalStore.getByName(kerbalId)?.conversationHistory ?? []).slice(-6);

      const memoryCtx = KerbalMemory.buildMemoryContext(kerbalState.name);
      const worldCtx = worldContext.buildContextPrompt();
      const moodCtx = moodSystem.buildMoodPrompt(kerbalState.name);
      const storyCtx = storyEngine.buildStoryPrompt(kerbalState.name);
      const toolsCtx = buildToolsPrompt(soul.role);
      const systemPrompt = [
        soul.rawMarkdown,
        moodCtx,
        memoryCtx,
        storyCtx,
        worldCtx,
        toolsCtx,
      ]
        .filter(Boolean)
        .join('\n\n');

      const apiMessages = [
        { role: 'system' as const, content: systemPrompt },
        ...conversationHistory,
        { role: 'user' as const, content: routed.originalMessage },
      ];

      const params = statsToApiParams(soul);
      const result = await chatViaProvider(apiMessages, {
        signal,
        temperature: params.temperature,
        topP: params.topP,
        noSystemPrompt: true,
      });

      let rawReply = (result.reply && result.reply !== EMPTY_RESPONSE) ? result.reply : '...';

      // Execute tool calls if the kerbal used them
      const toolCalls = parseToolCalls(rawReply);
      for (const tc of toolCalls.slice(0, 2)) {
        try {
          const toolResult = await executeToolCall(tc);
          // Feed the tool result back for a final response
          const followUpMessages = [
            { role: 'system' as const, content: `[TOOL RESULT for ${tc.toolName}]: ${toolResult}\n\nNow respond to the user naturally, incorporating this information. Be brief.` },
            { role: 'user' as const, content: routed.originalMessage },
          ];
          const followUp = await chatViaProvider(followUpMessages, {
            signal,
            temperature: params.temperature,
            topP: params.topP,
            noSystemPrompt: true,
          });
          if (followUp.reply && followUp.reply !== EMPTY_RESPONSE) {
            rawReply = stripToolCalls(followUp.reply);
          }
        } catch {
          // Tool failed — continue with original reply (with tool calls stripped)
        }
      }

      const fullContent = stripToolCalls(rawReply) || '...';
      const timestamp = Date.now();

      const kerbalMsg: ChatMessage = {
        id: uid(),
        role: 'kerbal',
        senderName: kerbalState.name,
        kerbalId,
        content: fullContent,
        timestamp,
        routeReason: routed.reason,
      };

      setMessages((prev) => [...prev, kerbalMsg]);

      // Store final content into conversation history
      if (!signal.aborted && fullContent) {
        kerbalStore.addToHistory(kerbalId, {
          role: 'assistant',
          content: fullContent,
        });
      }

      setTyping(kerbalState.name, false);

      // Persist conversation memory + tick mood
      KerbalMemory.addSummary(kerbalState.name, routed.originalMessage, fullContent);
      moodSystem.tickMood(kerbalState.name, 'user_interaction');

      return {
        kerbalId,
        kerbalName: kerbalState.name,
        content: fullContent,
        reason: routed.reason,
      };
    } catch (err: unknown) {
      setTyping(kerbalState.name, false);

      // Re-throw abort errors so upstream can handle them; swallow others
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err;
      }

      console.error(`[ChatBar] Failed to get response from ${kerbalState.name}:`, err);
      addSystemMessage('mc.kerbalCantRespond', kerbalState.name);
      return null;
    }
  }

  // ---- Event handlers -------------------------------------------------

  const handleSubmit = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || isProcessing) return;

    setIsProcessing(true);
    setInputValue('');

    // Notify idle-banter of user activity
    onActivity?.();

    // Add user message to local history
    const userMsg: ChatMessage = {
      id: uid(),
      role: 'user',
      senderName: 'You',
      content: text,
      timestamp: Date.now(),
    };
    addMessage(userMsg);

    // Add the user message to every present Kerbal's conversation history
    // so they all have context of what was said (even if they don't reply)
    const presentKerbals = kerbalStore.getPresent();
    for (const k of presentKerbals) {
      kerbalStore.addToHistory(k.name.toLowerCase(), {
        role: 'user',
        content: text,
      });
    }

    await processMessage(text);
    setIsProcessing(false);

    // Refocus input
    inputRef.current?.focus();
  }, [inputValue, isProcessing, onActivity]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  // ---- Derived state --------------------------------------------------

  /** Time-of-day description used in the subtle header hint. */
  const timeDesc = getTimeOfDayDescription(
    timeSystem.getTime().currentHour,
  );

  // ---- Render ---------------------------------------------------------

  return (
    <div className="flex flex-col h-full bg-[#1A1A1A] text-white">
      {/* =============================================================== */}
      {/* Message history panel                                           */}
      {/* =============================================================== */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent">
        {/* Empty state */}
        {messages.length === 0 && typingKerbals.size === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 select-none px-8">
            <p className="text-lg text-gray-400 font-semibold mb-2">
              {t('mc.emptyChat')}
            </p>
            <p className="text-sm text-center max-w-sm">
              {t('mc.emptyChatDesc')}
            </p>
          </div>
        )}

        {/* Clear history button -- subtle, only visible when there are messages */}
        {messages.length > 0 && (
          <div className="flex justify-end px-4 pt-2 pb-1 group">
            <button
              onClick={clearHistory}
              className="flex items-center gap-1.5 text-gray-600 hover:text-red-400
                         text-xs transition-colors duration-200 opacity-0 group-hover:opacity-100
                         focus:opacity-100 focus:outline-none"
              title={t('mc.clearHistory')}
              aria-label={t('mc.clearHistory')}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-3.5 h-3.5"
              >
                <path
                  fillRule="evenodd"
                  d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.961a.75.75 0 0 0-1.49.078l.33 6.25a.75.75 0 0 0 1.49-.078l-.33-6.25Zm4.33.078a.75.75 0 1 0-1.49.078l.33 6.25a.75.75 0 0 0 1.49-.078l-.33-6.25Z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="hidden sm:inline">{t('mc.clearChat')}</span>
            </button>
          </div>
        )}

        {/* Chat messages */}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}

        {/* Typing indicators */}
        {Array.from(typingKerbals).map((name) => (
          <TypingIndicator key={`typing-${name}`} kerbalName={name} />
        ))}

        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>

      {/* =============================================================== */}
      {/* Input bar -- glassmorphism, Claude-Code-inspired                  */}
      {/* =============================================================== */}
      <div className="flex-shrink-0 border-t border-gray-800 px-4 py-3">
        <div
          className="flex items-center gap-3 bg-white/5 backdrop-blur-md border border-gray-700
                      rounded-2xl px-4 py-3 shadow-lg transition-all duration-200
                      focus-within:border-gray-500 focus-within:bg-white/[0.07]"
        >
          {/* Phone button */}
          {onOpenPhone && (
            <button
              onClick={onOpenPhone}
              type="button"
              className="flex-shrink-0 text-gray-500 hover:text-green-400 transition-colors duration-200"
              title={t('mc.phoneHint')}
              aria-label={t('mc.phoneHint')}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-4 h-4"
              >
                <path d="M11.47 3.841a.75.75 0 0 1 1.06 0l8.69 8.69a.75.75 0 1 0 1.06-1.061l-8.689-8.69a2.25 2.25 0 0 0-3.182 0l-8.69 8.69a.75.75 0 1 0 1.061 1.06l8.69-8.689Z" />
                <path d="m12 5.432 8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 0 1-.75-.75v-4.5a.75.75 0 0 0-.75-.75h-3a.75.75 0 0 0-.75.75V21a.75.75 0 0 1-.75.75H5.625a1.875 1.875 0 0 1-1.875-1.875v-6.198a2.29 2.29 0 0 0 .091-.086L12 5.432Z" />
              </svg>
            </button>
          )}

          {/* Text input */}
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              onActivity?.();
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => onActivity?.()}
            onClick={() => onActivity?.()}
            placeholder={
              isProcessing
                ? t('mc.waitingPlaceholder')
                : t('mc.inputPlaceholder')
            }
            disabled={isProcessing}
            className="flex-1 bg-transparent text-white placeholder-gray-500 text-sm
                       outline-none border-none focus:ring-0 disabled:opacity-50
                       disabled:cursor-not-allowed"
            aria-label={t('mc.messageInput')}
            autoComplete="off"
            spellCheck={false}
          />

          {/* Send button */}
          <button
            onClick={handleSubmit}
            disabled={isProcessing || inputValue.trim().length === 0}
            className={`w-9 h-9 rounded-full flex items-center justify-center
                        transition-all duration-200 flex-shrink-0
                        ${
                          isProcessing || inputValue.trim().length === 0
                            ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                            : 'bg-orange-600 hover:bg-orange-500 active:scale-95 text-white cursor-pointer shadow-md shadow-orange-600/20'
                        }`}
            aria-label={t('mc.sendMessage')}
            title={t('mc.sendHint')}
          >
            {/* Up-arrow / send icon */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-4 h-4"
            >
              <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
            </svg>
          </button>
        </div>

        {/* Subtle hint text */}
        <p className="text-center text-[10px] text-gray-600 mt-2 select-none">
          {t('mc.pressEnter')} &bull; {timeDesc} &bull;{' '}
          {kerbalStore.getPresent().length} {t('mc.kerbalsOnShift')}
        </p>
      </div>

      {/* =============================================================== */}
      {/* Custom animation keyframes (injected once via <style>)           */}
      {/* =============================================================== */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.25s ease-out;
        }

        /* Thin scrollbar for WebKit browsers */
        .scrollbar-thin::-webkit-scrollbar {
          width: 6px;
        }
        .scrollbar-thin::-webkit-scrollbar-track {
          background: transparent;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb {
          background-color: #4B5563;
          border-radius: 3px;
        }
      `}</style>
    </div>
  );
};

export default ChatBar;
