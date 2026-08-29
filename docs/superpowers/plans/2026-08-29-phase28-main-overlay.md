# Phase 28 Main Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 현재 허브의 `/` 주소, 인증, 데이터 수집, 계산 로직을 유지하면서 승인된 Phase 28 `오늘` 화면을 실제 데이터에 연결하고 기본 비활성 기능 플래그 뒤에 배치한다.

**Architecture:** 서버가 기존 `getDashboardData()` 결과를 만든 뒤, Phase 28 런타임 설정이 `home`을 활성화한 요청에만 순수 어댑터로 직렬화 가능한 `main` ViewModel을 생성한다. 클라이언트는 같은 공통 셸 안에서 기존 Main 또는 Phase 28 Main 중 하나만 렌더링하며, 전환이 꺼져 있거나 어댑터가 실패하면 기존 화면을 유지한다.

**Tech Stack:** Next.js 16.3 App Router, React 19 Client Components, CommonJS 도메인 어댑터, 전역 CSS를 페이지 루트로 범위 제한, Node `node:test`.

**Spec:** `docs/superpowers/specs/2026-08-29-phase28-overlay-readiness-design.md`

## Global Constraints

- 운영 주소는 `/` 그대로 유지한다. 새 미리보기 주소나 리다이렉트로 대체하지 않는다.
- `HARIN_PHASE28_ENABLED=false`, `HARIN_PHASE28_PAGES=`가 기본값이며 기본 상태에서 기존 Main을 렌더링한다.
- 기존 인증, API, 계산, 주문·CS·재고 데이터 계약과 네이버·쿠팡·Cafe24 경계를 변경하지 않는다.
- 누락·오류·설정 필요 상태를 숫자 `0`으로 바꾸지 않고 `확인 필요` 또는 `판단 보류`로 노출한다.
- 제목은 `clamp(34px, 3vw, 50px)`, 900 굵기, 3px 왼쪽→오른쪽 밑줄을 사용한다.
- 선택 상태에는 `border-left`, 한쪽 inset strip, 세로 가상 요소를 사용하지 않는다.
- 컨트롤은 최소 44px, 본문은 17px 기준을 유지하고 390px·430px에서는 재배치한다.
- 우측 보조석은 440ms `cubic-bezier(.22,1,.36,1)`로 접히며 `aria-expanded`와 `prefers-reduced-motion`을 지원한다.
- 승인 전에는 기능 플래그를 켜거나 운영 배포하지 않는다.

---

### Task 1: Serializable Phase 28 Runtime Contract

**Files:**
- Modify: `lib/ui/feature-flags.js`
- Modify: `app/page.js`
- Test: `test/phase28-feature-flags.test.js`
- Test: `test/phase28-main-server-wiring.test.js`

**Interfaces:**
- Consumes: `phase28UiConfig(env)`.
- Produces: `phase28RuntimeConfig(env) -> { enabled, valid, pages, activePages, invalidPages }` and `initialData.phase28Runtime`.

- [ ] **Step 1: Write the failing runtime serialization test**

```js
test('Phase 28 runtime config exposes only serializable active pages',()=>{
  const runtime=flags.phase28RuntimeConfig({HARIN_PHASE28_ENABLED:'true',HARIN_PHASE28_PAGES:'home'});
  assert.deepEqual(runtime.activePages,['home']);
  assert.equal(JSON.parse(JSON.stringify(runtime)).enabled,true);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --test test/phase28-feature-flags.test.js`
Expected: FAIL because `phase28RuntimeConfig` is not defined.

- [ ] **Step 3: Implement the serializable runtime function**

```js
function phase28RuntimeConfig(env=process.env){
  const config=phase28UiConfig(env);
  return Object.freeze({
    enabled:config.enabled,
    valid:config.valid,
    pages:Object.freeze([...config.pages]),
    activePages:Object.freeze(config.enabled&&config.valid?[...config.pages]:[]),
    invalidPages:Object.freeze([...config.invalidPages])
  });
}
```

- [ ] **Step 4: Pass the server runtime contract to Dashboard**

In `renderDashboardState`, build `phase28RuntimeConfig(process.env)` on the server and attach it to the successfully loaded data. Do not read `HARIN_PHASE28_*` from `dashboard-client.js`.

- [ ] **Step 5: Run focused tests and commit**

Run: `node --test test/phase28-feature-flags.test.js test/phase28-main-server-wiring.test.js`
Expected: PASS.

Commit: `feat: expose Phase 28 runtime state`

### Task 2: Main Data Adapter and Readiness Registration

**Files:**
- Create: `lib/ui/phase28-adapters/main.js`
- Create: `lib/ui/phase28-adapters/index.js`
- Modify: `app/page.js`
- Modify: `scripts/check-phase28-overlay-readiness.js`
- Modify: `test/phase28-readiness.test.js`
- Create: `test/phase28-main-adapter.test.js`

**Interfaces:**
- Consumes: `{ salesCommandCenter, metricSnapshots, financialTrust, generatedAt }` from the existing dashboard payload.
- Produces: `buildPhase28MainModel(data) -> { hero, metrics, schedule, decisions, channels, growth, cashflow, trust }` and `PHASE28_AVAILABLE_ADAPTERS=['main']`.

- [ ] **Step 1: Write failing adapter tests**

```js
test('main adapter preserves missing money as blocked evidence',()=>{
  const model=buildPhase28MainModel({salesCommandCenter:{metrics:{current:null}}});
  assert.equal(model.metrics.current.status,'BLOCKED');
  assert.equal(model.metrics.current.value,null);
});

test('main adapter keeps a confirmed numeric zero',()=>{
  const model=buildPhase28MainModel({salesCommandCenter:{metrics:{current:0}},metricSnapshots:[{id:'ALL_SALES',status:'READY'}]});
  assert.equal(model.metrics.current.value,0);
});
```

- [ ] **Step 2: Run tests and verify missing module failure**

Run: `node --test test/phase28-main-adapter.test.js`
Expected: FAIL with `MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the pure adapter**

Use `phase28Metric()` for every numeric value. Map existing server-owned task counts, schedule, actions, channels, products, and cashflow without recomputing operational rules in React.

- [ ] **Step 4: Register only the implemented adapter**

```js
const PHASE28_AVAILABLE_ADAPTERS=Object.freeze(['main']);
module.exports={PHASE28_AVAILABLE_ADAPTERS,buildPhase28MainModel};
```

The readiness command must no longer report `MISSING_ADAPTER` for `home`, while all unimplemented pages remain blocked.

- [ ] **Step 5: Build the ViewModel on the server only when `home` is active**

Attach it as `initialData.phase28?.main`. If the adapter throws, retain the legacy Main and attach a non-sensitive error status rather than breaking `/`.

- [ ] **Step 6: Run focused tests and commit**

Run: `node --test test/phase28-main-adapter.test.js test/phase28-readiness.test.js test/phase28-main-server-wiring.test.js`
Expected: PASS.

Commit: `feat: adapt live data for Phase 28 main`

### Task 3: Phase 28 Main Screen

**Files:**
- Create: `app/_phase28/main-dashboard.js`
- Create: `app/_phase28/phase28-main.css`
- Modify: `app/dashboard-client.js`
- Create: `test/phase28-main-ui.test.js`

**Interfaces:**
- Consumes: `model`, `aiPanel`, `onOpen(item)`, `onOpenTargets()`.
- Produces: interactive Phase 28 Main with root `.phase28Main`, right rail state, route buttons, and accessible disclosure state.

- [ ] **Step 1: Write the failing structural UI test**

```js
test('Phase 28 Main is lazy loaded behind the home runtime flag',()=>{
  assert.match(client,/dynamic\(\(\)=>import\('\.\/_phase28\/main-dashboard\.js'\)/);
  assert.match(client,/phase28ActivePages\.has\('home'\)/);
  assert.match(main,/page-title-accent/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
```

- [ ] **Step 2: Run the UI test and verify it fails**

Run: `node --test test/phase28-main-ui.test.js`
Expected: FAIL because the component and stylesheet do not exist.

- [ ] **Step 3: Implement the page hierarchy**

Render in this order: live context/title, three money metrics, four-step `오늘의 운영선`, decision list, channel health/growth summaries, and collapsible decision rail. Metric values with non-READY status render `확인 필요` or `판단 보류`.

- [ ] **Step 4: Implement scoped responsive styling**

Scope every selector beneath `.phase28Main`. Use cool-neutral surfaces, blueberry/mint/apricot/rose/mauve semantic tones, 12–16px radii, one border or one shadow, no decorative gradient or glass blur. At mobile width, reflow the rail below the content and keep text readable.

- [ ] **Step 5: Wire legacy fallback and navigation**

Render `Phase28MainDashboard` only when `activePages` contains `home` and `initialData.phase28.main` exists. Otherwise render `Phase14MainCommandCenter` and the existing AI/evidence blocks unchanged.

- [ ] **Step 6: Run focused tests and commit**

Run: `node --test test/phase28-main-ui.test.js test/phase14-v8-main-command-center.test.js`
Expected: PASS for both the new screen and legacy fallback.

Commit: `feat: add Phase 28 live main screen`

### Task 4: Main Overlay Acceptance Gate

**Files:**
- Modify: `package.json`
- Create: `docs/PHASE28_MAIN_ACCEPTANCE.md`
- Create: `test/phase28-main-acceptance.test.js`

**Interfaces:**
- Consumes: runtime contract, adapter registry, UI component, legacy fallback.
- Produces: `pnpm verify:phase28-main` and an explicit page-level rollback record.

- [ ] **Step 1: Write the failing acceptance-document test**

```js
assert.match(text,/HARIN_PHASE28_ENABLED=true/);
assert.match(text,/HARIN_PHASE28_PAGES=home/);
assert.match(text,/HARIN_PHASE28_ENABLED=false/);
assert.match(text,/\/.*주소.*유지/);
assert.match(text,/cutover.*BLOCKED/i);
```

- [ ] **Step 2: Run it and verify missing document failure**

Run: `node --test test/phase28-main-acceptance.test.js`
Expected: FAIL with `ENOENT`.

- [ ] **Step 3: Document preview activation and rollback**

Record that only an approved environment may set:

```dotenv
HARIN_PHASE28_ENABLED=true
HARIN_PHASE28_PAGES=home
```

Rollback is `HARIN_PHASE28_ENABLED=false`; no route, data, auth, or history is deleted.

- [ ] **Step 4: Add and run the verification command**

`verify:phase28-main` must include all Phase 28 foundation tests, runtime wiring, adapter tests, new UI tests, legacy Main regression, and acceptance test.

- [ ] **Step 5: Commit**

Commit: `docs: gate Phase 28 main overlay`

### Task 5: Full Regression and Build Verification

**Files:**
- Verify only; modify code only if a failure is reproducible and covered by a regression test.

**Interfaces:**
- Consumes: the completed Main overlay batch.
- Produces: evidence that the code can remain merged with flags disabled and the existing hub remains functional.

- [ ] **Step 1: Run the page gate**

Run: `pnpm verify:phase28-main`
Expected: all focused tests pass; `home` has no adapter blocker; global `cutover` remains `BLOCKED` for the remaining pages and `/product-analysis`.

- [ ] **Step 2: Run full tests**

Run: `pnpm test`
Expected: zero failures.

- [ ] **Step 3: Run production build**

Run: `pnpm build`
Expected: exit code 0 and `/` remains a production route.

- [ ] **Step 4: Check diff and status**

Run: `git diff --check && git status --short`
Expected: no whitespace errors; only known user-owned untracked paths remain outside the isolated worktree.

- [ ] **Step 5: Record completion without enabling production**

Report the exact commit, test count, build result, remaining blockers, and that no push, deploy, or feature-flag activation occurred.
