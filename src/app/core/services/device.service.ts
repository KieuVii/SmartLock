import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface Device {
  id: string;
  device_code: string;
  device_name?: string | null;
  status?: string | null;
  door_status?: string | null;
  last_seen?: string | null;
  ip_address?: string | null;
  room_id?: string | null;
  door_id?: string | null;
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

export type DeviceAction = 'start_checkin' | 'start_checkout';

export interface RoomDeviceEntry {
  device: Device;
  roomId: string;
  roomName: string;
  doorName?: string | null;
}

@Injectable({
  providedIn: 'root',
})
export class DeviceService {
  private readonly supabase = inject(SupabaseService).supabase;

  async getDevice(deviceId: string): Promise<Device | null> {
    const { data, error } = await this.supabase
      .from('devices')
      .select('*')
      .eq('id', deviceId)
      .maybeSingle();
    if (error) {
      throw error;
    }
    return (data ?? null) as Device | null;
  }

  async getDevicesByRoom(roomId: string): Promise<Device[]> {
    const { data, error } = await this.supabase
      .from('devices')
      .select('*')
      .eq('room_id', roomId)
      .order('device_code');
    if (error) {
      throw error;
    }
    return (data ?? []) as Device[];
  }

  async getDevicesForRoomIds(roomIds: string[]): Promise<Device[]> {
    if (roomIds.length === 0) {
      return [];
    }
    const { data, error } = await this.supabase
      .from('devices')
      .select('*')
      .in('room_id', roomIds)
      .order('device_code');
    if (error) {
      throw error;
    }
    return (data ?? []) as Device[];
  }

  async listDevicesWithRooms(): Promise<RoomDeviceEntry[]> {
    const { data, error } = await this.supabase
      .from('devices')
      .select('*, doors(name), rooms(room_name, building_name, floor)')
      .not('room_id', 'is', null)
      .order('device_code');
    if (error) {
      throw error;
    }
    return (data ?? []).map((row) => {
      const door = row.doors as unknown as { name?: string } | null;
      const room = row.rooms as unknown as { room_name?: string } | null;
      return {
        device: row as Device,
        roomId: row.room_id as string,
        roomName: room?.room_name ?? '—',
        doorName: door?.name ?? null,
      };
    });
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

  async sendRestartServiceCommand(deviceId: string, requestedBy?: string | null): Promise<DeviceCommand> {
    return this.sendCommand(deviceId, 'restart_service', {}, requestedBy);
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