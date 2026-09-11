import { Component, computed, inject, signal } from '@angular/core';
import type { User } from '@supabase/supabase-js';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AccessLogService, type AccessLog } from '../../core/services/access-log.service';
import { AuthService } from '../../core/services/auth.service';
import { formatDateTime, initialsFromName } from '../../core/utils/format';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  imports: [MatButtonModule, MatCardModule, MatIconModule, MatProgressSpinnerModule],
})
export class DashboardComponent {
  private readonly accessLog = inject(AccessLogService);
  private readonly auth = inject(AuthService);

  readonly user = signal<User | null>(null);
  readonly logs = signal<AccessLog[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly totalCount = computed(() => this.logs().length);
  readonly grantedCount = computed(
    () => this.logs().filter((log) => log.result === 'granted').length,
  );
  readonly deniedCount = computed(
    () => this.logs().filter((log) => log.result === 'denied').length,
  );
  readonly grantRate = computed(() =>
    this.totalCount() === 0 ? 0 : Math.round((this.grantedCount() / this.totalCount()) * 100),
  );
  readonly recentLogs = computed(() => this.logs().slice(0, 8));

  readonly greeting = computed(() => {
    const email = this.user()?.email;
    if (!email) {
      return 'Chào mừng trở lại';
    }
    const local = email.split('@')[0] ?? '';
    const name = local.replace(/[._\-]+/g, ' ').trim();
    return name ? `Chào mừng trở lại, ${name}` : 'Chào mừng trở lại';
  });

  constructor() {
    void this.auth.getCurrentUser().then((user) => this.user.set(user));
    void this.loadAccessLogs();
  }

  async loadAccessLogs(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const logs = await this.fetchLogs();
      this.logs.set(logs);
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  private async fetchLogs(): Promise<AccessLog[]> {
    if (await this.auth.isCurrentUserAdmin()) {
      return this.accessLog.listAccessLogs();
    }
    const profile = await this.auth.getCurrentProfile();
    return profile ? this.accessLog.listAccessLogsByUser(profile.id) : [];
  }

  formatDate(value?: string | null): string {
    return formatDateTime(value);
  }

  avatarText(log: AccessLog): string {
    return initialsFromName(log.face_name);
  }

  resultLabel(log: AccessLog): string {
    return this.resultLabelFromValue(log.result);
  }

  resultChipClass(log: AccessLog): string {
    switch (log.result) {
      case 'granted':
        return 'chip-granted';
      case 'denied':
        return 'chip-denied';
      case 'no_face':
        return 'chip-warning';
      default:
        return 'chip-muted';
    }
  }

  similarityPct(log: AccessLog): string | null {
    return log.similarity == null ? null : `${Math.round(log.similarity * 100)}%`;
  }

  private resultLabelFromValue(result: AccessLog['result']): string {
    switch (result) {
      case 'no_face':
        return 'Không có khuôn mặt';
      case 'granted':
        return 'Được phép';
      case 'denied':
        return 'Bị từ chối';
      case 'unknown':
        return 'Không xác định';
      case 'error':
        return 'Lỗi';
      default:
        return result;
    }
  }
}
