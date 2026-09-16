import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatTableModule } from '@angular/material/table';
import { firstValueFrom } from 'rxjs';
import { ConfirmDialogComponent } from '../../core/components/confirm-dialog/confirm-dialog.component';
import { AuthService } from '../../core/services/auth.service';
import {
  childLabel,
  SiteService,
  type RoomMember,
  type SiteNode,
} from '../../core/services/site.service';
import { formatDateTime, initialsFromName } from '../../core/utils/format';
import { AddSiteDialogComponent } from './add-site-dialog.component';

interface CandidateUser {
  id: string;
  full_name: string;
  email?: string | null;
  phone?: string | null;
}

@Component({
  selector: 'app-site-hierarchy',
  templateUrl: './site-hierarchy.component.html',
  styleUrl: './site-hierarchy.component.scss',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSidenavModule,
    MatTableModule,
  ],
})
export class SiteHierarchyComponent {
  private readonly siteService = inject(SiteService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);

  readonly tree = signal<SiteNode[]>([]);
  readonly expandedIds = signal<Set<string>>(new Set());
  readonly loadingIds = signal<Set<string>>(new Set());
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly isAdmin = signal(false);

  readonly selected = signal<SiteNode | null>(null);

  readonly visibleNodes = computed<Array<{ node: SiteNode; depth: number }>>(() => {
    const out: Array<{ node: SiteNode; depth: number }> = [];
    const walk = (nodes: SiteNode[], depth: number): void => {
      for (const node of nodes) {
        out.push({ node, depth });
        if (this.expandedIds().has(node.id)) {
          walk(node.children, depth + 1);
        }
      }
    };
    walk(this.tree(), 0);
    return out;
  });

  readonly memberColumns: string[] = ['user', 'contact', 'joined', 'actions'];
  readonly members = signal<RoomMember[]>([]);
  readonly roomName = signal<string | null>(null);
  readonly membersLoading = signal(false);
  readonly membersError = signal<string | null>(null);

  readonly drawerOpen = signal(false);
  readonly drawerLoading = signal(false);
  readonly drawerFilter = signal('');
  readonly nonMembers = signal<CandidateUser[]>([]);
  readonly selectedUserIds = signal<string[]>([]);
  readonly adding = signal(false);

  readonly canAdd = computed(() => {
    const sel = this.selected();
    return !!sel && sel.type !== 'device';
  });

  readonly canRemove = computed(() => {
    const sel = this.selected();
    return !!sel && sel.type !== 'building';
  });

  readonly filteredNonMembers = computed(() => {
    const query = this.drawerFilter().trim().toLowerCase();
    if (!query) {
      return this.nonMembers();
    }
    return this.nonMembers().filter(
      (user) =>
        user.full_name.toLowerCase().includes(query) ||
        (user.email ?? '').toLowerCase().includes(query),
    );
  });

  readonly allSelected = computed(
    () =>
      this.filteredNonMembers().length > 0 &&
      this.filteredNonMembers().every((user) => this.isSelected(user.id)),
  );

  readonly someSelected = computed(() => {
    const list = this.filteredNonMembers();
    const count = list.filter((user) => this.isSelected(user.id)).length;
    return count > 0 && count < list.length;
  });

  constructor() {
    void this.auth.isCurrentUserAdmin().then((admin) => {
      this.isAdmin.set(admin);
      if (admin) {
        void this.loadTree();
      } else {
        this.loading.set(false);
      }
    });
  }

  canExpand(node: SiteNode): boolean {
    return node.type !== 'device';
  }

  isExpanded(node: SiteNode): boolean {
    return this.expandedIds().has(node.id);
  }

  isLoading(node: SiteNode): boolean {
    return this.loadingIds().has(node.id);
  }

  async loadTree(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const nodes = await this.siteService.listBuildings();
      this.tree.set(nodes);
      this.expandedIds.set(new Set());
      this.selected.set(null);
      this.members.set([]);
      this.roomName.set(null);
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  async onToggle(node: SiteNode): Promise<void> {
    if (!this.canExpand(node)) {
      return;
    }
    if (!node.loaded) {
      this.loadingIds.update((set) => new Set(set).add(node.id));
      try {
        node.children = await this.siteService.listChildren(node);
        node.loaded = true;
      } catch (err) {
        this.notice.set((err as Error).message);
        this.loadingIds.update((set) => {
          const next = new Set(set);
          next.delete(node.id);
          return next;
        });
        return;
      }
      this.loadingIds.update((set) => {
        const next = new Set(set);
        next.delete(node.id);
        return next;
      });
      this.tree.update((value) => value);
    }
    this.expandedIds.update((set) => {
      const next = new Set(set);
      if (next.has(node.id)) {
        next.delete(node.id);
      } else {
        next.add(node.id);
      }
      return next;
    });
  }

  onToggleSelect(node: SiteNode, checked: boolean): void {
    if (checked) {
      this.onSelect(node);
    } else {
      this.selected.set(null);
      this.members.set([]);
      this.roomName.set(null);
    }
  }

  onSelect(node: SiteNode): void {
    this.selected.set(node);
    if (node.type === 'room') {
      void this.loadMembers(node);
    } else {
      this.members.set([]);
      this.roomName.set(null);
    }
  }

  async loadMembers(node: SiteNode): Promise<void> {
    this.membersLoading.set(true);
    this.membersError.set(null);
    this.roomName.set(node.name);
    try {
      this.members.set(await this.siteService.listRoomMembers(node.id));
    } catch (err) {
      this.membersError.set((err as Error).message);
    } finally {
      this.membersLoading.set(false);
    }
  }

  async openAddDialog(): Promise<void> {
    const sel = this.selected();
    if (!sel) {
      return;
    }
    const ref = this.dialog.open(AddSiteDialogComponent, {
      width: '480px',
      maxWidth: '95vw',
      autoFocus: 'first-tabbable',
      data: { parentType: sel.type, parentName: sel.name, parentId: sel.id },
    });
    const ok = await firstValueFrom(ref.afterClosed());
    if (ok) {
      await this.refreshNode(sel);
      this.notice.set(`Đã thêm ${childLabel(sel.type)} mới bên dưới "${sel.name}".`);
    }
  }

  async onRemove(): Promise<void> {
    const sel = this.selected();
    if (!sel || sel.type === 'building') {
      return;
    }
    const childCount = this.countDescendants(sel);
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: `Xóa ${this.typeLabel(sel.type)}`,
        message: `Xóa "${sel.name}"${
          childCount > 0 ? ` cùng ${childCount} mục con` : ''
        }? Thao tác này không thể hoàn tác.`,
        confirmLabel: 'Xóa',
        icon: 'delete',
      },
    });
    const confirmed = await firstValueFrom(ref.afterClosed());
    if (!confirmed) {
      return;
    }
    try {
      await this.siteService.removeSite(sel);
      this.selected.set(null);
      this.members.set([]);
      this.roomName.set(null);
      this.notice.set(`Đã xóa "${sel.name}".`);
      const parent = this.findParent(this.tree(), sel);
      if (parent) {
        await this.refreshNode(parent);
      } else {
        await this.loadTree();
      }
    } catch (err) {
      this.notice.set((err as Error).message);
    }
  }

  private findParent(nodes: SiteNode[], target: SiteNode): SiteNode | null {
    for (const node of nodes) {
      if (node.children.some((child) => child.id === target.id)) {
        return node;
      }
      const found = this.findParent(node.children, target);
      if (found) {
        return found;
      }
    }
    return null;
  }

  private async refreshNode(node: SiteNode): Promise<void> {
    try {
      node.children = await this.siteService.listChildren(node);
      node.loaded = true;
      this.tree.update((value) => value);
    } catch (err) {
      this.notice.set((err as Error).message);
    }
  }

  private countDescendants(node: SiteNode): number {
    return node.children.reduce((sum, child) => sum + 1 + this.countDescendants(child), 0);
  }

  async openAddMemberDrawer(): Promise<void> {
    const sel = this.selected();
    if (!sel || sel.type !== 'room') {
      return;
    }
    this.drawerLoading.set(true);
    try {
      this.nonMembers.set(await this.siteService.listNonMemberProfiles(sel.id));
      this.selectedUserIds.set([]);
      this.drawerFilter.set('');
      this.drawerOpen.set(true);
    } catch (err) {
      this.notice.set((err as Error).message);
    } finally {
      this.drawerLoading.set(false);
    }
  }

  onDrawerFilter(event: Event): void {
    this.drawerFilter.set((event.target as HTMLInputElement).value);
  }

  isSelected(userId: string): boolean {
    return this.selectedUserIds().includes(userId);
  }

  toggleUser(userId: string, checked: boolean): void {
    this.selectedUserIds.update((list) =>
      checked ? [...list, userId] : list.filter((id) => id !== userId),
    );
  }

  toggleAll(checked: boolean): void {
    const ids = this.filteredNonMembers().map((user) => user.id);
    this.selectedUserIds.update((list) =>
      checked
        ? Array.from(new Set([...list, ...ids]))
        : list.filter((id) => !ids.includes(id)),
    );
  }

  async addSelectedMembers(): Promise<void> {
    const sel = this.selected();
    if (!sel) {
      return;
    }
    const ids = this.selectedUserIds();
    if (ids.length === 0) {
      return;
    }
    this.adding.set(true);
    try {
      const profile = await this.auth.getCurrentProfile();
      await this.siteService.addMembers(sel.id, ids, profile?.id ?? null);
      this.drawerOpen.set(false);
      this.notice.set(`Đã thêm ${ids.length} thành viên vào "${sel.name}".`);
      await this.loadMembers(sel);
    } catch (err) {
      this.notice.set((err as Error).message);
    } finally {
      this.adding.set(false);
    }
  }

  async onRemoveMember(member: RoomMember): Promise<void> {
    const room = this.roomName();
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Loại thành viên',
        message: `Loại "${member.full_name}" ra khỏi phòng "${room}"?`,
        confirmLabel: 'Loại',
        icon: 'person_remove',
      },
    });
    const confirmed = await firstValueFrom(ref.afterClosed());
    if (!confirmed) {
      return;
    }
    try {
      await this.siteService.removeMember(member.id);
      this.members.update((list) => list.filter((m) => m.id !== member.id));
      this.notice.set(`Đã loại "${member.full_name}" khỏi phòng.`);
    } catch (err) {
      this.notice.set((err as Error).message);
    }
  }

  iconFor(node: SiteNode): string {
    switch (node.type) {
      case 'building':
        return 'apartment';
      case 'floor':
        return 'stairs';
      case 'room':
        return 'meeting_room';
      case 'door':
        return 'door_front';
      default:
        return 'memory';
    }
  }

  typeLabel(type: SiteNode['type']): string {
    switch (type) {
      case 'building':
        return 'tòa nhà';
      case 'floor':
        return 'tầng';
      case 'room':
        return 'phòng';
      case 'door':
        return 'cửa';
      default:
        return 'thiết bị';
    }
  }

  avatarText(value: string): string {
    return initialsFromName(value);
  }

  formatDate(value?: string | null): string {
    return formatDateTime(value);
  }
}