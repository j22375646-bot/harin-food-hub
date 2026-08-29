'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('진단목록과 자동보고서는 실행 화면에서만 지연 로딩한다',()=>{
  const dashboard=read('app/legacy-dashboard-client.js');
  const reports=read('app/_execution/harin-reports-center.js');
  assert.match(dashboard,/const HarinReportsCenter=dynamic\(\(\)=>import\('\.\/_execution\/harin-reports-center\.js'\),\{loading:LazyWorkbenchFallback\}\)/);
  assert.match(dashboard,/<HarinReportsCenter reports=\{reports\} learningHistory=\{initialData\.reportLearningHistory\}\/>/);
  assert.doesNotMatch(dashboard,/function ReportsView|function VersionedReportList|function ReportGenerator/);
  assert.match(reports,/export default function HarinReportsCenter/);
  assert.match(reports,/보고서 이력·버전관리/);
  assert.match(reports,/보고서가 쌓일수록 비교 기준도 쌓여요/);
  assert.match(reports,/새 보고서 자동 생성/);
});

test('공통 대시보드 원본은 보고서 작업대 분리 후 크기 상한을 지킨다',()=>{
  const source=fs.readFileSync(path.join(root,'app','dashboard-client.js'));
  assert.ok(source.length<290000,`dashboard-client.js is ${source.length} bytes`);
});
