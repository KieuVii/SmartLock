import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import {
  DOOR_DEVICE_CODE,
  DeviceService,
} from '../../core/services/device.service';
import {
  FaceService,
  type FaceRegistration,
  type FaceStatus,
} from '../../core/services/face.service';
import { UserService } from '../../core/services/user.service';
import { formatDateTime, initialsFromName, shortId } from '../../core/utils/format';
import { ConfirmDialogComponent } from '../../core/components/confirm-dialog/confirm-dialog.component';
import { FaceRegisterDialogComponent } from './face-register-dialog.component';

const POLL_INTERVAL = 3000;
const POLL_TIMEOUT = 210000;

@Component({
  selector: 'app-face-register',
  templateUrl: './face-register.component.html',
  styleUrl: './face-register.component.scss',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTableModule,
  ],
})
export class FaceRegisterComponent {
  private readonly faceService = inject(FaceService);
  private readonly deviceService = inject(DeviceService);
  private readonly userService = inject(UserService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);

  readonly baseColumns: string[] = ['face', 'user', 'status', 'registered'];
  readonly displayedColumns = computed(() =>
    this.isAdmin() ? [...this.baseColumns, 'actions'] : this.baseColumns,
  );
  readonly faces = signal<FaceRegistration[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly isAdmin = signal(false);
  readonly registeringId = signal<string | null>(null);

  constructor() {
    void this.loadFaces();
    void this.auth.isCurrentUserAdmin().then((admin) => this.isAdmin.set(admin));
  }

  async openRegisterDialog(): Promise<void> {
    const ref = this.dialog.open(FaceRegisterDialogComponent, {
      width: '480px',
      maxWidth: '95vw',
      autoFocus: 'first-tabbable',
    });
    const face = await firstValueFrom(ref.afterClosed());
    if (face) {
      await this.loadFaces();
      this.notice.set(`Hồ sơ "${face.face_name}" đã được đăng ký với trạng thái Chờ duyệt.`);
    }
  }

  async loadFaces(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const faces = await this.faceService.listFaces();
      this.faces.set(faces);
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  async onRegisterFace(face: FaceRegistration): Promise<void> {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Đăng ký khuôn mặt trên thiết bị',
        message: `Gửi lệnh để thiết bị mở màn hình scan khuôn mặt "${face.face_name}"? Người cần đăng ký phải đứng trước camera của thiết bị (Pi).`,
        confirmLabel: 'Gửi lệnh',
        icon: 'camera_alt',
      },
    });
    const confirmed = await firstValueFrom(ref.afterClosed());
    if (!confirmed) {
      return;
    }

    try {
      const device = await this.deviceService.getDeviceByCode(DOOR_DEVICE_CODE);
      if (!device) {
        this.notice.set(`Không tìm thấy thiết bị "${DOOR_DEVICE_CODE}" trong hệ thống.`);
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

      await this.faceService.updateFaceStatus(face.id, 'pending');
      const cmd = await this.deviceService.sendRegisterFaceCommand(
        device.id,
        face.face_name,
        requestedBy,
      );
      this.faces.update((list) =>
        list.map((f) => (f.id === face.id ? { ...f, status: 'pending' as FaceStatus } : f)),
      );
      this.registeringId.set(face.id);
      this.notice.set(
        `Đã gửi lệnh đăng ký "${face.face_name}". Người cần đăng ký hãy đứng trước camera thiết bị trong vòng 3 phút.`,
      );
      this.pollCommandStatus(cmd.id, face.face_name);
    } catch (err) {
      this.notice.set((err as Error).message);
    }
  }

  private pollCommandStatus(cmdId: string, faceName: string): void {
    let elapsed = 0;
    const timer = setInterval(async () => {
      elapsed += POLL_INTERVAL;
      try {
        const cmd = await this.deviceService.getCommand(cmdId);
        if (!cmd || cmd.status === 'done' || cmd.status === 'failed' || cmd.status === 'cancelled') {
          clearInterval(timer);
          this.registeringId.set(null);
          await this.loadFaces();
          if (!cmd) {
            this.notice.set('Không lấy được trạng thái lệnh đăng ký.');
          } else if (cmd.status === 'done') {
            this.notice.set(`Đăng ký "${faceName}" hoàn tất trên thiết bị.`);
          } else {
            this.notice.set(`Đăng ký "${faceName}" thất bại: ${cmd.result_message ?? cmd.status}.`);
          }
        } else if (elapsed >= POLL_TIMEOUT) {
          clearInterval(timer);
          this.registeringId.set(null);
          await this.loadFaces();
          this.notice.set(
            'Thiết bị không phản hồi lệnh đăng ký (kiểm tra Pi có online và main.py đang chạy không).',
          );
        }
      } catch (err) {
        clearInterval(timer);
        this.registeringId.set(null);
        this.notice.set((err as Error).message);
      }
    }, POLL_INTERVAL);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  async onDelete(face: FaceRegistration): Promise<void> {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Xóa hồ sơ khuôn mặt',
        message: `Bạn có chắc chắn muốn xóa hồ sơ khuôn mặt "${face.face_name}"? Thao tác này không thể hoàn tác.`,
        confirmLabel: 'Xóa',
        icon: 'delete',
      },
    });
    const confirmed = await firstValueFrom(ref.afterClosed());
    if (!confirmed) {
      return;
    }
    try {
      await this.faceService.deleteFace(face.id);
      this.faces.update((list) => list.filter((f) => f.id !== face.id));
      this.notice.set(`Hồ sơ "${face.face_name}" đã bị xóa.`);
    } catch (err) {
      this.notice.set((err as Error).message);
    }
  }

  statusChipClass(status: FaceStatus): string {
    switch (status) {
      case 'registered':
        return 'status-registered';
      case 'pending':
        return 'status-pending';
      case 'rejected':
        return 'status-rejected';
      case 'disabled':
        return 'status-disabled';
      default:
        return 'status-muted';
    }
  }

  statusLabel(status: FaceStatus): string {
    switch (status) {
      case 'not_registered':
        return 'Chưa đăng ký';
      case 'registered':
        return 'Đã đăng ký';
      case 'pending':
        return 'Chờ duyệt';
      case 'rejected':
        return 'Bị từ chối';
      case 'disabled':
        return 'Đã vô hiệu';
      default:
        return status;
    }
  }

  avatarText(face: FaceRegistration): string {
    return initialsFromName(face.face_name);
  }

  shortenId(value?: string | null): string {
    return shortId(value);
  }

  formatDate(value?: string | null): string {
    return formatDateTime(value);
  }
}
