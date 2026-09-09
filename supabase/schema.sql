-- =========================================================
-- SMARTLOCK PROJECT - SUPABASE FULL DATABASE SCRIPT - FIXED
-- =========================================================

create extension if not exists "pgcrypto";

-- =========================================================
-- 1. PROFILES - USER MANAGEMENT
-- Tạo profiles trước vì các function phía sau cần dùng bảng này
-- =========================================================

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),

  auth_user_id uuid unique references auth.users(id) on delete set null,

  full_name text not null,
  email text,
  phone text,

  role text not null default 'user'
    check (role in ('admin', 'user')),

  status text not null default 'active'
    check (status in ('active', 'blocked', 'pending')),

  avatar_url text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- 2. HELPER FUNCTIONS
-- =========================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.profiles p
  where p.auth_user_id = auth.uid()
  limit 1;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    exists (
      select 1
      from public.profiles p
      where p.auth_user_id = auth.uid()
        and p.role = 'admin'
        and p.status = 'active'
    ),
    false
  );
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- =========================================================
-- 3. ROOMS
-- =========================================================

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),

  room_name text not null,
  floor text,
  building_name text default 'SmartLock Home',
  description text,

  status text not null default 'active'
    check (status in ('active', 'inactive')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint rooms_unique unique (room_name, building_name)
);

drop trigger if exists set_rooms_updated_at on public.rooms;
create trigger set_rooms_updated_at
before update on public.rooms
for each row execute function public.set_updated_at();

-- =========================================================
-- 4. DEVICES
-- =========================================================

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),

  room_id uuid references public.rooms(id) on delete set null,

  device_name text not null,
  device_code text not null unique,

  status text not null default 'offline'
    check (status in ('online', 'offline', 'error')),

  door_status text not null default 'locked'
    check (door_status in ('locked', 'unlocked')),

  ip_address text,
  last_seen timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_devices_updated_at on public.devices;
create trigger set_devices_updated_at
before update on public.devices
for each row execute function public.set_updated_at();

-- =========================================================
-- 5. FACE PROFILES
-- =========================================================

create table if not exists public.face_profiles (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references public.profiles(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete set null,
  registered_by_device_id uuid references public.devices(id) on delete set null,

  -- Tên này phải trùng với tên trong face_db.npy
  face_name text not null unique,

  avatar_url text,
  sample_count int default 10,

  model_name text default 'YuNet + SFace',
  face_db_source text default 'face_db.npy',

  status text not null default 'not_registered'
    check (status in ('not_registered', 'registered', 'pending', 'rejected', 'disabled')),

  registered_at timestamptz,

  note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_face_profiles_updated_at on public.face_profiles;
create trigger set_face_profiles_updated_at
before update on public.face_profiles
for each row execute function public.set_updated_at();

-- =========================================================
-- 6. ROOM PERMISSIONS
-- =========================================================

create table if not exists public.room_permissions (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references public.profiles(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,

  permission_status text not null default 'allowed'
    check (permission_status in ('allowed', 'denied', 'pending', 'revoked')),

  valid_from timestamptz default now(),
  valid_to timestamptz,

  created_by uuid references public.profiles(id) on delete set null,
  note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint room_permissions_unique unique (user_id, room_id)
);

drop trigger if exists set_room_permissions_updated_at on public.room_permissions;
create trigger set_room_permissions_updated_at
before update on public.room_permissions
for each row execute function public.set_updated_at();

-- =========================================================
-- 7. ACCESS LOGS
-- =========================================================

create table if not exists public.access_logs (
  id uuid primary key default gen_random_uuid(),

  user_id uuid references public.profiles(id) on delete set null,
  room_id uuid references public.rooms(id) on delete set null,
  device_id uuid references public.devices(id) on delete set null,
  face_profile_id uuid references public.face_profiles(id) on delete set null,

  face_name text,

  result text not null
    check (result in ('granted', 'denied', 'no_face', 'unknown', 'error')),

  similarity real,
  threshold real default 0.32,

  captured_image_url text,
  note text,

  access_time timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- =========================================================
-- 8. ALERTS
-- =========================================================

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),

  alert_type text not null
    check (
      alert_type in (
        'unknown_face',
        'access_denied',
        'no_face',
        'low_similarity',
        'device_offline',
        'camera_error',
        'door_open_too_long',
        'device_error'
      )
    ),

  title text not null,
  message text,

  user_id uuid references public.profiles(id) on delete set null,
  room_id uuid references public.rooms(id) on delete set null,
  device_id uuid references public.devices(id) on delete set null,
  access_log_id uuid references public.access_logs(id) on delete set null,

  severity text not null default 'medium'
    check (severity in ('low', 'medium', 'high', 'critical')),

  status text not null default 'new'
    check (status in ('new', 'seen', 'resolved')),

  image_url text,

  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_alerts_updated_at on public.alerts;
create trigger set_alerts_updated_at
before update on public.alerts
for each row execute function public.set_updated_at();

-- =========================================================
-- 9. DEVICE COMMANDS
-- Dùng sau này nếu web muốn gửi lệnh xuống thiết bị
-- =========================================================

create table if not exists public.device_commands (
  id uuid primary key default gen_random_uuid(),

  device_id uuid not null references public.devices(id) on delete cascade,

  command text not null
    check (
      command in (
        'manual_unlock',
        'lock_door',
        'restart_camera',
        'start_register_face',
        'sync_face_db'
      )
    ),

  payload jsonb default '{}'::jsonb,

  status text not null default 'pending'
    check (status in ('pending', 'running', 'done', 'failed', 'cancelled')),

  requested_by uuid references public.profiles(id) on delete set null,

  requested_at timestamptz not null default now(),
  executed_at timestamptz,

  result_message text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_device_commands_updated_at on public.device_commands;
create trigger set_device_commands_updated_at
before update on public.device_commands
for each row execute function public.set_updated_at();

-- =========================================================
-- 10. INDEXES
-- =========================================================

create index if not exists idx_profiles_auth_user_id on public.profiles(auth_user_id);
create index if not exists idx_profiles_role on public.profiles(role);
create index if not exists idx_profiles_status on public.profiles(status);

create index if not exists idx_devices_device_code on public.devices(device_code);
create index if not exists idx_devices_room_id on public.devices(room_id);
create index if not exists idx_devices_status on public.devices(status);

create index if not exists idx_face_profiles_user_id on public.face_profiles(user_id);
create index if not exists idx_face_profiles_room_id on public.face_profiles(room_id);
create index if not exists idx_face_profiles_face_name on public.face_profiles(face_name);
create index if not exists idx_face_profiles_status on public.face_profiles(status);

create index if not exists idx_room_permissions_user_id on public.room_permissions(user_id);
create index if not exists idx_room_permissions_room_id on public.room_permissions(room_id);
create index if not exists idx_room_permissions_status on public.room_permissions(permission_status);

create index if not exists idx_access_logs_user_id on public.access_logs(user_id);
create index if not exists idx_access_logs_room_id on public.access_logs(room_id);
create index if not exists idx_access_logs_device_id on public.access_logs(device_id);
create index if not exists idx_access_logs_result on public.access_logs(result);
create index if not exists idx_access_logs_access_time on public.access_logs(access_time desc);

create index if not exists idx_alerts_status on public.alerts(status);
create index if not exists idx_alerts_severity on public.alerts(severity);
create index if not exists idx_alerts_created_at on public.alerts(created_at desc);

create index if not exists idx_device_commands_device_id on public.device_commands(device_id);
create index if not exists idx_device_commands_status on public.device_commands(status);

-- =========================================================
-- 11. STORAGE BUCKETS
-- =========================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'avatars',
    'avatars',
    true,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'face-images',
    'face-images',
    false,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'access-captures',
    'access-captures',
    false,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'alert-images',
    'alert-images',
    false,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp']
  )
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- =========================================================
-- 12. ENABLE RLS
-- =========================================================

alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.devices enable row level security;
alter table public.face_profiles enable row level security;
alter table public.room_permissions enable row level security;
alter table public.access_logs enable row level security;
alter table public.alerts enable row level security;
alter table public.device_commands enable row level security;

-- =========================================================
-- 13. DROP OLD POLICIES
-- =========================================================

drop policy if exists profiles_admin_all on public.profiles;
drop policy if exists profiles_user_select_own on public.profiles;
drop policy if exists profiles_user_insert_own on public.profiles;

drop policy if exists rooms_admin_all on public.rooms;
drop policy if exists rooms_authenticated_select on public.rooms;

drop policy if exists devices_admin_all on public.devices;
drop policy if exists devices_authenticated_select on public.devices;

drop policy if exists face_profiles_admin_all on public.face_profiles;
drop policy if exists face_profiles_user_select_own on public.face_profiles;

drop policy if exists room_permissions_admin_all on public.room_permissions;
drop policy if exists room_permissions_user_select_own on public.room_permissions;

drop policy if exists access_logs_admin_all on public.access_logs;
drop policy if exists access_logs_user_select_own on public.access_logs;

drop policy if exists alerts_admin_all on public.alerts;
drop policy if exists alerts_user_select_own on public.alerts;

drop policy if exists device_commands_admin_all on public.device_commands;
drop policy if exists device_commands_authenticated_select on public.device_commands;

drop policy if exists storage_admin_all_smartlock on storage.objects;
drop policy if exists storage_authenticated_read_avatars on storage.objects;

-- =========================================================
-- 14. RLS POLICIES
-- =========================================================

-- PROFILES
create policy profiles_admin_all
on public.profiles
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy profiles_user_select_own
on public.profiles
for select
to authenticated
using (auth_user_id = auth.uid());

create policy profiles_user_insert_own
on public.profiles
for insert
to authenticated
with check (
  auth_user_id = auth.uid()
  and role = 'user'
  and status in ('active', 'pending')
);

-- ROOMS
create policy rooms_admin_all
on public.rooms
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy rooms_authenticated_select
on public.rooms
for select
to authenticated
using (true);

-- DEVICES
create policy devices_admin_all
on public.devices
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy devices_authenticated_select
on public.devices
for select
to authenticated
using (true);

-- FACE PROFILES
create policy face_profiles_admin_all
on public.face_profiles
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy face_profiles_user_select_own
on public.face_profiles
for select
to authenticated
using (user_id = public.current_profile_id());

-- ROOM PERMISSIONS
create policy room_permissions_admin_all
on public.room_permissions
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy room_permissions_user_select_own
on public.room_permissions
for select
to authenticated
using (user_id = public.current_profile_id());

-- ACCESS LOGS
create policy access_logs_admin_all
on public.access_logs
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy access_logs_user_select_own
on public.access_logs
for select
to authenticated
using (user_id = public.current_profile_id());

-- ALERTS
create policy alerts_admin_all
on public.alerts
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy alerts_user_select_own
on public.alerts
for select
to authenticated
using (user_id = public.current_profile_id());

-- DEVICE COMMANDS
create policy device_commands_admin_all
on public.device_commands
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy device_commands_authenticated_select
on public.device_commands
for select
to authenticated
using (true);

-- STORAGE
create policy storage_admin_all_smartlock
on storage.objects
for all
to authenticated
using (
  bucket_id in ('avatars', 'face-images', 'access-captures', 'alert-images')
  and public.is_admin()
)
with check (
  bucket_id in ('avatars', 'face-images', 'access-captures', 'alert-images')
  and public.is_admin()
);

create policy storage_authenticated_read_avatars
on storage.objects
for select
to authenticated
using (bucket_id = 'avatars');

-- =========================================================
-- 15. GRANTS
-- =========================================================

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to authenticated, service_role;
grant all on all sequences in schema public to authenticated, service_role;
grant execute on function public.current_profile_id() to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;

-- =========================================================
-- 16. AUTO CREATE PROFILE WHEN USER SIGNS UP
-- =========================================================

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    auth_user_id,
    full_name,
    email,
    role,
    status
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    'user',
    'active'
  )
  on conflict (auth_user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- =========================================================
-- 17. SAMPLE DATA
-- =========================================================

insert into public.rooms (
  room_name,
  floor,
  building_name,
  description
)
values (
  'Main Door',
  '1',
  'SmartLock Home',
  'Cửa chính của hệ thống SmartLock'
)
on conflict (room_name, building_name) do nothing;

insert into public.devices (
  room_id,
  device_name,
  device_code,
  status,
  door_status
)
select
  r.id,
  'Raspberry Pi Door Device',
  'DOOR_01',
  'offline',
  'locked'
from public.rooms r
where r.room_name = 'Main Door'
  and r.building_name = 'SmartLock Home'
limit 1
on conflict (device_code) do update set
  device_name = excluded.device_name,
  room_id = excluded.room_id,
  updated_at = now();

-- =========================================================
-- DONE
-- =========================================================