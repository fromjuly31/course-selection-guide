-- 메인 화면 TODAY / TOTAL 접속 횟수 카운터
-- Supabase Dashboard > SQL Editor > New query에서 이 파일 전체를 한 번 실행하세요.

create table if not exists public.visitor_statistics (
  singleton boolean primary key default true check (singleton = true),
  counter_date date not null,
  today_count bigint not null default 0 check (today_count >= 0),
  total_count bigint not null default 0 check (total_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.visitor_statistics enable row level security;
revoke all on table public.visitor_statistics from anon, authenticated;

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

  return next;
end;
$$;

revoke execute on function public.register_page_visit() from public;
grant execute on function public.register_page_visit() to anon, authenticated;
