'use client';

import {useEffect,useMemo,useState} from 'react';
import {useRouter} from 'next/navigation';
import HarinIcon from '../../_design-system/harin-icon.js';
import {Phase28ChannelLogo} from '../primitives/channel-logo.js';
import {Phase28PageHeading} from '../primitives/page-heading.js';
import {Phase28RightRailLayout} from '../primitives/right-rail-layout.js';
import {pushPhase28Route} from '../phase28-navigation-feedback.js';
import './keywords-page.css';

const FILTERS=[['all','전체'],['lower','감액 후보'],['raise','확대 후보'],['hold','유지·관찰'],['blocked','판단 보류']];
const FLOW=[
  {id:'cost',label:'광고비',icon:'price',tone:'blue'},
  {id:'clicks',label:'클릭',icon:'keyword',tone:'slate'},
  {id:'orders',label:'주문',icon:'shoppingBag',tone:'apricot'},
  {id:'revenue',label:'매출',icon:'growth',tone:'mint'}
];

function money(value){return value==null||!Number.isFinite(Number(value))?'확인 필요':`${Math.round(Number(value)).toLocaleString('ko-KR')}원`;}
function count(value,suffix='건'){return value==null||!Number.isFinite(Number(value))?'확인 필요':`${Math.round(Number(value)).toLocaleString('ko-KR')}${suffix}`;}
function percent(value){return value==null||!Number.isFinite(Number(value))?'판단 보류':`${Math.round(Number(value)).toLocaleString('ko-KR')}%`;}
function referenceTime(value){
  if(!value)return '기준시각 확인 필요';
  const date=new Date(value);if(Number.isNaN(date.getTime()))return '기준시각 확인 필요';
  return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date);
}
function clampBid(row,value){
  if(value===''||value==null||!Number.isFinite(Number(value)))return '';
  return Math.min(row.maximumBid||100000,Math.max(row.minimumBid||70,Math.round(Number(value)/10)*10));
}
function visibleReasons(row={},reasonCatalog=[]){
  const reasons=(row.reasonIds||[]).map(id=>reasonCatalog[id]).filter(Boolean).filter(reason=>!/(?:판매)?상품\s*연결/.test(String(reason)));
  return reasons.length?reasons:['추천·증액 근거가 부족해 판단을 보류합니다. 현재 입찰가는 직접 지정할 수 있습니다.'];
}

function ChannelDeck({model,router}){
  return <section className="kpChannelDeck" aria-label="키워드 운영 채널 선택"><div className="kpChannelSwitch">{(model.channels||[]).map(channel=><button type="button" aria-pressed={channel.active} data-active={channel.active} key={channel.id} onClick={()=>pushPhase28Route(router,channel.href)}><Phase28ChannelLogo brand={channel.brand}/><span><strong>{channel.label}</strong><small>{channel.description}</small></span><em>{channel.id==='naver'?'API 운영':'WING 수동'}</em></button>)}</div></section>;
}

function ChannelMode({model}){
  return <article className="kpChannelMode"><Phase28ChannelLogo brand={model.platform==='coupang'?'COUPANG':'NAVER'}/><span><small>{model.platform==='coupang'?'쿠팡':'네이버'} 운영 방식</small><strong>{model.mode?.label||'운영 방식 확인 필요'}</strong><p>{model.mode?.description||'채널 연결 상태를 확인해주세요.'}</p></span></article>;
}

function PerformanceFlow({model}){
  const summary=model.summary||{};
  const metrics={
    cost:{value:money(summary.cost),hint:'현재 조회 범위 합계'},
    clicks:{value:count(summary.clicks),hint:summary.cost!=null&&summary.clicks?`클릭당 약 ${money(summary.cost/summary.clicks)}`:'클릭 근거 확인 필요'},
    orders:{value:count(summary.orders),hint:summary.clicks&&summary.orders!=null?`클릭 대비 ${(summary.orders/summary.clicks*100).toFixed(1)}%`:'주문 근거 확인 필요'},
    revenue:{value:money(summary.revenue),hint:summary.cost&&summary.revenue!=null?`ROAS ${percent(summary.revenue/summary.cost*100)}`:'매출 근거 확인 필요'}
  };
  const actions=summary.actions||{lower:0,raise:0,hold:0,blocked:0};
  return <section className="kpFlow" aria-labelledby="kpFlowTitle"><header><div><span>PERFORMANCE FLOW</span><h2 id="kpFlowTitle">광고비가 주문으로 이어지는 흐름</h2><p>현재 채널에서 확인된 자료만 같은 범위로 연결합니다.</p></div><em>{model.platform==='coupang'?'쿠팡 · WING 수동 운영':'네이버 · API 직접 운영'}</em></header><div className="kpFlowStages">{FLOW.map((stage,index)=><article data-tone={stage.tone} key={stage.id}><b>{String(index+1).padStart(2,'0')}</b><i><HarinIcon name={stage.icon} size={25}/></i><span>{stage.label}</span><strong>{metrics[stage.id].value}</strong><small>{metrics[stage.id].hint}</small></article>)}</div><div className="kpDecisionStrip"><article className="kpWaste"><i><HarinIcon name="warning" size={23}/></i><span><small>주문 없이 쓴 광고비</small><strong>{money(summary.noOrderSpend)}</strong><em>{summary.cost?`조회 광고비의 ${Math.round(summary.noOrderSpend/summary.cost*100)}%`:'비율 확인 필요'}</em></span></article><article className="kpDistribution"><header><span><strong>지금 판단할 키워드</strong><small>현재 범위 {count(summary.total,'개')} 기준</small></span><b>{count((actions.lower||0)+(actions.raise||0)+(actions.blocked||0),'개')}</b></header><div>{[['lower','입찰 낮추기'],['raise','입찰 높이기'],['hold','유지·관찰'],['blocked','판단 보류']].map(([id,label])=><span data-tone={id} key={id}><i/><small>{label}</small><strong>{count(actions[id]||0,'개')}</strong></span>)}</div></article></div></section>;
}

function WorkspaceTabs({model,router}){
  return <nav className="kpTabs" role="tablist" aria-label="키워드 작업공간">{(model.workspaces||[]).map(item=><button type="button" role="tab" aria-selected={item.active} key={item.id} onClick={()=>pushPhase28Route(router,item.href)}><strong>{item.label}</strong><small>{item.description}</small></button>)}</nav>;
}

function KeywordTable({model,rows,selected,activeId,drafts,onToggle,onInspect,onDraft}){
  return <div className="kpTableScroll" role="region" aria-label="키워드 운영표" tabIndex="0"><div className="kpTable"><div className="kpTableHead" role="row"><span>선택</span><span>키워드·채널</span><span>캠페인</span><span>현재 입찰</span><span>추천 입찰</span><span>수정 입찰가</span><span>클릭</span><span>광고비</span><span>주문</span><span>ROAS</span><span>상태</span></div>{rows.length?<div className="kpRows">{rows.map(row=><article className="kpRow" data-selected={selected.has(row.id)} data-inspected={activeId===row.id} role="row" tabIndex="0" key={row.id} onClick={()=>onInspect(row.id)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onInspect(row.id);}}}><span><input type="checkbox" checked={selected.has(row.id)} aria-label={`${row.keyword} 선택`} onClick={event=>event.stopPropagation()} onChange={()=>onToggle(row.id)}/></span><span className="kpName"><Phase28ChannelLogo brand={row.channel} size="compact"/><i><strong>{row.keyword}</strong><small>{row.channel==='NAVER'?'네이버 검색광고':'쿠팡 상품광고'}</small></i></span><span className="kpCampaign"><strong>{row.campaign||'캠페인 확인 필요'}</strong></span><span data-missing={row.currentBid==null}>{row.channel==='COUPANG'?'WING 확인':money(row.currentBid)}</span><span data-missing={row.recommendedBid==null}>{row.channel==='COUPANG'?'수동 판단':money(row.recommendedBid)}</span><span className="kpDraft">{row.canDraft?<input type="number" inputMode="numeric" min={row.minimumBid} max={row.maximumBid} step="10" placeholder="직접 입력" value={drafts[row.id]??''} aria-label={`${row.keyword} 수정 입찰가`} onClick={event=>event.stopPropagation()} onFocus={()=>onInspect(row.id)} onChange={event=>onDraft(row,event.currentTarget.value,false)} onBlur={event=>onDraft(row,event.currentTarget.value,true)}/>:<em>{row.channel==='COUPANG'?'작업표 입력':'—'}</em>}</span><span>{count(row.clicks)}</span><span>{money(row.cost)}</span><span data-missing={row.orders==null}>{count(row.orders)}</span><span data-missing={row.roas==null}>{percent(row.roas)}</span><span><b className="kpStatus" data-tone={row.tone}>{row.statusLabel}</b></span></article>)}</div>:<div className="kpEmpty"><HarinIcon name="search" size={23}/><strong>조건에 맞는 키워드가 없어요.</strong><span>검색어나 빠른 보기를 바꿔보세요.</span></div>}</div></div>;
}

function DecisionDesk({row,draft,onDraft,onPreview,model}){
  if(!row)return <div className="kpRailEmpty"><HarinIcon name="keyword" size={24}/><strong>선택된 키워드가 없어요.</strong><span>목록에서 키워드를 선택하면 근거와 수정 입찰가를 확인할 수 있습니다.</span></div>;
  return <div className="kpDecisionDesk"><header><span>KEYWORD DECISION DESK</span><div><Phase28ChannelLogo brand={row.channel} size="compact"/><small>{row.channel==='NAVER'?'네이버 · 광고 키워드':'쿠팡 · WING 작업'}</small></div><h2>{row.keyword}</h2><p>{row.campaign||'캠페인 확인 필요'}</p></header><div className="kpRailStatus" data-tone={row.tone}><i/><strong>{row.statusLabel}</strong></div><div className="kpBidPair"><span><small>현재 입찰가</small><strong>{row.channel==='NAVER'?money(row.currentBid):'WING 확인'}</strong></span><i>→</i><span><small>검토 입찰가</small><strong>{row.channel==='NAVER'?money(draft===''||draft==null?row.recommendedBid:draft):'수동 입력'}</strong></span></div>{row.canDraft?<div className="kpRailDraft"><label htmlFor={`kp-draft-${row.id}`}><span>수정 입찰가</span><small>{row.minimumBid.toLocaleString('ko-KR')}원 이상 · 직접 지정</small></label><div><input id={`kp-draft-${row.id}`} type="number" inputMode="numeric" min={row.minimumBid} max={row.maximumBid} step="10" placeholder="직접 입력" value={draft??''} onChange={event=>onDraft(row,event.currentTarget.value,false)} onBlur={event=>onDraft(row,event.currentTarget.value,true)}/><span>원</span></div><button type="button" disabled={row.recommendedBid==null} onClick={()=>onDraft(row,row.recommendedBid,true)}>추천가 사용</button></div>:null}<dl><div><dt>광고비</dt><dd>{money(row.cost)}</dd></div><div><dt>주문</dt><dd>{count(row.orders)}</dd></div><div><dt>ROAS</dt><dd>{percent(row.roas)}</dd></div></dl><ul>{visibleReasons(row,model.reasonCatalog).map(reason=><li key={reason}>{reason}</li>)}</ul><section><span>NEXT SAFE ACTION</span><strong>{row.channel==='NAVER'?row.canDraft?'변경값을 입력하고 한 번의 확인 화면에서 실행하세요.':'자료를 확인한 뒤 판단을 다시 열어요.':'WING 작업표에 현재가와 적용가를 직접 기록하세요.'}</strong><button type="button" onClick={onPreview}>{row.channel==='NAVER'?'변경안 미리보기':'WING 작업 확인'}</button></section><p className="kpRailFoot">{model.platform==='naver'?'최신값 재조회 · 사장님 확인 · 반영 후 검증':'쿠팡 자동 반영 없음 · 채널별 작업 경로 분리'}</p></div>;
}

function BidPreview({rows,drafts,onClose,onExecute,working,result}){
  useEffect(()=>{const close=event=>{if(event.key==='Escape'&&!working)onClose();};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[onClose,working]);
  return <div className="kpModal" role="presentation"><section role="dialog" aria-modal="true" aria-labelledby="kpModalTitle"><header><div><span>CHANGE PREVIEW · OWNER CONFIRM</span><h2 id="kpModalTitle">{rows.length.toLocaleString('ko-KR')}개 키워드 수정 전 확인</h2><p>현재 입찰가와 직접 입력한 수정 입찰가를 마지막으로 비교합니다.</p></div><button type="button" aria-label="변경안 닫기" disabled={working} onClick={onClose}><HarinIcon name="close" size={21}/></button></header><div className="kpPreviewList">{rows.map(row=><article key={row.id}><span><Phase28ChannelLogo brand="NAVER" size="compact"/><i><strong>{row.keyword}</strong><small>{row.campaign}</small></i></span><em>{money(row.currentBid)}</em><b>→</b><strong>{money(drafts[row.id])}</strong></article>)}</div><div className="kpPreviewNotice"><strong>확인 버튼을 누르면 실제 네이버 반영과 재검증까지 진행합니다.</strong><span>서버가 최신 현재값·안전 범위·스냅샷을 다시 확인하고, 값이 달라졌으면 실행을 멈춥니다.</span></div>{result?<p className="kpExecutionResult" role="status">{result}</p>:null}<footer><button type="button" disabled={working} onClick={onClose}>취소</button><button type="button" className="primary" disabled={working||!rows.length} onClick={onExecute}>{working?'현재값 확인·반영 중…':'확인하고 실제 반영'}</button></footer></section></div>;
}

export default function Phase28KeywordsPage({model,aiPanel}){
  const router=useRouter();
  const sourceRows=model.rows||[];
  const [query,setQuery]=useState('');
  const [filter,setFilter]=useState('all');
  const [selected,setSelected]=useState(()=>new Set());
  const [activeId,setActiveId]=useState(sourceRows[0]?.id||null);
  const [drafts,setDrafts]=useState({});
  const [previewOpen,setPreviewOpen]=useState(false);
  const [working,setWorking]=useState(false);
  const [result,setResult]=useState('');
  const visibleLimit=model.visibleLimit||20;
  const [showCount,setShowCount]=useState(visibleLimit);

  useEffect(()=>{setSelected(new Set());setActiveId(sourceRows[0]?.id||null);setDrafts({});setPreviewOpen(false);setResult('');},[model.platform,model.workspace]);
  const visibleRows=useMemo(()=>sourceRows.filter(row=>{
    const needle=query.trim().toLocaleLowerCase('ko');
    const matchesQuery=!needle||`${row.keyword} ${row.campaign}`.toLocaleLowerCase('ko').includes(needle);
    const matchesFilter=filter==='all'||row.tone===filter;
    return matchesQuery&&matchesFilter;
  }),[sourceRows,query,filter]);
  useEffect(()=>setShowCount(visibleLimit),[model.platform,model.workspace,query,filter,visibleLimit]);
  const shownRows=visibleRows.slice(0,showCount);
  const activeRow=sourceRows.find(row=>row.id===activeId)||sourceRows[0]||null;
  const changedRows=sourceRows.filter(row=>selected.has(row.id)&&row.canDraft&&drafts[row.id]!=null&&drafts[row.id]!==''&&Number(drafts[row.id])!==Number(row.currentBid));

  function toggle(id){setSelected(current=>{const next=new Set(current);next.has(id)?next.delete(id):next.add(id);return next;});}
  function inspect(id){setActiveId(id);}
  function changeDraft(row,value,normalize){
    const nextValue=normalize?clampBid(row,value):value;
    setDrafts(current=>{const next={...current};if(nextValue==='')delete next[row.id];else next[row.id]=normalize?nextValue:Number(nextValue);return next;});
    setActiveId(row.id);setSelected(current=>new Set(current).add(row.id));
  }
  function openPreview(){
    if(model.platform==='coupang'){setResult(selected.size?`${selected.size.toLocaleString('ko-KR')}건의 WING 수동 작업을 확인했습니다. 쿠팡에는 자동 반영되지 않습니다.`:'먼저 표에서 키워드를 선택해주세요.');return;}
    if(!changedRows.length){setResult(selected.size?'선택한 키워드의 수정 입찰가를 입력해주세요.':'먼저 표에서 키워드를 선택해주세요.');return;}
    setResult('');setPreviewOpen(true);
  }
  async function executeChanges(){
    if(!changedRows.length||working)return;
    setWorking(true);setResult('');
    const completed=[];const failed=[];
    for(const row of changedRows){
      try{
        if(!row.snapshotToken)throw new Error('서버 미리보기를 새로 받아주세요.');
        const desired=Number(drafts[row.id]);
        const key=`kwbid:${row.id}:${desired}:${String(row.snapshotToken).slice(-20).replace(/[^A-Za-z0-9._:-]/g,'')}`.slice(0,128);
        const proposalResponse=await fetch('/api/naver/bid-proposals',{method:'POST',headers:{'content-type':'application/json','idempotency-key':key},body:JSON.stringify({snapshot_token:row.snapshotToken,owner_desired_bid:desired})});
        const proposal=await proposalResponse.json();
        if(!proposalResponse.ok||!proposal.ok)throw new Error(proposal.error||'변경안을 만들지 못했습니다.');
        if(proposal.external_execution_locked)throw new Error('실제 반영 기능이 잠겨 있어 변경안만 저장했습니다.');
        const requestId=proposal.request?.id;if(!requestId)throw new Error('변경 기록 ID를 받지 못했습니다.');
        const executeResponse=await fetch(`/api/financial-changes/${requestId}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'CONFIRM_EXECUTE',confirm:true,note:'키워드 운영표에서 사장님 확인 후 즉시 실행'})});
        const executed=await executeResponse.json();
        if(!executeResponse.ok||!executed.ok||executed.blocked||executed.applied===false)throw new Error(executed.request?.error_message||executed.error||'네이버에 반영하지 못했습니다.');
        if(!executed.verified)throw new Error(executed.request?.error_message||'반영 후 현재값이 일치하지 않습니다.');
        completed.push(row.keyword);
      }catch(error){failed.push(`${row.keyword}: ${error.message}`);}
    }
    setWorking(false);
    if(failed.length)setResult(`완료 ${completed.length}건 · 확인 필요 ${failed.length}건 — ${failed.join(' / ')}`);
    else{setResult(`${completed.length.toLocaleString('ko-KR')}건 반영 완료 · 네이버 현재값 재검증까지 일치했습니다.`);router.refresh();}
  }

  return <section className="p28Keywords" data-phase28-root="true" data-phase28-page="keywords">
    <div className="kpIntro"><Phase28PageHeading context="네이버·쿠팡 채널 분리 · 실제 운영" title="오늘 조정할 키워드 " accent={`${model.hero?.checkCount||0}건`} suffix="이 있어요." summary={model.hero?.summary}/><ChannelMode model={model}/></div>
    <ChannelDeck model={model} router={router}/>
    <PerformanceFlow model={model}/>
    <Phase28RightRailLayout label="키워드 판단 패널" rail={<DecisionDesk row={activeRow} draft={activeRow?drafts[activeRow.id]:''} onDraft={changeDraft} onPreview={openPreview} model={model}/>}>
      <section className="kpWorkbench" aria-labelledby="kpWorkbenchTitle"><header><div><i><HarinIcon name="keyword" size={22}/></i><span><small>KEYWORD WORKBENCH</small><h2 id="kpWorkbenchTitle">{model.platform==='coupang'?'쿠팡 WING 작업표':'네이버 키워드 운영표'}</h2></span></div><em>{model.platform==='coupang'?'WING 입찰가 확인 필요':`네이버 검색광고 · ${referenceTime(model.generatedAt)}`}</em></header><WorkspaceTabs model={model} router={router}/><div className="kpScope"><label><span>현재 채널 키워드 찾기</span><input type="search" value={query} onChange={event=>setQuery(event.currentTarget.value)} placeholder="키워드·캠페인 검색"/></label><div>{FILTERS.map(([id,label])=><button type="button" aria-pressed={filter===id} key={id} onClick={()=>setFilter(id)}>{label}</button>)}</div><small>{model.platform==='naver'?'현재 입찰가·추천가 서버 기준':'입찰가는 WING 확인 필요'}</small></div>{selected.size?<div className="kpBulk"><strong>{selected.size.toLocaleString('ko-KR')}개 선택</strong><span>{model.platform==='naver'?`수정 입찰가 ${changedRows.length.toLocaleString('ko-KR')}건 입력 · 실제 반영 전 최신값 재조회`:'네이버 선택과 분리된 쿠팡 전용 작업표'}</span><button type="button" onClick={openPreview}>{model.platform==='naver'?'변경안 미리보기':'WING 작업 확인'}</button></div>:null}<KeywordTable model={model} rows={shownRows} selected={selected} activeId={activeId} drafts={drafts} onToggle={toggle} onInspect={inspect} onDraft={changeDraft}/><footer><span>검색 결과 <strong>{visibleRows.length.toLocaleString('ko-KR')}개</strong> · 현재 {shownRows.length.toLocaleString('ko-KR')}개 표시</span>{showCount<visibleRows.length?<button type="button" className="kpMore" onClick={()=>setShowCount(value=>value+visibleLimit)}>키워드 {Math.min(visibleLimit,visibleRows.length-showCount)}건 더 보기 · 남은 {(visibleRows.length-showCount).toLocaleString('ko-KR')}건</button>:<small>채널별 데이터·선택·실행 경로 분리</small>}</footer></section>
    </Phase28RightRailLayout>
    <section className="kpAi"><div><span>KEYWORD AI · PAGE ISOLATED</span><h2>선택 키워드의 비용·주문 근거만 설명해요.</h2><p>상품·정산 AI와 자료를 섞지 않고, 규칙 기반 계산이 먼저입니다.</p></div><strong>{aiPanel?.configuration?.enabled?'AI 준비 · 실행은 별도 확인':'사용 시작 전 · 비용 0원'}</strong><button type="button" onClick={()=>setResult('현재 화면은 서버 계산 근거만 사용하며 AI를 자동 호출하지 않습니다.')}>근거 설명 보기</button></section>
    {result&&!previewOpen?<p className="kpPageMessage" role="status">{result}</p>:null}
    {previewOpen?<BidPreview rows={changedRows} drafts={drafts} onClose={()=>{if(!working)setPreviewOpen(false);}} onExecute={executeChanges} working={working} result={result}/>:null}
  </section>;
}
