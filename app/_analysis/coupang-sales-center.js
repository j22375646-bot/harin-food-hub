'use client';

import { useState } from 'react';
import { COUPANG_SECTION_HELP } from '../../lib/ui/help-content.js';
import { useStoredState } from '../use-hub-preference.js';

const won=value=>`${Math.round(Number(value||0)).toLocaleString('ko-KR')}원`;
const count=value=>Number(value||0).toLocaleString('ko-KR');
const num=value=>Number(value||0);
const shortDate=value=>String(value||'').slice(5).replace('-','.');

function kstParts(value){
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return null;
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA',{
    timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'
  }).formatToParts(date).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
}

const dateTime=value=>{
  const parts=kstParts(value);
  return parts?`${parts.year}. ${Number(parts.month)}. ${Number(parts.day)}. ${parts.hour}:${parts.minute}:${parts.second}`:'시각 확인 필요';
};

function PanelTitle({tag,title,right}){
  return <div className="panelHead"><div><span className="sectionTag">{tag}</span><h2>{title}</h2></div>{right&&<span className="period">{right}</span>}</div>;
}

function Kpi({tone,icon,label,value,sub}){
  return <article className={`kpi ${tone}`}><div className="kpiIcon">{icon}</div><div><p>{label}</p><strong>{value}</strong><span>{sub}</span></div></article>;
}

function HelpBox({help,compact=false,persistKey}){
  const [open,setOpen]=useStoredState(`help:${persistKey||help?.title||'unknown'}`,false,[true,false]);
  if(!help)return null;
  return <details className={`helpBox${compact?' compact':''}`} open={open} onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary><span className="helpBoxHeading"><i aria-hidden="true">?</i><span><b>도움말 · {help.title}</b><small>{help.summary}</small></span></span><em><span className="helpOpenLabel">열기</span><span className="helpCloseLabel">접기</span></em></summary>
    <div className="helpBoxBody"><section><b>쉽게 말하면</b><p>{help.meaning}</p></section><section><b>언제 보면 되나요?</b><p>{help.when}</p></section><section className="helpExample"><b>숫자로 예를 들면</b><p>{help.example}</p></section><section className="helpAction"><b>지금 무엇을 하면 되나요?</b><p>{help.action}</p></section>{help.terms?.length?<section className="helpTerms"><b>어려운 말 쉽게 보기</b><dl>{help.terms.map(([term,description])=><div key={term}><dt>{term}</dt><dd>{description}</dd></div>)}</dl></section>:null}</div>
  </details>;
}

function CoupangSalesBoard({overview={}}){
  const periods=[['today','오늘'],['last7','최근 7일'],['last30','최근 30일']];
  const metrics=[['revenue','매출','won'],['orders','주문수','건'],['units','판매수량','개'],['average','평균 주문금액','won']];
  return <article className="panel coupangSalesBoard"><PanelTitle tag="SALES OVERVIEW" title="쿠팡 매출 현황표" right="주문 API 기준"/><div className="salesBoardTable"><div className="salesBoardHead"><span>구분</span>{periods.map(([,label])=><b key={label}>{label}</b>)}</div>{metrics.map(([id,label,format])=><div className="salesBoardRow" key={id}><strong>{label}</strong>{periods.map(([key])=>{const period=overview[key]||{};const value=id==='average'?(num(period.orders)?num(period.revenue)/num(period.orders):0):num(period[id]);return <span key={key}>{format==='won'?won(value):`${count(value)}${format}`}</span>;})}</div>)}</div></article>;
}

function ChartInstantTooltip({item,label}){
  return <span className="instantChartTooltip"><strong>{label}</strong><small>판매수량 <b>{count(item.units)}개</b></small><small>주문수 <b>{count(item.orders)}건</b></small><small>매출 <b>{won(item.revenue)}</b></small></span>;
}

function CoupangTrendChart({daily=[],products=[],selectedProduct='ALL',onSelectProduct,period='DAY',onSelectPeriod}){
  const [metric,setMetric]=useState('units');
  const options={units:{label:'판매수량',unit:'개',tone:'sales'},orders:{label:'주문수',unit:'건',tone:'orders'},revenue:{label:'매출',unit:'원',tone:'revenue'}};
  const selected=products.find(item=>String(item.vendorItemId)===String(selectedProduct));
  const chartDaily=selected?.daily||daily;
  const grouped=period==='DAY'?chartDaily:period==='WEEK'?Array.from({length:Math.ceil(chartDaily.length/7)},(_,index)=>{const rows=chartDaily.slice(index*7,index*7+7);return {date:`${shortDate(rows[0]?.date)}~${shortDate(rows.at(-1)?.date)}`,orders:rows.reduce((sum,row)=>sum+num(row.orders),0),units:rows.reduce((sum,row)=>sum+num(row.units),0),revenue:rows.reduce((sum,row)=>sum+num(row.revenue),0)};}):[...chartDaily.reduce((map,row)=>{const key=String(row.date).slice(0,7);const value=map.get(key)||{date:key,orders:0,units:0,revenue:0};value.orders+=num(row.orders);value.units+=num(row.units);value.revenue+=num(row.revenue);map.set(key,value);return map;},new Map()).values()];
  const current=options[metric];
  const max=Math.max(...grouped.map(item=>num(item[metric])),1);
  const total=grouped.reduce((sum,item)=>sum+num(item[metric]),0);
  const axis=value=>metric==='revenue'?(value>=1000000?`${(value/1000000).toFixed(1)}백만`:value>=10000?`${Math.round(value/10000)}만`:won(value)):`${count(value)}${current.unit}`;
  return <article className="panel coupangTrend wingSalesChart"><div className="chartHeader"><PanelTitle tag="ROCKET GROWTH SALES" title={selected?selected.name:'로켓그로스 전체 매출'} right={`합계 ${metric==='revenue'?won(total):`${count(total)}${current.unit}`}`}/><div className="chartPeriodTabs">{[['DAY','일'],['WEEK','주'],['MONTH','월']].map(([id,label])=><button className={period===id?'active':''} onClick={()=>onSelectPeriod(id)} key={id}>{label}</button>)}</div></div><div className="salesChartControls"><label className="productChartSelect"><span>상품</span><select value={selectedProduct} onChange={event=>onSelectProduct(event.target.value)}><option value="ALL">전체 상품 합계</option>{products.map(item=><option value={item.vendorItemId} key={item.vendorItemId}>{item.name}</option>)}</select></label><div className="chartTabs">{Object.entries(options).map(([id,item])=><button className={metric===id?'active':''} onClick={()=>setMetric(id)} key={id}>{item.label}</button>)}</div></div><div className="wingChart" role="img" aria-label={`${period==='DAY'?'일별':period==='WEEK'?'주별':'월별'} ${current.label} 막대그래프`}><div className="wingAxis"><span>{axis(max)}</span><span>{axis(max*.66)}</span><span>{axis(max*.33)}</span><span>0</span></div><div className="wingGrid"><i/><i/><i/><i/></div><div className="wingBars">{grouped.map((item,index)=><div className="wingBarGroup" key={`${item.date}-${index}`} tabIndex={0} aria-label={`${item.date}, 판매수량 ${count(item.units)}개, 주문 ${count(item.orders)}건, 매출 ${won(item.revenue)}`}><ChartInstantTooltip item={item} label={item.date}/><span className={`wingBar ${current.tone}`} style={{height:`${Math.max(item[metric]?8:2,num(item[metric])/max*230)}px`}}/><small>{period==='DAY'?(index%3===0||index===grouped.length-1?shortDate(item.date):''):item.date}</small></div>)}</div></div><div className="chartLegend"><i className={`legendLine ${current.tone}`}/><span>로켓그로스 {current.label}</span><em>막대에 마우스를 올리면 판매수량·주문수·매출이 즉시 표시됩니다.</em></div></article>;
}

function CoupangProductPerformance({products=[],selectedProduct,onSelectProduct}){
  return <article className="panel productPerformancePanel wingProductTable"><PanelTitle tag="PRODUCT PERFORMANCE" title="상품별 판매·재고 현황" right={`${products.length}개 상품`}/><div className="productPerformanceHead"><span>상품명·옵션</span><span>최근 판매량</span><span>판매가능</span><span>재고일수</span><span>30일 매출</span><span>상태</span></div><div className="productPerformanceBody">{products.slice(0,30).map(item=>{const quantity=num(item.inventory?.quantity);const stockStatus=quantity<=0?'품절':item.inventory?.daysOfStock!=null&&num(item.inventory.daysOfStock)<14?'재입고 필요':'판매중';return <button className={String(selectedProduct)===String(item.vendorItemId)?'active':''} onClick={()=>onSelectProduct(String(item.vendorItemId))} key={item.vendorItemId}><span><b>{item.name}</b><small>상품 ID {item.vendorItemId} · 눌러서 그래프 보기</small></span><span className="recentSales"><small>7일</small><b>{count(item.last7?.units)}</b><small>30일</small><b>{count(item.totals?.units)}</b></span><strong>{count(quantity)}개</strong><em>{item.inventory?.daysOfStock==null?'-':`${num(item.inventory.daysOfStock).toFixed(1)}일`}</em><em className="productRevenue">{won(item.totals?.revenue)}</em><span className={`productStockBadge ${quantity<=0?'out':stockStatus==='재입고 필요'?'low':'on'}`}>{stockStatus}</span></button>;})}</div><p className="comparisonNote">쿠팡 주문 원본의 판매단가를 복구해 매출을 계산했습니다. 입고중·입고확정 수량은 현재 공개 RG API 응답에 포함되지 않습니다.</p></article>;
}

function CoupangRealtimePanel({hourly=[],today={},latestRealtime}){
  const [metric,setMetric]=useState('revenue');
  const [requesting,setRequesting]=useState(false);
  const [message,setMessage]=useState('');
  const options={revenue:{label:'시간대별 매출',unit:'원'},orders:{label:'시간대별 주문',unit:'건'},units:{label:'시간대별 판매',unit:'개'}};
  const max=Math.max(...hourly.map(item=>num(item[metric])),1);
  async function refresh(){setRequesting(true);setMessage('실시간 수집 요청 중…');try{const response=await fetch('/api/coupang/realtime/sync',{method:'POST'});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'요청 실패');setMessage('수집 요청 완료 · 서울 고정 IP 서버가 즉시 수집을 시작합니다.');}catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setRequesting(false);}}
  return <article className="panel realtimePanel"><div className="realtimeHead"><div><span className="sectionTag">TODAY · LIVE</span><h2>오늘 매출·주문 실시간</h2><small>{today.date} · 마지막 갱신 {latestRealtime?.finished_at?dateTime(latestRealtime.finished_at):'첫 수집 대기'}</small></div><button onClick={refresh} disabled={requesting}>{requesting?'요청 중…':'실시간 새로고침'}</button></div><div className="todayKpis"><span><small>오늘 매출</small><strong>{won(today.revenue)}</strong></span><span><small>오늘 주문</small><strong>{count(today.orders)}건</strong></span><span><small>오늘 판매수량</small><strong>{count(today.units)}개</strong></span><span><small>평균 주문금액</small><strong>{won(today.averageOrder)}</strong></span></div><div className="chartTabs liveTabs">{Object.entries(options).map(([id,item])=><button className={metric===id?'active':''} onClick={()=>setMetric(id)} key={id}>{item.label}</button>)}</div><div className="hourlyChart" role="img" aria-label={options[metric].label}>{hourly.map(item=><div className="hourCol" key={item.hour} tabIndex={0} aria-label={`${item.hour}시, 판매수량 ${count(item.units)}개, 주문 ${count(item.orders)}건, 매출 ${won(item.revenue)}`}><ChartInstantTooltip item={item} label={`${item.hour}시`}/><i style={{height:`${Math.max(item[metric]?5:1,num(item[metric])/max*175)}px`}}/><small>{item.hour%3===0?`${item.hour}시`:''}</small></div>)}</div>{message&&<p className="realtimeMessage">{message}</p>}</article>;
}

export default function CoupangSalesCenter({coupang,selectedProduct='ALL',selectedPeriod='DAY',onSelectProduct,onSelectPeriod}){
  const [manualSyncing,setManualSyncing]=useState(false);
  const [manualSyncMessage,setManualSyncMessage]=useState('');
  async function requestManualSync(){setManualSyncing(true);setManualSyncMessage('서울 고정 IP 서버에 수동 요청을 전달하는 중…');try{const response=await fetch('/api/coupang/sync',{method:'POST'});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'쿠팡 수집 요청 실패');setManualSyncMessage(result.existing?'이미 수집 요청이 처리 대기 또는 실행 중입니다.':'수동 수집 요청 완료 · 서울 고정 IP 서버가 즉시 수집을 시작합니다.');}catch(error){setManualSyncMessage(`확인 필요 · ${error.message}`);}finally{setManualSyncing(false);}}
  return <section className="coupangSalesCenter"><section className="hero coupangHero"><div><span className="eyebrow">COUPANG SALES INSIGHT</span><h1>쿠팡 매출을<br/><em>상품별로 분석합니다.</em></h1><p>주문·CS·재고·정산은 왼쪽 운영 메뉴로 분리했습니다. 이곳에서는 매출 흐름과 상품 성과만 봅니다.</p><div className="coupangManualSync"><button onClick={requestManualSync} disabled={manualSyncing}>{manualSyncing?'요청 중…':'쿠팡 데이터 수동 수집'}</button>{manualSyncMessage&&<small>{manualSyncMessage}</small>}</div></div><div className="heroStatus"><span>마지막 수집 상태</span><strong>{coupang.latestSync?.status||'수집 대기'}</strong><small>{coupang.latestSync?.finished_at?dateTime(coupang.latestSync.finished_at):'수집 기록 없음'}</small></div></section><HelpBox help={COUPANG_SECTION_HELP.SALES} compact persistKey="coupang-sales"/><CoupangSalesBoard overview={coupang.salesOverview||{}}/><section className="kpiGrid"><Kpi tone="orange" icon="오늘" label="오늘 매출" value={won(coupang.today?.revenue)} sub={`${count(coupang.today?.orders)}건 주문`}/><Kpi tone="purple" icon="30" label="30일 매출" value={won(coupang.salesOverview?.last30?.revenue)} sub={`${count(coupang.salesOverview?.last30?.units)}개 판매`}/><Kpi tone="blue" icon="#" label="30일 주문" value={`${count(coupang.salesOverview?.last30?.orders)}건`} sub={`객단가 ${won(num(coupang.salesOverview?.last30?.orders)?num(coupang.salesOverview?.last30?.revenue)/num(coupang.salesOverview?.last30?.orders):0)}`}/><Kpi tone="green" icon="개" label="30일 판매수량" value={`${count(coupang.salesOverview?.last30?.units)}개`} sub="로켓그로스 주문 기준"/></section><CoupangRealtimePanel hourly={coupang.orderHourly||[]} today={coupang.today||{}} latestRealtime={coupang.latestRealtime}/><CoupangTrendChart daily={coupang.orderDaily||[]} products={coupang.productPerformance||[]} selectedProduct={selectedProduct} onSelectProduct={onSelectProduct} period={selectedPeriod} onSelectPeriod={onSelectPeriod}/><CoupangProductPerformance products={coupang.productPerformance||[]} selectedProduct={selectedProduct} onSelectProduct={onSelectProduct}/></section>;
}
