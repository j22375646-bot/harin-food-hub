'use strict';
(()=>{
 const $=id=>document.getElementById(id),node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 let data=null,busy=false,failed=false,chosen=null;
 const campaignLabel=node('label','','캠페인'),campaignSelect=node('select');campaignSelect.id='keyword-campaign';campaignLabel.append(campaignSelect);document.querySelector('.keyword-tools').insertBefore(campaignLabel,$('keyword-type').parentElement);campaignSelect.onchange=rows;
 const fmt=(v,u='',d=0)=>typeof v==='number'?v.toLocaleString('ko-KR',{maximumFractionDigits:d})+u:'확인 필요';
 const advice=r=>r.cost===null||r.conversions===null?'자료 확인':r.cost>0&&r.conversions===0?'전환 없음':r.conversions<3?'표본 관찰':'효율 비교';
 const snapshot=()=>data?.[$('keyword-source-kind').value==='SEARCH_TERMS'?'searchTerms':'workbench'];
 function rows(){
  const term=$('keyword-search').value.trim().toLocaleLowerCase(),type=$('keyword-type').value,filter=$('keyword-filter').value,sort=$('keyword-sort').value;
  const source=snapshot()?.rows||[],filtered=source.filter(r=>(r.name.toLocaleLowerCase().includes(term))&&(campaignSelect.value==='ALL'||r.campaignId===campaignSelect.value)&&(type==='ALL'||r.type===type)&&(filter==='ALL'||filter==='ZERO'&&r.cost>0&&r.conversions===0||filter==='CONVERTED'&&r.conversions>0||filter==='UNKNOWN'&&(r.cost===null||r.conversions===null)));
  filtered.sort((a,b)=>(b[sort]??-1)-(a[sort]??-1)||a.name.localeCompare(b.name,'ko'));
  $('keyword-count').textContent=`검색 결과 ${filtered.length} / 조회 ${source.length}개`;
  const search=$('keyword-source-kind').value==='SEARCH_TERMS';
  document.querySelector('.keyword-table-heading').replaceChildren(...(search?['실제 검색어·유형','광고비','노출','클릭','평균 CPC']:['키워드·유형','광고비','클릭','전환','ROAS']).map(t=>node('span','',t)));
  const list=$('keyword-rows');list.replaceChildren();
  for(const r of filtered){const row=node('button','keyword-row');row.type='button';row.dataset.keyword=r.id;row.setAttribute('aria-expanded',String(chosen===r.id));const name=node('span','keyword-name');name.append(node('strong','',r.name),node('small','',`${r.campaignName||r.type} · ${search?'실제 유입 검색어':advice(r)}`));row.append(name,node('span','',fmt(r.cost,'원')));for(const [k,unit,d]of search?[['impressions','회',0],['clicks','회',0],['cpc','원',0]]:[['clicks','회',0],['conversions','회',0],['roas','%',1]])row.append(node('span','',fmt(r[k],unit,d)));row.onclick=()=>{chosen=chosen===r.id?null:r.id;rows();if(chosen)$('keyword-detail').focus({preventScroll:true});};list.append(row);}
  if(!filtered.length)list.append(node('p','keyword-empty',busy?'자료를 불러오고 있습니다.':failed?'조회에 실패했습니다. 새로 조회해 주세요.':!data?'사업장에 연결하면 키워드를 조회합니다.':snapshot()?.status!=='OBSERVED'?'키워드 원천 자료를 확인할 수 없습니다.':!source.length?'저장된 키워드 실적이 없습니다.':'검색·필터 조건에 맞는 키워드가 없습니다.'));
  const selected=filtered.find(r=>r.id===chosen),detail=$('keyword-detail');detail.hidden=!selected;detail.replaceChildren();
  if(selected){detail.append(node('h2','',selected.name),node('p','',`${snapshot().start} ~ ${snapshot().end} · ${selected.type}`));const grid=node('div','keyword-detail-grid');for(const [k,label,unit]of [['impressions','노출','회'],['clicks','클릭','회'],['ctr','클릭률','%'],['cpc','클릭당 비용','원'],['revenue','전환매출','원'],['cvr','전환율','%'],['cpa','전환당 비용','원'],['roas','ROAS','%']]){const cell=node('div');cell.append(node('small','',label),node('strong','',fmt(selected[k],unit,unit==='%'?2:0)));grid.append(cell);}detail.append(grid,node('p','','전환에는 구매 외 행동이 포함될 수 있습니다. 전환 지연·표본·원가를 확인한 뒤 광고 변경을 판단하세요.'));
   window.moaonBids?.mount(detail,selected,search);
   const close=node('button','','상세 닫기');close.dataset.closeDetail='true';close.type='button';close.onclick=()=>{const id=chosen;chosen=null;rows();[...$('keyword-rows').querySelectorAll('button')].find(n=>n.dataset.keyword===id)?.focus();};detail.append(close);
  }
 }
 function render(){
  const w=snapshot();$('keyword-refresh').disabled=busy||displayMode!=='live';$('keyword-page').setAttribute('aria-busy',String(busy));
  $('keyword-period').textContent=w?.start?`${w.start} ~ ${w.end} · 현재 사용 중인 캠페인 · 가장 최근 저장 기간`:'기간 확인 필요';
  $('keyword-source').textContent=w?.status==='OBSERVED'?`저장 ${fmt(w.total)}개 중 광고비 상위 ${w.rows.length}개 조회 · 최대 200개`:'원천 조회 상태 확인 필요';
  const previousCampaign=campaignSelect.value;campaignSelect.replaceChildren();const cmap=new Map((w?.rows||[]).filter(r=>r.campaignId).map(r=>[r.campaignId,r.campaignName]));for(const [id,name]of [['ALL','사용 중인 모든 캠페인'],...cmap]){const o=node('option','',name);o.value=id;campaignSelect.append(o);}campaignSelect.value=cmap.has(previousCampaign)?previousCampaign:'ALL';
  const previous=$('keyword-type').value;$('keyword-type').replaceChildren();for(const type of ['ALL',...new Set(w?.rows.map(r=>r.type)||[])]){const option=node('option','',type==='ALL'?'모든 광고 유형':type);option.value=type;$('keyword-type').append(option);}$('keyword-type').value=[...$('keyword-type').options].some(o=>o.value===previous)?previous:'ALL';
  const tg=data?.telegram;$('telegram-status').textContent=!tg?'서버 연결 후 설정 상태를 확인합니다.':!tg.configured?'연결 준비 · 봇과 수신 채팅 설정 필요':!tg.enabled||!tg.sendingEnabled?'서버 설정 있음 · 알림 발송 꺼짐':'서버 발송 설정 켜짐 · 실제 수신 여부는 별도 확인 필요';
  rows();
 }
 window.moaonKeywords={set:(next,state={})=>{data=next;busy=!!state.busy;failed=!!state.failed;if(!next){chosen=null;window.moaonBids?.reset();}render();}};
 const statusRefresh=node('button','','서버 설정 상태 조회');statusRefresh.type='button';statusRefresh.onclick=()=>window.moaonInsights?.refresh();$('telegram-status').after(statusRefresh);
 $('keyword-source-kind').onchange=()=>{chosen=null;render();};
 $('keyword-refresh').onclick=()=>window.moaonInsights?.refresh();$('keyword-search').oninput=rows;for(const id of ['keyword-type','keyword-filter','keyword-sort'])$(id).onchange=rows;
 $('keyword-reset').onclick=()=>{campaignSelect.value='ALL';$('keyword-search').value='';$('keyword-type').value='ALL';$('keyword-filter').value='ALL';$('keyword-sort').value='cost';chosen=null;rows();$('keyword-search').focus();};
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('keyword-detail').hidden&&!document.querySelector('dialog[open]')){$('keyword-detail').querySelector('[data-close-detail]')?.click();}});render();
})();
