-- 과목 선택 안내 플랫폼: 학교별 편제표 저장 구조
-- Supabase Dashboard > SQL Editor에서 전체 실행하세요.

create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  region text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.school_members (
  user_id uuid not null references auth.users(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  role text not null default 'editor' check (role in ('owner', 'editor')),
  created_at timestamptz not null default now(),
  primary key (user_id, school_id)
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

alter table public.schools enable row level security;
alter table public.school_members enable row level security;
alter table public.curricula enable row level security;

revoke all on table public.schools, public.school_members, public.curricula from anon, authenticated;
grant select on table public.schools to anon, authenticated;
grant select on table public.curricula to anon, authenticated;
grant select on table public.school_members to authenticated;
grant insert, update, delete on table public.curricula to authenticated;

drop policy if exists "active schools are public" on public.schools;
create policy "active schools are public"
on public.schools for select
to anon, authenticated
using (is_active = true);

drop policy if exists "members read own membership" on public.school_members;
create policy "members read own membership"
on public.school_members for select
to authenticated
using ((select auth.uid()) = user_id);

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

drop policy if exists "members insert own school curriculum" on public.curricula;
create policy "members insert own school curriculum"
on public.curricula for insert
to authenticated
with check (
  updated_by = (select auth.uid())
  and exists (
    select 1 from public.school_members
    where school_members.school_id = curricula.school_id
      and school_members.user_id = (select auth.uid())
  )
);

drop policy if exists "members update own school curriculum" on public.curricula;
create policy "members update own school curriculum"
on public.curricula for update
to authenticated
using (
  exists (
    select 1 from public.school_members
    where school_members.school_id = curricula.school_id
      and school_members.user_id = (select auth.uid())
  )
)
with check (
  updated_by = (select auth.uid())
  and exists (
    select 1 from public.school_members
    where school_members.school_id = curricula.school_id
      and school_members.user_id = (select auth.uid())
  )
);

drop policy if exists "owners delete own school curriculum" on public.curricula;
create policy "owners delete own school curriculum"
on public.curricula for delete
to authenticated
using (
  exists (
    select 1 from public.school_members
    where school_members.school_id = curricula.school_id
      and school_members.user_id = (select auth.uid())
      and school_members.role = 'owner'
  )
);

-- 학교와 담당자 계정은 Supabase 최고 관리자가 만든 뒤 아래처럼 연결합니다.
-- 1) Authentication > Users에서 담당자 생성 후 UUID 복사
-- 2) SQL Editor에서 아래 예시의 값을 바꿔 실행
--
-- insert into public.schools (slug, name, region)
-- values ('wonju-girls', '원주여자고등학교', '강원특별자치도')
-- returning id;
--
-- insert into public.school_members (user_id, school_id, role)
-- values ('담당자-USER-UUID', '위에서-반환된-SCHOOL-UUID', 'owner');
