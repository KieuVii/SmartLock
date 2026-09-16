import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';

export type FaceStatus = 'not_registered' | 'registered' | 'pending' | 'rejected' | 'disabled';

export interface FaceRegistration {
  id: string;
  user_id: string;
  room_id?: string | null;
  registered_by_device_id?: string | null;
  face_name: string;
  avatar_url?: string | null;
  sample_count?: number | null;
  model_name?: string | null;
  face_db_source?: string | null;
  status: FaceStatus;
  registered_at?: string | null;
  note?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  user_name?: string | null;
  user_email?: string | null;
  room_name?: string | null;
}

export type FaceRegistrationInput = Partial<FaceRegistration> &
  Pick<FaceRegistration, 'user_id' | 'face_name'>;

@Injectable({
  providedIn: 'root',
})
export class FaceService {
  private readonly supabase = inject(SupabaseService).supabase;

  async listFaces(): Promise<FaceRegistration[]> {
    const { data, error } = await this.supabase
      .from('face_profiles')
      .select('*, profiles(full_name, email), rooms(room_name)')
      .order('created_at', { ascending: false });
    if (error) {
      throw error;
    }
    return ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
      const profile = row['profiles'] as unknown as { full_name?: string; email?: string | null } | null;
      const room = row['rooms'] as unknown as { room_name?: string } | null;
      const result: Record<string, unknown> = { ...row };
      delete result['profiles'];
      delete result['rooms'];
      result['user_name'] = profile?.full_name ?? null;
      result['user_email'] = profile?.email ?? null;
      result['room_name'] = room?.room_name ?? null;
      return result as unknown as FaceRegistration;
    });
  }

  async getFace(id: string): Promise<FaceRegistration | null> {
    const { data, error } = await this.supabase
      .from('face_profiles')
      .select('*')
      .eq('id', id)
      .single();
    if (error) {
      throw error;
    }
    return (data ?? null) as FaceRegistration | null;
  }

  async registerFace(values: FaceRegistrationInput): Promise<FaceRegistration> {
    const { data, error } = await this.supabase
      .from('face_profiles')
      .insert(values)
      .select()
      .single();
    if (error) {
      throw error;
    }
    return data as FaceRegistration;
  }

  async updateFaceStatus(id: string, status: FaceStatus): Promise<FaceRegistration> {
    const { data, error } = await this.supabase
      .from('face_profiles')
      .update({ status })
      .eq('id', id)
      .select()
      .single();
    if (error) {
      throw error;
    }
    return data as FaceRegistration;
  }

  async updateFaceDevice(id: string, deviceId: string): Promise<FaceRegistration> {
    const { data, error } = await this.supabase
      .from('face_profiles')
      .update({ registered_by_device_id: deviceId })
      .eq('id', id)
      .select()
      .single();
    if (error) {
      throw error;
    }
    return data as FaceRegistration;
  }

  async deleteFace(id: string): Promise<void> {
    const { error } = await this.supabase.from('face_profiles').delete().eq('id', id);
    if (error) {
      throw error;
    }
  }
}
