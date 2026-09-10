'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const fields = ['name','lot','manufactured','expires','storage','unit','quantity','note'];
  let rows = [], editing = null, busy = false, generation = 0, ready = false, mode = 'edit', products = [], productsReady = false, chosenProduct = null;
  const node = (tag, text, cls) => { const el = document.createElement(tag); el.textContent = text; if (cls) el.className = cls; return el; };
  const today = () => new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Seoul'}).format(new Date());
  const number = value => value.toLocaleString('ko-KR', {maximumFractionDigits:3});
  function state(row) {
    if (!row.expires) return {key:'unknown', label:'기한 미입력'};
    const days = Math.round((Date.parse(row.expires)-Date.parse(today()))/86400000);
    return days < 0 ? {key:'expired', label:Math.abs(days)+'일 경과'} : days <= 30 ? {key:'soon', label:days === 0 ? '오늘까지' : days+'일 남음'} : {key:'normal', label:days+'일 남음'};
  }
  const matches = (row, filter) => filter === 'all' || (filter === 'empty' ? row.quantity === 0 : state(row).key === filter);
  function render() {
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
    if(displayMode!=='live'){ready=false;rows=[];products=[];productsReady=false;$('stock-status').textContent='사업장 연결 후 재고를 사용할 수 있습니다.';render();return;}
    const expected=generation;busy=true;$('stock-status').textContent='재고 기록을 불러오는 중…';render();
    try { const result=await window.moaonHub.readStock();if(expected!==generation)return;if(result.status!=='READY')throw Error(result.message);if(!Array.isArray(result.value)||result.value.length>5000||result.value.some(r=>!r||typeof r.id!=='string'||!Number.isInteger(r.revision)||r.revision<1||!Number.isFinite(r.quantity)||r.quantity<0||r.quantity>1e9||fields.filter(k=>k!=='quantity').some(k=>typeof r[k]!=='string')))throw Error('재고 자료 형식을 확인해야 합니다. 다시 조회하세요.');rows=result.value;productsReady=result.productsStatus==='READY'&&Array.isArray(result.products)&&result.products.length<=5000&&result.products.every(p=>typeof p?.name==='string'&&typeof p.productNo==='string'&&/^\d{1,20}$/.test(p.productNo));products=productsReady?result.products.slice().sort((a,b)=>a.name.localeCompare(b.name,'ko')):[];ready=true;$('stock-status').textContent='사업장 DB · 방금 조회 · 같은 사업장에서 공유합니다.'; }
    catch(e){if(expected!==generation)return;ready=false;rows=[];products=[];productsReady=false;$('stock-status').textContent='조회 실패 · '+e.message;}
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
    try {const result=await window.moaonHub.saveStock(input);if(expected!==generation)return;if(result.status!=='READY')throw Error(result.message);$('stock-dialog').close();busy=false;await refresh();if(expected===generation&&ready)$('stock-status').textContent='저장되었습니다 · '+input.name;}
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
    $('stock-product-info').textContent=chosenProduct?'카페24 상품과 연결됨 · 채널 재고는 자동 변경하지 않습니다.':'상품 연결 없이 직접 등록할 수도 있습니다.';
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
  window.moaonStock={ensure:refresh,clear:()=>{generation++;ready=false;rows=[];products=[];productsReady=false;chosenProduct=null;editing=null;$('stock-product-dialog').close();$('stock-status').textContent='사업장 연결 후 재고를 사용할 수 있습니다.';$('stock-dialog').close();render();}};render();
})();
