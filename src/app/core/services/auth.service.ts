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
import { UserService, type Profile } from './user.service';

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
      return 'Đã vượt giới hạn gửi email. Hãy chờ khoảng một giờ trước khi thử lại, hoặc tắt xác nhận email trong Supabase (Authentication → Email → bỏ chọn "Confirm email").';
    case 'user_already_exists':
      return 'Tài khoản với email này đã tồn tại.';
    case 'email_not_confirmed':
      return 'Vui lòng xác nhận email trước khi đăng nhập.';
    case 'weak_password':
      return 'Mật khẩu quá yếu.';
    case 'invalid_credentials':
      return 'Sai email hoặc mật khẩu.';
    default:
      return error.message ?? 'Đã xảy ra lỗi.';
  }
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly supabase = inject(SupabaseService).supabase;
  private readonly userService = inject(UserService);

  signUp(credentials: SignUpWithPasswordCredentials): Promise<AuthResponse> {
    return this.supabase.auth.signUp(credentials);
  }

  async createAuthAccount(email: string, password: string, fullName: string): Promise<User> {
    const { data: existing } = await this.supabase.auth.getSession();
    const previousSession = existing.session;

    const { data, error } = await this.supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });

    if (error) {
      throw error;
    }

    if (previousSession) {
      await this.supabase.auth.setSession(previousSession);
    }

    const user = data.user;
    if (!user) {
      throw new Error('Không thể tạo tài khoản đăng nhập.');
    }
    return user;
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

  async isCurrentUserAdmin(): Promise<boolean> {
    try {
      const user = await this.getCurrentUser();
      if (!user) {
        return false;
      }
      const profile = await this.userService.getProfileByAuthUserId(user.id);
      return profile?.role === 'admin' && profile.status === 'active';
    } catch {
      return false;
    }
  }

  async getCurrentProfile(): Promise<Profile | null> {
    try {
      const user = await this.getCurrentUser();
      if (!user) {
        return null;
      }
      return await this.userService.getProfileByAuthUserId(user.id);
    } catch {
      return null;
    }
  }
}
