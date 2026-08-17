'use client';

import { useEffect, useMemo, useState } from 'react';
import { HarinBadge, HarinButton, HarinCard, HarinEmptyState, HarinPictogram, HarinProgressiveDetails, HarinSectionHeading, HarinStateCard } from '../../../_design-system/harin-ui.js';
import requestSafety from '../../../../lib/market-intelligence/request-safety.js';

const {requestJson}=requestSafety;
const TYPE_META={
  BLOG:{label:'블로그',icon:'document',tone:'lavender'},
  CAFE:{label:'카페',icon:'customer',tone:'mint'},
  KIN:{label:'지식iN',icon:'customer',tone:'blue'},
  NEWS:{label:'뉴스',icon:'document',tone:'pink'}
};
const date=value=>value?new Date(value).toLocaleDateString('ko-KR'):'날짜 정보 없음';

export default function MarketNaverEvidenceSearch({projectId,productName}){
  const endpoint=`/api/market-intelligence/projects/${projectId}/naver-evidence`;
  const [config,setConfig]=useState(null),[query,setQuery]=useState(productName),[types,setTypes]=useState(Object.keys(TYPE_META));
  const [result,setResult]=useState(null),[loading,setLoading]=useState(true),[working,setWorking]=useState(''),[message,setMessage]=useState('');
  const savedUrls=useMemo(()=>new Set((config?.saved_sources||[]).map(item=>item.source_url).filter(Boolean)),[config]);

  async function load(signal){
    setLoading(true);
    try{const data=await requestSafety.requestJson(endpoint,{signal});setConfig(data);setQuery(current=>current===productName?(data.defaults?.query||productName):current);}
    catch(error){if(error.code!=='REQUEST_ABORTED')setMessage(`확인 필요 · ${error.message}`);}finally{setLoading(false);}
  }
  useEffect(()=>{const controller=new AbortController();load(controller.signal);return()=>controller.abort();},[projectId]);

  function toggleType(type,checked){setTypes(current=>checked?[...new Set([...current,type])]:current.filter(item=>item!==type));}

  async function search(event){
    event.preventDefault();setWorking('SEARCH');setMessage('선택 상품과 관련된 공개 검색 결과를 가져오는 중이에요.');
    try{
      const data=await requestJson(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'SEARCH',query,types,display:5,sort:'sim'}),timeoutMs:25000});
      setResult(data);setMessage(data.message||'근거 후보를 가져왔습니다.');
    }catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setWorking('');}
  }

  async function save(candidate){
    setWorking(`SAVE:${candidate.external_key}`);
    try{
      const data=await requestJson(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'SAVE',candidate})});
      setMessage(data.message);await load();window.dispatchEvent(new CustomEvent('harin:market-data-room-updated'));
    }catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setWorking('');}
  }

  const summary=config?.summary||{},items=result?.results||[];
  return <section className="marketNaverEvidenceWorkbench">
    <HarinSectionHeading eyebrow="NAVER PUBLIC EVIDENCE" title="네이버 공개 근거 후보 찾기" description={`${productName} 프로젝트에만 블로그·카페·지식iN·뉴스 후보를 모아요.`} icon="search" aside={<HarinBadge tone={config?.readiness?.configured?'success':'danger'}>{config?.readiness?.configured?'API HUB 연결됨':'연결 확인 필요'}</HarinBadge>}/>
    <section className="marketNaverEvidenceKpis">
      <HarinStateCard icon="search" label="수집 방식" value="직접 실행" description="화면을 열었다고 과금하지 않음"/>
      <HarinStateCard tone="success" icon="folder" label="저장한 후보" value={`${summary.saved||0}개`} description={`${productName} 전용 자료실`}/>
      <HarinStateCard tone={summary.review_required?'warning':'success'} icon="shield" label="원문 확인 필요" value={`${summary.review_required||0}개`} description="확인 전 분석 사용 금지"/>
      <HarinStateCard tone="neutral" icon="ai" label="외부 AI" value="사용 안 함" description="OpenAI 비용 0원"/>
    </section>
    {message?<div className="marketDataMessage" role="status"><HarinPictogram icon={message.startsWith('확인 필요')?'warning':'sparkles'} tone={message.startsWith('확인 필요')?'pink':'lavender'} size={18}/><span>{message}</span></div>:null}
    <HarinCard className="marketNaverEvidenceControl">
      <form onSubmit={search}>
        <label className="query"><span>이 상품에서 찾을 말</span><input required maxLength="100" value={query} onChange={event=>setQuery(event.target.value)} placeholder="예: 작두콩차 후기"/></label>
        <fieldset><legend>찾을 공개 자료</legend><div>{Object.entries(TYPE_META).map(([type,meta])=><label key={type}><input type="checkbox" checked={types.includes(type)} onChange={event=>toggleType(type,event.target.checked)}/><HarinPictogram icon={meta.icon} tone={meta.tone} size={17}/><span>{meta.label}</span></label>)}</div></fieldset>
        <HarinButton variant="primary" icon="search" type="submit" disabled={!types.length||working==='SEARCH'||loading}>{working==='SEARCH'?'근거 후보 찾는 중…':'공개 근거 후보 찾기'}</HarinButton>
      </form>
      <p><HarinPictogram icon="shield" tone="amber" size={16}/><span><b>검색 결과는 사실 확정이 아니에요.</b> 제목·요약·날짜·원문 링크를 보관하고, 원문을 직접 확인한 뒤에만 분석 Evidence로 사용합니다.</span></p>
    </HarinCard>
    {result?<HarinCard className="marketNaverEvidenceResults">
      <HarinSectionHeading eyebrow="SEARCH CANDIDATES" title="원문 확인할 후보" description={`검색어 “${result.query}” · ${date(result.fetched_at)}`} icon="folder" aside={<HarinBadge tone={result.errors?.length?'warning':'lavender'}>{items.length}개</HarinBadge>}/>
      {items.length?<div className="marketNaverEvidenceList">{items.map(item=>{const meta=TYPE_META[item.source_type]||TYPE_META.BLOG,isSaved=savedUrls.has(item.source_url);return <article key={item.external_key}>
        <header><HarinPictogram icon={meta.icon} tone={meta.tone} size={18}/><span><HarinBadge tone={meta.tone}>{meta.label}</HarinBadge><small>{date(item.published_at)} · {item.source_name}</small></span></header>
        <b>{item.title}</b><p>{item.description}</p>
        <footer><HarinButton as="a" href={item.source_url} target="_blank" rel="noreferrer" variant="ghost" size="small" icon="link">원문 열기</HarinButton><HarinButton variant={isSaved?'ghost':'secondary'} size="small" icon={isSaved?'shield':'folder'} disabled={isSaved||Boolean(working)} onClick={()=>save(item)}>{working===`SAVE:${item.external_key}`?'저장 중…':isSaved?'저장됨':'근거 후보 저장'}</HarinButton></footer>
      </article>;})}</div>:<HarinEmptyState icon="search" title="검색 결과가 없어요" description="상품 이름을 조금 짧게 바꾸거나 다른 표현으로 다시 찾아보세요."/>}
      {result.errors?.length?<HarinProgressiveDetails eyebrow="일부 수집 확인" title="가져오지 못한 출처" description="성공한 출처는 그대로 사용할 수 있어요." count={`${result.errors.length}개`}><ul className="marketNaverEvidenceErrors">{result.errors.map(error=><li key={`${error.source_type}-${error.code}`}><b>{error.source_label}</b><span>{error.message}</span></li>)}</ul></HarinProgressiveDetails>:null}
    </HarinCard>:<HarinEmptyState className="marketNaverEvidenceStart" icon="search" title="필요할 때만 후보를 찾아요" description="검색 버튼을 누르기 전에는 API를 호출하지 않습니다."/>}
  </section>;
}
