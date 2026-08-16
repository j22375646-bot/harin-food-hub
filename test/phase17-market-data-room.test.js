'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const dataRoom=require('../lib/market-intelligence/data-room.js');
const foundation=require('../lib/market-intelligence/foundation.js');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('17-2 accepts only bounded project source files and validates upload ownership',()=>{
  const valid=dataRoom.validateSourceMetadata({file_name:'상품 근거.pdf',mime_type:'application/pdf',size_bytes:1024});
  assert.equal(valid.file_name,'상품 근거.pdf');
  assert.equal(dataRoom.MAX_SOURCE_BYTES,20*1024*1024);
  assert.throws(()=>dataRoom.validateSourceMetadata({file_name:'bad.exe',mime_type:'application/octet-stream',size_bytes:10}),/PDF/);
  assert.throws(()=>dataRoom.validateSourceMetadata({file_name:'large.pdf',mime_type:'application/pdf',size_bytes:dataRoom.MAX_SOURCE_BYTES+1}),/20MB/);
  assert.equal(dataRoom.validateCompletion({storage_path:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/source.pdf',sha256:'a'.repeat(64)},'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb').sha256,'a'.repeat(64));
  assert.throws(()=>dataRoom.validateCompletion({storage_path:'wrong/path',sha256:'a'.repeat(64)},'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),/프로젝트/);
});

test('17-2 keeps OCR estimates blocked until confidence and owner confirmation pass',()=>{
  assert.equal(foundation.evidenceDecision({type:'OCR_ESTIMATE',source_url:'source:x',confidence:.94,owner_confirmed:true}).status,'OWNER_CONFIRMATION_REQUIRED');
  assert.equal(foundation.evidenceDecision({type:'OCR_ESTIMATE',source_url:'source:x',confidence:.99,owner_confirmed:false}).status,'OWNER_CONFIRMATION_REQUIRED');
  assert.equal(foundation.evidenceDecision({type:'OCR_ESTIMATE',source_url:'source:x',confidence:.95,owner_confirmed:true}).status,'VERIFIED');
  assert.equal(dataRoom.validateOcrReview({ocr_text:'확인한 문장',ocr_confidence:.95,owner_confirmed:true}).owner_confirmed,true);
});

test('17-2 migration isolates sources, jobs and Evidence behind service role RLS',()=>{
  const sql=read('supabase/migrations/20260816185206_add_market_data_room_evidence.sql');
  for(const table of ['market_sources','market_ingestion_jobs','market_evidence']){
    assert.match(sql,new RegExp(`create table if not exists public\\.${table}`));
    assert.match(sql,new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(sql,/project_id uuid not null references public\.market_projects\(id\) on delete cascade/);
  assert.match(sql,/unique \(project_id, sha256\)/);
  assert.match(sql,/revoke all on table public\.market_sources, public\.market_ingestion_jobs, public\.market_evidence\s+from public, anon, authenticated/);
  assert.match(sql,/grant select, insert, update, delete[\s\S]+to service_role/);
  assert.match(sql,/create or replace function public\.record_market_project_version/);
  assert.match(sql,/grant execute on function public\.record_market_project_version[\s\S]+to service_role/);
});

test('17-2 APIs require Hub authorization and never expose the service key to the client',()=>{
  const sources=read('app/api/market-intelligence/projects/[projectId]/sources/route.js');
  const source=read('app/api/market-intelligence/projects/[projectId]/sources/[sourceId]/route.js');
  const evidence=read('app/api/market-intelligence/projects/[projectId]/evidence/route.js');
  for(const route of [sources,source,evidence])assert.match(route,/apiSafety\.isAuthorized\(request,authModule\)/);
  const client=read('app/market-intelligence/[projectId]/data/data-room-client.js');
  assert.doesNotMatch(client,/SUPABASE_SERVICE_ROLE|OPENAI_API_KEY/);
  assert.match(client,/createSignedUploadUrl|signed_url/);
  assert.match(source,/createDownloadUrl/);
});

test('17-2 renders the real data room with readable mobile layout and separate locked page AI',()=>{
  const workspace=read('app/market-intelligence/[projectId]/workspace-page.js');
  const client=read('app/market-intelligence/[projectId]/data/data-room-client.js');
  const css=read('app/_analysis/harin-market-intelligence.css');
  assert.match(workspace,/MarketDataRoom/);
  assert.match(client,/상품 자료 올리기/);
  assert.match(client,/판독 내용 확인/);
  assert.match(client,/근거로 연결/);
  assert.match(client,/외부 AI 전송 없음/);
  assert.match(workspace,/HarinProgressiveDetails/);
  assert.match(workspace,/사용 시작 전 · 비용 0원/);
  assert.match(css,/\.marketDataGrid/);
  assert.match(css,/@media\(max-width:700px\)/);
});
