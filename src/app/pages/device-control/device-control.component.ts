import { Component, DestroyRef, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../core/services/auth.service';
import {
  DOOR_DEVICE_CODE,
  DeviceService,
  type Device,
  type DeviceCommandStatus,
} from '../../core/services/device.service';
import { UserService } from '../../core/services/user.service';

const POLL_INTERVAL = 3000;
const POLL_TIMEOUT = 60000;
const ONLINE_GRACE_SEC = 60;

@Component({
  selector: 'app-device-control',
  templateUrl: './device-control.component.html',
  styleUrl: './device-control.component.scss',
  imports: [MatButtonModule, MatCardModule, MatIconModule, MatProgressSpinnerModule],
})
export class DeviceControlComponent {
  private readonly deviceService = inject(DeviceService);
  private readonly userService = inject(UserService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly DOOR_DEVICE_CODE = DOOR_DEVICE_CODE;
  readonly isAdmin = signal(false);
  readonly device = signal<Device | null>(null);
  readonly loading = signal(false);
  readonly restarting = signal(false);
  readonly result = signal<{ ok: boolean; text: string } | null>(null);

  constructor() {
    void this.auth.isCurrentUserAdmin().then((admin) => this.isAdmin.set(admin));
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      this.device.set(await this.deviceService.getDeviceByCode(DOOR_DEVICE_CODE));
    } catch {
      this.device.set(null);
    } finally {
      this.loading.set(false);
    }
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
      this.result.set({ ok: false, text: `Không tìm thấy thiết bị "${DOOR_DEVICE_CODE}".` });
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

  private pollCommand(cmdId: string): void {
    let elapsed = 0;
    const timer = setInterval(async () => {
      elapsed += POLL_INTERVAL;
      try {
        const cmd = await this.deviceService.getCommand(cmdId);
        const terminal: DeviceCommandStatus[] = ['done', 'failed', 'cancelled'];
        if (!cmd || terminal.includes(cmd.status)) {
          clearInterval(timer);
          this.restarting.set(false);
          if (!cmd) {
            this.result.set({ ok: false, text: 'Không lấy được trạng thái lệnh.' });
          } else if (cmd.status === 'done') {
            this.result.set({ ok: true, text: 'Pi đã nhận lệnh và đang khởi động lại. Service sẽ online trở lại sau ~10-30s.' });
            setTimeout(() => void this.refresh(), 10000);
          } else {
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