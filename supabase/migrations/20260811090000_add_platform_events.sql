begin;

create table if not exists public.platform_events (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('ALL','NAVER','CAFE24','COUPANG')),
  event_type text not null check (event_type in ('PLATFORM_CHANGE','CAMPAIGN_CHANGE','BID_CHANGE','LANDING_CHANGE','PROMOTION','DATA_ISSUE','OTHER')),
  effective_date date not null,
  title text not null,
  description text,
  analysis_impact text,
  source_url text,
  affects_comparison boolean not null default true,
  created_by text not null default 'SYSTEM',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists platform_events_date_idx on public.platform_events(effective_date desc);
create index if not exists platform_events_platform_date_idx on public.platform_events(platform, effective_date desc);
alter table public.platform_events enable row level security;
revoke all on public.platform_events from anon, authenticated;
grant select, insert, update, delete on public.platform_events to service_role;

insert into public.platform_events (platform,event_type,effective_date,title,description,analysis_impact,source_url,created_by)
select 'NAVER','PLATFORM_CHANGE','2026-07-27','쇼핑광고 신규 지면 확대','쇼핑검색광고와 ADVoost 쇼핑이 네이버 메인 쇼핑판 및 네이버플러스 스토어 홈으로 확대 노출','노출·클릭·매체 비중 변화가 생길 수 있어 전후 성과 단순 비교에 주의','https://ads.naver.com/notice?searchValue=ADVoost','SYSTEM'
where not exists (select 1 from public.platform_events where platform='NAVER' and effective_date='2026-07-27' and title='쇼핑광고 신규 지면 확대');

insert into public.platform_events (platform,event_type,effective_date,title,description,analysis_impact,source_url,created_by)
select 'NAVER','PLATFORM_CHANGE','2026-08-13','쇼핑광고 동적 노출 최적화 예정','참고 대화에 기록된 쇼핑검색광고·ADVoost 쇼핑 노출 위치 및 개수 최적화 적용 예정일','CTR·CPC·매체 비중 변화 가능. 적용 전후는 변경 이벤트를 포함해 해석','https://ads.naver.com/notice','REFERENCE_CONVERSATION'
where not exists (select 1 from public.platform_events where platform='NAVER' and effective_date='2026-08-13' and title='쇼핑광고 동적 노출 최적화 예정');

commit;
