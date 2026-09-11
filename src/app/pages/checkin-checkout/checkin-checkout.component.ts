import { Component, DestroyRef, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../core/services/auth.service';
import {
  DOOR_DEVICE_CODE,
  DeviceService,
  type DeviceAction,
  type DeviceCommandStatus,
} from '../../core/services/device.service';
import { UserService } from '../../core/services/user.service';

const POLL_INTERVAL = 3000;
const POLL_TIMEOUT = 90000;

interface ActionResult {
  ok: boolean;
  text: string;
  detail?: string;
}

@Component({
  selector: 'app-checkin-checkout',
  templateUrl: './checkin-checkout.component.html',
  styleUrl: './checkin-checkout.component.scss',
  imports: [MatButtonModule, MatCardModule, MatIconModule, MatProgressSpinnerModule],
})
export class CheckinCheckoutComponent {
  private readonly deviceService = inject(DeviceService);
  private readonly userService = inject(UserService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly DOOR_DEVICE_CODE = DOOR_DEVICE_CODE;
  readonly busy = signal(false);
  readonly busyAction = signal<DeviceAction | null>(null);
  readonly result = signal<ActionResult | null>(null);
  readonly deviceOnline = signal<boolean | null>(null);

  constructor() {
    void this.checkDevice();
  }

  async checkDevice(): Promise<void> {
    try {
      const device = await this.deviceService.getDeviceByCode(DOOR_DEVICE_CODE);
      this.deviceOnline.set(device?.status === 'online');
    } catch {
      this.deviceOnline.set(false);
    }
  }

  async run(action: DeviceAction): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.result.set(null);
    this.busy.set(true);
    this.busyAction.set(action);

    try {
      const device = await this.deviceService.getDeviceByCode(DOOR_DEVICE_CODE);
      if (!device) {
        this.result.set({
          ok: false,
          text: `Không tìm thấy thiết bị "${DOOR_DEVICE_CODE}".`,
        });
        return;
      }

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

      const cmd = await this.deviceService.sendActionCommand(device.id, action, requestedBy);
      const label = action === 'start_checkin' ? 'Checkin' : 'Checkout';
      this.result.set({
        ok: true,
        text: `Đã gửi lệnh ${label}. Hãy nhìn vào camera của thiết bị.`,
      });
      this.pollCommandStatus(cmd.id, label);
    } catch (err) {
      this.busy.set(false);
      this.busyAction.set(null);
      this.result.set({ ok: false, text: (err as Error).message });
    }
  }

  private pollCommandStatus(cmdId: string, label: string): void {
    let elapsed = 0;
    const timer = setInterval(async () => {
      elapsed += POLL_INTERVAL;
      try {
        const cmd = await this.deviceService.getCommand(cmdId);
        const terminal: DeviceCommandStatus[] = ['done', 'failed', 'cancelled'];
        if (!cmd || terminal.includes(cmd.status)) {
          clearInterval(timer);
          this.busy.set(false);
          this.busyAction.set(null);
          if (!cmd) {
            this.result.set({ ok: false, text: 'Không lấy được trạng thái lệnh.' });
          } else if (cmd.status === 'done') {
            this.result.set({ ok: true, text: `${label} thành công!`, detail: cmd.result_message ?? undefined });
          } else {
            this.result.set({ ok: false, text: `${label} thất bại.`, detail: cmd.result_message ?? cmd.status });
          }
          void this.checkDevice();
        } else if (elapsed >= POLL_TIMEOUT) {
          clearInterval(timer);
          this.busy.set(false);
          this.busyAction.set(null);
          this.result.set({
            ok: false,
            text: 'Thiết bị không phản hồi (kiểm tra Pi có online và main.py chạy không).',
          });
        }
      } catch (err) {
        clearInterval(timer);
        this.busy.set(false);
        this.busyAction.set(null);
        this.result.set({ ok: false, text: (err as Error).message });
      }
    }, POLL_INTERVAL);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }
}