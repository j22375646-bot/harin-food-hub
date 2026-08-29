'use client';

import {useEffect,useMemo,useState} from 'react';
import {useRouter} from 'next/navigation';
import {HarinIcon} from '../../_design-system/harin-icon.js';
import {Phase28ChannelLogo} from '../primitives/channel-logo.js';
import {Phase28PageHeading} from '../primitives/page-heading.js';
import {Phase28RightRailLayout} from '../primitives/right-rail-layout.js';
import './cs-page.css';

const CHANNEL_NAMES={NAVER:'네이버',CAFE24:'Cafe24',COUPANG:'쿠팡',ALL:'채널 확인 필요'};
const KIND_NAMES={INQUIRY:'문의',CANCEL:'취소',RETURN:'반품',EXCHANGE:'교환'};
const STAGES=[
  {id:'ACTIVE',label:'새 문의',description:'오래 기다린 문의부터 답변을 준비하세요.',action:'문의 답변 열기'},
  {id:'DRAFTS',label:'답변 준비',description:'작성 중인 답변을 확인하고 다음 처리를 이어가세요.',action:'답변 이어쓰기'},
  {id:'CLAIMS',label:'반품·교환',description:'주문과 회수 상태를 확인하고 처리 방향을 정하세요.',action:'클레임 확인'},
  {id:'HISTORY',label:'최근 완료',description:'최근에 완료된 처리 기록을 확인하세요.',action:'완료 기록 보기'}
];
const COURIERS=[['EPOST','우체국택배'],['CJGLS','CJ대한통운'],['HANJIN','한진택배'],['LOTTE','롯데택배'],['LOGEN','로젠택배']];

const count=value=>Number(value||0).toLocaleString('ko-KR');
const dateMs=value=>{const valueMs=new Date(value||0).getTime();return Number.isFinite(valueMs)?valueMs:0;};
const safeText=value=>value==null?'':String(value);

function referenceTime(value){
  if(!value)return '수집 시각 확인 필요';
  try{return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit'}).format(new Date(value));}
  catch{return '수집 시각 확인 필요';}
}

function dateTime(value){
  if(!value)return '접수 시각 확인 필요';
  try{return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));}
  catch{return '접수 시각 확인 필요';}
}

function waitMinutes(row,asOf){
  const start=dateMs(row?.occurredAt);
  const end=dateMs(asOf)||Date.now();
  if(start)return Math.max(0,Math.floor((end-start)/60000));
  if(Number.isFinite(Number(row?.due?.ageHours)))return Math.max(0,Math.floor(Number(row.due.ageHours)*60));
  return null;
}

function waitLabel(minutes){
  if(minutes==null)return '확인 필요';
  if(minutes<60)return `${minutes}분`;
  const hours=Math.floor(minutes/60);
  return `${hours}시간${minutes%60?` ${minutes%60}분`:''}`;
}

function dueTone(row,minutes){
  if(row?.due?.code==='OVERDUE'||(minutes!=null&&minutes>=30))return 'urgent';
  if(row?.kind!=='INQUIRY'||(minutes!=null&&minutes>=15))return 'watch';
  return 'calm';
}

function kindIcon(kind){
  if(kind==='INQUIRY')return 'customer';
  if(kind==='CANCEL'||kind==='RETURN'||kind==='EXCHANGE')return 'sync';
  return 'note';
}

function orderProduct(row){
  const product=row?.order?.products?.[0];
  if(!product)return row?.productId?'상품 연결 확인 필요':'상품 정보 확인 필요';
  return `${product.name}${product.option?` · ${product.option}`:''}${product.quantity?` · ${count(product.quantity)}개`:''}`;
}

async function fixedIpResult(response){
  const initial=await response.json();
  if(response.status!==202||!initial.request?.id)return initial;
  for(let attempt=0;attempt<90;attempt+=1){
    await new Promise(resolve=>window.setTimeout(resolve,750));
    const statusResponse=await fetch(`/api/coupang/operations/${initial.request.id}`,{cache:'no-store'});
    const result=await statusResponse.json();
    if(statusResponse.status===202)continue;
    return result;
  }
  return {ok:false,error:'서울 고정 IP 서버의 응답 시간이 초과됐습니다. 처리기록에서 상태를 확인해주세요.'};
}

function CustomerAvatar({row,size='standard'}){
  const label=CHANNEL_NAMES[row?.platform]||'채널';
  return <span className={`csCustomerAvatar ${size==='large'?'large':''}`} data-brand={safeText(row?.platform).toLowerCase()} aria-hidden="true">
    <b>{row?.platform==='CAFE24'?'24':label.slice(0,1)}</b>
    {size!=='large'?<i><Phase28ChannelLogo brand={row?.platform} size="compact"/></i>:null}
  </span>;
}

function FreshnessDock({channels,asOf,syncing,onSync}){
  const ready=channels.filter(item=>['READY','RUNNING'].includes(safeText(item.status).toUpperCase())).length;
  return <div className="csFreshnessDock" aria-live="polite">
    <span className="liveDot" aria-hidden="true"/><strong>문의 {ready}/{channels.length||3} 채널 최신</strong>
    <div className="csChannelChips" aria-label="채널별 문의 수집 상태">{['NAVER','CAFE24','COUPANG'].map(brand=>{const channel=channels.find(item=>safeText(item.platform).toUpperCase()===brand);return <span key={brand}><Phase28ChannelLogo brand={brand} size="compact"/><b>{CHANNEL_NAMES[brand]}</b><small>{channel?.statusLabel||referenceTime(asOf)}</small></span>;})}</div>
    <button type="button" className={syncing?'isSyncing':''} onClick={onSync} disabled={syncing}><HarinIcon name="sync" size={17}/>{syncing?'수집 중':'문의 새로 수집'}</button>
  </div>;
}

function ResponseLane({rows,selectedId,asOf,onSelect}){
  const laneRows=rows.filter(row=>!row.completed).slice().sort((a,b)=>(waitMinutes(b,asOf)||0)-(waitMinutes(a,asOf)||0)).slice(0,3);
  const oldest=laneRows.length?waitMinutes(laneRows[0],asOf):null;
  return <section className="csResponseLane" aria-label="30분 응대 시간선">
    <header><div><strong>30분 응대 레인</strong><span>기다린 시간 순서로 바로 이동해요.</span></div><b>가장 오래된 문의 <em>{waitLabel(oldest)}</em></b></header>
    {laneRows.length?<><div className="csLaneScale" aria-hidden="true"><span>접수</span><span>15분 확인</span><span>30분 목표</span></div><div className="csLaneTrack">{laneRows.map(row=>{const minutes=waitMinutes(row,asOf);const position=Math.min(92,Math.max(5,((minutes||0)/30)*100));return <button key={row.id} type="button" style={{'--lane-position':`${position}%`}} aria-pressed={selectedId===row.id} onClick={()=>onSelect(row)}><CustomerAvatar row={row}/><span><strong>{waitLabel(minutes)}</strong><small>{row.kindLabel||KIND_NAMES[row.kind]}</small></span></button>;})}</div></>:<p className="csLaneEmpty">응대 대기 중인 문의가 없습니다.</p>}
  </section>;
}

function CsThread({row,asOf,selected,checked,onOpen,onCheck,onCompose}){
  const minutes=waitMinutes(row,asOf);
  const tone=dueTone(row,minutes);
  const linked=row.order||null;
  return <article className={`csThread${selected?' selected':''}${checked?' checked':''}`} tabIndex="0" onClick={event=>{if(!event.target.closest('input,button,select,textarea'))onOpen(row);}} onKeyDown={event=>{if((event.key==='Enter'||event.key===' ')&&!event.target.closest('input,button')){event.preventDefault();onOpen(row);}}}>
    <input type="checkbox" checked={checked} onChange={event=>onCheck(row,event.target.checked)} aria-label={`${row.title} 선택`}/>
    <CustomerAvatar row={row}/>
    <button className="csThreadMain" type="button" onClick={()=>onOpen(row)} aria-expanded={selected}><span><b data-kind={row.kind}><i><HarinIcon name={kindIcon(row.kind)} size={13}/></i>{row.kindLabel||KIND_NAMES[row.kind]}</b><time>{dateTime(row.occurredAt)}</time></span><strong>{row.title}</strong><small>{CHANNEL_NAMES[row.platform]} · 접수 {row.sourceId||'번호 확인 필요'}</small></button>
    <div className="csThreadContext"><span>{row.orderId?`주문 ${row.orderId}`:'주문 전 문의'}</span><strong>{linked?`${linked.status||'상태 확인 필요'} · ${orderProduct(row)}`:'주문 상세 연결 대기'}</strong></div>
    <time className={`csThreadWait ${tone}`}>{waitLabel(minutes)}<small>{tone==='urgent'?'먼저':tone==='watch'?'확인':'보통'}</small></time>
    <span className="csStatusBadge" data-tone={tone}>{row.completed?'처리 완료':row.due?.label||'답변 대기'}</span>
    <button className="csRowAction" type="button" onClick={()=>onCompose(row)}>{row.kind==='INQUIRY'?'답변 작성':'내용 확인'}</button>
    <div className="csThreadPreview"><div className="csThreadFacts"><span>{row.orderId?'주문 연결':'주문 전'}</span><span>{row.due?.label||'기한 확인'}</span><span>{row.audit?'처리기록 있음':'처리기록 없음'}</span></div><p>{row.content}</p><span>{linked?`연결 주문 ${linked.orderId} · ${linked.status}`:'주문 상세는 채널 원본에서 확인이 필요해요.'}</span><button type="button" onClick={()=>onCompose(row)}>{row.kind==='INQUIRY'?'답변 준비':'처리 작업 열기'}</button></div>
  </article>;
}

function ClaimActions({row,busy,onRun}){
  const [courier,setCourier]=useState('EPOST');
  const [invoice,setInvoice]=useState('');
  const [rejectCode,setRejectCode]=useState('SOLDOUT');
  if(row.platform!=='COUPANG')return <p className="railSafety">{CHANNEL_NAMES[row.platform]} 클레임은 원본 판매자센터에서 최종 처리하세요. 직접 전송은 잠겨 있어요.</p>;
  const source=row.source||{};
  const pickupAction=row.kind==='EXCHANGE'?'EXCHANGE_PICKUP_INVOICE':'RETURN_PICKUP_INVOICE';
  const actions=[];
  if(source.canReceive)actions.push(<button key="receive" type="button" onClick={()=>onRun(row,row.kind==='EXCHANGE'?'EXCHANGE_RECEIVE':'RETURN_RECEIVE',{})} disabled={busy}>입고 확인</button>);
  if(source.canApprove)actions.push(<button key="approve" className="danger" type="button" onClick={()=>onRun(row,'RETURN_APPROVE',{})} disabled={busy}>반품 승인·환불</button>);
  if(source.canReject)actions.push(<button key="reject" className="danger" type="button" onClick={()=>onRun(row,'EXCHANGE_REJECT',{exchangeRejectCode:rejectCode})} disabled={busy}>교환 거부</button>);
  return <div className="claimActions">
    {actions.length?<div className="claimButtonRow">{source.canReject?<select value={rejectCode} onChange={event=>setRejectCode(event.target.value)} aria-label="교환 거부 사유"><option value="SOLDOUT">교환상품 품절</option><option value="WITHDRAW">고객 철회</option></select>:null}{actions}</div>:null}
    {(source.canPickupInvoice||source.canShippingInvoice)?<div className="claimInvoice"><select value={courier} onChange={event=>setCourier(event.target.value)} aria-label="택배사">{COURIERS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><input inputMode="numeric" value={invoice} onChange={event=>setInvoice(event.target.value.replace(/\D/g,''))} placeholder="송장번호" aria-label="송장번호"/>{source.canPickupInvoice?<button type="button" disabled={busy||invoice.length<6} onClick={()=>onRun(row,pickupAction,{deliveryCompanyCode:courier,invoiceNumber:invoice})}>회수송장 등록</button>:null}{source.canShippingInvoice?<button type="button" disabled={busy||invoice.length<6} onClick={()=>onRun(row,'EXCHANGE_SHIPPING_INVOICE',{deliveryCompanyCode:courier,invoiceNumber:invoice})}>교환 출고송장</button>:null}</div>:null}
    {!actions.length&&!source.canPickupInvoice&&!source.canShippingInvoice?<p className="railSafety">현재 상태에서 허용된 직접 처리 작업이 없습니다. 채널 상태를 다시 수집해 확인하세요.</p>:null}
  </div>;
}

function CsRail({row,asOf,activeTab,setActiveTab,draft,setDraft,templates,replyBy,setReplyBy,busy,onReply,onCopy,onClaim}){
  const tabs=[['message','문의 내용'],['compose','답변 작성'],['order','주문 정보']];
  const minutes=row?waitMinutes(row,asOf):null;
  return <div className="csRailBody">
    <div className="csRailTabs" role="tablist" aria-label="고객 CS 보조 작업">{tabs.map(([id,label])=><button key={id} id={`phase28-cs-tab-${id}`} type="button" role="tab" aria-selected={activeTab===id} aria-controls={`phase28-cs-panel-${id}`} tabIndex={activeTab===id?0:-1} onClick={()=>setActiveTab(id)}>{label}</button>)}</div>
    <div className="railPanels">
      <section id="phase28-cs-panel-message" role="tabpanel" aria-labelledby="phase28-cs-tab-message" data-active={activeTab==='message'} aria-hidden={activeTab!=='message'} inert={activeTab==='message'?undefined:true}>{row?<><header className="csCustomerSignature"><CustomerAvatar row={row} size="large"/><div><span>{CHANNEL_NAMES[row.platform]} · {row.kindLabel}</span><h3>{row.title}</h3><p>{dateTime(row.occurredAt)} · {minutes==null?'대기시간 확인 필요':`${waitLabel(minutes)} 전`}</p></div></header><blockquote>{row.content}</blockquote><div className="csContextFacts"><div><span>관련 상품</span><strong>{orderProduct(row)}</strong></div><div><span>확인할 기준</span><strong>{row.order?'주문·배송 상태와 채널 처리 기록':'상품 정보와 채널 답변 기준'}</strong></div></div><div className={`csNextAction ${dueTone(row,minutes)}`}><span>지금 먼저 할 일</span><strong>{row.kind==='INQUIRY'?'문의 내용에 맞는 답변 확인':'주문과 클레임 상태 대조'}</strong><small>{row.due?.label||'기한 확인 필요'}</small></div><button className="railPrimary" type="button" onClick={()=>setActiveTab(row.kind==='INQUIRY'?'compose':'order')}>{row.kind==='INQUIRY'?'이 문의 답변 작성하기':'클레임 처리 열기'}</button></>:<p className="railEmpty">현재 단계에 표시할 문의가 없어요.</p>}</section>
      <section id="phase28-cs-panel-compose" role="tabpanel" aria-labelledby="phase28-cs-tab-compose" data-active={activeTab==='compose'} aria-hidden={activeTab!=='compose'} inert={activeTab==='compose'?undefined:true}><header><span>페이지별 AI · 고객 CS</span><h3>답변 초안을 확인하세요</h3><p>현재 문의와 주문 정보만 참고해 직접 작성합니다.</p></header>{row?.kind==='INQUIRY'?<><label className="draftTemplate"><span>답변 양식</span><select value="" onChange={event=>{const template=templates.find(item=>item.id===event.target.value);if(template)setDraft(template.content);}}><option value="">양식 선택</option>{templates.map(item=><option value={item.id} key={item.id}>{item.label}</option>)}</select></label>{row.platform==='COUPANG'?<label className="replyBy"><span>쿠팡 Wing 사용자 ID</span><input value={replyBy} onChange={event=>setReplyBy(event.target.value)} placeholder="답변 전송 계정"/></label>:null}<textarea rows="9" maxLength="1000" value={draft} onChange={event=>setDraft(event.target.value)} placeholder="답변 내용을 확인해 작성하세요."/><div className="csDraftActions"><button type="button" onClick={onCopy} disabled={!draft.trim()}>답변 복사</button><button className="primary" type="button" onClick={onReply} disabled={busy||!draft.trim()||(row.platform==='COUPANG'&&!replyBy)}>{busy?'처리 중':row.platform==='COUPANG'?'확인 후 실제 전송':'초안 복사'}</button></div><small className="csDraftNote">{row.platform==='COUPANG'?'실제 전송 전 확인창을 한 번 띄우고 처리기록을 남깁니다.':'직접 전송은 잠겨 있어요. 복사한 뒤 원본 판매자센터에서 확인하고 전송하세요.'}</small></>:<p className="railSafety">선택한 항목은 답변 문의가 아닙니다. 주문 정보 탭에서 클레임 처리 가능 여부를 확인하세요.</p>}</section>
      <section id="phase28-cs-panel-order" role="tabpanel" aria-labelledby="phase28-cs-tab-order" data-active={activeTab==='order'} aria-hidden={activeTab!=='order'} inert={activeTab==='order'?undefined:true}><header><span>문의와 연결된 주문</span><h3>{row?.orderId?`주문 ${row.orderId}`:'주문 전 문의'}</h3><p>결제·출고·배송 상태와 허용된 처리 작업을 확인합니다.</p></header>{row?<><div className="csOrderSummary"><div><span>상품</span><strong>{orderProduct(row)}</strong></div><div><span>현재 상태</span><strong>{row.order?.status||'주문 상세 연결 대기'}</strong></div><div><span>접수 상태</span><strong>{row.status||'확인 필요'}</strong></div>{row.order?.amount!=null?<div><span>주문 금액</span><strong>{count(row.order.amount)}원</strong></div>:null}</div>{row.kind!=='INQUIRY'?<ClaimActions row={row} busy={busy} onRun={onClaim}/>:null}</>:<p className="railEmpty">선택한 문의가 없습니다.</p>}</section>
    </div>
    <section className="csRailSummary"><h3>오늘 응대 기준</h3><div><span>첫 답변 목표</span><strong>30분 안에</strong></div><div><span>직접 처리</span><strong>쿠팡 검증 작업만</strong></div><div><span>완료 기록</span><strong>최근 이력 확인</strong></div></section>
  </div>;
}

export default function Phase28CsPage({model={}}){
  const router=useRouter();
  const hero=model.hero||{};
  const rows=model.rows||[];
  const channels=model.channels||[];
  const templates=model.templates||[];
  const [activeStage,setActiveStage]=useState('ACTIVE');
  const [activeTab,setActiveTab]=useState('message');
  const [selectedId,setSelectedId]=useState(rows.find(row=>!row.completed)?.id||rows[0]?.id||'');
  const [checkedIds,setCheckedIds]=useState(()=>new Set());
  const [draftIds,setDraftIds]=useState(()=>new Set());
  const [drafts,setDrafts]=useState({});
  const [query,setQuery]=useState('');
  const [priorityOnly,setPriorityOnly]=useState(false);
  const [sort,setSort]=useState('wait');
  const [busy,setBusy]=useState('');
  const [replyBy,setReplyBy]=useState('');
  const [statusMessage,setStatusMessage]=useState('');
  const [toastVisible,setToastVisible]=useState(false);
  const selectedRow=rows.find(row=>row.id===selectedId)||rows[0]||null;
  const activeRows=rows.filter(row=>!row.completed);
  const claimRows=activeRows.filter(row=>row.kind!=='INQUIRY');
  const historyRows=rows.filter(row=>row.completed);
  const draft=selectedRow?drafts[selectedRow.id]||'':'';

  useEffect(()=>{
    if(!statusMessage)return undefined;
    setToastVisible(true);
    const timer=window.setTimeout(()=>setToastVisible(false),2600);
    return()=>window.clearTimeout(timer);
  },[statusMessage]);

  const stageRows=useMemo(()=>{
    if(activeStage==='DRAFTS')return rows.filter(row=>draftIds.has(row.id));
    if(activeStage==='CLAIMS')return claimRows;
    if(activeStage==='HISTORY')return historyRows;
    return activeRows;
  },[activeStage,rows,draftIds,claimRows,historyRows,activeRows]);

  const visibleRows=useMemo(()=>stageRows.filter(row=>{
    const haystack=`${row.title} ${row.content} ${row.sourceId} ${row.orderId||''} ${orderProduct(row)}`.toLocaleLowerCase('ko-KR');
    const minutes=waitMinutes(row,hero.asOf);
    return (!query.trim()||haystack.includes(query.trim().toLocaleLowerCase('ko-KR')))&&(!priorityOnly||dueTone(row,minutes)!=='calm');
  }).sort((a,b)=>sort==='wait'?(waitMinutes(b,hero.asOf)||0)-(waitMinutes(a,hero.asOf)||0):dateMs(b.occurredAt)-dateMs(a.occurredAt)).slice(0,model.visibleLimit||20),[stageRows,query,priorityOnly,sort,hero.asOf,model.visibleLimit]);

  const stageCounts={ACTIVE:activeRows.length,DRAFTS:draftIds.size,CLAIMS:claimRows.length,HISTORY:Number(model.summary?.completed??historyRows.length)};
  const selectedCount=checkedIds.size;
  const oldestMinutes=activeRows.length?Math.max(...activeRows.map(row=>waitMinutes(row,hero.asOf)||0)):null;
  const dueSoon=activeRows.filter(row=>dueTone(row,waitMinutes(row,hero.asOf))==='urgent').length;

  function setDraft(value){
    if(!selectedRow)return;
    setDrafts(current=>({...current,[selectedRow.id]:value}));
    setDraftIds(current=>{const next=new Set(current);if(value.trim())next.add(selectedRow.id);else next.delete(selectedRow.id);return next;});
  }

  function openRow(row,tab='message'){
    setSelectedId(row.id);
    setActiveTab(tab);
  }

  function checkRow(row,checked){
    setSelectedId(row.id);
    setCheckedIds(current=>{const next=new Set(current);if(checked)next.add(row.id);else next.delete(row.id);return next;});
  }

  function checkAll(checked){
    setCheckedIds(current=>{const next=new Set(current);for(const row of visibleRows){if(checked)next.add(row.id);else next.delete(row.id);}return next;});
  }

  function openSelectedCompose(){
    const row=rows.find(item=>checkedIds.has(item.id))||visibleRows[0];
    if(!row){setStatusMessage('답변할 문의를 먼저 선택하세요.');return;}
    openRow(row,row.kind==='INQUIRY'?'compose':'order');
  }

  async function syncChannels(){
    setBusy('sync');setStatusMessage('카페24와 고정 IP 채널의 최신 문의를 수집하고 있어요.');
    try{
      const response=await fetch('/api/customer-service/sync',{method:'POST',headers:{'Content-Type':'application/json'}});
      const result=await response.json();
      if(!response.ok&&response.status!==202&&response.status!==207)throw new Error(result.error||'수집 요청 실패');
      const summary=(result.jobs||[]).map(job=>`${CHANNEL_NAMES[job.platform]||job.platform} ${job.skipped?'설정 필요':job.ok?'요청 완료':'확인 필요'}`).join(' · ');
      setStatusMessage(summary||'채널별 수집 요청을 보냈어요.');router.refresh();
    }catch(error){setStatusMessage(`문의 수집 확인 필요 · ${error.message}`);}finally{setBusy('');}
  }

  async function copyDraft(){
    try{await navigator.clipboard.writeText(draft);setStatusMessage('답변 초안을 복사했어요. 원본 채널에서 확인 후 전송하세요.');}
    catch{setStatusMessage('자동 복사가 막혀 있어요. 답변 내용을 직접 선택해 복사하세요.');}
  }

  async function reply(){
    if(!selectedRow||!draft.trim())return;
    if(selectedRow.platform!=='COUPANG')return copyDraft();
    const inquiryId=selectedRow.source?.inquiryId||selectedRow.sourceId;
    if(!window.confirm(`문의 ${inquiryId}에 아래 답변을 실제 전송합니다.\n\n${draft}\n\n전송할까요?`))return;
    setBusy('reply');setStatusMessage('서울 고정 IP 서버에서 답변을 전송하고 있어요.');
    try{
      const response=await fetch('/api/coupang/cs/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirm:true,action:selectedRow.source?.inquiryType==='CALL_CENTER'?'REPLY_CALL_CENTER':'REPLY_ONLINE',inquiryId,replyBy,content:draft,parentAnswerId:selectedRow.source?.parentAnswerId})});
      const result=await fixedIpResult(response);
      if(!result.ok)throw new Error(result.error||'전송 실패');
      setStatusMessage('답변 전송 완료 · 처리기록에 저장됐어요.');setDraft('');router.refresh();
    }catch(error){setStatusMessage(`답변 전송 실패 · ${error.message}`);}finally{setBusy('');}
  }

  async function runClaim(row,action,values){
    const labels={RETURN_RECEIVE:'반품상품 입고 확인',RETURN_APPROVE:'반품 승인·환불',RETURN_PICKUP_INVOICE:'반품 회수송장 등록',EXCHANGE_PICKUP_INVOICE:'교환 회수송장 등록',EXCHANGE_RECEIVE:'교환상품 입고 확인',EXCHANGE_REJECT:'교환 거부',EXCHANGE_SHIPPING_INVOICE:'교환상품 출고송장 등록'};
    if(!window.confirm(`${labels[action]||action}을 실제 쿠팡에 반영합니다.\n주문 ${row.orderId||'-'} · 접수 ${row.sourceId}\n\n계속할까요?`))return;
    setBusy('claim');setStatusMessage('서울 고정 IP 서버에서 클레임을 처리하고 있어요.');
    try{
      const isReturn=row.kind!=='EXCHANGE';
      const response=await fetch('/api/coupang/cases/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirm:true,action,receiptId:isReturn?row.sourceId:undefined,exchangeId:isReturn?undefined:row.sourceId,shipmentBoxId:row.source?.shipmentBoxId,...values})});
      const result=await fixedIpResult(response);
      if(!result.ok)throw new Error(result.error||'처리 실패');
      setStatusMessage('클레임 처리 완료 · 감사기록에 저장됐어요.');router.refresh();
    }catch(error){setStatusMessage(`클레임 처리 실패 · ${error.message}`);}finally{setBusy('');}
  }

  const currentStage=STAGES.find(item=>item.id===activeStage)||STAGES[0];
  return <section className="p28CsPage" data-phase28-page="cs">
    <div className="csIntro"><Phase28PageHeading context={`채널 ${channels.filter(item=>['READY','RUNNING'].includes(safeText(item.status).toUpperCase())).length}/${channels.length||3} 최신 · 미처리 문의만 표시`} title="오늘 답할 문의는 " accent={`${count(hero.activeCount)}건`} suffix="이에요." summary="문의 내용과 주문 상태를 한 화면에서 확인하고, 필요한 답변부터 바로 처리해요."/><div className="csResponseSignal"><span><HarinIcon name="customer" size={21}/></span><span><small>첫 답변 목표</small><strong>{model.responseTargetMinutes||30}분 안에</strong></span><b><small>가장 오래된 문의</small><strong>{waitLabel(oldestMinutes)}</strong></b></div></div>
    <Phase28RightRailLayout label="CS 답변 보조석" rail={<CsRail row={selectedRow} asOf={hero.asOf} activeTab={activeTab} setActiveTab={setActiveTab} draft={draft} setDraft={setDraft} templates={templates} replyBy={replyBy} setReplyBy={setReplyBy} busy={Boolean(busy)} onReply={reply} onCopy={copyDraft} onClaim={runClaim}/> }>
      <div className="csCore">
        <FreshnessDock channels={channels} asOf={hero.asOf} syncing={busy==='sync'} onSync={syncChannels}/>
        <section className="csInboxConsole" aria-label="고객 상담 인박스">
          <header className="csInboxHead"><div><h2>고객 대화함</h2><p>기다린 시간과 주문 맥락을 함께 보고, 먼저 답할 대화를 고르세요.</p></div><dl><div><dt>미처리</dt><dd>{count(hero.activeCount)}건</dd></div><div><dt>30분 임박</dt><dd className="urgent">{count(dueSoon)}건</dd></div><div><dt>처리 완료</dt><dd>{count(model.summary?.completed)}건</dd></div></dl></header>
          <ResponseLane rows={activeRows} selectedId={selectedId} asOf={hero.asOf} onSelect={row=>openRow(row,'message')}/>
          <div className="csInboxUtility"><label><HarinIcon name="search" size={17}/><input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="문의·주문·상품 검색" aria-label="문의·주문·상품 검색"/></label><span aria-live="polite">{count(visibleRows.length)}건 보임</span><label className="sort"><span>정렬</span><select value={sort} onChange={event=>setSort(event.target.value)} aria-label="문의 정렬"><option value="wait">오래 기다린 순</option><option value="recent">최근 문의 순</option></select></label></div>
          <div className="csInboxToolbar"><div className="csStageTabs" role="tablist" aria-label="고객 문의 상태 필터">{STAGES.map(stage=><button key={stage.id} type="button" role="tab" aria-selected={activeStage===stage.id} tabIndex={activeStage===stage.id?0:-1} onClick={()=>{setActiveStage(stage.id);setStatusMessage(`${stage.label} 항목만 모았어요.`);}}>{stage.label} <b>{count(stageCounts[stage.id])}</b></button>)}</div><div className="csPriorityFilter"><button type="button" className={!priorityOnly?'active':''} onClick={()=>setPriorityOnly(false)}>전체</button><button type="button" className={priorityOnly?'active':''} onClick={()=>setPriorityOnly(true)}>먼저 답할 문의</button></div></div>
          <div className="csBulkBar"><input type="checkbox" checked={visibleRows.length>0&&visibleRows.every(row=>checkedIds.has(row.id))} onChange={event=>checkAll(event.target.checked)} aria-label="현재 문의 전체 선택"/><strong>{count(selectedCount)}건 선택</strong><span>현재 보이는 문의를 한 번에 답변 작업으로 넘길 수 있어요.</span><button type="button" onClick={openSelectedCompose}>선택 문의 답변하기</button></div>
          <div className="csInboxColumns" aria-hidden="true"><span>문의</span><span>연결 정보</span><span>대기</span><span>상태</span><span>작업</span></div>
          <div className="csThreadList" role="list" aria-label="고객 문의 목록">{visibleRows.length?visibleRows.map(row=><CsThread key={row.id} row={row} asOf={hero.asOf} selected={selectedId===row.id} checked={checkedIds.has(row.id)} onOpen={openRow} onCheck={checkRow} onCompose={row=>openRow(row,row.kind==='INQUIRY'?'compose':'order')}/>):<div className="csEmptyState"><strong>{activeStage==='HISTORY'?'아직 완료된 처리 이력이 없어요':'이 단계에 남은 문의가 없어요.'}</strong><span>{channels.some(item=>['READY','RUNNING'].includes(safeText(item.status).toUpperCase()))?'현재 필터에서 정상적으로 0건입니다.':'채널 연결 상태를 확인한 뒤 문의 수집을 실행하세요.'}</span></div>}</div>
          <div className="csOpsNote"><span><HarinIcon name="customer" size={17}/></span><p><strong>오늘 문의 흐름</strong> 실제 수집된 항목 중 기한 초과 {count(hero.overdueCount)}건, 클레임 {count(hero.claimCount)}건입니다. 주문 연결 여부를 확인해 순서대로 처리하세요.</p></div>
          <div className="csInboxStatusline"><span><strong>{currentStage.label} {count(stageCounts[activeStage])}건</strong><small>{currentStage.description}</small></span><button type="button" onClick={openSelectedCompose}>{currentStage.action}<HarinIcon name="chevron" size={15}/></button></div>
        </section>
        {selectedCount?<div className="csMobileAction"><span><strong>{count(selectedCount)}건 선택</strong><small>30분 목표 · 가장 오래 {waitLabel(oldestMinutes)}</small></span><button type="button" onClick={openSelectedCompose}>답변하기</button></div>:null}
      </div>
    </Phase28RightRailLayout>
    <div className={`csToast${toastVisible?' visible':''}`} role="status" aria-live="polite">{statusMessage}</div>
  </section>;
}
