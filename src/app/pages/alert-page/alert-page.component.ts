import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import {
  AlertService,
  type Alert,
  type AlertSeverity,
  type AlertStatus,
} from '../../core/services/alert.service';
import { AuthService } from '../../core/services/auth.service';
import { formatDateTime } from '../../core/utils/format';

@Component({
  selector: 'app-alert-page',
  templateUrl: './alert-page.component.html',
  styleUrl: './alert-page.component.scss',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTableModule,
  ],
})
export class AlertPageComponent {
  private readonly alertService = inject(AlertService);
  private readonly auth = inject(AuthService);

  readonly displayedColumns: string[] = ['severity', 'alert', 'created', 'status', 'actions'];
  readonly alerts = signal<Alert[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);

  constructor() {
    void this.loadAlerts();
  }

  async loadAlerts(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const alerts = await this.fetchAlerts();
      this.alerts.set(alerts);
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  private async fetchAlerts(): Promise<Alert[]> {
    if (await this.auth.isCurrentUserAdmin()) {
      return this.alertService.listAlerts();
    }
    const profile = await this.auth.getCurrentProfile();
    return profile ? this.alertService.listAlertsByUser(profile.id) : [];
  }

  async onMarkSeen(alert: Alert): Promise<void> {
    try {
      const updated = await this.alertService.updateAlertStatus(alert.id, 'seen');
      this.alerts.update((list) => list.map((a) => (a.id === alert.id ? updated : a)));
    } catch (err) {
      this.notice.set((err as Error).message);
    }
  }

  async onResolve(alert: Alert): Promise<void> {
    try {
      const updated = await this.alertService.updateAlertStatus(alert.id, 'resolved');
      this.alerts.update((list) => list.map((a) => (a.id === alert.id ? updated : a)));
    } catch (err) {
      this.notice.set((err as Error).message);
    }
  }

  async onDelete(alert: Alert): Promise<void> {
    try {
      await this.alertService.deleteAlert(alert.id);
      this.alerts.update((list) => list.filter((a) => a.id !== alert.id));
    } catch (err) {
      this.notice.set((err as Error).message);
    }
  }

  severityChipClass(severity: AlertSeverity): string {
    return `severity-${severity}`;
  }

  severityIcon(severity: AlertSeverity): string {
    switch (severity) {
      case 'critical':
        return 'error';
      case 'high':
        return 'warning';
      case 'medium':
        return 'priority_high';
      default:
        return 'info';
    }
  }

  statusChipClass(status: AlertStatus): string {
    switch (status) {
      case 'new':
        return 'status-new';
      case 'seen':
        return 'status-seen';
      default:
        return 'status-resolved';
    }
  }

  statusLabel(status: AlertSeverity | AlertStatus): string {
    switch (status) {
      case 'critical':
        return 'Nghiêm trọng';
      case 'high':
        return 'Cao';
      case 'medium':
        return 'Trung bình';
      case 'low':
        return 'Thấp';
      case 'new':
        return 'Mới';
      case 'seen':
        return 'Đã xem';
      case 'resolved':
        return 'Đã xử lý';
      default:
        return status;
    }
  }

  formatDate(value?: string | null): string {
    return formatDateTime(value);
  }
}
