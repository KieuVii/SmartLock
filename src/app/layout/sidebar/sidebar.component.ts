import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

interface NavItem {
  label: string;
  path: string;
  icon: string;
}

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
  imports: [RouterLink, RouterLinkActive, MatIconModule],
})
export class Sidebar {
  readonly navItems: NavItem[] = [
    { label: 'Dashboard', path: '/dashboard', icon: 'dashboard' },
    { label: 'Face Register', path: '/face-register', icon: 'face' },
    { label: 'Access History', path: '/access-history', icon: 'history' },
    { label: 'User Management', path: '/user-management', icon: 'group' },
    { label: 'Alerts', path: '/alert-page', icon: 'notifications' },
  ];
}
