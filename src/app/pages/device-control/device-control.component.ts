import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { AuthService } from '../../core/services/auth.service';
import {
  DeviceService,
  type Device,
  type DeviceCommandStatus,
  type RoomDeviceEntry,
} from '../../core/services/device.service';
import { UserService } from '../../core/services/user.service';

const POLL_INTERVAL = 3000;
const POLL_TIMEOUT = 60000;
const ONLINE_GRACE_SEC = 60;

@Component({
  selector: 'app-device-control',
  templateUrl: './device-control.component.html',
  styleUrl: './device-control.component.scss',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
})
export class DeviceControlComponent {
  private readonly deviceService = inject(DeviceService);
  private readonly userService = inject(UserService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly isAdmin = signal(false);
  readonly entries = signal<RoomDeviceEntry[]>([]);
  readonly selectedId = signal<string | null>(null);
  readonly loading = signal(false);
  readonly restarting = signal(false);
  readonly result = signal<{ ok: boolean; text: string } | null>(null);

  readonly selectedEntry = computed<RoomDeviceEntry | null>(() => {
    const id = this.selectedId();
    return this.entries().find((entry) => entry.device.id === id) ?? null;
  });

  readonly device = computed<Device | null>(() => this.selectedEntry()?.device ?? null);

  constructor() {
    void this.auth.isCurrentUserAdmin().then((admin) => this.isAdmin.set(admin));
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      const entries = await this.deviceService.listDevicesWithRooms();
      const current = this.selectedId();
      this.entries.set(entries);
      if (!current || !entries.some((entry) => entry.device.id === current)) {
        this.selectedId.set(this.pickDefault(entries)?.device.id ?? null);
      }
    } catch {
      this.entries.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  private pickDefault(entries: RoomDeviceEntry[]): RoomDeviceEntry | null {
    if (entries.length === 0) {
      return null;
    }
    return [...entries].sort((a, b) => {
      const ta = a.device.last_seen ? new Date(a.device.last_seen).getTime() : 0;
      const tb = b.device.last_seen ? new Date(b.device.last_seen).getTime() : 0;
      return tb - ta;
    })[0];
  }

  deviceOnline(): boolean {
    const device = this.device();
    if (!device || device.status !== 'online') {
      return false;
    }
    if (device.last_seen) {
      const ageSec = (Date.now() - new Date(device.last_seen).getTime()) / 1000;
      if (ageSec > ONLINE_GRACE_SEC) {
        return false;
      }
    }
    return true;
  }

  private async isDeviceOnline(): Promise<boolean> {
    try {
      const device = this.device();
      if (!device) {
        return false;
      }
      const fresh = await this.deviceService.getDevice(device.id);
      if (!fresh || fresh.status !== 'online') {
        return false;
      }
      if (fresh.last_seen) {
        const ageSec = (Date.now() - new Date(fresh.last_seen).getTime()) / 1000;
        return ageSec <= ONLINE_GRACE_SEC;
      }
      return true;
    } catch {
      return false;
    }
  }

  doorStatusLabel(): string {
    return this.device()?.door_status === 'unlocked' ? 'Mở (unlocked)' : 'Khóa (locked)';
  }

  lastSeenLabel(): string {
    const lastSeen = this.device()?.last_seen;
    if (!lastSeen) {
      return 'chưa có';
    }
    return new Date(lastSeen).toLocaleString('vi-VN');
  }

  async restartService(): Promise<void> {
    if (this.restarting()) {
      return;
    }
    const device = this.device();
    if (!device) {
      this.result.set({ ok: false, text: 'Chưa chọn thiết bị.' });
      return;
    }
    if (!window.confirm('Khởi động lại service trên Pi? Pi sẽ mất kết nối trong vài giây rồi tự bật lại.')) {
      return;
    }

    this.result.set(null);
    this.restarting.set(true);

    try {
      let requestedBy: string | null = null;
      try {
        const user = await this.auth.getCurrentUser();
        if (user) {
          const profile = await this.userService.getProfileByAuthUserId(user.id);
          requestedBy = profile?.id ?? null;
        }
      } catch {
        requestedBy = null;
      }

      const cmd = await this.deviceService.sendRestartServiceCommand(device.id, requestedBy);
      this.result.set({ ok: true, text: 'Đã gửi lệnh khởi động lại. Pi sẽ khởi động lại trong vài giây...' });
      this.pollCommand(cmd.id);
    } catch (err) {
      this.restarting.set(false);
      this.result.set({ ok: false, text: (err as Error).message });
    }
  }

  private pollDeviceOnline(): void {
    let elapsed = 0;
    const timer = setInterval(async () => {
      elapsed += POLL_INTERVAL;
      const online = await this.isDeviceOnline();
      if (online || elapsed >= 45000) {
        clearInterval(timer);
        await this.refresh();
        this.restarting.set(false);
        this.result.set({
          ok: true,
          text: online
            ? 'Service đã khởi động lại thành công — thiết bị online trở lại.'
            : 'Chưa thấy thiết bị online trở lại sau 45s. Kiểm tra nguồn Pi hoặc log fina.',
        });
      }
    }, POLL_INTERVAL);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  private pollCommand(cmdId: string): void {
    let elapsed = 0;
    const timer = setInterval(async () => {
      elapsed += POLL_INTERVAL;
      try {
        const cmd = await this.deviceService.getCommand(cmdId);
        const terminal: DeviceCommandStatus[] = ['done', 'failed', 'cancelled'];
        if (!cmd || terminal.includes(cmd.status)) {
          clearInterval(timer);
          if (!cmd) {
            this.restarting.set(false);
            this.result.set({ ok: false, text: 'Không lấy được trạng thái lệnh.' });
          } else if (cmd.status === 'done') {
            // restarting giu TRUE: chan bam them cho den khi Pi online lai
            this.result.set({ ok: true, text: 'Pi đã nhận lệnh và đang khởi động lại...' });
            this.pollDeviceOnline();
          } else {
            this.restarting.set(false);
            const detail = cmd.result_message ? `: ${cmd.result_message}` : '';
            this.result.set({ ok: false, text: `Khởi động lại thất bại${detail}.` });
          }
        } else if (elapsed >= POLL_TIMEOUT) {
          clearInterval(timer);
          this.restarting.set(false);
          this.result.set({
            ok: false,
            text: 'Không nhận phản hồi từ Pi. Nếu Pi đang kẹt, watchdog systemd sẽ tự khởi động lại trong ~30s.',
          });
        }
      } catch {
        // Mat ket noi tam thoi: giu poll, khong dung
      }
    }, POLL_INTERVAL);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }
}