'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');

test('상품 운영 작업대는 상품 화면에서만 내려받는 전용 청크로 분리한다',t=>{
  const chunksDir=path.join(root,'.next','static','chunks');
  if(!fs.existsSync(chunksDir))return t.skip('프로덕션 빌드 뒤 확인합니다.');
  const chunks=fs.readdirSync(chunksDir)
    .filter(file=>file.endsWith('.js'))
    .map(file=>({file,source:fs.readFileSync(path.join(chunksDir,file),'utf8')}));
  const dashboardChunks=chunks.filter(item=>item.source.includes('작업공간을 준비하고 있어요'));
  assert.ok(dashboardChunks.length>0,'공통 대시보드 청크를 찾지 못했습니다.');
  for(const chunk of dashboardChunks){
    assert.doesNotMatch(
      chunk.source,
      /판매중 상품 원가|Cafe24 기준상품 선택|원가·수수료·택배비|쿠팡 상품 관리/,
      `${chunk.file}에 상품 운영 작업대가 다시 포함됐습니다.`
    );
  }
  assert.ok(
    chunks.some(item=>item.source.includes('판매중 상품 원가')&&item.source.includes('Cafe24 기준상품 선택')&&item.source.includes('원가·수수료·택배비')),
    '상품 운영 전용 청크를 찾지 못했습니다.'
  );
});
