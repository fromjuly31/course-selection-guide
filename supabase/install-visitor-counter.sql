-- 메인 화면 TODAY / TOTAL 접속 횟수 카운터
-- Supabase Dashboard > SQL Editor > New query에서 이 파일 전체를 한 번 실행하세요.

create table if not exists public.visitor_statistics (
  singleton boolean primary key default true check (singleton = true),
  counter_date date not null,
  today_count bigint not null default 0 check (today_count >= 0),
  total_count bigint not null default 0 check (total_count >= 0),
  updated_at timestamptz not null default now()
);

-- 그래프용 일별 집계입니다. 접속 건별 정보는 저장하지 않고 날짜마다 한 행만 유지합니다.
create table if not exists public.visitor_daily_counts (
  counter_date date primary key,
  visit_count bigint not null default 0 check (visit_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.visitor_statistics enable row level security;
alter table public.visitor_daily_counts enable row level security;
revoke all on table public.visitor_statistics, public.visitor_daily_counts from anon, authenticated;

-- 기존 TODAY 값은 설치 당일의 첫 일별 통계로 보존합니다. 파일을 다시 실행해도 중복 합산되지 않습니다.
insert into public.visitor_daily_counts as daily (counter_date, visit_count, updated_at)
select counter_date, today_count, updated_at
from public.visitor_statistics
where singleton = true
on conflict (counter_date) do update
set
  visit_count = greatest(daily.visit_count, excluded.visit_count),
  updated_at = greatest(daily.updated_at, excluded.updated_at);

create or replace function public.register_page_visit()
returns table (today_count bigint, total_count bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_korea_date date := (pg_catalog.now() at time zone 'Asia/Seoul')::date;
begin
  insert into public.visitor_statistics as counters (
    singleton,
    counter_date,
    today_count,
    total_count,
    updated_at
  )
  values (true, current_korea_date, 1, 1, pg_catalog.now())
  on conflict (singleton) do update
  set
    counter_date = excluded.counter_date,
    today_count = case
      when counters.counter_date = excluded.counter_date then counters.today_count + 1
      else 1
    end,
    total_count = counters.total_count + 1,
    updated_at = excluded.updated_at
  returning counters.today_count, counters.total_count
  into today_count, total_count;

  insert into public.visitor_daily_counts as daily (
    counter_date,
    visit_count,
    updated_at
  )
  values (current_korea_date, 1, pg_catalog.now())
  on conflict (counter_date) do update
  set
    visit_count = daily.visit_count + 1,
    updated_at = excluded.updated_at;

  return next;
end;
$$;

-- 인증된 관리자에게만 일별 통계와 요약 숫자를 제공합니다.
create or replace function public.get_visitor_statistics()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_korea_date date := (pg_catalog.now() at time zone 'Asia/Seoul')::date;
  current_today_count bigint := 0;
  current_total_count bigint := 0;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.platform_users
    where platform_users.user_id = auth.uid()
      and platform_users.role = 'admin'
  ) then
    raise exception '관리자 권한이 필요합니다.' using errcode = '42501';
  end if;

  select
    case
      when statistics.counter_date = current_korea_date then statistics.today_count
      else 0
    end,
    statistics.total_count
  into current_today_count, current_total_count
  from public.visitor_statistics as statistics
  where statistics.singleton = true;

  return pg_catalog.jsonb_build_object(
    'counter_date', current_korea_date,
    'today_count', coalesce(current_today_count, 0),
    'total_count', coalesce(current_total_count, 0),
    'series', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'date', daily.counter_date,
          'count', daily.visit_count
        )
        order by daily.counter_date
      )
      from public.visitor_daily_counts as daily
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.register_page_visit() from public;
revoke execute on function public.get_visitor_statistics() from public, anon;
grant execute on function public.register_page_visit() to anon, authenticated;
grant execute on function public.get_visitor_statistics() to authenticated;
