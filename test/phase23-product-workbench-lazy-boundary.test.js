'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const distDir=process.env.NEXT_DIST_DIR||'.next';

test('프로덕션 Phase 28 청크에는 사용하지 않는 상품 레거시 작업대가 포함되지 않는다',t=>{
  const chunksDir=path.join(root,distDir,'static','chunks');
  if(!fs.existsSync(chunksDir))return t.skip('프로덕션 빌드 뒤 확인합니다.');
  const chunks=fs.readdirSync(chunksDir)
    .filter(file=>file.endsWith('.js'))
    .map(file=>({file,source:fs.readFileSync(path.join(chunksDir,file),'utf8')}));
  for(const chunk of chunks){
    assert.doesNotMatch(
      chunk.source,
      /판매중 상품 원가|Cafe24 기준상품 선택|원가·수수료·택배비|쿠팡 상품 관리/,
      `${chunk.file}에 상품 운영 작업대가 다시 포함됐습니다.`
    );
  }
});
