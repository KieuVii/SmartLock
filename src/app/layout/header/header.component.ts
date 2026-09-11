import { Component, computed, EventEmitter, inject, Output, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs';
import type { User } from '@supabase/supabase-js';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatRippleModule } from '@angular/material/core';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatToolbarModule } from '@angular/material/toolbar';
import { AlertService, type Alert } from '../../core/services/alert.service';
import { AuthService } from '../../core/services/auth.service';
import { formatDateTime, initialsFromName } from '../../core/utils/format';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
  imports: [
    RouterLink,
    MatBadgeModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatRippleModule,
    MatToolbarModule,
  ],
})
export class Header {
  @Output() menuClick = new EventEmitter<void>();

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly alertService = inject(AlertService);

  readonly user = signal<User | null>(null);
  readonly alerts = signal<Alert[]>([]);
  readonly pageTitle = signal('Bảng điều khiển');

  readonly userInitials = computed(() =>
    initialsFromName(
      (this.user()?.user_metadata['full_name'] as string | undefined) ?? this.user()?.email ?? '',
    ),
  );
  readonly newAlertsCount = computed(
    () => this.alerts().filter((alert) => alert.status === 'new').length,
  );
  readonly recentAlerts = computed(() => this.alerts().slice(0, 5));

  private readonly pageTitles: Record<string, string> = {
    '/dashboard': 'Bảng điều khiển',
    '/face-register': 'Đăng ký khuôn mặt',
    '/access-history': 'Lịch sử truy cập',
    '/user-management': 'Quản lý người dùng',
    '/alert-page': 'Cảnh báo',
  };

  constructor() {
    void this.auth.getCurrentUser().then((user) => this.user.set(user));
    void this.alertService
      .listAlerts()
      .then((alerts) => this.alerts.set(alerts))
      .catch(() => undefined);
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.pageTitle.set(this.pageTitles[event.urlAfterRedirects] ?? 'SmartLock');
      });
  }

  onMenuClick(): void {
    this.menuClick.emit();
  }

  formatDate(value?: string | null): string {
    return formatDateTime(value);
  }

  async onLogout(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigate(['/login']);
  }
}
