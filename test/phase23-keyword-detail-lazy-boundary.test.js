'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('키워드 기존 상세 도구는 키워드 화면에서만 지연 로딩한다',()=>{
  const dashboard=read('app/dashboard-client.js');
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

test('프로덕션 공통 청크에는 키워드 기존 상세 도구가 포함되지 않는다',t=>{
  const chunksDir=path.join(root,'.next','static','chunks');
  if(!fs.existsSync(chunksDir))return t.skip('프로덕션 빌드 뒤 확인합니다.');
  const chunks=fs.readdirSync(chunksDir).filter(file=>file.endsWith('.js')).map(file=>({file,source:fs.readFileSync(path.join(chunksDir,file),'utf8')}));
  const dashboardChunks=chunks.filter(item=>item.source.includes('작업공간을 준비하고 있어요'));
  assert.ok(dashboardChunks.length>0,'공통 대시보드 청크를 찾지 못했습니다.');
  for(const chunk of dashboardChunks){
    assert.doesNotMatch(chunk.source,/광고·키워드 파일 업데이트|등록 키워드 갱신|고객이 실제로 검색한 말/,`${chunk.file}에 키워드 상세 코드가 다시 포함됐습니다.`);
  }
  assert.ok(chunks.some(item=>item.source.includes('광고·키워드 파일 업데이트')&&item.source.includes('등록 키워드 갱신')&&item.source.includes('고객이 실제로 검색한 말')),'키워드 상세 전용 청크를 찾지 못했습니다.');
});
