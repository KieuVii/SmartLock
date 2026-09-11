import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import {
  UserService,
  type Profile,
  type ProfileRole,
  type ProfileStatus,
} from '../../core/services/user.service';
import { formatDateTime, initialsFromName } from '../../core/utils/format';
import { ConfirmDialogComponent } from '../../core/components/confirm-dialog/confirm-dialog.component';
import { UserDialogComponent } from './user-dialog.component';

@Component({
  selector: 'app-user-management',
  templateUrl: './user-management.component.html',
  styleUrl: './user-management.component.scss',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTableModule,
  ],
})
export class UserManagementComponent {
  private readonly userService = inject(UserService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);

  readonly baseColumns: string[] = ['user', 'role', 'status', 'created'];
  readonly displayedColumns = computed(() =>
    this.isAdmin() ? [...this.baseColumns, 'actions'] : this.baseColumns,
  );
  readonly profiles = signal<Profile[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly isAdmin = signal(false);

  constructor() {
    void this.loadProfiles();
    void this.auth.isCurrentUserAdmin().then((admin) => this.isAdmin.set(admin));
  }

  async loadProfiles(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const profiles = await this.userService.listProfiles();
      this.profiles.set(profiles);
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  async onToggleStatus(profile: Profile): Promise<void> {
    const next: ProfileStatus = profile.status === 'active' ? 'blocked' : 'active';
    try {
      const updated = await this.userService.updateProfileStatus(profile.id, next);
      this.profiles.update((list) => list.map((p) => (p.id === profile.id ? updated : p)));
      this.notice.set(
        `Người dùng ${updated.full_name} hiện đang ${
          updated.status === 'active' ? 'hoạt động' : 'bị khóa'
        }.`,
      );
    } catch (err) {
      this.notice.set((err as Error).message);
    }
  }

  async openCreateDialog(): Promise<void> {
    const ref = this.dialog.open(UserDialogComponent, {
      width: '480px',
      maxWidth: '95vw',
      autoFocus: 'first-tabbable',
      data: {},
    });
    const profile = await firstValueFrom(ref.afterClosed());
    if (profile) {
      await this.loadProfiles();
      this.notice.set(`Người dùng ${profile.full_name} đã được tạo.`);
    }
  }

  async openEditDialog(profile: Profile): Promise<void> {
    const ref = this.dialog.open(UserDialogComponent, {
      width: '480px',
      maxWidth: '95vw',
      autoFocus: 'first-tabbable',
      data: { profile },
    });
    const updated = await firstValueFrom(ref.afterClosed());
    if (updated) {
      await this.loadProfiles();
      this.notice.set(`Người dùng ${updated.full_name} đã được cập nhật.`);
    }
  }

  async onDelete(profile: Profile): Promise<void> {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Xóa người dùng',
        message: `Bạn có chắc chắn muốn xóa người dùng "${profile.full_name}"? Thao tác này không thể hoàn tác.`,
        confirmLabel: 'Xóa',
        icon: 'delete',
      },
    });
    const confirmed = await firstValueFrom(ref.afterClosed());
    if (!confirmed) {
      return;
    }
    try {
      await this.userService.deleteProfile(profile.id);
      this.profiles.update((list) => list.filter((p) => p.id !== profile.id));
      this.notice.set(`Người dùng ${profile.full_name} đã bị xóa.`);
    } catch (err) {
      this.notice.set((err as Error).message);
    }
  }

  roleLabel(role: ProfileRole): string {
    return role === 'admin' ? 'Quản trị viên' : 'Người dùng';
  }

  statusChipClass(status: ProfileStatus): string {
    switch (status) {
      case 'active':
        return 'status-active';
      case 'blocked':
        return 'status-blocked';
      default:
        return 'status-pending';
    }
  }

  statusLabel(status: ProfileStatus): string {
    switch (status) {
      case 'active':
        return 'Hoạt động';
      case 'blocked':
        return 'Bị khóa';
      default:
        return 'Chờ duyệt';
    }
  }

  avatarText(profile: Profile): string {
    return initialsFromName(profile.full_name);
  }

  formatDate(value?: string | null): string {
    return formatDateTime(value);
  }
}
