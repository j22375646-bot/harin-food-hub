'use client';

import { useEffect, useMemo, useState } from 'react';
import { HarinBadge, HarinButton, HarinCard, HarinEmptyState, HarinPictogram, HarinProgressiveDetails, HarinSectionHeading, HarinStateCard } from '../../../_design-system/harin-ui.js';
import requestSafety from '../../../../lib/market-intelligence/request-safety.js';
import { MarketWorkbenchError } from '../market-workbench-state.js';

const {requestJson}=requestSafety;

const statusMeta={
  UPLOAD_PENDING:['업로드 확인 중','neutral'],UPLOADED:['업로드 완료','info'],OCR_PENDING:['판독 대기','warning'],
  REVIEW_REQUIRED:['사장님 확인 필요','danger'],VERIFIED:['검수 완료','success'],FAILED:['처리 실패','danger']
};
const evidenceMeta={VERIFIED:['검증됨','success'],OWNER_CONFIRMATION_REQUIRED:['확인 필요','danger'],NEEDS_SOURCE:['출처 필요','warning'],UNVERIFIED:['가설','lavender'],BLOCKED:['사용 중지','danger']};
const evidenceTypes={MEASURED:'직접 측정',RELATIVE:'비교 계산',PROXY:'대체 지표',OCR_ESTIMATE:'이미지 판독',AI_HYPOTHESIS:'AI 가설'};
const bytes=value=>{const size=Number(value||0);if(!size)return '-';if(size<1024)return `${size}B`;if(size<1024*1024)return `${(size/1024).toFixed(1)}KB`;return `${(size/1024/1024).toFixed(1)}MB`;};
const percent=value=>value==null?'미입력':`${Math.round(Number(value)*100)}%`;
async function sha256(file){const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());return [...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');}

export default function MarketDataRoom({projectId,productName}){
  const [data,setData]=useState(null),[loading,setLoading]=useState(true),[working,setWorking]=useState(''),[message,setMessage]=useState('');
  const [file,setFile]=useState(null),[selectedSourceId,setSelectedSourceId]=useState('');
  const [review,setReview]=useState({ocr_text:'',ocr_confidence:'100',owner_confirmed:false});
  const [evidence,setEvidence]=useState({source_id:'',evidence_type:'OCR_ESTIMATE',label:'',value_text:'',unit:'',confidence:'100',owner_confirmed:false,locator:''});
  const endpoint=`/api/market-intelligence/projects/${projectId}`;

  async function load({quiet=false,signal}={}){
    if(!quiet)setLoading(true);
    if(!quiet)setMessage('');
    try{setData(await requestJson(`${endpoint}/sources`,{signal}));}
    catch(error){if(error.code!=='REQUEST_ABORTED')setMessage(`확인 필요 · ${error.message}`);}finally{if(!quiet)setLoading(false);}
  }
  useEffect(()=>{const controller=new AbortController();load({signal:controller.signal});return()=>controller.abort();},[projectId]);
  useEffect(()=>{const refresh=()=>load({quiet:true});window.addEventListener('harin:market-data-room-updated',refresh);return()=>window.removeEventListener('harin:market-data-room-updated',refresh);},[projectId]);
  const selected=useMemo(()=>(data?.sources||[]).find(item=>item.id===selectedSourceId)||null,[data,selectedSourceId]);
  useEffect(()=>{
    if(!selected)return;
    let active=true;
    fetch(`${endpoint}/sources/${selected.id}?mode=detail`,{cache:'no-store'}).then(async response=>{const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'판독 내용 조회 실패');return result.source;}).then(detail=>{if(active)setReview({ocr_text:detail.ocr_text||'',ocr_confidence:String(Math.round(Number(detail.ocr_confidence??1)*100)),owner_confirmed:Boolean(detail.owner_confirmed)});}).catch(error=>{if(active)setMessage(`확인 필요 · ${error.message}`);});
    return()=>{active=false;};
  },[selected?.id,projectId]);

  async function upload(){
    if(!file)return;setWorking('UPLOAD');setMessage(`${file.name}을 ${productName} 전용 비공개 자료실에 보관하는 중이에요.`);
    try{
      const preparedResponse=await fetch(`${endpoint}/sources`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({file_name:file.name,display_name:file.name,mime_type:file.type||'application/octet-stream',size_bytes:file.size})});
      const prepared=await preparedResponse.json();if(!preparedResponse.ok||!prepared.ok)throw new Error(prepared.error||'업로드 준비 실패');
      const checksum=await sha256(file),uploadBody=new FormData();uploadBody.append('cacheControl','3600');uploadBody.append('',file);
      const uploaded=await fetch(prepared.upload.signed_url,{method:'PUT',headers:{'x-upsert':'false'},body:uploadBody});if(!uploaded.ok)throw new Error('비공개 저장소 업로드에 실패했습니다.');
      const completedResponse=await fetch(`${endpoint}/sources/${prepared.upload.source_id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({action:'COMPLETE',storage_path:prepared.upload.storage_path,sha256:checksum})});
      const completed=await completedResponse.json();if(!completedResponse.ok||!completed.ok)throw new Error(completed.error||'업로드 확인 실패');
      setFile(null);setSelectedSourceId(completed.source.id);setMessage('원본을 보관했습니다. 아래 판독 내용을 확인하면 근거로 연결할 수 있어요.');await load({quiet:true});
    }catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setWorking('');}
  }
  async function saveReview(event){
    event.preventDefault();if(!selected)return;setWorking('REVIEW');
    try{const response=await fetch(`${endpoint}/sources/${selected.id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({action:'OCR_REVIEW',ocr_text:review.ocr_text,ocr_confidence:Number(review.ocr_confidence)/100,owner_confirmed:review.owner_confirmed})}),result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'판독 검수 실패');setMessage(result.message);await load({quiet:true});}
    catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setWorking('');}
  }
  async function openSource(item){
    setWorking(`OPEN:${item.id}`);try{const response=await fetch(`${endpoint}/sources/${item.id}`,{cache:'no-store'}),result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'원본 열기 실패');window.location.assign(result.signed_url);}catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setWorking('');}
  }
  async function createEvidence(event){
    event.preventDefault();setWorking('EVIDENCE');
    try{const response=await fetch(`${endpoint}/evidence`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...evidence,confidence:evidence.confidence===''?null:Number(evidence.confidence)/100,source_locator:evidence.locator?{location:evidence.locator}:{}})}),result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'근거 저장 실패');setEvidence(current=>({...current,label:'',value_text:'',unit:'',locator:''}));setMessage(result.message);await load({quiet:true});}
    catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setWorking('');}
  }
  async function confirmEvidence(item){
    setWorking(`EVIDENCE:${item.id}`);try{const response=await fetch(`${endpoint}/evidence/${item.id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({action:'CONFIRM'})}),result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'근거 확인 실패');setMessage(result.message);await load({quiet:true});}catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setWorking('');}
  }

  if(!loading&&!data)return <MarketWorkbenchError title="상품 자료실을 불러오지 못했어요" message={message||'잠시 뒤 다시 시도해주세요.'} onRetry={()=>load()}/>;
  const summary=data?.summary||{},sources=data?.sources||[],evidences=data?.evidence||[];
  return <section className="marketDataRoom">
    <section className="marketDataKpis">
      <HarinStateCard icon="database" label="보관 자료" value={`${summary.sources||0}개`} description={`${productName} 전용`}/>
      <HarinStateCard tone={summary.review_required?'warning':'success'} icon="search" label="판독 확인" value={`${summary.review_required||0}개`} description="95% 미만은 자동 사용 금지"/>
      <HarinStateCard tone="success" icon="shield" label="검수 자료" value={`${summary.verified_sources||0}개`} description="사장님 확인 완료"/>
      <HarinStateCard tone="success" icon="target" label="검증 근거" value={`${summary.verified_evidence||0}개`} description="다음 분석에 사용 가능"/>
    </section>
    {message&&<div className="marketDataMessage" role="status"><HarinPictogram icon="sparkles" tone="lavender" size={18}/><span>{message}</span></div>}
    <section className="marketDataGrid">
      <HarinCard className="marketUploadCard">
        <HarinSectionHeading eyebrow="PRIVATE DATA ROOM" title="상품 자료 올리기" description="다른 상품 프로젝트와 섞이지 않는 비공개 공간이에요." icon="upload"/>
        <label className="marketDropzone"><HarinPictogram icon="upload" tone="blue" size={26}/><span><b>{file?file.name:'파일을 선택해주세요'}</b><small>{file?bytes(file.size):'PDF·이미지·TXT·MD · 최대 20MB'}</small></span><input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md,application/pdf,image/png,image/jpeg,image/webp,text/plain,text/markdown" onChange={event=>setFile(event.target.files?.[0]||null)}/></label>
        <HarinButton variant="primary" icon="upload" disabled={!file||Boolean(working)} onClick={upload}>{working==='UPLOAD'?'비공개 보관 중…':'이 상품 자료실에 보관'}</HarinButton>
        <p className="marketPrivacyNote"><b>외부 AI 전송 없음</b><span>원본은 Supabase 비공개 저장소에만 보관되며 다운로드 주소는 60초 뒤 만료됩니다.</span></p>
      </HarinCard>
      <HarinCard className="marketSourceLibrary">
        <HarinSectionHeading eyebrow="SOURCE LIBRARY" title="보관된 원본" description="판독 검수할 자료를 선택해주세요." aside={<HarinBadge>{sources.length}개</HarinBadge>} icon="folder"/>
        {loading?<div className="marketDataLoading">자료실을 불러오는 중이에요…</div>:sources.length?<div className="marketSourceList">{sources.map(item=>{const meta=statusMeta[item.ingest_status]||[item.ingest_status,'neutral'],isApi=item.source_kind==='API';return <button type="button" className={selectedSourceId===item.id?'active':''} onClick={()=>setSelectedSourceId(item.id)} key={item.id}><HarinPictogram icon={isApi?'link':item.mime_type?.startsWith('image/')?'image':'document'} tone={isApi?'lavender':'blue'} size={18}/><span><b>{item.display_name}</b><small>{isApi?'네이버 공개 원문':bytes(item.size_bytes)} · {new Date(item.created_at).toLocaleDateString('ko-KR')}</small></span><HarinBadge tone={meta[1]}>{meta[0]}</HarinBadge></button>;})}</div>:<HarinEmptyState icon="folder" title="아직 보관된 자료가 없어요" description="왼쪽에서 첫 원본을 올려주세요."/>}
      </HarinCard>
    </section>
    <section className="marketReviewGrid">
      <HarinCard className="marketOcrReview">
        <HarinSectionHeading eyebrow="OCR REVIEW" title="판독 내용 확인" description="자동 판독을 그대로 믿지 않고 원본과 맞는지 사장님이 확인해요." icon="search"/>
        {selected?<form onSubmit={saveReview}><header><span><b>{selected.display_name}</b><small>{selected.ocr_engine==='NAVER_API_HUB_SEARCH'?'네이버 검색 제목·요약 · 원문 관련성을 직접 확인':selected.ocr_engine==='TEXT_UTF8'?'텍스트 자동 추출':'이미지·PDF는 판독 내용을 직접 붙여넣어 확인'}</small></span><HarinButton variant="ghost" icon={selected.source_kind==='API'?'link':'download'} disabled={Boolean(working)} onClick={()=>openSource(selected)}>{selected.source_kind==='API'?'원문 열기':'원본 열기'}</HarinButton></header><label><span>{selected.source_kind==='API'?'검색 결과 내용':'판독 내용'}</span><textarea required maxLength="200000" value={review.ocr_text} onChange={event=>setReview({...review,ocr_text:event.target.value})} placeholder="이미지나 PDF에서 확인한 내용을 붙여넣어주세요."/></label><div className="marketReviewControls"><label><span>{selected.source_kind==='API'?'원문 일치도':'판독 신뢰도'}</span><div><input type="number" min="0" max="100" step="1" value={review.ocr_confidence} onChange={event=>setReview({...review,ocr_confidence:event.target.value})}/><em>%</em></div></label><label className="marketOwnerCheck"><input type="checkbox" checked={review.owner_confirmed} onChange={event=>setReview({...review,owner_confirmed:event.target.checked})}/><span><b>{selected.source_kind==='API'?'원문과 상품 관련성을 확인했어요':'원본과 같음을 확인했어요'}</b><small>95% 이상과 이 확인이 모두 있어야 검수 완료</small></span></label></div><HarinButton variant="primary" icon="shield" disabled={working==='REVIEW'} type="submit">{working==='REVIEW'?'검수 저장 중…':'판독 검수 저장'}</HarinButton></form>:<HarinEmptyState icon="search" title="검수할 원본을 선택해주세요" description="보관된 원본 목록을 누르면 판독 검수 화면이 열려요."/>}
      </HarinCard>
      <HarinCard className="marketEvidenceCreate">
        <HarinSectionHeading eyebrow="EVIDENCE" title="근거로 연결" description="검수한 자료에서 실제 판단에 쓸 값만 짧게 저장해요." icon="target"/>
        <form onSubmit={createEvidence}><label><span>출처 원본</span><select value={evidence.source_id} onChange={event=>setEvidence({...evidence,source_id:event.target.value})}><option value="">직접 측정 · 원본 없음</option>{sources.map(item=><option value={item.id} key={item.id}>{item.display_name} · {statusMeta[item.ingest_status]?.[0]||item.ingest_status}</option>)}</select></label><label><span>근거 유형</span><select value={evidence.evidence_type} onChange={event=>setEvidence({...evidence,evidence_type:event.target.value})}>{Object.entries(evidenceTypes).map(([id,label])=><option value={id} key={id}>{label}</option>)}</select></label><label><span>근거 이름</span><input required maxLength="160" value={evidence.label} onChange={event=>setEvidence({...evidence,label:event.target.value})} placeholder="예: 30개입 판매가"/></label><div className="marketEvidenceValue"><label><span>값·내용</span><input required maxLength="4000" value={evidence.value_text} onChange={event=>setEvidence({...evidence,value_text:event.target.value})} placeholder="예: 12,900"/></label><label><span>단위</span><input maxLength="40" value={evidence.unit} onChange={event=>setEvidence({...evidence,unit:event.target.value})} placeholder="원"/></label></div><div className="marketEvidenceValue"><label><span>신뢰도</span><input type="number" min="0" max="100" value={evidence.confidence} onChange={event=>setEvidence({...evidence,confidence:event.target.value})}/></label><label><span>원본 위치</span><input maxLength="200" value={evidence.locator} onChange={event=>setEvidence({...evidence,locator:event.target.value})} placeholder="3쪽·표 2"/></label></div><label className="marketOwnerCheck"><input type="checkbox" checked={evidence.owner_confirmed} onChange={event=>setEvidence({...evidence,owner_confirmed:event.target.checked})}/><span><b>이 값을 직접 확인했어요</b><small>출처 검수와 함께 충족돼야 검증 근거가 됩니다.</small></span></label><HarinButton variant="primary" icon="target" disabled={working==='EVIDENCE'} type="submit">{working==='EVIDENCE'?'근거 저장 중…':'상품 근거로 저장'}</HarinButton></form>
      </HarinCard>
    </section>
    <section className="marketEvidenceLibrary"><HarinSectionHeading eyebrow="VERIFIED EVIDENCE" title="이 상품의 근거 목록" description="시장·경쟁·전환 분석은 여기서 검증된 근거만 이어받아요." aside={<HarinBadge>{evidences.length}개</HarinBadge>} icon="shield"/>{evidences.length?<div className="marketEvidenceList">{evidences.map(item=>{const meta=evidenceMeta[item.status]||[item.status,'neutral'];return <HarinCard className="marketEvidenceItem" key={item.id}><header><HarinBadge tone={meta[1]}>{meta[0]}</HarinBadge><small>{evidenceTypes[item.evidence_type]||item.evidence_type}</small></header><b>{item.label}</b><strong>{item.value_text}{item.unit?` ${item.unit}`:''}</strong><footer><span>신뢰도 {percent(item.confidence)}</span>{item.status!=='VERIFIED'&&<HarinButton variant="ghost" size="small" disabled={Boolean(working)} onClick={()=>confirmEvidence(item)}>내가 확인</HarinButton>}</footer></HarinCard>;})}</div>:<HarinEmptyState icon="target" title="아직 연결된 근거가 없어요" description="검수한 원본에서 첫 값을 근거로 저장해주세요."/>}</section>
    <HarinProgressiveDetails eyebrow="판정 규칙" title="자료와 근거는 언제 분석에 쓰이나요?" description="자동으로 숫자를 만들어내지 않는 안전 규칙입니다." count="95% + 사장님 확인"><div className="marketEvidenceRules"><article><HarinPictogram icon="search" tone="blue"/><span><b>이미지·PDF 판독</b><p>판독 신뢰도 95% 이상이어도 사장님 원본 확인이 있어야 검수 완료가 됩니다.</p></span></article><article><HarinPictogram icon="shield" tone="mint"/><span><b>상품별 격리</b><p>{productName} 자료와 근거는 다른 상품 프로젝트로 복사하지 않습니다.</p></span></article><article><HarinPictogram icon="ai" tone="lavender"/><span><b>AI 비용 0원</b><p>이번 단계는 저장·검수만 하며 외부 AI나 OpenAI를 호출하지 않습니다.</p></span></article></div></HarinProgressiveDetails>
  </section>;
}
