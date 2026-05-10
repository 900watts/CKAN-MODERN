import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { kerbalStore } from '../KerbalStore';
import type { KerbalState } from '../KerbalStore';
import { SoulLoader } from '../SoulLoader';
import type { KerbalSoul } from '../SoulLoader';
import { statsToApiParams } from '../SoulLoader';
import { chatViaProvider, EMPTY_RESPONSE } from '../../services/ai';
import { KerbalMemory } from '../KerbalMemory';
import { moodSystem } from '../MoodSystem';
import { storyEngine } from '../StoryEngine';
import { buildToolsPrompt, parseToolCalls, executeToolCall, stripToolCalls } from '../AgentSkills';
import { t } from '../../services/i18n';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContactThread {
  kerbal: KerbalState;
  messages: ThreadMessage[];
}

export interface ThreadMessage {
  id: string;
  sender: 'user' | string; // string = kerbal name
  content: string;
  timestamp: number;
  isGroggy?: boolean;
}

type ViewMode = 'contacts' | 'thread';

// ---------------------------------------------------------------------------
// localStorage persistence
// ---------------------------------------------------------------------------

const THREADS_KEY = 'kerbal-control:phone-threads';

function loadThreads(): Record<string, ThreadMessage[]> {
  try {
    const raw = localStorage.getItem(THREADS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function saveThreads(threads: Record<string, ThreadMessage[]>): void {
  try {
    localStorage.setItem(THREADS_KEY, JSON.stringify(threads));
  } catch {}
}

// ---------------------------------------------------------------------------
// Helpers — derived from actual KerbalState fields
// ---------------------------------------------------------------------------

type DerivedStatus = 'on-shift' | 'on-break' | 'off-shift';

function deriveStatus(kerbal: KerbalState): DerivedStatus {
  if (!kerbal.present) return 'off-shift';
  if (kerbal.position === 'break' || kerbal.position === 'bathroom' || kerbal.position === 'lunch' || kerbal.position === 'snack') return 'on-break';
  return 'on-shift';
}

function statusColor(status: DerivedStatus): string {
  switch (status) {
    case 'on-shift':
      return 'bg-green-400';
    case 'on-break':
      return 'bg-orange-400';
    case 'off-shift':
      return 'bg-gray-500';
  }
}

function statusText(status: DerivedStatus): string {
  switch (status) {
    case 'on-shift':
      return t('status.onShift');
    case 'on-break':
      return t('status.onBreak');
    case 'off-shift':
      return t('status.offShift');
  }
}

function isOffShift(status: DerivedStatus): boolean {
  return status === 'off-shift';
}

// ---------------------------------------------------------------------------
// SmartphoneModal
// ---------------------------------------------------------------------------

export interface SmartphoneModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SmartphoneModal: React.FC<SmartphoneModalProps> = ({ isOpen, onClose }) => {
  const [visible, setVisible] = useState(false);
  const [view, setView] = useState<ViewMode>('contacts');
  const [activeKerbal, setActiveKerbal] = useState<KerbalState | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isSummoning, setIsSummoning] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [summonError, setSummonError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (view === 'thread') {
      inputRef.current?.focus();
    }
  }, [view]);

  // Sync external isOpen → internal visible for mount animation
  useEffect(() => {
    if (isOpen) {
      setVisible(true);
    } else {
      setVisible(false);
    }
  }, [isOpen]);

  // Reset state when fully closed
  useEffect(() => {
    if (!isOpen && !visible) {
      setView('contacts');
      setActiveKerbal(null);
      setMessages([]);
      setInputValue('');
      setIsSummoning(false);
      setIsGenerating(false);
      setSummonError(null);
    }
  }, [isOpen, visible]);

  const handleClose = useCallback(() => {
    setVisible(false);
  }, []);

  const handleExitComplete = useCallback(() => {
    if (!visible) onClose();
  }, [visible, onClose]);

  const sendMessage = useCallback(async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || !activeKerbal) return;

    const userMsg: ThreadMessage = {
      id: `msg-${Date.now()}-user`,
      sender: 'user',
      content: trimmed,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    setSummonError(null);

    const status = deriveStatus(activeKerbal);

    // ---- Off-shift: wake-up delay + groggy AI response ----
    if (isOffShift(status)) {
      setIsSummoning(true);

      // 30% chance of no response (deep asleep)
      if (Math.random() < 0.3) {
        await new Promise((resolve) => setTimeout(resolve, 15_000));
        setSummonError(t('mc.noResponse'));
        setIsSummoning(false);
        return;
      }

      // Simulate wake-up time: 5-10 seconds
      const wakeDelay = 5000 + Math.random() * 5000;
      await new Promise((resolve) => setTimeout(resolve, wakeDelay));

      try {
        const soul: KerbalSoul = await SoulLoader.load(
          activeKerbal.name.toLowerCase(),
        );
        const params = statsToApiParams(soul);

        const memoryCtx = KerbalMemory.buildMemoryContext(activeKerbal.name);

        const messages = [
          {
            role: 'system' as const,
            content: `[GROGGY - just woke up]\n\n${soul.rawMarkdown}${memoryCtx}`,
          },
          { role: 'user' as const, content: trimmed },
        ];

        const result = await chatViaProvider(messages, {
          temperature: params.temperature,
          topP: params.topP,
        });

        const kerbalMsg: ThreadMessage = {
          id: `msg-${Date.now()}-${activeKerbal.name}`,
          sender: activeKerbal.name,
          content: (result.reply && result.reply !== EMPTY_RESPONSE) ? result.reply : `*${activeKerbal.name} ${t('mc.mumbles')}*`,
          timestamp: Date.now(),
          isGroggy: true,
        };
        setMessages((prev) => [...prev, kerbalMsg]);

        KerbalMemory.addSummary(activeKerbal.name, trimmed, result.reply);
      } catch (err: unknown) {
        setSummonError(
          err instanceof Error ? err.message : 'No response.',
        );
      } finally {
        setIsSummoning(false);
      }
      return;
    }

    // ---- On-shift / On-break: real AI call with typing indicator ----
    setIsGenerating(true);
    try {
      const soul: KerbalSoul = await SoulLoader.load(
        activeKerbal.name.toLowerCase(),
      );
      const params = statsToApiParams(soul);

      const memoryCtx = KerbalMemory.buildMemoryContext(activeKerbal.name);
      const moodCtx = moodSystem.buildMoodPrompt(activeKerbal.name);
      const storyCtx = storyEngine.buildStoryPrompt(activeKerbal.name);
      const toolsCtx = buildToolsPrompt(soul.role);
      const systemPrompt = [soul.rawMarkdown, moodCtx, memoryCtx, storyCtx, toolsCtx].filter(Boolean).join('\n\n');

      const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: trimmed },
      ];

      const result = await chatViaProvider(messages, {
        temperature: params.temperature,
        topP: params.topP,
      });

      let reply = (result.reply && result.reply !== EMPTY_RESPONSE) ? result.reply : `*${activeKerbal.name} ${t('mc.stares')}*`;
      const toolCalls = parseToolCalls(reply);
      for (const tc of toolCalls.slice(0, 2)) {
        try {
          const toolResult = await executeToolCall(tc);
          const followUpMessages = [
            { role: 'system' as const, content: `[TOOL RESULT for ${tc.toolName}]: ${toolResult}\n\nRespond naturally.` },
            { role: 'user' as const, content: trimmed },
          ];
          const followUp = await chatViaProvider(followUpMessages, { temperature: params.temperature, topP: params.topP });
          if (followUp.reply && followUp.reply !== EMPTY_RESPONSE) reply = stripToolCalls(followUp.reply);
        } catch {}
      }
      const finalContent = stripToolCalls(reply);

      const kerbalMsg: ThreadMessage = {
        id: `msg-${Date.now()}-${activeKerbal.name}`,
        sender: activeKerbal.name,
        content: finalContent,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, kerbalMsg]);

      KerbalMemory.addSummary(activeKerbal.name, trimmed, result.reply);
      moodSystem.tickMood(activeKerbal.name, 'user_interaction');
    } catch (err: unknown) {
      console.error(
        `[SmartphoneModal] AI call failed for ${activeKerbal.name}:`,
        err,
      );
      // Fall back to echo behavior if AI call fails
      const kerbalMsg: ThreadMessage = {
        id: `msg-${Date.now()}-${activeKerbal.name}`,
        sender: activeKerbal.name,
        content: `*${activeKerbal.name} ${t('mc.stares')}*`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, kerbalMsg]);
    } finally {
      setIsGenerating(false);
    }
  }, [inputValue, activeKerbal]);

  const openThread = useCallback((kerbal: KerbalState) => {
    setActiveKerbal(kerbal);
    const saved = loadThreads();
    setMessages(saved[kerbal.name] ?? []);
    setView('thread');
    setInputValue('');
    setIsSummoning(false);
    setIsGenerating(false);
    setSummonError(null);
  }, []);

  // Save thread messages to localStorage whenever they change
  useEffect(() => {
    if (!activeKerbal || view !== 'thread') return;
    const saved = loadThreads();
    saved[activeKerbal.name] = messages;
    saveThreads(saved);
  }, [messages, activeKerbal, view]);

  const backToContacts = useCallback(() => {
    setView('contacts');
    setActiveKerbal(null);
    setMessages([]);
    setInputValue('');
    setIsSummoning(false);
    setIsGenerating(false);
    setSummonError(null);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage],
  );

  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    if (isOpen) window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [isOpen, handleClose]);

  if (!isOpen && !visible) return null;

  return (
    <AnimatePresence onExitComplete={handleExitComplete}>
      {visible && (
        <div
          className="fixed inset-0 z-50 bg-black/30"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose();
          }}
        >
          {/* Phone body — slides up from bottom-right like GTA */}
          <motion.div
            key="smartphone"
            className="absolute right-6 bottom-0 w-[240px] h-[420px] bg-zinc-800 rounded-[2.5rem] border-[3px] border-zinc-600 shadow-2xl overflow-hidden flex flex-col"
            initial={{ y: '105%' }}
            animate={{ y: 0 }}
            exit={{ y: '105%' }}
            transition={{
              type: 'spring',
              damping: 28,
              stiffness: 350,
              mass: 0.8,
            }}
          >
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-5 bg-zinc-900 rounded-b-xl z-10 flex items-center justify-center gap-1 pointer-events-none">
          <div className="w-2 h-2 rounded-full bg-zinc-950 ring-1 ring-zinc-600" />
        </div>

        {/* Screen — single scrollable surface, fully rounded inside */}
        <div className="flex-1 flex flex-col bg-zinc-950 text-white rounded-[2.2rem] overflow-hidden pt-8">
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800/60 shrink-0">
            {view === 'thread' ? (
              <button
                type="button"
                className="text-blue-400 hover:text-blue-300 text-sm leading-none shrink-0 w-6 h-6 flex items-center justify-center"
                onClick={backToContacts}
                aria-label="Back to contacts"
              >
                &#8592;
              </button>
            ) : (
              <div className="w-6 shrink-0" />
            )}
            <h2 className="text-sm font-semibold flex-1 truncate text-center">
              {view === 'contacts' ? t('mc.contacts') : activeKerbal?.name ?? 'Chat'}
            </h2>
            <button
              type="button"
              className="text-zinc-400 hover:text-white text-sm leading-none shrink-0 w-6 h-6 flex items-center justify-center"
              onClick={handleClose}
              aria-label="Close"
            >
              &#10005;
            </button>
          </div>

          {/* Body area */}
          <div className="flex-1 flex flex-col min-h-0">
            {view === 'contacts' ? (
              <ul className="flex-1 overflow-y-auto divide-y divide-zinc-800/50 overscroll-contain [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-700 [&::-webkit-scrollbar-track]:bg-transparent">
                {kerbalStore.getAll().map((k) => {
                  const s = deriveStatus(k);
                  return (
                    <li
                      key={k.name}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/60 cursor-pointer transition-colors"
                      onClick={() => openThread(k)}
                    >
                      <span
                        className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${statusColor(s)}`}
                      />
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-xs block truncate">
                          {k.name}
                        </span>
                        <p className="text-[10px] text-zinc-500 mt-0.5">
                          {statusText(s)}
                        </p>
                      </div>
                      <span className="text-zinc-600 text-sm">&#8250;</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <>
                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 min-h-0 overscroll-contain [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-700 [&::-webkit-scrollbar-track]:bg-transparent">
                  {messages.length === 0 && !isSummoning && !isGenerating && (
                    <p className="text-center text-[10px] text-zinc-600 mt-8 px-2">
                      {t('mc.startConversation')} {activeKerbal?.name}
                    </p>
                  )}

                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${
                        msg.sender === 'user' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <div
                        className={`max-w-[80%] px-2.5 py-1.5 rounded-2xl text-xs leading-snug ${
                          msg.sender === 'user'
                            ? 'bg-blue-600 text-white rounded-br-md'
                            : msg.isGroggy
                              ? 'bg-zinc-800 text-zinc-300 rounded-bl-md italic'
                              : 'bg-zinc-800 text-zinc-300 rounded-bl-md'
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">
                          {msg.content}
                        </p>
                        <span
                          className={`block text-[9px] mt-0.5 ${
                            msg.sender === 'user'
                              ? 'text-blue-200 text-right'
                              : 'text-zinc-500 text-right'
                          }`}
                        >
                          {new Date(msg.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>
                  ))}

                  {isSummoning && (
                    <div className="flex justify-start">
                      <div className="bg-zinc-800 text-zinc-400 text-[10px] px-3 py-1.5 rounded-2xl rounded-bl-md animate-pulse italic">
                        {t('mc.waking')} {activeKerbal?.name}...
                      </div>
                    </div>
                  )}

                  {isGenerating && (
                    <div className="flex justify-start">
                      <div className="bg-zinc-800 text-zinc-400 text-[10px] px-3 py-1.5 rounded-2xl rounded-bl-md animate-pulse italic">
                        {activeKerbal?.name} {t('mc.typing')}
                      </div>
                    </div>
                  )}

                  {summonError && (
                    <div className="flex justify-center px-2">
                      <div className="bg-red-900/50 text-red-300 text-[10px] px-2 py-1 rounded-lg text-center">
                        {summonError}
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div className="border-t border-zinc-800/60 px-3 py-2 flex gap-2 items-center shrink-0">
                  <input
                    ref={inputRef}
                    type="text"
                    className="flex-1 min-w-0 bg-zinc-800 text-white text-xs rounded-full px-3 py-1.5 outline-none placeholder-zinc-500 focus:ring-1 focus:ring-inset focus:ring-blue-500"
                    placeholder={
                      (() => {
                        if (isSummoning) return t('mc.waitingPlaceholder');
                        if (isGenerating) return `${activeKerbal?.name} ${t('mc.thinking')}`;
                        return `${t('mc.messageThem')} ${activeKerbal?.name}...`;
                      })()
                    }
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isSummoning || isGenerating}
                  />
                  <button
                    type="button"
                    className="flex-shrink-0 w-7 h-7 bg-blue-600 text-white rounded-full flex items-center justify-center hover:bg-blue-500 disabled:opacity-40 transition-colors"
                    onClick={sendMessage}
                    disabled={isSummoning || isGenerating || !inputValue.trim()}
                    aria-label="Send"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 12h14m0 0l-6-6m6 6l-6 6"
                      />
                    </svg>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default SmartphoneModal;
