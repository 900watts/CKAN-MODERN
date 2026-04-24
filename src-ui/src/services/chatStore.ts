/**
 * Chat Store Service
 *
 * Persists AI chat messages in sessionStorage so they survive
 * page navigation and component remounts during a session.
 */

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

const STORAGE_KEY = 'ckan_ai_chat';

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content: "Hi! I'm your CKAN AI assistant. I can help you find mods, explain dependencies, and recommend mod packs.\n\nSign in (Settings > Account) to start chatting. Free tier: 20 messages/day.",
  timestamp: new Date().toISOString(),
};

class ChatStore {
  private messages: ChatMessage[] = [];
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.load();
    this._snapshot = [...this.messages];
  }

  private load() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        this.messages = JSON.parse(raw);
      }
    } catch {
      // ignore
    }
    if (this.messages.length === 0) {
      this.messages = [WELCOME_MESSAGE];
    }
  }

  private save() {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this.messages));
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private notify() {
    this.save();
    for (const fn of this.listeners) fn();
  }

  // Snapshot for useSyncExternalStore — must be a new reference when data changes
  private _snapshot: ChatMessage[] = [];

  getMessages(): ChatMessage[] {
    return this._snapshot;
  }

  addMessage(msg: ChatMessage) {
    this.messages.push(msg);
    this._snapshot = [...this.messages];
    this.notify();
  }

  clear() {
    this.messages = [WELCOME_MESSAGE];
    this._snapshot = [...this.messages];
    this.notify();
  }
}

export const chatStore = new ChatStore();
export default chatStore;
