import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../core/services/auth.service';

interface NavItem {
  label: string;
  path: string;
  icon: string;
  adminOnly?: boolean;
}

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
  imports: [RouterLink, RouterLinkActive, MatIconModule],
})
export class Sidebar {
  private readonly auth = inject(AuthService);

  readonly isAdmin = signal(false);

  readonly allNavItems: NavItem[] = [
    { label: 'Bảng điều khiển', path: '/dashboard', icon: 'dashboard' },
    { label: 'Checkin / Checkout', path: '/checkin-checkout', icon: 'schedule' },
    { label: 'Đăng ký khuôn mặt', path: '/face-register', icon: 'face' },
    { label: 'Lịch sử truy cập', path: '/access-history', icon: 'history' },
    { label: 'Quản lý người dùng', path: '/user-management', icon: 'group', adminOnly: true },
    { label: 'Thiết bị', path: '/device-control', icon: 'settings', adminOnly: true },
    { label: 'Cơ cấu tòa nhà', path: '/site-hierarchy', icon: 'apartment', adminOnly: true },
    { label: 'Cảnh báo', path: '/alert-page', icon: 'notifications' },
  ];

  readonly navItems = computed(() =>
    this.isAdmin() ? this.allNavItems : this.allNavItems.filter((item) => !item.adminOnly),
  );

  constructor() {
    void this.auth.isCurrentUserAdmin().then((admin) => this.isAdmin.set(admin));
  }
}
