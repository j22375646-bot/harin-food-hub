const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('쿠팡 매출 상세는 공통 대시보드와 분리해 필요할 때만 불러온다',()=>{
  const dashboard=read('app/dashboard-client.js');
  const sales=read('app/_analysis/coupang-sales-center.js');

  assert.match(dashboard,/const CoupangSalesCenter=dynamic\(\(\)=>import\('\.\/_analysis\/coupang-sales-center\.js'\),\{loading:LazyWorkbenchFallback\}\)/);
  assert.doesNotMatch(dashboard,/function CoupangSalesCenter/);
  assert.doesNotMatch(dashboard,/function CoupangTrendChart/);
  assert.doesNotMatch(dashboard,/function Coupang(?:Summary|OperationsSummary)/);
  assert.match(sales,/export default function CoupangSalesCenter/);
  assert.match(sales,/function CoupangRealtimePanel/);
  assert.match(sales,/function CoupangProductPerformance/);
});

test('공통 대시보드 원본은 쿠팡 매출 상세 분리 후 크기 상한을 지킨다',()=>{
  const size=fs.statSync(path.join(root,'app','dashboard-client.js')).size;
  assert.ok(size<315000,`dashboard-client.js가 다시 커졌습니다: ${size} bytes`);
});
