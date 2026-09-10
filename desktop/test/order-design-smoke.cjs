'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const os=require('node:os'),{_electron}=require('playwright');
const root=path.resolve(__dirname,'..');
async function main(){
 const packaged=Boolean(process.env.MOAON_ORDER_DESIGN_RUNTIME);
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'moaon-order-design-'));const app=await _electron.launch({executablePath:require('electron'),args:[path.join(__dirname,'isolated-bootstrap.cjs')],env:{...process.env,MOAON_TEST_RUNTIME_ROOT:process.env.MOAON_ORDER_DESIGN_RUNTIME||root,MOAON_TEST_PROFILE:profile,MOAON_TEST_HIDDEN:'0',MOAON_TEST_DISPLAY:'right'}});
 try{
  const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
  page.on('console',m=>{if(m.type()==='error')console.log('renderer:',m.text());});
  page.on('requestfailed',r=>console.log('request failed',r.failure()?.errorText));
  await page.evaluate(()=>document.fonts.load('400 15px "Moaon Pretendard"','모아온'));
  assert.equal(await page.evaluate(()=>[...document.fonts].some(f=>f.family==='Moaon Pretendard'&&f.status==='loaded')),true,'bundled font must load without relying on an installed font');
  assert.equal(await page.getByLabel('전체 조회 판매 채널').count(),1,'channel tools must exist');
  await app.evaluate(({session})=>{
   session.defaultSession.protocol.handle('https',()=>new Response(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII=','base64'),{headers:{'Content-Type':'image/png'}}));
   globalThis.toolReads=0;
   session.fromPartition('persist:moaon-harin-readonly').fetch=async url=>{
   if(url.endsWith('/api/moaon/businesses'))return Response.json({ok:true,businesses:[]});
    if(url.includes('/api/cafe24/orders/delivery-detail'))return Response.json({ok:true,receiver:{name:'TEST',address:'TEST',postCode:'12345',contact:'01012345678'}});
    globalThis.toolReads++;
    const base={platform:'CAFE24',fulfillment:'SELLER',stage:'PAID',quantity:1,externalOrderId:'TEST',shippingHistoryStatus:'READY'};
    const orders=[{...base,hubOrderId:'HR-C24-00000001',productName:'낮은 금액',amount:1000,items:[{name:'차',option:'30T 1상자',quantity:1,imageUrl:'https://shop-phinf.pstatic.net/product/tea.png'}],orderedAt:'2026-09-11T14:59:00+09:00',timingBadge:{type:'SAME_DAY'},shippingEstimate:{confidence:'READY',plannedShipDate:'2026-09-11'},giftRequired:true,gifts:[{giftName:'보리차',quantity:2}],listDeliveryBadge:{status:'RESERVED',source:'EPOST'}},
     {...base,hubOrderId:'HR-C24-00000002',productName:'미확인 금액',amount:null},
     {...base,hubOrderId:'HR-C24-00000003',productName:'높은 금액',amount:30000},
     {...base,hubOrderId:'NAVER-TEST',productName:'네이버 상품',platform:'NAVER',amount:20000}];
    const channel=new URL(url).searchParams.get('platform');
    const filtered=channel==='ALL'?orders:orders.filter(order=>order.platform===channel);
    return Response.json({ok:true,orders:filtered,total:filtered.length,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial:false});
   };
  });
  await page.evaluate(()=>runHubAction('disconnect'));
  await page.evaluate(()=>runHubAction('viewActive'));await page.evaluate(()=>{showRoute('orders');const note=document.createElement('p');note.textContent='주문 UI 검증 · 가상 주문 · 발급/출고 실행 없음';document.querySelector('.orders-page .page-heading').append(note);});
  assert.equal(await page.locator('.gift-badge').first().evaluate(e=>getComputedStyle(e).fontSize),'14px');assert.match(await page.locator('.gift-badge').first().innerText(),/보리차 2개/);assert.equal(await page.locator('.order-primary').first().innerText().then(t=>t.includes('HR-C24')),false);assert.match(await page.locator('.shipping-timing-badge').first().innerText(),/당일출고/);
  await page.setViewportSize({width:1600,height:1000});
  const centers=await page.evaluate(()=>{const head=[...document.querySelectorAll('.order-table-heading>span')].slice(1);return ['.order-secondary','.order-date','.order-amount','.order-state'].map((selector,i)=>{const a=head[i].getBoundingClientRect(),b=document.querySelector('.order-row '+selector).getBoundingClientRect();return Math.abs(a.x+a.width/2-b.x-b.width/2);});});assert.ok(centers.every(n=>n<2),'headings and values must share centered columns: '+centers);
  const visualRow=page.locator('.order-row').filter({hasText:'낮은 금액'});
  await visualRow.locator('img').waitFor({timeout:6000});
  await page.waitForFunction(()=>document.querySelector('.order-row img')?.naturalWidth>0);
  assert.equal(await visualRow.locator('.gift-badge').innerText(),'사은품 · 보리차 2개');
  assert.equal(await visualRow.locator('.delivery-badge').innerText(),'예약');
  assert.match(await visualRow.locator('.product-option').innerText(),/옵션: 30T 1상자 · 수량 1개/);assert.equal(await visualRow.locator('.product-thumbnail').evaluate(e=>e.getBoundingClientRect().width),64);await visualRow.click();
  assert.equal(await page.locator('.detail-header').evaluate(el=>getComputedStyle(el).position),'sticky');assert.ok(await page.locator('.detail-header button').evaluate(el=>el.getBoundingClientRect().height>=42));await page.waitForTimeout(500);await page.screenshot({path:path.join(os.tmpdir(),'moaon-order-design-detail.png')});
  assert.equal(await page.locator('.order-refresh-link').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(238, 240, 255)');assert.match(await page.locator('.detail-body').innerText(),/보리차/);
  assert.match(await page.locator('.detail-body').innerText(),/2개 · 조회 시점/);
  await visualRow.locator('img').evaluate(img=>img.dispatchEvent(new Event('error')));
  assert.equal(await visualRow.locator('.product-thumbnail').innerText(),'이미지 확인');
  const reads=await app.evaluate(()=>globalThis.toolReads);
  await page.getByLabel('전체 조회 판매 채널').selectOption('CAFE24');
  await page.waitForFunction(()=>displayMode==='live'&&selectedChannel==='CAFE24');
  assert.equal(await page.locator('.order-row').count(),3);
  const afterChannelReads=await app.evaluate(()=>globalThis.toolReads);
  assert.equal(afterChannelReads,reads+1,'channel must perform exactly one server-filtered page read');
  await page.locator('details.order-more-filters > summary').click();
  await page.getByLabel('현재 페이지 정렬').selectOption('AMOUNT_DESC');
  assert.equal(await page.locator('.order-more-filters').getAttribute('data-applied'),'true');
  assert.match(await page.locator('.order-row').first().innerText(),/높은 금액/);
  assert.match(await page.locator('.order-row').last().innerText(),/미확인 금액/);
  await page.locator('.order-row').first().click();
  await page.keyboard.press('Alt+ArrowDown');
  assert.match(await page.locator('#order-detail').innerText(),/낮은 금액/);
  await page.getByLabel('현재 페이지 정렬').selectOption('AMOUNT_ASC');
  assert.match(await page.locator('.order-row').first().innerText(),/낮은 금액/);
  assert.match(await page.locator('.order-row').last().innerText(),/미확인 금액/);
  assert.equal(await app.evaluate(()=>globalThis.toolReads),afterChannelReads,'sorting and keyboard navigation stay local');
  await page.getByLabel('전체 조회 판매 채널').selectOption('NAVER');
  await page.waitForFunction(()=>displayMode==='live'&&selectedChannel==='NAVER');
  assert.equal(await page.getByRole('heading',{name:'주문 상세',exact:true}).count(),0);
  await page.locator('#order-search').fill('없는 주문');
  assert.equal(await page.locator('.order-row').count(),0);
  await page.locator('details.order-more-filters > summary').click();
  await page.getByRole('button',{name:'검색·필터 초기화',exact:true}).click();
  await page.waitForFunction(()=>displayMode==='live'&&selectedChannel==='ALL');
  assert.equal(await page.locator('.order-row').count(),4);
  assert.equal(await page.getByLabel('현재 페이지 정렬').inputValue(),'DEFAULT');
  assert.equal(await app.evaluate(()=>globalThis.toolReads),reads+3,'only two channel changes and resetting channel perform reads; local tools do not');
  assert.equal(await page.locator('.order-tools input').first().evaluate(el=>getComputedStyle(el).fontSize),'14px');assert.ok(await page.locator('#order-tools-reset').evaluate(el=>el.getBoundingClientRect().height>=44));
  for(const theme of ['light','dark']){
   await page.evaluate(theme=>applyTheme(theme),theme);
   await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1040,720));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   assert.ok(await page.locator('#order-list').evaluate(el=>el.clientHeight)>90);
   await page.locator('.orders-workspace').evaluate(el=>el.style.width='560px');await page.waitForTimeout(350);
   const layout=await visualRow.evaluate(row=>{const x=sel=>row.querySelector(sel).getBoundingClientRect().left;return {primary:x('.order-primary'),channel:x('.order-secondary'),state:x('.order-state'),fit:row.scrollWidth<=row.clientWidth+1,gift:getComputedStyle(row.querySelector('.gift-badge')).backgroundColor,timing:getComputedStyle(row.querySelector('.shipping-timing-badge')).backgroundColor,date:row.querySelector('.order-date').textContent};});
   assert.ok(Math.abs(layout.primary-layout.channel)<2&&Math.abs(layout.primary-layout.state)<2,JSON.stringify(layout));assert.equal(layout.fit,true);assert.notEqual(layout.gift,layout.timing);assert.doesNotMatch(layout.date,/2026/);assert.match(layout.date,/\d{2}:\d{2}/);
   await page.screenshot({path:path.join(os.tmpdir(),`moaon-order-design-${theme}.png`)});
   await page.locator('.orders-workspace').evaluate(el=>el.style.removeProperty('width'));
  }
  await page.getByLabel('전체 조회 판매 채널').selectOption('NAVER');
  await page.getByLabel('전체 조회 판매 채널').selectOption('ALL');
  await page.evaluate(()=>{document.querySelector('.order-row').click();document.querySelector('.orders-workspace').style.width='560px';});
  const position=await page.evaluate(()=>{const scroller=document.querySelector('#main-content');scroller.scrollTop=200;const before=scroller.scrollTop;document.querySelectorAll('.order-row')[1].click();return {before,after:scroller.scrollTop,date:formatOrderTime('2026-09-11T14:59:32+09:00')};});assert.ok(position.before>0);assert.equal(position.after,position.before);await page.waitForTimeout(400);assert.equal(await page.locator('#main-content').evaluate(el=>el.scrollTop),position.before);assert.equal(await page.locator('#order-detail').evaluate(el=>getComputedStyle(el).position),'sticky');assert.match(position.date,/14:59/);assert.doesNotMatch(position.date,/32/);
  await page.evaluate(()=>runHubAction('disconnect'));
  assert.equal(await page.locator('.order-row').count(),0);
  assert.equal(await page.getByLabel('전체 조회 판매 채널').inputValue(),'ALL');
  const placement=await app.evaluate(({BrowserWindow,screen})=>{const w=BrowserWindow.getAllWindows()[0],d=screen.getDisplayMatching(w.getBounds()),p=screen.getPrimaryDisplay();return {right:d.id!==p.id&&d.workArea.x>=p.workArea.x+p.workArea.width,focused:w.isFocused()};});assert.deepEqual(placement,{right:true,focused:false});
  console.log(JSON.stringify({status:'PASS',packaged,scope:'channel, sorting, unknown amount, detail shortcut, reset, no extra reads, dark/light, disconnect'}));
 }finally{await app.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
