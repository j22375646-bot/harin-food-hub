'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import SystemGa4Measurement from './system-ga4-measurement.js';
import './system-measurement-panel.css';

const EMPTY_INPUT={landingUrl:'',source:'',medium:'',campaign:'',campaignId:'',creativeId:'',term:'',productId:''};
const FIELDS=[
  ['landingUrl','랜딩 URL','https://…',true],
  ['source','유입 출처 (source)','naver',true],
  ['medium','매체 (medium)','cpc',true],
  ['campaign','캠페인명','가을 기획전',true],
  ['campaignId','캠페인 ID','fall-2026',true],
  ['creativeId','소재 ID','banner-01',false],
  ['term','검색어','선택 입력',false]
];

export function MeasurementForm({input=EMPTY_INPUT,products={available:false,items:[]},preview=null,busy='',onChange=()=>{},onPreview=()=>{},onSave=()=>{},onCopy=()=>{}}){
  return <form className="sysMeasurementForm" onSubmit={event=>{event.preventDefault();onPreview();}}>
    <div className="sysMeasurementFields">{FIELDS.map(([name,label,placeholder,required])=><label key={name} className={name==='landingUrl'?'sysMeasurementWide':undefined}><span>{label} <small>{required?'필수':'선택'}</small></span><input name={name} value={input[name]} placeholder={placeholder} required={required} type={name==='landingUrl'?'url':'text'} readOnly={Boolean(busy)} aria-disabled={Boolean(busy)} onChange={event=>onChange(name,event.target.value)} autoComplete="off"/></label>)}
      <label><span>연결 상품 <small>선택</small></span><select name="productId" value={input.productId} disabled={Boolean(busy)} onChange={event=>onChange('productId',event.target.value)}><option value="">상품 없이 저장</option>{input.productId&&!(products.items||[]).some(item=>item.id===input.productId)?<option value={input.productId}>선택한 상품 · 확인 필요 ({input.productId})</option>:null}{(products.items||[]).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    </div>
    {!products.available?<p className="sysMeasurementNote">{products.note||'상품 목록 확인 필요 · 상품 없이 링크를 검사하고 저장할 수 있어요.'}</p>:null}
    <div className="sysMeasurementActions"><button type="submit" disabled={Boolean(busy)}>{busy==='PREVIEW'?'검사 중…':'링크 검사'}</button><button type="button" disabled={!preview||Boolean(busy)} onClick={onSave}>{busy==='SAVE_LINK'?'저장 중…':'링크 저장'}</button></div>
    {preview?<section className="sysMeasurementPreview" aria-label="검사한 링크"><strong>검사한 링크</strong><p>아래 주소와 식별자를 확인한 뒤 저장하세요. 입력을 바꾸면 다시 검사합니다.</p><textarea aria-label="검사한 전체 URL" value={preview.url} readOnly rows={3} onFocus={event=>event.target.select()}/><span>규칙 {preview.ruleVersion}</span>{(preview.warnings||[]).map((warning,index)=><p key={index}>{typeof warning==='string'?warning:warning.message||'입력값 확인 필요'}</p>)}<button type="button" onClick={()=>onCopy(preview.url)}>링크 복사</button></section>:<p className="sysMeasurementNote">링크 검사 후 미리보기를 확인하고 저장하세요.</p>}
  </form>;
}

function createdLabel(value){
  if(!value)return '생성 시각 확인 필요';
  const date=new Date(value);
  return Number.isNaN(date.getTime())?'생성 시각 확인 필요':new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium',timeStyle:'short'}).format(date);
}

export function MeasurementHistory({links=[],products={items:[]},loading=false,hasMore=false,failed=false,busy='',onArchive=()=>{},onRestore=()=>{},onMore=()=>{},onCopy=()=>{}}){
  return <div className="sysMeasurementHistory" aria-busy={loading}>
    {!links.length&&!loading&&!failed?<p className="sysMeasurementNote">표시할 링크가 없습니다. 광고에 사용할 링크를 검사하고 저장하세요.</p>:null}
    {links.map(link=>{
      const normalized=link.normalized_input||{};
      const product=(products.items||[]).find(item=>item.id===link.product_id);
      return <article key={link.id} aria-label={`${normalized.campaign||'캠페인 확인 필요'} 링크`}>
        <header><strong>{normalized.campaign||'캠페인 확인 필요'}</strong><span>{link.archived_at?'보관됨':'사용 중'}</span></header>
        <dl><div><dt>출처 · 매체</dt><dd>{normalized.source||'확인 필요'} · {normalized.medium||'확인 필요'}</dd></div><div><dt>캠페인 ID</dt><dd>{link.campaign_id||'확인 필요'}</dd></div><div><dt>소재 ID</dt><dd>{link.creative_id||'미지정'}</dd></div><div><dt>연결 상품</dt><dd>{product?.name||link.product_id||'상품 연결 없음'}</dd></div><div><dt>생성 시각 · 한국</dt><dd><time dateTime={link.created_at}>{createdLabel(link.created_at)}</time></dd></div>{normalized.term?<div><dt>검색어</dt><dd>{normalized.term}</dd></div>:null}</dl>
        <textarea aria-label={`${normalized.campaign||'저장한 링크'} 전체 URL`} value={link.generated_url} readOnly rows={2} onFocus={event=>event.target.select()}/>
        <footer><button type="button" onClick={()=>onCopy(link.generated_url)}>링크 복사</button>{link.archived_at?<button type="button" disabled={Boolean(busy)||loading} onClick={()=>onRestore(link)}>복원</button>:<button type="button" disabled={Boolean(busy)||loading} onClick={()=>onArchive(link)}>보관</button>}</footer>
      </article>;
    })}
    {loading?<p role="status">링크 이력을 불러오는 중…</p>:null}
    {hasMore?<button type="button" disabled={loading||Boolean(busy)} onClick={onMore}>더 보기</button>:null}
  </div>;
}

async function requestMeasurement(options){
  const response=await fetch('/api/system/measurement'+(options.query||''),{cache:'no-store',credentials:'same-origin',signal:options.signal,...(options.body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(options.body)}:{})});
  let payload;
  try{payload=await response.json();}catch{throw new Error('응답을 확인하지 못했습니다. 잠시 후 다시 시도하세요.');}
  if(!response.ok||!payload.ok)throw new Error(payload.error||'요청을 완료하지 못했습니다. 잠시 후 다시 시도하세요.');
  return payload;
}

export default function SystemMeasurementPanel(){
  const [input,setInput]=useState(EMPTY_INPUT);
  const [preview,setPreview]=useState(null);
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [copyMessage,setCopyMessage]=useState('');
  const [restoreCandidate,setRestoreCandidate]=useState(null);
  const [includeArchived,setIncludeArchived]=useState(false);
  const [data,setData]=useState({links:[],hasMore:false,nextCursor:null,products:{available:false,items:[]},readiness:null});
  const [loading,setLoading]=useState(true);
  const [listError,setListError]=useState('');
  const mutationLock=useRef(false);
  const mounted=useRef(false);
  const inputRevision=useRef(0);
  const previewRevision=useRef(null);
  const copyEpoch=useRef(0);
  const listEpoch=useRef(0);
  const listAbort=useRef(null);
  const currentFilter=useRef(false);

  const loadLinks=useCallback(async(archived,after=null)=>{
    listAbort.current?.abort();
    const controller=new AbortController();
    listAbort.current=controller;
    const epoch=++listEpoch.current;
    setLoading(true);setListError('');
    if(!after)setData(current=>({...current,links:[],hasMore:false,nextCursor:null}));
    const query=new URLSearchParams({includeArchived:String(archived)});
    if(after)query.set('after',after);
    try{
      const payload=await requestMeasurement({query:`?${query}`,signal:controller.signal});
      if(!mounted.current||epoch!==listEpoch.current)return;
      setData(current=>({...payload,links:after?[...current.links,...payload.links.filter(link=>!current.links.some(existing=>existing.id===link.id))]:payload.links}));
    }catch(cause){
      if(mounted.current&&epoch===listEpoch.current&&cause.name!=='AbortError')setListError(cause.message||'링크 목록을 불러오지 못했습니다. 다시 불러오세요.');
    }finally{if(mounted.current&&epoch===listEpoch.current)setLoading(false);}
  },[]);

  useEffect(()=>{
    mounted.current=true;
    loadLinks(includeArchived);
    return ()=>{mounted.current=false;listAbort.current?.abort();listEpoch.current++;copyEpoch.current++;};
  },[includeArchived,loadLinks]);

  function changeInput(name,value){
    inputRevision.current++;
    previewRevision.current=null;
    copyEpoch.current++;
    setInput(current=>({...current,[name]:value}));
    setPreview(null);setMessage('');setCopyMessage('');setError('');setRestoreCandidate(null);
  }

  async function runAction(action,link=null){
    if(mutationLock.current)return;
    if(action==='SAVE_LINK'&&(!preview||previewRevision.current!==inputRevision.current))return;
    mutationLock.current=true;
    try{
      if(link&&!window.confirm(`${link.normalized_input?.campaign||'선택한 링크'} 링크를 ${action==='ARCHIVE_LINK'?'보관':'복원'}할까요?\n저장 이력은 유지됩니다.`))return;
      setBusy(action);setError('');setMessage('');setRestoreCandidate(null);
      const revision=inputRevision.current;
      const payload=await requestMeasurement({body:link?{action,id:link.id}:{action,input}});
      if(!mounted.current)return;
      if(action==='PREVIEW'){
        if(revision!==inputRevision.current)return;
        previewRevision.current=revision;
        setPreview(payload.preview);
      }else{
        if(action==='SAVE_LINK'){
          setMessage(payload.link.archived_at?'같은 링크가 보관되어 있습니다. 복원 여부를 선택하세요.':payload.duplicate?'같은 링크가 이미 저장되어 있습니다.':'링크를 저장했습니다.');
          if(payload.restoreAvailable)setRestoreCandidate(payload.link);
        }else setMessage(action==='ARCHIVE_LINK'?'링크를 보관했습니다.':'링크를 복원했습니다.');
        await loadLinks(currentFilter.current);
      }
    }catch(cause){if(mounted.current)setError(cause.message||'요청을 완료하지 못했습니다. 입력을 확인하고 다시 시도하세요.');}
    finally{mutationLock.current=false;if(mounted.current)setBusy('');}
  }

  async function copyLink(url){
    const epoch=++copyEpoch.current;
    setCopyMessage('복사 중…');
    try{
      if(!navigator.clipboard?.writeText)throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(url);
      if(mounted.current&&epoch===copyEpoch.current)setCopyMessage('링크를 복사했습니다.');
    }catch{
      if(mounted.current&&epoch===copyEpoch.current)setCopyMessage('자동 복사가 되지 않았습니다. URL 입력란을 선택한 뒤 직접 복사하세요.');
    }
  }

  function changeFilter(checked){
    currentFilter.current=checked;
    listAbort.current?.abort();listEpoch.current++;
    setData(current=>({...current,links:[],hasMore:false,nextCursor:null}));
    setIncludeArchived(checked);
  }

  return <section className="sysMeasurementPanel" aria-labelledby="sysMeasurementTitle">
    <header><span>광고 유입 기록</span><h2 id="sysMeasurementTitle">광고 링크 측정</h2><p>유입 출처와 캠페인 식별자를 같은 규칙으로 붙이고, 광고에 사용할 링크를 저장해요.</p></header>
    <SystemGa4Measurement/>
    <p className="sysMeasurementNote">HTTPS 주소를 입력하세요. 출처·매체는 소문자로 통일하고 공백을 정리합니다. 기존 UTM과 입력값이 다르면 검사를 통과할 수 없습니다. 캠페인명·검색어에 개인정보를 넣지 마세요.</p>
    <MeasurementForm input={input} products={data.products} preview={preview} busy={busy} onChange={changeInput} onPreview={()=>runAction('PREVIEW')} onSave={()=>runAction('SAVE_LINK')} onCopy={copyLink}/>
    {error?<p className="sysMeasurementFeedback" role="alert">{error}</p>:null}
    {message?<p className="sysMeasurementFeedback" role="status">{message}</p>:null}
    {restoreCandidate?<button type="button" disabled={Boolean(busy)} onClick={()=>runAction('RESTORE_LINK',restoreCandidate)}>보관된 링크 복원</button>:null}
    {copyMessage?<p className="sysMeasurementFeedback" role="status">{copyMessage}</p>:null}
    <section className="sysMeasurementSaved" aria-labelledby="sysMeasurementHistoryTitle"><header><h3 id="sysMeasurementHistoryTitle">저장한 링크</h3><label><input type="checkbox" checked={includeArchived} disabled={Boolean(busy)} onChange={event=>changeFilter(event.target.checked)}/> 보관한 링크 포함</label></header>
      {listError?<div className="sysMeasurementFeedback" role="alert"><p>{listError}</p><button type="button" disabled={loading||Boolean(busy)} onClick={()=>loadLinks(includeArchived)}>다시 불러오기</button></div>:null}
      <MeasurementHistory links={data.links} products={data.products} hasMore={!listError&&data.hasMore} failed={Boolean(listError)} loading={loading} busy={busy} onArchive={link=>runAction('ARCHIVE_LINK',link)} onRestore={link=>runAction('RESTORE_LINK',link)} onMore={()=>loadLinks(includeArchived,data.nextCursor)} onCopy={copyLink}/>
    </section>
  </section>;
}
