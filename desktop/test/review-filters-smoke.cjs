'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const {launchDesktop} = require('./launch.cjs');
async function main() {
  const app = await launchDesktop({root:path.resolve(__dirname,'..'),executablePath:require('electron'),packaged:process.argv.includes('--packaged'),override:-1});
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    assert.equal(await page.locator('#review-overview').isVisible(),false,'samples have no real review counts');
    await app.evaluate(({session}) => {
      globalThis.reviewFailure = false;
      globalThis.reviewFetches = 0;
      session.fromPartition('persist:moaon-harin-readonly').fetch = async () => {
        globalThis.reviewFetches++;
        if (globalThis.reviewFailure) return new Response('',{status:401});
        const base = {externalOrderId:'TEST',platform:'CAFE24',fulfillment:'SELLER',stage:'PAID',cancelled:false,cancellationRequested:false,shippingEligible:true,selectionEligible:true,shippingHistoryStatus:'READY',invoiceNumber:'',issuedInvoiceNumber:'',quantity:1,receiver:{name:'TEST',address:'TEST',postCode:'12345',contact:'01012345678'}};
        const orders = [
          {...base,hubOrderId:'HR-C24-00000001',productName:'후보 상품'},
          {...base,hubOrderId:'HR-C24-00000002',productName:'취소 상품',cancelled:true},
          {...base,hubOrderId:'HR-C24-00000003',productName:'누락 상품',shippingHistoryStatus:null},
          {...base,hubOrderId:'NAVER-TEST',productName:'네이버 상품',platform:'NAVER'},
        ];
        return new Response(JSON.stringify({ok:true,orders,total:4,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial:false}),{status:200});
      };
    });
    await page.evaluate(async()=>{await runHubAction('disconnect');await runHubAction('viewActive');});
    await page.locator('[data-action="hub-refresh"]:visible').first().waitFor();
    await page.getByRole('button',{name:'주문·배송',exact:true}).click();
    await page.locator('details.order-more-filters > summary').click();
    const filters = page.getByRole('group',{name:'현재 페이지 출고 사전 확인 필터',exact:true});
    assert.equal(await filters.count(),1,'stored review must have a filter group');
    const initialFetches = await app.evaluate(()=>globalThis.reviewFetches);
    await filters.getByRole('button',{name:'확인 필요 1건',exact:true}).click();
    assert.equal(await page.locator('.order-row').count(),1);
    assert.ok((await page.locator('.order-row').innerText()).includes('누락 상품'));
    assert.ok((await page.locator('.order-row').getAttribute('aria-label')).includes('확인 필요'));
    await page.locator('.order-row').click();
    await filters.getByRole('button',{name:'제외 1건',exact:true}).click();
    assert.equal(await page.getByRole('heading',{name:'주문 상세',exact:true}).count(),0,'hidden selection must clear');
    assert.ok((await page.locator('.order-row').innerText()).includes('취소 상품'));
    await filters.getByRole('button',{name:'전체 4건',exact:true}).click();
    await page.locator('#order-search').fill('네이버');
    assert.equal(await page.locator('.order-row').count(),1);
    assert.equal(await filters.getByRole('button',{name:'별도 처리 1건',exact:true}).count(),1);
    await filters.getByRole('button',{name:'확인 후보 0건',exact:true}).click();
    assert.equal(await page.locator('.order-row').count(),0);
    assert.equal(await app.evaluate(()=>globalThis.reviewFetches),initialFetches,'filters do not collect or request additional orders');
    await page.locator('#order-search').fill('');
    await filters.getByRole('button',{name:'전체 4건',exact:true}).click();
    for (const theme of ['light','dark']) {
      await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
      for (const size of [[1040,720],[1920,1080]]) {
        await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows().find(w=>!w.getParentWindow()).setSize(...size),size);
        await page.waitForFunction(()=>document.querySelector('#review-filters').getBoundingClientRect().width>0);
        const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,list:document.querySelector('#order-list').clientHeight}));
        assert.equal(layout.overflow,false);
        assert.ok(layout.list>100,JSON.stringify({theme,size,layout}));
      }
      await page.screenshot({path:path.join(require('node:os').tmpdir(),`moaon-review-filters-${theme}.png`)});
    }
    await app.evaluate(()=>{globalThis.reviewFailure=true;});
    await page.locator('[data-action="hub-refresh"]:visible').first().click();
    await page.waitForFunction(()=>document.querySelector('#order-list').children.length===0);
    assert.equal(await filters.isVisible(),false,'authentication failure clears review counts');
    console.log(JSON.stringify({status:'PASS',scope:'synthetic review filters, search intersection, selection clearing, auth failure; no writes'}));
  } finally {await app.close();}
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
