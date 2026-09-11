import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import {
  AccessLogService,
  type AccessLog,
  type AccessResult,
} from '../../core/services/access-log.service';
import { AuthService } from '../../core/services/auth.service';
import { formatDateTime, shortId } from '../../core/utils/format';

type ResultFilter = 'all' | AccessResult;

@Component({
  selector: 'app-access-history',
  templateUrl: './access-history.component.html',
  styleUrl: './access-history.component.scss',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatTableModule,
  ],
})
export class AccessHistoryComponent {
  private readonly accessLog = inject(AccessLogService);
  private readonly auth = inject(AuthService);

  readonly displayedColumns: string[] = [
    'access_time',
    'access_type',
    'face_name',
    'result',
    'similarity',
    'user_id',
  ];
  readonly logs = signal<AccessLog[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly resultFilter = signal<ResultFilter>('all');

  readonly filterOptions: ResultFilter[] = [
    'all',
    'granted',
    'denied',
    'no_face',
    'unknown',
    'error',
  ];

  readonly filteredLogs = computed(() => {
    const filter = this.resultFilter();
    if (filter === 'all') {
      return this.logs();
    }
    return this.logs().filter((log) => log.result === filter);
  });

  constructor() {
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

  onFilterChange(value: ResultFilter): void {
    this.resultFilter.set(value);
  }

  resultLabel(value: ResultFilter): string {
    if (value === 'all') {
      return 'Tất cả kết quả';
    }
    switch (value) {
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
        return value;
    }
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

  accessTypeLabel(accessType: AccessLog['access_type']): string {
    if (!accessType) {
      return '—';
    }
    return accessType === 'checkin' ? 'Checkin' : 'Checkout';
  }

  formatDate(value?: string | null): string {
    return formatDateTime(value);
  }

  shortenId(value?: string | null): string {
    return shortId(value);
  }

  similarityPct(log: AccessLog): string {
    return log.similarity == null ? '—' : `${Math.round(log.similarity * 100)}%`;
  }
}
