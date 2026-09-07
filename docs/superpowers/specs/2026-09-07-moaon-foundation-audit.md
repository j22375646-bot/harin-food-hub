# 모아온 P0 코드 조사: 첫 구현 범위와 개방 조건

조사일 2026-09-07. 기준 코드 1488f44, package 1.39.44. 운영 DB catalog를 읽기 전용으로 대조했다. 고객/주문 행과 API 비밀키는 출력하지 않았고, DB 변경·계정 변경·프린터 실증은 하지 않았다.

## 제품과 사업장의 구분

- 제품명: **모아온 (MOAON)** — 2026-09-07 사용자 확정.
- 현재 운영 사업장: **하린식품**. 모아온으로 바뀌는 것은 프로그램 이름이지 거래의 사업자명이 아니다.
- 듀모르 등 추가 사업장은 설계 예시다. 계정/사업장/플랫폼 연결이 생성된 상태가 아니다.
- 기존 웹은 유지한다. 이번 변경은 설치형 EXE 출시가 아니다.

## 확인한 현재 구조

`rg --files app -g page.js -g route.js` 기준 page 파일 38개, route handler 145개. `rg --files supabase -g '*.sql'` 기준 SQL 파일 101개. 파일 수는 실제 운영 DB 객체 수나 기능 통과 수가 아니다.

| 영역 | 코드 근거 | 다사업장 전환 전에 필요한 작업 |
|---|---|---|
| 로그인 | `lib/dashboard-auth.js`의 서명 세션, `proxy.js`의 전역 OWNER 제한 | 현재 로그인 보존 후 개인 인증과 사업장 membership을 분리. 기존 OWNER를 모든 사업장의 OWNER로 취급하지 않음 |
| DB 접근 | `lib/cafe24/supabase.js`의 process 단위 service-role client | 사업장 전용 repository와 DB 접근 역할 검증. RLS만 켜면 끝이라고 판단하지 않음 |
| Cafe24 | `lib/cafe24/config.js` 전역 mallId, `token-store.js` mall 기준 저장 | tenant+connection 식별, OAuth 의도/소유권 검증, refresh 경쟁 제어 |
| 쿠팡 | `lib/coupang/config.js` 전역 vendor/key, `request-queue.js` request_type/idempotency_key 조회 | 사업장·연결·요청별 queue/key 및 고정 IP worker 분리 |
| 네이버 | `lib/naver/client.js` 전역 customer/key | 커머스·검색광고 연결을 별도 tenant connection으로 관리 |
| 업무 보관 | `lib/owner-workspace.js`의 work_items/saved_views 전체 조회, name+href 충돌 기준 | tenant 조건과 tenant 포함 unique key, 다른 사업장 객체 ID 접근 거부 |
| 화면 상태 | `lib/navigation/live-operation-snapshot.js`의 mall 기준 pending Map | tenant+connection+사용자 범위 캐시 키, 사업장 전환 시 이전 응답 폐기 |
| 브랜드 | layout/manifest/login/Phase28 shell/offline 문서 | 제품 이름을 공통 정의로 교체하되 세션·테마·PWA 식별자와 기존 사업장명 보존 |

## 이번 코드가 하는 일 / 하지 않는 일

1. 로그인·공통 셸·설치 이름 등 제품 표기를 모아온으로 바꾼다. UI 레이아웃/업무 동작은 유지한다.
2. 사업장 컨텍스트/권한의 서버용 준비 모듈을 만든다. 유효한 서버 세션과 활성 membership에 대해 허용하고 불명확한 경우 거부한다.
3. 준비 모듈은 기존 페이지/API에 아직 연결하지 않는다. **이 코드만으로 실제 데이터가 사업장별로 분리된 것은 아니다.**
4. 기존 DB, 고객/주문 정보, 외부 API 키, 실제 출고/답변/광고 작업은 변경하지 않는다.

## 운영 DB catalog 대조 (읽기 전용)

로컬 설정의 Supabase 호스트와 연결된 프로젝트가 동일함을 확인한 뒤, 2026-09-07 21:40 KST 전후 catalog SELECT 및 보안 advisor만 실행했다.

| 항목 | 확인값 | 해석 |
|---|---:|---|
| public 실제 table/partitioned table | 129 | 소스 SQL 파일 수와 다른 실제 객체 수 |
| RLS 활성 table | 129 | 모든 public table에서 활성이나, 이것만으로 tenant 분리가 보장되지는 않음 |
| tenant_id 컬럼을 가진 public table | 0 | 현재 공통 사업장 컬럼 기반 분리가 미구현 |
| public view | 4 | migration 때 view 권한/소유자/필터까지 대조 필요 |
| public SECURITY DEFINER function | 2 | 실행 권한과 내부 인증 조건을 별도 조사해야 함 |
| public policy | 2 | 다수 table은 정책 없는 서버 전용 접근 구조. 무조건 public policy를 추가하면 안 됨 |
| Storage bucket / public bucket | 0 / 0 | Supabase Storage 외 파일·첨부 저장 경로는 추가 조사 필요 |

anon/authenticated role에는 각각 6개 public relation에 SELECT/INSERT/UPDATE/DELETE 등 grant가 관측됐다. RLS/policy 및 실제 노출 경로와 함께 검증해야 하며, grant 존재만으로 고객 데이터가 공개됐다고 단정하지 않는다.

보안 advisor에는 정책 없는 RLS table 안내와 `Leaked Password Protection Disabled` 경고가 있었다. 후속 개인 계정/초대 도입 전에 비밀번호 보안·복구 절차를 검증한다. 이번에는 기존 로그인에 영향을 줄 수 있는 계정 설정을 변경하지 않았다.

이 catalog 조회는 백업 복원 실험, 다른 사용자로의 실제 접근 테스트 또는 전체 보안감사를 대체하지 않는다.

## 다음 구현의 진입 조건

- 운영 DB catalog 기초 대조는 완료. 다음으로 view/function/job 상세 권한을 대조하고 백업 복원 가능 여부 확인.
- tenant/membership/connection 모델의 migration을 별도 검증 환경에서 작성, 기존 데이터 backfill과 건수·금액 대조.
- A/B 두 사업장 테스트 데이터로 조회·쓰기·파일·캐시·큐·AI·export/print의 교차 접근 거부 확인.
- 만료/탈퇴/권한 변경 뒤에도 쓰기가 허용되지 않도록 매 요청/작업 실행 시 재검증.
- 이후에만 초대 로그인, 사업장 선택, 플랫폼 직접 연결 UI를 개방.
- 마지막으로 Windows 설치·업데이트·오프라인 안내·프린터 실증. 우체국 실제 발급은 중복 방지 및 사업장 계약 확인을 통과한 별도 실업무 검증.

## 참고한 보안 기준

Supabase의 service role은 RLS를 우회할 수 있으므로, 서버 key를 보관하는 것과 사업장별 데이터 권한 보장은 별도 과제다. [공식 RLS 문서](https://supabase.com/docs/guides/database/postgres/row-level-security)를 확인했다. 이번에는 DB 정책을 적용하거나 실 DB 격리 검증을 통과했다고 주장하지 않는다.

## 착수 전 검증

- `pnpm install --offline --frozen-lockfile --ignore-scripts`: 기존 lockfile과 로컬 캐시로 설치 완료. 새 의존성 추가 없음.
- `pnpm test`: 전체 1,951개 중 1,948개 통과, 실패 0, skip 3. 기존 UI guard 부채 518건은 기준선이며 이번 작업으로 해소되었다는 뜻이 아님.
- 이후 변경 검증 결과는 별도 첫 구현 보고서에 기록한다.
