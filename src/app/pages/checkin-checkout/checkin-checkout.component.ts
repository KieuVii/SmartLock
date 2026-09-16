import { Component, DestroyRef, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../core/services/auth.service';
import {
  DeviceService,
  type Device,
  type DeviceAction,
  type DeviceCommandStatus,
} from '../../core/services/device.service';
import { RoomService } from '../../core/services/room.service';
import { SiteService } from '../../core/services/site.service';

const POLL_INTERVAL = 3000;
const POLL_TIMEOUT = 90000;

interface ActionResult {
  ok: boolean;
  text: string;
  detail?: string;
}

interface DoorEntry {
  key: string;
  roomId: string;
  roomName: string;
  device: Device;
}

@Component({
  selector: 'app-checkin-checkout',
  templateUrl: './checkin-checkout.component.html',
  styleUrl: './checkin-checkout.component.scss',
  imports: [MatButtonModule, MatCardModule, MatIconModule, MatProgressSpinnerModule],
})
export class CheckinCheckoutComponent {
  private readonly deviceService = inject(DeviceService);
  private readonly roomService = inject(RoomService);
  private readonly siteService = inject(SiteService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly doors = signal<DoorEntry[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);
  readonly busyKey = signal<string | null>(null);
  readonly result = signal<ActionResult | null>(null);
  readonly reconnecting = signal(false);

  constructor() {
    void this.loadDoors();
  }

  async loadDoors(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const isAdmin = await this.auth.isCurrentUserAdmin();
      const rooms = await this.roomService.listRooms();
      const roomById = new Map(rooms.map((room) => [room.id, room]));

      let roomIds: string[];
      if (isAdmin) {
        roomIds = rooms.map((room) => room.id);
      } else {
        const profile = await this.auth.getCurrentProfile();
        roomIds = profile ? await this.siteService.listMemberRoomIds(profile.id) : [];
      }

      const devices = await this.deviceService.getDevicesForRoomIds(roomIds);
      const entries: DoorEntry[] = [];
      for (const device of devices) {
        const room = device.room_id ? roomById.get(device.room_id) : undefined;
        if (!room || room.status !== 'active') {
          continue;
        }
        entries.push({
          key: `${room.id}:${device.id}`,
          roomId: room.id,
          roomName: room.room_name,
          device,
        });
      }
      entries.sort((a, b) => a.roomName.localeCompare(b.roomName, 'vi'));
      this.doors.set(entries);
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  deviceStatusLabel(device: Device): string {
    switch (device.status) {
      case 'online':
        return 'Trực tuyến';
      case 'offline':
        return 'Ngoại tuyến';
      default:
        return device.status ?? 'Không xác định';
    }
  }

  async run(action: DeviceAction, entry: DoorEntry): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.result.set(null);
    this.busy.set(true);
    this.busyKey.set(entry.key);

    try {
      let requestedBy: string | null = null;
      try {
        const user = await this.auth.getCurrentUser();
        if (user) {
          const profile = await this.auth.getCurrentProfile();
          requestedBy = profile?.id ?? null;
        }
      } catch {
        requestedBy = null;
      }

      const cmd = await this.deviceService.sendActionCommand(entry.device.id, action, requestedBy);
      const label = action === 'start_checkin' ? 'Checkin' : 'Checkout';
      this.result.set({
        ok: true,
        text: `Đã gửi lệnh ${label} cho "${entry.roomName}". Hãy nhìn vào camera của thiết bị.`,
      });
      this.pollCommandStatus(cmd.id, label, entry);
    } catch (err) {
      this.busy.set(false);
      this.busyKey.set(null);
      this.result.set({ ok: false, text: (err as Error).message });
    }
  }

  private pollCommandStatus(cmdId: string, label: string, entry: DoorEntry): void {
    let elapsed = 0;
    const timer = setInterval(async () => {
      elapsed += POLL_INTERVAL;
      try {
        const cmd = await this.deviceService.getCommand(cmdId);
        this.reconnecting.set(false);
        const terminal: DeviceCommandStatus[] = ['done', 'failed', 'cancelled'];
        if (!cmd || terminal.includes(cmd.status)) {
          clearInterval(timer);
          this.busy.set(false);
          this.busyKey.set(null);
          if (!cmd) {
            this.result.set({ ok: false, text: 'Không lấy được trạng thái lệnh.' });
          } else if (cmd.status === 'done') {
            this.result.set({
              ok: true,
              text: `${label} thành công!`,
              detail: cmd.result_message ?? undefined,
            });
          } else {
            this.result.set({
              ok: false,
              text: `${label} thất bại.`,
              detail: cmd.result_message ?? cmd.status,
            });
          }
          void this.loadDoors();
        } else if (elapsed >= POLL_TIMEOUT) {
          clearInterval(timer);
          this.busy.set(false);
          this.busyKey.set(null);
          this.result.set({
            ok: false,
            text: 'Thiết bị không phản hồi (kiểm tra Pi có online và main.py chạy không).',
          });
        }
      } catch {
        // Mat ket noi tam thoi: KHONG dung poll, tiep tuc thu lai den khi co mang lai
        this.reconnecting.set(true);
        this.result.set({
          ok: false,
          text: 'Mất kết nối mạng, đang thử lại... Lệnh sẽ tiếp tục được theo dõi khi có mạng.',
        });
      }
    }, POLL_INTERVAL);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }
}