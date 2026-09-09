'use strict';
(()=>{
 const $=id=>document.getElementById(id),labels={NAVER:'네이버',CAFE24:'Cafe24',MARKETPLACE:'쿠팡 판매자배송',ROCKET_GROWTH:'쿠팡 로켓그로스',HEALTHY:'판매 가능 수량 있음',LOW:'저재고',OUT_OF_STOCK:'품절',STALE:'갱신 필요',UNKNOWN:'수량 확인 필요',MISSING:'미연결',REFERENCE:'광고 참고'};
 let value=null,busy=false,generation=0,selected=null,pageIndex=0;
 const node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
 const channelName=c=>labels[c.family]||labels[c.platform];
 const description=c=>c.mapping?`연결 ${c.mapping.count}건 · 검토 필요`:`${c.quantity===null?(c.unmanaged?'재고관리 안 함':'수량 확인 필요'):c.quantity.toLocaleString('ko-KR')+'개'} · ${c.unmanaged?'수량 제한 없음':labels[c.state]}${c.stale&&c.state!=='STALE'?' · 갱신 필요':''}${c.stopped?' · 판매중단':''}`.replace('수량 확인 필요 · 수량 확인 필요','수량 확인 필요');
 const match=c=>($('inventory-platform').value==='ALL'||c.platform===$('inventory-platform').value)&&($('inventory-state').value==='ALL'||($('inventory-state').value==='MULTIPLE'?Boolean(c.mapping):$('inventory-state').value==='STALE'?c.stale:c.state===$('inventory-state').value));
 function close(){const id=selected;selected=null;render();Array.from($('inventory-list').querySelectorAll('button')).find(b=>b.dataset.id===id)?.focus();}
 function render(){
  $('inventory-refresh').disabled=busy||displayMode!=='live';
  const query=$('inventory-search').value.trim().toLowerCase();
  const rows=(value?.items||[]).filter(r=>(r.name+' '+r.id+' '+r.channels.map(c=>(c.externalId||'')+' '+(c.product?.name||'')+' '+(c.mapping?.entries||[]).map(m=>(m.name||'')+' '+(m.externalId||'')).join(' ')).join(' ')).toLowerCase().includes(query)&&r.channels.some(match));
  const pageCount=Math.ceil(rows.length/50);pageIndex=Math.min(pageIndex,Math.max(0,pageCount-1));
  const visible=rows.slice(pageIndex*50,pageIndex*50+50);
  if(!visible.some(r=>r.id===selected))selected=null;
  $('inventory-page-label').textContent=pageCount?`${pageIndex+1} / ${pageCount}쪽 · 50개씩 표시`:'표시할 상품 없음';
  $('inventory-prev').disabled=busy||pageIndex===0;$('inventory-next').disabled=busy||pageIndex>=pageCount-1;
  $('inventory-count').textContent=value?`조회 상품 ${value.items.length}개 · 현재 조건 ${rows.length}개`:'상품 수량 확인 필요';
  $('inventory-list').replaceChildren(...(visible.length?visible.map(r=>{
   const b=node('button','');b.type='button';b.className='inventory-row';b.dataset.id=r.id;b.setAttribute('aria-expanded',String(selected===r.id));b.setAttribute('aria-controls','inventory-detail');
   const stocks=node('div','');stocks.className='inventory-stock';for(const c of r.channels.filter(match)){const cell=node('span','');cell.append(node('strong',channelName(c)),node('small',description(c)));stocks.append(cell);}
   b.append(node('strong',r.name),stocks);b.onclick=()=>{selected=r.id;render();$('inventory-detail').querySelector('button').focus({preventScroll:true});$('inventory-detail').scrollIntoView({block:'start'});};return b;
  }):[node('p',value?'조건에 맞는 상품이 없습니다.':'실제 사업장 연결 후 새로 조회해 주세요.')]));

  const panel=$('inventory-detail'),row=rows.find(r=>r.id===selected);panel.hidden=!row;panel.parentElement.dataset.detailOpen=String(Boolean(row));panel.replaceChildren();if(!row)return;
  const heading=node('header','');heading.className='inventory-detail-heading';const title=node('div','');title.append(node('h2',row.name),node('p','상품 번호 '+row.id));const button=node('button','목록으로');button.type='button';button.onclick=close;heading.append(title,button);panel.append(heading);
  const priority=c=>($('inventory-platform').value!=='ALL'&&c.platform===$('inventory-platform').value?4:0)+($('inventory-state').value!=='ALL'&&match(c)?4:0)+(c.mapping?2:0);
  const pairs=(entries)=>{const dl=node('dl','');dl.className='inventory-facts';for(const [label,value] of entries)dl.append(node('dt',label),node('dd',value));return dl;};
  for(const c of [...row.channels].sort((a,b)=>priority(b)-priority(a))){
   const section=node('section','');section.className='inventory-detail-stock';section.dataset.platform=c.platform;section.append(node('h3',channelName(c)),node('p',description(c)));
   if(c.mapping){section.append(node('p',c.detail));const list=node('ul','');list.className='inventory-connections';for(const entry of c.mapping.entries){const item=node('li','');item.append(node('strong',entry.name||'연결 상품명 확인 필요'),node('p','연결 번호 '+(entry.externalId||'확인 필요')),node('p',(entry.reference?'광고 참고 · ':'')+(entry.active===null?'활성 상태 확인 필요':entry.active?'활성 연결':'비활성 연결')));list.append(item);}section.append(list);if(c.mapping.count>c.mapping.entries.length)section.append(node('p','전체 '+c.mapping.count+'건 중 '+c.mapping.entries.length+'건 표시 · 연결 검색도 표시 자료 기준'));panel.append(section);continue;}
   const columns=node('div','');columns.className='inventory-channel-columns';const stock=node('div','');stock.append(node('h4','재고 자료'),pairs([['연결 번호',c.externalId||'확인 필요'],['자료 시각',c.updatedAt?formatTime(c.updatedAt):'확인 필요']]),node('p',c.detail));
   const product=c.product,info=node('div','');info.append(node('h4','연결 상품 정보'),node('p',product?.name||'연결 상품명 확인 필요'));
   const price=product?.min==null?'가격 확인 필요':product.min===product.max?product.min.toLocaleString('ko-KR')+'원':product.min.toLocaleString('ko-KR')+' ~ '+product.max.toLocaleString('ko-KR')+'원';const amount=node('strong',price);amount.className='inventory-price';info.append(amount,node('p',({CAFE24_CATALOG:'Cafe24 상품 저장 가격',NAVER_COMMERCE:'스마트스토어 연결 자료 가격',COUPANG_OPTIONS:'연결 옵션 전체의 저장 가격 범위 · 배송 유형별 가격 아님',REFERENCE:'광고 연결은 상품 가격 자료가 아닙니다.'})[product?.basis]||'가격 자료 확인 필요'),pairs([['가격 자료 시각',product?.updatedAt?formatTime(product.updatedAt)+(product.stale?' · 갱신 필요':''):'확인 필요']]));columns.append(stock,info);section.append(columns);panel.append(section);
  }

 }
 function clear(){pageIndex=0;generation++;value=null;busy=false;selected=null;$('inventory-platform').value='ALL';$('inventory-state').value='ALL';$('inventory-search').value='';$('inventory-status').textContent='실제 사업장 연결 후 조회합니다.';render();}
 async function refresh(){
  if(busy||displayMode!=='live')return;const expected=++generation;busy=true;value=null;selected=null;pageIndex=0;render();$('inventory-status').textContent='상품과 저장 재고를 조회하고 있습니다…';
  try{const result=await window.moaonHub.readInventory();if(expected!==generation)return;
   if(['LOGIN_REQUIRED','FORBIDDEN'].includes(result?.status)){applyHubResult(result);return;}
   if(result?.status!=='READY'){$('inventory-status').textContent='재고 조회 실패 · 자료 누락·조회 한도·연결 상태를 확인한 뒤 다시 시도해 주세요.';return;}
   value=result;$('inventory-status').textContent=`조회 시각 ${formatTime(result.generatedAt)} · 아래 수량은 채널에서 마지막으로 저장한 자료입니다.`;
  }catch{if(expected===generation)$('inventory-status').textContent='재고 조회 실패 · 다시 시도해 주세요.';}
  finally{if(expected===generation){busy=false;render();}}
 }
 const filter=()=>{pageIndex=0;selected=null;render();};
 $('inventory-prev').onclick=()=>{if(pageIndex>0){pageIndex--;selected=null;render();}};
 $('inventory-next').onclick=()=>{pageIndex++;selected=null;render();};
 for(const id of ['inventory-platform','inventory-state'])$(id).addEventListener('change',filter);$('inventory-search').addEventListener('input',filter);$('inventory-refresh').onclick=refresh;
 $('inventory-detail').addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close();}});
 window.moaonInventory=Object.freeze({clear,ensure:()=>{render();if(!value&&!busy)void refresh();}});clear();
})();
