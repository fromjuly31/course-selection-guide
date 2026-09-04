-- 임시저장 전용 설치 SQL
-- Supabase Dashboard > SQL Editor > New query에서 이 파일 전체를 실행하세요.

create table if not exists public.curriculum_drafts (
  id uuid primary key default gen_random_uuid(),
  school_name text not null
    constraint curriculum_drafts_school_name_check
    check (btrim(school_name) ~ '.+고등학교$'),
  region text not null
    constraint curriculum_drafts_region_check
    check (region in (
      '서울특별시', '부산광역시', '대구광역시', '인천광역시', '광주광역시', '대전광역시', '울산광역시',
      '세종특별자치시', '경기도', '강원특별자치도', '충청북도', '충청남도', '전북특별자치도', '전라남도',
      '경상북도', '경상남도', '제주특별자치도'
    )),
  entry_mode text not null default 'manual'
    check (entry_mode in ('manual', 'upload')),
  data jsonb not null
    check (jsonb_typeof(data) = 'object'),
  updated_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (updated_by, region, school_name)
);

alter table public.curriculum_drafts enable row level security;

revoke all on table public.curriculum_drafts from anon, authenticated;
grant select, insert, update, delete on table public.curriculum_drafts to authenticated;

drop policy if exists "platform users read own curriculum drafts" on public.curriculum_drafts;
create policy "platform users read own curriculum drafts"
on public.curriculum_drafts for select
to authenticated
using (
  updated_by = (select auth.uid())
  or exists (
    select 1 from public.platform_users
    where platform_users.user_id = (select auth.uid())
      and platform_users.role = 'admin'
  )
);

drop policy if exists "platform users add own curriculum drafts" on public.curriculum_drafts;
create policy "platform users add own curriculum drafts"
on public.curriculum_drafts for insert
to authenticated
with check (
  updated_by = (select auth.uid())
  and exists (
    select 1 from public.platform_users
    where platform_users.user_id = (select auth.uid())
      and platform_users.role in ('admin', 'teacher')
  )
);

drop policy if exists "platform users update own curriculum drafts" on public.curriculum_drafts;
create policy "platform users update own curriculum drafts"
on public.curriculum_drafts for update
to authenticated
using (
  updated_by = (select auth.uid())
  or exists (
    select 1 from public.platform_users
    where platform_users.user_id = (select auth.uid())
      and platform_users.role = 'admin'
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

drop policy if exists "platform users delete own curriculum drafts" on public.curriculum_drafts;
create policy "platform users delete own curriculum drafts"
on public.curriculum_drafts for delete
to authenticated
using (
  updated_by = (select auth.uid())
  or exists (
    select 1 from public.platform_users
    where platform_users.user_id = (select auth.uid())
      and platform_users.role = 'admin'
  )
);

-- 새 테이블을 REST API에서 즉시 인식하도록 스키마 캐시를 갱신합니다.
notify pgrst, 'reload schema';
