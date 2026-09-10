'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const fields = ['name','lot','manufactured','expires','storage','unit','quantity','note'];
  let rows = [], editing = null, busy = false, generation = 0, ready = false, mode = 'edit', products = [], productsReady = false, chosenProduct = null;
  const node = (tag, text, cls) => { const el = document.createElement(tag); el.textContent = text; if (cls) el.className = cls; return el; };
  let rocketRows=[],rocketReady=false,rocketMode=false,rocketMessage='',rocketBusy=false,lastQueue=0;
  const today = () => new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Seoul'}).format(new Date());
  const number = value => value.toLocaleString('ko-KR', {maximumFractionDigits:3});
  function state(row) {
    if (!row.expires) return {key:'unknown', label:'기한 미입력'};
    const days = Math.round((Date.parse(row.expires)-Date.parse(today()))/86400000);
    return days < 0 ? {key:'expired', label:Math.abs(days)+'일 경과'} : days <= 30 ? {key:'soon', label:days === 0 ? '오늘까지' : days+'일 남음'} : {key:'normal', label:days+'일 남음'};
  }
  const matches = (row, filter) => filter === 'all' || (filter === 'empty' ? row.quantity === 0 : state(row).key === filter);
  function render() {
    renderRocket();
    const query = $('stock-search').value.trim().toLowerCase(), filter = $('stock-filter').value;
    const searched = rows.filter(r => (r.name+' '+r.lot+' '+r.storage).toLowerCase().includes(query));
    const visible = searched.filter(r => matches(r, filter));
    const sort = $('stock-sort').value;
    visible.sort((a,b) => sort === 'name' ? a.name.localeCompare(b.name,'ko') : sort === 'updated' ? (b.updatedAt||'').localeCompare(a.updatedAt||'') : (a.expires||'9999').localeCompare(b.expires||'9999') || a.name.localeCompare(b.name,'ko'));
    $('stock-summary').replaceChildren();
    for (const [key,label,caption] of [['all','전체 재고','제조번호 기준'],['soon','기한 임박','오늘부터 30일 이내'],['expired','기한 경과','출고 전 확인'],['empty','재고 없음','보유 수량 0']]) {
      const button=node('button','', 'stock-summary-item '+key);button.type='button';button.disabled=!ready;button.setAttribute('aria-pressed',String(filter===key));
      button.append(node('span',label),node('strong',ready?String(searched.filter(r=>matches(r,key)).length):'—'),node('small',caption));
      button.onclick=()=>{$('stock-filter').value=key;render();};$('stock-summary').append(button);
    }
    $('stock-count').textContent = ready ? visible.length+'건 / 전체 '+rows.length+'건' : busy ? '조회 중' : '확인 필요';
    const totals=new Map();for(const row of visible)totals.set(row.unit,(totals.get(row.unit)||0)+row.quantity);
    $('stock-unit-totals').textContent=ready?[...totals].map(([unit,value])=>number(value)+' '+unit).join(' · '):'';
    $('stock-unit-totals').title='현재 목록의 단위별 수량';
    $('stock-list').replaceChildren();
    if(ready) for(const row of visible) {
      const item=node('button','', 'stock-row');item.type='button';item.disabled=busy;
      const product=node('div','');product.append(node('strong',row.name),node('small',row.lot?'제조번호 '+row.lot:'제조번호 미입력'));if(row.productNo)product.append(node('small','카페24 연결','stock-linked-badge'));if(row.specialNotes)product.append(node('small','특이사항 · '+row.specialNotes,'stock-special-preview'));
      const amount=node('div','', 'stock-amount');amount.append(node('strong',number(row.quantity)+' '+row.unit));if(row.quantity===0)amount.append(node('small','재고 없음'));
      const dates=node('div','', 'stock-dates');dates.append(node('small','제조 '+(row.manufactured||'미입력')),node('strong',row.expires||'유통기한 미입력'));
      const info=state(row);item.append(product,amount,dates,node('span',row.storage||'미입력','stock-storage'),node('span',info.label,'stock-badge '+info.key));item.onclick=()=>open(row);$('stock-list').append(item);
    }
    $('stock-empty').hidden=ready&&visible.length>0;
    $('stock-empty').replaceChildren(node('strong',busy?'재고를 불러오고 있습니다':!ready?'재고 연결을 확인해 주세요':rows.length?'조건에 맞는 재고가 없습니다':'첫 재고를 등록해 보세요'),node('p',busy?'잠시만 기다려 주세요.':!ready?'새로 조회를 누르거나 앱 설정에서 연결을 확인하세요.':rows.length?'검색어나 기한 필터를 변경해 보세요.':'상품명과 수량부터 입력하고, 제조번호와 기한을 함께 관리하세요.'));
    if(ready&&visible.length===0){const button=node('button',rows.length?'검색·필터 초기화':'＋ 재고 등록');button.type='button';button.onclick=rows.length?reset:()=>open();$('stock-empty').append(button);}
    $('stock-new').disabled=busy||!ready;$('stock-refresh').disabled=busy;$('stock-status').dataset.loading=String(busy);$('stock-list').setAttribute('aria-busy',String(busy));
  }
  function reset() {$('stock-search').value='';$('stock-filter').value='all';$('stock-sort').value='expiry';render();}
  function setMode(value) {
    mode=value;const adjustment=value!=='edit';$('stock-unit').disabled=adjustment;$('stock-storage').disabled=adjustment;$('stock-storage-custom').readOnly=adjustment;$('stock-special-notes').readOnly=adjustment;$('stock-product-open').disabled=adjustment;$('stock-product-clear').disabled=adjustment;$('stock-adjustment').hidden=!adjustment;
    if(!adjustment)$('stock-delta').setCustomValidity('');
    $('stock-delta').required=adjustment;$('stock-reason').required=adjustment;
    for(const button of $('stock-mode').querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.mode===value));
    for(const field of fields)$('stock-'+field).readOnly=adjustment;
    $('stock-quantity').value=editing.quantity??0;$('stock-save').textContent=value==='in'?'입고 저장':value==='out'?'출고 저장':'저장';
    unitConstraints();previewAdjustment();
  }
  function previewAdjustment() {
    if(mode==='edit')return;
    const delta=Number($('stock-delta').value),current=editing.quantity||0,result=Math.round((current+(mode==='in'?delta:-delta))*1000)/1000;
    $('stock-quantity').value=Number.isFinite(result)?result:current;
    $('stock-adjust-preview').textContent=number(current)+' '+editing.unit+' → '+number(result)+' '+editing.unit;
    $('stock-delta').setCustomValidity(delta<=0?'변경 수량을 입력하세요.':$('stock-unit').value!=='KG'&&!Number.isInteger(delta)?'개·티백·박스는 정수로 입력하세요.':result<0?'보유 수량보다 많이 출고할 수 없습니다.':result>1e9?'보유 수량은 10억 이하로 입력하세요.':'');
  }
  function open(row, duplicate=false) {
    editing=duplicate?{id:crypto.randomUUID(),revision:0}:row||{id:crypto.randomUUID(),revision:0};
    const draft=duplicate?{name:row.name,storage:row.storage,unit:row.unit,quantity:0}:row;
    for(const field of fields)$('stock-'+field).value=draft?.[field]??(field==='unit'?'개':field==='quantity'?'0':'');
    for(const field of ['unit','storage']){const el=$('stock-'+field);for(const o of [...el.options])if(o.dataset.legacy)o.remove();const value=draft?.[field]??(field==='unit'?'개':'');const normalized=field==='unit'&&value.toUpperCase()==='KG'?'KG':value;if(![...el.options].some(o=>o.value===normalized)){const old=node('option',value+' (기존 값)');old.value=value;old.dataset.legacy='true';el.append(old);}el.value=normalized;}
    $('stock-storage-custom').value='';storageChoice();
    chosenProduct=row?.productNo?{productNo:row.productNo,name:row.productName||row.name}:null;$('stock-special-notes').value=duplicate?'':row?.specialNotes||'';renderProductLink();
    $('stock-form-title').textContent=duplicate?'새 제조번호 등록':row?'재고 수정':'재고 등록';$('stock-form-status').textContent='';$('stock-mode').hidden=!editing.revision;$('stock-duplicate').hidden=!editing.revision;
    $('stock-delta').value='';$('stock-delta').setCustomValidity('');$('stock-reason').value='';setMode('edit');$('stock-dialog').showModal();$('stock-name').focus();
  }
  async function refresh() {
    if(busy)return;
    if(displayMode!=='live'){window.moaonSales?.clear();ready=false;rocketReady=false;rocketRows=[];rows=[];products=[];productsReady=false;$('stock-status').textContent='사업장 연결 후 재고를 사용할 수 있습니다.';render();return;}
    const expected=generation;busy=true;$('stock-status').textContent='재고 기록을 불러오는 중…';render();
    try { const result=await window.moaonHub.readStock();if(expected!==generation)return;if(result.status!=='READY')throw Error(result.message);if(!Array.isArray(result.value)||result.value.length>5000||result.value.some(r=>!r||typeof r.id!=='string'||!Number.isInteger(r.revision)||r.revision<1||!Number.isFinite(r.quantity)||r.quantity<0||r.quantity>1e9||fields.filter(k=>k!=='quantity').some(k=>typeof r[k]!=='string')))throw Error('재고 자료 형식을 확인해야 합니다. 다시 조회하세요.');rocketReady=result.rocketStatus==='READY'&&Array.isArray(result.rocket)&&result.rocket.length<=5000&&result.rocket.every(r=>typeof r?.id==='string'&&typeof r.name==='string'&&(r.quantity===null||Number.isInteger(r.quantity)&&r.quantity>=0)&&typeof r.stale==='boolean'&&(r.updatedAt===null||typeof r.updatedAt==='string'&&Number.isFinite(Date.parse(r.updatedAt))));rocketRows=rocketReady?result.rocket:[];rows=result.value;window.moaonSales?.setData(result.salesStatus==='READY'?result.sales:null,rows);productsReady=result.productsStatus==='READY'&&Array.isArray(result.products)&&result.products.length<=5000&&result.products.every(p=>typeof p?.name==='string'&&typeof p.productNo==='string'&&/^\d{1,20}$/.test(p.productNo));products=productsReady?result.products.slice().sort((a,b)=>a.name.localeCompare(b.name,'ko')):[];ready=true;$('stock-status').textContent='사업장 DB · 방금 조회 · 같은 사업장에서 공유합니다.'; }
    catch(e){if(expected!==generation)return;window.moaonSales?.clear();ready=false;rocketReady=false;rocketRows=[];rocketMessage='';rows=[];products=[];productsReady=false;$('stock-status').textContent='조회 실패 · '+e.message;}
    finally{busy=false;render();}
  }
  $('stock-form').addEventListener('submit',async e=>{
    e.preventDefault();if(busy)return;
    const input=Object.fromEntries(fields.map(k=>[k,$('stock-'+k).value]));if(input.storage==='__CUSTOM_STORAGE__')input.storage=$('stock-storage-custom').value.trim();input.quantity=Number(input.quantity);input.specialNotes=$('stock-special-notes').value;input.productNo=chosenProduct?.productNo||null;input.id=editing.id;input.revision=editing.revision;
    if(input.expires&&input.manufactured&&input.expires<input.manufactured){$('stock-form-status').textContent='유통기한은 제조일자 이후로 입력하세요.';return;}
    if(mode!=='edit'){
      const reason=$('stock-reason').value.trim();if(!reason||!$('stock-delta').checkValidity()||input.quantity<0)return;
      const line=today()+' '+(mode==='in'?'입고 +':'출고 -')+$('stock-delta').value+' '+input.unit+' · '+reason;
      input.note=[input.note,line].filter(Boolean).join('\n');if(input.note.length>1000){$('stock-form-status').textContent='메모가 가득 찼습니다. 정보 수정에서 메모를 정리한 뒤 다시 기록하세요.';return;}
    }
    const expected=generation;busy=true;$('stock-save').disabled=true;$('stock-cancel').disabled=true;$('stock-duplicate').disabled=true;for(const b of $('stock-mode').querySelectorAll('button'))b.disabled=true;
    try {const result=await window.moaonHub.saveStock(input);if(expected!==generation)return;if(result.status!=='READY')throw Error(result.message);$('stock-dialog').close();window.moaonInventory?.invalidate();busy=false;await refresh();if(expected===generation&&ready)$('stock-status').textContent='저장되었습니다 · '+input.name+(result.salesWarning?' · 자동 차감 연결 확인 필요':'');}
    catch(e){if(expected===generation)$('stock-form-status').textContent=e.message;}
    finally{busy=false;$('stock-save').disabled=false;$('stock-cancel').disabled=false;$('stock-duplicate').disabled=false;for(const b of $('stock-mode').querySelectorAll('button'))b.disabled=false;render();}
  });
  function storageChoice(){const custom=$('stock-storage').value==='__CUSTOM_STORAGE__';$('stock-storage-custom').hidden=!custom;$('stock-storage-custom').required=custom;}
  $('stock-storage').onchange=storageChoice;
  function unitConstraints(){
    const unit=$('stock-unit').value,kg=unit==='KG';$('stock-quantity').step=kg?'0.001':'1';$('stock-delta').step=kg?'0.001':'1';$('stock-delta').min=kg?'0.001':'1';
    $('stock-quantity-label').textContent=kg?'보유 중량 (KG)':'보유 수량 ('+unit+')';$('stock-quantity-help').textContent=kg?'소수 셋째 자리까지 · 0.001 KG = 1g':'소수 없이 '+unit+' 단위로 입력하세요.';
    $('stock-unit').setCustomValidity(['개','KG','티백','박스'].includes(unit)?'':'단위를 다시 선택하세요.');
    const quantity=Number($('stock-quantity').value);$('stock-quantity').setCustomValidity(!kg&&!Number.isInteger(quantity)?'개·티백·박스는 정수로 입력하세요.':'');
  }
  function renderProductLink(){
    $('stock-product-open').textContent=chosenProduct?chosenProduct.name:'상품 검색·연결';$('stock-product-clear').hidden=!chosenProduct;
    $('stock-product-info').textContent=chosenProduct?'연결 후 새 주문은 기본 1단위 차감 · 여러 개입은 자동 차감·세트 구성에서 변경하세요.':'상품 연결 없이 직접 등록할 수도 있습니다.';
  }
  function renderProducts(){
    const q=$('stock-product-search').value.trim().toLowerCase(),visible=products.filter(p=>p.name.toLowerCase().includes(q));$('stock-product-list').replaceChildren();
    $('stock-product-status').textContent=!productsReady?'상품 목록을 불러오지 못했습니다. 재고 화면에서 새로 조회해 주세요.':visible.length+'개 · 가나다순 · 카페24 저장 자료 기준';
    for(const p of visible){const b=node('button',p.name);b.type='button';b.setAttribute('aria-pressed',String(chosenProduct?.productNo===p.productNo));b.onclick=()=>{chosenProduct=p;$('stock-name').value=p.name;renderProductLink();$('stock-product-dialog').close();$('stock-product-open').focus({preventScroll:true});};$('stock-product-list').append(b);}
    if(productsReady&&!visible.length)$('stock-product-list').append(node('p','조건에 맞는 판매 상품이 없습니다.'));
  }
  $('stock-product-open').onclick=()=>{$('stock-product-search').value='';renderProducts();$('stock-product-dialog').showModal();$('stock-product-search').focus();};
  $('stock-product-close').onclick=()=>$('stock-product-dialog').close();$('stock-product-search').oninput=renderProducts;
  $('stock-product-clear').onclick=()=>{chosenProduct=null;renderProductLink();};
  $('stock-unit').onchange=()=>{unitConstraints();previewAdjustment();};$('stock-quantity').oninput=unitConstraints;
  $('stock-new').onclick=()=>open();$('stock-cancel').onclick=()=>{if(!busy)$('stock-dialog').close();};$('stock-dialog').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  $('stock-duplicate').onclick=()=>{const row=editing;$('stock-dialog').close();open(row,true);};
  for(const b of $('stock-mode').querySelectorAll('button'))b.onclick=()=>setMode(b.dataset.mode);
  $('stock-delta').oninput=previewAdjustment;$('stock-refresh').onclick=refresh;$('stock-search').oninput=render;$('stock-filter').onchange=render;$('stock-sort').onchange=render;$('stock-reset').onclick=reset;

  function renderRocket(){
    $('stock-manual').hidden=rocketMode;$('stock-rocket').hidden=!rocketMode;$('stock-new').hidden=rocketMode;
    $('stock-tab-manual').setAttribute('aria-pressed',String(!rocketMode));$('stock-tab-rocket').setAttribute('aria-pressed',String(rocketMode));
    $('rocket-count').textContent=rocketReady?rocketRows.length:'';
    $('rocket-status').textContent=rocketMessage||(!rocketReady?'로켓그로스 재고를 확인하지 못했습니다. 새로 조회해 주세요.':rocketRows.some(r=>r.stale)?'갱신 필요 · 마지막 저장 수량입니다. API 갱신 결과를 확인하세요.':'API 저장 수량 · 화면을 열어 두면 주기적으로 갱신합니다.');
    $('rocket-refresh').disabled=rocketBusy||busy;$('rocket-status').dataset.loading=String(rocketBusy);

    const target=Number($('rocket-target').value),q=$('rocket-search').value.trim().toLowerCase();
    const all=rocketRows.map(r=>({...r,plan:moaonRocketPlanner.plan(r,target)}));
    const matches=(r,f)=>f==='ALL'||f==='RISK'&&['URGENT','LOW','EMPTY'].includes(r.plan.risk)||f==='EMPTY'&&r.quantity===0||f==='CHECK'&&['CHECK','NO_SALES'].includes(r.plan.risk);
    $('rocket-summary').replaceChildren();
    for(const [filter,label]of [['ALL','관리 상품'],['RISK','14일 내 소진'],['EMPTY','품절']]){const b=node('button','', 'rocket-summary-item');b.type='button';b.disabled=!rocketReady;b.setAttribute('aria-pressed',String($('rocket-filter').value===filter));b.append(node('span',label),node('strong',rocketReady?all.filter(r=>matches(r,filter)).length+'개':'—'));b.onclick=()=>{$('rocket-filter').value=filter;renderRocket();};$('rocket-summary').append(b);}
    const visible=all.filter(r=>r.name.toLowerCase().includes(q)&&matches(r,$('rocket-filter').value));
    visible.sort((a,b)=>($('rocket-sort').value==='NAME'?0:$('rocket-sort').value==='SALES'?(b.sales30??-1)-(a.sales30??-1):(a.plan.days??Infinity)-(b.plan.days??Infinity))||a.name.localeCompare(b.name,'ko'));
    $('rocket-visible-count').textContent=rocketReady?visible.length+' / '+all.length+'개':'';$('rocket-list').replaceChildren();
    const metric=(label,value,caption,cls='')=>{const el=node('div','', 'rocket-metric '+cls);el.append(node('small',label),node('strong',value));if(caption)el.append(node('small',caption));return el;};
    for(const r of visible){
      const p=r.plan,row=node('article','', 'rocket-row rocket-planning-row'),title=node('div','', 'rocket-identity');
      title.append(node('strong',r.name),node('small',r.updatedAt?'수집 '+new Intl.DateTimeFormat('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Seoul'}).format(new Date(r.updatedAt)):'수집 시각 확인 필요'));
      const label=r.quantity===0?(r.stale?'마지막 수집 시 품절':'품절'):({CHECK:'갱신·자료 확인',NO_SALES:'판매 표본 필요',URGENT:'7일 내 소진',LOW:'14일 내 소진',ENOUGH:'재고 보유'})[p.risk];
      title.append(node('span',label,'rocket-badge '+(r.quantity===0||p.risk==='URGENT'?'empty':p.risk==='LOW'?'warning':'available')));
      const metrics=node('div','', 'rocket-metrics');
      metrics.append(metric('현재 재고',r.quantity===null?'확인 필요':number(r.quantity)+' 개',r.stale?'갱신 필요':'판매 가능 수량','primary'),metric('최근 30일 판매',r.sales30==null?'확인 필요':number(r.sales30)+'개',p.daily===null?'판매 자료 미확인':'하루 평균 '+p.daily.toLocaleString('ko-KR',{maximumFractionDigits:1})+'개'),metric('예상 소진',p.days===null?'판단 보류':p.days.toLocaleString('ko-KR',{maximumFractionDigits:1})+'일분',p.depletesAt?new Intl.DateTimeFormat('ko-KR',{month:'short',day:'numeric',timeZone:'Asia/Seoul'}).format(new Date(p.depletesAt))+' 예상':'판매 이력·수집 확인'),metric('30일 뒤 예상',p.remaining30===null?'판단 보류':number(p.remaining30)+'개',p.shortage30>0?'약 '+number(p.shortage30)+'개 부족':'추가 입고 없는 가정'),metric(target+'일 목표 보충',p.replenish===null?'판단 보류':number(p.replenish)+'개',p.replenish>0?'입고 검토':'추정치','replenish'));
      const coverage=node('div','', 'rocket-coverage');coverage.append(node('span',target+'일 목표 대비 현재 재고'));const bar=document.createElement('progress');bar.max=100;bar.value=p.coverage??0;bar.hidden=p.coverage===null;bar.setAttribute('aria-label',target+'일 목표 재고 충족률');coverage.append(bar,node('span',p.coverage===null?'예측 보류':Math.round(p.coverage)+'%'));
      row.append(title,metrics,coverage);$('rocket-list').append(row);
    }
    if(rocketReady&&!visible.length)$('rocket-list').append(node('p',q||$('rocket-filter').value!=='ALL'?'조건에 맞는 상품이 없습니다.':'아직 관리 대상이 없습니다. 판매 중이고 재고가 있는 로켓그로스 상품이 자동 등록됩니다.'));
  }

  async function refreshRocket(){
    if(rocketBusy||busy||displayMode!=='live')return;const expected=generation;rocketBusy=true;rocketMessage='쿠팡 API 재고 수집을 요청하고 있습니다…';renderRocket();
    try{const r=await window.moaonHub.saveStock({action:'REFRESH_ROCKET'});if(expected!==generation)return;if(r.status!=='READY')throw Error(r.message);lastQueue=Date.now();rocketMessage=r.value?.status==='FAILED'?'최근 수집 실패 · 잠시 후 다시 요청하세요.':'수집 요청 접수 · 작업 서버가 처리하면 수량이 갱신됩니다.';}
    catch(e){if(expected===generation)rocketMessage='API 갱신 요청 실패 · '+e.message;}
    finally{rocketBusy=false;renderRocket();}
  }
  $('stock-tab-manual').onclick=()=>{rocketMode=false;renderRocket();};
  $('stock-tab-rocket').onclick=()=>{rocketMode=true;renderRocket();if(Date.now()-lastQueue>300000)void refreshRocket();};
  for(const id of ['rocket-filter','rocket-target','rocket-sort'])$(id).onchange=renderRocket;
  $('rocket-search').oninput=renderRocket;$('rocket-refresh').onclick=refreshRocket;
  setInterval(()=>{if(displayMode==='live'&&rocketMode&&!document.querySelector('[data-page=stock]').hidden&&!document.hidden&&!busy&&!rocketBusy){rocketMessage='';void refresh().then(()=>{if(Date.now()-lastQueue>300000)void refreshRocket();});}},30000);

  window.moaonStock={ensure:refresh,clear:()=>{window.moaonSales?.clear();generation++;rocketMode=false;rocketBusy=false;lastQueue=0;ready=false;rocketReady=false;rocketRows=[];rocketMessage='';rows=[];products=[];productsReady=false;chosenProduct=null;editing=null;$('stock-product-dialog').close();$('stock-status').textContent='사업장 연결 후 재고를 사용할 수 있습니다.';$('stock-dialog').close();render();}};render();
})();
