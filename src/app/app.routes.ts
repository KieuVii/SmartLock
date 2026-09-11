import type { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { MainLayout } from './layout/main-layout/main-layout.component';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'sign-up',
    loadComponent: () => import('./pages/sign-up/sign-up.component').then((m) => m.SignUpComponent),
  },
  {
    path: '',
    component: MainLayout,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./pages/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'face-register',
        loadComponent: () =>
          import('./pages/face-register/face-register.component').then(
            (m) => m.FaceRegisterComponent,
          ),
      },
      {
        path: 'checkin-checkout',
        loadComponent: () =>
          import('./pages/checkin-checkout/checkin-checkout.component').then(
            (m) => m.CheckinCheckoutComponent,
          ),
      },
      {
        path: 'access-history',
        loadComponent: () =>
          import('./pages/access-history/access-history.component').then(
            (m) => m.AccessHistoryComponent,
          ),
      },
      {
        path: 'user-management',
        loadComponent: () =>
          import('./pages/user-management/user-management.component').then(
            (m) => m.UserManagementComponent,
          ),
      },
      {
        path: 'alert-page',
        loadComponent: () =>
          import('./pages/alert-page/alert-page.component').then((m) => m.AlertPageComponent),
      },
    ],
  },
  {
    path: '**',
    redirectTo: 'dashboard',
  },
];
