'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('쿠팡 주문·정산 상세는 필요한 운영 화면에서만 지연 로딩한다',()=>{
  const dashboard=read('app/legacy-dashboard-client.js');
  const details=read('app/_operations/coupang-operation-details.js');
  assert.match(dashboard,/const CoupangOrdersView=dynamic\(\(\)=>import\('\.\/_operations\/coupang-operation-details\.js'\)\.then\(module=>module\.CoupangOrdersView\),\{loading:LazyWorkbenchFallback\}\)/);
  assert.match(dashboard,/const CoupangSettlementView=dynamic\(\(\)=>import\('\.\/_operations\/coupang-operation-details\.js'\)\.then\(module=>module\.CoupangSettlementView\),\{loading:LazyWorkbenchFallback\}\)/);
  assert.doesNotMatch(dashboard,/function CoupangOrdersView|function CoupangSettlementView|function SellerOrderCard|function CoupangCostImporter/);
  assert.match(details,/export function CoupangOrdersView/);
  assert.match(details,/export function CoupangSettlementView/);
});

test('쿠팡 전용 모듈은 주문 처리와 정산 기능을 그대로 보존한다',()=>{
  const details=read('app/_operations/coupang-operation-details.js');
  for(const marker of [
    '/api/coupang/orders/detail',
    '/api/coupang/orders/action',
    'ACKNOWLEDGE',
    'UPLOAD_INVOICE',
    '/api/coupang/cost-import',
    'COUPANG REVENUE API · ACTUAL',
    'ROCKET GROWTH · READ ONLY'
  ]) assert.match(details,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
});

test('프로덕션 공통 청크에는 쿠팡 상세 화면 문구가 포함되지 않는다',t=>{
  const chunksDir=path.join(root,'.next','static','chunks');
  if(!fs.existsSync(chunksDir))return t.skip('프로덕션 빌드 뒤 확인합니다.');
  const chunks=fs.readdirSync(chunksDir).filter(file=>file.endsWith('.js')).map(file=>({file,source:fs.readFileSync(path.join(chunksDir,file),'utf8')}));
  const dashboardChunks=chunks.filter(item=>item.source.includes('작업공간을 준비하고 있어요'));
  assert.ok(dashboardChunks.length>0,'공통 대시보드 청크를 찾지 못했습니다.');
  for(const chunk of dashboardChunks){
    assert.doesNotMatch(chunk.source,/판매자배송 관리|로켓그로스 비용 엑셀/,`${chunk.file}에 쿠팡 상세 코드가 다시 포함됐습니다.`);
  }
  assert.ok(chunks.some(item=>item.source.includes('판매자배송 관리')&&item.source.includes('로켓그로스 비용 엑셀')),'쿠팡 주문·정산 전용 청크를 찾지 못했습니다.');
});
