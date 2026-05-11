/**
 * Persistent chat message store — survives tab switches.
 * Messages live in module-level state so React component unmount/remount doesn't lose them.
 */

import { t } from './i18n';

export interface ChatMsg {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

const WELCOME: ChatMsg = {
  id: 'welcome',
  role: 'assistant',
  content: t('ai.welcome'),
  timestamp: Date.now(),
};

let _messages: ChatMsg[] = [WELCOME];
const _listeners = new Set<() => void>();

function notify() {
  _listeners.forEach((fn) => fn());
}

// FIX: Use arrow functions to avoid 'this' binding issues with useSyncExternalStore
export const chatStore = {
  get: (): ChatMsg[] => _messages,
  push: (msg: ChatMsg) => {
    _messages = [..._messages, msg];
    notify();
  },
  clear: () => {
    _messages = [WELCOME];
    notify();
  },
  // FIX: Arrow function so 'this' is not needed — useSyncExternalStore passes subscribe as a bare function
  subscribe: (fn: () => void): (() => void) => {
    _listeners.add(fn);
    return () => _listeners.delete(fn);
  },
};
