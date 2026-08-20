'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('실험실은 전용 실행 화면에서만 지연 로딩한다',()=>{
  const dashboard=read('app/dashboard-client.js');
  const experimentLab=read('app/_execution/harin-experiment-lab.js');
  assert.match(dashboard,/const HarinExperimentLab=dynamic\(\(\)=>import\('\.\/_execution\/harin-experiment-lab\.js'\),\{loading:LazyWorkbenchFallback\}\)/);
  assert.match(dashboard,/view==='experiments'.*<HarinExperimentLab \/>/);
  assert.doesNotMatch(dashboard,/function ExperimentLab|GROWTH EXPERIMENT LAB|function ExperimentCreateForm|function BenchmarkCreateForm/);
  assert.match(experimentLab,/export default function HarinExperimentLab/);
  assert.match(experimentLab,/GROWTH EXPERIMENT LAB/);
});

test('실험실 분리는 상품 격리와 플랫폼 평가 기능을 그대로 보존한다',()=>{
  const experimentLab=read('app/_execution/harin-experiment-lab.js');
  for(const marker of [
    '/api/experiments',
    'master_product_id',
    'market_project_id',
    'NAVER_ENTITY',
    'CAFE24_PRODUCT',
    'COUPANG_PRODUCT',
    'UPDATE_METRICS',
    'EVALUATE',
    '다른 상품의 결과는 섞지 않습니다'
  ]) assert.match(experimentLab,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
});

test('공통 대시보드 원본은 실험실 분리 후 크기 상한을 지킨다',()=>{
  const source=fs.readFileSync(path.join(root,'app','dashboard-client.js'));
  assert.ok(source.length<235000,`dashboard-client.js is ${source.length} bytes`);
});
