-- =========================================================
-- MIGRATION: SITE HIERARCHY
-- Building (root) -> Floor -> Room -> Door -> Device
-- Dành cho DB đã tồn tại. Idempotent — chạy lại được nhiều lần.
-- =========================================================

-- 1. BUILDINGS (root of hierarchy)
create table if not exists public.buildings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint buildings_name_unique unique (name)
);

-- 2. FLOORS
create table if not exists public.floors (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  name text not null,
  level int not null default 0,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint floors_building_name_unique unique (building_id, name)
);

-- 3. ROOMS: them floor_id (giu lai room_name/building_name de tuong thich)
alter table public.rooms add column if not exists floor_id uuid references public.floors(id) on delete cascade;

-- 4. DOORS
create table if not exists public.doors (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  name text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint doors_room_name_unique unique (room_id, name)
);

-- 5. DEVICES: them door_id (on delete cascade -> xoa door la xoa device)
alter table public.devices add column if not exists door_id uuid references public.doors(id) on delete cascade;

-- 6. TRIGGERS updated_at
drop trigger if exists set_buildings_updated_at on public.buildings;
create trigger set_buildings_updated_at
before update on public.buildings
for each row execute function public.set_updated_at();

drop trigger if exists set_floors_updated_at on public.floors;
create trigger set_floors_updated_at
before update on public.floors
for each row execute function public.set_updated_at();

drop trigger if exists set_doors_updated_at on public.doors;
create trigger set_doors_updated_at
before update on public.doors
for each row execute function public.set_updated_at();

-- 7. INDEXES
create index if not exists idx_floors_building_id on public.floors(building_id);
create index if not exists idx_rooms_floor_id on public.rooms(floor_id);
create index if not exists idx_doors_room_id on public.doors(room_id);
create index if not exists idx_devices_door_id on public.devices(door_id);

-- 8. ENABLE RLS
alter table public.buildings enable row level security;
alter table public.floors enable row level security;
alter table public.doors enable row level security;

-- 9. RLS POLICIES
drop policy if exists buildings_admin_all on public.buildings;
create policy buildings_admin_all
on public.buildings
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists buildings_authenticated_select on public.buildings;
create policy buildings_authenticated_select
on public.buildings
for select
to authenticated
using (true);

drop policy if exists floors_admin_all on public.floors;
create policy floors_admin_all
on public.floors
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists floors_authenticated_select on public.floors;
create policy floors_authenticated_select
on public.floors
for select
to authenticated
using (true);

drop policy if exists doors_admin_all on public.doors;
create policy doors_admin_all
on public.doors
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists doors_authenticated_select on public.doors;
create policy doors_authenticated_select
on public.doors
for select
to authenticated
using (true);

-- 10. DEVICE COMMANDS: chi member cua phong so huu device moi duoc checkin/checkout
drop policy if exists device_commands_user_insert on public.device_commands;
create policy device_commands_user_insert
on public.device_commands
for insert
to authenticated
with check (
  command in ('start_checkin', 'start_checkout')
  and status = 'pending'
  and requested_by = public.current_profile_id()
  and exists (
    select 1
    from public.devices d
    join public.room_permissions rp on rp.room_id = d.room_id
    where d.id = device_id
      and rp.user_id = requested_by
      and rp.permission_status = 'allowed'
  )
);

-- 11. SEED: Tro A (Building -> Tang 1..3 -> Phong 101..302 -> Cua chinh -> DOOR_xxx)
insert into public.buildings (name, description)
values ('Trọ A', 'Nhà trọ A – 3 tầng')
on conflict (name) do nothing;

insert into public.floors (building_id, name, level)
select b.id, v.name, v.level
from (values ('Tầng 1', 1), ('Tầng 2', 2), ('Tầng 3', 3)) as v(name, level)
join public.buildings b on b.name = 'Trọ A'
on conflict (building_id, name) do nothing;

insert into public.rooms (room_name, floor, building_name, floor_id)
select v.room_name, v.floor_name, 'Trọ A', f.id
from (values
  ('Phòng 101', 'Tầng 1'), ('Phòng 102', 'Tầng 1'), ('Phòng 103', 'Tầng 1'),
  ('Phòng 201', 'Tầng 2'), ('Phòng 202', 'Tầng 2'),
  ('Phòng 301', 'Tầng 3'), ('Phòng 302', 'Tầng 3')
) as v(room_name, floor_name)
join public.floors f
  on f.name = v.floor_name
 and f.building_id = (select id from public.buildings where name = 'Trọ A')
on conflict (room_name, building_name) do update set floor_id = excluded.floor_id;

insert into public.doors (room_id, name)
select r.id, 'Cửa chính'
from public.rooms r
where r.building_name = 'Trọ A'
on conflict (room_id, name) do nothing;

insert into public.devices (room_id, door_id, device_name, device_code, status, door_status)
select r.id, d.id, 'Raspberry Pi Door Device', 'DOOR_' || substr(r.room_name, 7), 'offline', 'locked'
from public.rooms r
join public.doors d on d.room_id = r.id and d.name = 'Cửa chính'
where r.building_name = 'Trọ A'
on conflict (device_code) do update set
  room_id = excluded.room_id,
  door_id = excluded.door_id,
  device_name = excluded.device_name,
  updated_at = now();