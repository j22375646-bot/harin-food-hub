const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');

test('phase 13-4 splits current work, shipping operations and recent history into six workspaces',()=>{
  const center=fs.readFileSync(path.join(root,'app','unified-orders-center.js'),'utf8');
  for(const id of ['ACTIVE','EPOST','REGISTER','IN_TRANSIT','COMPLETED','RETRY']){
    assert.match(center,new RegExp(`id:'${id}'`));
  }
  assert.match(center,/지금 포장·출고할 판매자배송/);
  assert.match(center,/최근 30일 완료 건만 확인/);
  assert.match(center,/송장은 보존하고 채널 전송만 재실행/);
  assert.match(center,/통계·이력용, 작업목록과 분리/);
  assert.match(center,/자동처리 · 조회 전용/);
});

test('phase 13-4 preserves seller-delivery automation and isolates each contextual workbench',()=>{
  const center=fs.readFileSync(path.join(root,'app','unified-orders-center.js'),'utf8');
  assert.match(center,/ACTIVE_STAGES=new Set\(\['PAID','PREPARING','READY_TO_SHIP'\]\)/);
  assert.match(center,/order\.fulfillment!=='ROCKET_GROWTH'/);
  assert.match(center,/mode==='EPOST'/);
  assert.match(center,/mode==='IN_TRANSIT'/);
  assert.match(center,/\['REGISTER','RETRY'\]\.includes\(mode\)/);
  assert.match(center,/우체국 배송상태 새로고침/);
  assert.match(center,/우체국 발급으로 이동/);
  assert.match(center,/송장 자동발급 \+ 쇼핑몰 등록/);
});

test('phase 13-4 workspaces remain readable on desktop and mobile',()=>{
  const css=[
    fs.readFileSync(path.join(root,'app','globals.css'),'utf8'),
    fs.readFileSync(path.join(root,'app','_operations','harin-operations-v8.css'),'utf8')
  ].join('\n');
  assert.match(css,/\.orderWorkspaceNav\{[^}]*grid-template-columns:repeat\(6/);
  assert.match(css,/@media\(max-width:1180px\)\{\.orderWorkspaceNav\{grid-template-columns:repeat\(3/);
  assert.match(css,/@media\(max-width:820px\)[^\n]*\.orderWorkspaceNav\{grid-template-columns:1fr 1fr\}/);
  assert.match(css,/\.orderHistoryBoundary\{display:grid/);
  assert.match(css,/\.trackingWorkspaceAction/);
});

test('phase 14-4 adds a readable SLA rail, barcode finder and isolated order AI slot',()=>{
  const center=fs.readFileSync(path.join(root,'app','unified-orders-center.js'),'utf8');
  const css=fs.readFileSync(path.join(root,'app','_operations','harin-operations-v8.css'),'utf8');
  assert.match(center,/주문·배송 업무/);
  assert.match(center,/당일출고 마감/);
  assert.match(center,/바코드·송장 빠른 찾기/);
  assert.match(center,/ordersAiSlot/);
  assert.match(css,/\.orderFocusRail/);
  assert.match(css,/\.orderScanCommand/);
});
