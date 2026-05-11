/**
 * KerbalStore — Central state management for all Kerbals.
 *
 * Uses a module-level subscribe pattern (NOT React state) so that
 * any part of the application can read or subscribe to Kerbal
 * presence, mood, conversation history, and shift assignments.
 *
 * Pattern mirrors downloadStore.ts — plain objects, subscribers list,
 * no framework dependency.
 */

import type { ShiftType } from './TimeSystem';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KerbalState {
  name: string;
  /** Whether this Kerbal is currently on shift and in the room. */
  present: boolean;
  /** Physical location / status of the Kerbal. */
  position: 'desk' | 'coffee' | 'break' | 'offshift' | 'entering' | 'leaving' | 'bathroom' | 'lunch' | 'snack';
  /** Current emotional state. */
  mood: 'normal' | 'tired' | 'annoyed' | 'excited' | 'groggy' | 'ecstatic' | 'anxious';
  /** Optional mood intensity 0-1 for animation/UI hints. */
  moodIntensity?: number;
  /** Timestamp of the last AI response (ms since epoch), or null. */
  lastResponseTime: number | null;
  /** Rolling conversation history with this Kerbal. */
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Timestamp when the kerbal will return from a break, or null. */
  returnFromBreakAt?: number | null;
}

export interface ShiftAssignment {
  kerbalName: string;
  shift: ShiftType;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_DAY_SHIFT: string[] = ['Gene', 'Valentina', 'Bill', 'Wernher', 'Walt'];
const DEFAULT_NIGHT_SHIFT: string[] = ['Jebediah', 'Bob', 'Linus', 'Mortimer'];

function buildDefaultAssignments(): ShiftAssignment[] {
  return [
    ...DEFAULT_DAY_SHIFT.map((name): ShiftAssignment => ({ kerbalName: name, shift: 'day' })),
    ...DEFAULT_NIGHT_SHIFT.map((name): ShiftAssignment => ({ kerbalName: name, shift: 'night' })),
  ];
}

const ALL_KERBAL_NAMES = [
  'Gene',
  'Valentina',
  'Bill',
  'Bob',
  'Jebediah',
  'Wernher',
  'Linus',
  'Walt',
  'Mortimer',
];

function defaultKerbalState(name: string): KerbalState {
  return {
    name,
    present: false,
    position: 'offshift',
    mood: 'normal',
    lastResponseTime: null,
    conversationHistory: [],
  };
}

// ---------------------------------------------------------------------------
// Store state & subscribers
// ---------------------------------------------------------------------------

const LOCAL_STORAGE_KEY = 'kerbal-shift-assignments';

let kerbals: KerbalState[] = ALL_KERBAL_NAMES.map(defaultKerbalState);
let shiftAssignments: ShiftAssignment[] = loadShiftAssignments();
let subscribers: Array<() => void> = [];

function loadShiftAssignments(): ShiftAssignment[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ShiftAssignment[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // Corrupted data — fall back to defaults
  }
  return buildDefaultAssignments();
}

function notify(): void {
  // Copy the list before iterating — subscribers may unsubscribe mid-loop.
  for (const fn of [...subscribers]) {
    try {
      fn();
    } catch {
      // Swallow subscriber errors to prevent one bad listener from
      // breaking the whole notification chain.
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const kerbalStore = {
  /** Returns a snapshot of all Kerbal state objects. */
  getAll(): KerbalState[] {
    return kerbals;
  },

  /** Returns only Kerbals currently marked as present. */
  getPresent(): KerbalState[] {
    return kerbals.filter((k) => k.present);
  },

  /** Looks up a single Kerbal by name (case-insensitive). */
  getByName(name: string): KerbalState | undefined {
    const lower = name.toLowerCase();
    return kerbals.find((k) => k.name.toLowerCase() === lower);
  },

  /** Merges a partial update into the named Kerbal's state. */
  updateKerbal(name: string, patch: Partial<KerbalState>): void {
    kerbals = kerbals.map((k) => (k.name === name ? { ...k, ...patch } : k));
    notify();
  },

  /** Appends a message to the named Kerbal's conversation history. */
  addToHistory(name: string, message: { role: 'user' | 'assistant'; content: string }): void {
    kerbals = kerbals.map((k) =>
      k.name === name
        ? { ...k, conversationHistory: [...k.conversationHistory, message] }
        : k,
    );
    notify();
  },

  /** Returns the current shift assignments. */
  getShiftAssignments(): ShiftAssignment[] {
    return shiftAssignments;
  },

  /**
   * Replaces shift assignments and persists them to localStorage.
   * Fires subscriber notifications so the UI can react.
   */
  setShiftAssignments(assignments: ShiftAssignment[]): void {
    shiftAssignments = assignments;
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(assignments));
    } catch {
      // Storage full or unavailable — assignments are still in memory.
    }
    notify();
  },

  /** Sets which Kerbals are present (all others marked absent). */
  setPresentKerbals(names: string[]): void {
    // Safety: never clear ALL kerbals — indicates corrupted data
    if (!names || names.length === 0) {
      console.warn('[KerbalStore] Refusing to clear all kerbals — keeping current presence');
      return;
    }
    const nameSet = new Set(names);
    kerbals = kerbals.map((k) => ({ ...k, present: nameSet.has(k.name) }));
    notify();
  },

  /** Returns shift assignments grouped by shift type. Falls back to defaults if empty. */
  getShiftAssignmentsByShift(): { day: string[]; night: string[] } {
    const day: string[] = [];
    const night: string[] = [];
    for (const a of shiftAssignments) {
      if (a.shift === 'day') day.push(a.kerbalName);
      else night.push(a.kerbalName);
    }
    // Fallback to defaults if either shift is empty (corrupted data)
    if (day.length === 0) day.push(...DEFAULT_DAY_SHIFT);
    if (night.length === 0) night.push(...DEFAULT_NIGHT_SHIFT);
    return { day, night };
  },

  /** Returns true if the kerbal is currently away on a rest break. */
  isOnBreak(name: string): boolean {
    const k = kerbals.find((k) => k.name === name);
    if (!k) return false;
    return (
      (k.position === 'break' || k.position === 'bathroom' || k.position === 'lunch' || k.position === 'snack') &&
      typeof k.returnFromBreakAt === 'number' &&
      k.returnFromBreakAt > Date.now()
    );
  },

  /** Returns ms until the kerbal returns from break, or 0 if not on break. */
  breakRemaining(name: string): number {
    const k = kerbals.find((k) => k.name === name);
    if (!k || typeof k.returnFromBreakAt !== 'number') return 0;
    return Math.max(0, k.returnFromBreakAt - Date.now());
  },

  /** Send a kerbal on a rest break for `durationMs` milliseconds. */
  goOnBreak(name: string, position: KerbalState['position'], durationMs: number): void {
    kerbals = kerbals.map((k) =>
      k.name === name
        ? { ...k, position, returnFromBreakAt: Date.now() + durationMs }
        : k,
    );
    notify();
  },

  /** Bring a kerbal back from break to their desk. */
  returnFromBreak(name: string): void {
    kerbals = kerbals.map((k) =>
      k.name === name
        ? { ...k, position: 'desk' as const, returnFromBreakAt: null }
        : k,
    );
    notify();
  },

  /** Returns only present kerbals who are NOT currently on break. */
  getAvailable(): KerbalState[] {
    return kerbals.filter((k) => k.present && !this.isOnBreak(k.name));
  },

  subscribe(fn: () => void): () => void {
    subscribers.push(fn);
    return () => {
      subscribers = subscribers.filter((s) => s !== fn);
    };
  },
};
