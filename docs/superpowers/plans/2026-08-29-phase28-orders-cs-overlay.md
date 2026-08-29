# Phase 28 주문·CS 운영 덮어쓰기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 현재 `/orders`와 `/cs` 주소, 인증, 데이터, 쓰기 API를 유지하면서 Phase 28 고정 UI와 공통 우측 보조석을 적용한다.

**Architecture:** 서버 전용 어댑터가 기존 `unifiedOrders`와 `customerService` 결과를 표시용 ViewModel로 정규화한다. 클라이언트는 페이지별 기능 플래그와 어댑터 성공 상태가 모두 준비된 경우에만 새 Phase 28 셸을 렌더링하고, 기존 센터 컴포넌트를 임베드해 ePost·송장·동기화·답변·클레임 작업을 그대로 사용한다. 어댑터 또는 화면 로딩이 실패하면 기존 V8 센터가 같은 주소에서 계속 렌더링된다.

**Tech Stack:** Next.js 16.3 App Router, React Client Components, CommonJS 서버 ViewModel 어댑터, CSS, Node test runner

**Spec:** `docs/superpowers/specs/2026-08-29-phase28-overlay-readiness-design.md`

## Global Constraints

- 현재 운영 주소 `/orders`, `/cs`와 기존 인증 경계를 바꾸지 않는다.
- 네이버·Cafe24·쿠팡 데이터 및 쓰기 경로를 합치지 않는다.
- ePost 발급, 송장 등록, 배송추적, 취소 격리, 주문 동기화, CS 동기화, 문의 답변, 클레임 실행 API를 재작성하지 않는다.
- 누락·오류·설정 필요 상태를 숫자 0으로 바꾸지 않는다.
- 기본값은 기존 화면이며 `HARIN_PHASE28_ENABLED=true`와 페이지 ID가 함께 활성화된 요청만 새 화면을 사용한다.
- 제목은 `clamp(34px,3vw,50px)`, 컨트롤은 최소 44px, 선택 상태는 균형 잡힌 전체 테두리/배경을 사용하고 `border-left` 장식을 만들지 않는다.
- 우측 보조석은 440ms `cubic-bezier(.22,1,.36,1)` 전환, 48x48 접힘 버튼, `aria-expanded`, `aria-hidden`, `inert`, reduced-motion을 지킨다.
- Phase 28 보조석이 활성화된 페이지에서는 기존 전역 `HarinOwnerWorkspace`를 중복 렌더링하지 않는다.
- 운영 배포와 환경 플래그 활성화는 이 계획 범위에 포함하지 않는다.

---

### Task 1: 주문·CS 표시 어댑터

**Files:**
- Create: `lib/ui/phase28-adapters/orders.js`
- Create: `lib/ui/phase28-adapters/cs.js`
- Modify: `lib/ui/phase28-adapters/index.js`
- Create: `test/phase28-orders-cs-adapters.test.js`

**Interfaces:**
- Consumes: `buildUnifiedOrders()` 결과와 `buildUnifiedCustomerService()` 결과
- Produces: `buildPhase28OrdersModel(data)`와 `buildPhase28CsModel(data)`

- [ ] **Step 1: Write the failing adapter tests**

```js
test('orders adapter derives seller-delivery work without inventing retry totals',()=>{
  const model=buildPhase28OrdersModel({generatedAt:'2026-08-29T01:40:00.000Z',unifiedOrders:{
    orders:[{hubOrderId:'NV-1',platform:'NAVER',stage:'PAID',fulfillment:'SELLER',shippingEligible:true,invoiceNumber:'',timingBadge:{type:'DELAYED'}}],
    channels:[{platform:'NAVER',status:'READY',label:'정상',message:'1건 표시'}],
    summary:{actionRequired:1,cancellations:0,windowDays:30,windowStart:'2026-07-31',windowEnd:'2026-08-29'}
  }});
  assert.equal(model.hero.workCount,1);
  assert.equal(model.hero.delayedCount,1);
  assert.equal(model.workspaces.find(item=>item.id==='RETRY').status,'CHECK_REQUIRED');
});

test('cs adapter preserves setup-required channels and due priorities',()=>{
  const model=buildPhase28CsModel({customerService:{
    active:[{id:'C1',platform:'CAFE24',kind:'INQUIRY',title:'배송 문의',due:{code:'OVERDUE',label:'기한 초과'}}],
    channelStates:[{platform:'NAVER',status:'SETUP_REQUIRED',statusLabel:'설정 필요',message:'연결 필요'}],
    summary:{active:1,unanswered:1,overdue:1,claims:0,linkedOrders:0}
  }});
  assert.equal(model.hero.overdueCount,1);
  assert.equal(model.channels[0].status,'SETUP_REQUIRED');
  assert.equal(model.priorities[0].id,'C1');
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `node --test test/phase28-orders-cs-adapters.test.js`

Expected: FAIL because the new adapter exports do not exist.

- [ ] **Step 3: Implement immutable display-only adapters**

```js
function buildPhase28OrdersModel(data={}) {
  const center=data.unifiedOrders||{};
  const orders=Array.isArray(center.orders)?center.orders:[];
  const sellerWork=orders.filter(item=>item.fulfillment!=='ROCKET_GROWTH'&&!['DELIVERED','CANCELLED'].includes(item.stage));
  return Object.freeze({
    hero:Object.freeze({asOf:data.generatedAt||center.summary?.refreshedAt||null,workCount:sellerWork.length,delayedCount:sellerWork.filter(item=>item.timingBadge?.type==='DELAYED').length,cancellationCount:Number(center.summary?.cancellations||0)}),
    channels:Object.freeze((center.channels||[]).map(item=>Object.freeze({...item}))),
    workspaces:Object.freeze([]),
    window:Object.freeze({days:Number(center.summary?.windowDays||30),start:center.summary?.windowStart||null,end:center.summary?.windowEnd||null})
  });
}
```

The CS adapter follows the same immutable boundary and only copies the summary, channel states, and the first five active priority rows.

- [ ] **Step 4: Run the adapter tests and confirm GREEN**

Run: `node --test test/phase28-orders-cs-adapters.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add lib/ui/phase28-adapters test/phase28-orders-cs-adapters.test.js
git commit -m "feat: adapt orders and cs for Phase 28"
```

### Task 2: 서버 페이지별 어댑터 폴백

**Files:**
- Modify: `app/page.js`
- Create: `test/phase28-orders-cs-server-wiring.test.js`

**Interfaces:**
- Consumes: `phase28Runtime.activePages`, `initialState.view`, Task 1 어댑터
- Produces: `initialData.phase28.orders`, `initialData.phase28.cs`, 페이지별 `adapter_status`

- [ ] **Step 1: Write the failing server-wiring tests**

```js
test('server builds only the active operational page model',()=>{
  const page=read('app/page.js');
  assert.match(page,/buildPhase28OrdersModel\(dashboardData\)/);
  assert.match(page,/activePages\.includes\('orders'\).*initialState\.view==='orders'/s);
  assert.match(page,/buildPhase28CsModel\(dashboardData\)/);
  assert.match(page,/activePages\.includes\('cs'\).*initialState\.view==='cs'/s);
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `node --test test/phase28-orders-cs-server-wiring.test.js`

Expected: FAIL because Orders/CS models are not wired.

- [ ] **Step 3: Add isolated per-page adapter execution**

```js
if(phase28Runtime.activePages.includes('orders')&&initialState.view==='orders'){
  try{ phase28={orders:phase28AdaptersModule.buildPhase28OrdersModel(dashboardData),adapter_status:'READY'}; }
  catch{ phase28={orders:null,adapter_status:'ERROR'}; }
}
if(phase28Runtime.activePages.includes('cs')&&initialState.view==='cs'){
  try{ phase28={cs:phase28AdaptersModule.buildPhase28CsModel(dashboardData),adapter_status:'READY'}; }
  catch{ phase28={cs:null,adapter_status:'ERROR'}; }
}
```

- [ ] **Step 4: Run focused server and adapter tests**

Run: `node --test test/phase28-orders-cs-server-wiring.test.js test/phase28-orders-cs-adapters.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add app/page.js test/phase28-orders-cs-server-wiring.test.js
git commit -m "feat: wire Phase 28 orders and cs models"
```

### Task 3: 공통 운영 셸과 우측 보조석

**Files:**
- Create: `app/_phase28/operational-dashboard.js`
- Create: `app/_phase28/orders-dashboard.js`
- Create: `app/_phase28/cs-dashboard.js`
- Create: `app/_phase28/phase28-operational.css`
- Create: `test/phase28-orders-cs-ui.test.js`

**Interfaces:**
- Consumes: Task 1 ViewModel, `aiPanel`, 기존 센터를 담는 `children`
- Produces: `Phase28OrdersDashboard`, `Phase28CsDashboard`, 접근 가능한 공통 `Phase28OperationalRail`

- [ ] **Step 1: Write failing component contract tests**

```js
test('operational dashboards expose the fixed rail and title contract',()=>{
  const shell=read('app/_phase28/operational-dashboard.js');
  const css=read('app/_phase28/phase28-operational.css');
  assert.match(shell,/aria-expanded=\{railOpen\}/);
  assert.match(shell,/aria-hidden=\{!active\}/);
  assert.match(shell,/inert=\{active\?undefined:''\}/);
  assert.match(css,/440ms cubic-bezier\(\.22,1,\.36,1\)/);
  assert.match(css,/clamp\(34px,3vw,50px\)/);
  assert.match(css,/min-height:44px/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.doesNotMatch(css,/border-left\s*:/);
});
```

- [ ] **Step 2: Run the UI test and confirm RED**

Run: `node --test test/phase28-orders-cs-ui.test.js`

Expected: FAIL because the shared operational shell does not exist.

- [ ] **Step 3: Implement one shared shell with page-specific content**

```jsx
export function Phase28OperationalDashboard({kind,hero,tabs,children}){
  const [railOpen,setRailOpen]=useState(true);
  const [activeTab,setActiveTab]=useState(tabs[0].id);
  return <section className={`phase28Operational phase28Operational--${kind}`} data-rail-open={railOpen?'true':'false'}>
    <header className="phase28OperationalHero">...</header>
    <div className="phase28OperationalLayout"><div className="phase28OperationalBody">{children}</div><aside className="phase28OperationalRail">...</aside></div>
  </section>;
}
```

Orders uses a shipment runway and channel-health/AI tabs. CS uses overdue/unanswered priority context and channel-health/AI tabs. Both use the same 48px collapse behavior and mobile stacked layout.

- [ ] **Step 4: Run focused UI tests**

Run: `node --test test/phase28-orders-cs-ui.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add app/_phase28 test/phase28-orders-cs-ui.test.js
git commit -m "feat: add Phase 28 orders and cs shell"
```

### Task 4: 기존 작업센터 임베드와 기능 플래그 전환

**Files:**
- Modify: `app/unified-orders-center.js`
- Modify: `app/unified-customer-service-center.js`
- Modify: `app/dashboard-client.js`
- Modify: `test/phase16-orders-surface.test.js`
- Modify: `test/phase15-remaining-page-structure.test.js`
- Create: `test/phase28-orders-cs-integration.test.js`

**Interfaces:**
- Consumes: Task 2 `initialData.phase28`, Task 3 dashboard components
- Produces: 페이지 단위 새/기존 화면 선택과 중복 없는 AI/owner rail

- [ ] **Step 1: Write failing integration tests**

```js
test('client keeps legacy centers as the fallback and embeds them in Phase 28',()=>{
  const client=read('app/dashboard-client.js');
  assert.match(client,/phase28OrdersActive\?<Phase28OrdersDashboard/);
  assert.match(client,/:<UnifiedOrdersCenter/);
  assert.match(client,/phase28CsActive\?<Phase28CsDashboard/);
  assert.match(client,/:<UnifiedCustomerServiceCenter/);
  assert.match(client,/phase28OwnsRail/);
});
```

- [ ] **Step 2: Run integration and existing Orders/CS tests and confirm RED only for new expectations**

Run: `node --test test/phase28-orders-cs-integration.test.js test/phase16-orders-surface.test.js test/phase15-remaining-page-structure.test.js`

Expected: the new integration test fails; existing Orders/CS behavior tests remain green.

- [ ] **Step 3: Add the explicit embedded presentation boundary**

```jsx
export default function UnifiedOrdersCenter({center,children,aiPanel,embedded=false}){
  return <HarinPageFrame kind="operations" className={`unifiedOrdersCenter${embedded?' phase28EmbeddedOperations':''}`}>
    {!embedded?<HarinPageHeader .../>:null}
    ...
    {!embedded?<HarinPageAiRegion ...>{aiPanel}</HarinPageAiRegion>:null}
  </HarinPageFrame>;
}
```

Use the same boundary for CS. Keep all current state, event handlers, fetch calls, confirmation behavior, and API endpoints unchanged.

- [ ] **Step 4: Route active pages to the new wrappers while preserving fallback**

```jsx
const phase28OrdersActive=phase28ActivePages.has('orders')&&Boolean(initialData.phase28?.orders);
const phase28CsActive=phase28ActivePages.has('cs')&&Boolean(initialData.phase28?.cs);
const phase28OwnsRail=phase28HomeActive||phase28OrdersActive||phase28CsActive;
```

Phase 28 receives the page-specific AI panel in its own rail; the embedded legacy center receives no duplicate AI panel. The existing `CoupangOrdersView` child stays inside `UnifiedOrdersCenter`.

- [ ] **Step 5: Run focused integration and legacy behavior tests**

Run: `node --test test/phase28-orders-cs-integration.test.js test/phase16-orders-surface.test.js test/phase15-remaining-page-structure.test.js test/unified-orders.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add app/dashboard-client.js app/unified-orders-center.js app/unified-customer-service-center.js test
git commit -m "feat: overlay Phase 28 on orders and cs"
```

### Task 5: 수용 기준과 전체 회귀 검증

**Files:**
- Create: `docs/PHASE28_ORDERS_CS_ACCEPTANCE.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: Tasks 1–4 구현과 기존 Phase 28 foundation/main 검증
- Produces: `pnpm verify:phase28-orders-cs`

- [ ] **Step 1: Add the focused verification command**

```json
"verify:phase28-orders-cs": "pnpm verify:phase28-main && node --test test/phase28-orders-cs-adapters.test.js test/phase28-orders-cs-server-wiring.test.js test/phase28-orders-cs-ui.test.js test/phase28-orders-cs-integration.test.js test/phase16-orders-surface.test.js test/phase15-remaining-page-structure.test.js test/unified-orders.test.js"
```

- [ ] **Step 2: Document activation, rollback, and preserved actions**

The acceptance note records `HARIN_PHASE28_PAGES=home,orders,cs` for an approved verification environment, default-off behavior, same-address routing, preserved API endpoints, and `HARIN_PHASE28_ENABLED=false` rollback.

- [ ] **Step 3: Run focused verification**

Run: `pnpm verify:phase28-orders-cs`

Expected: PASS.

- [ ] **Step 4: Run full repository verification**

Run: `pnpm test`

Expected: PASS with no test failures.

Run: `pnpm build`

Expected: exit code 0 and `/orders`, `/cs` remain authenticated dynamic routes.

Run: `pnpm ui:guard`

Expected: PASS without new design-rule debt.

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 5: Commit**

```powershell
git add docs/PHASE28_ORDERS_CS_ACCEPTANCE.md package.json
git commit -m "docs: gate Phase 28 orders and cs overlay"
```

## Self-review

- Spec coverage: same-address routing, authentication, adapter fallback, channel isolation, existing write paths, AI separation, shared rail, responsive/reduced-motion, and rollback are assigned to explicit tasks.
- Placeholder scan: no deferred implementation markers are present.
- Type consistency: server exports and client consumers use `buildPhase28OrdersModel`, `buildPhase28CsModel`, `initialData.phase28.orders`, and `initialData.phase28.cs` consistently.
- Scope control: production deployment, feature activation, connector rewrites, and database changes are excluded.
