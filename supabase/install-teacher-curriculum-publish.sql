-- 담당 교사도 기존 학교·입학년도의 편제표를 최신 작업본으로 교체할 수 있게 합니다.
-- Supabase Dashboard > SQL Editor에서 이 파일 전체를 한 번 실행하세요.

begin;

grant select, insert, update on table public.curricula to authenticated;

drop policy if exists "admins update curriculum" on public.curricula;
drop policy if exists "members update own school curriculum" on public.curricula;
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

commit;

notify pgrst, 'reload schema';
