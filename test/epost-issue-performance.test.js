'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {mapLimit}=require('../lib/async/map-limit.js');

test('송장 발급 준비는 최대 4건씩 처리하고 응답 순서는 유지한다', async () => {
  let active=0;
  let peak=0;
  let release;
  const gate=new Promise(resolve=>{ release=resolve; });
  const items=[1,2,3,4,5,6];
  const work=mapLimit(items,4,async item=>{
    active += 1;
    peak=Math.max(peak,active);
    if(item<=4)await gate;
    active -= 1;
    return item*10;
  });

  await Promise.resolve();
  await Promise.resolve();
  assert.equal(peak,4);
  release();
  assert.deepEqual(await work,[10,20,30,40,50,60]);
  assert.equal(peak,4);
});

test('우체국 발급 API는 준비 작업만 4건씩 병렬 처리한다', () => {
  const source=fs.readFileSync(path.resolve(__dirname,'../app/api/epost/issue/route.js'),'utf8');
  assert.match(source,/mapLimit\(orderIds,4,async hubOrderId/);
});
