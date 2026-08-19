'use client';

import { useEffect, useState } from 'react';
import { HarinBadge, HarinButton, HarinCard, HarinEmptyState, HarinInlineStatus, HarinPictogram, HarinProgressiveDetails, HarinSectionHeading, HarinStateCard } from '../../../_design-system/harin-ui.js';
import requestSafety from '../../../../lib/market-intelligence/request-safety.js';

const {requestJson}=requestSafety;
const periodLabel={7:'최근 7일',30:'최근 30일',90:'최근 90일',180:'최근 180일',365:'최근 1년'};
const unitLabel={date:'일별',week:'주별',month:'월별'};
const kindMeta={SEARCH_TREND:{title:'네이버 검색 트렌드',eyebrow:'SEARCH TREND',icon:'search',tone:'lavender'},SHOPPING_KEYWORD:{title:'네이버 쇼핑 클릭 관심도',eyebrow:'SHOPPING INSIGHT',icon:'shoppingBag',tone:'blue'}};
const statusMeta={READY:['자료 준비','success'],PARTIAL:['일부 자료','warning'],NO_DATA:['자료 없음','danger']};
const keywordText=value=>Array.isArray(value)?value.join('\n'):'';

export default function MarketNaverTrend({projectId,productName}){
  const endpoint=`/api/market-intelligence/projects/${projectId}/naver-trends`;
  const [data,setData]=useState(null),[draft,setDraft]=useState(null),[loading,setLoading]=useState(true),[working,setWorking]=useState(''),[message,setMessage]=useState('');
  async function load(signal){setLoading(true);setMessage('');try{const result=await requestJson(endpoint,{signal});setData(result);setDraft({...result.profile,keywords_text:keywordText(result.profile.keywords)});}catch(error){if(error.code!=='REQUEST_ABORTED')setMessage(`확인 필요 · ${error.message}`);}finally{setLoading(false);}}
  useEffect(()=>{const controller=new AbortController();load(controller.signal);return()=>controller.abort();},[projectId]);
  const update=(field,value)=>setDraft(current=>({...current,[field]:value}));
  const payload=()=>({profile:{...draft,keywords:String(draft.keywords_text||'').split(/[\n,]/u).map(item=>item.trim()).filter(Boolean)}});
  async function run(action){setWorking(action);setMessage('');try{
    const method=action==='COLLECT'?'POST':'PUT',result=await requestJson(endpoint,{method,headers:{'content-type':'application/json'},body:JSON.stringify(payload()),timeoutMs:30000});
    setMessage(result.message);await load();
  }catch(error){setMessage(`판단 보류 · ${error.message}`);}finally{setWorking('');}}
  async function confirm(snapshot){setWorking(`CONFIRM_${snapshot.id}`);setMessage('');try{const result=await requestJson(endpoint,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({snapshot_id:snapshot.id,confirmed:!snapshot.owner_confirmed})});setMessage(result.message);await load();}catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setWorking('');}}
  if(loading)return <HarinCard className="marketTrendLoading"><HarinPictogram icon="search" tone="lavender"/><span><b>{productName} 수요 신호를 여는 중이에요…</b><small>다른 상품 자료와 섞지 않고 최신 스냅샷만 확인합니다.</small></span></HarinCard>;
  if(!data||!draft)return <HarinInlineStatus tone="danger" title="네이버 수요 신호를 불러오지 못했어요" description={message||'잠시 뒤 다시 시도해주세요.'} action={<HarinButton icon="sync" onClick={()=>load()}>다시 확인</HarinButton>}/>;
  const snapshots=data.snapshots||{},hasAny=Boolean(snapshots.SEARCH_TREND||snapshots.SHOPPING_KEYWORD);
  return <section className="marketNaverTrendWorkbench">
    <HarinSectionHeading eyebrow="PRODUCT DEMAND SIGNAL" title="선택 상품의 네이버 수요 흐름" description="검색 트렌드와 쇼핑 클릭 관심도를 따로 수집해 비교해요. 숫자는 실제 검색량이 아니라 구간 내 상대지수입니다." icon="growth" aside={<HarinBadge tone={data.readiness.configured?'success':'warning'}>{data.readiness.configured?'API 연결 준비':'API 키 설정 필요'}</HarinBadge>}/>
    <section className="marketTrendKpis"><HarinStateCard icon="product" label="분석 상품" value={data.product.name} description="상품을 바꾸면 별도 프로젝트"/><HarinStateCard icon="clock" label="조회 기간" value={periodLabel[draft.period_days]||`${draft.period_days}일`} description={unitLabel[draft.time_unit]}/><HarinStateCard icon="keyword" label="비교 검색어" value={`${String(draft.keywords_text||'').split(/[\n,]/u).filter(Boolean).length}개`} description="최대 5개 · 상품별 저장"/><HarinStateCard tone={hasAny?'success':'warning'} icon="database" label="최근 수집" value={hasAny?'스냅샷 있음':'판단 보류'} description={hasAny?'출처·기간 고정 저장':'수집 자료 없음'}/></section>
    {message?<div className="marketDataMessage" role="status"><HarinPictogram icon="sparkles" tone="lavender" size={18}/><span>{message}</span></div>:null}
    <HarinCard className="marketTrendControl"><HarinSectionHeading eyebrow="OWNER-SELECTED PROFILE" title="상품별 수집 조건" description="추천 검색어는 시작점일 뿐이며, 사장님이 직접 수정한 값으로만 수집합니다." icon="settings"/>
      <div className="marketTrendFields"><label><span>분석 주제</span><input maxLength="120" value={draft.topic_name||''} onChange={event=>update('topic_name',event.target.value)} placeholder={productName}/></label><label className="keywords"><span>비교 검색어 · 한 줄에 하나</span><textarea value={draft.keywords_text||''} onChange={event=>update('keywords_text',event.target.value)} placeholder="검색어를 최대 5개 입력해주세요."/><small>브랜드명·일반명·구매 상황처럼 비교할 단어를 각각 한 줄에 적어주세요.</small></label><label><span>조회 기간</span><select value={draft.period_days} onChange={event=>update('period_days',Number(event.target.value))}>{Object.entries(periodLabel).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label><label><span>집계 단위</span><select value={draft.time_unit} onChange={event=>update('time_unit',event.target.value)}>{Object.entries(unitLabel).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label><label><span>쇼핑 카테고리 코드</span><input inputMode="numeric" maxLength="8" value={draft.shopping_category_code||''} onChange={event=>update('shopping_category_code',event.target.value.replace(/\D/gu,'').slice(0,8))} placeholder="숫자 8자리"/><small>상품에 맞는 네이버 쇼핑 카테고리를 직접 확인해 입력합니다.</small></label><label><span>카테고리 이름</span><input maxLength="120" value={draft.shopping_category_name||''} onChange={event=>update('shopping_category_name',event.target.value)} placeholder="예: 식품"/></label></div>
      <label className="marketTrendOwnerCheck"><input type="checkbox" checked={Boolean(draft.owner_confirmed)} onChange={event=>update('owner_confirmed',event.target.checked)}/><span><b>쇼핑 카테고리가 이 상품에 맞는지 직접 확인했어요</b><small>확인 전에는 검색 트렌드만 수집하고 쇼핑 인사이트는 판단 보류로 둡니다.</small></span></label>
      <footer><span><HarinPictogram icon="shield" tone="mint" size={17}/><small>수집은 읽기 전용입니다. 광고·상품·입찰가는 변경하지 않아요.</small></span><HarinButton icon="check" busy={working==='SAVE'} busyLabel="조건 저장 중…" disabled={Boolean(working)} onClick={()=>run('SAVE')}>조건 저장</HarinButton><HarinButton variant="primary" icon="sync" busy={working==='COLLECT'} busyLabel="수요 신호 수집 중…" disabled={Boolean(working)||!data.readiness.configured} onClick={()=>run('COLLECT')}>지금 새로 수집</HarinButton></footer>
    </HarinCard>
    <section className="marketTrendCharts">{['SEARCH_TREND','SHOPPING_KEYWORD'].map(kind=><TrendPanel key={kind} kind={kind} snapshot={snapshots[kind]} shoppingReady={data.readiness.shopping_ready} working={working} onConfirm={confirm}/>)}</section>
    <HarinProgressiveDetails eyebrow="읽는 방법" title="상대지수 100은 무슨 뜻인가요?" description="높고 낮음의 흐름은 비교할 수 있지만 실제 검색 횟수로 해석하면 안 됩니다." count="기본 접힘"><div className="marketTrendRules"><article><HarinPictogram icon="growth" tone="lavender"/><span><b>구간 안에서 가장 높은 값이 100</b><p>예: 50은 검색 50회가 아니라, 같은 구간 최고 관심도의 절반 수준이라는 뜻이에요.</p></span></article><article><HarinPictogram icon="warning" tone="amber"/><span><b>없는 기간은 0으로 만들지 않음</b><p>네이버가 값을 주지 않은 기간은 자료 없음으로 보존해 잘못된 하락 판단을 막아요.</p></span></article><article><HarinPictogram icon="shield" tone="mint"/><span><b>사장님 확인 뒤 분석 근거로 사용</b><p>상품·기간·검색어가 맞는지 확인한 스냅샷만 다음 분석 Evidence로 연결합니다.</p></span></article></div></HarinProgressiveDetails>
  </section>;
}

function TrendPanel({kind,snapshot,shoppingReady,working,onConfirm}){
  const meta=kindMeta[kind];
  if(!snapshot){
    const isShopping=kind==='SHOPPING_KEYWORD';
    return <HarinCard className="marketTrendPanel empty"><HarinSectionHeading eyebrow={meta.eyebrow} title={meta.title} description={isShopping&&!shoppingReady?'카테고리 코드와 사장님 확인이 필요해요.':'아직 수집한 자료가 없어요.'} icon={meta.icon}/><HarinEmptyState icon={isShopping?'shoppingBag':'search'} title={isShopping&&!shoppingReady?'쇼핑 인사이트는 판단 보류':'첫 수집을 기다리고 있어요'} description={isShopping&&!shoppingReady?'선택 상품에 맞는 네이버 쇼핑 카테고리를 확인하면 별도로 수집합니다.':'수집 조건을 확인한 뒤 지금 새로 수집을 눌러주세요.'}/></HarinCard>;
  }
  const status=statusMeta[snapshot.data_status]||statusMeta.NO_DATA;
  return <HarinCard className={`marketTrendPanel ${snapshot.is_stale?'stale':''}`}><HarinSectionHeading eyebrow={meta.eyebrow} title={meta.title} description={`${snapshot.period_start} ~ ${snapshot.period_end} · ${unitLabel[snapshot.time_unit]||snapshot.time_unit}`} icon={meta.icon} aside={<HarinBadge tone={snapshot.is_stale?'warning':status[1]}>{snapshot.is_stale?'오래된 자료':status[0]}</HarinBadge>}/><p className="marketTrendMetric"><HarinPictogram icon="warning" tone="amber" size={16}/><span>{snapshot.metric_notice}</span></p>{snapshot.series?.length?<div className="marketTrendSeries">{snapshot.series.map((series,index)=><TrendSeries series={series} chartId={`${kind}-${index}`} key={`${series.label}-${index}`}/>)}</div>:<HarinEmptyState icon="growth" title="반환된 수요 신호가 없어요" description="검색어·기간·카테고리를 확인하고 다시 수집해주세요."/>}<footer><span><small>수집 시각</small><b>{new Date(snapshot.fetched_at).toLocaleString('ko-KR')}</b></span><HarinButton variant={snapshot.owner_confirmed?'soft':'secondary'} icon="check" busy={working===`CONFIRM_${snapshot.id}`} busyLabel="확인 상태 저장 중…" disabled={Boolean(working)} onClick={()=>onConfirm(snapshot)}>{snapshot.owner_confirmed?'확인 취소':'이 자료 확인'}</HarinButton></footer></HarinCard>;
}

function TrendSeries({series,chartId}){
  const points=series.points||[],ratios=points.map(item=>Number(item.ratio)).filter(Number.isFinite),latest=ratios.at(-1),peak=ratios.length?Math.max(...ratios):null;
  const width=480,height=118,padding=10,path=points.map((point,index)=>{const x=padding+(index/Math.max(1,points.length-1))*(width-padding*2),y=height-padding-(Number(point.ratio)/100)*(height-padding*2);return `${index?'L':'M'}${x.toFixed(1)},${y.toFixed(1)}`;}).join(' ');
  const gradientId=`trend-${chartId}`;
  return <article><header><span><b>{series.label}</b><small>{points.length}개 기간 값</small></span><div><small>최근</small><strong>{latest==null?'자료 없음':latest.toLocaleString('ko-KR')}</strong><small>최고</small><strong>{peak==null?'자료 없음':peak.toLocaleString('ko-KR')}</strong></div></header>{points.length>1?<svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${series.label} 상대지수 흐름`} preserveAspectRatio="none"><defs><linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#b7a9dc"/><stop offset="1" stopColor="#8db9d6"/></linearGradient></defs><path d={path} fill="none" stroke={`url(#${gradientId})`} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/></svg>:<div className="marketTrendSinglePoint">{latest==null?'반환된 기간 값이 없습니다.':`현재 상대지수 ${latest}`}</div>}<footer><small>{points[0]?.period||'시작 자료 없음'}</small><small>{points.at(-1)?.period||'최근 자료 없음'}</small></footer></article>;
}
