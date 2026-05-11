/**
 * TimeSystem — Manages the in-game clock and determines which Kerbals
 * should be present based on the current shift.
 *
 * Uses a module-level subscribe pattern. Ticks every 10 real-world seconds
 * and notifies all subscribers of the updated time state.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ShiftType = 'day' | 'night';

export interface TimeState {
  /** Current hour in 24-hour format (0-23). */
  currentHour: number;
  /** Current minute (0-59). */
  currentMinute: number;
  /** Which shift is active right now. */
  shiftType: ShiftType;
  /** True during shift-change transition windows. */
  isShiftChange: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Day shift runs from 06:00 to 18:00. */
const DAY_SHIFT_START = 6;
const DAY_SHIFT_END = 18;

/**
 * Shift-change transition windows (in minutes from midnight).
 * Kerbals enter/leave during these 30-minute windows.
 */
const SHIFT_CHANGE_MORNING_START = 5 * 60 + 45;   // 05:45
const SHIFT_CHANGE_MORNING_END = 6 * 60 + 15;     // 06:15
const SHIFT_CHANGE_EVENING_START = 17 * 60 + 45;  // 17:45
const SHIFT_CHANGE_EVENING_END = 18 * 60 + 15;    // 18:15

/** Tick interval in milliseconds (10 seconds real time). */
const TICK_INTERVAL_MS = 10_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import { t } from '../services/i18n';

/**
 * Returns a human-readable description of the time of day.
 */
export function getTimeOfDayDescription(hour: number): string {
  if (hour >= 5 && hour < 7) return t('time.earlyMorning');
  if (hour >= 7 && hour < 12) return t('time.morning');
  if (hour >= 12 && hour < 14) return t('time.earlyAfternoon');
  if (hour >= 14 && hour < 17) return t('time.afternoon');
  if (hour >= 17 && hour < 19) return t('time.evening');
  if (hour >= 19 && hour < 22) return t('time.night');
  if (hour >= 22 || hour < 4) return t('time.lateNight');
  return t('time.preDawn');
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

let intervalId: ReturnType<typeof setInterval> | null = null;
let subscribers: Array<() => void> = [];

function computeTimeState(): TimeState {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const totalMinutes = hour * 60 + minute;

  const shiftType: ShiftType =
    hour >= DAY_SHIFT_START && hour < DAY_SHIFT_END ? 'day' : 'night';

  const isShiftChange =
    (totalMinutes >= SHIFT_CHANGE_MORNING_START && totalMinutes <= SHIFT_CHANGE_MORNING_END) ||
    (totalMinutes >= SHIFT_CHANGE_EVENING_START && totalMinutes <= SHIFT_CHANGE_EVENING_END);

  return { currentHour: hour, currentMinute: minute, shiftType, isShiftChange };
}

let currentState: TimeState = computeTimeState();

function tick(): void {
  currentState = computeTimeState();

  // Copy subscribers before iterating to handle mid-loop unsubscribes.
  for (const fn of [...subscribers]) {
    try {
      fn();
    } catch {
      // Swallow errors to keep the clock running.
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const timeSystem = {
  /** Returns a snapshot of the current in-game time state. */
  getTime(): TimeState {
    return currentState;
  },

  /** True if the given hour falls within the day shift (06:00-17:59). */
  isDayShift(hour: number): boolean {
    return hour >= DAY_SHIFT_START && hour < DAY_SHIFT_END;
  },

  /** Returns the currently active shift type. */
  getCurrentShift(): ShiftType {
    return currentState.shiftType;
  },

  /** True if the current time is within a shift-change transition window. */
  isShiftChange(): boolean {
    return currentState.isShiftChange;
  },

  /**
   * Registers a callback to be invoked on every tick (every 10 seconds).
   * Returns an unsubscribe function.
   *
   * Usage in React:
   *   useEffect(() => TimeSystem.subscribe(() => setTime(TimeSystem.getTime())), []);
   */
  subscribe(fn: () => void): () => void {
    subscribers.push(fn);
    return () => {
      subscribers = subscribers.filter((s) => s !== fn);
    };
  },

  /**
   * Starts the time tick interval. Safe to call multiple times —
   * only one interval will be running.
   */
  start(): void {
    if (intervalId !== null) return; // already running
    intervalId = setInterval(tick, TICK_INTERVAL_MS);
  },

  /**
   * Stops the time tick interval. Safe to call even if not running.
   */
  stop(): void {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  },
};
