'use client';

import {useEffect,useMemo,useState} from 'react';
import {HarinBadge,HarinButton,HarinCard,HarinEmptyState,HarinPictogram,HarinProgressiveDetails,HarinSectionHeading,HarinStateCard} from '../../../_design-system/harin-ui.js';
import requestSafety from '../../../../lib/market-intelligence/request-safety.js';

const META={
  KCS_TRADE:{label:'관세청 무역통계',short:'무역',icon:'truck',tone:'blue'},
  KOREA_EXIM_FX:{label:'수출입은행 환율',short:'환율',icon:'price',tone:'amber'},
  KOSIS_SEARCH:{label:'KOSIS 국가통계',short:'통계',icon:'analysis',tone:'lavender'}
};
const STATUS={READY:{label:'저장 근거 있음',tone:'success'},VERIFY_REQUIRED:{label:'첫 확인 필요',tone:'warning'},SETUP_REQUIRED:{label:'마지막에 키 연결',tone:'neutral'},LOCKED:{label:'사용 중지',tone:'danger'}};
const CURRENCIES=['USD','CNY','JPY'];
const monthValue=value=>String(value||'').replace(/[^0-9]/gu,'').replace(/^(\d{4})(\d{2})$/u,'$1-$2');
const dateValue=value=>String(value||'').replace(/[^0-9]/gu,'').replace(/^(\d{4})(\d{2})(\d{2})$/u,'$1-$2-$3');
const compact=value=>String(value||'').replace(/[^0-9]/gu,'');
const displayDate=value=>value?new Date(value).toLocaleDateString('ko-KR'):'기준일 확인 필요';

function candidateTags(candidate){
  const data=candidate.metadata||{};
  if(candidate.provider==='KCS_TRADE')return [data.hs_code&&`HS ${data.hs_code}`,data.country_name||data.country_code,data.period].filter(Boolean);
  if(candidate.provider==='KOREA_EXIM_FX')return [data.currency_unit,data.currency_name,data.search_date].filter(Boolean);
  return [data.organization_name,data.table_id,data.period_end&&`최근 ${data.period_end}`].filter(Boolean);
}

export default function RawMarketEvidence({projectId,productName}){
  const endpoint=`/api/market-intelligence/projects/${projectId}/raw-market-evidence`;
  const [config,setConfig]=useState(null),[result,setResult]=useState(null),[loading,setLoading]=useState(true),[working,setWorking]=useState(''),[message,setMessage]=useState('');
  const [providers,setProviders]=useState(Object.keys(META)),[currencies,setCurrencies]=useState(CURRENCIES),[form,setForm]=useState({raw_material:'',hs_code:'',country_code:'CN',start_yymm:'',end_yymm:'',exchange_date:'',kosis_query:''});
  const savedUrls=useMemo(()=>new Set((config?.saved_sources||[]).map(item=>item.source_url).filter(Boolean)),[config]);
  async function load(signal){setLoading(true);try{const data=await requestSafety.requestJson(endpoint,{signal});setConfig(data);setForm(current=>current.raw_material?current:{raw_material:data.defaults?.raw_material||productName,hs_code:data.defaults?.hs_code||'',country_code:data.defaults?.country_code||'CN',start_yymm:monthValue(data.defaults?.start_yymm),end_yymm:monthValue(data.defaults?.end_yymm),exchange_date:dateValue(data.defaults?.exchange_date),kosis_query:data.defaults?.kosis_query||data.defaults?.raw_material||productName});setProviders(current=>current.length?current:(data.defaults?.providers||Object.keys(META)));setCurrencies(current=>current.length?current:(data.defaults?.currencies||CURRENCIES));}catch(error){if(error.code!=='REQUEST_ABORTED')setMessage(`확인 필요 · ${error.message}`);}finally{setLoading(false);}}
  useEffect(()=>{const controller=new AbortController();load(controller.signal);return()=>controller.abort();},[projectId]);
  const field=(key,value)=>setForm(current=>({...current,[key]:value}));
  const toggleProvider=(provider,checked)=>setProviders(current=>checked?[...new Set([...current,provider])]:current.filter(item=>item!==provider));
  const toggleCurrency=(currency,checked)=>setCurrencies(current=>checked?[...new Set([...current,currency])]:current.filter(item=>item!==currency));
  async function collect(event){event.preventDefault();setWorking('COLLECT');setMessage('선택한 공식 원재료·시장 자료를 공급자별로 확인하고 있어요.');try{const data=await requestSafety.requestJson(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'COLLECT',...form,start_yymm:compact(form.start_yymm),end_yymm:compact(form.end_yymm),exchange_date:compact(form.exchange_date),currencies,providers}),timeoutMs:45000});setResult(data);setMessage(data.candidates?.length?`검토할 공식 자료 후보 ${data.candidates.length}개를 확인했어요.`:'조건에 맞는 후보가 없어요. 자료 없음과 설정 필요를 공급자별로 확인해주세요.');await load();}catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setWorking('');}}
  async function save(candidate){setWorking(`SAVE:${candidate.external_key}`);try{const data=await requestSafety.requestJson(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'SAVE',candidate})});setMessage(data.message);await load();window.dispatchEvent(new CustomEvent('harin:market-data-room-updated'));}catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setWorking('');}}
  const providerRows=config?.providers||[],configured=providerRows.filter(item=>item.configured&&item.enabled).length,candidates=result?.candidates||[];
  return <section className="rawMarketEvidenceWorkbench">
    <HarinSectionHeading eyebrow="PHASE 20-3 · SUPPLY & MARKET" title="원재료·시장환경 교차확인" description={`${productName}의 무역량·환율·국가통계를 서로 다른 근거로 확인해요.`} icon="analysis" aside={<HarinBadge tone={configured?'lavender':'neutral'}>{configured}/3 연결 준비</HarinBadge>}/>
    <section className="rawMarketEvidenceKpis">
      {providerRows.map(item=>{const state=STATUS[item.status]||STATUS.VERIFY_REQUIRED;return <HarinStateCard key={item.provider} tone={state.tone} icon={item.icon} label={item.label} value={state.label} description={item.detail}/>;})}
      <HarinStateCard tone="success" icon="folder" label="이 상품 저장 근거" value={`${config?.summary?.saved||0}개`} description="선택 상품 전용 Evidence"/>
    </section>
    <HarinCard className="rawMarketEvidenceGuardrail"><HarinPictogram icon="shield" tone="lavender" size={25}/><div><b>세 숫자는 서로 다른 질문에 답해요</b><p>무역통계는 국가 전체 통관 실적, 환율은 외부 비용 변수, KOSIS 결과는 관련 통계표 후보입니다. 어느 것도 하린식품의 실제 원가·수요·매출 원인을 자동으로 증명하지 않아요.</p></div></HarinCard>
    {message?<div className="marketDataMessage" role="status"><HarinPictogram icon={message.startsWith('확인 필요')?'warning':'sparkles'} tone={message.startsWith('확인 필요')?'pink':'lavender'} size={18}/><span>{message}</span></div>:null}
    <HarinCard className="rawMarketEvidenceControl">
      <form onSubmit={collect}>
        <section className="rawMarketEvidenceFields">
          <label><span>대표 원재료</span><input required maxLength="120" value={form.raw_material} onChange={event=>field('raw_material',event.target.value)} placeholder="예: 작두콩"/><small>선택 상품의 저장 원재료에서 우선 채워요.</small></label>
          <label><span>HS 코드</span><input inputMode="numeric" maxLength="10" value={form.hs_code} onChange={event=>field('hs_code',event.target.value.replace(/\D/gu,''))} placeholder="2·4·6·10자리"/><small>정확한 품목 무역량을 보려면 관세청 품목코드를 입력하세요.</small></label>
          <label><span>무역 상대국</span><input required={providers.includes('KCS_TRADE')} maxLength="2" value={form.country_code} onChange={event=>field('country_code',event.target.value.replace(/[^a-z]/giu,'').toUpperCase())} placeholder="CN"/><small>CN·US처럼 영문 국가코드 2자리예요.</small></label>
          <label><span>무역 조회 시작월</span><input required={providers.includes('KCS_TRADE')} type="month" value={form.start_yymm} onChange={event=>field('start_yymm',event.target.value)}/><small>관세청 한 번 조회는 최대 1년 범위로 제한해요.</small></label>
          <label><span>무역 조회 종료월</span><input required={providers.includes('KCS_TRADE')} type="month" value={form.end_yymm} onChange={event=>field('end_yymm',event.target.value)}/></label>
          <label><span>환율 기준일</span><input required={providers.includes('KOREA_EXIM_FX')} type="date" value={form.exchange_date} onChange={event=>field('exchange_date',event.target.value)}/><small>휴일에는 결과가 없을 수 있어요.</small></label>
          <label className="kosis"><span>KOSIS 검색어</span><input required={providers.includes('KOSIS_SEARCH')} maxLength="120" value={form.kosis_query} onChange={event=>field('kosis_query',event.target.value)} placeholder="예: 작두콩 식품 소비"/><small>검색 결과는 통계값이 아니라 검토할 공식 통계표 후보예요.</small></label>
        </section>
        <fieldset className="providers"><legend>이번에 확인할 자료</legend><div>{Object.entries(META).map(([provider,item])=><label key={provider}><input type="checkbox" checked={providers.includes(provider)} onChange={event=>toggleProvider(provider,event.target.checked)}/><HarinPictogram icon={item.icon} tone={item.tone} size={16}/><span>{item.short}</span></label>)}</div></fieldset>
        <fieldset className="currencies"><legend>환율 비교 통화</legend><div>{CURRENCIES.map(currency=><label key={currency}><input type="checkbox" checked={currencies.includes(currency)} onChange={event=>toggleCurrency(currency,event.target.checked)}/><span>{currency}</span></label>)}</div></fieldset>
        <footer><span><HarinPictogram icon="shield" tone="mint" size={16}/><small>외부 API는 이 버튼을 눌렀을 때만 호출하며 고객 개인정보를 보내지 않아요.</small></span><HarinButton type="submit" variant="primary" icon="search" disabled={loading||working||providers.length===0}>{working==='COLLECT'?'공급자별 확인 중…':'시장환경 자료 확인'}</HarinButton></footer>
      </form>
      <HarinProgressiveDetails eyebrow="키 입력 유예" title="연결 준비 상태와 입력 기준" description="API 키는 18~21단계 완료 후 한 번에 입력합니다." count={`${3-configured}개 남음`}>
        <ul className="rawMarketEvidenceSetup">{providerRows.map(item=><li key={item.provider}><HarinPictogram icon={item.icon} tone={META[item.provider]?.tone||'lavender'} size={16}/><span><b>{item.label}</b><small>{item.missing_fields?.length?item.missing_fields.join(' · '):item.summary}</small></span></li>)}</ul>
        <p className="rawMarketEvidenceLicense">국가표준식품성분표는 상업적 이용·변형 범위를 별도로 검토해야 하므로 이번 자동연결에서 제외했습니다.</p>
      </HarinProgressiveDetails>
    </HarinCard>
    {result?<HarinCard className="rawMarketEvidenceResults">
      <HarinSectionHeading eyebrow="OFFICIAL CONTEXT QUEUE" title="읽어보고 저장할 시장 근거" description={`성공 ${result.summary?.success||0}곳 · 자료 없음 ${result.summary?.no_data||0}곳 · 확인 필요 ${result.summary?.failed||0}곳`} aside={<HarinBadge tone={candidates.length?'lavender':'neutral'}>{candidates.length}개</HarinBadge>}/>
      {candidates.length?<section className="rawMarketEvidenceList">{candidates.map(candidate=>{const item=META[candidate.provider]||META.KOSIS_SEARCH,saved=savedUrls.has(candidate.source_url);return <article key={candidate.external_key}>
        <HarinPictogram icon={item.icon} tone={item.tone} size={19}/><header><HarinBadge tone={item.tone}>{item.short}</HarinBadge><small>{candidate.source_name} · {displayDate(candidate.source_date)}</small></header><b>{candidate.title}</b><p>{candidate.summary}</p><div className="rawMarketEvidenceTags">{candidateTags(candidate).map(tag=><span key={tag}>{tag}</span>)}</div>
        <footer><HarinButton as="a" href={candidate.source_url} target="_blank" rel="noreferrer" variant="ghost" icon="link">원문 보기</HarinButton><HarinButton variant="secondary" icon="folder" disabled={saved||Boolean(working)} onClick={()=>save(candidate)}>{saved?'저장됨':working===`SAVE:${candidate.external_key}`?'저장 중…':'Evidence 후보 저장'}</HarinButton></footer>
      </article>;})}</section>:<HarinEmptyState icon="analysis" title="조건에 맞는 공식 시장자료 후보가 없어요" description="자료 없음은 시장이 없거나 원가 영향이 0이라는 뜻이 아닙니다. HS 코드·국가·기준일·검색어를 확인해주세요."/>}
      {result.errors?.length?<HarinProgressiveDetails eyebrow="공급자별 확인" title="가져오지 못한 원재료·시장 자료" description="성공한 공급자 결과는 그대로 사용할 수 있어요." count={`${result.errors.length}개`}><ul className="marketNaverEvidenceErrors">{result.errors.map((error,index)=><li key={`${error.provider}-${error.code}-${index}`}><b>{error.label}</b><span>{error.message}</span></li>)}</ul></HarinProgressiveDetails>:null}
    </HarinCard>:<HarinEmptyState className="rawMarketEvidenceStart" icon="analysis" title="시장환경 자료는 필요할 때만 확인해요" description="화면을 여는 것만으로 관세청·수출입은행·KOSIS API를 호출하지 않습니다."/>}
  </section>;
}
