'use client';

import { useState } from 'react';
import { useStoredState } from '../use-hub-preference.js';

const won=value=>`${Math.round(Number(value||0)).toLocaleString('ko-KR')}원`;
const count=value=>Number(value||0).toLocaleString('ko-KR');
const num=value=>Number(value||0);

function kstParts(value){
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return null;
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA',{
    timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'
  }).formatToParts(date).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
}

function dateTime(value){
  const parts=kstParts(value);
  return parts?`${parts.year}. ${Number(parts.month)}. ${Number(parts.day)}. ${parts.hour}:${parts.minute}:${parts.second}`:'시각 확인 필요';
}

function Kpi({tone,icon,label,value,sub}){
  return <article className={`kpi ${tone}`}><div className="kpiIcon">{icon}</div><div><p>{label}</p><strong>{value}</strong><span>{sub}</span></div></article>;
}

function Empty({children}){return <div className="empty">{children}</div>;}

function PanelTitle({tag,title,right}){
  return <div className="panelHead"><div><span className="sectionTag">{tag}</span><h2>{title}</h2></div>{right&&<span className="period">{right}</span>}</div>;
}

async function coupangFixedIpResult(response){
  const initial=await response.json();
  if(response.status!==202||!initial.request?.id)return initial;
  for(let attempt=0;attempt<90;attempt+=1){
    await new Promise(resolve=>setTimeout(resolve,750));
    const statusResponse=await fetch(`/api/coupang/operations/${initial.request.id}`,{cache:'no-store'});
    const result=await statusResponse.json();
    if(statusResponse.status===202)continue;
    return result;
  }
  return {ok:false,error:'서울 고정 IP 서버의 응답 시간이 초과됐습니다. 작업 이력에서 상태를 확인해주세요.'};
}

function CoupangCostImporter({imports=[]}){
  const [files,setFiles]=useState([]);
  const [uploading,setUploading]=useState(false);
  const [message,setMessage]=useState('');
  async function upload(){
    if(!files.length)return setMessage('쿠팡 WING에서 내려받은 XLSX 파일을 선택해주세요.');
    setUploading(true);setMessage(`${files.length}개 파일 분석 중…`);
    try{
      const form=new FormData();
      files.forEach(file=>form.append('files',file));
      const response=await fetch('/api/coupang/cost-import',{method:'POST',body:form});
      const result=await response.json();
      if(!response.ok&&response.status!==207)throw new Error(result.error||'업로드 실패');
      const summary=result.summary||{};
      setMessage(`완료 · 신규 ${count(summary.storedRows)}행 · 중복 제외 ${count(summary.duplicateRows)}행${summary.failed?` · 실패 ${summary.failed}개`:''}`);
      if(summary.storedRows)setTimeout(()=>window.location.reload(),900);
    }catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setUploading(false);}
  }
  const latest=imports[0];
  return <article className="panel coupangCostImporter"><div><PanelTitle tag="WING COST IMPORT" title="로켓그로스 비용 엑셀" right={latest?`최근 ${dateTime(latest.imported_at)}`:'첫 업로드 대기'}/><p>판매수수료·입출고비·배송비·보관비·반품비·부가서비스비 파일을 여러 개 한 번에 올리세요. 같은 행은 자동으로 제외됩니다.</p></div><div className="costUploadControls"><label><input type="file" accept=".xlsx" multiple onChange={event=>setFiles([...event.target.files])}/><span>{files.length?`${files.length}개 선택됨`:'XLSX 여러 개 선택'}</span></label><button onClick={upload} disabled={uploading||!files.length}>{uploading?'계산 중…':'비용 합산하기'}</button></div>{message&&<small className="costUploadMessage">{message}</small>}</article>;
}

function CoupangCostStatement({estimate={},statement={}}){
  const rg=estimate.rocketGrowth||{};const seller=estimate.sellerDelivery||{};const total=estimate.total||{};
  const categories=[['판매수수료',rg.commission],['입출고비',rg.warehousing],['배송비',rg.shipping],['보관비',rg.storage],['부가세',rg.vat]];
  const channels=[['로켓그로스',rg],['판매자배송',seller],['전체 합계',total]];
  return <section className="coupangCostSection">
    <article className="panel costWaterfall recentCostPanel"><PanelTitle tag="RECENT 7 DAYS · ESTIMATE" title="쿠팡 수익·비용 현황" right={estimate.periodStart?`${estimate.periodStart} ~ ${estimate.periodEnd}`:'최근 주문 대기'}/><div className="costSummaryGrid large"><span><small>전체 매출</small><b>{won(total.sales)}</b></span><span><small>예상 플랫폼 비용</small><b>- {won(total.totalCost)}</b></span><span><small>상품원가 차감 전 잔액</small><b>{won(total.netBeforeCogs)}</b></span><span><small>예상 비용률</small><b>{num(total.sales)?`${(num(total.totalCost)/num(total.sales)*100).toFixed(1)}%`:'-'}</b></span></div><div className="costBreakdown large">{categories.map(([label,value])=><div key={label}><span>{label}</span><i><em style={{width:`${Math.min(100,num(rg.totalCost)?num(value)/num(rg.totalCost)*100:0)}%`}}/></i><b>{won(value)}</b></div>)}</div><div className="estimateBasis"><b>계산 기준</b><span>매출·주문·판매수량은 최근 7일 API 실제값</span><span>수수료·입출고·배송·보관·부가세는 최근 공식 정산 엑셀({statement.periodStart||'-'} ~ {statement.periodEnd||'-'})의 상품별 요율로 자동 추정</span></div></article>
    <article className="panel channelSettlementPanel"><PanelTitle tag="CHANNEL SPLIT" title="로켓그로스 · 판매자배송 · 전체 매출표" right="중복 주문 자동 제외"/><div className="channelSettlementTable"><div className="channelSettlementHead"><span>구분</span><b>매출</b><b>주문</b><b>판매수량</b><b>예상 비용</b><b>원가 전 잔액</b></div>{channels.map(([label,item])=><div className={label==='전체 합계'?'total':''} key={label}><strong>{label}</strong><span>{won(item.sales)}</span><span>{count(item.orders)}건</span><span>{count(item.units)}개</span><span>{won(item.totalCost)}</span><b>{won(item.netBeforeCogs)}</b></div>)}</div><p className="comparisonNote">판매자배송은 일반 주문 API의 THIRD_PARTY 주문, 로켓그로스는 RG 전용 주문 API 기준입니다. 양쪽에 동시에 잡힌 주문은 전체 합계에서 한 번만 계산합니다.</p></article>
    <article className="panel costProductPanel"><PanelTitle tag="PRODUCT PROFIT" title="최근 7일 로켓그로스 상품별 예상 비용" right={`${estimate.products?.length||0}개 SKU`}/><div className="costProductHead"><span>상품</span><span>매출</span><span>수수료</span><span>물류·부가세</span><span>원가 전 잔액</span></div><div className="costProductRows">{(estimate.products||[]).slice(0,30).map(item=><div key={item.vendorItemId}><span><b>{item.name}</b><small>옵션ID {item.vendorItemId} · {count(item.quantity)}개 판매</small></span><strong>{won(item.sales)}</strong><em>{won(item.commission)}</em><em>{won(num(item.warehousing)+num(item.shipping)+num(item.storage)+num(item.vat))}</em><b className={num(item.netBeforeCogs)<0?'negative':''}>{won(item.netBeforeCogs)}</b></div>)}</div>{!estimate.products?.length&&<Empty>최근 7일 로켓그로스 주문이 수집되면 상품별 예상 비용이 표시됩니다.</Empty>}</article>
  </section>;
}

function CoupangActualSettlement({actual={},summaries=[]}){
  return <section className="actualSettlementStack"><article className="panel actualRevenuePanel"><PanelTitle tag="COUPANG REVENUE API · ACTUAL" title="확정 매출내역" right={`${actual.periodStart||'-'} ~ ${actual.periodEnd||'-'}`}/><div className="costSummaryGrid"><span><small>매출인식액</small><b>{won(actual.sales)}</b></span><span><small>확정 판매수수료</small><b>{won(actual.serviceFee)}</b></span><span><small>확정 부가세</small><b>{won(actual.vat)}</b></span><span><small>정산대상액</small><b>{won(actual.settlementAmount)}</b></span></div><p className="comparisonNote">구매확정 또는 배송완료 후 7일이 지난 주문만 쿠팡 매출내역 API에 잡힙니다. 현재 기간의 {count(actual.items)}개 상품 정산행을 합산했습니다.</p></article><article className="panel actualPayoutPanel"><PanelTitle tag="COUPANG PAYOUT API · ACTUAL" title="지급 확정·예정 내역" right={`${summaries.length}개 정산 회차`}/><div className="payoutHistoryHead"><span>매출인식월</span><span>정산유형</span><span>상태</span><span>총판매액</span><span>판매수수료</span><span>지급액 · 유보액</span></div><div className="payoutHistoryRows">{summaries.slice(0,12).map((item,index)=><div key={`${item.recognition_month}-${item.settlement_type}-${index}`}><strong>{item.recognition_month||'-'}</strong><span>{item.settlement_type||'-'}</span><span className={item.status==='DONE'?'done':'subject'}>{item.status==='DONE'?'지급완료':'지급예정'}</span><span>{won(item.total_sale)}</span><span>{won(item.service_fee)}</span><b>{won(item.final_amount||item.settlement_amount)}<small>유보 {won(item.last_amount)}</small></b></div>)}</div>{!summaries.length&&<Empty>쿠팡 지급내역 API 동기화 후 표시됩니다.</Empty>}</article></section>;
}

const orderStatusLabel={ACCEPT:'결제완료',INSTRUCT:'상품준비중',DEPARTURE:'배송지시',DELIVERING:'배송중',FINAL_DELIVERY:'배송완료',NONE_TRACKING:'직접배송'};
const couriers=[['CJGLS','CJ대한통운'],['HANJIN','한진택배'],['LOTTE','롯데택배'],['KDEXP','경동택배'],['EPOST','우체국택배'],['LOGEN','로젠택배'],['DIRECT','업체직송']];

function SellerOrderCard({order}){
  const [detail,setDetail]=useState(null);const [loading,setLoading]=useState(false);const [working,setWorking]=useState(false);const [message,setMessage]=useState('');
  const [courier,setCourier]=useState('CJGLS');const [invoice,setInvoice]=useState('');
  async function loadDetail(){setLoading(true);setMessage('서울 고정 IP 서버에서 배송정보를 조회 중…');try{const response=await fetch(`/api/coupang/orders/detail?shipmentBoxId=${encodeURIComponent(order.shipmentBoxId)}`);const result=await coupangFixedIpResult(response);if(!result.ok){const error=new Error(result.error||'상세 조회 실패');error.code=result.code;throw error;}setDetail(result.order);setMessage('서울 고정 IP 조회 완료');}catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setLoading(false);}}
  async function runAction(action){const label=action==='ACKNOWLEDGE'?'이 주문을 상품준비중으로 변경':'입력한 송장을 쿠팡에 등록';if(!window.confirm(`${label}하시겠습니까?\n실제 쿠팡 주문 상태가 변경됩니다.`))return;setWorking(true);setMessage('서울 고정 IP 서버에서 처리 중…');try{const items=detail?.items||order.items||[];const response=await fetch('/api/coupang/orders/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirm:true,action,shipmentBoxId:order.shipmentBoxId,orderId:order.orderId,deliveryCompanyCode:courier,invoiceNumber:invoice,vendorItemIds:items.map(item=>item.vendorItemId).filter(Boolean)})});const result=await coupangFixedIpResult(response);if(!result.ok)throw new Error(result.error||'처리 실패');setDetail(result.order);setMessage('서울 고정 IP 처리 완료 · 주문 상태를 다시 확인했습니다.');if(action==='UPLOAD_INVOICE')setInvoice('');}catch(error){setMessage(`처리 실패 · ${error.message}`);}finally{setWorking(false);}}
  const shown=detail||order;const items=shown.items||order.items||[];const status=shown.status||order.status;
  return <article className={`sellerOrderCard status-${status||'unknown'}`}>
    <header><div><span className="orderStatusBadge">{orderStatusLabel[status]||status||'상태 미확인'}</span><b>주문 {order.orderId}</b><small>묶음배송 {order.shipmentBoxId} · {order.orderedAt?dateTime(order.orderedAt):'주문일 없음'}</small></div><strong>{won(order.amount)}</strong></header>
    <div className="sellerOrderItems">{items.map((item,index)=><div key={`${item.vendorItemId}-${index}`}><span><b>{item.name}</b><small>옵션 ID {item.vendorItemId||'-'}{num(item.cancelQuantity)>0?` · 취소대기 ${count(item.cancelQuantity)}개`:''}</small></span><strong>{count(item.quantity)}개</strong></div>)}</div>
    {detail&&<div className="deliveryDetail"><span><small>받는 분</small><b>{detail.receiver?.name||'-'} · {detail.receiver?.safeNumber||'-'}</b></span><span><small>배송지</small><b>{[detail.receiver?.address,detail.receiver?.addressDetail].filter(Boolean).join(' ')||'-'}</b></span>{detail.receiver?.message&&<span><small>배송메시지</small><b>{detail.receiver.message}</b></span>}</div>}
    {(shown.invoiceNumber||order.invoiceNumber)&&<div className="currentInvoice"><span>등록 송장</span><b>{shown.deliveryCompanyName||order.deliveryCompanyName||'택배사'} · {shown.invoiceNumber||order.invoiceNumber}</b></div>}
    <footer><button className="secondaryOrderButton" onClick={loadDetail} disabled={loading}>{loading?'조회 중…':detail?'배송정보 새로고침':'배송정보·연락처 보기'}</button>{status==='ACCEPT'&&<button className="primaryOrderButton" onClick={()=>runAction('ACKNOWLEDGE')} disabled={working}>상품준비중 처리</button>}</footer>
    {status==='INSTRUCT'&&<div className="invoiceForm"><select value={courier} onChange={event=>setCourier(event.target.value)}>{couriers.map(([code,name])=><option value={code} key={code}>{name}</option>)}</select><input inputMode="numeric" placeholder="송장번호 (숫자만)" value={invoice} onChange={event=>setInvoice(event.target.value.replace(/\D/g,''))}/><button onClick={()=>runAction('UPLOAD_INVOICE')} disabled={working||invoice.length<6}>송장 등록</button></div>}
    {message&&<p className="orderActionMessage">{message}</p>}
  </article>;
}

function CoupangOrdersHub({coupang}){
  const [view,setView]=useStoredState('filter:orders-view','SELLER',['SELLER','RG']);
  const [status,setStatus]=useStoredState('filter:orders-status','ACTION',['ACTION','ALL','ACCEPT','INSTRUCT','DEPARTURE','DELIVERING','FINAL_DELIVERY']);
  const [query,setQuery]=useStoredState('filter:orders-query','');
  const sellerOrders=coupang.sellerOrders||[];
  const seller=sellerOrders.filter(order=>(status==='ALL'||(status==='ACTION'?['ACCEPT','INSTRUCT'].includes(order.status):order.status===status))&&(!query||`${order.orderId} ${order.shipmentBoxId} ${(order.items||[]).map(item=>item.name).join(' ')}`.toLowerCase().includes(query.toLowerCase())));
  const processSteps=[['ACCEPT','결제완료','주문을 확인해 주세요'],['INSTRUCT','상품준비중','포장 후 송장을 준비해요'],['DEPARTURE','배송지시','택배사에 출고했어요'],['DELIVERING','배송중','상품이 이동 중이에요'],['FINAL_DELIVERY','배송완료','고객에게 전달됐어요']].map(([id,label,description],index)=>({id,label,description,index,count:sellerOrders.filter(order=>order.status===id).length}));
  const orderViews=[['SELLER','판매자배송 관리',`${count(coupang.sellerActionRequired)}건 처리 필요`],['RG','로켓그로스 조회',`${count(coupang.rgOrderCount)}건 · 조회 전용`]];
  return <section className="coupangOrdersHub"><nav className="orderSubTabs">{orderViews.map(([id,label,sub])=><button className={view===id?'active':''} onClick={()=>setView(id)} key={id}><b>{label}</b><small>{sub}</small></button>)}</nav>
    {view==='SELLER'&&<><article className="panel orderProcessPanel"><header><div><span className="sectionTag">ORDER PROCESS</span><h2>배송 처리 단계</h2><p>박스를 누르면 그 단계의 주문만 아래에 보여줍니다.</p></div><button className={status==='ACTION'?'active':''} onClick={()=>setStatus('ACTION')}><span>먼저 처리할 주문</span><b>{count(coupang.sellerActionRequired)}건</b><small>결제완료 + 상품준비중</small></button></header><div className="orderProcessFlow" aria-label="판매자배송 처리 단계">{processSteps.map(step=><div className="orderProcessNode" key={step.id}><button className={status===step.id?'active':''} onClick={()=>setStatus(step.id)} aria-pressed={status===step.id}><small>{step.index+1}. {step.label}</small><strong>{count(step.count)}건</strong><span>{step.description}</span></button>{step.index<processSteps.length-1&&<i aria-hidden="true">→</i>}</div>)}</div></article><article className="panel sellerOrderToolbar"><div><span className="sectionTag">SELLER DELIVERY</span><h2>{status==='ACTION'?'내가 먼저 처리할 주문':status==='ALL'?'전체 판매자배송 주문':`${orderStatusLabel[status]} 주문`}</h2><p>결제완료 주문을 확인한 뒤 상품준비중 처리하고, 출고 시 송장을 등록하세요.</p></div><div><input type="search" placeholder="주문번호·상품명 검색" value={query} onChange={event=>setQuery(event.target.value)}/><select value={status} onChange={event=>setStatus(event.target.value)}><option value="ACTION">처리 필요</option><option value="ALL">전체 상태</option><option value="ACCEPT">결제완료</option><option value="INSTRUCT">상품준비중</option><option value="DEPARTURE">배송지시</option><option value="DELIVERING">배송중</option><option value="FINAL_DELIVERY">배송완료</option></select></div></article><div className="sellerOrderList">{seller.length?seller.map(order=><SellerOrderCard order={order} key={order.shipmentBoxId}/>):<Empty>이 조건의 판매자배송 주문이 없습니다.</Empty>}</div></>}
    {view==='RG'&&<article className="panel rgReadOnlyPanel"><PanelTitle tag="ROCKET GROWTH · READ ONLY" title="로켓그로스 주문" right={`${count(coupang.rgOrderCount)}건`}/><div className="readOnlyNotice"><b>쿠팡이 출고·배송을 자동 처리합니다.</b><span>이 목록은 판매·CS 확인용이며 송장 입력이나 배송상태 변경 버튼을 표시하지 않습니다.</span></div><div className="rgOrderGrid">{(coupang.rgOrders||[]).slice(0,60).map(order=><div key={order.order_id}><span><b>{orderStatusLabel[order.status]||order.status||'주문 접수'}</b><small>{order.paid_at?dateTime(order.paid_at):'결제일 없음'} · 상품 {count(order.item_count)}개</small></span><strong>{won(order.total_amount)}</strong><em>{order.order_id}</em></div>)}</div></article>}
  </section>;
}

function CoupangOperationIntro({eyebrow,title,description,coupang}){
  return <section className="pageIntro coupangOperationIntro"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div><aside><small>쿠팡 마지막 수집</small><b>{coupang.latestSync?.status||'수집 대기'}</b><span>{coupang.latestSync?.finished_at?dateTime(coupang.latestSync.finished_at):'데이터수집에서 실행'}</span></aside></section>;
}

export function CoupangOrdersView({coupang}){
  return <section className="coupangOperationPage"><CoupangOperationIntro eyebrow="COUPANG ORDERS" title="주문·출고 관리" description="판매자배송은 직접 처리하고, 로켓그로스 주문은 안전하게 조회만 합니다." coupang={coupang}/><section className="kpiGrid"><Kpi tone="orange" icon="!" label="판매자배송 처리 필요" value={`${count(coupang.sellerActionRequired)}건`} sub={`전체 ${count(coupang.sellerOrderCount)}건`}/><Kpi tone="blue" icon="RG" label="로켓그로스 주문" value={`${count(coupang.rgOrderCount)}건`} sub="쿠팡 자동 배송"/><Kpi tone="green" icon="₩" label="로켓그로스 매출" value={won(coupang.rgRevenue)} sub="조회 전용 주문 합계"/><Kpi tone="purple" icon="#" label="전체 쿠팡 주문" value={`${count(coupang.orderCount)}건`} sub="최근 수집 자료"/></section><CoupangOrdersHub coupang={coupang}/></section>;
}

export function CoupangSettlementView({coupang}){
  const active=(coupang.capabilities||[]).filter(item=>item.mode==='AUTO');
  const gated=(coupang.capabilities||[]).filter(item=>item.mode==='APPROVAL');
  return <section className="coupangOperationPage"><CoupangOperationIntro eyebrow="COUPANG SETTLEMENT & COST" title="정산·비용" description="매출, 확정 지급액, 판매수수료와 로켓그로스 물류비를 한곳에서 대조합니다." coupang={coupang}/><section className="kpiGrid"><Kpi tone="purple" icon="₩" label="최근 7일 전체 매출" value={won(coupang.recentCostEstimate?.total?.sales)} sub="RG + 판매자배송"/><Kpi tone="orange" icon="F" label="최근 7일 예상 비용" value={won(coupang.recentCostEstimate?.total?.totalCost)} sub="공식 정산 요율 자동 적용"/><Kpi tone="green" icon="P" label="원가 전 예상 잔액" value={won(coupang.recentCostEstimate?.total?.netBeforeCogs)} sub="상품원가 연결 전"/><Kpi tone="blue" icon="B" label="프로모션 잔액" value={won(coupang.promotionRemaining)} sub="사용가능 예산"/></section><CoupangCostStatement estimate={coupang.recentCostEstimate||{}} statement={coupang.costStatement||{}}/><CoupangActualSettlement actual={coupang.actualSettlement7||{}} summaries={coupang.settlementSummaries||[]}/><CoupangCostImporter imports={coupang.costImports||[]}/><details className="panel apiCoverage"><summary><span><b>쿠팡 API 연동 범위</b><small>조회는 자동, 변경은 확인 후 실행으로 보호합니다.</small></span><em>{active.length}개 자동 · {gated.length}개 확인 후 실행</em></summary><div className="apiCapabilityGrid">{[...active,...gated].map(item=><span key={item.feature_key} className={item.mode==='AUTO'?'auto':'gated'}><b>{item.title}</b><small>{item.family} · {item.mode==='AUTO'?'자동 조회':'확인 후 실행'}</small></span>)}</div></details></section>;
}
