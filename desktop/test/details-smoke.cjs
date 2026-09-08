'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { launchDesktop } = require('./launch.cjs');
const root = path.resolve(__dirname, '..');
const packaged = process.argv.includes('--packaged');
const override = process.argv.indexOf('--executable');
const executablePath = override >= 0 ? process.argv[override + 1] : packaged ? path.join(root,'dist/win-unpacked/MoaonPreview.exe') : require('electron');
async function main() {
  const app = await launchDesktop({root,executablePath,packaged,override});
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await app.evaluate(({session}) => {
      globalThis.detailFixtureMissing = false;
      const ses = session.fromPartition('moaon-harin-readonly', {cache:false});
      ses.fetch = async () => new Response(JSON.stringify({ok:true,offset:0,total:1,nextOffset:null,snapshot:'a'.repeat(64),partial:false,orders:[{
        hubOrderId:'TEST-HUB',productName:'시험 상품',platform:'CAFE24',stage:'PAID',amount:null,quantity:2,orderedAt:null,
        ...(globalThis.detailFixtureMissing ? {} : {externalOrderId:'TEST-CHANNEL',items:[{name:'<b>티백</b>',option:'30개입',quantity:2,imageUrl:'PRIVATE'}],invoice:{status:'ISSUED',number:'1234567890123'},listDeliveryBadge:{status:'IN_TRANSIT',source:'CHANNEL'},cancellationRequested:true,cancelled:false}),
        receiver:{name:'PRIVATE',contact:'PRIVATE'},
      }]}),{status:200,headers:{'Content-Type':'application/json'}});
    });
    const opened = app.waitForEvent('window');
    await page.locator('[data-action="hub-connect"]:visible').first().click();
    await opened;
    await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows().find(w=>w.getParentWindow()).webContents.emit('will-redirect',{preventDefault(){}},'https://harin-cafe24-sync.vercel.app/'));
    await page.getByRole('button',{name:'주문·배송',exact:true}).click();
    await page.locator('.order-row').filter({hasText:'TEST-HUB'}).waitFor();
    await page.locator('.order-row').first().click();
    const detail = page.locator('#order-detail');
    assert.ok((await detail.innerText()).includes('TEST-CHANNEL'),'platform order ID shown separately');
    assert.ok((await detail.innerText()).includes('30개입'));
    assert.ok((await detail.innerText()).includes('1234567890123'));
    assert.ok((await detail.innerText()).includes('발급 완료 · 플랫폼 등록 필요'));
    assert.ok((await detail.innerText()).includes('쇼핑몰 상태 기준'));
    assert.ok((await detail.innerText()).includes('취소 요청 있음'));
    assert.ok((await detail.innerText()).includes('<b>티백</b>'));
    assert.equal(await detail.locator('b').count(),0,'product text never parsed as HTML');
    assert.equal((await detail.innerText()).includes('PRIVATE'),false);
    await app.evaluate(()=>{globalThis.detailFixtureMissing=true;});
    await page.locator('[data-action="hub-refresh"]:visible').click();
    await page.locator('.order-row').filter({hasText:'TEST-HUB'}).waitFor();
    await page.locator('.order-row').first().click();
    const missing = await detail.innerText();
    assert.ok(missing.includes('송장 정보 확인 필요'));
    assert.ok(missing.includes('취소 여부 확인 필요'));
    assert.ok(missing.includes('세부 상품 정보 확인 필요'));
    assert.equal(missing.includes('1234567890123'),false,'old invoice cleared on refreshed detail');
    console.log(JSON.stringify({status:'PASS',runtime:override>=0?'installed executable':packaged?'packaged':'source',scope:'synthetic details; no credentials or writes'}));
  } finally { await app.close(); }
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
