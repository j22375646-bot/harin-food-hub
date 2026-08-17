'use client';

import {useMemo,useState} from 'react';
import HarinIcon from './_design-system/harin-icon.js';

const STATUS={
  READY:['사용 가능','ready'],NOT_TESTED:['확인 전','muted'],SETUP_REQUIRED:['키 입력 대기','setup'],
  LOCKED:['사용 잠금','locked'],READ_PROBE_REQUIRED:['첫 읽기 확인 필요','verify'],FREE_FIRST:['무료 먼저','ready']
};

function Status({value}){
  const [label,tone]=STATUS[value]||[value||'확인 필요','muted'];
  return <span className={`naverApiStatus ${tone}`}><i aria-hidden="true"/>{label}</span>;
}

function DecisionFlow({provider,gapConfirmed}){
  return <div className="providerDecisionFlow" aria-label={`${provider.label} 사용 판단 순서`}>
    <span className="done"><i>1</i><b>무료 확인</b><small>{provider.freeReady?'사용 가능':'연결 필요'}</small></span>
    <HarinIcon name="chevron" size={17}/>
    <span className={gapConfirmed?'done':'current'}><i>2</i><b>부족 확인</b><small>{gapConfirmed?'사장님 확인':'아직 미확인'}</small></span>
    <HarinIcon name="chevron" size={17}/>
    <span className={gapConfirmed?'current':''}><i>3</i><b>유료 후보</b><small>{gapConfirmed?'설정 검토':'잠금 유지'}</small></span>
  </div>;
}

function ProviderCard({provider,gapConfirmed,onToggle}){
  const visibleStatus=gapConfirmed?provider.status:'FREE_FIRST';
  return <article className={`providerFallbackCard ${provider.tone}`}>
    <header>
      <span className="providerFallbackIcon"><HarinIcon name={provider.icon} size={26}/></span>
      <div><small>{provider.category}</small><h2>{provider.label}</h2><p>{provider.subtitle}</p></div>
      <Status value={visibleStatus}/>
    </header>
    <DecisionFlow provider={provider} gapConfirmed={gapConfirmed}/>
    <section className="providerFreeSources">
      <b><HarinIcon name="shield" size={18}/> 무료·공식 기능 먼저</b>
      {provider.freeSources.map(source=><a key={source.label} href={source.route}><span>{source.label}</span><Status value={source.status}/></a>)}
    </section>
    <label className={`providerGapCheck${gapConfirmed?' checked':''}`}>
      <input type="checkbox" checked={gapConfirmed} onChange={event=>onToggle(provider.key,event.target.checked)}/>
      <span><b>무료 자료만으로는 부족해요</b><small>실제 부족한 분석 항목이 있을 때만 선택해주세요.</small></span>
    </label>
    <div className={`providerPaidCandidate${gapConfirmed?' visible':''}`}>
      <div><b>{provider.activateWhen}</b><p>{provider.summary}</p></div>
      <span className="providerCost"><HarinIcon name="price" size={18}/><b>{provider.priceLabel}</b></span>
      <span className="providerPrivacy"><HarinIcon name="shield" size={18}/><b>{provider.privacy}</b></span>
      <div className="providerCandidateActions">
        <a href={provider.officialUrl} target="_blank" rel="noreferrer"><HarinIcon name="document" size={18}/>공식 문서</a>
        <a href={provider.priceUrl} target="_blank" rel="noreferrer"><HarinIcon name="price" size={18}/>공식 요금</a>
        <button type="button" disabled><HarinIcon name="key" size={18}/>{provider.credentialReady?'첫 읽기 검증 대기':'키는 전체 계획 종료 후 입력'}</button>
      </div>
    </div>
  </article>;
}

export default function ProviderFallbackCenter({center={}}){
  const [selected,setSelected]=useState('all');
  const [gaps,setGaps]=useState({});
  const providers=useMemo(()=>selected==='all'?(center.providers||[]):(center.providers||[]).filter(item=>item.capability===selected),[center.providers,selected]);
  const confirmed=Object.values(gaps).filter(Boolean).length;
  const toggle=(key,value)=>setGaps(current=>({...current,[key]:value}));
  return <section className="naverApiCenter providerFallbackCenter">
    <header className="naverApiHero providerFallbackHero">
      <div className="naverApiHeroIcon"><HarinIcon name="filter" size={30}/></div>
      <div><span>PHASE {center.phase||'19-8'} · FREE FIRST</span><h1>유료 보완 API 판단센터</h1><p>무료 자료로 해결되는지 먼저 확인하고, 꼭 부족한 기능만 유료 후보로 열어봐요.</p></div>
      <aside><span><b>{center.summary?.active||0}</b>개 사용</span><span><b>{Number(center.summary?.currentCost||0).toLocaleString('ko-KR')}원</b>현재 비용</span></aside>
    </header>
    <section className="providerFallbackSummary">
      <span><HarinIcon name="shield" size={21}/><b>기본 잠금</b><small>페이지를 열어도 외부 호출 0건</small></span>
      <span><HarinIcon name="checklist" size={21}/><b>부족 확인 {confirmed}건</b><small>화면에서만 임시 선택</small></span>
      <span><HarinIcon name="key" size={21}/><b>키 입력 유예</b><small>18~21단계 종료 후 한 번에</small></span>
    </section>
    <nav className="providerFallbackFilters" aria-label="유료 보완 종류">
      {[['all','전체','filter'],['search','보완 검색','search'],['ocr','문서 OCR','scan'],['seo','경쟁 SEO','analysis']].map(([id,label,icon])=><button key={id} type="button" aria-pressed={selected===id} className={selected===id?'selected':''} onClick={()=>setSelected(id)}><HarinIcon name={icon} size={18}/>{label}</button>)}
    </nav>
    <div className="providerFallbackGrid">{providers.map(provider=><ProviderCard key={provider.key} provider={provider} gapConfirmed={Boolean(gaps[provider.key])} onToggle={toggle}/>)}</div>
    <details className="naverApiHelp"><summary><span><HarinIcon name="note" size={20}/><b>이 화면의 비용·개인정보 원칙</b></span><em>열기</em></summary><ol>{(center.rules||[]).map(rule=><li key={rule}>{rule}</li>)}</ol></details>
  </section>;
}
