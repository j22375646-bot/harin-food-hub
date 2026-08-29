# Phase 28 Overlay Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the disabled-by-default route, feature-flag, evidence-contract, and readiness foundations required to migrate the 17 V106 screens without changing the current production UI.

**Architecture:** Keep the current V8 routes and services authoritative. Add a Phase 28 registry that maps preview IDs to production addresses, a fail-closed per-page flag parser, a source-aware ViewModel normalizer, and a readiness report that blocks cutover when a route or adapter is missing.

**Tech Stack:** Node.js 24, CommonJS modules, `node:test`, Next.js 16.3 existing application

**Spec:** `docs/superpowers/specs/2026-08-29-phase28-overlay-readiness-design.md`

## Global Constraints

- `HARIN_PHASE28_ENABLED` defaults to `false`.
- `HARIN_PHASE28_PAGES` defaults to an empty list.
- Do not change the rendered application or navigation in this foundation plan.
- Preserve `HARIN_V8_ENABLED` and its rollback behavior.
- Preserve Naver, Coupang, and Cafe24 data and write-path isolation.
- Preserve unknown and stale values as `BLOCKED`, `SETUP_REQUIRED`, or `PARTIAL`; never convert them to zero.
- Do not add dependencies.
- Every production change begins with a failing `node:test` test.

---

### Task 1: Phase 28 route registry

**Files:**
- Create: `lib/ui/phase28-route-registry.js`
- Create: `test/phase28-route-registry.test.js`

**Interfaces:**
- Produces: `PHASE28_ROUTES`, `PHASE28_ROUTE_IDS`, `phase28Route(id)`, `phase28RouteForPath(pathname)`, `validatePhase28Registry(routes)`
- Route entries expose: `id`, `href`, `legacyView`, `workspace`, `adapterId`, `writePolicy`, `preserveWorkspaces`

- [ ] **Step 1: Write the failing registry tests**

```js
'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {
  PHASE28_ROUTES,
  PHASE28_ROUTE_IDS,
  phase28Route,
  phase28RouteForPath,
  validatePhase28Registry
}=require('../lib/ui/phase28-route-registry.js');

test('Phase 28 registry maps all seventeen V106 screens to stable production addresses',()=>{
  assert.equal(PHASE28_ROUTES.length,17);
  assert.equal(new Set(PHASE28_ROUTE_IDS).size,17);
  assert.equal(new Set(PHASE28_ROUTES.map(item=>item.href)).size,17);
  assert.equal(phase28Route('home').href,'/');
  assert.equal(phase28Route('keywords').href,'/keywords/registered');
  assert.equal(phase28Route('product-analysis').href,'/product-analysis');
  assert.equal(phase28Route('analysis').href,'/insights/overview');
  assert.equal(phase28RouteForPath('/products/catalog').id,'products');
});

test('Phase 28 registry keeps workspaces and channel writes explicit',()=>{
  assert.equal(phase28Route('system').preserveWorkspaces,true);
  assert.equal(phase28Route('development').preserveWorkspaces,true);
  assert.equal(phase28Route('orders').writePolicy,'GUARDED');
  assert.equal(phase28Route('product-analysis').writePolicy,'READ_ONLY');
  assert.equal(phase28Route('analysis').writePolicy,'READ_ONLY');
});

test('Phase 28 registry rejects duplicates and incomplete entries',()=>{
  const duplicate=[...PHASE28_ROUTES,{...PHASE28_ROUTES[0]}];
  assert.deepEqual(validatePhase28Registry(PHASE28_ROUTES),[]);
  assert.ok(validatePhase28Registry(duplicate).some(issue=>issue.code==='DUPLICATE_ID'));
  assert.ok(validatePhase28Registry([{id:'broken',href:'relative'}]).some(issue=>issue.code==='INVALID_HREF'));
});
```

- [ ] **Step 2: Run the test and verify the missing module failure**

Run: `node --test test/phase28-route-registry.test.js`

Expected: FAIL with `Cannot find module '../lib/ui/phase28-route-registry.js'`.

- [ ] **Step 3: Implement the registry**

```js
'use strict';

const PHASE28_ROUTES=Object.freeze([
  {id:'home',href:'/',legacyView:'main',workspace:null,adapterId:'main',writePolicy:'READ_ONLY',preserveWorkspaces:false},
  {id:'orders',href:'/orders',legacyView:'orders',workspace:null,adapterId:'orders',writePolicy:'GUARDED',preserveWorkspaces:false},
  {id:'cs',href:'/cs',legacyView:'cs',workspace:null,adapterId:'cs',writePolicy:'GUARDED',preserveWorkspaces:false},
  {id:'inventory',href:'/inventory',legacyView:'inventory',workspace:null,adapterId:'inventory',writePolicy:'READ_ONLY',preserveWorkspaces:false},
  {id:'products',href:'/products/catalog',legacyView:'product',workspace:'catalog',adapterId:'products',writePolicy:'GUARDED',preserveWorkspaces:true},
  {id:'settlement',href:'/settlement-costs',legacyView:'settlement',workspace:null,adapterId:'settlement',writePolicy:'READ_ONLY',preserveWorkspaces:false},
  {id:'keywords',href:'/keywords/registered',legacyView:'keyword',workspace:'registered',adapterId:'keywords',writePolicy:'GUARDED',preserveWorkspaces:true},
  {id:'product-analysis',href:'/product-analysis',legacyView:null,workspace:null,adapterId:'product-analysis',writePolicy:'READ_ONLY',preserveWorkspaces:false},
  {id:'analysis',href:'/insights/overview',legacyView:'insight',workspace:'overview',adapterId:'insights',writePolicy:'READ_ONLY',preserveWorkspaces:true},
  {id:'development',href:'/market-intelligence',legacyView:'market',workspace:null,adapterId:'development',writePolicy:'GUARDED',preserveWorkspaces:true},
  {id:'system',href:'/data-collection',legacyView:'collection',workspace:'overview',adapterId:'system',writePolicy:'GUARDED',preserveWorkspaces:true},
  {id:'notifications',href:'/notifications',legacyView:'notifications',workspace:null,adapterId:'notifications',writePolicy:'GUARDED',preserveWorkspaces:false},
  {id:'diagnoses',href:'/diagnoses',legacyView:'reports',workspace:null,adapterId:'diagnoses',writePolicy:'READ_ONLY',preserveWorkspaces:false},
  {id:'changes',href:'/approvals',legacyView:'changes',workspace:null,adapterId:'changes',writePolicy:'GUARDED',preserveWorkspaces:false},
  {id:'validation',href:'/execution-validation',legacyView:'validation',workspace:null,adapterId:'validation',writePolicy:'READ_ONLY',preserveWorkspaces:false},
  {id:'experiments',href:'/ab-tests',legacyView:'experiments',workspace:null,adapterId:'experiments',writePolicy:'GUARDED',preserveWorkspaces:false},
  {id:'knowledge',href:'/ai-knowledge',legacyView:'knowledge',workspace:null,adapterId:'knowledge',writePolicy:'GUARDED',preserveWorkspaces:false}
]);

const PHASE28_ROUTE_IDS=Object.freeze(PHASE28_ROUTES.map(item=>item.id));
const byId=new Map(PHASE28_ROUTES.map(item=>[item.id,item]));
const normalizePath=value=>String(value||'/').split('?')[0].replace(/\/+$/,'')||'/';

function phase28Route(id){ return byId.get(String(id||''))||null; }
function phase28RouteForPath(pathname){
  const path=normalizePath(pathname);
  return PHASE28_ROUTES.find(item=>normalizePath(item.href)===path)||null;
}
function validatePhase28Registry(routes=PHASE28_ROUTES){
  const issues=[];
  const ids=new Set();
  const hrefs=new Set();
  for(const route of routes){
    if(!route?.id)issues.push({code:'MISSING_ID'});
    else if(ids.has(route.id))issues.push({code:'DUPLICATE_ID',id:route.id});
    else ids.add(route.id);
    if(!String(route?.href||'').startsWith('/'))issues.push({code:'INVALID_HREF',id:route?.id||null});
    else if(hrefs.has(route.href))issues.push({code:'DUPLICATE_HREF',href:route.href});
    else hrefs.add(route.href);
    if(!route?.adapterId)issues.push({code:'MISSING_ADAPTER',id:route?.id||null});
    if(!['READ_ONLY','GUARDED'].includes(route?.writePolicy))issues.push({code:'INVALID_WRITE_POLICY',id:route?.id||null});
  }
  return issues;
}

module.exports={PHASE28_ROUTES,PHASE28_ROUTE_IDS,phase28Route,phase28RouteForPath,validatePhase28Registry};
```

- [ ] **Step 4: Run the registry tests**

Run: `node --test test/phase28-route-registry.test.js`

Expected: 3 tests, 3 pass, 0 fail.

- [ ] **Step 5: Commit the registry**

```powershell
git add lib/ui/phase28-route-registry.js test/phase28-route-registry.test.js
git commit -m "feat: add Phase 28 route registry"
```

### Task 2: Fail-closed Phase 28 feature flags

**Files:**
- Modify: `lib/ui/feature-flags.js`
- Create: `test/phase28-feature-flags.test.js`

**Interfaces:**
- Consumes: `PHASE28_ROUTE_IDS` from Task 1
- Produces: `phase28UiConfig(env) -> {enabled,pages,invalidPages,valid,active,rollbackFlag,pagesFlag}`
- Extends: `harinUiConfig(env).phase28`

- [ ] **Step 1: Write the failing flag tests**

```js
'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const flags=require('../lib/ui/feature-flags.js');

test('Phase 28 is disabled with no active pages by default',()=>{
  const config=flags.phase28UiConfig({});
  assert.equal(config.enabled,false);
  assert.deepEqual(config.pages,[]);
  assert.equal(config.active('home'),false);
  assert.equal(flags.harinUiConfig({}).phase28.enabled,false);
});

test('Phase 28 activates only allowlisted pages when the master flag is on',()=>{
  const config=flags.phase28UiConfig({HARIN_PHASE28_ENABLED:'true',HARIN_PHASE28_PAGES:'home, orders,home'});
  assert.equal(config.valid,true);
  assert.deepEqual(config.pages,['home','orders']);
  assert.equal(config.active('home'),true);
  assert.equal(config.active('cs'),false);
});

test('Phase 28 refuses all activation when any configured page is unknown',()=>{
  const config=flags.phase28UiConfig({HARIN_PHASE28_ENABLED:'true',HARIN_PHASE28_PAGES:'home,admin'});
  assert.equal(config.valid,false);
  assert.deepEqual(config.invalidPages,['admin']);
  assert.equal(config.active('home'),false);
});
```

- [ ] **Step 2: Run the tests and verify `phase28UiConfig` is missing**

Run: `node --test test/phase28-feature-flags.test.js`

Expected: FAIL with `flags.phase28UiConfig is not a function`.

- [ ] **Step 3: Implement fail-closed parsing**

Add to `lib/ui/feature-flags.js`:

```js
const {PHASE28_ROUTE_IDS}=require('./phase28-route-registry.js');

function listFlag(value){
  return [...new Set(String(value||'').split(',').map(item=>item.trim()).filter(Boolean))];
}

function phase28UiConfig(env=process.env){
  const enabled=booleanFlag(env.HARIN_PHASE28_ENABLED,false);
  const requested=listFlag(env.HARIN_PHASE28_PAGES);
  const allowed=new Set(PHASE28_ROUTE_IDS);
  const invalidPages=requested.filter(id=>!allowed.has(id));
  const valid=invalidPages.length===0;
  const pages=valid?requested:[];
  return {
    enabled,
    pages,
    invalidPages,
    valid,
    active:id=>enabled&&valid&&pages.includes(id),
    rollbackFlag:'HARIN_PHASE28_ENABLED',
    pagesFlag:'HARIN_PHASE28_PAGES'
  };
}
```

Change `harinUiConfig` to include `phase28:phase28UiConfig(env)`, and export `listFlag` and `phase28UiConfig` without changing the existing V8 fields.

- [ ] **Step 4: Run focused and existing feature-flag tests**

Run: `node --test test/phase28-feature-flags.test.js test/phase14-final-quality.test.js`

Expected: all tests pass.

- [ ] **Step 5: Commit the flags**

```powershell
git add lib/ui/feature-flags.js test/phase28-feature-flags.test.js
git commit -m "feat: add fail-closed Phase 28 flags"
```

### Task 3: Source-aware Phase 28 metric contract

**Files:**
- Create: `lib/ui/phase28-view-model.js`
- Create: `test/phase28-view-model.test.js`

**Interfaces:**
- Produces: `PHASE28_METRIC_KINDS`, `PHASE28_DATA_STATUSES`, `normalizePhase28Metric(input)`
- Normalized metric fields: `value`, `unit`, `source`, `metricKind`, `status`, `period`, `asOf`, `sampleSize`, `formulaVersion`, `reasons`

- [ ] **Step 1: Write failing contract tests**

```js
'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizePhase28Metric}=require('../lib/ui/phase28-view-model.js');

test('Phase 28 metric preserves a confirmed zero',()=>{
  const metric=normalizePhase28Metric({value:0,unit:'KRW',source:'Harin Orders',metricKind:'actual',status:'READY',period:'DAY',asOf:'2026-08-29T00:00:00.000Z',sampleSize:null});
  assert.equal(metric.value,0);
  assert.equal(metric.status,'READY');
  assert.equal(metric.sampleSize,null);
});

test('Phase 28 metric blocks a missing READY value instead of inventing zero',()=>{
  const metric=normalizePhase28Metric({value:null,unit:'KRW',source:'Harin Cost Ledger',metricKind:'calculated',status:'READY',period:'DAY',asOf:'2026-08-29T00:00:00.000Z'});
  assert.equal(metric.value,null);
  assert.equal(metric.status,'BLOCKED');
  assert.deepEqual(metric.reasons,['VALUE_MISSING']);
});

test('Phase 28 metric removes values from blocked and setup states',()=>{
  for(const status of ['BLOCKED','SETUP_REQUIRED','ERROR']){
    const metric=normalizePhase28Metric({value:123,unit:'EA',source:'Provider',metricKind:'estimate',status,period:'WEEK',asOf:null,reasons:['SOURCE_UNAVAILABLE']});
    assert.equal(metric.value,null);
    assert.equal(metric.status,status);
  }
});

test('Phase 28 metric rejects unknown evidence kinds and statuses',()=>{
  assert.throws(()=>normalizePhase28Metric({source:'x',metricKind:'magic',status:'READY'}),/metricKind/);
  assert.throws(()=>normalizePhase28Metric({source:'x',metricKind:'actual',status:'UNKNOWN'}),/status/);
});
```

- [ ] **Step 2: Run the tests and verify the missing module failure**

Run: `node --test test/phase28-view-model.test.js`

Expected: FAIL with `Cannot find module '../lib/ui/phase28-view-model.js'`.

- [ ] **Step 3: Implement the metric normalizer**

```js
'use strict';

const PHASE28_METRIC_KINDS=Object.freeze(['actual','calculated','relative','sample','estimate']);
const PHASE28_DATA_STATUSES=Object.freeze(['READY','PARTIAL','BLOCKED','SETUP_REQUIRED','ERROR']);

function normalizeReasons(value){
  return [...new Set((Array.isArray(value)?value:[]).map(item=>String(item||'').trim()).filter(Boolean))];
}

function normalizePhase28Metric(input={}){
  const metricKind=String(input.metricKind||'');
  const requestedStatus=String(input.status||'');
  if(!PHASE28_METRIC_KINDS.includes(metricKind))throw new TypeError(`Unsupported Phase 28 metricKind: ${metricKind||'(empty)'}`);
  if(!PHASE28_DATA_STATUSES.includes(requestedStatus))throw new TypeError(`Unsupported Phase 28 status: ${requestedStatus||'(empty)'}`);
  if(!String(input.source||'').trim())throw new TypeError('Phase 28 metric source is required');
  const reasons=normalizeReasons(input.reasons);
  const missing=requestedStatus==='READY'&&(input.value===null||input.value===undefined||input.value==='');
  const status=missing?'BLOCKED':requestedStatus;
  if(missing&&!reasons.includes('VALUE_MISSING'))reasons.push('VALUE_MISSING');
  const numericAllowed=typeof input.value==='number'&&Number.isFinite(input.value);
  const exposesValue=['READY','PARTIAL'].includes(status)&&numericAllowed;
  const sampleSize=input.sampleSize===null||input.sampleSize===undefined||input.sampleSize===''?null:Number(input.sampleSize);
  return Object.freeze({
    value:exposesValue?input.value:null,
    unit:String(input.unit||''),
    source:String(input.source).trim(),
    metricKind,
    status,
    period:String(input.period||''),
    asOf:input.asOf?String(input.asOf):null,
    sampleSize:Number.isFinite(sampleSize)?sampleSize:null,
    formulaVersion:input.formulaVersion?String(input.formulaVersion):null,
    reasons:Object.freeze(reasons)
  });
}

module.exports={PHASE28_METRIC_KINDS,PHASE28_DATA_STATUSES,normalizePhase28Metric};
```

- [ ] **Step 4: Run the contract tests**

Run: `node --test test/phase28-view-model.test.js`

Expected: 4 tests, 4 pass, 0 fail.

- [ ] **Step 5: Commit the contract**

```powershell
git add lib/ui/phase28-view-model.js test/phase28-view-model.test.js
git commit -m "feat: add Phase 28 evidence contract"
```

### Task 4: Overlay readiness report

**Files:**
- Create: `lib/ui/phase28-readiness.js`
- Create: `scripts/check-phase28-overlay-readiness.js`
- Create: `test/phase28-readiness.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `PHASE28_ROUTES`, `validatePhase28Registry`, `HUB_NAV`, `HUB_WORKSPACES`, `phase28UiConfig`
- Produces: `buildPhase28Readiness({routes,hubNav,hubWorkspaces,env,availableAdapters})`
- CLI command: `pnpm verify:phase28-foundation`

- [ ] **Step 1: Write failing readiness tests**

```js
'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const routes=require('../lib/ui/phase28-route-registry.js');
const hub=require('../lib/navigation/hub-routes.js');
const {buildPhase28Readiness}=require('../lib/ui/phase28-readiness.js');

test('readiness reports the foundation as safe but not cut over by default',()=>{
  const report=buildPhase28Readiness({routes:routes.PHASE28_ROUTES,hubNav:hub.HUB_NAV,hubWorkspaces:hub.HUB_WORKSPACES,env:{},availableAdapters:[]});
  assert.equal(report.foundation,'READY');
  assert.equal(report.cutover,'BLOCKED');
  assert.equal(report.flags.enabled,false);
  assert.ok(report.blockers.some(item=>item.code==='MISSING_PRODUCTION_ROUTE'&&item.page==='product-analysis'));
  assert.ok(report.blockers.some(item=>item.code==='MISSING_ADAPTER'&&item.page==='home'));
});

test('readiness refuses an invalid flag instead of activating a partial screen set',()=>{
  const report=buildPhase28Readiness({routes:routes.PHASE28_ROUTES,hubNav:hub.HUB_NAV,hubWorkspaces:hub.HUB_WORKSPACES,env:{HARIN_PHASE28_ENABLED:'true',HARIN_PHASE28_PAGES:'home,admin'},availableAdapters:['main']});
  assert.equal(report.cutover,'BLOCKED');
  assert.ok(report.blockers.some(item=>item.code==='INVALID_FLAG_PAGE'&&item.page==='admin'));
});
```

- [ ] **Step 2: Run the tests and verify the missing module failure**

Run: `node --test test/phase28-readiness.test.js`

Expected: FAIL with `Cannot find module '../lib/ui/phase28-readiness.js'`.

- [ ] **Step 3: Implement the readiness report**

```js
'use strict';

const {validatePhase28Registry}=require('./phase28-route-registry.js');
const {phase28UiConfig}=require('./feature-flags.js');

function normalizePath(value){ return String(value||'/').split('?')[0].replace(/\/+$/,'')||'/'; }

function buildPhase28Readiness({routes,hubNav,hubWorkspaces,env={},availableAdapters=[]}){
  const blockers=[];
  for(const issue of validatePhase28Registry(routes))blockers.push({...issue,scope:'registry'});
  const productionPaths=new Set([
    ...hubNav.map(item=>normalizePath(item.href)),
    ...Object.values(hubWorkspaces).flat().map(item=>normalizePath(item.href))
  ]);
  const adapters=new Set(availableAdapters);
  for(const route of routes){
    if(!productionPaths.has(normalizePath(route.href)))blockers.push({code:'MISSING_PRODUCTION_ROUTE',page:route.id,href:route.href});
    if(!adapters.has(route.adapterId))blockers.push({code:'MISSING_ADAPTER',page:route.id,adapterId:route.adapterId});
  }
  const flags=phase28UiConfig(env);
  for(const page of flags.invalidPages)blockers.push({code:'INVALID_FLAG_PAGE',page});
  const registryBlocked=blockers.some(item=>item.scope==='registry');
  return Object.freeze({
    foundation:registryBlocked?'BLOCKED':'READY',
    cutover:blockers.length||!flags.enabled?'BLOCKED':'READY',
    flags:Object.freeze({enabled:flags.enabled,pages:Object.freeze([...flags.pages]),valid:flags.valid}),
    blockers:Object.freeze(blockers)
  });
}

module.exports={buildPhase28Readiness};
```

- [ ] **Step 4: Add the CLI and package command**

Create `scripts/check-phase28-overlay-readiness.js`:

```js
'use strict';

const routes=require('../lib/ui/phase28-route-registry.js');
const hub=require('../lib/navigation/hub-routes.js');
const {buildPhase28Readiness}=require('../lib/ui/phase28-readiness.js');

const report=buildPhase28Readiness({routes:routes.PHASE28_ROUTES,hubNav:hub.HUB_NAV,hubWorkspaces:hub.HUB_WORKSPACES,env:process.env,availableAdapters:[]});
process.stdout.write(`${JSON.stringify(report,null,2)}\n`);
if(report.foundation!=='READY')process.exitCode=1;
```

Add this script to `package.json`:

```json
"verify:phase28-foundation": "node --test test/phase28-route-registry.test.js test/phase28-feature-flags.test.js test/phase28-view-model.test.js test/phase28-readiness.test.js && node scripts/check-phase28-overlay-readiness.js"
```

The command succeeds when the foundation is structurally valid. Its JSON may report `cutover: BLOCKED` until page adapters and `/product-analysis` exist.

- [ ] **Step 5: Run focused foundation verification**

Run: `pnpm verify:phase28-foundation`

Expected: all focused tests pass; JSON contains `"foundation": "READY"` and `"cutover": "BLOCKED"`.

- [ ] **Step 6: Run full regression and production build**

Run: `pnpm test`

Expected: all existing and new tests pass.

Run: `pnpm build`

Expected: exit code 0 with the existing production routes unchanged.

- [ ] **Step 7: Commit the readiness gate**

```powershell
git add lib/ui/phase28-readiness.js scripts/check-phase28-overlay-readiness.js test/phase28-readiness.test.js package.json
git commit -m "test: gate Phase 28 overlay readiness"
```

### Task 5: Foundation acceptance record

**Files:**
- Create: `docs/PHASE28_FOUNDATION_ACCEPTANCE.md`
- Test: `test/phase28-foundation-acceptance.test.js`

**Interfaces:**
- Consumes: the commands and report from Tasks 1-4
- Produces: a stable acceptance and rollback record for the next page migration plan

- [ ] **Step 1: Write the failing acceptance test**

```js
'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('Phase 28 foundation records disabled defaults, verification, and rollback',()=>{
  const text=fs.readFileSync(path.join(__dirname,'..','docs','PHASE28_FOUNDATION_ACCEPTANCE.md'),'utf8');
  assert.match(text,/HARIN_PHASE28_ENABLED=false/);
  assert.match(text,/HARIN_PHASE28_PAGES=/);
  assert.match(text,/pnpm verify:phase28-foundation/);
  assert.match(text,/pnpm test/);
  assert.match(text,/pnpm build/);
  assert.match(text,/cutover.*BLOCKED/i);
});
```

- [ ] **Step 2: Run the test and verify the missing file failure**

Run: `node --test test/phase28-foundation-acceptance.test.js`

Expected: FAIL with `ENOENT` for `docs/PHASE28_FOUNDATION_ACCEPTANCE.md`.

- [ ] **Step 3: Write the acceptance record**

```markdown
# Phase 28 Foundation Acceptance

## Default state

`HARIN_PHASE28_ENABLED=false`

`HARIN_PHASE28_PAGES=`

The existing V8 UI remains authoritative. No Phase 28 page is rendered.

## Verification

- `pnpm verify:phase28-foundation`
- `pnpm test`
- `pnpm build`

The foundation may be `READY` while cutover remains `BLOCKED`. Cutover becomes eligible only after a production route and adapter exist for every activated page.

## Rollback

Set `HARIN_PHASE28_ENABLED=false` and redeploy. This foundation adds no database migration and opens no external write permission.
```

- [ ] **Step 4: Run the acceptance and focused foundation tests**

Run: `node --test test/phase28-foundation-acceptance.test.js`

Expected: 1 test, 1 pass, 0 fail.

Run: `pnpm verify:phase28-foundation`

Expected: all focused tests pass and foundation status remains `READY`.

- [ ] **Step 5: Commit the acceptance record**

```powershell
git add docs/PHASE28_FOUNDATION_ACCEPTANCE.md test/phase28-foundation-acceptance.test.js
git commit -m "docs: record Phase 28 foundation acceptance"
```

## Final verification

- [ ] Run `pnpm verify:phase28-foundation` and confirm 0 test failures.
- [ ] Run `pnpm test` and confirm 0 test failures.
- [ ] Run `pnpm build` and confirm exit code 0.
- [ ] Run `git diff --check HEAD~5..HEAD` and confirm no whitespace errors.
- [ ] Run `git status --short` and confirm only pre-existing untracked paths remain.

This plan ends with a disabled, testable integration foundation. It does not render the Phase 28 UI or deploy production changes. The next implementation plan migrates the shared shell and the first `home` page behind the per-page flag.
