const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {buildExecutionValidation}=require('../lib/customers/retention-validation.js');

const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('14-7 keeps diagnosis approval validation and experiments on separate real routes',()=>{
  const routes=read('lib/navigation/hub-routes.js');
  const dashboard=read('app/dashboard-client.js');
  assert.match(routes,/href:'\/diagnoses'/);
  assert.match(routes,/href:'\/approvals'/);
  assert.match(routes,/href:'\/execution-validation'/);
  assert.match(routes,/href:'\/ab-tests'/);
  for(const view of ['reports','changes','validation','experiments']){
    assert.match(dashboard,new RegExp(`HarinExecutionWorkbench view="${view}"`));
  }
});

test('14-7 and 22-1 keep owner safety preview audit and explicit write lock',()=>{
  const workbench=read('app/_execution/harin-execution-workbench.js');
  const changes=read('app/_execution/harin-financial-change-center.js');
  assert.match(workbench,/OWNER SAFETY PREVIEW/);
  assert.match(workbench,/안전 미리보기/);
  assert.match(workbench,/변경 기록/);
  assert.match(workbench,/실제 플랫폼 변경은 사장님 확인 팝업 뒤/);
  assert.match(changes,/별도 승인 단계 없이 사장님 확인 한 번으로 적용/);
  assert.match(changes,/서버 쓰기 잠금/);
});

test('14-7 only offers rollback when the server change can actually be reversed',()=>{
  const execution=buildExecutionValidation({
    financialChanges:[
      {id:'cost',change_type:'PRODUCT_COST',status:'VERIFIED',rollback_value:{exists:false},impact_preview:{changes:[]}},
      {id:'shipping-new',change_type:'SHIPPING_RULE',status:'VERIFIED',rollback_value:{exists:false},impact_preview:{changes:[]}},
      {id:'shipping-existing',change_type:'SHIPPING_RULE',status:'VERIFIED',rollback_value:{exists:true},impact_preview:{changes:[]}}
    ]
  });
  assert.equal(execution.changes.find(item=>item.id==='cost').reversible,true);
  assert.equal(execution.changes.find(item=>item.id==='shipping-new').reversible,false);
  assert.equal(execution.changes.find(item=>item.id==='shipping-existing').reversible,true);
  const changes=read('app/_execution/harin-financial-change-center.js');
  assert.match(changes,/rollbackSupported\?/);
  assert.match(changes,/되돌리기 지원 안 함/);
});

test('14-7 connects diagnosis through 7 and 14 day validation to A B learning',()=>{
  const workbench=read('app/_execution/harin-execution-workbench.js');
  assert.match(workbench,/진단/);
  assert.match(workbench,/변경 기록/);
  assert.match(workbench,/7·14일 검증/);
  assert.match(workbench,/A\/B 학습/);
  assert.match(workbench,/day7/);
  assert.match(workbench,/day14/);
  assert.match(workbench,/variants/);
});

test('14-7 keeps one isolated zero-cost AI panel per execution page',()=>{
  const dashboard=read('app/dashboard-client.js');
  const panel=read('app/harin-ai-page-panel.js');
  for(const page of ['reports','changes','validation','experiments']){
    assert.match(dashboard,new RegExp(`aiPagePanels\\?\\.${page}`));
  }
  assert.match(read('app/_execution/harin-execution-workbench.js'),/id="page-ai-analysis"/);
  assert.match(panel,/사용 시작 전 · 비용 0원/);
});

test('14-7 imports the pastel responsive execution workbench stylesheet',()=>{
  const css=read('app/_execution/harin-execution-v8.css');
  assert.match(css,/\.executionV8/);
  assert.match(css,/var\(--v8-lavender-soft\)/);
  assert.match(css,/var\(--v8-pink-soft\)/);
  assert.match(css,/var\(--v8-blue-soft\)/);
  assert.match(css,/var\(--v8-mint-soft\)/);
  assert.match(css,/@media\(max-width:700px\)/);
  assert.match(read('app/_execution/harin-execution-workbench.js'),/harin-execution-v8\.css/);
  assert.doesNotMatch(read('app/layout.js'),/harin-execution-v8\.css/);
});
