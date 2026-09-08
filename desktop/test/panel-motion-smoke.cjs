'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const {launchDesktop} = require('./launch.cjs');

async function main() {
  if (!process.argv.includes('--isolated')) throw Error('Panel motion smoke requires an isolated profile');
  const root = path.resolve(__dirname, '..');
  const app = await launchDesktop({root, executablePath:require('electron'), packaged:process.argv.includes('--packaged'), override:-1});
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await app.evaluate(({session}) => {
      session.fromPartition('persist:moaon-harin-readonly').fetch = async url => {
        if (url.endsWith('/api/moaon/businesses')) return Response.json({ok:true,businesses:[]});
        const base={platform:'CAFE24',fulfillment:'SELLER',stage:'PAID',quantity:1,externalOrderId:'TEST',shippingHistoryStatus:'READY'};
        const orders=Array.from({length:12},(_,index)=>({...base,hubOrderId:`HR-C24-${String(index).padStart(8,'0')}`,productName:`정렬 시험 상품 ${index}`,amount:1000+index}));
        return Response.json({ok:true,orders,total:12,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial:false});
      };
    });
    await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].setSize(1440, 900));
    await page.evaluate(async()=>{await runHubAction('disconnect');await runHubAction('viewActive');});
    await page.getByRole('button',{name:'주문·배송',exact:true}).click();
    await page.locator('.order-row').first().click();
    await page.waitForFunction(() => !document.querySelector('.orders-layout').classList.contains('is-detail-closed'));
    await page.waitForTimeout(350);

    const scrollbars = await page.evaluate(() => {
      const detail = document.querySelector('#order-detail');
      detail.style.maxHeight = '220px';
      const result = {
        visible: [...document.querySelectorAll('*')].filter(el => /auto|scroll/.test(getComputedStyle(el).overflowY)).filter(el => getComputedStyle(el).scrollbarWidth !== 'none').map(el => el.className),
        canScroll: detail.scrollHeight > detail.clientHeight,
        moved: (() => { detail.scrollTop = 60; return detail.scrollTop > 0; })(),
      };
      detail.style.maxHeight = '';
      detail.scrollTop = 0;
      return result;
    });
    assert.deepEqual(scrollbars.visible, [], 'All app scroll containers must hide scrollbar chrome');
    assert.equal(scrollbars.canScroll, true, 'Panel content must remain reachable');
    assert.equal(scrollbars.moved, true, 'Hiding bars must not disable scrolling');

    const open = await page.evaluate(() => {
      const layout = document.querySelector('.orders-layout');
      const workspace = document.querySelector('.orders-workspace');
      const detail = document.querySelector('#order-detail');
      const style = getComputedStyle(layout);
      const detailStyle = getComputedStyle(detail);
      const box = element => element.getBoundingClientRect();
      const header = [...document.querySelector('.order-table-heading').children].map(box);
      const row = [...document.querySelector('.order-row').children].map(box);
      const headerSelect = box(document.querySelector('#order-select-all'));
      const rowSelect = box(document.querySelector('.order-select'));
      return {
        layoutWidth: box(layout).width,
        workspaceWidth: box(workspace).width,
        detailWidth: box(detail).width,
        gap: parseFloat(style.columnGap),
        layoutTransitions: style.transitionProperty,
        detailTransitions: detailStyle.transitionProperty,
        overflow: document.documentElement.scrollWidth > innerWidth,
        deltas: [
          Math.abs((headerSelect.x + headerSelect.width / 2) - (rowSelect.x + rowSelect.width / 2)),
          Math.abs(header[0].x - row[0].x),
          Math.abs(header[1].x - row[2].x),
          Math.abs(header[2].right - row[3].right),
          Math.abs(header[3].x - row[4].x),
        ],
      };
    });
    assert.ok(Math.abs(open.detailWidth - 330) <= 1, JSON.stringify(open));
    assert.equal(open.gap, 24);
    assert.match(open.layoutTransitions, /grid-template-columns/);
    assert.match(open.layoutTransitions, /gap/);
    assert.match(open.detailTransitions, /transform/);
    assert.match(open.detailTransitions, /opacity/);
    assert.equal(open.overflow, false);
    assert.ok(open.deltas.every(delta => delta <= 1), `header and row columns must align: ${JSON.stringify(open.deltas)}`);

    await page.getByRole('button',{name:'주문 상세 닫기',exact:true}).click();
    assert.equal(await page.locator('#order-detail').getAttribute('aria-hidden'),'true');
    assert.equal(await page.locator('#order-detail').evaluate(element => element.inert),true);
    await page.waitForTimeout(450);
    const closed = await page.evaluate(() => {
      const box = selector => document.querySelector(selector).getBoundingClientRect();
      const detail = document.querySelector('#order-detail');
      return {
        layoutWidth: box('.orders-layout').width,
        workspaceWidth: box('.orders-workspace').width,
        detailWidth: box('#order-detail').width,
        gap: parseFloat(getComputedStyle(document.querySelector('.orders-layout')).columnGap),
        opacity: parseFloat(getComputedStyle(detail).opacity),
        transform: getComputedStyle(detail).transform,
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    assert.equal(closed.gap, 0);
    assert.ok(closed.detailWidth <= 1, JSON.stringify(closed));
    assert.ok(closed.workspaceWidth >= open.workspaceWidth + open.detailWidth + open.gap - 2, JSON.stringify({open,closed}));
    assert.equal(closed.opacity, 0);
    assert.notEqual(closed.transform, 'none');
    assert.equal(closed.overflow, false);

    await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].setSize(1040, 720));
    await page.locator('.order-row').first().click();
    await page.waitForTimeout(350);
    const compactOpen = await page.evaluate(() => ({
      detailWidth: document.querySelector('#order-detail').getBoundingClientRect().width,
      gap: parseFloat(getComputedStyle(document.querySelector('.orders-layout')).columnGap),
      overflow: document.documentElement.scrollWidth > innerWidth,
    }));
    assert.ok(Math.abs(compactOpen.detailWidth - 290) <= 1, JSON.stringify(compactOpen));
    assert.equal(compactOpen.gap, 16);
    assert.equal(compactOpen.overflow, false);
    await page.getByRole('button',{name:'주문 상세 닫기',exact:true}).click();
    await page.waitForTimeout(350);
    assert.ok(await page.locator('#order-detail').evaluate(element => element.getBoundingClientRect().width <= 1));

    await page.emulateMedia({reducedMotion:'reduce'});
    const reduced = await page.evaluate(() => ({
      layout: parseFloat(getComputedStyle(document.querySelector('.orders-layout')).transitionDuration),
      detail: parseFloat(getComputedStyle(document.querySelector('#order-detail')).transitionDuration),
    }));
    assert.ok(reduced.layout < 0.01 && reduced.detail < 0.01, JSON.stringify(reduced));
    console.log(JSON.stringify({status:'PASS', scope:'isolated Electron CSS motion, inspector collapse, table alignment; synthetic sample only'}));
  } finally {
    await app.close();
  }
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });
