/**
 * Credits service — monthly AI message credit balance.
 * Free: 50 credits/month reset every 30 days.
 * Pro:  500 credits/month.
 *
 * Soft limit: when balance ≤ 0, sends still go through in degraded mode
 * (shorter responses). UI shows a subtle banner prompting upgrade.
 */

import { supabase, isSupabaseConfigured } from './supabase';
import { authService } from './auth';

export interface CreditsState {
  balance: number;
  tier: 'free' | 'pro';
  resetAt: Date | null;
  /** true when balance ≤ 0 — responses become shorter but aren't blocked */
  degraded: boolean;
  loaded: boolean;
}

type CreditsListener = (state: CreditsState) => void;

class CreditsService {
  private state: CreditsState = {
    balance: 50,
    tier: 'free',
    resetAt: null,
    degraded: false,
    loaded: false,
  };
  private listeners: CreditsListener[] = [];
  private realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

  constructor() {
    authService.onChange((authState) => {
      if (authState.user) {
        this.load(authState.user.id);
      } else {
        this.setState({ balance: 50, tier: 'free', resetAt: null, degraded: false, loaded: false });
        this.unsubscribeRealtime();
      }
    });

    const existing = authService.getState();
    if (existing.user) {
      this.load(existing.user.id);
    }
  }

  private async load(userId: string) {
    if (!isSupabaseConfigured()) return;

    const { data } = await supabase
      .from('user_credits')
      .select('balance, tier, reset_at')
      .eq('user_id', userId)
      .single();

    if (!data) {
      // Row not yet created (existing users before trigger) — use defaults
      this.setState({ balance: 50, tier: 'free', resetAt: null, degraded: false, loaded: true });
      return;
    }

    this.setState({
      balance: data.balance,
      tier: data.tier as 'free' | 'pro',
      resetAt: data.reset_at ? new Date(data.reset_at) : null,
      degraded: data.balance <= 0,
      loaded: true,
    });

    this.subscribeRealtime(userId);
  }

  private subscribeRealtime(userId: string) {
    this.unsubscribeRealtime();
    this.realtimeChannel = supabase
      .channel(`credits_${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_credits',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          this.setState({
            balance: row.balance as number,
            tier: row.tier as 'free' | 'pro',
            resetAt: row.reset_at ? new Date(row.reset_at as string) : null,
            degraded: (row.balance as number) <= 0,
            loaded: true,
          });
        }
      )
      .subscribe();
  }

  private unsubscribeRealtime() {
    if (this.realtimeChannel) {
      supabase.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
  }

  private setState(partial: Partial<CreditsState>) {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) listener({ ...this.state });
  }

  // ─── Public API ───

  getState(): CreditsState {
    return { ...this.state };
  }

  onChange(listener: CreditsListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Deduct 1 credit for an AI message via the server-side RPC.
   * Returns true  = had credits (normal response length).
   * Returns false = balance was 0 (degraded — shorter response).
   * Never blocks the send.
   */
  async deduct(): Promise<boolean> {
    const userId = authService.getState().user?.id;
    if (!userId || !isSupabaseConfigured()) return true;

    const { data } = await supabase.rpc('deduct_credit', {
      p_user_id: userId,
      p_amount: 1,
    });

    // Optimistic local update (realtime will sync the real value)
    const newBalance = this.state.balance - 1;
    this.setState({ balance: newBalance, degraded: newBalance <= 0 });

    return data === true;
  }

  /** Days / hours until the next monthly reset. */
  timeUntilReset(): string {
    if (!this.state.resetAt) return '';
    const ms = this.state.resetAt.getTime() - Date.now();
    if (ms <= 0) return 'soon';
    const days = Math.floor(ms / 86_400_000);
    if (days > 1) return `${days} days`;
    const hours = Math.floor(ms / 3_600_000);
    if (hours > 1) return `${hours} hours`;
    return 'less than an hour';
  }
}

export const creditsService = new CreditsService();
export default creditsService;
