'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const b2b=require('../lib/market-intelligence/b2b-readiness.js');
const projects=require('../lib/market-intelligence/projects.js');
const foundation=require('../lib/market-intelligence/foundation.js');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('21-9 keeps procurement dormant, cost-free and read-only before B2B starts',()=>{
  const center=b2b.buildB2BReadiness({project:{id:'project-1',master_product_id:'product-1',analysis_config:{evidence_ids:['e1']}},product:{id:'product-1',name:'작수차',selling_price:12000,is_active:true},env:{}});
  assert.equal(center.phase,'21-9');
  assert.equal(center.mode,'READ_ONLY_PREPARATION');
  assert.equal(center.provider.status,'NOT_STARTED');
  assert.equal(center.provider.externalCallsEnabled,false);
  assert.equal(center.provider.automaticSubmission,false);
  assert.equal(center.summary.costKrw,0);
  assert.equal(center.product.name,'작수차');
});

test('21-9 only advances to an official read probe after every provider gate',()=>{
  const env={PUBLIC_PROCUREMENT_B2B_ACTIVE:'true',PUBLIC_PROCUREMENT_ENABLED:'true',PUBLIC_PROCUREMENT_SERVICE_KEY:'private-service-key'};
  const center=b2b.buildB2BReadiness({project:{analysis_config:{evidence_ids:[]}},product:{id:'product-2',name:'레드비트차',selling_price:15000,is_active:true},env});
  assert.equal(center.provider.status,'READ_PROBE_REQUIRED');
  assert.equal(center.provider.credentialReady,true);
  assert.equal(center.provider.externalCallsEnabled,false);
  assert.doesNotMatch(JSON.stringify(center),/private-service-key/);
});

test('21-9 exposes a fifth product-isolated B2B workspace and real route',()=>{
  assert.ok(projects.WORKSPACES.has('b2b'));
  assert.equal(projects.projectHref('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','b2b'),'/market-intelligence/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/b2b');
  assert.equal(foundation.MARKET_WORKSPACES.at(-1).id,'b2b');
  const page='app/market-intelligence/[projectId]/b2b/page.js';
  assert.ok(fs.existsSync(path.join(root,page)));
  assert.match(read(page),/workspace:'b2b'/);
});

test('21-9 UI separates presets from real notices and keeps its AI collapsed',()=>{
  const component=read('app/market-intelligence/[projectId]/b2b/b2b-opportunity-workbench.js');
  const workspace=read('app/market-intelligence/[projectId]/workspace-page.js');
  const css=read('app/_analysis/harin-market-intelligence.css');
  assert.match(component,/실제 공고 목록이 아니라/);
  assert.match(component,/자동 입찰·제출/);
  assert.match(component,/사용 시작 전 · 비용 0원/);
  assert.match(component,/HarinProgressiveDetails/);
  assert.doesNotMatch(component,/as=\{Link\}/);
  assert.match(component,/as="a" href="\/data-collection\/optional-providers"/);
  assert.match(workspace,/B2BOpportunityWorkbench/);
  assert.match(css,/b2bOpportunityGrid/);
  assert.match(css,/@media\(max-width:760px\)/);
});
