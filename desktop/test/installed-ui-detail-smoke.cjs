'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {_electron}=require('playwright');
(async()=>{
  if(!process.argv.includes('--installed'))throw Error('Explicit installed flag required');
  const app=await _electron.launch({executablePath:path.join(process.env.LOCALAPPDATA,'Programs','Moaon Preview','MoaonPreview.exe')});
  try{
    const page=await app.firstWindow();
    await page.waitForFunction(()=>document.querySelector('#entry-screen')?.hidden,{},{timeout:30000});
    assert.equal(await app.evaluate(({app})=>app.getVersion()),'0.34.0');
    await page.getByRole('button',{name:'주문·배송',exact:true}).click();
    assert.deepEqual(await page.locator('#order-channel option').evaluateAll(items=>items.map(item=>item.value)),['ALL','CAFE24','NAVER','COUPANG']);
    await page.locator('.order-row').first().click();
    const delivery=page.getByRole('region',{name:'배송정보',exact:true});
    await delivery.waitFor();
    assert.equal(await delivery.locator('dd').count(),5);
    await page.waitForTimeout(550);
    const result=await page.evaluate(async()=>{
      const box=el=>el.getBoundingClientRect();
      const center=el=>box(el).x+box(el).width/2;
      const heads=document.querySelector('.order-table-heading').children;
      const row=document.querySelector('.order-row');
      const panel=document.querySelector('#order-detail');
      const layout=document.querySelector('.orders-layout');
      const deltas=[Math.abs(center(heads[1])-center(row.querySelector('.channel-badge'))),Math.abs(center(heads[3])-center(row.querySelector('.order-state')))];
      const original=panel.textContent;
      document.querySelector('[aria-label="주문 상세 닫기"]').click();
      const widths=[];const start=performance.now();
      while(performance.now()-start<550){await new Promise(requestAnimationFrame);widths.push(Math.round(box(document.querySelector('.orders-workspace')).width));}
      return {deltas,frames:new Set(widths).size,contentKept:panel.textContent===original,inert:panel.inert,offscreen:box(panel).left>=box(layout).right-1,scrollbar:getComputedStyle(panel).scrollbarWidth,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches};
    });
    assert.ok(result.deltas.every(delta=>delta<1));
    if(!result.reduced)assert.ok(result.frames>4);
    assert.equal(result.contentKept,true);assert.equal(result.inert,true);assert.equal(result.offscreen,true);assert.equal(result.scrollbar,'none');
    console.log(JSON.stringify({status:'PASS',...result,scope:'installed read-only UI; no shipment writes or credential entry'}));
  }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
