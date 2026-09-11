import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';

export type RoomStatus = 'active' | 'inactive';

export interface Room {
  id: string;
  room_name: string;
  floor?: string | null;
  building_name?: string | null;
  description?: string | null;
  status: RoomStatus;
  created_at?: string | null;
  updated_at?: string | null;
}

@Injectable({
  providedIn: 'root',
})
export class RoomService {
  private readonly supabase = inject(SupabaseService).supabase;

  async listRooms(): Promise<Room[]> {
    const { data, error } = await this.supabase
      .from('rooms')
      .select('*')
      .order('room_name', { ascending: true });
    if (error) {
      throw error;
    }
    return (data ?? []) as Room[];
  }
}
