'use client';

import {useEffect,useMemo,useState} from 'react';
import {HarinBadge,HarinButton,HarinCard,HarinEmptyState,HarinPictogram,HarinProgressiveDetails,HarinSectionHeading,HarinStateCard} from '../../../_design-system/harin-ui.js';
import requestSafety from '../../../../lib/market-intelligence/request-safety.js';

const META={
  PUBMED:{label:'PubMed',short:'논문 색인',icon:'document',tone:'blue'},
  CLINICAL_TRIALS:{label:'ClinicalTrials.gov',short:'임상시험 등록',icon:'shield',tone:'mint'},
  CROSSREF:{label:'Crossref',short:'DOI 보완',icon:'link',tone:'lavender'}
};
const STATUS={READY:{label:'저장 근거 있음',tone:'success'},FREE_READY:{label:'무료 조회 가능',tone:'blue'},VERIFY_REQUIRED:{label:'첫 확인 필요',tone:'warning'},LOCKED:{label:'사용 중지',tone:'danger'}};
const date=value=>value?new Date(value).toLocaleDateString('ko-KR'):'기준일 확인 필요';

function ResearchCandidate({candidate,isSaved,working,onSave}){
  const meta=META[candidate.provider]||META.PUBMED,details=candidate.metadata||{};
  const tags=candidate.provider==='PUBMED'
    ?[details.pmid&&`PMID ${details.pmid}`,details.doi&&`DOI ${details.doi}`,details.citation_count!=null&&`인용 메타 ${details.citation_count}회`]
    :[details.nct_id,details.overall_status,details.study_type,details.enrollment&&`${details.enrollment}명`];
  return <article>
    <HarinPictogram icon={meta.icon} tone={meta.tone} size={24}/>
    <header><HarinBadge tone={meta.tone}>{meta.short}</HarinBadge><small>{date(candidate.source_date)} · {candidate.source_name}</small></header>
    <b>{candidate.title}</b><p>{candidate.summary}</p>
    <div className="marketResearchEvidenceTags">{tags.filter(Boolean).map(tag=><span key={tag}>{tag}</span>)}</div>
    <footer><HarinButton as="a" href={candidate.source_url} target="_blank" rel="noreferrer" variant="ghost" size="small" icon="link">공식 원문</HarinButton><HarinButton variant={isSaved?'ghost':'secondary'} size="small" icon={isSaved?'shield':'folder'} disabled={isSaved||Boolean(working)} onClick={()=>onSave(candidate)}>{working===`SAVE:${candidate.external_key}`?'저장 중…':isSaved?'저장됨':'근거 후보 저장'}</HarinButton></footer>
  </article>;
}

export default function MarketResearchEvidence({projectId,productName}){
  const endpoint=`/api/market-intelligence/projects/${projectId}/research-evidence`;
  const [config,setConfig]=useState(null),[query,setQuery]=useState(productName),[providers,setProviders]=useState(['PUBMED','CLINICAL_TRIALS']),[includeCitation,setIncludeCitation]=useState(true);
  const [result,setResult]=useState(null),[loading,setLoading]=useState(true),[working,setWorking]=useState(''),[message,setMessage]=useState('');
  const savedUrls=useMemo(()=>new Set((config?.saved_sources||[]).map(item=>item.source_url).filter(Boolean)),[config]);

  async function load(signal){
    setLoading(true);try{const data=await requestSafety.requestJson(endpoint,{signal});setConfig(data);setQuery(current=>current===productName?(data.defaults?.query||productName):current);setIncludeCitation(data.defaults?.include_citation_metadata!==false);}
    catch(error){if(error.code!=='REQUEST_ABORTED')setMessage(`확인 필요 · ${error.message}`);}finally{setLoading(false);}
  }
  useEffect(()=>{const controller=new AbortController();load(controller.signal);return()=>controller.abort();},[projectId]);
  function toggle(provider,checked){setProviders(current=>checked?[...new Set([...current,provider])]:current.filter(item=>item!==provider));}

  async function collect(event){
    event.preventDefault();setWorking('COLLECT');setMessage('선택 상품과 관련된 연구 색인·시험등록 자료를 공급자별로 확인하고 있어요.');
    try{const data=await requestSafety.requestJson(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'COLLECT',query,providers,include_citation_metadata:includeCitation,limit:6}),timeoutMs:45000});setResult(data);setMessage(data.candidates?.length?`연구 근거 후보 ${data.candidates.length}개를 확인했습니다.`:'현재 검색어로 확인된 연구자료가 없습니다. 상품의 원료명이나 학명으로 다시 확인해보세요.');await load();}
    catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setWorking('');}
  }
  async function save(candidate){
    setWorking(`SAVE:${candidate.external_key}`);try{const data=await requestSafety.requestJson(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'SAVE',candidate})});setMessage(data.message);await load();window.dispatchEvent(new CustomEvent('harin:market-data-room-updated'));}
    catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setWorking('');}
  }

  const providerRows=config?.providers||[],enabled=providerRows.filter(item=>item.enabled).length,candidates=result?.candidates||[];
  return <section className="marketResearchEvidenceWorkbench">
    <HarinSectionHeading eyebrow="PHASE 20-1 · RESEARCH EVIDENCE" title="연구·임상 근거 찾기" description={`${productName} 프로젝트에만 논문 색인과 임상시험 등록자료를 분리해 모아요.`} icon="document" aside={<HarinBadge tone="blue">무료 공식자료 {enabled}/3</HarinBadge>}/>
    <section className="marketResearchEvidenceKpis">
      {providerRows.map(item=>{const state=STATUS[item.status]||STATUS.VERIFY_REQUIRED;return <HarinStateCard key={item.provider} tone={state.tone} icon={item.icon} label={item.label} value={state.label} description={item.detail}/>;})}
      <HarinStateCard tone="success" icon="folder" label="이 상품 저장 근거" value={`${config?.summary?.saved||0}개`} description="다른 상품 Evidence와 완전 분리"/>
    </section>
    <HarinCard className="marketResearchEvidenceGuardrail">
      <HarinPictogram icon="shield" tone="amber" size={24}/><div><b>연구자료는 판매문구가 아니에요</b><p>논문에 비슷한 원료가 등장해도 하린식품 제품의 효능을 뜻하지 않습니다. 고객정보는 보내지 않고, 사장님이 저장·확정한 근거만 이후 검토에 사용해요.</p></div>
    </HarinCard>
    {message?<div className="marketDataMessage" role="status"><HarinPictogram icon={message.startsWith('확인 필요')?'warning':'sparkles'} tone={message.startsWith('확인 필요')?'pink':'lavender'} size={18}/><span>{message}</span></div>:null}
    <HarinCard className="marketResearchEvidenceControl">
      <form onSubmit={collect}>
        <label className="marketResearchEvidenceQuery"><span>찾을 상품명·원료명·학명</span><input required maxLength="140" value={query} onChange={event=>setQuery(event.target.value)} placeholder="예: Canavalia gladiata 또는 작두콩"/><small>현재 선택 상품이 기본값이에요. 결과가 없으면 원료의 영문명이나 학명을 입력해보세요.</small></label>
        <fieldset><legend>가져올 연구자료</legend><div>{['PUBMED','CLINICAL_TRIALS'].map(provider=>{const meta=META[provider];return <label key={provider}><input type="checkbox" checked={providers.includes(provider)} onChange={event=>toggle(provider,event.target.checked)}/><HarinPictogram icon={meta.icon} tone={meta.tone} size={18}/><span>{meta.label}</span></label>;})}</div></fieldset>
        <label className="marketResearchEvidenceCrossref"><input type="checkbox" checked={includeCitation} onChange={event=>setIncludeCitation(event.target.checked)}/><HarinPictogram icon="link" tone="lavender" size={18}/><span><b>Crossref로 DOI·인용 메타데이터 보완</b><small>논문 원문이나 초록은 복사하지 않아요.</small></span></label>
        <footer><span><HarinPictogram icon="cursor" tone="blue" size={17}/><small>외부 API는 이 버튼을 눌렀을 때만 호출해요.</small></span><HarinButton type="submit" variant="primary" icon="search" disabled={!providers.length||loading||working==='COLLECT'}>{working==='COLLECT'?'연구자료 확인 중…':'연구 근거 확인'}</HarinButton></footer>
      </form>
    </HarinCard>
    <HarinProgressiveDetails eyebrow="선택 설정" title="PubMed API 키는 없어도 시작할 수 있어요" description="현재는 무료 기본 한도로 수동 조회하고, 키는 18~21단계 완료 후 다른 키와 함께 입력합니다." count="기본 접힘"><ul className="marketResearchEvidenceSetup"><li><HarinPictogram icon="key" tone="blue" size={17}/><span>NCBI E-utilities 키는 호출 한도를 높이는 선택사항입니다.</span></li><li><HarinPictogram icon="shield" tone="mint" size={17}/><span>ClinicalTrials.gov와 Crossref는 이 기능에 별도 API 키가 필요하지 않습니다.</span></li></ul></HarinProgressiveDetails>
    {result?<HarinCard className="marketResearchEvidenceResults">
      <HarinSectionHeading eyebrow="RESEARCH CANDIDATES" title="읽어보고 저장할 연구 근거" description={`성공 ${result.summary?.success||0}곳 · 자료 없음 ${result.summary?.no_data||0}곳 · 확인 필요 ${result.summary?.failed||0}곳`} icon="folder" aside={<HarinBadge tone={candidates.length?'blue':'neutral'}>{candidates.length}개</HarinBadge>}/>
      {candidates.length?<div className="marketResearchEvidenceList">{candidates.map(candidate=><ResearchCandidate key={candidate.external_key} candidate={candidate} isSaved={savedUrls.has(candidate.source_url)} working={working} onSave={save}/>)}</div>:<HarinEmptyState icon="document" title="현재 검색어의 연구 후보가 없어요" description="자료 없음은 효과 없음이나 0으로 바꾸지 않습니다. 원료의 영문명·학명으로 다시 확인해보세요."/>}
      {result.errors?.length?<HarinProgressiveDetails eyebrow="공급자별 확인" title="가져오지 못한 연구자료" description="성공한 공급자의 후보는 그대로 사용할 수 있어요." count={`${result.errors.length}개`}><ul className="marketNaverEvidenceErrors">{result.errors.map((error,index)=><li key={`${error.provider}-${error.code}-${index}`}><b>{error.label}</b><span>{error.message}</span></li>)}</ul></HarinProgressiveDetails>:null}
    </HarinCard>:<HarinEmptyState className="marketResearchEvidenceStart" icon="document" title="연구자료는 필요할 때만 확인해요" description="화면을 여는 것만으로 PubMed·ClinicalTrials.gov·Crossref를 호출하지 않습니다."/>}
  </section>;
}
