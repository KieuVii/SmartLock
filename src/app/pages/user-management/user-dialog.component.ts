import { Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { AuthService, getAuthErrorMessage } from '../../core/services/auth.service';
import {
  UserService,
  type Profile,
  type ProfileRole,
  type ProfileStatus,
} from '../../core/services/user.service';

export interface UserDialogData {
  profile?: Profile;
}

@Component({
  selector: 'app-user-dialog',
  templateUrl: './user-dialog.component.html',
  styleUrl: './user-dialog.component.scss',
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
export class UserDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly userService = inject(UserService);
  private readonly authService = inject(AuthService);
  private readonly dialogRef = inject(MatDialogRef<UserDialogComponent, Profile>);
  readonly data = inject<UserDialogData | null>(MAT_DIALOG_DATA);

  readonly isEdit = !!this.data?.profile;

  readonly form = this.fb.group(
    {
      full_name: [
        this.data?.profile?.full_name ?? '',
        [Validators.required, Validators.maxLength(120)],
      ],
      email: [
        this.data?.profile?.email ?? '',
        this.isEdit ? Validators.email : [Validators.required, Validators.email],
      ],
      phone: [this.data?.profile?.phone ?? ''],
      role: [this.data?.profile?.role ?? ('user' as ProfileRole), Validators.required],
      status: [this.data?.profile?.status ?? ('active' as ProfileStatus), Validators.required],
      password: ['', this.isEdit ? [] : [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', this.isEdit ? [] : Validators.required],
    },
    { validators: (group) => this.passwordsMatch(group) },
  );

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  private passwordsMatch(group: AbstractControl): ValidationErrors | null {
    const password = group.get('password')?.value;
    const confirmPassword = group.get('confirmPassword')?.value;
    return password && confirmPassword && password !== confirmPassword
      ? { passwordsMismatch: true }
      : null;
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid || this.saving()) {
      return;
    }

    this.saving.set(true);
    this.error.set(null);
    try {
      const { full_name, email, phone, role, status, password } = this.form.getRawValue();
      const fullName = (full_name ?? '').trim();
      const emailValue = email?.trim() || null;
      const phoneValue = phone?.trim() || null;
      const roleValue = (role ?? 'user') as ProfileRole;
      const statusValue = (status ?? 'active') as ProfileStatus;

      const saved = this.data?.profile
        ? await this.userService.updateProfile(this.data.profile.id, {
            full_name: fullName,
            email: emailValue,
            phone: phoneValue,
            role: roleValue,
            status: statusValue,
          })
        : await this.createUserWithAccount({
            full_name: fullName,
            email: emailValue ?? '',
            phone: phoneValue,
            role: roleValue,
            status: statusValue,
            password: password ?? '',
          });

      this.dialogRef.close(saved);
    } catch (err) {
      this.error.set(getAuthErrorMessage({ message: (err as Error).message }));
    } finally {
      this.saving.set(false);
    }
  }

  private async createUserWithAccount(values: {
    full_name: string;
    email: string;
    phone: string | null;
    role: ProfileRole;
    status: ProfileStatus;
    password: string;
  }): Promise<Profile> {
    const user = await this.authService.createAuthAccount(
      values.email,
      values.password,
      values.full_name,
    );
    const profile = await this.userService.getProfileByAuthUserId(user.id);
    if (!profile) {
      throw new Error('Không tìm thấy hồ sơ sau khi tạo tài khoản.');
    }
    return this.userService.updateProfile(profile.id, {
      full_name: values.full_name,
      email: values.email,
      phone: values.phone,
      role: values.role,
      status: values.status,
    });
  }

  onCancel(): void {
    this.dialogRef.close();
  }
}