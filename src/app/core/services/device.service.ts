import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface Device {
  id: string;
  device_code: string;
  device_name?: string | null;
  status?: string | null;
}

export type DeviceCommandStatus = 'pending' | 'running' | 'done' | 'failed' | 'cancelled';

export interface DeviceCommand {
  id: string;
  device_id: string;
  command: string;
  payload: Record<string, unknown>;
  status: DeviceCommandStatus;
  requested_by?: string | null;
  requested_at?: string | null;
  executed_at?: string | null;
  result_message?: string | null;
}

export const DOOR_DEVICE_CODE = 'DOOR_01';

export type DeviceAction = 'start_checkin' | 'start_checkout';

@Injectable({
  providedIn: 'root',
})
export class DeviceService {
  private readonly supabase = inject(SupabaseService).supabase;

  async getDeviceByCode(deviceCode: string): Promise<Device | null> {
    const { data, error } = await this.supabase
      .from('devices')
      .select('id, device_code, device_name, status')
      .eq('device_code', deviceCode)
      .maybeSingle();
    if (error) {
      throw error;
    }
    return (data ?? null) as Device | null;
  }

  async sendRegisterFaceCommand(
    deviceId: string,
    faceName: string,
    requestedBy?: string | null,
  ): Promise<DeviceCommand> {
    return this.sendCommand(deviceId, 'start_register_face', { face_name: faceName }, requestedBy);
  }

  async sendActionCommand(
    deviceId: string,
    command: DeviceAction,
    requestedBy?: string | null,
  ): Promise<DeviceCommand> {
    return this.sendCommand(deviceId, command, {}, requestedBy);
  }

  private async sendCommand(
    deviceId: string,
    command: string,
    payload: Record<string, unknown>,
    requestedBy?: string | null,
  ): Promise<DeviceCommand> {
    const { data, error } = await this.supabase
      .from('device_commands')
      .insert({
        device_id: deviceId,
        command,
        payload,
        status: 'pending',
        requested_by: requestedBy ?? null,
      })
      .select()
      .single();
    if (error) {
      throw error;
    }
    return data as DeviceCommand;
  }

  async getCommand(id: string): Promise<DeviceCommand | null> {
    const { data, error } = await this.supabase
      .from('device_commands')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) {
      throw error;
    }
    return (data ?? null) as DeviceCommand | null;
  }
}