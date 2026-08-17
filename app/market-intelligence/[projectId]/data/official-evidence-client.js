'use client';

import {useEffect,useMemo,useState} from 'react';
import {HarinBadge,HarinButton,HarinCard,HarinEmptyState,HarinPictogram,HarinProgressiveDetails,HarinSectionHeading,HarinStateCard} from '../../../_design-system/harin-ui.js';
import requestSafety from '../../../../lib/market-intelligence/request-safety.js';

const META={
  FOOD_SAFETY_PRODUCT:{label:'식품 품목정보',short:'품목정보',icon:'product',tone:'mint'},
  FOOD_SAFETY_RECALL:{label:'회수·판매중지',short:'회수정보',icon:'warning',tone:'pink'},
  KOREAN_LAW:{label:'국가법령정보',short:'법령',icon:'document',tone:'lavender'}
};
const STATUS={READY:{label:'저장 근거 있음',tone:'success'},VERIFY_REQUIRED:{label:'첫 확인 필요',tone:'warning'},SETUP_REQUIRED:{label:'마지막에 키 연결',tone:'neutral'},LOCKED:{label:'사용 중지',tone:'danger'}};
const date=value=>value?new Date(value).toLocaleDateString('ko-KR'):'기준일 확인 필요';

export default function MarketOfficialEvidence({projectId,productName}){
  const endpoint=`/api/market-intelligence/projects/${projectId}/official-evidence`;
  const [config,setConfig]=useState(null),[query,setQuery]=useState(productName),[reportNumbers,setReportNumbers]=useState(''),[lawTerms,setLawTerms]=useState('');
  const [providers,setProviders]=useState(Object.keys(META)),[result,setResult]=useState(null),[loading,setLoading]=useState(true),[working,setWorking]=useState(''),[message,setMessage]=useState('');
  const savedUrls=useMemo(()=>new Set((config?.saved_sources||[]).map(item=>item.source_url).filter(Boolean)),[config]);

  async function load(signal){
    setLoading(true);try{const data=await requestSafety.requestJson(endpoint,{signal});setConfig(data);setQuery(current=>current===productName?(data.defaults?.query||productName):current);setLawTerms(current=>current||(data.defaults?.law_terms||[]).join('\n'));}
    catch(error){if(error.code!=='REQUEST_ABORTED')setMessage(`확인 필요 · ${error.message}`);}finally{setLoading(false);}
  }
  useEffect(()=>{const controller=new AbortController();load(controller.signal);return()=>controller.abort();},[projectId]);
  function toggle(provider,checked){setProviders(current=>checked?[...new Set([...current,provider])]:current.filter(item=>item!==provider));}

  async function collect(event){
    event.preventDefault();setWorking('COLLECT');setMessage('선택 상품의 공식 안전·법령 자료를 공급자별로 확인하고 있어요.');
    try{const data=await requestSafety.requestJson(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'COLLECT',query,providers,report_numbers:reportNumbers,law_terms:lawTerms.split(/\n+/u).map(item=>item.trim()).filter(Boolean)}),timeoutMs:45000});setResult(data);setMessage(data.candidates?.length?`공식 근거 후보 ${data.candidates.length}개를 확인했습니다.`:'아직 가져온 후보가 없습니다. 공급자 설정 또는 조회 조건을 확인해주세요.');await load();}
    catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setWorking('');}
  }
  async function save(candidate){
    setWorking(`SAVE:${candidate.external_key}`);try{const data=await requestSafety.requestJson(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'SAVE',candidate})});setMessage(data.message);await load();window.dispatchEvent(new CustomEvent('harin:market-data-room-updated'));}
    catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setWorking('');}
  }

  const providerRows=config?.providers||[],configured=providerRows.filter(item=>item.configured&&item.enabled).length,candidates=result?.candidates||[];
  return <section className="marketOfficialEvidenceWorkbench">
    <HarinSectionHeading eyebrow="PHASE 19-2 · OFFICIAL EVIDENCE" title="공식 안전·법령 근거" description={`${productName} 프로젝트에만 품목정보·회수정보·법령 후보를 분리해 모아요.`} icon="shield" aside={<HarinBadge tone={configured?'lavender':'neutral'}>{configured}/3 연결 준비</HarinBadge>}/>
    <section className="marketOfficialEvidenceKpis">
      {providerRows.map(item=>{const state=STATUS[item.status]||STATUS.VERIFY_REQUIRED;return <HarinStateCard key={item.provider} tone={state.tone} icon={item.icon} label={item.label} value={state.label} description={item.detail}/>;})}
      <HarinStateCard tone="success" icon="folder" label="이 상품 저장 근거" value={`${config?.summary?.saved||0}개`} description="다른 상품 Evidence와 분리"/>
    </section>
    {message?<div className="marketDataMessage" role="status"><HarinPictogram icon={message.startsWith('확인 필요')?'warning':'sparkles'} tone={message.startsWith('확인 필요')?'pink':'lavender'} size={18}/><span>{message}</span></div>:null}
    <HarinCard className="marketOfficialEvidenceControl">
      <form onSubmit={collect}>
        <section className="marketOfficialEvidenceFields">
          <label><span>조회할 상품 이름</span><input required maxLength="100" value={query} onChange={event=>setQuery(event.target.value)} placeholder="예: 작두콩차"/><small>현재 선택 상품을 기본값으로 사용해요.</small></label>
          <label><span>품목제조보고번호 · 선택</span><input maxLength="400" value={reportNumbers} onChange={event=>setReportNumbers(event.target.value)} placeholder="모르면 비워두세요"/><small>품목정보에서 찾은 번호를 회수조회에 자동으로 이어 써요.</small></label>
          <label className="laws"><span>확인할 법령</span><textarea maxLength="500" rows="3" value={lawTerms} onChange={event=>setLawTerms(event.target.value)} /><small>한 줄에 하나씩, 최대 5개만 확인해요.</small></label>
        </section>
        <fieldset><legend>가져올 공식 자료</legend><div>{Object.entries(META).map(([provider,meta])=><label key={provider}><input type="checkbox" checked={providers.includes(provider)} onChange={event=>toggle(provider,event.target.checked)}/><HarinPictogram icon={meta.icon} tone={meta.tone} size={18}/><span>{meta.short}</span></label>)}</div></fieldset>
        <footer><span><HarinPictogram icon="shield" tone="amber" size={17}/><small>공식 API 자료도 사장님 확인 전에는 확정 Evidence로 쓰지 않아요.</small></span><HarinButton type="submit" variant="primary" icon="search" disabled={!providers.length||!configured||loading||working==='COLLECT'}>{working==='COLLECT'?'공식 자료 확인 중…':configured?'공식 근거 확인':'키 연결 후 확인 가능'}</HarinButton></footer>
      </form>
    </HarinCard>
    {!configured?<HarinProgressiveDetails eyebrow="마지막 연결 단계" title="API 키는 개발계획 완료 후 한 번에 입력해요" description="지금은 화면·저장·오류 격리를 먼저 완성했습니다." count="기본 접힘"><ul className="marketOfficialEvidenceSetup">{providerRows.flatMap(item=>item.missing_fields||[]).filter((item,index,all)=>all.indexOf(item)===index).map(item=><li key={item}><HarinPictogram icon="key" tone="lavender" size={17}/><span>{item}</span></li>)}</ul></HarinProgressiveDetails>:null}
    {result?<HarinCard className="marketOfficialEvidenceResults">
      <HarinSectionHeading eyebrow="OFFICIAL CANDIDATES" title="확인 후 저장할 공식 근거" description={`성공 ${result.summary?.success||0}곳 · 자료 없음 ${result.summary?.no_data||0}곳 · 확인 필요 ${result.summary?.failed||0}곳`} icon="folder" aside={<HarinBadge tone={candidates.length?'lavender':'neutral'}>{candidates.length}개</HarinBadge>}/>
      {candidates.length?<div className="marketOfficialEvidenceList">{candidates.map(candidate=>{const meta=META[candidate.provider]||META.KOREAN_LAW,isSaved=savedUrls.has(candidate.source_url);return <article key={candidate.external_key}>
        <HarinPictogram icon={meta.icon} tone={meta.tone} size={24}/><header><HarinBadge tone={meta.tone}>{meta.short}</HarinBadge><small>{date(candidate.source_date)} · {candidate.source_name}</small></header>
        <b>{candidate.title}</b><p>{candidate.summary}</p><footer><HarinButton as="a" href={candidate.source_url} target="_blank" rel="noreferrer" variant="ghost" size="small" icon="link">공식 원문</HarinButton><HarinButton variant={isSaved?'ghost':'secondary'} size="small" icon={isSaved?'shield':'folder'} disabled={isSaved||Boolean(working)} onClick={()=>save(candidate)}>{working===`SAVE:${candidate.external_key}`?'저장 중…':isSaved?'저장됨':'근거 후보 저장'}</HarinButton></footer>
      </article>;})}</div>:<HarinEmptyState icon="shield" title="현재 조건에서 공식 후보가 없어요" description="API 연결 상태, 상품명, 품목제조보고번호를 확인해주세요. 자료 없음은 0이나 정상으로 바꾸지 않습니다."/>}
      {result.errors?.length?<HarinProgressiveDetails eyebrow="공급자별 확인" title="가져오지 못한 공식 자료" description="성공한 공급자의 후보는 그대로 사용할 수 있어요." count={`${result.errors.length}개`}><ul className="marketNaverEvidenceErrors">{result.errors.map(error=><li key={`${error.provider}-${error.code}`}><b>{error.label}</b><span>{error.message}</span></li>)}</ul></HarinProgressiveDetails>:null}
    </HarinCard>:<HarinEmptyState className="marketOfficialEvidenceStart" icon="shield" title="공식 자료는 필요할 때만 확인해요" description="화면을 여는 것만으로 외부 API를 호출하지 않습니다."/>}
  </section>;
}
