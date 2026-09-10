'use strict';
(()=>{
 const $=id=>document.getElementById(id),labels={CAFE24:'카페24',NAVER:'네이버',COUPANG:'쿠팡 판매자배송'};
 const node=(tag,text,cls)=>{const el=document.createElement(tag);el.textContent=text;if(cls)el.className=cls;return el;};
 let data=null,lots=[],busy=false,generation=0;
 const key=s=>JSON.stringify([s.platform,s.productKey,s.optionKey]);
 async function action(value){
  if(busy)return;const expected=generation;busy=true;render();$('stock-sales-status').textContent='저장하고 있습니다…';
  try{const result=await window.moaonHub.saveStock(value);if(expected!==generation)return;if(result.status!=='READY')throw Error(result.message);const fresh=await window.moaonHub.readStock();if(expected!==generation)return;if(fresh.status!=='READY'||fresh.salesStatus!=='READY')throw Error('저장 후 조회를 확인해야 합니다. 재고를 새로 조회해 주세요.');data=fresh.sales;lots=fresh.value;window.moaonInventory?.invalidate();void window.moaonStock?.ensure();$('stock-sales-status').textContent='저장되었습니다. 이후 새 주문부터 적용됩니다.';}
  catch(e){if(expected===generation)$('stock-sales-status').textContent=e.message;}
  finally{if(expected===generation){busy=false;render();}}
 }
 function render(){
  $('stock-sales-summary').textContent=data?'기본 1개씩 차감 · 구성 '+data.rules.length+'건 · '+data.ledger.filter(r=>['REVIEW','INSUFFICIENT'].includes(r.state)).length+'건 확인 필요':'자동 차감 설정은 재고 조회 후 확인하세요.';
  $('stock-sales-open').disabled=!data;$('stock-sales-init').disabled=busy;$('stock-sales-retry').disabled=busy;
  const sources=new Map((data?.catalog||[]).map(s=>[key(s),s]));
  for(const r of data?.rules||[]){const s={platform:r.platform,productKey:r.product_key,optionKey:r.option_key,name:r.name,productNo:r.product_no};if(!sources.has(key(s)))sources.set(key(s),s);}
  const q=$('stock-sales-search').value.trim().toLowerCase(),platform=$('stock-sales-platform').value;$('stock-sales-rules').replaceChildren();
  for(const s of sources.values()){
   if(platform!=='ALL'&&s.platform!==platform||!(s.name+' '+s.optionKey).toLowerCase().includes(q))continue;
   const rule=data.rules.find(r=>r.platform===s.platform&&r.product_key===s.productKey&&r.option_key===s.optionKey);
   const fallback=rule||data.rules.find(r=>r.platform===s.platform&&r.product_key===s.productKey&&r.option_key==='*');
   const targets=[...new Map(lots.filter(l=>l.productNo).map(l=>[l.productNo+'|'+l.unit,l])).values()];
   if(!targets.some(l=>l.productNo===(fallback?.product_no||s.productNo)))continue;
   const form=node('form','', 'stock-sales-rule'),identity=node('div','');identity.append(node('strong',s.name),node('small',labels[s.platform]+' · '+(s.optionKey==='*'?'전체 옵션 기본':s.optionKey||'단일 옵션')));
   const targetLabel=node('label','차감할 재고'),target=document.createElement('select');target.setAttribute('aria-label','차감할 재고');
   for(const l of targets){const o=node('option',(l.productName||l.name)+' · '+l.unit);o.value=l.productNo+'|'+l.unit;target.append(o);if(l.productNo===(fallback?.product_no||s.productNo)&&(!fallback||l.unit===fallback.unit))target.value=o.value;}
   targetLabel.append(target);const factorLabel=node('label','주문 1개당 차감'),factor=document.createElement('input');factor.type='number';factor.min='0.001';factor.max='1000000';factor.required=true;factor.value=String(fallback?.factor??1);factor.setAttribute('aria-label','주문 1개당 차감 수량');factorLabel.append(factor);
   const enabledLabel=node('label','자동 차감', 'sales-enabled'),enabled=document.createElement('input');enabled.type='checkbox';enabled.checked=fallback?.enabled!==false;enabledLabel.prepend(enabled);
   const preview=node('output',''),update=()=>{const unit=target.value.split('|')[1];factor.step=unit==='KG'?'0.001':'1';factor.min=unit==='KG'?'0.001':'1';preview.textContent='주문 2개 → '+(Number(factor.value)*2).toLocaleString('ko-KR')+' '+unit+' 차감';};factor.oninput=target.onchange=update;update();
   const save=node('button',rule?'변경 저장':'설정 저장');save.type='submit';for(const el of [target,factor,enabled,save])el.disabled=busy;
   form.append(identity,targetLabel,factorLabel,enabledLabel,save,preview);form.onsubmit=e=>{e.preventDefault();if(!form.checkValidity())return;const [productNo,unit]=target.value.split('|');void action({action:'SAVE_SALES_RULE',platform:s.platform,productKey:s.productKey,optionKey:s.optionKey,productNo,unit,factor:Number(factor.value),enabled:enabled.checked});};$('stock-sales-rules').append(form);
  }
  if(!$('stock-sales-rules').children.length)$('stock-sales-rules').append(node('p','연결된 재고 상품이 없습니다. 재고 등록에서 상품을 연결하면 기본 1개 차감 설정이 만들어집니다.'));
  $('stock-sales-ledger').replaceChildren();for(const r of data?.ledger||[]){const row=node('div','', 'stock-sales-ledger-row');row.append(node('strong',r.name),node('span',labels[r.platform]+' · 주문 '+r.quantity+' × 구성 = '+r.required+' '+r.unit),node('span',({APPLIED:'차감 완료',INSUFFICIENT:'재고 부족 · 보류',REVIEW:'변경·취소 확인',SKIPPED:'차감 제외',PENDING:'처리 대기'})[r.state]||'확인 필요'),node('small',r.reason||'동일 주문 중복 차감 없음'));$('stock-sales-ledger').append(row);}
  if(data?.errors?.length)$('stock-sales-ledger').prepend(node('p','주문 차감 처리 오류 기록이 있습니다. 서버 처리 상태를 확인해야 합니다.'));
 }
 $('stock-sales-open').onclick=()=>{$('stock-sales-status').textContent='';render();$('stock-sales-dialog').showModal();};$('stock-sales-close').onclick=()=>{if(!busy)$('stock-sales-dialog').close();};$('stock-sales-dialog').oncancel=e=>{if(busy)e.preventDefault();};
 $('stock-sales-search').oninput=render;$('stock-sales-platform').onchange=render;$('stock-sales-init').onclick=()=>action({action:'INIT_SALES_RULES'});$('stock-sales-retry').onclick=()=>action({action:'RETRY_SALES_ORDERS'});
 window.moaonSales={setData:(next,rows)=>{data=next&&['catalog','rules','ledger','errors'].every(k=>Array.isArray(next[k]))?next:null;lots=rows;render();},clear:()=>{generation++;data=null;lots=[];busy=false;$('stock-sales-dialog').close();render();}};render();
})();
