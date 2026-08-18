'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const projects=require('../lib/market-intelligence/projects.js');
const routes=require('../lib/navigation/hub-routes.js');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('17-1 builds product-isolated reusable project cards without a fixed pilot product',()=>{
  const home=projects.buildProjectHome({
    products:[{id:'11111111-1111-4111-8111-111111111111',name:'작수차',selling_price:12000,is_active:true},{id:'22222222-2222-4222-8222-222222222222',name:'레드비트차',selling_price:15000,is_active:true}],
    projects:[{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',master_product_id:'22222222-2222-4222-8222-222222222222',project_name:'레드비트차 분석',status:'DRAFT',active_version:2,last_opened_at:'2026-08-17T00:00:00Z'}]
  });
  assert.equal(home.products.length,2);
  assert.equal(home.products[0].project,null);
  assert.equal(home.products[1].project.project_name,'레드비트차 분석');
  assert.equal(home.projects[0].href,'/market-intelligence/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/data');
  assert.equal(home.summary.versions,2);
});

test('17-1 migration keeps project and versions server-only with RLS',()=>{
  const sql=read('supabase/migrations/20260816182240_add_market_intelligence_projects.sql');
  assert.match(sql,/create table if not exists public\.market_projects/);
  assert.match(sql,/create table if not exists public\.market_project_versions/);
  assert.match(sql,/master_product_id uuid not null references public\.master_products/);
  assert.match(sql,/alter table public\.market_projects enable row level security/);
  assert.match(sql,/revoke all on table public\.market_projects, public\.market_project_versions\s+from public, anon, authenticated/);
  assert.match(sql,/grant select, insert, update, delete[\s\S]+to service_role/);
});

test('17-1 exposes the new section and four actual project routes',()=>{
  assert.equal(routes.HUB_NAV.find(item=>item.id==='market')?.href,'/market-intelligence');
  assert.ok(routes.HUB_NAV_GROUPS.find(group=>group.id==='development').items.includes('market'));
  for(const workspace of ['data','market','competition','conversion']){
    const file=`app/market-intelligence/[projectId]/${workspace}/page.js`;
    assert.ok(fs.existsSync(path.join(root,file)),file);
    assert.match(read(file),/await params/);
  }
  assert.doesNotMatch(read('app/market-intelligence/project-home.js'),/작수차/);
});

test('17-1 project API is owner-authenticated and writes through the server service only',()=>{
  const route=read('app/api/market-intelligence/projects/route.js');
  assert.match(route,/apiSafety\.isAuthorized\(request,authModule\)/);
  assert.match(route,/createOrOpenProject/);
  assert.match(route,/authModule\.requestActor\(request\)/);
  assert.doesNotMatch(read('app/market-intelligence/project-home.js'),/SUPABASE_SERVICE_ROLE/);
});

test('17-1 uses the shared pastel shell, readable controls and collapsed page AI',()=>{
  const shell=read('app/_shell/market-intelligence-shell.js');
  const home=read('app/market-intelligence/project-home.js');
  const css=read('app/_analysis/harin-market-intelligence.css');
  assert.match(shell,/HarinTopbar/);
  assert.match(shell,/HarinSidebar/);
  assert.match(shell,/HarinMobileNavigation/);
  assert.match(home,/HarinProgressiveDetails/);
  assert.match(home,/판매 중 기준상품/);
  assert.match(home,/사용 시작 전 · 비용 0원/);
  assert.match(css,/@media\(max-width:700px\)/);
  assert.match(css,/\.marketProductPicker>\*\{min-width:0\}/);
  assert.match(css,/\.marketProductPicker select\{width:100%;min-width:0;max-width:100%/);
  assert.match(css,/prefers-reduced-motion/);
});
