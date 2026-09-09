import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import {
  FaceService,
  type FaceRegistration,
  type FaceStatus,
} from '../../core/services/face.service';
import { formatDateTime, initialsFromName, shortId } from '../../core/utils/format';

@Component({
  selector: 'app-face-register',
  templateUrl: './face-register.component.html',
  styleUrl: './face-register.component.scss',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTableModule,
  ],
})
export class FaceRegisterComponent {
  private readonly faceService = inject(FaceService);

  readonly displayedColumns: string[] = ['face', 'user', 'status', 'registered', 'actions'];
  readonly faces = signal<FaceRegistration[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);

  constructor() {
    void this.loadFaces();
  }

  async loadFaces(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const faces = await this.faceService.listFaces();
      this.faces.set(faces);
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  async onDelete(face: FaceRegistration): Promise<void> {
    try {
      await this.faceService.deleteFace(face.id);
      this.faces.update((list) => list.filter((f) => f.id !== face.id));
      this.notice.set(`Face "${face.face_name}" deleted.`);
    } catch (err) {
      this.notice.set((err as Error).message);
    }
  }

  statusChipClass(status: FaceStatus): string {
    switch (status) {
      case 'registered':
        return 'status-registered';
      case 'pending':
        return 'status-pending';
      case 'rejected':
        return 'status-rejected';
      case 'disabled':
        return 'status-disabled';
      default:
        return 'status-muted';
    }
  }

  statusLabel(status: FaceStatus): string {
    switch (status) {
      case 'not_registered':
        return 'Not registered';
      case 'registered':
        return 'Registered';
      case 'pending':
        return 'Pending';
      case 'rejected':
        return 'Rejected';
      case 'disabled':
        return 'Disabled';
      default:
        return status;
    }
  }

  avatarText(face: FaceRegistration): string {
    return initialsFromName(face.face_name);
  }

  shortenId(value?: string | null): string {
    return shortId(value);
  }

  formatDate(value?: string | null): string {
    return formatDateTime(value);
  }
}
