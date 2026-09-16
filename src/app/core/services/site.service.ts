import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';

export type SiteType = 'building' | 'floor' | 'room' | 'door' | 'device';

export interface SiteNode {
  id: string;
  type: SiteType;
  name: string;
  children: SiteNode[];
  device?: SiteDevice | null;
  loaded?: boolean;
}

export interface SiteDevice {
  id: string;
  device_code: string;
  device_name?: string | null;
  status?: string | null;
  door_status?: string | null;
}

export interface RoomMember {
  id: string;
  user_id: string;
  full_name: string;
  email?: string | null;
  phone?: string | null;
  role: string;
  status: string;
  joined_at?: string | null;
}

interface BuildingRow {
  id: string;
  name: string;
}
interface FloorRow extends BuildingRow {
  building_id: string;
  level: number;
}
interface RoomRow {
  id: string;
  floor_id: string | null;
  room_name: string;
}
interface DoorRow {
  id: string;
  room_id: string;
  name: string;
}

export interface AddSiteInput {
  name: string;
  device_code?: string;
  device_name?: string;
}

const CHILD_TYPE: Record<SiteType, SiteType | null> = {
  building: 'floor',
  floor: 'room',
  room: 'door',
  door: 'device',
  device: null,
};

export function nextSiteType(type: SiteType): SiteType | null {
  return CHILD_TYPE[type];
}

export function childLabel(type: SiteType): string {
  switch (type) {
    case 'building':
      return 'Tầng';
    case 'floor':
      return 'Phòng';
    case 'room':
      return 'Cửa';
    case 'door':
      return 'Thiết bị';
    default:
      return '';
  }
}

@Injectable({
  providedIn: 'root',
})
export class SiteService {
  private readonly supabase = inject(SupabaseService).supabase;

  async listBuildings(): Promise<SiteNode[]> {
    const { data, error } = await this.supabase.from('buildings').select('*').order('name');
    if (error) {
      throw error;
    }
    return ((data ?? []) as BuildingRow[]).map((building) => ({
      id: building.id,
      type: 'building' as SiteType,
      name: building.name,
      children: [],
      loaded: false,
    }));
  }

  async listChildren(parent: SiteNode): Promise<SiteNode[]> {
    switch (parent.type) {
      case 'building': {
        const { data, error } = await this.supabase
          .from('floors')
          .select('*')
          .eq('building_id', parent.id)
          .order('level');
        if (error) {
          throw error;
        }
        return ((data ?? []) as FloorRow[]).map((floor) => ({
          id: floor.id,
          type: 'floor' as SiteType,
          name: floor.name,
          children: [],
        }));
      }
      case 'floor': {
        const { data, error } = await this.supabase
          .from('rooms')
          .select('*')
          .eq('floor_id', parent.id)
          .order('room_name');
        if (error) {
          throw error;
        }
        return ((data ?? []) as RoomRow[]).map((room) => ({
          id: room.id,
          type: 'room' as SiteType,
          name: room.room_name,
          children: [],
        }));
      }
      case 'room': {
        const { data, error } = await this.supabase
          .from('doors')
          .select('*')
          .eq('room_id', parent.id)
          .order('name');
        if (error) {
          throw error;
        }
        return ((data ?? []) as DoorRow[]).map((door) => ({
          id: door.id,
          type: 'door' as SiteType,
          name: door.name,
          children: [],
        }));
      }
      case 'door': {
        const { data, error } = await this.supabase
          .from('devices')
          .select('*')
          .eq('door_id', parent.id)
          .order('device_code');
        if (error) {
          throw error;
        }
        return ((data ?? []) as SiteDevice[]).map((dev) => ({
          id: dev.id,
          type: 'device' as SiteType,
          name: dev.device_name ?? dev.device_code,
          device: dev,
          children: [],
        }));
      }
      default:
        return [];
    }
  }

  async addChild(parentType: SiteType, parentId: string, input: AddSiteInput): Promise<void> {
    const child = nextSiteType(parentType);
    if (!child) {
      throw new Error('Không thể thêm con cho cấp này.');
    }

    switch (child) {
      case 'floor': {
        const { error } = await this.supabase.from('floors').insert({
          building_id: parentId,
          name: input.name,
        });
        if (error) {
          throw error;
        }
        break;
      }
      case 'room': {
        const { data: floor, error: floorError } = await this.supabase
          .from('floors')
          .select('name, building_id')
          .eq('id', parentId)
          .single();
        if (floorError) {
          throw floorError;
        }
        const { data: building, error: buildingError } = await this.supabase
          .from('buildings')
          .select('name')
          .eq('id', floor.building_id)
          .single();
        if (buildingError) {
          throw buildingError;
        }
        const { error } = await this.supabase.from('rooms').insert({
          floor_id: parentId,
          room_name: input.name,
          floor: floor.name,
          building_name: building.name,
        });
        if (error) {
          throw error;
        }
        break;
      }
      case 'door': {
        const { error } = await this.supabase.from('doors').insert({
          room_id: parentId,
          name: input.name,
        });
        if (error) {
          throw error;
        }
        break;
      }
      case 'device': {
        if (!input.device_code) {
          throw new Error('Thiếu mã thiết bị (device_code).');
        }
        const { data: door, error: doorError } = await this.supabase
          .from('doors')
          .select('room_id')
          .eq('id', parentId)
          .single();
        if (doorError) {
          throw doorError;
        }
        const { error } = await this.supabase.from('devices').insert({
          door_id: parentId,
          room_id: door.room_id,
          device_name: input.device_name?.trim() || input.name,
          device_code: input.device_code.trim().toUpperCase(),
          status: 'offline',
          door_status: 'locked',
        });
        if (error) {
          throw error;
        }
        break;
      }
    }
  }

  async removeSite(node: SiteNode): Promise<void> {
    if (node.type === 'building') {
      throw new Error('Không thể xóa tòa nhà gốc.');
    }
    const table =
      node.type === 'floor' ? 'floors' : node.type === 'room' ? 'rooms' : node.type === 'door' ? 'doors' : 'devices';
    const { error } = await this.supabase.from(table).delete().eq('id', node.id);
    if (error) {
      throw error;
    }
  }

  async listRoomMembers(roomId: string): Promise<RoomMember[]> {
    const { data, error } = await this.supabase
      .from('room_permissions')
      .select(
        'id, permission_status, created_at, profiles!room_permissions_user_id_fkey(id, full_name, email, phone, role, status)',
      )
      .eq('room_id', roomId)
      .eq('permission_status', 'allowed')
      .order('created_at', { ascending: true });
    if (error) {
      throw error;
    }
    return (data ?? []).map((row) => {
      const profile = row.profiles as unknown as {
        id: string;
        full_name: string;
        email?: string | null;
        phone?: string | null;
        role: string;
        status: string;
      };
      return {
        id: row.id,
        user_id: profile.id,
        full_name: profile.full_name,
        email: profile.email,
        phone: profile.phone,
        role: profile.role,
        status: profile.status,
        joined_at: row.created_at,
      } as RoomMember;
    });
  }

  async listNonMemberProfiles(roomId: string): Promise<
    Array<{
      id: string;
      full_name: string;
      email?: string | null;
      phone?: string | null;
    }>
  > {
    const { data: existing, error: rpError } = await this.supabase
      .from('room_permissions')
      .select('user_id')
      .eq('room_id', roomId)
      .eq('permission_status', 'allowed');
    if (rpError) {
      throw rpError;
    }
    const memberIds = new Set((existing ?? []).map((row) => row.user_id));

    const { data, error } = await this.supabase
      .from('profiles')
      .select('id, full_name, email, phone, status')
      .order('full_name');
    if (error) {
      throw error;
    }
    return (data ?? [])
      .filter((profile) => profile.status === 'active' && !memberIds.has(profile.id))
      .map((profile) => ({
        id: profile.id,
        full_name: profile.full_name,
        email: profile.email,
        phone: profile.phone,
      }));
  }

  async addMembers(roomId: string, userIds: string[], createdBy?: string | null): Promise<void> {
    if (userIds.length === 0) {
      return;
    }
    const rows = userIds.map((user_id) => ({
      user_id,
      room_id: roomId,
      permission_status: 'allowed',
      created_by: createdBy ?? null,
    }));
    const { error } = await this.supabase
      .from('room_permissions')
      .upsert(rows, { onConflict: 'user_id,room_id' });
    if (error) {
      throw error;
    }
  }

  async removeMember(memberId: string): Promise<void> {
    const { error } = await this.supabase
      .from('room_permissions')
      .delete()
      .eq('id', memberId);
    if (error) {
      throw error;
    }
  }

  async listMemberRoomIds(profileId: string): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('room_permissions')
      .select('room_id')
      .eq('user_id', profileId)
      .eq('permission_status', 'allowed');
    if (error) {
      throw error;
    }
    return (data ?? []).map((row) => row.room_id);
  }
}