import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';

export type AccessResult = 'granted' | 'denied' | 'no_face' | 'unknown' | 'error';

export interface AccessLog {
  id: string;
  user_id?: string | null;
  room_id?: string | null;
  device_id?: string | null;
  face_profile_id?: string | null;
  face_name?: string | null;
  result: AccessResult;
  similarity?: number | null;
  threshold?: number | null;
  captured_image_url?: string | null;
  note?: string | null;
  access_time?: string | null;
  created_at?: string | null;
}

export type AccessLogInput = Partial<AccessLog> & Pick<AccessLog, 'result'>;

@Injectable({
  providedIn: 'root',
})
export class AccessLogService {
  private readonly supabase = inject(SupabaseService).supabase;

  async listAccessLogs(limit = 100): Promise<AccessLog[]> {
    const { data, error } = await this.supabase
      .from('access_logs')
      .select('*')
      .order('access_time', { ascending: false })
      .limit(limit);
    if (error) {
      throw error;
    }
    return (data ?? []) as AccessLog[];
  }

  async getAccessLog(id: string): Promise<AccessLog | null> {
    const { data, error } = await this.supabase
      .from('access_logs')
      .select('*')
      .eq('id', id)
      .single();
    if (error) {
      throw error;
    }
    return (data ?? null) as AccessLog | null;
  }

  async insertAccessLog(values: AccessLogInput): Promise<AccessLog> {
    const { data, error } = await this.supabase
      .from('access_logs')
      .insert(values)
      .select()
      .single();
    if (error) {
      throw error;
    }
    return data as AccessLog;
  }

  async deleteAccessLog(id: string): Promise<void> {
    const { error } = await this.supabase.from('access_logs').delete().eq('id', id);
    if (error) {
      throw error;
    }
  }
}
