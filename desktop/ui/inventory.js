'use strict';
(()=>{
 const $=id=>document.getElementById(id),labels={NAVER:'네이버',CAFE24:'Cafe24',MARKETPLACE:'쿠팡 판매자배송',ROCKET_GROWTH:'쿠팡 로켓그로스',HEALTHY:'판매 가능 수량 있음',LOW:'저재고',OUT_OF_STOCK:'품절',STALE:'갱신 필요',UNKNOWN:'수량 확인 필요',MISSING:'미연결',REFERENCE:'광고 참고'};
 let value=null,busy=false,generation=0,selected=null,pageIndex=0;
 const node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
 const channelName=c=>labels[c.family]||labels[c.platform];
 const description=c=>`${c.quantity===null?(c.unmanaged?'재고관리 안 함':'수량 확인 필요'):c.quantity.toLocaleString('ko-KR')+'개'} · ${c.unmanaged?'수량 제한 없음':labels[c.state]}${c.stale&&c.state!=='STALE'?' · 갱신 필요':''}${c.stopped?' · 판매중단':''}`.replace('수량 확인 필요 · 수량 확인 필요','수량 확인 필요');
 const match=c=>($('inventory-platform').value==='ALL'||c.platform===$('inventory-platform').value)&&($('inventory-state').value==='ALL'||($('inventory-state').value==='STALE'?c.stale:c.state===$('inventory-state').value));
 function close(){const id=selected;selected=null;render();Array.from($('inventory-list').querySelectorAll('button')).find(b=>b.dataset.id===id)?.focus();}
 function render(){
  $('inventory-refresh').disabled=busy||displayMode!=='live';
  const query=$('inventory-search').value.trim().toLowerCase();
  const rows=(value?.items||[]).filter(r=>(r.name+' '+r.id+' '+r.channels.map(c=>c.externalId||'').join(' ')).toLowerCase().includes(query)&&r.channels.some(match));
  const pageCount=Math.ceil(rows.length/50);pageIndex=Math.min(pageIndex,Math.max(0,pageCount-1));
  const visible=rows.slice(pageIndex*50,pageIndex*50+50);
  if(!visible.some(r=>r.id===selected))selected=null;
  $('inventory-page-label').textContent=pageCount?`${pageIndex+1} / ${pageCount}쪽 · 50개씩 표시`:'표시할 상품 없음';
  $('inventory-prev').disabled=busy||pageIndex===0;$('inventory-next').disabled=busy||pageIndex>=pageCount-1;
  $('inventory-count').textContent=value?`조회 상품 ${value.items.length}개 · 현재 조건 ${rows.length}개`:'상품 수량 확인 필요';
  $('inventory-list').replaceChildren(...(visible.length?visible.map(r=>{
   const b=node('button','');b.type='button';b.className='inventory-row';b.dataset.id=r.id;b.setAttribute('aria-expanded',String(selected===r.id));b.setAttribute('aria-controls','inventory-detail');
   const stocks=node('div','');stocks.className='inventory-stock';for(const c of r.channels.filter(match)){const cell=node('span','');cell.append(node('strong',channelName(c)),node('small',description(c)));stocks.append(cell);}
   b.append(node('strong',r.name),stocks);b.onclick=()=>{selected=r.id;render();$('inventory-detail').querySelector('button').focus();};return b;
  }):[node('p',value?'조건에 맞는 상품이 없습니다.':'실제 사업장 연결 후 새로 조회해 주세요.')]));
  const panel=$('inventory-detail'),row=rows.find(r=>r.id===selected);panel.hidden=!row;panel.replaceChildren();if(!row)return;
  const button=node('button','닫기');button.type='button';button.onclick=close;panel.append(button,node('h2',row.name),node('p','상품 번호 '+row.id));
  for(const c of row.channels){const section=node('section','');section.className='inventory-detail-stock';section.append(node('h3',channelName(c)),node('p',description(c)),node('p',c.externalId?'연결 번호 '+c.externalId:'연결 번호 확인 필요'),node('p',c.updatedAt?'자료 시각 '+formatTime(c.updatedAt):'자료 시각 확인 필요'),node('p',c.detail));panel.append(section);}
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
