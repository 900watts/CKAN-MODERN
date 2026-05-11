/**
 * WorldContext — Singleton that collects real-world context about the user
 * and application state. Feeds into AI system prompts so kerbals can break
 * the 4th wall and react to what the user is actually doing.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorldContextSnapshot {
  windowFocused: boolean;
  focusChangedAt: number;
  focusAwayDuration: number;
  currentPage: string;
  currentPageDuration: number;
  userIdleMs: number;
  systemTime: { hour: number; minute: number; weekday: number };
  sessionStartTime: number;
  recentActions: string[];
  lastError: { message: string; timestamp: number } | null;
}

type ContextListener = () => void;

// ---------------------------------------------------------------------------
// WorldContext
// ---------------------------------------------------------------------------

class WorldContext {
  private windowFocused = true;
  private focusChangedAt = Date.now();
  private currentPage = 'available';
  private pageEnteredAt = Date.now();
  private lastActivityTime = Date.now();
  private sessionStartTime = Date.now();
  private recentActions: string[] = [];
  private lastError: { message: string; timestamp: number } | null = null;
  private listeners: Set<ContextListener> = new Set();
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private initialized = false;

  // ---- public API -----------------------------------------------------------

  /** Set up focus/blur listeners and start polling. Idempotent. */
  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    this.sessionStartTime = Date.now();
    this.lastActivityTime = Date.now();

    // document visibility (tab switch / minimize)
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    // window focus (alt-tab)
    window.addEventListener('focus', this.onFocus);
    window.addEventListener('blur', this.onBlur);

    // Poll as fallback for WebView2 where events may not fire reliably
    this.pollInterval = setInterval(() => this.pollFocus(), 2000);
  }

  /** Remove listeners and stop polling. */
  destroy(): void {
    if (!this.initialized) return;
    this.initialized = false;

    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('focus', this.onFocus);
    window.removeEventListener('blur', this.onBlur);

    if (this.pollInterval !== null) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /** Mark user activity — resets the idle timer. */
  markActivity(): void {
    this.lastActivityTime = Date.now();
  }

  /** Record that the user navigated to a different page. */
  setPage(page: string): void {
    if (page === this.currentPage) return;
    this.currentPage = page;
    this.pageEnteredAt = Date.now();
  }

  /** Record a user action for context (e.g. "installed Scatterer", "searched 'visual'"). */
  recordAction(action: string): void {
    this.recentActions.push(action);
    if (this.recentActions.length > 5) {
      this.recentActions = this.recentActions.slice(-5);
    }
    this.markActivity();
  }

  /** Record an error for kerbals to react to. */
  recordError(message: string): void {
    this.lastError = { message, timestamp: Date.now() };
    // Auto-clear after 5 min so kerbals don't reference stale errors
    setTimeout(() => {
      if (this.lastError?.message === message) {
        this.lastError = null;
      }
    }, 300_000);
  }

  /** Snapshot of current state. */
  getSnapshot(): WorldContextSnapshot {
    const now = new Date();
    return {
      windowFocused: this.windowFocused,
      focusChangedAt: this.focusChangedAt,
      focusAwayDuration: this.windowFocused ? 0 : now.getTime() - this.focusChangedAt,
      currentPage: this.currentPage,
      currentPageDuration: now.getTime() - this.pageEnteredAt,
      userIdleMs: now.getTime() - this.lastActivityTime,
      systemTime: {
        hour: now.getHours(),
        minute: now.getMinutes(),
        weekday: now.getDay(),
      },
      sessionStartTime: this.sessionStartTime,
      recentActions: [...this.recentActions],
      lastError: this.lastError ? { ...this.lastError } : null,
    };
  }

  /**
   * Build a compact text block for injection into AI system prompts.
   * Kerbals use this to comment on the user's real-world context.
   */
  buildContextPrompt(): string {
    const ctx = this.getSnapshot();
    const parts: string[] = [];

    // Page context
    const pageLabels: Record<string, string> = {
      'available': 'Available mods list',
      'installed': 'Installed mods list',
      'downloads': 'Downloads',
      'instances': 'Game Instances',
      'mission-control': 'Mission Control',
      'settings': 'Settings',
      'repos': 'Repositories',
    };
    const pageLabel = pageLabels[ctx.currentPage] ?? ctx.currentPage;
    const pageMins = Math.round(ctx.currentPageDuration / 60_000);
    if (pageMins > 0) {
      parts.push(`The user is on the ${pageLabel} page (${pageMins} min)`);
    } else {
      parts.push(`The user is on the ${pageLabel} page`);
    }

    // Window focus
    if (!ctx.windowFocused) {
      const awaySecs = Math.round(ctx.focusAwayDuration / 1000);
      parts.push(`Window is NOT focused (user away for ${awaySecs}s)`);
    } else if (ctx.focusAwayDuration > 10_000) {
      const awayMins = Math.round(ctx.focusAwayDuration / 60_000);
      parts.push(`Window just refocused — user was away for ${awayMins} min`);
    }

    // Real time
    const timeStr = `${String(ctx.systemTime.hour).padStart(2, '0')}:${String(ctx.systemTime.minute).padStart(2, '0')}`;
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    parts.push(`Real time: ${timeStr} on a ${weekdays[ctx.systemTime.weekday]}`);

    // Late night hint
    if (ctx.systemTime.hour >= 23 || ctx.systemTime.hour < 5) {
      parts.push('It is very late — the user should probably be asleep');
    }

    // Session duration
    const sessionMins = Math.round((Date.now() - ctx.sessionStartTime) / 60_000);
    if (sessionMins > 5) {
      parts.push(`This session has been running for ${sessionMins} min`);
    }

    // Recent actions
    if (ctx.recentActions.length > 0) {
      parts.push(`Recent user actions: ${ctx.recentActions.join('; ')}`);
    }

    // Errors
    if (ctx.lastError) {
      const errAgo = Math.round((Date.now() - ctx.lastError.timestamp) / 1000);
      parts.push(`Recent error (${errAgo}s ago): ${ctx.lastError.message}`);
    }

    return '\n[WORLD CONTEXT]\n- ' + parts.join('\n- ');
  }

  // ---- subscribe pattern ----------------------------------------------------

  subscribe(fn: ContextListener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private notify(): void {
    for (const fn of this.listeners) {
      fn();
    }
  }

  // ---- focus detection ------------------------------------------------------

  private onVisibilityChange = (): void => {
    this.checkFocus();
  };

  private onFocus = (): void => {
    this.windowFocused = true;
    this.focusChangedAt = Date.now();
    this.markActivity();
    this.notify();
  };

  private onBlur = (): void => {
    this.windowFocused = false;
    this.focusChangedAt = Date.now();
    this.notify();
  };

  private pollFocus(): void {
    this.checkFocus();
  }

  private checkFocus(): void {
    const hasFocus = document.hasFocus();
    if (hasFocus !== this.windowFocused) {
      if (hasFocus) {
        this.onFocus();
      } else {
        this.onBlur();
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const worldContext = new WorldContext();
