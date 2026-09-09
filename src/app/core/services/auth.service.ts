import { Injectable, inject } from '@angular/core';
import type {
  AuthError,
  AuthResponse,
  AuthSession,
  AuthTokenResponse,
  SignUpWithPasswordCredentials,
  User,
} from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';

export interface AuthErrorLike {
  code?: string;
  message?: string;
}

export function getAuthErrorMessage(error: AuthErrorLike | null): string | null {
  if (!error) {
    return null;
  }
  switch (error.code) {
    case 'over_email_send_rate_limit':
      return 'Email rate limit exceeded. Wait about an hour before retrying, or disable email confirmation in Supabase (Authentication → Email → uncheck "Confirm email").';
    case 'user_already_exists':
      return 'An account with this email already exists.';
    case 'email_not_confirmed':
      return 'Please confirm your email before signing in.';
    case 'weak_password':
      return 'Password is too weak.';
    case 'invalid_credentials':
      return 'Incorrect email or password.';
    default:
      return error.message ?? 'Something went wrong.';
  }
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly supabase = inject(SupabaseService).supabase;

  signUp(credentials: SignUpWithPasswordCredentials): Promise<AuthResponse> {
    return this.supabase.auth.signUp(credentials);
  }

  signInWithPassword(credentials: SignUpWithPasswordCredentials): Promise<AuthTokenResponse> {
    return this.supabase.auth.signInWithPassword(credentials);
  }

  signOut(): Promise<{ error: AuthError | null }> {
    return this.supabase.auth.signOut();
  }

  async getSession(): Promise<{ session: AuthSession | null }> {
    const { data, error } = await this.supabase.auth.getSession();
    if (error) {
      throw error;
    }
    return { session: data.session };
  }

  async getCurrentUser(): Promise<User | null> {
    const { data, error } = await this.supabase.auth.getUser();
    if (error) {
      throw error;
    }
    return data.user;
  }

  onAuthStateChange(listener: (session: AuthSession | null) => void): {
    data: { subscription: { unsubscribe: () => void } };
  } {
    return this.supabase.auth.onAuthStateChange((_event, session) => listener(session));
  }
}
