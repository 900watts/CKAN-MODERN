/**
 * Persistent chat message store — survives tab switches.
 * Messages live in module-level state so React component unmount/remount doesn't lose them.
 */

export interface ChatMsg {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

const WELCOME: ChatMsg = {
  id: 'welcome',
  role: 'assistant',
  content:
    "Hi! I'm your CKAN AI assistant. I can help you find mods, explain dependencies, and recommend mod packs.\n\nSign in (Settings > Account) to start chatting. Free tier: 20 messages/day.",
  timestamp: Date.now(),
};

let _messages: ChatMsg[] = [WELCOME];
const _listeners = new Set<() => void>();

function notify() {
  _listeners.forEach((fn) => fn());
}

export const chatStore = {
  get(): ChatMsg[] {
    return _messages;
  },
  push(msg: ChatMsg) {
    _messages = [..._messages, msg];
    notify();
  },
  clear() {
    _messages = [WELCOME];
    notify();
  },
  subscribe(fn: () => void): () => void {
    _listeners.add(fn);
    return () => _listeners.delete(fn);
  },
};
