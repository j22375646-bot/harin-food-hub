'use client';

import { useState } from 'react';
import HarinIcon from './_design-system/harin-icon.js';

const STATUS = {
  READY:{ label:'정상 연결', tone:'ready' }, PARTIAL:{ label:'일부 확인', tone:'partial' },
  RUNNING:{ label:'확인 중', tone:'running' }, FAILED:{ label:'다시 확인', tone:'failed' },
  VERIFY_REQUIRED:{ label:'읽기 확인 필요', tone:'verify' }, SETUP_REQUIRED:{ label:'설정 필요', tone:'setup' },
  LOCKED:{ label:'잠금', tone:'locked' }, OWNER_APPROVAL:{ label:'승인 후 가능', tone:'approval' },
  NOT_APPLICABLE:{ label:'해당 없음', tone:'muted' }, NOT_TESTED:{ label:'미검증', tone:'verify' }
};

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const KST_DATE_TIME = new Intl.DateTimeFormat('ko-KR', {
  timeZone:'Asia/Seoul', month:'numeric', day:'numeric', hour:'numeric', minute:'2-digit'
});

async function json(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok && response.status !== 202) throw new Error(payload.error || '연결 확인 요청을 처리하지 못했습니다.');
  return payload;
}

async function fixedIpResult(response) {
  const initial = await json(response);
  if (response.status !== 202 || !initial.request?.id) return initial;
  for (let attempt = 0; attempt < 90; attempt += 1) {
    await wait(750);
    const statusResponse = await fetch(`/api/coupang/operations/${initial.request.id}`, { cache:'no-store' });
    if (statusResponse.status === 202) continue;
    return json(statusResponse);
  }
  throw new Error('서울 고정 IP 서버의 응답 시간이 초과됐습니다. 잠시 뒤 다시 확인해주세요.');
}

function StatusBadge({ status }) {
  const item = STATUS[status] || { label:status || '확인 필요', tone:'muted' };
  return <span className={`naverApiStatus ${item.tone}`}><i aria-hidden="true"/>{item.label}</span>;
}

function DateValue({ value }) {
  if (!value) return <span>아직 기록 없음</span>;
  const formatted = KST_DATE_TIME.format(new Date(value));
  return <time dateTime={value}>{formatted}</time>;
}

function ServiceCard({ service, working, onProbe }) {
  const isWorking = working === service.key || service.status === 'RUNNING';
  const quotaPercent = service.quota ? Math.min(100, (service.quota.used / service.quota.limit) * 100) : 0;
  return <article className={`naverApiServiceCard ${String(service.status || '').toLowerCase()}`}>
    <header>
      <span className="naverApiServiceIcon"><HarinIcon name={service.icon} size={24}/></span>
      <div><small>{service.fixedIp?'SEOUL FIXED IP':'SERVER READ-ONLY'}</small><h2>{service.label}</h2><p>{service.subtitle}</p></div>
      <StatusBadge status={service.status}/>
    </header>
    <div className="naverApiServiceSummary">
      <strong>{service.summary}</strong>
      {service.errorMessage?<p>{service.errorMessage}</p>:<p>{service.previousSuccess?'이전 성공 기록은 보존되어 있어요.':'플랫폼별 기록을 따로 보관합니다.'}</p>}
    </div>
    <dl className="naverApiDates">
      <div><dt>마지막 성공</dt><dd><DateValue value={service.lastSuccessAt}/></dd></div>
      <div><dt>마지막 확인</dt><dd><DateValue value={service.lastAttemptAt}/></dd></div>
    </dl>
    <section className="naverApiChecks" aria-label={`${service.label} 준비 상태`}>
      {service.checks.map(item=><div key={item.key}><span>{item.label}</span><StatusBadge status={item.status}/></div>)}
    </section>
    <details className="naverApiCapabilities">
      <summary><span><HarinIcon name="checklist" size={19}/><b>읽기 범위 자세히</b></span><em>열기</em></summary>
      <div>{service.capabilities.map(item=><div key={item.key}><span>{item.label}</span><StatusBadge status={item.readStatus}/><StatusBadge status={item.writeStatus}/></div>)}</div>
    </details>
    {service.quota?<section className="naverApiQuota">
      <header><span><b>{service.quota.label}</b><small>{service.quota.source} · 콘솔 외 호출 미포함</small></span><strong>{service.quota.used.toLocaleString('ko-KR')} / {service.quota.limit.toLocaleString('ko-KR')}회</strong></header>
      <div aria-label={`사용률 ${quotaPercent.toFixed(1)}%`}><i style={{ width:`${quotaPercent}%` }}/></div>
    </section>:null}
    <button type="button" className="naverApiProbeButton" disabled={Boolean(working) || isWorking} onClick={()=>onProbe(service)}>
      <HarinIcon name={isWorking?'sync':'shield'} size={20}/>{isWorking?'읽기 권한 확인 중…':service.action.label}
    </button>
  </article>;
}

export default function NaverApiConnectionCenter({ center }) {
  const [working,setWorking] = useState('');
  const [message,setMessage] = useState('');
  const services = center?.services || [];

  async function probe(service) {
    setWorking(service.key);
    setMessage(`${service.label} 읽기 권한을 확인하고 있어요.`);
    try {
      const response = await fetch(service.action.endpoint, { method:'POST', headers:{ Accept:'application/json' } });
      const result = service.fixedIp ? await fixedIpResult(response) : await json(response);
      const probeResult = result.naverCommerce || result.result || result;
      setMessage(probeResult.status === 'PARTIAL'
        ? `${service.label} 일부 권한을 확인했습니다. 실패 항목을 다시 살펴봐주세요.`
        : `${service.label} 읽기 연결을 확인했습니다. 화면을 최신 상태로 바꿀게요.`);
      await wait(850);
      window.location.reload();
    } catch (error) {
      setMessage(`확인 필요 · ${error.message}`);
      setWorking('');
    }
  }

  return <section className="naverApiCenter">
    <header className="naverApiHero">
      <div className="naverApiHeroIcon"><HarinIcon name="naver" size={30}/></div>
      <div><span>PHASE 18-1 · NAVER CONNECTIONS</span><h1>네이버 API 연결센터</h1><p>커머스, 검색광고, API HUB를 섞지 않고 각각 읽기 상태와 사용 준비도를 확인해요.</p></div>
      <aside><span><b>{center?.summary?.ready || 0}</b>개 정상</span><span><b>{center?.summary?.attention || 0}</b>개 확인</span></aside>
    </header>
    {message?<div className="naverApiToast" role="status" aria-live="polite"><HarinIcon name={working?'sync':'note'} size={20}/><span>{message}</span></div>:null}
    <section className="naverApiRules">
      <HarinIcon name="shield" size={23}/><div><b>안전하게 읽기부터 확인해요</b><p>아래 버튼은 플랫폼 값을 바꾸지 않습니다. 입찰가·상품·주문 변경은 별도 승인과 쓰기 잠금 해제가 필요해요.</p></div>
    </section>
    <div className="naverApiGrid">{services.map(service=><ServiceCard key={service.key} service={service} working={working} onProbe={probe}/>)}</div>
    <details className="naverApiHelp">
      <summary><span><HarinIcon name="note" size={20}/><b>이 화면은 어떻게 보면 되나요?</b></span><em>열기</em></summary>
      <ol>{(center?.rules || []).map(rule=><li key={rule}>{rule}</li>)}</ol>
    </details>
  </section>;
}
