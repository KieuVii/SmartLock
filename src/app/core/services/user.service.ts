import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';

export type ProfileRole = 'admin' | 'user';
export type ProfileStatus = 'active' | 'blocked' | 'pending';

export interface Profile {
  id: string;
  auth_user_id?: string | null;
  full_name: string;
  email?: string | null;
  phone?: string | null;
  role: ProfileRole;
  status: ProfileStatus;
  avatar_url?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

@Injectable({
  providedIn: 'root',
})
export class UserService {
  private readonly supabase = inject(SupabaseService).supabase;

  async listProfiles(): Promise<Profile[]> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      throw error;
    }
    return (data ?? []) as Profile[];
  }

  async getProfile(id: string): Promise<Profile | null> {
    const { data, error } = await this.supabase.from('profiles').select('*').eq('id', id).single();
    if (error) {
      throw error;
    }
    return (data ?? null) as Profile | null;
  }

  async getProfileByAuthUserId(authUserId: string): Promise<Profile | null> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('*')
      .eq('auth_user_id', authUserId)
      .maybeSingle();
    if (error) {
      throw error;
    }
    return (data ?? null) as Profile | null;
  }

  async updateProfile(id: string, values: Partial<Profile>): Promise<Profile> {
    const { data, error } = await this.supabase
      .from('profiles')
      .update(values)
      .eq('id', id)
      .select()
      .single();
    if (error) {
      throw error;
    }
    return data as Profile;
  }

  async updateProfileStatus(id: string, status: ProfileStatus): Promise<Profile> {
    return this.updateProfile(id, { status });
  }

  async deleteProfile(id: string): Promise<void> {
    const { error } = await this.supabase.from('profiles').delete().eq('id', id);
    if (error) {
      throw error;
    }
  }
}
