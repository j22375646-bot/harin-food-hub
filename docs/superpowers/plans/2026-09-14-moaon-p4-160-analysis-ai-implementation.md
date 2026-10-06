# P4-160 분석 AI Implementation Plan

실행 현황: 160A 구현·운영 배포 및 설치 검증 완료(웹 1.62.0 / 앱 0.144.0). 아래는 최초 개발 체크리스트이며 최종 구현 차이와 실제 검증 증거는 [실행 보고서](./2026-09-14-moaon-p4-160-analysis-ai-report.md)를 기준으로 한다. 실제 CLOVA 계정 호출은 미설정으로 OFF. Task 8 Gemini 160B도 구현했으며 실제 공급자 호출은 OFF다. [160B 실행 보고](./2026-09-14-moaon-p4-160b-public-market-ai-report.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 이번 계획은 현재 작업에서 순서대로 실행하며 별도 에이전트 사용을 전제하지 않는다.

**Goal:** 기존 네이버 분석에 CLOVA 기반 근거 설명·질문·기록을 추가하고, 독립된 후속 단계로 공개 시장자료의 Gemini 해석을 제공한다.

**Architecture:** 서버가 권한 확인 후 계산한 snapshot을 고정하고, 제공자별 자료 정책과 DB 예산 예약을 통과한 요청만 생성한다. 결과는 수치/출처 참조를 검증한 후 저장하여 Electron에 반환한다. 기존 OpenAI·읽기 API·계산·플랫폼 변경 경로를 유지한다.

**Tech Stack:** 기존 Next.js route handlers, CommonJS 도메인 모듈, 기존 PostgreSQL 계열 DB 및 tenant runtime, Electron IPC, Node test, PGlite 격리 SQL 시험, Playwright Electron.

**Spec:** [제품·개발 기획](./2026-09-14-moaon-p4-160-analysis-ai-spec.md). 문서 내 제약/한도/상태/평가 기준이 구현 기준이다.

## Global Constraints

- D:/GPT/moaon에서 작업. 시작 시 `. D:/GPT/enter-moaon.ps1`. 임시자료 D:/GPT/tmp.
- 현재 문서는 기획 산출물이며 코드를 실행/배포하라는 추가 명령이 아니다.
- 구현 전 AGENTS.md와 관련 node_modules/next/dist/docs 문서를 읽는다. 운영 앱 0.143.2, 웹 1.61.2는 이번 문서 작성으로 변경하지 않는다.
- 1차 scope=NAVER_AD_REPORT, reportIds 최대 2, 질문 500자, 대화 6턴, snapshot 최대 24KiB, 카드 최대 5, 출력 1,500토큰, 처리 25초.
- 내부 자료 CLOVA / 공개 자료 Gemini 무료. GPT/Claude 신규 호출·유료 fallback 없음. 원본 고객정보·자유 URL·SQL·쓰기 도구 전달 없음.
- 가상자료/로컬 구현에 추가 승인 절차를 만들지 않는다. 실제 계정 호출은 설정·계정 조건이 충족된 범위에서만 수행한다.
- 기록/예산 테이블은 추가형 migration. 기존 결과 테이블과 전역 OpenAI 제약을 일괄 수정하지 않는다.
- Windows 오른쪽 보조 모니터 showInactive 가시 검증, native input 사용 없음. 실제 비밀번호는 사용자 입력.
- 적용할 때 코드·DB·공급자 응답·설치 화면·공개 배포의 검증 상태를 구분한다.

## 파일 책임과 인터페이스

새 파일은 아래 이름으로 고정한다. 기존 큰 파일은 접점만 추가한다.

| 파일 | 책임 |
|---|---|
| lib/ai/insight-snapshot.js | buildInsightSnapshot({tenantId,reports,sourceState,now}) → Snapshot. 정규화/정합성/지표/해시 |
| lib/ai/insight-contract.js | validateInsightRequest(value), validateInsightOutput(value,snapshot), materializeInsight(value,snapshot) |
| lib/ai/insight-policy.js | assertProviderAllowed({provider,dataClass,enabled,ready}), classifyQuestion(question,scope) |
| lib/ai/clova-client.js | generate({snapshot,question,signal,maxOutputTokens}) → {output,usage,model,responseId} |
| lib/ai/gemini-client.js | 같은 generate 계약. PUBLIC_MARKET만 허용 |
| lib/ai/insight-budget.js | reserve({requestId,tenantId,provider,maxCostKrw,now}), settle({requestId,status,actualCostKrw,usage}) |
| lib/ai/insight-service.js | createInsightService({store,budget,generate,loadSnapshot,policy}) → {generateRun,readRun,listRuns,deleteRun} |
| lib/tenancy/workspace-ai-insights-request.js | 요청 body/세션/사업장 권한/응답 재확인 |
| lib/tenancy/workspace-ai-insights-runtime.js | 기존 identity 검증 및 제한 DB 접속 조립 |
| lib/tenancy/sql/ai-insight-runs.sql | 결과·예산 원장·필요한 트랜잭션 함수/RLS |
| app/api/moaon/businesses/[tenantId]/insights/ai/route.js | GET 기록, POST 생성, DELETE 선택 기록. 고정 business resolver 사용 |
| desktop/insight-ai-contract.cjs | renderer 요청/서버 응답의 독립 투영·길이 제한 |
| desktop/insight-ai-transport.cjs | 고정 경로/허용 method/시간·크기 제한 |
| desktop/ui/insight-ai.js, insight-ai.css | 카드·질문·오류·기록·취소 UI |
| test/fixtures/analysis-ai-cases.json | 아래 기준의 가상 평가셋 50건 |

공통 자료/상태 명칭은 spec 7~8절을 따른다. 날짜는 ISO/KST 의미를 분리한다. status(실행)와 dataState(자료 충분성)를 혼용하지 않는다. SQL의 구체적 컬럼 타입/권한은 Task 3에서 기존 DB 타입을 검증한 뒤 동일 migration 안에 확정한다.

## Task 1: 근거 snapshot과 숫자 계약

Files: 새 insight-snapshot.js, insight-contract.js, test/insight-snapshot.test.js, test/insight-output.test.js. 참고: workspace-insights-loader.js, workspace-insights-summary.js, financial-trust.js. 기존 지표 계산 구현은 변경하지 않는다.

Interfaces: Snapshot={tenantId,scope,platform,sourceIds,period,comparison,metrics,findings,dataState,sourceAsOf,exclusions,hash,formulaVersion}. metrics의 키는 고정 metricId이며 value/null,unit,definition,sourceId를 갖는다. output은 cards/answer/nextChecks의 metricRefs/evidenceRefs만 허용한다.

- [ ] 두 기간의 표본 fixture를 만든다. 현재 7일 전환매출 120000/비교 7일 100000, 광고비 30000/25000, 클릭 100/100, 전환 4/2. sourceState는 원천 수집 시각을 명시한다.
- [ ] 다음 실패 테스트를 먼저 작성한다.

```js
const snapshot = buildInsightSnapshot({tenantId:'tenant-a',reports:[current,previous],sourceState,now});
assert.equal(snapshot.scope,'NAVER_AD_REPORT');
assert.equal(snapshot.metrics.revenueChangePct.value,20);
assert.equal(snapshot.metrics.cvrChangePp.value,2);
assert.throws(()=>validateInsightOutput({cards:[{metricRefs:['invented']} ]},snapshot));
```

current/previous는 위 값으로 실제 reports.summary_json 네이버 필드 구조를 채운다. 별도 fixture helper를 만들 때 원천 반환 형태를 기존 loader 시험에서 복사한다.

- [ ] `node --test test/insight-snapshot.test.js test/insight-output.test.js` 실행, 새 모듈 미구현 실패 확인.
- [ ] 기존 자료 정규화 함수로 metrics를 만들고 비교 가능 여부를 먼저 결정한다. previous=0이면 revenueChangePct=null. 범위가 다르면 comparison.allowed=false. 고객 필드는 allowlist에 없으므로 제거한다.
- [ ] snapshotHash는 tenant/scope/sourceIds/기간/metric 정의/값/원천 asOf/formulaVersion을 정렬한 JSON의 SHA-256. 화면 조회시각 now만 달라졌을 때 해시가 바뀌지 않게 한다.
- [ ] 모델 본문의 수치는 `{{metric:revenueChangePct}}` 같은 토큰으로만 받는다. materializeInsight에서 서버가 단위를 붙여 대체한다. 모르는 참조·URL·HTML·도구 필드는 거부한다.
- [ ] missing/null/0/음수/과도한 값/전기0/비교기간중복/다른채널/오래된자료/원가누락을 시험에 추가, PASS 후 commit `feat: add evidence-bound insight snapshots`.

## Task 2: 제공자 경계와 CLOVA 통신

Files: 새 insight-policy.js, clova-client.js, test/insight-policy.test.js, test/clova-client.test.js. 기존 openai-client.js/privacy.js는 인터페이스 참고용.

Interfaces: assertProviderAllowed는 위반시 code가 있는 오류를 던진다. generate는 검증되지 않은 공급자 JSON을 반환하며 Task 4에서 도메인 검증한다. 키와 모델은 서버 설정에서만 주입한다.

- [ ] 경계 테스트를 작성한다.

```js
assert.throws(()=>assertProviderAllowed({provider:'GEMINI_FREE',dataClass:'INTERNAL_AGGREGATE',enabled:true,ready:true}),{code:'DATA_POLICY_BLOCKED'});
assert.throws(()=>assertProviderAllowed({provider:'OPENAI',dataClass:'INTERNAL_AGGREGATE',enabled:true,ready:true}),{code:'PROVIDER_DISABLED'});
assert.throws(()=>assertProviderAllowed({provider:'CLOVA',dataClass:'INTERNAL_AGGREGATE',enabled:false,ready:true}),{code:'DISABLED'});
```

- [ ] 관련 node tests를 실행해 실패 확인.
- [ ] `MOAON_ANALYSIS_AI_ENABLED` 기본 false, CLOVA 계정 ready에 모델/요금/자료 처리 조건 확인이 포함되게 한다. 이 상태를 비밀값 없이 status API에 투영한다.
- [ ] 공식 v3 JSON Schema API를 사용한다. temperature 등 실제 지원 필드는 구현일 문서로 확인. 입력을 system 정책과 untrusted snapshot/question으로 분리한다. function calling/외부 도구/일반 웹검색은 등록하지 않는다.
- [ ] Task 5에서 설정한 요청 시작+25초의 절대 deadline을 상속하고 남은 시간만 사용한다. 공급자 응답 최대 128KiB, 리디렉션 거부. 401/403→SETUP_REQUIRED, 429→QUOTA_BLOCKED, 5xx→UNAVAILABLE, abort→TIMEOUT. 자동 유료 재시도 없음.
- [ ] fake fetch로 정상/오류/스트림 초과/깨진 JSON/늦은 응답/키 로그 노출 금지를 시험한다. OFF이면 fake fetch 호출 횟수 0.
- [ ] PASS 후 commit `feat: add scoped Clova analysis provider`.

## Task 3: 영속 예산·기록·동시성

Files: insight-budget.js, lib/tenancy/sql/ai-insight-runs.sql, test/insight-budget.test.js, test/insight-storage-sql.test.js.

Interfaces: reserve는 {allowed,reservationId,reason}를 반환하고 동일 requestId를 재사용한다. settle의 status는 SUCCEEDED/FAILED/UNKNOWN. UNKNOWN은 최대 예약액 유지. store는 getRun/putRun/listRuns/deleteRun와 atomic claim을 제공한다.

- [ ] 기존 tenancy SQL의 tenant_id/actor 식별자 타입과 제한 실행 role을 읽고 새 테이블의 FK/권한을 맞춘다. 기존 테이블/role 권한을 넓히지 않는다.
- [ ] 다음 동시성 테스트부터 작성한다. store fixture는 PGlite 한 DB에서 두 요청을 동시에 호출한다.

```js
const results=await Promise.all([
 budget.reserve({requestId:'r1',tenantId:'tenant-a',provider:'CLOVA',maxCostKrw:600,now}),
 budget.reserve({requestId:'r2',tenantId:'tenant-a',provider:'CLOVA',maxCostKrw:600,now})
]);
assert.equal(results.filter(r=>r.allowed).length,1); // fixture 잔여 한도 1000원
const allowedIndex=results.findIndex(r=>r.allowed);
await budget.settle({requestId:['r1','r2'][allowedIndex],status:'UNKNOWN',actualCostKrw:null,usage:null});
assert.equal((await store.readBudget('tenant-a')).reservedKrw,600);
```

위 requestId는 테스트 저장 계층 식별자이고 HTTP UUID 검사는 Task 5에서 별도 검증한다. 성공한 예약의 requestId를 사용하므로 동시 실행 순서에 의존하지 않는다.

- [ ] `node --test test/insight-budget.test.js test/insight-storage-sql.test.js` 실행, 실패 확인.
- [ ] unique(tenant_id,request_id), 공급자 계정 총한도와 tenant 한도의 원자적 budget row lock/조건부 갱신, 동일 hash 실행 claim을 구현한다. 모델 단가 버전이 없으면 예약을 허용하지 않는다. KRW 계산은 최소 단위 정수로 올림한다.
- [ ] 예약 비용에는 최대 입력·출력·추론 토큰을 포함한다. 과도한 요청은 호출 전 거부. 사용량 미확인은 보수적으로 남긴다. 날짜 전환/월초/만료일 KST를 시험한다.
- [ ] 다른 tenant 읽기/삭제 차단, 탈퇴/권한만료 차단, 마이그레이션 재실행, API role 직접 접근 제한, requestId replay를 SQL 시험한다.
- [ ] 90일 결과/180일 비용 원장의 삭제 정책 함수를 만든다. 결과 삭제가 비용 사용량을 되돌리지 않음을 시험한다.
- [ ] PASS 후 commit `feat: persist bounded AI usage and analysis history`.

## Task 4: 생성·질문·근거 검증 서비스

Files: insight-service.js, test/insight-service.test.js. Task 1~3의 인터페이스 사용.

Interfaces: generateRun({context,input})는 서버 context의 tenant/actor와 입력 reportIds로 snapshot을 재조회한다. readRun/listRuns/deleteRun은 모두 context를 필수로 받는다. 결과에 provider/model/version을 저장한다.

- [ ] fake store/generate/budget/loadSnapshot을 주입해 아래 회귀를 작성한다.

```js
const first=await service.generateRun({context,input});
const second=await service.generateRun({context,input:{...input,requestId:anotherUuid}});
assert.equal(providerCalls,1);
assert.equal(second.reused,true);
assert.equal(first.snapshotHash,second.snapshotHash);
```

입력은 같은 reportIds/question, 다른 UUID이고 snapshot/프롬프트/모델이 같아야 한다. task fixture의 변수는 테스트 안에 선언하고 counter는 fake generate 안에서 증가시킨다.

- [ ] 실패 확인 후, 세션 검증→자료 로딩→scope 판정→캐시→예산 예약→provider→JSON/숫자 참조 검사→권한 재확인→저장 순으로 구현한다.
- [ ] 질문 분류는 정해진 scope 안에서만 처리한다. 외부 실행·타사업장·전체 주문 질문에는 서버의 범위 안내를 반환하고 모델 호출하지 않는다. 문장 분류는 보조 수단이며 실제 자료/도구 접근은 whitelist로 차단한다.
- [ ] 최대 6턴은 서버가 소유한 같은 snapshot 기록에서만 읽는다. 클라이언트가 보낸 대화 원문/프롬프트를 신뢰하지 않는다.
- [ ] 잘못된 metricRefs/evidenceRefs, 숫자 날조, 새 URL, 원가 누락인데 이익 확정, 자료 교체/모델 버전 변경, 취소 후 늦은 결과, 공급자 성공 뒤 저장 실패를 시험한다. 저장 실패 후 재시도도 중복 유료 요청을 만들지 않도록 reservation의 결과 상태를 확인한다.
- [ ] 검사 실패→INVALID_OUTPUT, 사용 비용은 기록, 원문은 UI에 보내지 않는다. 다시 생성은 새로운 명시적 요청과 예산 검사로 처리.
- [ ] PASS 후 commit `feat: generate validated insight drafts and scoped answers`.

## Task 5: 사업장 API와 Electron IPC 연결

Files: 신규 workspace-ai-insights-request.js/runtime.js, route.js, insight-ai-contract.cjs/transport.cjs. 접점 수정: desktop/connection-policy.cjs, hub-connection.cjs, preload.cjs. Tests: test/workspace-ai-insights.test.js, desktop/test/insight-ai-transport.test.cjs.

Interfaces: `moaon-hub:generate-insight-ai`/`read-insight-ai`/`delete-insight-ai` 3개 IPC. renderer 제공 URL/provider/snapshot은 허용하지 않는다. GET 최신 목록/단건, POST Summary/Question, DELETE 본인 사업장 선택 기록.

- [ ] POST 인증·body·권한 회귀 테스트를 만든다: unauthenticated401, 다른 tenant403, 잘못된 reportId400, snapshot/provider 추가필드400, body>8KiB413, 올바른 summary202 또는 완료200. 직접 모델 호출 횟수까지 확인한다.
- [ ] 기존 workspace-insights-runtime 패턴으로 세션·멤버십·사업장 resolver를 조립한다. 고정 하린식품 경로만 통과하는 현재 앱 제약을 넓혀 모든 사업장을 허용하지 않는다.
- [ ] POST만 외부 AI 비용을 만들고 GET/DELETE는 생성하지 않는다. origin/CSRF 검사는 기존 owner write와 같은 수준으로 적용. 렌더러의 금액/engine 인자를 차단한다.
- [ ] transport는 응답128KiB/25초·정확한 origin/path·redirect:error. structured fields만 투영한다. 로그아웃/사업장 전환 generation mismatch 응답을 폐기한다.
- [ ] 읽기/기존 송장/광고 policy 회귀를 함께 실행하고 PASS 후 commit `feat: connect tenant-scoped analysis AI IPC`.

## Task 6: 분석 화면 카드·질문·기록

Files: 신규 desktop/ui/insight-ai.js/css. 접점 수정: index.html, insights.js, insights.css, marketing-summary.js. Tests: desktop/test/insight-ai-ui-smoke.cjs, insight-ai-ui.test.cjs.

Interfaces: `window.moaonInsightAI={setScope({reportIds,snapshotHash}),clear(),openQuestion()}`. clear는 전체 request generation을 증가시키고 메모리 대화와 화면을 비운다. provider 호출은 클릭 handler에서만 시작한다.

- [ ] 표시 fixture는 READY/PARTIAL/STALE/BLOCKED/DISABLED/SETUP_REQUIRED/BUDGET_BLOCKED/QUOTA_BLOCKED/TIMEOUT/INVALID_OUTPUT/PENDING 모두 준비한다.
- [ ] DOM 테스트에서 페이지 열기/테마변경/뒤로가기/재조회 때 생성 IPC 0회를 먼저 확인한다. 연타는 1회, 보고서 변경 뒤 늦은 결과 0회 표시.
- [ ] 기존 ‘이번 주 살펴볼 점’ 카드에 근거 펼침과 AI 해석을 추가한다. 다른 snapshot의 카드와 병합하지 않는다. 설명에는 AI 초안 배지와 생성 시각, 근거 버튼을 표시한다.
- [ ] 질문 패널은 기존 보고서 패널과 하나만 열린다. 상태별 문구/취소/복사/사용량 표시 구현. DOM textContent로 렌더링하여 model HTML을 실행하지 않는다.
- [ ] UI 검증 단언 예:

```js
assert.equal(await page.locator('[data-ai-question]').inputValue(),'');
assert.equal(await page.locator('[data-ai-evidence]').count(),3);
assert.equal(await page.locator('[data-ai-panel]').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);
```

같은 테스트에서 오른쪽 모니터 showInactive, fixture ‘가상자료 · 운영 변경 없음’ 표시, 라이트/다크·700/1040/1440·Escape·Tab·reduced motion을 확인한다. 실제 provider는 mock.

- [ ] PASS 후 commit `feat: add evidence-first analysis assistant UI`.

## Task 7: 평가·설치·운영 배포

Files: test/fixtures/analysis-ai-cases.json, test/insight-ai-evaluation.test.js, docs/superpowers/plans/2026-09-14-moaon-p4-160-analysis-ai-report.md(실행 시 신규). 버전/CHANGELOG는 구현·검증 완료 시에만 수정한다.

- [ ] spec 9절 비율로 50건 평가 fixture를 작성. 각 항목은 input/allowedMetricIds/requiredCaveats/forbiddenClaims/expectedScope/providerAllowed를 가진다. 문자열 유사도가 아니라 숫자·근거·행동 범위를 판정한다.
- [ ] 전체 domain/IPC/SQL 회귀와 source Electron을 실행. 비용/정보 경계 중요 오류0 조건을 충족한다.
- [ ] 실제 CLOVA 시험은 계정 조건·단가·크레딧 적용과 자료 허용이 확인된 상태에서만 실행한다. 가상자료 smoke 5건, 허용 집계 평가를 합계 50건까지 수행하고 비용 기록. 실제 수치나 raw prompt를 CI 로그에 출력하지 않는다.
- [ ] 계정 조건 미확인이면 mock 구현 검증과 실 API 미검증을 보고서에 분리한다. 작동을 확인하지 않은 제공자는 실행 OFF 유지.
- [ ] 서버/앱 버전 결정→CHANGELOG→build→운영 API readiness 확인→desktop/scripts/build-distribution.ps1→설치 ASAR 검증→가시 UI→publish-signed-release→실제 다운로드/서명/CURRENT 반복 검증 순서로 진행한다.
- [ ] 모델 오류 시 스위치 OFF로 즉시 되돌아가도 원래 보고서/지표가 정상 표시되는지 확인한다. 새 테이블을 즉시 삭제하지 않는다.
- [ ] 구현/실제 API/설치/운영 결과를 보고서와 전체계획서에 기록하고 commit/push. 계정 잔액이나 실 API 성공을 추정으로 채우지 않는다.

## Task 8: 독립 후속 Gemini 공개시장 해석(160-B)

Files: gemini-client.js, lib/ai/public-market-snapshot.js, test/gemini-public-analysis.test.js. 기존 lib/naver-api-hub/client.js, lib/dashboard/market-research.js의 공개자료 조회를 재사용한다.

Interfaces: buildPublicMarketSnapshot({approvedPublicSources})는 dataClass=PUBLIC_MARKET, sources[{id,url,observedAt,kind}], relative metrics만 반환. 내부 snapshot/자유 사용자 질문 인자를 받지 않는다.

- [x] 내부자료 유출 방지부터 시험한다.

```js
assert.throws(()=>buildPublicMarketSnapshot({approvedPublicSources:[{kind:'ORDER_LEDGER',data:{revenue:1000}}]}),{code:'PUBLIC_SOURCE_REQUIRED'});
assert.throws(()=>assertProviderAllowed({provider:'GEMINI_FREE',dataClass:'INTERNAL_AGGREGATE',enabled:true,ready:true}),{code:'DATA_POLICY_BLOCKED'});
```

- [x] Gemini 계정의 무료 tier/model/쿼터 확인 결과를 readiness로 보관. 무료 가능 여부가 불분명하면 OFF. 유료 grounding·자동 tier전환·다른 유료 엔진 fallback을 등록하지 않는다.
- [x] ‘검색 관심 추이 설명’, ‘시즌 기획 참고점’ 정해진 두 동작만 우선 제공. 동일 공개 snapshot 질문은 캐시 재사용. 실제 검색량/경쟁사 매출로 변환하지 않는다.
- [x] quota429/정책/키/형식 오류→지정된 상태 반환. 내부 대화·비공개 수치가 prompt에 들어가지 않는 outgoing request 검사.
- [x] A와 별도 공개자료 평가/설치/배포 후 시장자료 카드로 노출. 전체 AI 기능이 Gemini 무료 하나에 의존하도록 바꾸지 않는다.

## 계획 자체 검토

- [x] 기존 분석이 NAVER 보고서라는 사실을 범위에 반영했다.
- [x] GPT 비활성, Gemini 기밀자료 차단, CLOVA 계정 조건 확인을 실행/비용 단계에 배치했다.
- [x] 수치 검증, 근거, 취소/늦은 응답, 예산 경쟁, provider 실패, 결과 보관, 설치 검증이 각각 task에 대응한다.
- [x] 전체 주문·재고·CS·이벤트 및 자동 실행은 후속 범위와 완료 조건을 분리했다.
- [x] 기획 작성만으로 모델 연결·기능 개발·운영 배포가 완료됐다고 표시하지 않았다.
