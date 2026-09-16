import { Component, Inject, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import {
  DeviceService,
  type Device,
  type RoomDeviceEntry,
} from '../../core/services/device.service';

export interface RegisterFaceDeviceData {
  faceName: string;
  roomId?: string | null;
}

export interface RegisterFaceDeviceResult {
  device: Device;
  roomName: string;
}

@Component({
  selector: 'app-register-face-device-dialog',
  templateUrl: './register-face-device-dialog.component.html',
  styleUrl: './register-face-device-dialog.component.scss',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
})
export class RegisterFaceDeviceDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly deviceService = inject(DeviceService);
  private readonly dialogRef = inject(
    MatDialogRef<RegisterFaceDeviceDialogComponent, RegisterFaceDeviceResult>,
  );

  readonly entries = signal<RoomDeviceEntry[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly form = this.fb.group({
    room_id: ['', Validators.required],
    device_id: ['', Validators.required],
  });

  readonly roomOptions = computed(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const entry of this.entries()) {
      if (!map.has(entry.roomId)) {
        map.set(entry.roomId, { id: entry.roomId, name: entry.roomName });
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  });

  readonly deviceOptions = computed<RoomDeviceEntry[]>(() => {
    const roomId = this.form.controls.room_id.value;
    if (!roomId) {
      return [];
    }
    return this.entries().filter((entry) => entry.roomId === roomId);
  });

  constructor(@Inject(MAT_DIALOG_DATA) readonly data: RegisterFaceDeviceData) {
    void this.loadEntries();
  }

  async loadEntries(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const entries = await this.deviceService.listDevicesWithRooms();
      this.entries.set(entries);
      const options = this.roomOptions();
      const preferred =
        this.data.roomId && entries.some((entry) => entry.roomId === this.data.roomId)
          ? this.data.roomId
          : (options[0]?.id ?? '');
      this.form.patchValue({ room_id: preferred });
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  onRoomChange(): void {
    this.form.patchValue({ device_id: '' });
  }

  selectedDevice(): RoomDeviceEntry | null {
    const deviceId = this.form.controls.device_id.value;
    return this.entries().find((entry) => entry.device.id === deviceId) ?? null;
  }

  onSubmit(): void {
    if (this.form.invalid) {
      return;
    }
    const selected = this.selectedDevice();
    if (!selected) {
      return;
    }
    this.dialogRef.close({ device: selected.device, roomName: selected.roomName });
  }

  onCancel(): void {
    this.dialogRef.close();
  }
}