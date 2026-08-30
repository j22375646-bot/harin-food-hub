'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const distDir=process.env.NEXT_DIST_DIR||'.next';

test('키워드 기존 상세 도구는 키워드 화면에서만 지연 로딩한다',()=>{
  const dashboard=read('app/legacy-dashboard-client.js');
  const details=read('app/_analysis/harin-keyword-detail-workbench.js');
  assert.match(dashboard,/const HarinKeywordDetailWorkbench=dynamic\(\(\)=>import\('\.\/_analysis\/harin-keyword-detail-workbench\.js'\),\{loading:LazyWorkbenchFallback\}\)/);
  assert.doesNotMatch(dashboard,/function PlatformKeywordView|function CoupangAdImporter|function CoupangDemandView|function CoupangKeywordTable|function Cafe24AcquisitionView|function KeywordView|function KeywordTable/);
  assert.match(details,/export default function HarinKeywordDetailWorkbench/);
  for(const marker of [
    'NaverSearchTermCenter',
    '/api/coupang/ad-import',
    '/api/naver/keyword-stats',
    '/api/naver/keyword-actions',
    'COUPANG PA',
    '고객이 실제로 검색한 말'
  ]) assert.match(details,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
});

test('프로덕션 Phase 28 청크에는 사용하지 않는 키워드 레거시 도구가 포함되지 않는다',t=>{
  const chunksDir=path.join(root,distDir,'static','chunks');
  if(!fs.existsSync(chunksDir))return t.skip('프로덕션 빌드 뒤 확인합니다.');
  const chunks=fs.readdirSync(chunksDir).filter(file=>file.endsWith('.js')).map(file=>({file,source:fs.readFileSync(path.join(chunksDir,file),'utf8')}));
  for(const chunk of chunks){
    assert.doesNotMatch(chunk.source,/광고·키워드 파일 업데이트|등록 키워드 갱신|고객이 실제로 검색한 말/,`${chunk.file}에 키워드 상세 코드가 다시 포함됐습니다.`);
  }
});
