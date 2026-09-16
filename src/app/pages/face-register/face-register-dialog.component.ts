import { Component, computed, inject, signal } from '@angular/core';
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
import { AuthService } from '../../core/services/auth.service';
import { SiteService } from '../../core/services/site.service';

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
  private readonly siteService = inject(SiteService);
  private readonly auth = inject(AuthService);
  private readonly dialogRef = inject(MatDialogRef<FaceRegisterDialogComponent, FaceRegistration>);

  readonly form = this.fb.group({
    user_id: ['', Validators.required],
    face_name: ['', [Validators.required, Validators.maxLength(120)]],
    room_id: [''],
    note: [''],
  });

  readonly profiles = signal<Profile[]>([]);
  readonly allRooms = signal<Room[]>([]);
  readonly loadingOptions = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly memberRoomIds = signal<string[]>([]);

  readonly roomLocked = computed(() => this.memberRoomIds().length > 0);

  readonly rooms = computed<Room[]>(() => {
    const ids = this.memberRoomIds();
    if (ids.length > 0) {
      return this.allRooms().filter((room) => ids.includes(room.id));
    }
    return this.allRooms();
  });

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
      this.allRooms.set(rooms.filter((room) => room.status === 'active'));
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.loadingOptions.set(false);
    }
  }

  async onUserChange(): Promise<void> {
    const userId = this.form.controls.user_id.value;
    this.memberRoomIds.set([]);
    this.form.patchValue({ room_id: '' });
    if (!userId) {
      return;
    }
    try {
      const ids = await this.siteService.listMemberRoomIds(userId);
      this.memberRoomIds.set(ids);
      if (ids.length > 0) {
        this.form.patchValue({ room_id: ids[0] });
      }
    } catch {
      this.memberRoomIds.set([]);
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
      if (room_id) {
        try {
          const profile = await this.auth.getCurrentProfile();
          await this.siteService.addMembers(room_id, [user_id ?? ''], profile?.id ?? null);
        } catch {
          // Best-effort: không chặn đăng ký nếu đồng bộ member thất bại
        }
      }
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
