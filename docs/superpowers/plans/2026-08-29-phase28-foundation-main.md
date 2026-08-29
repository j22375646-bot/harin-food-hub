# Phase 28 V106 Foundation and Main Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the non-overlaid V106 application boundary, shared shell, shared right rail, and real-data Main page without exposing a mixed legacy/Phase 28 production UI.

**Architecture:** Keep `app/page.js` as the authenticated server data boundary, normalize its result through Phase 28 adapters, and choose exactly one client root: legacy or V106. The V106 root owns its shell and route rendering; it never renders a legacy page component as a child. Development preview is fail-closed outside local development, while production cutover remains blocked until all 17 routes and adapters are ready.

**Tech Stack:** Next.js 16.3 App Router, React 19.2, JavaScript, CSS Modules, Node.js 24 `node:test`, existing server loaders and APIs.

**Spec:** `docs/superpowers/specs/2026-08-29-phase28-full-ui-replacement-design.md`

## Global Constraints

- V106 is the visual and interaction source of truth; do not reinterpret it as an aesthetic reference.
- Keep the current production URLs for all 17 routes.
- Never render `UnifiedOrdersCenter`, `UnifiedCustomerServiceCenter`, or another legacy page inside the V106 tree.
- Preserve authentication, APIs, calculations, guarded writes, idempotency, audit history, re-read verification, and rollback.
- Keep Naver, Coupang, and Cafe24 data and write paths separate.
- Missing or stale evidence must remain `확인 필요`, `판단 보류`, `BLOCKED`, `SETUP_REQUIRED`, or `표본 대기`; never coerce it to zero.
- Use Main, Orders, and CS as the shared scale reference: title `clamp(34px, 3vw, 50px)`, controls at least `44px`, and visible text at least `12px`.
- Selection uses a light full background and balanced `1px` border; no `border-left`, inset side strip, or selected blue dot.
- The desktop right rail uses `clamp(370px, 21vw, 410px)`, `440ms cubic-bezier(.22,1,.36,1)`, and leaves only one `48×48px` button when collapsed.
- At `1480px` and below, the right rail moves under the main workspace; at `430px` and `390px`, reflow content instead of deleting it or shrinking type.
- Global CSS remains limited to true document-wide rules. V106 components use CSS Modules to avoid leakage from the legacy V8 styles, following the installed Next.js 16.3 CSS guidance.
- Server data and secrets stay in Server Components/server modules; only serializable ViewModels cross into client components.
- Write failing tests first, verify the expected failure, implement the minimum complete behavior, rerun focused tests, then commit.

## Plan Series

This is plan 1 of 6. Each plan produces a separately reviewable, testable deliverable.

1. Foundation, shared shell, shared primitives, Main
2. Orders and CS
3. Inventory, Products, Settlement
4. Keywords, Product Analysis, Insights
5. Product Development, System, and six control pages
6. Full production cutover, visual regression, and legacy frontend cleanup

---

### Task 1: Freeze the V106 reference source

**Files:**
- Create: `scripts/snapshot-phase28-v106.js`
- Create: `docs/design-reference/phase28-v106/README.md`
- Create: `docs/design-reference/phase28-v106/manifest.json`
- Create: `docs/design-reference/phase28-v106/source/*`
- Create: `docs/design-reference/phase28-v106/screenshots/*`
- Test: `test/phase28-v106-reference.test.js`

**Interfaces:**
- Consumes: `node scripts/snapshot-phase28-v106.js --source <absolute-preview-directory>`
- Produces: `{version, generatedAt, files:[{path,sha256,bytes}]}` in `manifest.json`; later visual tasks use this immutable source and hash list.

- [ ] **Step 1: Write the failing manifest integrity test**

```js
'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const referenceRoot=path.join(root,'docs','design-reference','phase28-v106');

test('V106 reference snapshot is complete and hash-verified',()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(referenceRoot,'manifest.json'),'utf8'));
  assert.equal(manifest.version,'V106');
  assert.ok(manifest.files.length>=20);
  for(const entry of manifest.files){
    const absolute=path.join(referenceRoot,entry.path);
    const buffer=fs.readFileSync(absolute);
    assert.equal(buffer.byteLength,entry.bytes,entry.path);
    assert.equal(crypto.createHash('sha256').update(buffer).digest('hex'),entry.sha256,entry.path);
  }
  for(const required of ['source/index.html','source/DESIGN-BASELINE.md','source/phase28-panel-motion.css','source/detail-polish-v106.css','screenshots/v106-home-desktop.png']){
    assert.ok(manifest.files.some(entry=>entry.path===required),required);
  }
});
```

- [ ] **Step 2: Run the test and verify the reference does not exist**

Run:

```powershell
node --test test/phase28-v106-reference.test.js
```

Expected: FAIL with `ENOENT` for `docs/design-reference/phase28-v106/manifest.json`.

- [ ] **Step 3: Create the deterministic snapshot script**

```js
'use strict';

const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');

const args=process.argv.slice(2);
const sourceIndex=args.indexOf('--source');
if(sourceIndex<0||!args[sourceIndex+1])throw new Error('--source 절대경로가 필요합니다.');
const sourceRoot=path.resolve(args[sourceIndex+1]);
const targetRoot=path.resolve(__dirname,'..','docs','design-reference','phase28-v106');
const sourceFiles=[
  'index.html','DESIGN-BASELINE.md','phase28-panel-motion.css','phase28-v82-fixed-design.css',
  'phase28-v83-channel-logos.css','phase28-v83-channel-logos.js','detail-polish-v106.css',
  'orders-integrated.css','orders-integrated.js','cs-integrated.css','cs-integrated.js',
  'inventory-products-integrated.css','inventory-products-integrated.js','keyword-integrated.css','keyword-integrated.js',
  'product-analysis-v95.css','product-analysis-integrated.js','settlement-visual-v99.css','settlement-visual-v99.js',
  'insights-v100.css','insights-v100.js','product-development-v101.css','product-development-v101.js',
  'system-operations-v102.css','system-operations-v102.js','notifications-v103.css','notifications-v103.js',
  'decision-loop-v104.css','decision-loop-v104.js','ai-knowledge-v105.css','ai-knowledge-v105.js'
];
const screenshots=['v106-home-desktop.png','v82-home-fixed-mobile390.png','v82-home-fixed-dark.png'];
const copied=[];

function copy(relativeSource,relativeTarget){
  const from=path.join(sourceRoot,relativeSource);
  const to=path.join(targetRoot,relativeTarget);
  if(!fs.existsSync(from))throw new Error(`V106 기준 파일 누락: ${relativeSource}`);
  fs.mkdirSync(path.dirname(to),{recursive:true});
  fs.copyFileSync(from,to);
  const buffer=fs.readFileSync(to);
  copied.push({path:relativeTarget.replaceAll('\\','/'),sha256:crypto.createHash('sha256').update(buffer).digest('hex'),bytes:buffer.byteLength});
}

for(const file of sourceFiles)copy(file,path.join('source',file));
for(const file of screenshots)copy(file,path.join('screenshots',file));
copied.sort((left,right)=>left.path.localeCompare(right.path));
fs.writeFileSync(path.join(targetRoot,'manifest.json'),`${JSON.stringify({version:'V106',generatedAt:new Date().toISOString(),files:copied},null,2)}\n`);
```

- [ ] **Step 4: Snapshot the approved source and document its role**

Run:

```powershell
node scripts/snapshot-phase28-v106.js --source 'C:\Users\a\.codex\visualizations\2026\08\28\01a046ed-7270-7421-a319-9c3685b5c022\main-ui-v28-preview'
```

Write `README.md` with these exact rules:

```markdown
# Phase 28 V106 reference

This directory is an immutable, non-runtime audit snapshot of the owner-approved V106 prototype.

- Do not import or execute these sample scripts in production.
- Port final DOM, CSS values, motion, and responsive states into React/CSS Modules.
- Do not copy sample numbers or sample success states into operational ViewModels.
- A visual change requires a new reference version and an explicit owner decision.
```

- [ ] **Step 5: Verify and commit**

Run:

```powershell
node --test test/phase28-v106-reference.test.js
git diff --check
```

Expected: PASS and no whitespace errors.

```powershell
git add scripts/snapshot-phase28-v106.js docs/design-reference/phase28-v106 test/phase28-v106-reference.test.js
git commit -m "docs: freeze Phase 28 V106 reference"
```

---

### Task 2: Replace page overlays with fail-closed whole-app cutover semantics

**Files:**
- Modify: `lib/ui/feature-flags.js`
- Modify: `lib/ui/phase28-readiness.js`
- Modify: `scripts/check-phase28-overlay-readiness.js` (rename command output from overlay to full replacement; keep the filename until package scripts are updated)
- Modify: `test/phase28-feature-flags.test.js`
- Modify: `test/phase28-readiness.test.js`
- Create: `test/phase28-cutover-mode.test.js`

**Interfaces:**
- Consumes: `HARIN_PHASE28_ENABLED`, `HARIN_PHASE28_PAGES`, `HARIN_PHASE28_PREVIEW`, `NODE_ENV`, readiness report.
- Produces: `phase28RuntimeConfig(env,{readiness,routeId}) -> {enabled,valid,pages,invalidPages,coverage,renderMode,activePages,routeId}` where `renderMode` is `legacy | preview | full`.

- [ ] **Step 1: Write failing tests for full coverage, local preview, and production fail-close**

```js
'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const flags=require('../lib/ui/feature-flags.js');
const {PHASE28_ROUTE_IDS}=require('../lib/ui/phase28-route-registry.js');

const allPages=PHASE28_ROUTE_IDS.join(',');

test('production renders full V106 only with complete pages and READY cutover',()=>{
  const runtime=flags.phase28RuntimeConfig({
    NODE_ENV:'production',HARIN_PHASE28_ENABLED:'true',HARIN_PHASE28_PAGES:allPages
  },{readiness:{cutover:'READY'},routeId:'home'});
  assert.equal(runtime.coverage,'COMPLETE');
  assert.equal(runtime.renderMode,'full');
  assert.deepEqual(runtime.activePages,PHASE28_ROUTE_IDS);
});

test('partial production configuration never activates an overlay page',()=>{
  const runtime=flags.phase28RuntimeConfig({
    NODE_ENV:'production',HARIN_PHASE28_ENABLED:'true',HARIN_PHASE28_PAGES:'home,orders'
  },{readiness:{cutover:'BLOCKED'},routeId:'home'});
  assert.equal(runtime.coverage,'PARTIAL');
  assert.equal(runtime.renderMode,'legacy');
  assert.deepEqual(runtime.activePages,[]);
});

test('local preview may render the V106 shell for an allowlisted route',()=>{
  const runtime=flags.phase28RuntimeConfig({
    NODE_ENV:'development',HARIN_PHASE28_PREVIEW:'true',HARIN_PHASE28_PAGES:'home'
  },{readiness:{cutover:'BLOCKED'},routeId:'home'});
  assert.equal(runtime.renderMode,'preview');
  assert.deepEqual(runtime.activePages,['home']);
});

test('preview flag is ignored in production',()=>{
  const runtime=flags.phase28RuntimeConfig({
    NODE_ENV:'production',HARIN_PHASE28_PREVIEW:'true',HARIN_PHASE28_PAGES:'home'
  },{readiness:{cutover:'BLOCKED'},routeId:'home'});
  assert.equal(runtime.renderMode,'legacy');
  assert.deepEqual(runtime.activePages,[]);
});
```

- [ ] **Step 2: Run focused tests and verify current overlay semantics fail**

Run:

```powershell
node --test test/phase28-feature-flags.test.js test/phase28-readiness.test.js test/phase28-cutover-mode.test.js
```

Expected: FAIL because `coverage` and `renderMode` are absent and partial production pages are currently active.

- [ ] **Step 3: Implement the complete-coverage configuration**

Add the following semantics to `feature-flags.js`:

```js
function phase28UiConfig(env=process.env){
  const enabled=booleanFlag(env.HARIN_PHASE28_ENABLED,false);
  const requested=listFlag(env.HARIN_PHASE28_PAGES);
  const allowed=new Set(PHASE28_ROUTE_IDS);
  const invalidPages=requested.filter(id=>!allowed.has(id));
  const valid=invalidPages.length===0;
  const pages=valid?requested:[];
  const complete=valid&&PHASE28_ROUTE_IDS.every(id=>pages.includes(id));
  return {
    enabled,pages,invalidPages,valid,complete,
    coverage:complete?'COMPLETE':pages.length?'PARTIAL':'EMPTY',
    active:id=>enabled&&complete&&pages.includes(id),
    rollbackFlag:'HARIN_PHASE28_ENABLED',
    pagesFlag:'HARIN_PHASE28_PAGES'
  };
}

function phase28RuntimeConfig(env=process.env,{readiness={cutover:'BLOCKED'},routeId=null}={}){
  const config=phase28UiConfig(env);
  const full=config.enabled&&config.complete&&readiness.cutover==='READY';
  const preview=booleanFlag(env.HARIN_PHASE28_PREVIEW,false)&&env.NODE_ENV==='development'&&config.valid&&Boolean(routeId)&&config.pages.includes(routeId);
  const renderMode=full?'full':preview?'preview':'legacy';
  const activePages=full?PHASE28_ROUTE_IDS:preview?[routeId]:[];
  return Object.freeze({
    enabled:config.enabled,valid:config.valid,pages:Object.freeze([...config.pages]),
    invalidPages:Object.freeze([...config.invalidPages]),coverage:config.coverage,
    renderMode,activePages:Object.freeze([...activePages]),routeId
  });
}
```

Update `buildPhase28Readiness` so `cutover` is `READY` only when the registry, production paths, all 17 adapters, valid flags, enabled flag, and complete page coverage all pass.

- [ ] **Step 4: Update existing flag/readiness assertions**

Replace assertions that expect partial `activePages` in production with assertions for `coverage:'PARTIAL'`, `renderMode:'legacy'`, and `activePages:[]`. Retain invalid page rejection and serializability assertions.

- [ ] **Step 5: Verify and commit**

Run:

```powershell
node --test test/phase28-feature-flags.test.js test/phase28-readiness.test.js test/phase28-cutover-mode.test.js
```

Expected: PASS.

```powershell
git add lib/ui/feature-flags.js lib/ui/phase28-readiness.js scripts/check-phase28-overlay-readiness.js test/phase28-feature-flags.test.js test/phase28-readiness.test.js test/phase28-cutover-mode.test.js
git commit -m "refactor: fail close Phase 28 whole-app cutover"
```

---

### Task 3: Create an exclusive V106/legacy client-root boundary

**Files:**
- Rename: `app/dashboard-client.js` -> `app/legacy-dashboard-client.js`
- Create: `app/dashboard-client.js`
- Create: `app/_phase28/phase28-app.js`
- Create: `app/_phase28/phase28-loading.js`
- Modify: `test/phase28-main-ui.test.js`
- Modify: `test/phase28-main-server-wiring.test.js`
- Modify: `test/phase28-orders-cs-server-wiring.test.js`
- Create: `test/phase28-root-boundary.test.js`

**Interfaces:**
- Consumes: `{initialData,initialState}` from `app/page.js` and `initialData.phase28Runtime.renderMode`.
- Produces: exactly one root, `LegacyDashboard` or `Phase28App`; V106 does not import legacy page centers.

- [ ] **Step 1: Write the failing static boundary test**

```js
'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('dashboard entry chooses one application root',()=>{
  const entry=read('app/dashboard-client.js');
  assert.match(entry,/renderMode==='full'\|\|renderMode==='preview'/);
  assert.match(entry,/<Phase28App/);
  assert.match(entry,/<LegacyDashboard/);
  assert.doesNotMatch(entry,/UnifiedOrdersCenter|UnifiedCustomerServiceCenter/);
});

test('V106 root does not import legacy pages',()=>{
  const app=read('app/_phase28/phase28-app.js');
  assert.doesNotMatch(app,/legacy-dashboard|unified-orders|unified-customer|Phase28OrdersDashboard|Phase28CsDashboard/);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
node --test test/phase28-root-boundary.test.js
```

Expected: FAIL because `app/_phase28/phase28-app.js` is absent and `dashboard-client.js` still contains legacy page rendering.

- [ ] **Step 3: Move the legacy client unchanged and create the exclusive entry**

Run:

```powershell
git mv app/dashboard-client.js app/legacy-dashboard-client.js
```

Create `app/dashboard-client.js`:

```js
'use client';

import dynamic from 'next/dynamic';
import Phase28Loading from './_phase28/phase28-loading.js';

const LegacyDashboard=dynamic(()=>import('./legacy-dashboard-client.js'),{loading:Phase28Loading});
const Phase28App=dynamic(()=>import('./_phase28/phase28-app.js'),{loading:Phase28Loading});

export default function Dashboard(props){
  const renderMode=props.initialData?.phase28Runtime?.renderMode||'legacy';
  const phase28=renderMode==='full'||renderMode==='preview';
  return phase28?<Phase28App {...props}/>:<LegacyDashboard {...props}/>;
}
```

Create `phase28-loading.js` as an accessible non-branded loading state:

```js
export default function Phase28Loading(){
  return <main aria-busy="true" aria-live="polite"><p>운영 화면을 불러오고 있어요.</p></main>;
}
```

Create the initial V106 root without legacy imports:

```js
'use client';

export default function Phase28App({initialData,initialState}){
  const routeId=initialData.phase28Runtime?.routeId||'home';
  return <main data-phase28-root="true" data-phase28-route={routeId} data-legacy-view={initialState.view}>V106 앱 준비 중</main>;
}
```

- [ ] **Step 4: Point legacy-specific static tests at the legacy file**

Change tests that inspect the prior monolithic client from `app/dashboard-client.js` to `app/legacy-dashboard-client.js`. Keep new root-boundary assertions on `app/dashboard-client.js`.

- [ ] **Step 5: Verify and commit**

Run:

```powershell
node --test test/phase28-root-boundary.test.js test/phase28-main-ui.test.js test/phase28-main-server-wiring.test.js test/phase28-orders-cs-server-wiring.test.js
```

Expected: PASS.

```powershell
git add app/dashboard-client.js app/legacy-dashboard-client.js app/_phase28/phase28-app.js app/_phase28/phase28-loading.js test/phase28-root-boundary.test.js test/phase28-main-ui.test.js test/phase28-main-server-wiring.test.js test/phase28-orders-cs-server-wiring.test.js
git commit -m "refactor: isolate Phase 28 application root"
```

---

### Task 4: Build the V106 navigation model and application shell

**Files:**
- Create: `lib/ui/phase28-navigation.js`
- Create: `app/_phase28/phase28-shell.js`
- Create: `app/_phase28/phase28-shell.module.css`
- Create: `app/_phase28/phase28-tokens.module.css`
- Create: `app/_phase28/phase28-command-palette.js`
- Create: `app/_phase28/phase28-evidence-drawer.js`
- Modify: `app/_phase28/phase28-app.js`
- Test: `test/phase28-navigation.test.js`
- Test: `test/phase28-shell-ui.test.js`

**Interfaces:**
- Consumes: `PHASE28_ROUTES`, `{badges,routeId,generatedAt,children}`.
- Produces: `buildPhase28Navigation({badges}) -> {groups,items,mobilePrimary}` and `<Phase28Shell>` with stable `<Link>` navigation.
- Produces: `<Phase28CommandPalette open items onClose />` and `<Phase28EvidenceDrawer open generatedAt source status onClose />`.

- [ ] **Step 1: Write failing navigation and shell contract tests**

```js
'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const navigation=require('../lib/ui/phase28-navigation.js');

test('V106 navigation exposes all 17 stable routes once',()=>{
  const model=navigation.buildPhase28Navigation({badges:{orders:2,cs:3}});
  assert.equal(model.items.length,17);
  assert.equal(new Set(model.items.map(item=>item.href)).size,17);
  assert.deepEqual(model.mobilePrimary,['home','orders','cs','inventory']);
  assert.equal(model.items.find(item=>item.id==='orders').badge,2);
});
```

Add static shell assertions:

```js
const fs=require('node:fs');
const path=require('node:path');

test('V106 shell owns navigation without legacy shell imports',()=>{
  const shell=fs.readFileSync(path.join(__dirname,'..','app','_phase28','phase28-shell.js'),'utf8');
  assert.match(shell,/next\/link/);
  assert.match(shell,/aria-label="허브 메뉴"/);
  assert.match(shell,/aria-label="모바일 주요 메뉴"/);
  assert.doesNotMatch(shell,/HarinAppShell|HarinSidebar|HarinMobileNavigation/);
});

test('V106 shell retains command search and evidence access',()=>{
  const palette=fs.readFileSync(path.join(__dirname,'..','app','_phase28','phase28-command-palette.js'),'utf8');
  const evidence=fs.readFileSync(path.join(__dirname,'..','app','_phase28','phase28-evidence-drawer.js'),'utf8');
  assert.match(palette,/Control|ctrlKey/);
  assert.match(palette,/role="dialog"/);
  assert.match(evidence,/자료 근거/);
  assert.match(evidence,/generatedAt/);
});
```

- [ ] **Step 2: Run tests and verify missing modules**

Run:

```powershell
node --test test/phase28-navigation.test.js test/phase28-shell-ui.test.js
```

Expected: FAIL with `MODULE_NOT_FOUND` and missing shell file.

- [ ] **Step 3: Implement the navigation metadata without duplicating URLs**

Create `phase28-navigation.js` with four groups and metadata keyed by route ID. Resolve every `href` from `PHASE28_ROUTES`:

```js
'use strict';

const {PHASE28_ROUTES}=require('./phase28-route-registry.js');

const GROUPS=Object.freeze([
  {id:'operations',label:'오늘의 운영',items:['home','orders','cs','inventory','products','settlement','keywords']},
  {id:'growth',label:'성장과 관리',items:['product-analysis','analysis','development']},
  {id:'system',label:'시스템',items:['system','notifications']},
  {id:'records',label:'기록과 검증',items:['diagnoses','changes','validation','experiments','knowledge']}
]);
const COPY=Object.freeze({
  home:['오늘','가장 먼저 볼 판단'],orders:['주문·배송','출고·배송 처리'],cs:['고객·CS','문의·반품·교환'],
  inventory:['재고','입고 필요 판단'],products:['상품','상품·원가·채널 연결'],settlement:['정산·비용','지급·수수료·물류비'],
  keywords:['키워드','검색광고·입찰 운영'],'product-analysis':['상품분석','상품별 시장·고객 근거'],analysis:['인사이트','주간 변화·원인·행동'],
  development:['상품개발','상품·실험·시장전환'],system:['시스템','연결·자료·작업 복구'],notifications:['알림','발견·확인·처리'],
  diagnoses:['진단목록','저장 진단 보고서'],changes:['변경기록','변경 전후·롤백'],validation:['실행검증','7일·14일 결과'],
  experiments:['A/B 테스트','표본·신뢰도 판정'],knowledge:['AI 기준자료','원본·검수·적용 범위']
});

function buildPhase28Navigation({badges={}}={}){
  const routes=new Map(PHASE28_ROUTES.map(route=>[route.id,route]));
  const groups=GROUPS.map(group=>Object.freeze({...group,items:Object.freeze(group.items.map(id=>Object.freeze({
    id,href:routes.get(id).href,label:COPY[id][0],description:COPY[id][1],badge:badges[id]==null?null:Number(badges[id])
  })))}));
  return Object.freeze({groups:Object.freeze(groups),items:Object.freeze(groups.flatMap(group=>group.items)),mobilePrimary:Object.freeze(['home','orders','cs','inventory'])});
}

module.exports={GROUPS,COPY,buildPhase28Navigation};
```

- [ ] **Step 4: Port the V106 shell into focused client components**

Create `Phase28Shell` as a client component using `next/link`, `useState`, `useEffect`, and `useRouter`. It must render:

- the exact V106 brand/topbar structure from `source/index.html`
- collapsible desktop navigation with no selected left strip or blue dot
- the active route using `aria-current="page"`
- mobile buttons for Today, Orders, CS, Inventory, plus More
- a modal More panel with Escape close, focus return, and body scroll lock
- a theme button that sets `data-theme="light|dark"` on the V106 root only
- a refresh button that calls `router.refresh()` and does not impersonate a channel sync
- the existing POST logout form at `/api/dashboard/logout`
- a `Ctrl+K` command palette that filters all 17 route labels and navigates with `<Link>`
- a focus-trapped `자료 근거` drawer that displays source, `generatedAt`, and stale/unknown status without exposing credentials

The two overlays use these explicit client interfaces and remain mounted only while open:

```js
export function Phase28CommandPalette({open,items,onClose})
export function Phase28EvidenceDrawer({open,generatedAt,source='MAIN_OPERATION_SUMMARY',status='확인 필요',onClose})
```

Both components use `role="dialog"`, `aria-modal="true"`, Escape close, focus return to the trigger, and a Tab focus loop. `Phase28CommandPalette` listens for `event.ctrlKey&&event.key.toLowerCase()==='k'` in `Phase28Shell`; it filters `item.label` and `item.description` and renders `item.href` with `<Link>`.

Use this public signature:

```js
export default function Phase28Shell({routeId,badges={},generatedAt=null,children})
```

Use CSS Module tokens on `.root`:

```css
.root{
  --p28-canvas-max:2300px;
  --p28-gutter:clamp(34px,3vw,72px);
  --p28-ink:#162137;
  --p28-muted:#63718a;
  --p28-line:#d9e1ec;
  --p28-surface:#fff;
  --p28-soft:#f4f7fb;
  --p28-blue:#4f6fcf;
  --p28-mint:#2e806b;
  min-height:100vh;
  background:#eef2f7;
  color:var(--p28-ink);
}

.root[data-theme="dark"]{
  --p28-ink:#eef3ff;
  --p28-muted:#aab7cf;
  --p28-line:#33415a;
  --p28-surface:#182235;
  --p28-soft:#202c42;
  background:#101827;
}
```

At `980px`, set `--p28-gutter:16px`; at `620px`, set it to `12px`. `phase28-shell.js` imports both modules and combines them on the root:

```js
<div className={`${tokens.root} ${styles.shell}`} data-theme={theme}>
  {children}
</div>
```

Import component CSS from one V106 entry path so Next.js production CSS ordering remains deterministic.

- [ ] **Step 5: Render the shell from the V106 app root**

```js
'use client';

import Phase28Shell from './phase28-shell.js';
import operationSnapshotModule from '../../lib/navigation/operation-snapshot.js';

export default function Phase28App({initialData}){
  const routeId=initialData.phase28Runtime?.routeId||'home';
  const navigationSnapshot=operationSnapshotModule.buildNavigationOperationSnapshot(initialData);
  return <Phase28Shell routeId={routeId} badges={navigationSnapshot?.badges||{}} generatedAt={initialData.generatedAt}>
    <section data-phase28-page={routeId} aria-label="Phase 28 페이지 준비 상태">이 페이지의 운영 화면을 준비하고 있어요.</section>
  </Phase28Shell>;
}
```

- [ ] **Step 6: Verify and commit**

Run:

```powershell
node --test test/phase28-navigation.test.js test/phase28-shell-ui.test.js test/phase28-root-boundary.test.js
pnpm ui:guard
```

Expected: PASS and no new banned design patterns.

```powershell
git add lib/ui/phase28-navigation.js app/_phase28/phase28-shell.js app/_phase28/phase28-shell.module.css app/_phase28/phase28-tokens.module.css app/_phase28/phase28-command-palette.js app/_phase28/phase28-evidence-drawer.js app/_phase28/phase28-app.js test/phase28-navigation.test.js test/phase28-shell-ui.test.js
git commit -m "feat: add Phase 28 V106 application shell"
```

---

### Task 5: Build shared heading, channel-logo, and right-rail primitives

**Files:**
- Create: `app/_phase28/primitives/page-heading.js`
- Create: `app/_phase28/primitives/channel-logo.js`
- Create: `app/_phase28/primitives/right-rail-layout.js`
- Create: `app/_phase28/primitives/primitives.module.css`
- Test: `test/phase28-primitives-ui.test.js`

**Interfaces:**
- Produces: `<Phase28PageHeading context title accent suffix summary />`
- Produces: `<Phase28ChannelLogo brand="NAVER|CAFE24|COUPANG" size="standard|compact" />`
- Produces: `<Phase28RightRailLayout label rail children defaultOpen />`.

- [ ] **Step 1: Write failing primitive contract tests**

```js
'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('shared heading owns the single underline animation',()=>{
  const heading=read('app/_phase28/primitives/page-heading.js');
  const css=read('app/_phase28/primitives/primitives.module.css');
  assert.match(heading,/page-title-accent/);
  assert.match(css,/transform:scaleX\(0\)/);
  assert.match(css,/transform-origin:left/);
  assert.match(css,/@media \(prefers-reduced-motion:reduce\)/);
});

test('right rail collapses to a square without a vertical shell',()=>{
  const rail=read('app/_phase28/primitives/right-rail-layout.js');
  const css=read('app/_phase28/primitives/primitives.module.css');
  assert.match(rail,/aria-expanded=\{open\}/);
  assert.match(rail,/aria-hidden=\{!open\}/);
  assert.match(rail,/inert=\{open\?undefined:''\}/);
  assert.match(css,/--panel-closed-width:48px/);
  assert.match(css,/max-height:48px/);
  assert.match(css,/440ms/);
  assert.doesNotMatch(css,/border-left\s*:/);
});
```

- [ ] **Step 2: Run tests and verify files are missing**

Run:

```powershell
node --test test/phase28-primitives-ui.test.js
```

Expected: FAIL with `ENOENT`.

- [ ] **Step 3: Implement the shared heading and logo**

```js
export function Phase28PageHeading({context,title,accent,suffix='',summary}){
  return <header className={styles.heading}>
    <div className={styles.context}><i aria-hidden="true"/>{context}</div>
    <h1>{title}<em className="page-title-accent">{accent}</em>{suffix}</h1>
    <p>{summary}</p>
  </header>;
}

const LOGOS={NAVER:{mark:'N',label:'네이버'},CAFE24:{mark:'24',label:'Cafe24'},COUPANG:{mark:'C',label:'쿠팡'}};
export function Phase28ChannelLogo({brand,size='standard'}){
  const normalized=String(brand||'').toUpperCase();
  const logo=LOGOS[normalized]||{mark:'·',label:'채널 확인 필요'};
  return <span className={`${styles.channelLogo} ${styles[size]}`} data-brand={normalized.toLowerCase()} role="img" aria-label={logo.label}>{logo.mark}</span>;
}
```

- [ ] **Step 4: Implement the shared right-rail layout from the V106 motion contract**

```js
'use client';

import {useId,useState} from 'react';
import styles from './primitives.module.css';

export function Phase28RightRailLayout({label='보조 작업석',rail,children,defaultOpen=true}){
  const [open,setOpen]=useState(defaultOpen);
  const contentId=useId();
  return <div className={styles.workspace} data-open={open?'true':'false'}>
    <div className={styles.workspaceMain}>{children}</div>
    <aside className={styles.rail} aria-label={label}>
      <button type="button" className={styles.railControl} aria-expanded={open} aria-controls={contentId} onClick={()=>setOpen(value=>!value)}>
        <span aria-hidden="true">{open?'›':'‹'}</span><b>{open?`${label} 접기`:`${label} 열기`}</b>
      </button>
      <div id={contentId} className={styles.railContent} aria-hidden={!open} inert={open?undefined:''}>{rail}</div>
    </aside>
  </div>;
}
```

Port the exact motion values from `source/phase28-panel-motion.css`. Above `1480px`, `.workspace[data-open="false"]` must change the second grid track to `48px`, gap to `16px`, and `.rail` to `max-height:48px`, transparent background, no border, and no shadow. The control remains a balanced `48×48px` square. Below `1480px`, stack the rail and restore the full-width control. Do not use `display:none` for rail content; fade, translate, hide visibility, and disable pointer events.

- [ ] **Step 5: Verify and commit**

Run:

```powershell
node --test test/phase28-primitives-ui.test.js
pnpm ui:guard
```

Expected: PASS.

```powershell
git add app/_phase28/primitives test/phase28-primitives-ui.test.js
git commit -m "feat: add Phase 28 shared UI primitives"
```

---

### Task 6: Make the Main ViewModel truthful and route-aware

**Files:**
- Modify: `lib/ui/phase28-route-registry.js`
- Modify: `lib/ui/phase28-adapters/main.js`
- Modify: `lib/ui/phase28-adapters/index.js`
- Modify: `test/phase28-route-registry.test.js`
- Modify: `test/phase28-main-adapter.test.js`

**Interfaces:**
- Produces: `phase28RouteForLegacyState({view,workspace}) -> route|null`.
- Produces: `buildPhase28MainModel(data)` where unknown counts are `null` with `BLOCKED`, while a real numeric zero remains zero with `READY`.

- [ ] **Step 1: Write failing route and evidence tests**

```js
test('legacy state resolves to one stable Phase 28 route',()=>{
  assert.equal(routes.phase28RouteForLegacyState({view:'main',workspace:null}).id,'home');
  assert.equal(routes.phase28RouteForLegacyState({view:'product',workspace:'catalog'}).id,'products');
  assert.equal(routes.phase28RouteForLegacyState({view:'unknown',workspace:null}),null);
});

test('missing Main counts stay unknown instead of becoming zero',()=>{
  const model=buildPhase28MainModel({salesCommandCenter:{daily:{},metrics:{},cashflow:{}}});
  assert.equal(model.hero.taskCount,null);
  assert.equal(model.hero.exceptionCount,null);
  assert.equal(model.hero.status,'BLOCKED');
});

test('a measured zero stays a real zero',()=>{
  const model=buildPhase28MainModel({salesCommandCenter:{daily:{total:0,exception_total:0},metrics:{},cashflow:{}}});
  assert.equal(model.hero.taskCount,0);
  assert.equal(model.hero.exceptionCount,0);
  assert.equal(model.hero.status,'READY');
});
```

- [ ] **Step 2: Run tests and verify current zero coercion fails**

Run:

```powershell
node --test test/phase28-route-registry.test.js test/phase28-main-adapter.test.js
```

Expected: FAIL because the route resolver is absent and missing totals become zero.

- [ ] **Step 3: Implement route resolution and truthful count normalization**

```js
function phase28RouteForLegacyState({view,workspace}={}){
  const candidates=PHASE28_ROUTES.filter(route=>route.legacyView===view);
  return candidates.find(route=>route.workspace&&route.workspace===workspace)
    ||candidates.find(route=>route.workspace===null)
    ||(candidates.length===1?candidates[0]:null)
    ||null;
}
```

Add `phase28RouteForLegacyState` to `module.exports` beside the existing registry functions.

In `buildPhase28MainModel`, replace numeric coercion with:

```js
const numeric=value=>typeof value==='number'&&Number.isFinite(value)?value:null;
const taskCount=numeric(daily.total);
const exceptionCount=numeric(daily.exception_total);
const countsReady=taskCount!==null&&exceptionCount!==null;
```

Set `hero.status` to `READY` only when `countsReady`; otherwise use `BLOCKED`, keep counts `null`, and use the headline `오늘 운영 건수는 확인이 필요해요.`. Preserve actual zero.

- [ ] **Step 4: Verify and commit**

Run:

```powershell
node --test test/phase28-route-registry.test.js test/phase28-main-adapter.test.js test/phase28-view-model.test.js
```

Expected: PASS.

```powershell
git add lib/ui/phase28-route-registry.js lib/ui/phase28-adapters/main.js lib/ui/phase28-adapters/index.js test/phase28-route-registry.test.js test/phase28-main-adapter.test.js
git commit -m "fix: preserve Phase 28 Main evidence states"
```

---

### Task 7: Port the V106 Main page and connect real navigation

**Files:**
- Create: `app/_phase28/pages/home-page.js`
- Create: `app/_phase28/pages/home-page.module.css`
- Modify: `app/_phase28/phase28-app.js`
- Remove after replacement: `app/_phase28/main-dashboard.js`
- Remove after replacement: `app/_phase28/phase28-main.css`
- Modify: `test/phase28-main-ui.test.js`
- Create: `test/phase28-home-parity.test.js`

**Interfaces:**
- Consumes: `model=buildPhase28MainModel(dashboardData)`, `aiPanel`, and `navigate(target)`.
- Produces: `<Phase28HomePage model aiPanel onNavigate />` using only V106 primitives and no legacy UI child.

- [ ] **Step 1: Write failing Main parity tests**

```js
'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('V106 Main uses shared heading and shared right rail',()=>{
  const page=read('app/_phase28/pages/home-page.js');
  assert.match(page,/Phase28PageHeading/);
  assert.match(page,/Phase28RightRailLayout/);
  assert.match(page,/오늘의 운영선/);
  assert.match(page,/오늘 사장님이 결정할 일/);
  assert.doesNotMatch(page,/Phase14MainCommandCenter|HarinAppShell/);
});

test('V106 Main CSS keeps approved geometry and readable scale',()=>{
  const css=read('app/_phase28/pages/home-page.module.css');
  assert.match(css,/min-height:44px/);
  assert.match(css,/font-size:17px/);
  assert.match(css,/@media \(max-width:430px\)/);
  assert.doesNotMatch(css,/border-left\s*:/);
  assert.doesNotMatch(css,/font-size:(?:[0-9]|1[01])px/);
});
```

- [ ] **Step 2: Run tests and verify the new page is absent**

Run:

```powershell
node --test test/phase28-main-ui.test.js test/phase28-home-parity.test.js
```

Expected: FAIL with `ENOENT` for the new page.

- [ ] **Step 3: Port the Main DOM and behavior**

Move the existing data-formatting and list helpers from `main-dashboard.js` into `pages/home-page.js`, then replace its local hero and rail wrappers with `Phase28PageHeading`, `Phase28ChannelLogo`, and `Phase28RightRailLayout`.

The exported component must have this signature and structure:

```js
'use client';

import {Phase28ChannelLogo} from '../primitives/channel-logo.js';
import {Phase28PageHeading} from '../primitives/page-heading.js';
import {Phase28RightRailLayout} from '../primitives/right-rail-layout.js';
import styles from './home-page.module.css';

export default function Phase28HomePage({model={},aiPanel=null,onNavigate=()=>{}}){
  const hero=model.hero||{};
  return <section className={styles.home} data-phase28-page="home">
    <Phase28PageHeading
      context={`실제 운영 자료 · ${formatAsOf(hero.asOf)}`}
      title={hero.taskCount===null?'오늘 확인할 운영 건수는 ':hero.taskCount>0?'오늘 처리할 일은 ':'오늘 회사는 '}
      accent={hero.taskCount===null?'확인 필요':hero.taskCount>0?`${hero.taskCount}건`:'순항 중'}
      suffix={hero.taskCount>0?'이에요.':'이에요.'}
      summary={hero.summary}
    />
    <MainMetrics metrics={model.metrics||{}} onNavigate={onNavigate}/>
    <OperatingLine items={model.schedule||[]} onNavigate={onNavigate}/>
    <Phase28RightRailLayout label="사장님 판단 보조석" rail={<MainDecisionRail model={model} aiPanel={aiPanel} onNavigate={onNavigate}/>}>
      <MainDecisionList items={model.decisions||[]} onNavigate={onNavigate}/>
      <MainSignalSheets channels={model.channels||[]} growth={model.growth||[]} risks={model.risks||[]} onNavigate={onNavigate}/>
    </Phase28RightRailLayout>
  </section>;
}
```

Port the V106 Main layout values from `source/index.html` and the final overrides in `source/detail-polish-v106.css`; do not copy sample counts. Channel rows must use `Phase28ChannelLogo` and the adapter's actual status/as-of values.

- [ ] **Step 4: Route all Main interactions through stable URLs**

In `phase28-app.js`, use `useRouter()` and `phase28Route(id).href`. Translate legacy target views through `phase28RouteForLegacyState` before calling `router.push()`. Render `Phase28HomePage` only for `routeId==='home'`; render a V106 neutral `확인 필요` page for a preview route whose adapter is not present. Never fall back to a legacy page inside `Phase28Shell`.

- [ ] **Step 5: Remove the replaced local Main files and update tests**

Delete `main-dashboard.js` and `phase28-main.css` only after `home-page.js` is wired. Update imports and static tests to the new paths.

- [ ] **Step 6: Verify and commit**

Run:

```powershell
node --test test/phase28-main-ui.test.js test/phase28-home-parity.test.js test/phase28-primitives-ui.test.js test/phase28-main-adapter.test.js
pnpm ui:guard
```

Expected: PASS.

```powershell
git add app/_phase28 test/phase28-main-ui.test.js test/phase28-home-parity.test.js
git commit -m "feat: port V106 Main into the Phase 28 shell"
```

---

### Task 8: Wire authenticated server rendering and local preview

**Files:**
- Modify: `app/page.js`
- Modify: `lib/ui/phase28-readiness.js`
- Modify: `package.json`
- Modify: `test/phase28-main-server-wiring.test.js`
- Modify: `test/phase28-foundation-acceptance.test.js`
- Create: `docs/PHASE28_FULL_REPLACEMENT_ACCEPTANCE.md`

**Interfaces:**
- Consumes: authenticated `initialState`, `dashboardData`, route resolver, readiness report, and environment.
- Produces: `initialData.phase28Runtime` with the request `routeId`; builds the Main ViewModel only for a V106 Main request.

- [ ] **Step 1: Write failing server wiring assertions**

```js
test('server resolves the requested Phase 28 route before render mode',()=>{
  const page=read('app/page.js');
  assert.match(page,/phase28RouteForLegacyState\(initialState\)/);
  assert.match(page,/buildPhase28Readiness/);
  assert.match(page,/phase28RuntimeConfig\(process\.env,\{readiness,routeId/);
});

test('Main ViewModel is built only for preview or full Main',()=>{
  const page=read('app/page.js');
  assert.match(page,/\['preview','full'\]\.includes\(phase28Runtime\.renderMode\)/);
  assert.match(page,/phase28Runtime\.routeId==='home'/);
  assert.match(page,/buildPhase28MainModel\(dashboardData\)/);
});
```

- [ ] **Step 2: Run focused tests and verify the old active-page wiring fails**

Run:

```powershell
node --test test/phase28-main-server-wiring.test.js test/phase28-foundation-acceptance.test.js
```

Expected: FAIL because `app/page.js` still uses `activePages.includes('home')` before route-aware readiness.

- [ ] **Step 3: Build readiness and runtime after authentication and route resolution**

Inside `renderDashboardState(initialState)`, after the session check:

```js
const route=phase28RoutesModule.phase28RouteForLegacyState(initialState);
const routeId=route?.id||null;
const readiness=phase28ReadinessModule.buildPhase28Readiness({
  routes:phase28RoutesModule.PHASE28_ROUTES,
  hubNav:hubRoutesModule.HUB_NAV,
  hubWorkspaces:hubRoutesModule.HUB_WORKSPACES,
  env:process.env,
  availableAdapters:phase28AdaptersModule.PHASE28_AVAILABLE_ADAPTERS
});
const phase28Runtime=featureFlagsModule.phase28RuntimeConfig(process.env,{readiness,routeId});
```

Build `phase28.main` only when `['preview','full'].includes(phase28Runtime.renderMode)&&phase28Runtime.routeId==='home'`. On adapter error, keep the V106 root and expose `adapter_status:'ERROR'`; do not render a legacy page inside the new shell.

- [ ] **Step 4: Replace overlay verification commands**

Add:

```json
"verify:phase28-foundation-main": "node --test test/phase28-v106-reference.test.js test/phase28-route-registry.test.js test/phase28-feature-flags.test.js test/phase28-readiness.test.js test/phase28-cutover-mode.test.js test/phase28-root-boundary.test.js test/phase28-navigation.test.js test/phase28-shell-ui.test.js test/phase28-primitives-ui.test.js test/phase28-main-adapter.test.js test/phase28-main-server-wiring.test.js test/phase28-main-ui.test.js test/phase28-home-parity.test.js && pnpm ui:guard"
```

Keep older verification scripts callable until their tests are migrated, but document them as legacy-overlay checks and exclude them from the new acceptance command.

- [ ] **Step 5: Record preview and rollback commands**

Write `docs/PHASE28_FULL_REPLACEMENT_ACCEPTANCE.md` with:

```markdown
# Phase 28 full replacement acceptance

## Local V106 Main preview

Set `HARIN_PHASE28_ENABLED=false`, `HARIN_PHASE28_PREVIEW=true`, `HARIN_PHASE28_PAGES=home`, and `NODE_ENV=development`; then run `pnpm dev` and sign in normally.

## Production safety

Partial page coverage or missing adapters returns `renderMode=legacy` with no Phase 28 overlay pages. Production full mode requires all 17 page IDs and `cutover=READY`.

## Rollback

Set `HARIN_PHASE28_ENABLED=false` and redeploy. The whole application returns to the legacy root; no per-page mixed state remains.
```

- [ ] **Step 6: Verify and commit**

Run:

```powershell
pnpm verify:phase28-foundation-main
```

Expected: PASS.

```powershell
git add app/page.js lib/ui/phase28-readiness.js package.json test/phase28-main-server-wiring.test.js test/phase28-foundation-acceptance.test.js docs/PHASE28_FULL_REPLACEMENT_ACCEPTANCE.md
git commit -m "feat: wire authenticated Phase 28 Main preview"
```

---

### Task 9: Run full regression, browser parity, and review gate

**Files:**
- Create: `output/phase28-foundation-main/verification.md`
- Create: `output/phase28-foundation-main/screenshots/home-1728-light.png`
- Create: `output/phase28-foundation-main/screenshots/home-430-light.png`
- Create: `output/phase28-foundation-main/screenshots/home-390-dark.png`
- Create: `output/phase28-foundation-main/screenshots/home-1728-collapsed.png`
- Modify only if verification finds a defect: files owned by Tasks 2–8 and their focused tests.

**Interfaces:**
- Consumes: local authenticated V106 preview and immutable V106 reference screenshots.
- Produces: evidence that code, browser behavior, and visual geometry pass before Orders/CS work begins.

- [ ] **Step 1: Run focused and full automated verification**

Run:

```powershell
pnpm verify:phase28-foundation-main
pnpm test
pnpm build
git diff --check
```

Expected: all commands PASS. Record the exact test count, build result, and commit SHA in `verification.md`.

- [ ] **Step 2: Start the local authenticated preview**

Set the development-only environment values without putting credentials in the repository:

```powershell
$env:HARIN_PHASE28_ENABLED='false'
$env:HARIN_PHASE28_PREVIEW='true'
$env:HARIN_PHASE28_PAGES='home'
pnpm dev
```

Sign in through the existing login page. Do not automate or store the password.

- [ ] **Step 3: Capture the four required browser states**

Capture and inspect:

- 1728px light, right rail open
- 1728px light, right rail collapsed
- 430px light
- 390px dark

For each state verify: no console errors, no failed application requests, no horizontal overflow, no legacy V8 header/sidebar/card, stable URL `/`, title underline draws once, active navigation has no left strip or blue dot, controls are at least 44px, and the collapsed desktop rail leaves only the 48×48 button.

- [ ] **Step 4: Compare against the reference and fix one defect per test cycle**

Use `docs/design-reference/phase28-v106/screenshots/` as the comparison source. Common shell and primary geometry must be within 2px at the reference widths; colors must use the same token values; text wrapping must match for the same fixture state. For every mismatch, add or strengthen a focused static/unit test, verify failure, fix the owning module, and rerun the focused test before recapturing.

- [ ] **Step 5: Record evidence and commit the gate**

Generate `verification.md` from the actual command output. Resolve the values first:

```powershell
$phase28VerifySha=git rev-parse HEAD
$phase28TestOutput=pnpm test 2>&1 | Tee-Object -Variable phase28CapturedTests
if($LASTEXITCODE -ne 0){ throw 'pnpm test failed' }
```

Then write the verified SHA and the exact passed-test count parsed from `$phase28CapturedTests`. The finished file must use this structure with real values, not angle-bracket markers:

```markdown
# Phase 28 foundation and Main verification

- Commit: actual SHA from `git rev-parse HEAD`
- Focused verification: PASS
- Full tests: PASS with the exact count from the test runner
- Production build: PASS
- UI guard: PASS
- Console errors: 0
- Failed application requests: 0
- Desktop open rail: PASS
- Desktop collapsed 48×48 rail: PASS
- Mobile 430 light: PASS
- Mobile 390 dark: PASS
- Production cutover: BLOCKED until all 17 adapters and pages pass
```

```powershell
git add output/phase28-foundation-main
git commit -m "test: verify Phase 28 foundation and Main"
git status --short
```

Expected: clean worktree. Do not merge or deploy this partial foundation to production. Proceed to the Orders/CS plan only after reviewing these screenshots against V106.
