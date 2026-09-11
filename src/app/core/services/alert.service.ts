import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';

export type AlertType =
  | 'unknown_face'
  | 'access_denied'
  | 'no_face'
  | 'low_similarity'
  | 'device_offline'
  | 'camera_error'
  | 'door_open_too_long'
  | 'device_error';

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';
export type AlertStatus = 'new' | 'seen' | 'resolved';

export interface Alert {
  id: string;
  alert_type: AlertType;
  title: string;
  message?: string | null;
  user_id?: string | null;
  room_id?: string | null;
  device_id?: string | null;
  access_log_id?: string | null;
  severity: AlertSeverity;
  status: AlertStatus;
  image_url?: string | null;
  resolved_by?: string | null;
  resolved_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export type AlertInput = Partial<Alert> & Pick<Alert, 'alert_type' | 'title'>;

@Injectable({
  providedIn: 'root',
})
export class AlertService {
  private readonly supabase = inject(SupabaseService).supabase;

  async listAlerts(): Promise<Alert[]> {
    const { data, error } = await this.supabase
      .from('alerts')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      throw error;
    }
    return (data ?? []) as Alert[];
  }

  async listAlertsByUser(userId: string): Promise<Alert[]> {
    const { data, error } = await this.supabase
      .from('alerts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) {
      throw error;
    }
    return (data ?? []) as Alert[];
  }

  async getAlert(id: string): Promise<Alert | null> {
    const { data, error } = await this.supabase.from('alerts').select('*').eq('id', id).single();
    if (error) {
      throw error;
    }
    return (data ?? null) as Alert | null;
  }

  async createAlert(values: AlertInput): Promise<Alert> {
    const { data, error } = await this.supabase.from('alerts').insert(values).select().single();
    if (error) {
      throw error;
    }
    return data as Alert;
  }

  async updateAlertStatus(id: string, status: AlertStatus): Promise<Alert> {
    const values =
      status === 'resolved' ? { status, resolved_at: new Date().toISOString() } : { status };
    const { data, error } = await this.supabase
      .from('alerts')
      .update(values)
      .eq('id', id)
      .select()
      .single();
    if (error) {
      throw error;
    }
    return data as Alert;
  }

  async deleteAlert(id: string): Promise<void> {
    const { error } = await this.supabase.from('alerts').delete().eq('id', id);
    if (error) {
      throw error;
    }
  }
}
