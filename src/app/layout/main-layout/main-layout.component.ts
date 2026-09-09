import { Component, computed, inject, viewChild } from '@angular/core';
import { BreakpointObserver } from '@angular/cdk/layout';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { filter, map } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { Header } from '../header/header.component';
import { Sidebar } from '../sidebar/sidebar.component';

@Component({
  selector: 'app-main-layout',
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss',
  imports: [MatSidenavModule, RouterOutlet, Header, Sidebar],
})
export class MainLayout {
  private readonly router = inject(Router);
  private readonly breakpointObserver = inject(BreakpointObserver);

  readonly drawer = viewChild<MatSidenav>('drawer');

  readonly isDesktop = toSignal(
    this.breakpointObserver.observe('(min-width: 960px)').pipe(map((result) => result.matches)),
    { initialValue: true },
  );

  readonly sidenavMode = computed<'side' | 'over'>(() => (this.isDesktop() ? 'side' : 'over'));

  constructor() {
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => {
        if (!this.isDesktop()) {
          this.drawer()?.close();
        }
      });
  }

  onMenuClick(): void {
    this.drawer()?.toggle();
  }
}
