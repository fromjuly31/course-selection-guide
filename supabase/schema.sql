-- 선택 과목 안내 플랫폼: 학교별 편제표 저장 구조
-- Supabase Dashboard > SQL Editor에서 전체 실행하세요.

create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null constraint schools_name_high_school_check check (btrim(name) ~ '.+고등학교$'),
  region text not null default '' constraint schools_region_education_office_check check (region in (
    '서울특별시', '부산광역시', '대구광역시', '인천광역시', '광주광역시', '대전광역시', '울산광역시',
    '세종특별자치시', '경기도', '강원특별자치도', '충청북도', '충청남도', '전북특별자치도', '전라남도',
    '경상북도', '경상남도', '제주특별자치도'
  )),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 기존 프로젝트에도 새 입력 검증을 적용합니다. NOT VALID는 과거 행 때문에 설치가 중단되는 것을 막고 새 행부터 검증합니다.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'schools_name_high_school_check' and conrelid = 'public.schools'::regclass) then
    alter table public.schools add constraint schools_name_high_school_check check (btrim(name) ~ '.+고등학교$') not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'schools_region_education_office_check' and conrelid = 'public.schools'::regclass) then
    alter table public.schools add constraint schools_region_education_office_check check (region in (
      '서울특별시', '부산광역시', '대구광역시', '인천광역시', '광주광역시', '대전광역시', '울산광역시',
      '세종특별자치시', '경기도', '강원특별자치도', '충청북도', '충청남도', '전북특별자치도', '전라남도',
      '경상북도', '경상남도', '제주특별자치도'
    )) not valid;
  end if;
end $$;

create table if not exists public.school_members (
  user_id uuid not null references auth.users(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  role text not null default 'editor' check (role in ('owner', 'editor')),
  created_at timestamptz not null default now(),
  primary key (user_id, school_id)
);

-- 관리자와 담당 교사의 역할을 저장합니다.
-- school_members는 이전 설치와의 호환을 위해 남겨 두지만 새 업로드 권한에는 사용하지 않습니다.
create table if not exists public.platform_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'teacher')),
  created_at timestamptz not null default now()
);

create table if not exists public.curricula (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  admission_year integer not null check (admission_year between 2022 and 2100),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  is_published boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, admission_year)
);

create index if not exists curricula_school_published_idx
  on public.curricula (school_id, is_published, admission_year desc);

create unique index if not exists schools_name_region_unique_idx
  on public.schools (lower(name), lower(region));

alter table public.schools enable row level security;
alter table public.school_members enable row level security;
alter table public.platform_users enable row level security;
alter table public.curricula enable row level security;

revoke all on table public.schools, public.school_members, public.platform_users, public.curricula from anon, authenticated;
grant select on table public.schools to anon, authenticated;
grant select on table public.curricula to anon, authenticated;
grant select on table public.platform_users to authenticated;
grant insert on table public.schools, public.curricula to authenticated;
grant update, delete on table public.schools, public.curricula to authenticated;

drop policy if exists "active schools are public" on public.schools;
create policy "active schools are public"
on public.schools for select
to anon, authenticated
using (is_active = true);

drop policy if exists "platform users read own access" on public.platform_users;
create policy "platform users read own access"
on public.platform_users for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "platform users add schools" on public.schools;
create policy "platform users add schools"
on public.schools for insert
to authenticated
with check (
  exists (
    select 1 from public.platform_users
    where platform_users.user_id = (select auth.uid())
      and platform_users.role in ('admin', 'teacher')
  )
);

drop policy if exists "admins update schools" on public.schools;
create policy "admins update schools"
on public.schools for update
to authenticated
using (
  exists (
    select 1 from public.platform_users
    where platform_users.user_id = (select auth.uid())
      and platform_users.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.platform_users
    where platform_users.user_id = (select auth.uid())
      and platform_users.role = 'admin'
  )
);

drop policy if exists "admins delete schools" on public.schools;
create policy "admins delete schools"
on public.schools for delete
to authenticated
using (
  exists (
    select 1 from public.platform_users
    where platform_users.user_id = (select auth.uid())
      and platform_users.role = 'admin'
  )
);

drop policy if exists "published curricula are public" on public.curricula;
create policy "published curricula are public"
on public.curricula for select
to anon, authenticated
using (
  is_published = true
  and exists (
    select 1 from public.schools
    where schools.id = curricula.school_id and schools.is_active = true
  )
);

drop policy if exists "platform users add curriculum" on public.curricula;
create policy "platform users add curriculum"
on public.curricula for insert
to authenticated
with check (
  updated_by = (select auth.uid())
  and exists (
    select 1 from public.platform_users
    where platform_users.user_id = (select auth.uid())
      and platform_users.role in ('admin', 'teacher')
  )
);

drop policy if exists "admins update curriculum" on public.curricula;
drop policy if exists "platform users update curriculum" on public.curricula;
create policy "platform users update curriculum"
on public.curricula for update
to authenticated
using (
  exists (
    select 1 from public.platform_users
    where platform_users.user_id = (select auth.uid())
      and platform_users.role in ('admin', 'teacher')
  )
)
with check (
  updated_by = (select auth.uid())
  and exists (
    select 1 from public.platform_users
    where platform_users.user_id = (select auth.uid())
      and platform_users.role in ('admin', 'teacher')
  )
);

drop policy if exists "admins delete curriculum" on public.curricula;
create policy "admins delete curriculum"
on public.curricula for delete
to authenticated
using (
  exists (
    select 1 from public.platform_users
    where platform_users.user_id = (select auth.uid())
      and platform_users.role = 'admin'
  )
);

-- 이전 버전의 학교별 담당자 정책을 제거합니다.
drop policy if exists "members read own membership" on public.school_members;
drop policy if exists "members insert own school curriculum" on public.curricula;
drop policy if exists "members update own school curriculum" on public.curricula;
drop policy if exists "owners delete own school curriculum" on public.curricula;
drop policy if exists "platform admins add schools" on public.schools;
drop policy if exists "platform admins add curriculum" on public.curricula;

-- Authentication > Users에서 관리자와 담당 교사 계정을 만든 뒤 역할을 연결합니다.
-- 담당 교사 계정의 이메일은 supabase-config.js의 teacherEmail에 입력하며,
-- 웹 화면에서는 이메일을 숨기고 관리 비밀번호만 받습니다.
--
-- insert into public.platform_users (user_id, role) values
--   ('관리자-USER-UUID', 'admin'),
--   ('담당교사-USER-UUID', 'teacher');
