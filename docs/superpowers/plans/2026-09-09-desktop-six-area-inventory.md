# 데스크톱 6개 영역 — 실제 웹 기능·API 이전 조사

검사일: 2026-09-09. 기준: worktree `moaon-foundation`, HEAD `e69b5b3` 및 검사 당시 P4-33 미커밋 변경. 파일을 읽어 확인한 목록이며 운영 API·DB·설치 앱은 호출하지 않았다. 이 문서는 구현/운영 성공 보고서가 아니다.

범위는 **오늘 / 주문 / 정산 / 인사이트 / 일정 / 설정**이다. 기능과 서버 계산을 공유하고, 웹 화면 레이아웃은 복사하지 않는다. 별도 CS·상품·키워드·개발·재고 화면 전체를 이 범위에 자동 포함하지 않는다. 연결된 상세 기능은 아래에 경계를 표시한다.

## 기능 이전 매트릭스

| 영역 | 확인한 실제 웹 기능 | 확인한 서버 계약·구현 | 현재 앱 / 빠진 부분 | 권장 공유 경로 |
|---|---|---|---|---|
| 오늘 | 월 매출·목표·예상·이익/잔액, 출고 마감과 운영 항목, 오늘 일정, 우선 확인 항목, 현금흐름·입금 일정, 성장/예측 근거, 월 목표 변경 | `app/_phase28/pages/home-page.js`; `app/dashboard-route.js:327,1274,2861`; `lib/ui/phase28-adapters/main.js`. 목표는 `POST /api/targets`로 변경안 생성 후 `POST /api/financial-changes/{id}` 확정·검증 | 앱 `readOverview()`는 주문 4개 상태의 저장 건수/확인 시각 및 이동만 제공. 웹 재무/목표/일정/근거 보드와 같지 않음 | 기존 `getDashboardData` 중 Main 데이터 조합과 `buildPhase28MainModel`을 서버 공통 서비스로 추출. 필요한 Main DTO만 사업장 검사 API로 제공. 앱에서 재무 계산 재작성 금지 |
| 주문 | 상태별 20건 페이지, 채널·검색·정렬·지연/사은품 조건, 상품/배송/송장 근거, 사은품 이벤트, 다중 선택, 준비→발급→채널 등록, 수집·추적·진행 상태, 문서/라벨·내보내기 | `app/_phase28/pages/orders-page.js`; `GET /api/orders/page`; `lib/orders/unified-orders.js`; `lib/ui/phase28-adapters/orders.js`; 하단 주문 계약표 | 설치 기준 단건 조회·확인·발급/상태·기존 라벨/프린터. 작업 중 `viewChannel`, 다중선택, `registerInvoices`가 존재하나 설치 완료로 세지 않음. 전체 수집·일괄 발급/등록 완주·추적/부분실패 복구·일괄 문서/내보내기는 별도 완성 확인 필요 | 기존 고정 하린 tenant 주문 wrapper 유지. Main 명시 명령으로 각 기존 서비스 재사용. 발급과 등록, 등록 대기와 성공을 분리 |
| 정산 | 기간별 예상/실제 지급·차이, 채널별 지급·비용·광고비·입금 이력, 쿠팡 판매자배송/로켓그로스/통합 지급 구분, 원본 수집률·시각·복구 경로, 정산 설명 패널, 전체 동기화 | `app/_phase28/pages/settlement-page.js`; `lib/settlement/unified-center.js`; `lib/ui/phase28-adapters/settlement.js`; `app/dashboard-route.js:2910`. 수집 버튼은 `POST /api/sync/all` | 앱 전용 화면/조회 메서드 없음. 독립 정산 전체 모델 JSON endpoint도 이번 inventory에서 확인되지 않음. 페이지의 기간 전환은 이미 받은 `model.periods`를 사용 | 서버 정산 로더 + `buildUnifiedSettlementCenter` + 어댑터를 공유. 새 tenant 검사 조회 facade 필요. 예상/실제/비교불가/null/원장 출처를 DTO 그대로 보존. 수집은 조회와 별도 승인 동작 |
| 인사이트 | 네이버 사장님 브리프, 저장 주간 진단, 누적 주간 진단, 점수·원인·검증·행동/광고 근거, 자동 생성 일정/정책 표시 | `app/_phase28/pages/insights-page.js`; `lib/ui/phase28-adapters/insights.js`; `GET /api/insights/diagnostics`; `GET /api/insights/reports/{id}`; 초기 모델은 `app/dashboard-route.js:453,2934` | 앱 화면·메서드 없음. 현재 웹 화면은 네이버 주간 중심이며 범용 3채널 분석이나 수동 AI 생성 버튼으로 해석하면 안 됨 | 초기 브리프/보고서 목록은 공통 서버 조회 서비스로 제공. 상세는 선택한 보고서만 기존 정규화기 재사용. 목록에서 허용된 id·채널 검증, 보고서 시각/근거/미확인 상태 보존 |
| 일정 | 월/날짜 이동, 일정·메모·기간 이벤트, 제목/본문/시각/우선순위, 이벤트 색·금액구간별 사은품, 생성/수정/완료/삭제, 공휴일과 미확인 연도 표시 | `app/_phase28/pages/calendar-page.js`; `GET/POST/DELETE /api/calendar/entries`; `GET /api/calendar/events/revision`; `lib/calendar/calendar-center.js`, `lib/calendar/order-events.js` | 앱 일정 CRUD 없음. 주문에 표시되는 사은품은 서버가 만든 조회 결과일 뿐 이벤트 관리 기능이 아님 | 기존 normalize/decorate/store를 서버 공통 서비스로 유지. tenant 고정 검사 wrapper 및 명시 calendar Main 메서드 추가. 변경 후 일정·오늘·주문 사은품/선택 snapshot 함께 무효화 |
| 설정 | 웹에 앱 설정과 1:1인 `/settings` 메뉴는 없음. 실제 대응은 `/data-collection`의 연결 6종·자료군·작업/스케줄·오류/복구 상태, provider 상세, 측정 링크 및 GA4 패널. 로컬 앱 설정과 운영 설정을 구분 | `app/_phase28/pages/system-page.js`; `lib/system/phase28-snapshot.js`; `lib/ui/phase28-adapters/system.js`; `GET /api/system/providers/{providerId}`; 측정 계약은 아래 | 앱은 테마·버전·내 사업장·연결/로그아웃·프린터 조회·제한 안내 제공. 운영 연결·수집 상태와 웹 측정 도구는 없음 | 로컬 테마/프린터는 기존 native 메서드 유지. 운영 읽기는 sanitize한 system snapshot/provider DTO부터 연결. 자격증명 원문/임의 서버 입력/새 사업장 활성화는 추가하지 않음. 측정 도구는 설정 내부 별도 작업공간으로 분리 |

## 확인된 주요 API 계약

### 주문

| 요청 | 입력/결과·주의점 |
|---|---|
| `GET /api/moaon/businesses/a3452bca-e259-40ed-a93d-b8bcc5c1b9e0/orders` | 기존 tenant 검사 wrapper가 `GET /api/orders/page`를 호출. `stage=ACTIVE|REGISTER|IN_TRANSIT|COMPLETED`, `platform`, 20건 `offset`+`snapshot`. P4-33 소스는 채널 enum `ALL/CAFE24/NAVER/COUPANG` 추가 중 |
| `POST /api/orders/live-refresh` | Cafe24 실시간 수집 + 고정 IP 쿠팡/네이버 큐. 읽기 새로고침과 다른 작업. `GET`의 작업 식별자 조회로 진행 확인. 일부 실패/워커 불가를 유지하며 `center` 원문은 로컬 renderer로 그대로 전달하지 않음 |
| `POST /api/shipping/actions` | `{confirm:true,action:'PREPARE',orders:[{hubOrderId}]}` 또는 `{confirm:true,action:'UPLOAD_INVOICE',orders:[{hubOrderId,invoiceNumber,deliveryCompanyCode}]}`. 최대 100건. Cafe24 `0012`, 쿠팡 `EPOST`; 실송장 숫자 13자리. 네이버/로켓그로스 제외 |
| `POST /api/epost/issue` | `{confirm:true,orderIds:[...]}`, 최대 50건. `GET /api/epost/issue?requestId=UUID`로 확인. 큐 접수는 완료가 아니며 성공 번호를 보존 |
| `GET /api/coupang/operations/{id}` | 쿠팡 등록 큐의 완료 확인. Main이 자기 작업 응답에서 받은 UUID만 허용. `GET /api/shipping/actions`는 등록 이력이며 일반 운영 큐 전체를 renderer에 공개하지 않음 |
| `POST/GET /api/shipping/tracking`, `GET /api/shipping/fulfillment-status` | 추적 요청과 작업/등록/추적의 진행 상태. 저장 단계 표시와 실제 신규 추적 요청을 구분 |
| `GET /api/shipping/print` | 서버에 label/packing/출고목록 생성 경로 존재. 현재 앱은 등록된 단건 라벨만 sandbox 원격 창으로 제공. 일괄 인쇄 확대 시 서버 선택·송장 검증과 기존 인쇄 확인 유지 |
| `GET /api/orders/export` | 기존 내보내기 route 존재. 자동 다운로드 허용으로 대체하지 말고 별도 Main 저장 동작/파일 형식/개인정보 범위를 정의 |

웹 연쇄 처리 구현은 `app/_phase28/pages/orders-page.js:569–605`: 선택 적격 주문 → 필요 시 PREPARE → 발급 poll → 성공한 번호만 채널 등록 → 쿠팡 poll → 추적/새로고침. 서버는 최신 주문/출고 적격성, 성공 송장 충돌, 같은 번호 재사용, 멱등성·작업 이력을 사용한다. 앱은 등록 실패 시 이미 발급한 번호를 지우거나 새로 발급하면 안 된다.

### 오늘 목표·일정·인사이트·설정

| 요청 | 검증한 계약 |
|---|---|
| `POST /api/targets` | `{month,platform:'ALL',revenueTarget,adBudget,targetRoas,notes}` + `idempotency-key`. `financialChanges.createPreview`를 호출해 요청 id 반환 |
| `POST /api/financial-changes/{id}` | 목표 화면은 `{action:'CONFIRM_EXECUTE',confirm:true,note}`. `applied`와 `verified`까지 확인. generic APPROVE/EXECUTE/ROLLBACK 전체를 새 앱 bridge에 노출할 필요 없음 |
| `GET /api/calendar/entries?from=YYYY-MM-DD&to=YYYY-MM-DD` | entries·holidays·holidayReady·holidayMissingYears·range·generatedAt. 저장소 `hub_work_items`, `context_href='/calendar'`; 기존 저장소는 tenant 원장으로 확인되지 않음 |
| `POST /api/calendar/entries` | `CREATE_ENTRY/UPDATE_ENTRY` + type/title/body/date/endDate/time/priority/eventColor/giftTiers, 수정 id. `TOGGLE_ENTRY` + id/done. `ARCHIVE_ENTRY`도 지원 |
| `DELETE /api/calendar/entries` | `{id}`. 실제 동작은 archive; 웹·오늘·주문을 재검증. 앱 캐시도 같은 영향 범위를 반영 |
| `GET /api/insights/diagnostics` | 현재 서버가 NAVER+WEEKLY로 제한, compact items/summary/schedule/policy 반환 |
| `GET /api/insights/reports/{id}` | 저장 `reports` 상세를 `normalizeInsightReportDetail`로 정규화. route 자체는 ALL/NAVER/COUPANG/CAFE24 허용이므로 네이버 전용 화면은 임의 다른 채널 id를 요청하지 않도록 제한 |
| `GET /api/system/providers/{providerId}` | 허용 6개: cafe24/naver-ads/naver-commerce/coupang/epost/supabase. 설정·읽기·최신성·쓰기 잠금·작업 상태를 분리한 detail |
| `GET/POST /api/system/measurement` | GET `after/includeArchived`; POST `PREVIEW/SAVE_LINK`+input 또는 `ARCHIVE_LINK/RESTORE_LINK`+id. OWNER·동일 Origin, 입력 검증·서버 생성 URL/hash/creator 사용 |
| `GET/POST /api/system/measurement/ga4` | GET 설정/저장 측정 상태, POST 정확히 `{action:'REFRESH'}`. 단순 앱 환경설정 저장이 아닌 서버 측정 자료 갱신 |

정산의 `POST /api/sync/all`은 `syncAllPlatforms({triggerType:'MANUAL'})`를 실행한다. 정산 한 화면 전용 읽기 API가 아니며 범위가 넓다. 207 부분 결과와 채널별 실패를 유지해야 한다. 인사이트의 주간 자동 생성 일정은 표시 기능이며 앱이 새로운 스케줄/AI 호출을 생성하는 근거가 아니다.

## 가장 안전한 공통 서비스 경계

1. **서버 계산 재사용:** `app/dashboard-route.js`의 `getDashboardData`와 focused builder들은 현재 내부 함수다. HTML을 파싱하거나 전체 Next 페이지를 Electron 셸에 넣지 말고, Main/Settlement/Insights/System에 필요한 조회를 서버 전용 서비스로 분리하여 웹과 앱이 같은 어댑터를 호출하게 한다. 독립 JSON endpoint가 이미 있다고 표기하지 않는다.
2. **신규 facade는 제안:** `/api/moaon/businesses/{tenantId}/desktop/{area}` 형태의 명시 읽기 경로는 아직 구현된 API가 아니다. `area`는 6개 허용값만 받고 date/period/platform/reportId도 제한한다. 필요한 DTO만 반환하며 raw DB/provider payload/credentials를 제외한다. 기존 orders wrapper를 임의 전영역 proxy로 확장하지 않는다.
3. **현재는 고정 하린 OWNER만:** `lib/tenancy/workspace-orders-request.js`의 실제 legacy binding은 하린 UUID 하나이며 `workspace.read` + OWNER·membership/session을 조회 전후 검사한다. 기존 재무/일정/보고서 저장소를 새 tenant 소유 자료라고 가정하지 않는다. 다른 사업장은 원장 격리 전 `SETUP_REQUIRED/FORBIDDEN` 유지. 기존 역할/DB 스키마 변경 없이 가능한 범위는 이 고정 하린 호환이다.
4. **쓰기는 읽기 권한과 별도:** 기존 `proxy.js`의 유효 서버 세션·OWNER·동일 Origin 검사를 유지하고, 고정 하린 맥락과 실행 의도를 서버 서비스 경계에서 확인한다. renderer는 URL·헤더·tenantId·임의 action을 결정하지 않는다. 각 Main 명령이 인자 검증, 재조회, 필요한 확인창, 중복 차단/작업 보존을 담당한다. 읽기 wrapper만 추가하고 쓰기 tenant 검증까지 완성됐다고 주장하지 않는다.
5. **상태의 의미 유지:** missing/stale/partial/blocked 값은 null+상태+시각+근거로 전달한다. AI는 페이지별 근거·권한을 분리하고 현재 비활성/호출 없음도 표시한다. Cafe24·쿠팡 판매자배송·로켓그로스·네이버 금액·작업 경계를 합치지 않는다.
6. **앱 저장과 서버 세션:** 테마/프린터는 로컬, 로그인은 기존 persistent session. 현재 서버 12시간 세션을 유지하며 장기 기억하기/자동 재인증은 이번 기능 inventory로 승인되거나 구현된 기능이 아니다.

## 구현 완료로 세기 위한 기준

- 영역별 조회 DTO가 웹의 동일 서비스 출력과 일치하며 실패/빈자료/부분자료 fixture를 포함.
- today/settlement/insights/calendar 신규 읽기에 하린 OWNER 허용, 다른 tenant/멤버십 변경 차단 검증.
- 달력 변경은 오늘/주문까지, 목표 변경은 검증 후 Main까지 갱신. 단순 버튼 배치로 이전 완료 처리하지 않음.
- 주문 일괄은 요청/완료/실패/결과 불명/앱 재시작 후 복구를 주문별로 보존. 정산 동기화·측정 갱신은 조회와 구별.
- 각 영역은 Studio 앱 디자인으로 구현. 로컬 화면·패키지·설치본 검증과 운영 조회 증거는 별도 기록하며 운영 발급·인쇄·수집을 테스트 목적으로 자동 실행하지 않음.

문서 작성 시점의 P4-33 주문 변경은 진행 중이다. 해당 구현 담당자의 완료/검증 보고서가 이 inventory의 앱 현재 상태를 대체한다.
