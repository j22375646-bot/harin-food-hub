'use client';

import {useEffect,useMemo,useState} from 'react';
import {useRouter} from 'next/navigation';
import HarinIcon from '../../_design-system/harin-icon.js';
import {Phase28ChannelLogo} from '../primitives/channel-logo.js';
import {Phase28PageHeading} from '../primitives/page-heading.js';
import {Phase28RightRailLayout} from '../primitives/right-rail-layout.js';
import {pushPhase28Route} from '../phase28-navigation-feedback.js';
import './inventory-products-page.css';

const INVENTORY_TABS=[
  {id:'SELLING',label:'판매 상품'},
  {id:'RESTOCK',label:'재입고 점검'},
  {id:'INBOUND',label:'입고 작업표'},
  {id:'LOTS',label:'유통기한·LOT'},
  {id:'HISTORY',label:'수집 기록'}
];
const PRODUCT_TABS=[
  {id:'catalog',label:'기준 상품',href:'/products/catalog'},
  {id:'mappings',label:'채널 연결',href:'/products/mappings'},
  {id:'costs',label:'원가',href:'/products/costs'},
  {id:'profit',label:'수익 판단',href:'/products/profit'},
  {id:'offers',label:'판매 제안',href:'/products/offers'},
  {id:'ad-targets',label:'광고 대상',href:'/products/ad-targets'}
];
const CHANNEL_NAMES={CAFE24:'Cafe24',NAVER:'네이버',COUPANG:'쿠팡'};

function count(value){return value==null?'확인 필요':Number(value).toLocaleString('ko-KR');}
function money(value){return value==null?'확인 필요':`${Math.round(Number(value)).toLocaleString('ko-KR')}원`;}
function referenceTime(value){
  if(!value)return '기준시각 확인 필요';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return '기준시각 확인 필요';
  return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date);
}
function todayKey(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}

function OperationSwitch({mode,onChange}){
  return <nav className="ipOperationSwitch" aria-label="재고 상품 운영 단계">
    <button type="button" aria-current={mode==='inventory'?'page':undefined} onClick={()=>onChange('inventory')}><i>01</i><span><strong>재고 운영</strong><small>판매 가능 수량과 입고 순서</small></span><HarinIcon name="inventory" size={21}/></button>
    <button type="button" aria-current={mode==='products'?'page':undefined} onClick={()=>onChange('products')}><i>02</i><span><strong>상품 운영</strong><small>채널 연결과 판매 판단</small></span><HarinIcon name="product" size={21}/></button>
  </nav>;
}

function InventoryHero({hero,rows}){
  const priority=rows.find(row=>row.id===hero.priorityId)||rows[0]||null;
  const markers=rows.filter(row=>row.daysOfStock!=null).slice(0,8);
  const maxDays=Math.max(60,...markers.map(row=>row.daysOfStock||0));
  return <section className="ipInventoryHero" aria-label="재고 보유 흐름 요약">
    <article className="ipPriorityStock" data-tone={priority?.holdingTone||'muted'}>
      <header><span>가장 먼저 볼 재고</span><i><HarinIcon name="inventory" size={22}/></i></header>
      <strong>{priority?.holdingLabel||'확인 필요'}</strong>
      <h2>{priority?.name||'수집된 판매 상품 없음'}</h2>
      <p>{priority?`${priority.actionLabel} · ${priority.nextAction}`:'쿠팡 로켓그로스 수집 상태를 먼저 확인해주세요.'}</p>
      <footer><span>주문 가능 {count(priority?.orderableQuantity)}개</span><span>30일 판매 {count(priority?.salesLast30Days)}개</span></footer>
    </article>
    <article className="ipHoldingFlow">
      <header><div><span>재고 보유일 흐름</span><h2>입고 순서가 한눈에 보여요</h2></div><small>판매 가능 재고 기준</small></header>
      <div className="ipFlowTrack" aria-label="상품별 재고 보유일">
        <span className="ipFlowLine" aria-hidden="true"/>
        {[7,14,30,60].map(day=><i className="ipFlowTick" style={{'--tick':`${Math.min(100,day/maxDays*100)}%`}} key={day}><b>{day}일</b></i>)}
        {markers.map((row,index)=>{const position=Math.min(98,Math.max(2,(row.daysOfStock||0)/maxDays*100));const edge=position>=82?'end':position<=12?'start':'middle';return <button type="button" className="ipFlowMarker" style={{'--marker':`${position}%`,'--marker-row':index%2}} data-tone={row.holdingTone} data-edge={edge} key={row.id} title={`${row.name} ${row.holdingLabel}`} aria-label={`${row.name} 재고 보유일 ${row.holdingLabel}`}><span aria-hidden="true">{row.markerLabel||'재'}</span><b>{row.holdingLabel}</b></button>;})}
        {!markers.length?<p>보유일 계산 근거가 아직 없어요.</p>:null}
      </div>
      <footer><span><i data-tone="danger"/>7일 미만 · 입고 우선</span><span><i data-tone="warning"/>14일 미만 · 점검</span><span><i data-tone="good"/>안정 재고</span><span><i data-tone="purple"/>장기 보유</span></footer>
    </article>
  </section>;
}

function ProductHero({hero}){
  const metrics=[
    {icon:'checklist',label:'판매 판단 준비',value:`${count(hero.readyCount)}개`,detail:'근거 네 개 통과',tone:'mint'},
    {icon:'link',label:'채널 연결',value:`${count(hero.channelLinkCount)}건`,detail:'3개 채널 별도 집계',tone:'blue'},
    {icon:'price',label:'원가 근거',value:`${count(hero.costReadyCount)}개`,detail:'0원 대신 실제 근거',tone:'apricot'},
    {icon:'product',label:'기준 상품',value:`${count(hero.itemCount)}개`,detail:'판매 가능 상품 기준',tone:'lavender'}
  ];
  return <section className="ipProductMetrics" aria-label="상품 운영 요약">{metrics.map((item,index)=><article data-tone={item.tone} className={index===0?'dominant':''} key={item.label}><i><HarinIcon name={item.icon} size={23}/></i><span><small>{item.label}</small><strong>{item.value}</strong><em>{item.detail}</em></span></article>)}</section>;
}

function ReadinessFlow({hero}){
  const steps=[
    {icon:'product',label:'기준 상품',value:`${count(hero.itemCount)}개`,detail:'판매 가능 원본'},
    {icon:'link',label:'채널 연결',value:`${count(hero.allConnectedCount)}개`,detail:'세 채널 모두 연결'},
    {icon:'price',label:'원가 신뢰',value:`${count(hero.costReadyCount)}개`,detail:'입력 근거 확보'},
    {icon:'shield',label:'판매 판단',value:`${count(hero.readyCount)}개`,detail:'판단 준비 완료'}
  ];
  return <section className="ipReadinessFlow"><header><div><span>PRODUCT READINESS</span><h2>판매 판단까지 네 개의 문을 통과해요</h2></div><small>모르는 비용은 0원으로 확정하지 않아요</small></header><div>{steps.map((step,index)=><article key={step.label}><i><HarinIcon name={step.icon} size={20}/></i><span><small>0{index+1} · {step.label}</small><strong>{step.value}</strong><em>{step.detail}</em></span>{index<steps.length-1?<b aria-hidden="true">→</b>:null}</article>)}</div></section>;
}

function InventoryRail({row,lotForm,setLotForm,onSaveLot,busy,message,onOpenLots}){
  if(!row)return <div className="ipRailEmpty"><HarinIcon name="inventory" size={24}/><strong>선택된 재고가 없어요.</strong><span>수집 상태를 확인한 뒤 판매 상품을 선택해주세요.</span></div>;
  const update=(field,value)=>setLotForm(current=>({...current,[field]:value}));
  return <div className="ipRailBody">
    <header className="ipRailHeader"><span>선택 재고</span><h2>{row.name}</h2><p>SKU {row.sku} · 쿠팡 로켓그로스</p></header>
    <div className="ipRailSignal" data-tone={row.holdingTone}><i><HarinIcon name="speed" size={21}/></i><span><small>판매 가능 보유일</small><strong>{row.holdingLabel}</strong></span><em>{row.actionLabel}</em></div>
    <dl className="ipRailFacts"><div><dt>주문 가능</dt><dd>{count(row.orderableQuantity)}개</dd></div><div><dt>30일 판매</dt><dd>{count(row.salesLast30Days)}개</dd></div><div><dt>다음 확인</dt><dd>{row.nextAction}</dd></div><div><dt>기준 시각</dt><dd>{referenceTime(row.snapshotAt)}</dd></div></dl>
    <section className="ipLotComposer"><header><div><span>입고 근거</span><h3>유통기한·LOT 기록</h3></div><button type="button" onClick={onOpenLots}>기록 보기</button></header><label><span>LOT 번호</span><input value={lotForm.lot_code} onChange={event=>update('lot_code',event.target.value)} placeholder="예: A-260829"/></label><div><label><span>유통기한</span><input type="date" value={lotForm.expires_on} onChange={event=>update('expires_on',event.target.value)}/></label><label><span>입고 수량</span><input type="number" min="0" step="1" value={lotForm.quantity} onChange={event=>update('quantity',event.target.value)} placeholder="실제 수량"/></label></div><label><span>메모</span><input value={lotForm.notes} onChange={event=>update('notes',event.target.value)} placeholder="보관 위치·확인 사항"/></label><button type="button" className="ipPrimaryAction" disabled={busy} onClick={onSaveLot}>{busy?'저장 중':'확인 후 LOT 저장'}</button><small>실제 저장 전 한 번 확인하고, 현재 판매 중인 SKU만 기록합니다.</small></section>
    {message?<p className="ipRailMessage">{message}</p>:null}
  </div>;
}

function ProductRail({row,router}){
  if(!row)return <div className="ipRailEmpty"><HarinIcon name="product" size={24}/><strong>선택된 상품이 없어요.</strong><span>판매 가능 기준 상품을 먼저 확인해주세요.</span></div>;
  return <div className="ipRailBody"><header className="ipRailHeader"><span>선택 상품</span><h2>{row.name}</h2><p>SKU {row.sku}</p></header><div className="ipProductJudgment" data-ready={row.judgment.status==='READY'}><i><HarinIcon name={row.judgment.status==='READY'?'shield':'warning'} size={22}/></i><span><small>판매 판단 상태</small><strong>{row.judgment.label}</strong><em>{row.judgment.reason}</em></span></div><section className="ipChannelEvidence"><h3>채널 연결 근거</h3>{['CAFE24','NAVER','COUPANG'].map(brand=>{const channel=row.channels[brand];return <article key={brand}><Phase28ChannelLogo brand={brand}/><span><strong>{CHANNEL_NAMES[brand]}</strong><small>{channel.detail}</small></span><em data-state={channel.state}>{channel.label}</em></article>;})}</section><dl className="ipRailFacts"><div><dt>원가 근거</dt><dd>{row.cost.status==='READY'?money(row.cost.total):'확인 필요'}</dd></div><div><dt>기준 판매가</dt><dd>{money(row.basePrice)}</dd></div><div><dt>다음 확인</dt><dd>{row.judgment.reason}</dd></div></dl><button type="button" className="ipPrimaryAction" onClick={()=>pushPhase28Route(router,row.cost.status!=='READY'?'/products/costs':'/products/mappings')}>{row.cost.status!=='READY'?'원가 근거 확인':'채널 연결 확인'}</button><small className="ipRailSafety">네이버·Cafe24·쿠팡 자료와 쓰기 경로는 각각 분리합니다.</small></div>;
}

function ProductMappingRail({mapping,platform,view,selectedIds,assignments}){
  const sourceCount=(view==='UNLINKED'?mapping.candidates:mapping.links).filter(item=>item.platform===platform).length;
  const readyCount=selectedIds.filter(id=>assignments[id]).length;
  return <div className="ipRailBody"><header className="ipRailHeader"><span>채널 연결 보조석</span><h2>{CHANNEL_NAMES[platform]} 상품 연결</h2><p>선택한 플랫폼의 실상품만 별도로 처리합니다.</p></header><div className="ipMappingRailChannel"><Phase28ChannelLogo brand={platform}/><span><small>현재 연결 채널</small><strong>{CHANNEL_NAMES[platform]}</strong></span><em>{view==='UNLINKED'?'미연결':'연결 완료'}</em></div><dl className="ipRailFacts"><div><dt>표시 상품</dt><dd>{count(sourceCount)}개</dd></div><div><dt>선택 상품</dt><dd>{count(selectedIds.length)}개</dd></div>{view==='UNLINKED'?<div><dt>연결 준비</dt><dd>{count(readyCount)}개</dd></div>:null}<div><dt>기준 상품</dt><dd>Cafe24 판매중 {count(mapping.masterProducts.length)}개</dd></div></dl><section className="ipMappingSafety"><span>CHANNEL SAFETY</span><h3>플랫폼끼리 섞지 않아요.</h3><p>네이버를 고르면 네이버 커머스 실상품만, 쿠팡을 고르면 쿠팡 판매상품만 목록과 저장 요청에 포함합니다.</p></section><small className="ipRailSafety">Cafe24 판매중 상품은 연결 기준으로만 사용하며 네이버·쿠팡 쓰기 경로는 각각 분리합니다.</small></div>;
}

function ProductMappingWorkspace({model}){
  const router=useRouter();
  const mapping=model.mapping||{masterProducts:[],candidates:[],links:[],summary:{}};
  const [platform,setPlatform]=useState('NAVER');
  const [view,setView]=useState('UNLINKED');
  const [query,setQuery]=useState('');
  const [visibleLimit,setVisibleLimit]=useState(model.visibleLimit||50);
  const [selectedIds,setSelectedIds]=useState([]);
  const [assignments,setAssignments]=useState({});
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const sourceRows=view==='UNLINKED'?mapping.candidates:mapping.links;
  const filteredRows=useMemo(()=>sourceRows.filter(item=>{
    if(item.platform!==platform)return false;
    if(!query)return true;
    const master=mapping.masterProducts.find(product=>product.id===item.masterProductId);
    return `${item.name} ${item.externalProductId} ${master?.name||''}`.toLowerCase().includes(query.toLowerCase());
  }),[sourceRows,platform,query,mapping.masterProducts]);
  const visibleRows=filteredRows.slice(0,visibleLimit);
  const selectedRows=visibleRows.filter(item=>selectedIds.includes(item.externalProductId));
  const readyAssignments=selectedRows.map(item=>({external_product_id:item.externalProductId,master_product_id:assignments[item.externalProductId]||item.suggestions?.[0]?.masterProductId||''})).filter(item=>item.master_product_id);
  function choosePlatform(next){setPlatform(next);setVisibleLimit(model.visibleLimit||50);setSelectedIds([]);setAssignments({});setMessage('');}
  function chooseView(next){setView(next);setVisibleLimit(model.visibleLimit||50);setSelectedIds([]);setAssignments({});setMessage('');}
  function toggle(id,checked){setSelectedIds(current=>{if(!checked)return current.filter(value=>value!==id);if(current.length>=100){setMessage('한 번에 최대 100개까지 연결할 수 있어요.');return current;}return [...new Set([...current,id])];});}
  function selectVisible(){const ids=visibleRows.slice(0,100).map(item=>item.externalProductId);setSelectedIds(ids);setMessage(visibleRows.length>100?'안전한 일괄 처리를 위해 앞에서 100개만 선택했어요.':'');}
  function fillSuggestions(){setAssignments(current=>{const next={...current};for(const item of selectedRows){const suggested=item.suggestions?.[0]?.masterProductId;if(suggested)next[item.externalProductId]=suggested;}return next;});}
  async function postMapping(payload,successLabel){setBusy(true);setMessage('채널별 연결 요청을 저장하고 있어요…');try{const response=await fetch('/api/products/mappings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'상품 연결 실패');const outcome=result.result||{};setSelectedIds([]);setAssignments({});setMessage(outcome.failed?`부분 완료 · ${count(outcome.processed)}개 처리, ${count(outcome.failed)}개 확인 필요`:`${successLabel} · ${count(outcome.processed)}개`);router.refresh();}catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setBusy(false);}}
  async function connectSelected(){if(!selectedRows.length)return;const missing=selectedRows.length-readyAssignments.length;if(missing){setMessage(`연결할 기준상품을 ${count(missing)}개 더 선택해주세요.`);return;}if(!window.confirm(`${CHANNEL_NAMES[platform]} 실상품 ${selectedRows.length}개를 지정한 Cafe24 기준상품에 연결할까요?`))return;await postMapping({action:'BULK_MANUAL_LINK',platform,assignments:readyAssignments},'상품 연결 완료');}
  async function unlinkSelected(){if(!selectedRows.length)return;if(!window.confirm(`${CHANNEL_NAMES[platform]} 연결 ${selectedRows.length}개를 해제할까요? 이력은 보존됩니다.`))return;await postMapping({action:'BULK_UNLINK',platform,external_product_ids:selectedRows.map(item=>item.externalProductId)},'연결 해제 완료');}
  return <Phase28RightRailLayout label="상품 연결 보조석" rail={<ProductMappingRail mapping={mapping} platform={platform} view={view} selectedIds={selectedIds} assignments={Object.fromEntries(selectedRows.map(item=>[item.externalProductId,assignments[item.externalProductId]||item.suggestions?.[0]?.masterProductId||'']))}/> }><><ProductHero hero={model.hero||{}}/><section className="ipMappingGuide"><div><span>CHANNEL PRODUCT MAPPING</span><h2>채널 상품을 골라 기준상품에 한 번에 연결해요</h2><p>선택한 플랫폼의 실상품만 표시하고, 행마다 연결할 Cafe24 기준상품을 지정합니다.</p></div><div className="ipPlatformSwitch" aria-label="연결할 채널 선택">{['NAVER','COUPANG'].map(brand=><button type="button" key={brand} aria-pressed={platform===brand} onClick={()=>choosePlatform(brand)}><Phase28ChannelLogo brand={brand}/><span><strong>{CHANNEL_NAMES[brand]}</strong><small>{brand==='NAVER'?'스마트스토어 실상품':'쿠팡 판매상품'}</small></span><em>{count((mapping.candidates||[]).filter(item=>item.platform===brand).length)}개 미연결</em></button>)}</div></section><section className="ipWorkbench"><header className="ipWorkbenchHead"><div><span>PLATFORM-SAFE WORKBENCH</span><h2>{CHANNEL_NAMES[platform]} 채널 상품</h2><p>선택한 플랫폼의 실상품만 표시하고 다른 채널 상품은 섞지 않아요.</p></div><span className="ipMappingChannelBadge"><Phase28ChannelLogo brand={platform} size="compact"/>{CHANNEL_NAMES[platform]} 전용</span></header><div className="ipUtility"><label><HarinIcon name="search" size={18}/><input value={query} onChange={event=>{setQuery(event.target.value);setVisibleLimit(model.visibleLimit||50);setSelectedIds([]);setAssignments({});}} placeholder="채널 상품명·상품 ID·기준상품 검색"/></label><span>Cafe24 판매중 기준상품 {count(mapping.masterProducts.length)}개</span></div><nav className="ipTabs" aria-label="상품 운영 보기">{PRODUCT_TABS.map(tab=><button type="button" aria-selected={(model.workspace||'catalog')===tab.id} key={tab.id} onClick={()=>pushPhase28Route(router,tab.href)}>{tab.label}</button>)}</nav><div className="ipMappingToolbar"><div>{[['UNLINKED','미연결 상품'],['LINKED','연결 완료']].map(([id,label])=><button type="button" key={id} className={view===id?'active':''} onClick={()=>chooseView(id)}>{label}</button>)}</div><span>{CHANNEL_NAMES[platform]} {visibleRows.length.toLocaleString('ko-KR')} / {filteredRows.length.toLocaleString('ko-KR')}개 표시</span></div><div className="ipMappingSelection"><label><input type="checkbox" checked={visibleRows.length>0&&selectedIds.length===Math.min(visibleRows.length,100)} onChange={event=>event.target.checked?selectVisible():setSelectedIds([])}/><span>현재 목록 선택</span></label><strong>{selectedIds.length}개 선택</strong>{view==='UNLINKED'?<><button type="button" onClick={fillSuggestions} disabled={!selectedIds.length}>추천값 채우기</button><button type="button" className="primary" onClick={connectSelected} disabled={busy||!selectedIds.length}>선택 {selectedIds.length}개 연결</button></>:<button type="button" className="danger" onClick={unlinkSelected} disabled={busy||!selectedIds.length}>선택 {selectedIds.length}개 연결 해제</button>}</div><div className="ipMappingBoundary"><div className="ipMappingColumns"><span>선택</span><span>{CHANNEL_NAMES[platform]} 상품</span><span>{view==='UNLINKED'?'연결할 기준상품':'연결된 기준상품'}</span><span>연결 근거</span></div><div className="ipRows">{visibleRows.map(item=>{const suggested=item.suggestions?.[0];const selectedMasterId=assignments[item.externalProductId]||suggested?.masterProductId||item.masterProductId||'';const linkedMaster=mapping.masterProducts.find(product=>product.id===item.masterProductId);return <article className="ipMappingRow" data-selected={selectedIds.includes(item.externalProductId)} key={`${item.platform}-${item.externalProductId}`}><input type="checkbox" aria-label={`${item.name} 선택`} checked={selectedIds.includes(item.externalProductId)} onChange={event=>toggle(item.externalProductId,event.target.checked)}/><span className="ipMappingProduct"><Phase28ChannelLogo brand={platform}/><span><strong>{item.name}</strong><small>상품 ID {item.externalProductId} · {money(item.price)}</small></span></span>{view==='UNLINKED'?<label className="ipMasterSelect"><span className="srOnly">연결할 기준상품</span><select value={selectedMasterId} onChange={event=>setAssignments(current=>({...current,[item.externalProductId]:event.target.value}))}><option value="">기준상품 선택</option>{mapping.masterProducts.map(product=><option value={product.id} key={product.id}>{product.name} · {money(product.price)}</option>)}</select></label>:<span className="ipLinkedMaster"><strong>{linkedMaster?.name||'기준상품 확인 필요'}</strong><small>{item.method==='AUTO'?'자동 연결':'수동 연결'}</small></span>}<span className="ipMappingReason">{view==='UNLINKED'?(suggested?<><strong>추천 {count(suggested.confidence??Math.round((suggested.score||0)*100))}%</strong><small>{suggested.reasons?.join(' · ')||'상품명·규격 비교'}</small></>:<><strong>직접 선택 필요</strong><small>확정할 추천 근거가 부족해요.</small></>):<><strong>{item.confidence==null?'확인 필요':`일치도 ${Math.round(Number(item.confidence)*100)}%`}</strong><small>변경 이력 보존</small></>}</span></article>;})}{!visibleRows.length?<div className="ipEmpty"><HarinIcon name="link" size={24}/><strong>{view==='UNLINKED'?`${CHANNEL_NAMES[platform]} 미연결 상품이 없어요.`:`${CHANNEL_NAMES[platform]} 연결 기록이 없어요.`}</strong><span>선택한 플랫폼의 최신 상품 수집 결과만 표시합니다.</span></div>:null}</div>{visibleRows.length<filteredRows.length?<button type="button" className="ipMappingMore" onClick={()=>setVisibleLimit(current=>current+(model.visibleLimit||50))}>상품 {Math.min(model.visibleLimit||50,filteredRows.length-visibleRows.length)}개 더 보기</button>:null}</div>{message?<p className="ipWorkbenchMessage" role="status">{message}</p>:null}<footer className="ipWorkbenchFoot"><div className="ipWorkbenchFootStatus"><i className="ipWorkbenchFootIcon"><HarinIcon name="link" size={19}/></i><span><small>채널 분리</small><strong>{CHANNEL_NAMES[platform]} 실상품만 선택·저장</strong></span></div><div className="ipWorkbenchFootSource"><i className="ipWorkbenchFootIcon"><HarinIcon name="database" size={19}/></i><span><small>연결 기준</small><strong>Cafe24 판매중 기준상품</strong></span></div></footer></section></></Phase28RightRailLayout>;
}

function InventoryWorkspace({model}){
  const router=useRouter();
  const rows=model.rows||[];
  const [activeTab,setActiveTab]=useState('SELLING');
  const [filter,setFilter]=useState('ALL');
  const [query,setQuery]=useState('');
  const [selectedId,setSelectedId]=useState(rows[0]?.id||'');
  const [selectedIds,setSelectedIds]=useState([]);
  const [busy,setBusy]=useState('');
  const [message,setMessage]=useState('');
  const [lotForm,setLotForm]=useState({lot_code:'',received_on:todayKey(),manufactured_on:'',expires_on:'',quantity:'',notes:''});
  useEffect(()=>{if(rows.length&&!rows.some(row=>row.id===selectedId))setSelectedId(rows[0].id);},[rows,selectedId]);
  const selectedRow=rows.find(row=>row.id===selectedId)||rows[0]||null;
  const visibleRows=useMemo(()=>rows.filter(row=>{
    const text=`${row.name} ${row.sku} ${row.vendorItemId}`.toLowerCase();
    if(query&&!text.includes(query.toLowerCase()))return false;
    if(filter==='UNDER7'&&!(row.daysOfStock!=null&&row.daysOfStock<7))return false;
    if(filter==='UNDER14'&&!(row.daysOfStock!=null&&row.daysOfStock<14))return false;
    if(filter==='LONG'&&!(row.daysOfStock!=null&&row.daysOfStock>60))return false;
    if(filter==='CHECK'&&row.daysOfStock!=null)return false;
    if(activeTab==='RESTOCK'&&!(row.daysOfStock!=null&&row.daysOfStock<14))return false;
    if(activeTab==='INBOUND'&&!['URGENT','WATCH'].includes(row.holdingStatus))return false;
    return true;
  }),[rows,query,filter,activeTab]);
  function toggleRow(id,checked){setSelectedIds(current=>checked?[...new Set([...current,id])]:current.filter(value=>value!==id));}
  async function syncInventory(){setBusy('sync');setMessage('서울 고정 IP 수집을 요청하고 있어요…');try{const response=await fetch('/api/coupang/rg-inventory/sync',{method:'POST'});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'재고 수집 요청 실패');setMessage('재고 수집을 요청했습니다. 완료 뒤 화면을 새로 확인합니다.');window.setTimeout(()=>router.refresh(),1200);}catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setBusy('');}}
  async function saveLot(){if(!selectedRow)return;const payload={...lotForm,vendor_item_id:selectedRow.vendorItemId,status:'ACTIVE'};if(!window.confirm(`${selectedRow.name}의 LOT ${lotForm.lot_code||'(미입력)'} · 유통기한 ${lotForm.expires_on||'(미입력)'}을 저장할까요?`))return;setBusy('lot');setMessage('LOT 근거를 저장하고 있어요…');try{const response=await fetch('/api/inventory/lots',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'LOT 저장 실패');setMessage(result.message||'LOT를 저장했습니다.');setLotForm({lot_code:'',received_on:todayKey(),manufactured_on:'',expires_on:'',quantity:'',notes:''});router.refresh();}catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setBusy('');}}
  return <Phase28RightRailLayout label="재고 보조석" rail={<InventoryRail row={selectedRow} lotForm={lotForm} setLotForm={setLotForm} onSaveLot={saveLot} busy={busy==='lot'} message={message} onOpenLots={()=>setActiveTab('LOTS')}/> }><>
    <InventoryHero hero={model.hero||{}} rows={rows}/>
    <section className="ipHoldingRail"><header><div><span>HOLDING DAY RAIL</span><h2>재고 보유일 레일</h2></div><button type="button" onClick={syncInventory} disabled={busy==='sync'}><HarinIcon name="sync" size={17}/>{busy==='sync'?'수집 요청 중':'수집 상태 확인'}</button></header><div>{rows.slice(0,12).map(row=><button type="button" key={row.id} data-tone={row.holdingTone} aria-pressed={selectedId===row.id} onClick={()=>setSelectedId(row.id)}><span>{row.name}</span><strong>{row.holdingLabel}</strong><i style={{'--holding-width':row.daysOfStock==null?'8%':`${Math.min(100,Math.max(4,row.daysOfStock/90*100))}%`}}/></button>)}</div></section>
    <section className="ipWorkbench"><header className="ipWorkbenchHead"><div><span>ROCKET GROWTH INVENTORY</span><h2>판매 상품</h2><p>판매 가능 SKU만 보며 쿠팡 재고에는 직접 쓰지 않아요.</p></div><span className="ipAiState"><HarinIcon name="ai" size={17}/>AI 비활성 · 비용 0원</span></header><div className="ipUtility"><label><HarinIcon name="search" size={18}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="상품명·SKU 검색"/></label><span>{referenceTime(model.collection?.at||model.hero?.asOf)} 기준</span></div><nav className="ipTabs" aria-label="재고 운영 보기">{INVENTORY_TABS.map(tab=><button type="button" aria-selected={activeTab===tab.id} key={tab.id} onClick={()=>setActiveTab(tab.id)}>{tab.label}</button>)}</nav><div className="ipFilters">{[['ALL','전체'],['UNDER7','7일 미만'],['UNDER14','14일 미만'],['LONG','장기 보유'],['CHECK','수집 확인']].map(([id,label])=><button type="button" className={filter===id?'active':''} key={id} onClick={()=>setFilter(id)}>{label}</button>)}<span>현재 {visibleRows.length.toLocaleString('ko-KR')}개 표시</span></div>
    {activeTab==='LOTS'?<LotTable rows={rows}/>:activeTab==='HISTORY'?<HistoryTable rows={rows}/>:<div className="ipTableBoundary"><div className="ipInventoryColumns"><span>선택</span><span>상품·SKU</span><span>재고 흐름</span><span>주문 가능</span><span>30일 판매</span><span>보유일</span><span/></div><div className="ipRows">{visibleRows.map(row=><article className="ipInventoryRow" data-selected={selectedId===row.id} key={row.id} onClick={()=>setSelectedId(row.id)}><input type="checkbox" aria-label={`${row.name} 선택`} checked={selectedIds.includes(row.id)} onChange={event=>toggleRow(row.id,event.target.checked)} onClick={event=>event.stopPropagation()}/><span className="ipProductMark" data-tone={row.holdingTone}><HarinIcon name="product" size={22}/></span><div className="ipProductIdentity"><strong>{row.name}</strong><small>SKU {row.sku} · 판매 가능</small></div><div className="ipStockAction"><span>{row.actionLabel}</span><small>{row.nextAction}</small></div><strong className="ipMetric">{count(row.orderableQuantity)}개</strong><strong className="ipMetric">{count(row.salesLast30Days)}개</strong><em className="ipHoldingBadge" data-tone={row.holdingTone}>{row.holdingLabel}</em><button type="button" aria-label={`${row.name} 상세 보기`}><HarinIcon name="chevron" size={18}/></button></article>)}{!visibleRows.length?<div className="ipEmpty"><HarinIcon name="filter" size={24}/><strong>이 조건에 해당하는 판매 상품이 없어요.</strong><span>필터를 바꾸거나 재고 수집 상태를 확인해주세요.</span></div>:null}</div></div>}
    {message?<p className="ipWorkbenchMessage">{message}</p>:null}<footer className="ipWorkbenchFoot"><div className="ipWorkbenchFootStatus"><i className="ipWorkbenchFootIcon"><HarinIcon name={selectedIds.length?'checklist':'product'} size={19}/></i><span><small>선택 상태</small><strong>{selectedIds.length?`${selectedIds.length}개 선택 · 조회 전용`:'선택된 상품 없음'}</strong></span></div><div className="ipWorkbenchFootSource"><i className="ipWorkbenchFootIcon"><HarinIcon name="database" size={19}/></i><span><small>자료 기준</small><strong>쿠팡 로켓그로스 API 저장 스냅샷</strong></span></div></footer></section>
  </></Phase28RightRailLayout>;
}

function LotTable({rows}){
  const lots=rows.flatMap(row=>row.lots.map(lot=>({...lot,productName:row.name,sku:row.sku})));
  return <div className="ipSimpleList">{lots.length?lots.map(lot=><article key={`${lot.productName}-${lot.lotCode}`}><i><HarinIcon name="clock" size={20}/></i><span><strong>{lot.productName}</strong><small>SKU {lot.sku} · LOT {lot.lotCode}</small></span><span><small>유통기한</small><strong>{lot.expiresOn||'확인 필요'}</strong></span><span><small>기록 수량</small><strong>{count(lot.quantity)}개</strong></span><em>{lot.status==='ACTIVE'?'사용 중':'기록 완료'}</em></article>):<div className="ipEmpty"><HarinIcon name="clock" size={24}/><strong>기록된 유통기한·LOT가 없어요.</strong><span>오른쪽 보조석에서 실제 입고 근거를 기록할 수 있어요.</span></div>}</div>;
}

function HistoryTable({rows}){
  return <div className="ipSimpleList">{rows.length?rows.slice().sort((a,b)=>String(b.snapshotAt||'').localeCompare(String(a.snapshotAt||''))).map(row=><article key={row.id}><i><HarinIcon name="database" size={20}/></i><span><strong>{row.name}</strong><small>SKU {row.sku}</small></span><span><small>수집 시각</small><strong>{referenceTime(row.snapshotAt)}</strong></span><span><small>상태</small><strong>{row.actionLabel}</strong></span><em>조회 전용</em></article>):<div className="ipEmpty"><HarinIcon name="database" size={24}/><strong>재고 수집 기록이 없어요.</strong><span>최초 수집이 끝나면 SKU별 기준 시각이 표시됩니다.</span></div>}</div>;
}

function ProductCatalogWorkspace({model}){
  const router=useRouter();
  const rows=model.rows||[];
  const [query,setQuery]=useState('');
  const [filter,setFilter]=useState('ALL');
  const [selectedId,setSelectedId]=useState(rows[0]?.id||'');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  useEffect(()=>{if(rows.length&&!rows.some(row=>row.id===selectedId))setSelectedId(rows[0].id);},[rows,selectedId]);
  const selectedRow=rows.find(row=>row.id===selectedId)||rows[0]||null;
  const visibleRows=useMemo(()=>rows.filter(row=>{const haystack=`${row.name} ${row.sku}`.toLowerCase();if(query&&!haystack.includes(query.toLowerCase()))return false;if(filter==='ACTION'&&!row.actionRequired)return false;if(filter==='STOCK'&&row.channels.COUPANG.inventory!==0&&row.channels.COUPANG.state!=='OUT_OF_STOCK')return false;if(filter==='PRICE'&&row.priceGapRate==null)return false;if(filter==='MISSING'&&row.connectedChannels===3)return false;return true;}),[rows,query,filter]);
  async function rebuildCatalog(){if(!window.confirm('Cafe24 판매 상태를 다시 확인하고 기준 상품 분류를 갱신할까요?'))return;setBusy(true);setMessage('Cafe24 판매 상태를 다시 분류하고 있어요…');try{const response=await fetch('/api/products/bootstrap',{method:'POST'});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'상품 상태 갱신 실패');setMessage(`완료 · 판매중 ${count(result.selling)} · 품절 ${count(result.out_of_stock)} · 판매중단 ${count(result.stopped)}`);router.refresh();}catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setBusy(false);}}
  return <Phase28RightRailLayout label="상품 판단 보조석" rail={<ProductRail row={selectedRow} router={router}/> }><><ProductHero hero={model.hero||{}}/><ReadinessFlow hero={model.hero||{}}/><section className="ipWorkbench"><header className="ipWorkbenchHead"><div><span>MASTER PRODUCT WORKBENCH</span><h2>기준 상품</h2><p>채널 실상품과 원가 근거를 나란히 보고 판매 판단 순서를 정해요.</p></div><button type="button" className="ipRefreshAction" disabled={busy} onClick={rebuildCatalog}><HarinIcon name="sync" size={17}/>{busy?'상태 확인 중':'Cafe24 상태 다시 보기'}</button></header><div className="ipUtility"><label><HarinIcon name="search" size={18}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="기준 상품명·SKU 검색"/></label><span>{referenceTime(model.hero?.asOf)} 기준</span></div><nav className="ipTabs" aria-label="상품 운영 보기">{PRODUCT_TABS.map(tab=><button type="button" aria-selected={(model.workspace||'catalog')===tab.id} key={tab.id} onClick={()=>pushPhase28Route(router,tab.href)}>{tab.label}</button>)}</nav><div className="ipFilters">{[['ALL','전체'],['ACTION','조치 필요'],['STOCK','재고 확인'],['PRICE','가격 확인'],['MISSING','연결 누락']].map(([id,label])=><button type="button" className={filter===id?'active':''} key={id} onClick={()=>setFilter(id)}>{label}</button>)}<span>현재 {visibleRows.length.toLocaleString('ko-KR')}개 표시</span></div><div className="ipTableBoundary"><div className="ipProductColumns"><span>기준 상품</span><span>채널 연결</span><span>원가 근거</span><span>판매 판단</span><span/></div><div className="ipRows">{visibleRows.map(row=><article className="ipProductRow" data-selected={selectedId===row.id} key={row.id} onClick={()=>setSelectedId(row.id)}><span className="ipProductMark" data-tone={row.judgment.status==='READY'?'good':'warning'}><HarinIcon name="product" size={22}/></span><div className="ipProductIdentity"><strong>{row.name}</strong><small>SKU {row.sku} · 기준 판매가 {money(row.basePrice)}</small></div><div className="ipRowChannels">{['CAFE24','NAVER','COUPANG'].map(brand=><span key={brand} data-state={row.channels[brand].state}><Phase28ChannelLogo brand={brand} size="compact"/><b>{row.channels[brand].label}</b></span>)}</div><div className="ipCostEvidence"><strong>{row.cost.status==='READY'?money(row.cost.total):'확인 필요'}</strong><small>{row.cost.status==='READY'?'상품·포장·기타 단위비':'모르는 비용을 0원 처리하지 않음'}</small></div><div className="ipJudgment"><em data-ready={row.judgment.status==='READY'}>{row.judgment.label}</em><small>{row.judgment.reason}</small></div><button type="button" aria-label={`${row.name} 상세 보기`}><HarinIcon name="chevron" size={18}/></button></article>)}{!visibleRows.length?<div className="ipEmpty"><HarinIcon name="filter" size={24}/><strong>이 조건에 해당하는 기준 상품이 없어요.</strong><span>필터를 바꾸거나 Cafe24 판매 상태를 다시 확인해주세요.</span></div>:null}</div></div>{message?<p className="ipWorkbenchMessage">{message}</p>:null}<footer className="ipWorkbenchFoot"><span>원가 반영률 95% 미만은 판매 판단 보류</span><small>채널별 연결과 쓰기 경로 분리</small></footer></section></></Phase28RightRailLayout>;
}

function ProductsWorkspace({model}){
  return model.workspace==='mappings'?<ProductMappingWorkspace model={model}/>:<ProductCatalogWorkspace model={model}/>;
}

export default function Phase28InventoryProductsPage({mode='inventory',model={}}){
  const router=useRouter();
  const inventory=mode==='inventory';
  const hero=model.hero||{};
  return <section className="p28InventoryProducts" data-phase28-root="true" data-phase28-page={mode}>
    <div className="ipIntro"><Phase28PageHeading context={inventory?'쿠팡 로켓그로스 조회 전용 · 판매 가능 재고 기준':'기준 상품 · 채널 연결과 원가 근거 함께 표시'} title={inventory?'오늘 살펴볼 재고 항목은 ':'확인할 상품 작업은 '} accent={`${count(inventory?hero.itemCount:hero.actionCount)}건`} suffix="이에요." summary={hero.summary||(inventory?'판매 흐름과 주문 가능 재고를 함께 보고, 입고가 필요한 순서만 빠르게 정리합니다.':'기준 상품부터 채널 연결, 원가 신뢰, 판매 판단까지 한 흐름으로 확인합니다.')}/><div className="ipSnapshot"><i><HarinIcon name={inventory?'inventory':'product'} size={22}/></i><span><small>{inventory?'재고 기준 시각':'상품 기준 시각'}</small><strong>{referenceTime(hero.asOf)}</strong></span></div></div>
    <OperationSwitch mode={mode} onChange={target=>pushPhase28Route(router,target==='inventory'?'/inventory':'/products/catalog')}/>
    {inventory?<InventoryWorkspace model={model}/>:<ProductsWorkspace model={model}/>}
  </section>;
}
