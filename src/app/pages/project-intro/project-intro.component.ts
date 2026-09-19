import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-project-intro',
  templateUrl: './project-intro.component.html',
  styleUrl: './project-intro.component.scss',
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule],
})
export class ProjectIntroComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly entering = signal(false);

  async onEnterSystem(): Promise<void> {
    if (this.entering()) {
      return;
    }
    this.entering.set(true);
    try {
      const { session } = await this.auth.getSession();
      await this.router.navigate(session ? ['/dashboard'] : ['/login']);
    } finally {
      this.entering.set(false);
    }
  }
}