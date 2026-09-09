import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import {
  UserService,
  type Profile,
  type ProfileRole,
  type ProfileStatus,
} from '../../core/services/user.service';
import { formatDateTime, initialsFromName } from '../../core/utils/format';

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

  readonly displayedColumns: string[] = ['user', 'role', 'status', 'created', 'actions'];
  readonly profiles = signal<Profile[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);

  constructor() {
    void this.loadProfiles();
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
        `User ${updated.full_name} is now ${updated.status === 'active' ? 'active' : 'blocked'}.`,
      );
    } catch (err) {
      this.notice.set((err as Error).message);
    }
  }

  async onDelete(profile: Profile): Promise<void> {
    try {
      await this.userService.deleteProfile(profile.id);
      this.profiles.update((list) => list.filter((p) => p.id !== profile.id));
      this.notice.set(`User ${profile.full_name} deleted.`);
    } catch (err) {
      this.notice.set((err as Error).message);
    }
  }

  roleLabel(role: ProfileRole): string {
    return role.charAt(0).toUpperCase() + role.slice(1);
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
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  avatarText(profile: Profile): string {
    return initialsFromName(profile.full_name);
  }

  formatDate(value?: string | null): string {
    return formatDateTime(value);
  }
}
