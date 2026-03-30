/**
 * Auth service — Supabase Auth integration for CKAN Modern.
 * Handles sign-up, sign-in, sign-out, session management, and points.
 */

import { supabase, isSupabaseConfigured } from './supabase';
import type { Session } from '@supabase/supabase-js';

export interface CkanUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  tier: 'free' | 'paid';
  points: number;
  createdAt: string;
}

export type AuthState = {
  user: CkanUser | null;
  session: Session | null;
  loading: boolean;
  configured: boolean;
};

class AuthService {
  private listeners: ((state: AuthState) => void)[] = [];
  private state: AuthState = {
    user: null,
    session: null,
    loading: true,
    configured: isSupabaseConfigured(),
  };

  constructor() {
    if (!this.state.configured) {
      this.state.loading = false;
      return;
    }
    this.init();
  }

  private async init() {
    // Get initial session
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await this.loadUserProfile(session);
    } else {
      this.updateState({ loading: false });
    }

    // Listen for auth changes
    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        await this.loadUserProfile(session);
      } else {
        this.updateState({ user: null, session: null, loading: false });
      }
    });
  }

  private async loadUserProfile(session: Session) {
    const supaUser = session.user;

    // Capture avatar from OAuth provider metadata
    const oauthAvatar = supaUser.user_metadata?.avatar_url as string | undefined;

    // Try to fetch profile from profiles table
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', supaUser.id)
      .single();

    // Persist OAuth avatar_url back to profile if not already set
    if (oauthAvatar && !profile?.avatar_url) {
      await supabase.from('profiles').update({ avatar_url: oauthAvatar }).eq('id', supaUser.id);
    }

    const ckanUser: CkanUser = {
      id: supaUser.id,
      email: supaUser.email || '',
      displayName: profile?.display_name || supaUser.email?.split('@')[0] || 'User',
      avatarUrl: profile?.avatar_url || oauthAvatar || null,
      tier: profile?.tier || 'free',
      points: profile?.points ?? 100,
      createdAt: supaUser.created_at,
    };

    this.updateState({ user: ckanUser, session, loading: false });

    // Sync cloud mod installations into local state after sign-in
    // Import lazily to avoid circular deps
    import('./registry').then(({ registryService }) => {
      registryService.syncFromSupabase().catch(() => {});
    });
  }

  // ─── Public API ───

  getState(): AuthState {
    return { ...this.state };
  }

  onChange(listener: (state: AuthState) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  async signInWithEmail(email: string, password: string): Promise<{ error?: string }> {
    if (!this.state.configured) return { error: 'Supabase not configured' };

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return {};
  }

  async signUpWithEmail(email: string, password: string): Promise<{ error?: string; needsConfirmation?: boolean }> {
    if (!this.state.configured) return { error: 'Supabase not configured' };

    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message };

    // Create initial profile with free tier + 100 points
    if (data.user) {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        display_name: email.split('@')[0],
        tier: 'free',
        points: 100,
      });
    }

    // If no session yet, Supabase requires email confirmation first
    return { needsConfirmation: !data.session };
  }

  async signInWithOAuth(provider: 'github' | 'google' | 'discord'): Promise<{ error?: string }> {
    if (!this.state.configured) return { error: 'Supabase not configured' };

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    });
    if (error) return { error: error.message };
    return {};
  }

  async signOut(): Promise<void> {
    if (!this.state.configured) return;
    await supabase.auth.signOut();
    this.updateState({ user: null, session: null });
  }

  async getPoints(): Promise<number> {
    if (!this.state.user) return 0;
    const { data } = await supabase
      .from('profiles')
      .select('points')
      .eq('id', this.state.user.id)
      .single();
    return data?.points ?? 0;
  }

  async deductPoints(amount: number): Promise<boolean> {
    if (!this.state.user) return false;
    const current = await this.getPoints();
    if (current < amount) return false;

    const { error } = await supabase
      .from('profiles')
      .update({ points: current - amount })
      .eq('id', this.state.user.id);

    if (!error && this.state.user) {
      this.state.user.points = current - amount;
      this.notify();
    }
    return !error;
  }

  async addPoints(amount: number): Promise<void> {
    if (!this.state.user) return;
    const current = await this.getPoints();
    await supabase
      .from('profiles')
      .update({ points: current + amount })
      .eq('id', this.state.user.id);

    if (this.state.user) {
      this.state.user.points = current + amount;
      this.notify();
    }
  }

  // ─── Internal ───

  private updateState(partial: Partial<AuthState>) {
    this.state = { ...this.state, ...partial };
    this.notify();
  }

  private notify() {
    for (const listener of this.listeners) {
      listener({ ...this.state });
    }
  }
}

export const authService = new AuthService();
export default authService;
