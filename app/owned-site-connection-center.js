'use client';

import {useState} from 'react';
import HarinIcon from './_design-system/harin-icon.js';

const STATUS={
  READY:{label:'정상 연결',tone:'ready'},NO_DATA:{label:'표본 없음',tone:'partial'},FAILED:{label:'다시 확인',tone:'failed'},
  VERIFY_REQUIRED:{label:'읽기 확인 필요',tone:'verify'},SETUP_REQUIRED:{label:'설정 필요',tone:'setup'},LOCKED:{label:'사용 중지',tone:'locked'},
  NOT_TESTED:{label:'미검증',tone:'verify'},NOT_APPLICABLE:{label:'해당 없음',tone:'muted'}
};
const wait=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
const KST_DATE_TIME=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'});

function StatusBadge({status}){const item=STATUS[status]||{label:status||'확인 필요',tone:'muted'};return <span className={`naverApiStatus ${item.tone}`}><i aria-hidden="true"/>{item.label}</span>;}
function DateValue({value}){return value?<time dateTime={value}>{KST_DATE_TIME.format(new Date(value))}</time>:<span>아직 기록 없음</span>;}

function ServiceCard({service,working,onProbe}){
  const isWorking=working===service.key;
  return <article className={`naverApiServiceCard ${String(service.status||'').toLowerCase()}`}>
    <header><span className="naverApiServiceIcon"><HarinIcon name={service.icon} size={24}/></span><div><small>SERVER READ-ONLY</small><h2>{service.label}</h2><p>{service.subtitle}</p></div><StatusBadge status={service.status}/></header>
    <div className="naverApiServiceSummary"><strong>{service.summary}</strong><p>{service.errorMessage||service.detail}{service.previousSuccess?' · 이전 성공 자료는 보존 중입니다.':''}</p></div>
    <dl className="naverApiDates"><div><dt>마지막 성공</dt><dd><DateValue value={service.lastSuccessAt}/></dd></div><div><dt>마지막 확인</dt><dd><DateValue value={service.lastAttemptAt}/></dd></div></dl>
    <section className="naverApiChecks" aria-label={`${service.label} 준비 상태`}>{service.checks.map(item=><div key={item.key}><span>{item.label}</span><StatusBadge status={item.status}/></div>)}</section>
    <details className="naverApiCapabilities"><summary><span><HarinIcon name="checklist" size={19}/><b>수집 범위 자세히</b></span><em>열기</em></summary><div>{service.capabilities.map(item=><div key={item.key}><span>{item.label}</span><StatusBadge status={item.readStatus}/><StatusBadge status={item.writeStatus}/></div>)}</div></details>
    <button type="button" className="naverApiProbeButton" disabled={Boolean(working)||isWorking||service.status==='LOCKED'} onClick={()=>onProbe(service)}><HarinIcon name={isWorking?'sync':'shield'} size={20}/>{isWorking?'읽기 자료 확인 중…':service.action.label}</button>
  </article>;
}

export default function OwnedSiteConnectionCenter({center}){
  const [working,setWorking]=useState('');const [message,setMessage]=useState('');const services=center?.services||[];
  async function probe(service){setWorking(service.key);setMessage(`${service.label} 읽기 자료를 확인하고 있어요.`);try{const response=await fetch(service.action.endpoint,{method:'POST',headers:{Accept:'application/json'}});const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.error||'연결 확인 요청을 처리하지 못했습니다.');setMessage(payload.result?.status==='NO_DATA'?`${service.label} 연결은 됐지만 아직 충분한 표본이 없어요.`:`${service.label} 읽기 연결을 확인했습니다. 최신 화면으로 바꿀게요.`);await wait(800);window.location.reload();}catch(error){setMessage(`확인 필요 · ${error.message}`);setWorking('');}}
  return <section className="naverApiCenter ownedSiteApiCenter">
    <header className="naverApiHero"><div className="naverApiHeroIcon"><HarinIcon name="growth" size={30}/></div><div><span>PHASE {center?.phase||'19-1'} · OWNED SITE SIGNALS</span><h1>자사몰 유입·전환 API 센터</h1><p>검색 유입, 방문, 모바일 속도, 실제 사용성을 한곳에서 확인하되 공급자 자료는 서로 섞지 않아요.</p></div><aside><span><b>{center?.summary?.ready||0}</b>개 정상</span><span><b>{center?.summary?.attention||0}</b>개 확인</span></aside></header>
    {message?<div className="naverApiToast" role="status" aria-live="polite"><HarinIcon name={working?'sync':'note'} size={20}/><span>{message}</span></div>:null}
    <section className="naverApiRules"><HarinIcon name="shield" size={23}/><div><b>고객정보 없이 집계값만 안전하게 읽어요</b><p>이 화면은 자사몰 설정을 바꾸지 않습니다. 연결 실패 시 이전 성공 자료를 유지하고 0으로 덮어쓰지 않아요.</p></div></section>
    <div className="naverApiGrid ownedSiteApiGrid">{services.map(service=><ServiceCard key={service.key} service={service} working={working} onProbe={probe}/>)}</div>
    <details className="naverApiHelp"><summary><span><HarinIcon name="note" size={20}/><b>연결 순서와 판단 기준 보기</b></span><em>열기</em></summary><ol>{(center?.rules||[]).map(rule=><li key={rule}>{rule}</li>)}</ol></details>
  </section>;
}
