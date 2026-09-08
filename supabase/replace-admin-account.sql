-- 기존 관리자 권한 연결을 모두 제거하고 새 Supabase Auth 계정 하나로 교체합니다.
-- 학교, 편제표, 임시저장본, 방문 통계 데이터는 삭제하지 않습니다.
--
-- 실행 전 준비:
-- 1. Supabase Dashboard > Authentication > Users에서 새 관리자 계정을 먼저 만드세요.
-- 2. 아래 new_admin_email 값만 새 관리자 이메일로 바꾸세요.
-- 3. SQL Editor > New query에서 이 파일 전체를 실행하세요.

do $replace_admin$
declare
  new_admin_email text := '새관리자@example.com';
  new_admin_id uuid;
begin
  if btrim(new_admin_email) = '' or new_admin_email = '새관리자@example.com' then
    raise exception 'replace-admin-account.sql의 new_admin_email을 실제 관리자 이메일로 바꿔 주세요.';
  end if;

  select users.id
  into new_admin_id
  from auth.users as users
  where lower(users.email) = lower(btrim(new_admin_email))
  limit 1;

  if new_admin_id is null then
    raise exception 'Authentication > Users에서 % 계정을 찾을 수 없습니다. 계정을 먼저 만든 뒤 다시 실행하세요.', new_admin_email;
  end if;

  -- 새 계정 확인이 끝난 다음에만 기존 관리자 권한을 제거합니다.
  delete from public.platform_users
  where role = 'admin';

  insert into public.platform_users (user_id, role)
  values (new_admin_id, 'admin')
  on conflict (user_id) do update
  set role = excluded.role;

  raise notice '관리자 계정을 % (%)로 교체했습니다.', new_admin_email, new_admin_id;
end
$replace_admin$;

-- 실행 결과 확인: 아래 조회 결과가 새 관리자 한 명이면 정상입니다.
select
  auth_users.email,
  platform_users.user_id,
  platform_users.role,
  platform_users.created_at
from public.platform_users
join auth.users as auth_users
  on auth_users.id = platform_users.user_id
where platform_users.role = 'admin';
