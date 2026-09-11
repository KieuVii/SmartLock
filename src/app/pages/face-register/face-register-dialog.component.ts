import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { FaceService, type FaceRegistration } from '../../core/services/face.service';
import { RoomService, type Room } from '../../core/services/room.service';
import { UserService, type Profile } from '../../core/services/user.service';

@Component({
  selector: 'app-face-register-dialog',
  templateUrl: './face-register-dialog.component.html',
  styleUrl: './face-register-dialog.component.scss',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
})
export class FaceRegisterDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly faceService = inject(FaceService);
  private readonly userService = inject(UserService);
  private readonly roomService = inject(RoomService);
  private readonly dialogRef = inject(MatDialogRef<FaceRegisterDialogComponent, FaceRegistration>);

  readonly form = this.fb.group({
    user_id: ['', Validators.required],
    face_name: ['', [Validators.required, Validators.maxLength(120)]],
    room_id: [''],
    note: [''],
  });

  readonly profiles = signal<Profile[]>([]);
  readonly rooms = signal<Room[]>([]);
  readonly loadingOptions = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    void this.loadOptions();
  }

  async loadOptions(): Promise<void> {
    this.loadingOptions.set(true);
    this.error.set(null);
    try {
      const [profiles, rooms] = await Promise.all([
        this.userService.listProfiles(),
        this.roomService.listRooms(),
      ]);
      this.profiles.set(profiles.filter((profile) => profile.status === 'active'));
      this.rooms.set(rooms.filter((room) => room.status === 'active'));
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.loadingOptions.set(false);
    }
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid || this.saving()) {
      return;
    }

    this.saving.set(true);
    this.error.set(null);
    try {
      const { user_id, face_name, room_id, note } = this.form.getRawValue();
      const face = await this.faceService.registerFace({
        user_id: user_id ?? '',
        face_name: (face_name ?? '').trim(),
        room_id: room_id || null,
        note: note?.trim() || null,
        status: 'pending',
      });
      this.dialogRef.close(face);
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.saving.set(false);
    }
  }

  onCancel(): void {
    this.dialogRef.close();
  }
}
