'use client';

import {useState} from 'react';
import HarinIcon from './_design-system/harin-icon.js';

const STATUS={READY:['정상','ready'],PARTIAL:['부분 확인','partial'],FAILED:['다시 확인','failed'],VERIFY_REQUIRED:['읽기 확인 필요','verify'],SETUP_REQUIRED:['설정 필요','setup'],LOCKED:['사용 중지','locked'],APPROVAL_REQUIRED:['승인 후 실행','approval'],NO_DATA:['표본 없음','partial'],NOT_TESTED:['미검증','verify'],NOT_APPLICABLE:['해당 없음','muted']};
const KST=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'});
const wait=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
function Status({value}){const [label,tone]=STATUS[value]||[value||'확인 필요','muted'];return <span className={`naverApiStatus ${tone}`}><i aria-hidden="true"/>{label}</span>;}
function DateValue({value}){return value?<time dateTime={value}>{KST.format(new Date(value))}</time>:<span>기록 없음</span>;}

function HealthCard({service,working,onProbe}){
  const busy=working===service.key;
  const setupBlocked=service.status==='SETUP_REQUIRED'&&service.key!=='vercel';
  return <article className={`naverApiServiceCard operationsHealthCard ${String(service.status||'').toLowerCase()}`}>
    <header><span className="naverApiServiceIcon"><HarinIcon name={service.icon} size={24}/></span><div><small>READ-ONLY HEALTH SIGNAL</small><h2>{service.label}</h2><p>{service.subtitle}</p></div><Status value={service.status}/></header>
    <div className="naverApiServiceSummary"><strong>{service.summary}</strong><p>{service.errorMessage||service.detail}{service.previousSuccess?' · 이전 성공 자료는 보존 중입니다.':''}</p></div>
    {service.highlights?.length?<section className="operationsHealthHighlights" aria-label={`${service.label} 핵심 상태`}>{service.highlights.map(item=><span key={item.label}><small>{item.label}</small><b>{item.value}</b></span>)}</section>:null}
    <dl className="naverApiDates"><div><dt>마지막 성공</dt><dd><DateValue value={service.lastSuccessAt}/></dd></div><div><dt>마지막 확인</dt><dd><DateValue value={service.lastAttemptAt}/></dd></div></dl>
    <section className="naverApiChecks" aria-label={`${service.label} 상태`}>{service.checks.map(item=><div key={item.key}><span>{item.label}</span><Status value={item.status}/></div>)}</section>
    <details className="naverApiCapabilities"><summary><span><HarinIcon name="checklist" size={19}/><b>확인 범위 자세히</b></span><em>열기</em></summary><div>{service.capabilities.map(item=><div key={item.key}><span>{item.label}</span><Status value={item.readStatus}/><Status value={item.writeStatus}/></div>)}</div></details>
    {service.action?<button type="button" className="naverApiProbeButton" disabled={Boolean(working)||setupBlocked||service.status==='LOCKED'} onClick={()=>onProbe(service)}><HarinIcon name={busy?'sync':'shield'} size={20}/>{busy?'운영 신호 확인 중…':service.action.label}</button>:<div className="operationsHealthPassive"><HarinIcon name="server" size={19}/><span>워커가 자동으로 보내는 신호예요.</span></div>}
  </article>;
}

export default function OperationsHealthCenter({center}){
  const [working,setWorking]=useState('');const [message,setMessage]=useState('');const services=center?.services||[];const infrastructure=center?.infrastructureServices||services.filter(item=>item.group==='infrastructure');const releaseAlerts=center?.releaseAlertServices||services.filter(item=>item.group==='release-alerts');
  async function probe(service){setWorking(service.key);setMessage(`${service.label} 읽기 신호를 확인하고 있어요.`);try{const response=await fetch(service.action.endpoint,{method:'POST',headers:{Accept:'application/json'}});const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.error||'운영 상태를 확인하지 못했습니다.');setMessage(payload.result?.status==='PARTIAL'?`${service.label}에서 확인 가능한 신호만 안전하게 저장했어요.`:`${service.label} 운영 신호를 확인했어요. 최신 화면으로 바꿀게요.`);await wait(700);window.location.reload();}catch(error){setMessage(`확인 필요 · ${error.message}`);setWorking('');}}
  return <section className="naverApiCenter operationsHealthCenter">
    <header className="naverApiHero"><div className="naverApiHeroIcon"><HarinIcon name="server" size={30}/></div><div><span>PHASE {center?.phase||'20-4'} · OPERATIONS HEALTH</span><h1>서버·릴리스·운영 알림 상태</h1><p>허브 내부 서버부터 GitHub 릴리스, 외부 가동 감시와 알림 준비 상태까지 서로 섞지 않고 확인해요.</p></div><aside><span><b>{center?.summary?.ready||0}</b>개 정상</span><span><b>{center?.summary?.attention||0}</b>개 확인</span></aside></header>
    {message?<div className="naverApiToast" role="status" aria-live="polite"><HarinIcon name={working?'sync':'note'} size={20}/><span>{message}</span></div>:null}
    <section className="naverApiRules"><HarinIcon name="shield" size={23}/><div><b>원문 로그와 고객정보 없이 운영 신호만 모아요</b><p>한 공급자가 실패해도 다른 신호와 허브는 계속 열리며, 실패 값을 정상이나 0으로 꾸미지 않아요.</p></div></section>
    <section className="operationsHealthSection"><header className="operationsHealthSectionHead"><span className="naverApiServiceIcon"><HarinIcon name="server" size={22}/></span><div><small>INFRASTRUCTURE</small><h2>운영 기반</h2><p>서울 고정 IP 워커, AWS와 Vercel 상태를 확인해요.</p></div></header><div className="naverApiGrid operationsHealthGrid">{infrastructure.map(service=><HealthCard key={service.key} service={service} working={working} onProbe={probe}/>)}</div></section>
    <section className="operationsHealthSection"><header className="operationsHealthSectionHead release"><span className="naverApiServiceIcon"><HarinIcon name="alerts" size={22}/></span><div><small>RELEASE &amp; ALERTS</small><h2>릴리스·외부 감시·알림</h2><p>GitHub 기준 버전과 외부 장애 감시, 모바일·이메일 알림 준비 상태를 확인해요.</p></div></header><div className="naverApiGrid operationsReleaseGrid">{releaseAlerts.map(service=><HealthCard key={service.key} service={service} working={working} onProbe={probe}/>)}</div></section>
    <details className="naverApiHelp"><summary><span><HarinIcon name="note" size={20}/><b>운영 상태 판단 기준 보기</b></span><em>열기</em></summary><ol>{(center?.rules||[]).map(rule=><li key={rule}>{rule}</li>)}</ol></details>
  </section>;
}
