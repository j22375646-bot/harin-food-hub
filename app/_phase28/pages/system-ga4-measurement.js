'use client';

import {useEffect,useReducer,useRef} from 'react';
import './system-ga4-measurement.css';

const ENDPOINT='/api/system/measurement/ga4';
const SETUP_FIELDS={
  '자사몰 주소':'HUB_OWNED_SITE_URL',
  'GA4 속성 ID':'GOOGLE_GA4_PROPERTY_ID',
  '서비스 계정 이메일':'GOOGLE_SERVICE_ACCOUNT_EMAIL',
  '서비스 계정 비밀키':'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY'
};
const STATUS_META={
  SETUP_REQUIRED:{label:'설정 필요',tone:'setup'},LOCKED:{label:'수집 잠금',tone:'locked'},
  VERIFY_REQUIRED:{label:'읽기 확인 필요',tone:'check'},OBSERVED:{label:'관측 자료',tone:'ready'},
  NO_DATA:{label:'관측 자료 없음',tone:'empty'},PARTIAL:{label:'일부 관측',tone:'partial'},
  FAILED:{label:'최근 조회 실패',tone:'failed'},STALE:{label:'갱신 필요',tone:'stale'},
  IN_FLIGHT:{label:'확인 작업 진행 중',tone:'running'}
};
const STAGE_DEFINITIONS=[
  ['view_item','상품 조회'],['add_to_cart','장바구니'],['begin_checkout','결제 시작'],
  ['add_payment_info','결제 정보'],['purchase','구매'],['refund','환불']
];

export const initialGa4MeasurementState={measurement:null,pending:'',error:'',message:''};

function successMessage(measurement,kind){
  if(kind!=='POST')return '';
  if(measurement?.status==='IN_FLIGHT')return '다른 확인 작업이 진행 중입니다. 저장 상태만 다시 확인할 수 있어요.';
  if(!['OBSERVED','NO_DATA','PARTIAL'].includes(measurement?.status)||!measurement?.report)return '';
  if(measurement?.runtime?.cached||measurement?.runtime?.deduplicated)return '저장된 최신 자료를 확인했습니다. 새 Google 수집 완료를 뜻하지 않습니다.';
  if(measurement?.status==='NO_DATA')return 'GA4를 새로 확인했지만 선택 범위에서 관측 자료가 없었습니다.';
  if(measurement?.status==='PARTIAL')return 'GA4 자료를 확인해 일부 관측 상태를 저장했습니다.';
  return 'GA4 자료를 새로 확인해 저장했습니다.';
}

function isKnownScopeHash(value){return typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);}

function measurementAfterCompletedRequest(previous,next){
  const canRetain=next?.report===null&&(
    next.status==='FAILED'||(next.status==='IN_FLIGHT'&&typeof next.error==='string'&&next.error.trim())
  );
  const sameKnownScope=isKnownScopeHash(previous?.scopeHash)&&previous.scopeHash===next?.scopeHash;
  if(!canRetain||!sameKnownScope||!previous?.report)return next;
  return {...next,report:previous.report,lastSuccessAt:previous.lastSuccessAt??null,previousSuccess:true};
}

export function ga4MeasurementReducer(state,action){
  if(action.type==='REQUEST_STARTED')return {...state,pending:action.kind,error:'',message:''};
  if(action.type==='REQUEST_SUCCEEDED'){
    const measurement=measurementAfterCompletedRequest(state.measurement,action.measurement);
    return {...state,measurement,pending:'',error:'',message:successMessage(measurement,action.kind)};
  }
  if(action.type==='REQUEST_FAILED')return {...state,pending:'',error:action.error||'GA4 저장 상태를 확인하지 못했습니다.',message:''};
  return state;
}

async function readPayload(response){
  let payload;
  try{payload=await response.json();}catch{throw new Error('GA4 응답을 확인하지 못했습니다. 잠시 후 다시 시도하세요.');}
  if(!response.ok||!payload?.ok||!payload.measurement)throw new Error(payload?.error||'GA4 저장 상태를 확인하지 못했습니다. 잠시 후 다시 시도하세요.');
  return payload.measurement;
}

export function createGa4MeasurementRequestController({fetchImpl=fetch,onStart=()=>{},onSuccess=()=>{},onError=()=>{}}={}){
  let alive=true;
  let epoch=0;
  let activeAbort=null;
  let refreshLocked=false;

  async function run(kind){
    if(!alive)return false;
    const isPost=kind==='POST';
    if(isPost&&refreshLocked)return false;
    if(isPost)refreshLocked=true;
    activeAbort?.abort();
    const abort=new AbortController();
    activeAbort=abort;
    const requestEpoch=++epoch;
    onStart({kind});
    try{
      const options={method:isPost?'POST':'GET',cache:'no-store',credentials:'same-origin',signal:abort.signal};
      if(isPost){options.headers={'Content-Type':'application/json'};options.body=JSON.stringify({action:'REFRESH'});}
      const measurement=await readPayload(await fetchImpl(ENDPOINT,options));
      if(!alive||requestEpoch!==epoch)return false;
      onSuccess(measurement,{kind});
      return true;
    }catch(cause){
      if(!alive||requestEpoch!==epoch||cause?.name==='AbortError')return false;
      onError(cause instanceof Error?cause:new Error('GA4 저장 상태를 확인하지 못했습니다.'),{kind});
      return false;
    }finally{
      if(isPost)refreshLocked=false;
      if(activeAbort===abort)activeAbort=null;
    }
  }

  return {
    load:()=>run('GET'),
    retry:()=>run('GET_RETRY'),
    refresh:()=>run('POST'),
    dispose(){alive=false;epoch+=1;activeAbort?.abort();activeAbort=null;}
  };
}

function shiftDate(dateString,days){
  const [year,month,day]=dateString.split('-').map(Number);
  const date=new Date(Date.UTC(year,month-1,day+days));
  return date.toISOString().slice(0,10);
}

function dateAtTimeZone(value,timeZone){
  const date=new Date(value);
  if(Number.isNaN(date.getTime())||!timeZone)return null;
  try{
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
    const part=type=>parts.find(item=>item.type===type)?.value;
    const result=`${part('year')}-${part('month')}-${part('day')}`;
    return /^\d{4}-\d{2}-\d{2}$/.test(result)?result:null;
  }catch{return null;}
}

export function reportDateRange(report){
  const timeZone=typeof report?.window?.timeZone==='string'?report.window.timeZone:null;
  if(report?.window?.startDate!=='7daysAgo'||report?.window?.endDate!=='yesterday')return {startDate:null,endDate:null,timeZone,confirmed:false};
  const fetchedDate=dateAtTimeZone(report?.fetchedAt,timeZone);
  if(!fetchedDate)return {startDate:null,endDate:null,timeZone,confirmed:false};
  const endDate=shiftDate(fetchedDate,-1);
  return {startDate:shiftDate(endDate,-6),endDate,timeZone,confirmed:true};
}

function formatCalendarDate(value){
  if(!value)return '확인 필요';
  const date=new Date(`${value}T00:00:00.000Z`);
  if(Number.isNaN(date.getTime()))return '확인 필요';
  return new Intl.DateTimeFormat('ko-KR',{timeZone:'UTC',year:'numeric',month:'numeric',day:'numeric'}).format(date);
}

function formatKst(value){
  if(!value)return '확인 필요';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return '확인 필요';
  return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date);
}

function formatCount(value,suffix){return Number.isSafeInteger(value)?`${value.toLocaleString('ko-KR')}${suffix}`:'확인 필요';}
function formatEventCount(value){return Number.isSafeInteger(value)?`${value.toLocaleString('ko-KR')}회`:'미관측';}
function formatMoney(value,currencyCode){
  if(!Number.isFinite(value)||typeof currencyCode!=='string')return '확인 필요';
  try{return new Intl.NumberFormat('ko-KR',{style:'currency',currency:currencyCode,currencyDisplay:'code',maximumFractionDigits:2}).format(value);}
  catch{return `${value.toLocaleString('ko-KR')} · 단위 확인 필요`;}
}

function statusMeta(status){return STATUS_META[status]||{label:'확인 필요',tone:'check'};}

function SetupPanel({measurement}){
  const fields=measurement?.missingFields||[];
  if(!['SETUP_REQUIRED','LOCKED'].includes(measurement?.status)||measurement?.report)return null;
  return <section className="ga4Setup" aria-labelledby="ga4SetupTitle">
    <div><span>{measurement.status==='LOCKED'?'서버 안전 스위치':'서버 설정'}</span><h4 id="ga4SetupTitle">{measurement.status==='LOCKED'?'GA4 읽기 수집이 잠겨 있어요.':'읽기 전용 연결에 필요한 항목'}</h4><p>이 화면에는 자격 증명을 입력하지 않습니다. 서버의 비공개 환경 변수 이름만 안내해요.</p></div>
    {fields.length?<dl>{fields.map(field=><div key={field}><dt>{field}</dt><dd><code>{SETUP_FIELDS[field]||'서버 설정 항목 확인 필요'}</code></dd></div>)}</dl>:<p className="ga4EmptyCopy">설정값 존재 여부와 읽기 권한을 서버에서 확인해야 합니다.</p>}
    <a href="https://developers.google.com/analytics/devguides/reporting/data/v1/property-id" target="_blank" rel="noreferrer">설정 안내 · Google 공식 문서</a>
  </section>;
}

function ReportPanel({measurement,pending,error}){
  if(!measurement){
    if(pending)return <section className="ga4NoReport"><strong>저장 자료를 확인하고 있습니다.</strong><p>서버에 저장된 GA4 관측 자료와 설정 상태를 읽는 중입니다.</p></section>;
    if(error)return <section className="ga4NoReport"><strong>저장 자료 확인 필요</strong><p>저장 상태를 조회하지 못해 자료 유무를 확인하지 못했습니다. 저장 상태 다시 확인을 사용해 주세요.</p></section>;
    return <section className="ga4NoReport"><strong>저장 상태 확인 전</strong><p>화면이 준비되면 서버에 저장된 GA4 관측 자료와 설정 상태를 확인합니다.</p></section>;
  }
  const report=measurement?.report;
  if(!report){
    if(measurement.status==='SETUP_REQUIRED')return <section className="ga4NoReport"><strong>저장 자료 확인 전</strong><p>필수 서버 설정이 없어 저장 자료 유무를 확인하지 않았습니다. 설정을 준비한 뒤 저장 상태를 다시 확인해 주세요.</p></section>;
    if(measurement.status==='LOCKED')return <section className="ga4NoReport"><strong>저장 자료 확인 불가</strong><p>서버 안전 스위치가 잠겨 있어 저장 자료 유무를 확인하지 않았습니다. 운영 정책을 확인해 주세요.</p></section>;
    if(measurement.status==='VERIFY_REQUIRED')return <section className="ga4NoReport"><strong>저장된 GA4 관측 자료가 아직 없습니다.</strong><p>수동 확인으로 저장된 상태를 만들 수 있어요. 실제 태그 동작은 GA4 DebugView에서 별도로 검증합니다.</p></section>;
    return <section className="ga4NoReport"><strong>저장 자료 확인 필요</strong><p>현재 서버 상태만으로 저장 자료 유무를 확정할 수 없습니다. 상태와 최근 시도를 확인해 주세요.</p></section>;
  }
  const range=reportDateRange(report);
  const reportStatus=statusMeta(report.status);
  const stages=STAGE_DEFINITIONS.map(([eventName,label])=>({eventName,label,eventCount:null,users:null,observed:false,...(report.stages||[]).find(stage=>stage?.eventName===eventName)}));
  return <div className="ga4Report">
    <section className="ga4ReportBasis" aria-label="GA4 보고 범위">
      <header><div><span>저장된 보고 범위 · {report.source==='GA4_DATA_API'?'GA4 Data API':'출처 확인 필요'}</span><h4>{range.confirmed?`${formatCalendarDate(range.startDate)} ~ ${formatCalendarDate(range.endDate)}`:'기간 확인 필요'}</h4><p>{range.confirmed?`GA4 속성 시간대 ${range.timeZone}에서 가져온 시각을 기준으로 계산한 7일(7daysAgo ~ yesterday)입니다.`:'보고 시간대가 없거나 유효하지 않아 7일 달력 범위를 확인해야 합니다.'}</p></div><span className="ga4ReportStatus" data-tone={reportStatus.tone}>{reportStatus.label}</span></header>
      <dl><div><dt>정확한 자사몰 호스트</dt><dd>{report.host||'확인 필요'}</dd></div><div><dt>GA4 속성 시간대</dt><dd>{report.window?.timeZone||'확인 필요'}</dd></div><div><dt>자료를 가져온 시각 · 한국</dt><dd>{formatKst(report.fetchedAt)}</dd></div><div><dt>통화 메타데이터</dt><dd>{report.currencyCode||'확인 필요'}</dd></div></dl>
      <p>이 호스트만 조회 범위에 포함합니다. 다른 결제·체크아웃 도메인까지 전체 퍼널이 연결됐다는 뜻은 아닙니다.</p>
    </section>
    <section className="ga4Stages" aria-labelledby="ga4StagesTitle"><header><div><span>단계별 이벤트</span><h4 id="ga4StagesTitle">공식몰에서 GA4가 관측한 6단계</h4></div><p>사용자 수 합계나 단계 사이 비율을 계산하지 않습니다.</p></header><div>{stages.map(stage=><article key={stage.eventName} data-ga4-stage={stage.eventName} data-observed={stage.observed===true}><span>{stage.label}</span><strong>{formatEventCount(stage.eventCount)}</strong><small>사용자 {formatCount(stage.users,'명')}</small></article>)}</div></section>
    <section className="ga4Money" aria-label="GA4 구매와 환불 기록"><article><span>GA4 기록 구매액</span><strong>{formatMoney(report.money?.grossPurchaseRevenue,report.currencyCode)}</strong><small>Cafe24 주문·정산 합계가 아닌 GA4 이벤트 값</small></article><article><span>GA4 기록 환불액</span><strong>{formatMoney(report.money?.refundAmount,report.currencyCode)}</strong><small>GA4 refund 이벤트에 기록된 값</small></article></section>
    <section className="ga4Diagnostics" aria-labelledby="ga4DiagnosticsTitle"><header><span>식별자 진단</span><h4 id="ga4DiagnosticsTitle">중복·누락 가능성 검토</h4></header><dl><div><dt>구매 ID 누락 이벤트</dt><dd>{formatCount(report.diagnostics?.missingPurchaseIdEvents,'건')}</dd></div><div><dt>환불 ID 누락 이벤트</dt><dd>{formatCount(report.diagnostics?.missingRefundIdEvents,'건')}</dd></div><div><dt>구매 중복 의심</dt><dd>{formatCount(report.diagnostics?.duplicatePurchaseIds,'건')}</dd></div><div><dt>환불 반복 검토</dt><dd>{formatCount(report.diagnostics?.repeatedRefundIds,'건')}</dd></div></dl></section>
    <section className="ga4Coverage"><span>수집 범위 진단</span><p>이벤트 {report.coverage?.events||'확인 필요'} · 거래 식별자 {report.coverage?.transactions||'확인 필요'}</p>{(report.coverage?.reasons||[]).length?<ul>{report.coverage.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul>:null}</section>
    {(report.notes||[]).length?<section className="ga4Notes"><span>GA4 응답 메모</span><ul>{report.notes.map((note,index)=><li key={`${index}-${note}`}>{note}</li>)}</ul></section>:null}
  </div>;
}

export function Ga4MeasurementView({measurement=null,pending='',error='',message='',onRefresh=()=>{},onRetry=()=>{}}){
  const meta=measurement?statusMeta(measurement.status):pending?{label:'저장 상태 확인 중',tone:'running'}:error?{label:'저장 상태 확인 실패',tone:'failed'}:{label:'확인 전',tone:'check'};
  const isPending=Boolean(pending);
  const canRetry=Boolean(error)||measurement?.status==='IN_FLIGHT';
  const scheduleStatus=!measurement?'상태 확인 필요':measurement.automation?.status==='SCHEDULED'?`${measurement.automation.schedule||'매일 05:30 (한국시간)'} 예약됨`:measurement.automation?.status==='LOCKED'?'잠금':'준비중';
  const scheduleCopy=measurement?'05:30 일정은 예약 정보이며, 실제 실행 성공을 보장하지 않습니다.':'저장 상태를 확인한 뒤 서버가 반환한 자동 확인 일정을 표시합니다.';
  return <section className="ga4Measurement" aria-labelledby="ga4MeasurementTitle" aria-busy={isPending}>
    <header className="ga4MeasurementHeader"><div><span>자사몰 · 읽기 전용</span><h3 id="ga4MeasurementTitle">자사몰 구매·환불 측정</h3><p>GA4는 공식몰의 방문·상품 조회·구매·환불 흐름을 보는 별도 분석 도구예요. Cafe24 주문·정산 자료를 가져오는 기능과 다릅니다.</p></div><span className="ga4State" data-tone={meta.tone}><i aria-hidden="true"/>{meta.label}</span></header>
    <section className="ga4PropertyAnswer"><strong>GA4 속성이 무엇인가요?</strong><p><b>속성 ID</b>는 공식몰 분석 공간을 가리키는 숫자 식별자입니다. Cafe24 쇼핑몰 ID도, G-로 시작하는 측정 ID도 아닙니다. 허브 설정이 없다는 사실만으로 공식몰 태그가 설치되지 않았다고 판단할 수 없어요.</p></section>
    <section className="ga4Trust" aria-label="GA4 측정 검증 상태"><div><span>태그 검증</span><strong>실제 구매·환불 태그 검증 필요</strong><p>API 관측만으로 purchase·refund 태그가 정확히 동작한다고 확인할 수 없습니다. 항상 <code>VERIFY_REQUIRED</code>입니다.</p></div><div><span>자동 확인 일정</span><strong>{scheduleStatus}</strong><p>{scheduleCopy}</p></div></section>
    {measurement?.runtime?.warning?<p className="ga4RuntimeWarning" role="status">{measurement.runtime.warning}</p>:null}
    {(measurement?.status==='FAILED'||(measurement?.status==='IN_FLIGHT'&&measurement.error))?<p className="ga4Failure" role="alert">{measurement.error||'최근 GA4 조회가 실패했습니다.'}{measurement.previousSuccess&&measurement.report?' 이전 성공 자료를 계속 표시합니다.':''}</p>:null}
    {measurement?.status==='STALE'?<p className="ga4Stale" role="status">저장된 성공 자료가 26시간보다 오래됐습니다. 가져온 시각과 보고 기간을 확인해 주세요.</p>:null}
    {measurement?.status==='IN_FLIGHT'?<p className="ga4InFlight" role="status">다른 읽기 작업이 아직 진행 중입니다. 완료로 표시하지 않고 저장된 자료만 유지합니다.</p>:null}
    <SetupPanel measurement={measurement}/>
    <ReportPanel measurement={measurement} pending={pending} error={error}/>
    {error?<p className="ga4RequestError" role="alert">{error} 기존 저장 자료는 그대로 유지합니다.</p>:null}
    {message?<p className="ga4RequestMessage" role="status">{message}</p>:null}
    <footer className="ga4Actions"><div><span>최근 시도 · 한국</span><strong>{formatKst(measurement?.lastAttemptAt)}</strong><small>최근 성공 · {formatKst(measurement?.lastSuccessAt)}</small></div><div>{canRetry?<button type="button" className="ga4Retry" disabled={isPending} onClick={onRetry}>{pending==='GET_RETRY'?'저장 상태 확인 중…':'저장 상태 다시 확인'}</button>:null}<button type="button" disabled={isPending||!measurement?.canRefresh} onClick={onRefresh}>{pending==='POST'?'GA4 자료 확인 중…':'GA4 자료 새로 확인'}</button></div></footer>
  </section>;
}

export default function SystemGa4Measurement({initialMeasurement=null}){
  const [state,dispatch]=useReducer(ga4MeasurementReducer,{...initialGa4MeasurementState,measurement:initialMeasurement});
  const controllerRef=useRef(null);
  useEffect(()=>{
    const controller=createGa4MeasurementRequestController({
      onStart:({kind})=>dispatch({type:'REQUEST_STARTED',kind}),
      onSuccess:(measurement,{kind})=>dispatch({type:'REQUEST_SUCCEEDED',measurement,kind}),
      onError:(cause,{kind})=>dispatch({type:'REQUEST_FAILED',error:cause.message,kind})
    });
    controllerRef.current=controller;
    if(!initialMeasurement)controller.load();
    return()=>{controller.dispose();if(controllerRef.current===controller)controllerRef.current=null;};
  },[initialMeasurement]);
  return <Ga4MeasurementView {...state} onRefresh={()=>controllerRef.current?.refresh()} onRetry={()=>controllerRef.current?.retry()}/>;
}
