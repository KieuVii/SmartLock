import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  childLabel,
  nextSiteType,
  SiteService,
  type SiteType,
} from '../../core/services/site.service';

export interface AddSiteDialogData {
  parentType: SiteType;
  parentName: string;
  parentId: string;
}

@Component({
  selector: 'app-add-site-dialog',
  templateUrl: './add-site-dialog.component.html',
  styleUrl: './add-site-dialog.component.scss',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
})
export class AddSiteDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly siteService = inject(SiteService);
  private readonly dialogRef = inject(MatDialogRef<AddSiteDialogComponent, boolean>);
  readonly data = inject<AddSiteDialogData>(MAT_DIALOG_DATA);

  readonly childType = nextSiteType(this.data.parentType) ?? 'floor';
  readonly isDevice = this.childType === 'device';
  readonly childLabel = childLabel;
  readonly title = computed(() => `Thêm ${childLabel(this.data.parentType)}`);

  readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    device_code: [this.isDevice ? 'DOOR_' : '', this.isDevice ? [Validators.required] : []],
    device_name: [''],
  });

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  async onSubmit(): Promise<void> {
    if (this.form.invalid || this.saving()) {
      return;
    }

    this.saving.set(true);
    this.error.set(null);
    try {
      const { name, device_code, device_name } = this.form.getRawValue();
      await this.siteService.addChild(this.data.parentType, this.data.parentId, {
        name: (name ?? '').trim(),
        device_code: device_code?.trim() || undefined,
        device_name: device_name?.trim() || undefined,
      });
      this.dialogRef.close(true);
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