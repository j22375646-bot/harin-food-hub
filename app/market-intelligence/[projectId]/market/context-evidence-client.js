'use client';

import {useEffect,useMemo,useState} from 'react';
import {HarinBadge,HarinButton,HarinCard,HarinEmptyState,HarinPictogram,HarinProgressiveDetails,HarinSectionHeading,HarinStateCard} from '../../../_design-system/harin-ui.js';
import requestSafety from '../../../../lib/market-intelligence/request-safety.js';

const META={
  KAMIS_PRICE:{label:'KAMIS 원재료 가격',short:'가격',icon:'price',tone:'amber'},
  KMA_WEATHER:{label:'기상청 중기예보',short:'날씨',icon:'clock',tone:'blue'},
  YOUTUBE_SEARCH:{label:'YouTube 공개 영상',short:'영상',icon:'image',tone:'pink'}
};
const STATUS={READY:{label:'최근 자료 있음',tone:'success'},PARTIAL:{label:'일부 확인',tone:'warning'},STALE:{label:'이전 자료 보존',tone:'warning'},NO_DATA:{label:'자료 없음',tone:'neutral'},FAILED:{label:'확인 실패',tone:'danger'},VERIFY_REQUIRED:{label:'첫 확인 필요',tone:'warning'},SETUP_REQUIRED:{label:'마지막에 키 연결',tone:'neutral'},LOCKED:{label:'사용 중지',tone:'danger'}};
const displayDate=value=>value?new Date(value).toLocaleDateString('ko-KR'):'기준일 확인 필요';

export default function MarketContextEvidence({projectId,productName}){
  const endpoint=`/api/market-intelligence/projects/${projectId}/context-evidence`;
  const [config,setConfig]=useState(null),[priceQuery,setPriceQuery]=useState(''),[videoQuery,setVideoQuery]=useState(productName),[providers,setProviders]=useState(Object.keys(META));
  const [result,setResult]=useState(null),[loading,setLoading]=useState(true),[working,setWorking]=useState(''),[message,setMessage]=useState('');
  const savedUrls=useMemo(()=>new Set((config?.saved_sources||[]).map(item=>item.source_url).filter(Boolean)),[config]);
  async function load(signal){setLoading(true);try{const data=await requestSafety.requestJson(endpoint,{signal});setConfig(data);setPriceQuery(current=>current||data.defaults?.price_query||productName);setVideoQuery(current=>current===productName?(data.defaults?.video_query||productName):current);}catch(error){if(error.code!=='REQUEST_ABORTED')setMessage(`확인 필요 · ${error.message}`);}finally{setLoading(false);}}
  useEffect(()=>{const controller=new AbortController();load(controller.signal);return()=>controller.abort();},[projectId]);
  function toggle(provider,checked){setProviders(current=>checked?[...new Set([...current,provider])]:current.filter(item=>item!==provider));}
  async function collect(event){event.preventDefault();setWorking('COLLECT');setMessage('선택 상품의 가격·날씨·공개 영상 후보를 공급자별로 확인하고 있어요.');try{const data=await requestSafety.requestJson(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'COLLECT',price_query:priceQuery,video_query:videoQuery,providers}),timeoutMs:45000});setResult(data);setMessage(data.candidates?.length?`시장 근거 후보 ${data.candidates.length}개를 확인했어요.`:'조건에 맞는 후보가 없어요. 자료 없음과 설정 필요를 공급자별로 확인해주세요.');await load();}catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setWorking('');}}
  async function save(candidate){setWorking(`SAVE:${candidate.external_key}`);try{const data=await requestSafety.requestJson(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'SAVE',candidate})});setMessage(data.message);await load();window.dispatchEvent(new CustomEvent('harin:market-data-room-updated'));}catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setWorking('');}}
  const providerRows=config?.providers||[],configured=providerRows.filter(item=>item.configured&&item.enabled).length,candidates=result?.candidates||[];
  return <section className="marketContextEvidenceWorkbench">
    <HarinSectionHeading eyebrow="PHASE 19-5 · MARKET CONTEXT" title="시장·계절 근거" description={`${productName}의 원재료 가격, 광주·전남 날씨, 공개 영상 후보를 따로 확인해요.`} icon="growth" aside={<HarinBadge tone={configured?'lavender':'neutral'}>{configured}/3 연결 준비</HarinBadge>}/>
    <section className="marketContextEvidenceKpis">
      {providerRows.map(item=>{const state=STATUS[item.status]||STATUS.VERIFY_REQUIRED;return <HarinStateCard key={item.provider} tone={state.tone} icon={item.icon} label={item.label} value={state.label} description={item.detail}/>;})}
      <HarinStateCard tone="success" icon="folder" label="이 상품 저장 근거" value={`${config?.summary?.saved||0}개`} description="다른 상품 자료와 섞지 않음"/>
    </section>
    {message?<div className="marketDataMessage" role="status"><HarinPictogram icon={message.startsWith('확인 필요')?'warning':'sparkles'} tone={message.startsWith('확인 필요')?'pink':'lavender'} size={18}/><span>{message}</span></div>:null}
    <HarinCard className="marketContextEvidenceControl">
      <form onSubmit={collect}>
        <section className="marketContextEvidenceFields">
          <label><span>원재료 가격 검색어</span><input required maxLength="80" value={priceQuery} onChange={event=>setPriceQuery(event.target.value)} placeholder="예: 작두콩"/><small>KAMIS 품목명과 맞는 짧은 원재료명으로 확인해요.</small></label>
          <label><span>YouTube 검색어</span><input required maxLength="100" value={videoQuery} onChange={event=>setVideoQuery(event.target.value)} placeholder="예: 작두콩차"/><small>공개 영상 제목·설명만 가져오며 댓글과 시청자 정보는 수집하지 않아요.</small></label>
          <label className="region"><span>기상 지역</span><input readOnly value={config?.defaults?.weather_region||'광주·전남'}/><small>선택 상품과 분리된 계절 맥락이며 매출 원인으로 단정하지 않아요.</small></label>
        </section>
        <fieldset><legend>이번에 확인할 자료</legend><div>{Object.entries(META).map(([provider,item])=><label key={provider}><input type="checkbox" checked={providers.includes(provider)} onChange={event=>toggle(provider,event.target.checked)}/><HarinPictogram icon={item.icon} tone={item.tone} size={16}/><span>{item.short}</span></label>)}</div></fieldset>
        <footer><span><HarinPictogram icon="shield" tone="mint" size={16}/><small>화면을 여는 것만으로 외부 API를 호출하지 않아요. 사장님이 저장한 후보만 Evidence로 이동합니다.</small></span><HarinButton type="submit" variant="primary" icon="search" disabled={loading||working||providers.length===0}>{working==='COLLECT'?'공급자별 확인 중…':'선택 자료 확인'}</HarinButton></footer>
      </form>
      <HarinProgressiveDetails eyebrow="키 입력 유예" title="연결 준비 상태와 안전 기준" description="API 키는 18~21단계 완료 후 한 번에 입력합니다." count={`${3-configured}개 남음`}>
        <ul className="marketContextEvidenceSetup">{providerRows.map(item=><li key={item.provider}><HarinPictogram icon={item.icon} tone={META[item.provider]?.tone||'lavender'} size={16}/><span><b>{item.label}</b><small>{item.missing_fields?.length?item.missing_fields.join(' · '):item.summary}</small></span></li>)}</ul>
      </HarinProgressiveDetails>
    </HarinCard>
    {result?<HarinCard className="marketContextEvidenceResults">
      <HarinSectionHeading eyebrow="REVIEW QUEUE" title="확인할 후보" description="가격·날씨·영상은 참고 맥락입니다. 관련성을 확인한 항목만 상품 Evidence에 저장하세요." aside={<HarinBadge tone="neutral">{candidates.length}개</HarinBadge>}/>
      {candidates.length?<section className="marketContextEvidenceList">{candidates.map(candidate=>{const item=META[candidate.provider]||META.KAMIS_PRICE,saved=savedUrls.has(candidate.source_url);return <article key={candidate.external_key}>
        <HarinPictogram icon={item.icon} tone={item.tone} size={19}/><header><HarinBadge tone={item.tone}>{item.short}</HarinBadge><small>{candidate.source_name} · {displayDate(candidate.source_date)}</small></header><b>{candidate.title}</b><p>{candidate.summary}</p>
        <footer><HarinButton as="a" href={candidate.source_url} target="_blank" rel="noreferrer" variant="ghost" icon="link">원문 보기</HarinButton><HarinButton variant="secondary" icon="folder" disabled={saved||Boolean(working)} onClick={()=>save(candidate)}>{saved?'저장됨':working===`SAVE:${candidate.external_key}`?'저장 중…':'Evidence 후보 저장'}</HarinButton></footer>
      </article>;})}</section>:<HarinEmptyState icon="search" title="조건에 맞는 후보가 없어요" description="공급자 설정 또는 검색어를 확인하세요. 자료 없음은 0이나 정상으로 바꾸지 않습니다."/>}
      {result.errors?.length?<HarinProgressiveDetails eyebrow="공급자별 확인" title="가져오지 못한 시장 자료" description="성공한 공급자의 후보는 그대로 사용할 수 있어요." count={`${result.errors.length}개`}><ul className="marketNaverEvidenceErrors">{result.errors.map((error,index)=><li key={`${error.provider}-${error.code}-${index}`}><b>{error.label}</b><span>{error.message}</span></li>)}</ul></HarinProgressiveDetails>:null}
    </HarinCard>:<HarinEmptyState className="marketContextEvidenceStart" icon="growth" title="시장 자료는 필요할 때만 확인해요" description="자동 수집과 자동 판단 없이, 선택 상품별로 사장님이 직접 확인합니다."/>}
  </section>;
}
