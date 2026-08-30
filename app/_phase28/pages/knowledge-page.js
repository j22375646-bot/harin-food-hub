'use client';

import {useMemo,useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import HarinIcon from '../../_design-system/harin-icon.js';
import {Phase28PageHeading} from '../primitives/page-heading.js';
import {Phase28RightRailLayout} from '../primitives/right-rail-layout.js';
import './knowledge-page.css';

const emptyForm={title:'',category:'PLANNING',version_label:'v1.0',scope_pages:['main'],source_label:'',notes:''};
const ACCEPTED_SOURCE='.pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown';
const ACTION_COPY={REVIEW:['개인정보 제외 검수','원본에 고객 개인정보가 없음을 직접 확인했나요?'],ACTIVATE:['적용 대상으로 승인','이 자료를 선택한 페이지의 AI 설명 근거로 승인할까요?'],ARCHIVE:['보관','현재 자료를 사용 목록에서 보관함으로 옮길까요?'],RESTORE:['다시 사용 준비','보관 자료를 작성 중 상태로 되돌리고 다시 검수할까요?']};

async function sha256(file){const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());return [...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');}
const date=value=>value?String(value).slice(0,10):'기록 없음';

function TrustGates({model}){
  const totalScopes=model.items.reduce((sum,item)=>sum+item.scopePages.length,0);
  const gates=[
    {step:'01 · 원본',title:'비공개 보관',value:model.summary.sourceStored==null?'확인 필요':`${model.summary.sourceStored}개 STORED`,icon:'document',tone:'blue'},
    {step:'02 · 개인정보',title:'제외 여부 검수',value:model.summary.reviewRequired==null?'확인 필요':`${model.summary.reviewRequired}개 검수 필요`,icon:'shield',tone:model.summary.reviewRequired?'rose':'mint'},
    {step:'03 · 적용 범위',title:'페이지별 격리',value:model.dataStatus==='ERROR'?'확인 필요':`${totalScopes}개 범위 연결`,icon:'checklist',tone:'apricot'},
    {step:'04 · 검색 준비',title:'근거 위치 확인',value:model.summary.searchReady==null?'확인 필요':`${model.summary.searchReady}개 READY`,icon:'search',tone:model.summary.searchReady?'mint':'apricot'}
  ];
  return <section className="knowledgeGates" aria-label="기준자료 적용 신뢰 게이트">{gates.map((gate,index)=><article key={gate.step} data-tone={gate.tone}><i><HarinIcon name={gate.icon} size={22}/></i><span><small>{gate.step}</small><strong>{gate.title}</strong><b>{gate.value}</b></span>{index<gates.length-1?<em aria-hidden="true">›</em>:null}</article>)}</section>;
}

function Summary({model}){
  const rows=[['사용 자료',model.summary.total,'보관함 제외'],['적용 대상',model.summary.active,'검수·범위 승인 완료'],['검수 필요',model.summary.reviewRequired,'자동 적용 금지'],['원본 보관',model.summary.sourceStored,'OpenAI 전송 없음']];
  return <section className="knowledgeSummary" aria-label="AI 기준자료 요약">{rows.map(([label,value,copy])=><article key={label}><span>{label}</span><strong>{value==null?'확인 필요':`${value}개`}</strong><small>{copy}</small></article>)}</section>;
}

function KnowledgeRow({item,selected,onSelect}){
  return <button type="button" className="knowledgeRow" data-selected={selected} aria-pressed={selected} onClick={onSelect}>
    <span className="knowledgeRowName"><strong>{item.title}</strong><small>{item.categoryLabel} · {item.versionLabel} · {date(item.updatedAt)}</small><small>{item.sourceName} · {item.sourceSizeLabel}</small></span>
    <span className="knowledgeScopes">{item.scopeLabels.length?item.scopeLabels.map(label=><i key={label}>{label}</i>):<i>적용 범위 없음</i>}</span>
    <span className="knowledgeStates"><em data-state={item.ready?'ready':'hold'}>{item.statusLabel}</em><em data-state={item.vectorStatus==='READY'?'ready':'hold'}>{item.vectorLabel}</em></span>
    <b aria-hidden="true">›</b>
  </button>;
}

function CreateReference({model,form,setForm,busy,onClose,onSubmit,onRecommended}){
  const toggleScope=id=>setForm(current=>({...current,scope_pages:current.scope_pages.includes(id)?current.scope_pages.filter(item=>item!==id):[...current.scope_pages,id]}));
  return <section className="knowledgeCreate" aria-label="기준자료 등록"><header><div><span>NEW REFERENCE</span><h2>기준자료 등록</h2><p>이름과 적용 범위만 저장하며 원본과 AI 호출은 별도 단계예요.</p></div><button type="button" onClick={onClose}>등록 닫기</button></header>
    {model.recommended.length?<details><summary>먼저 등록하면 좋은 자료 {model.recommended.length}개</summary><div>{model.recommended.map(item=><button type="button" key={item.id} onClick={()=>onRecommended(item)}><strong>{item.title}</strong><small>{item.reason}</small></button>)}</div></details>:null}
    <form onSubmit={onSubmit}>
      <label><span>자료 이름</span><input required minLength="2" maxLength="160" value={form.title} onChange={event=>setForm({...form,title:event.target.value})} placeholder="예: 상품 표시·표현 기준"/></label>
      <label><span>자료 종류</span><select value={form.category} onChange={event=>setForm({...form,category:event.target.value})}>{Object.entries(model.categories).map(([id,label])=><option value={id} key={id}>{label}</option>)}</select></label>
      <label><span>버전</span><input required maxLength="40" value={form.version_label} onChange={event=>setForm({...form,version_label:event.target.value})}/></label>
      <label><span>원본 이름·출처</span><input maxLength="200" value={form.source_label} onChange={event=>setForm({...form,source_label:event.target.value})} placeholder="예: product-claims-v3.2.pdf"/></label>
      <fieldset><legend>적용할 페이지</legend>{Object.entries(model.pageLabels).map(([id,label])=><label key={id}><input type="checkbox" checked={form.scope_pages.includes(id)} onChange={()=>toggleScope(id)}/><span>{label}</span></label>)}</fieldset>
      <label className="wide"><span>이 자료를 쓰는 이유</span><textarea maxLength="1000" value={form.notes} onChange={event=>setForm({...form,notes:event.target.value})} placeholder="어떤 판단의 근거인지 입력"/></label>
      <button className="knowledgeCreateSubmit wide" disabled={busy}>{busy?'등록 중…':'작성 중 자료로 등록'}</button>
    </form>
  </section>;
}

function KnowledgeRail({item,file,setFile,working,onAction,onUpload,onDownload}){
  if(!item)return <div className="knowledgeRailEmpty"><HarinIcon name="document" size={27}/><strong>선택할 기준자료가 없어요.</strong><p>기준자료를 등록하면 원본과 네 신뢰 게이트를 여기서 확인할 수 있어요.</p></div>;
  return <section className="knowledgeRail"><header><div><span>REFERENCE DETAIL</span><h2>{item.title}</h2><p>{item.categoryLabel} · {item.versionLabel} · {date(item.updatedAt)}</p></div><em data-state={item.ready?'ready':'hold'}>{item.statusLabel}</em></header>
    <section className="knowledgeSource"><span><small>PRIVATE SOURCE</small><em data-state={item.sourceStatus==='STORED'?'ready':'hold'}>{item.sourceLabel}</em></span><strong>{item.sourceName} · {item.sourceSizeLabel}</strong><code>{item.sourceHashLabel}</code></section>
    <ul className="knowledgeGateList"><li><i data-ready={item.privacyStatus==='APPROVED'}/><b>개인정보 검수</b><span>{item.privacyLabel}</span></li><li><i data-ready={item.scopePages.length>0}/><b>적용 페이지</b><span>{item.scopeLabels.join(' · ')||'범위 없음'}</span></li><li><i data-ready={item.vectorStatus==='READY'}/><b>검색 준비</b><span>{item.vectorLabel}</span></li><li><i/><b>직접 변경</b><span>금지</span></li></ul>
    <section className="knowledgeActivation"><span>ACTIVATION GATE</span><strong>{item.activationLabel}</strong><p>원본·개인정보·적용 범위가 준비되기 전에는 자동 적용하지 않습니다.</p></section>
    <details className="knowledgeSourceActions"><summary>{item.sourceStatus==='STORED'?'원본 확인·교체':'원본 비공개 보관'}</summary><div>{item.actions.canDownload?<button type="button" disabled={Boolean(working)} onClick={onDownload}>원본 내려받기</button>:null}<label><span>{item.sourceStatus==='STORED'?'새 원본 선택':'원본 선택'}</span><input type="file" accept={ACCEPTED_SOURCE} onChange={event=>setFile(event.target.files?.[0]||null)}/></label>{file?<small>{file.name} · {(file.size/1024/1024).toFixed(2)}MB</small>:null}<button type="button" disabled={Boolean(working)||!file} onClick={onUpload}>{working==='UPLOAD'?'비공개 보관 중…':item.sourceStatus==='STORED'?'원본 교체':'원본 비공개 보관'}</button><p>원본을 바꾸면 개인정보 검수와 적용 승인을 다시 진행합니다.</p></div></details>
    <div className="knowledgeActions">{item.actions.canReview?<button type="button" disabled={Boolean(working)} onClick={()=>onAction('REVIEW')}>개인정보 제외 검수</button>:null}{item.actions.canActivate?<button type="button" disabled={Boolean(working)} onClick={()=>onAction('ACTIVATE')}>적용 대상으로 승인</button>:null}{item.actions.canRestore?<button type="button" disabled={Boolean(working)} onClick={()=>onAction('RESTORE')}>다시 사용 준비</button>:null}{item.actions.canArchive?<button type="button" className="secondary" disabled={Boolean(working)} onClick={()=>onAction('ARCHIVE')}>보관</button>:null}</div>
    <details className="knowledgeHistory"><summary>현재 버전 기록</summary><div><p><span>등록</span><b>{date(item.createdAt)}</b></p><p><span>개인정보 승인</span><b>{date(item.approvedAt)}</b></p><p><span>최근 수정</span><b>{date(item.updatedAt)}</b></p></div></details>
    <p className="knowledgeFootnote">비공개 원본 · 승인 전 자동 적용 없음 · AI 직접 실행 없음</p>
  </section>;
}

export default function Phase28KnowledgePage({model}){
  const router=useRouter();
  const [filter,setFilter]=useState('current');
  const [query,setQuery]=useState('');
  const [activeId,setActiveId]=useState(model.items?.find(item=>item.status!=='ARCHIVED')?.id||model.items?.[0]?.id||null);
  const [createOpen,setCreateOpen]=useState(false);
  const [form,setForm]=useState(emptyForm);
  const [file,setFile]=useState(null);
  const [working,setWorking]=useState('');
  const [message,setMessage]=useState('');
  const [pending,startTransition]=useTransition();
  const visible=useMemo(()=>{const term=query.trim().toLocaleLowerCase('ko');return model.items.filter(item=>(filter==='archive'?item.status==='ARCHIVED':item.status!=='ARCHIVED')&&(!term||`${item.title} ${item.versionLabel} ${item.categoryLabel} ${item.sourceName}`.toLocaleLowerCase('ko').includes(term)));},[model.items,filter,query]);
  const active=model.items.find(item=>item.id===activeId)||visible[0]||model.items[0]||null;
  const refresh=()=>startTransition(()=>router.refresh());

  async function jsonRequest(url,options){const response=await fetch(url,options);const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'처리 실패');return result;}
  async function create(event){event.preventDefault();setWorking('CREATE');setMessage('기준자료 정보를 저장하는 중입니다.');try{await jsonRequest('/api/ai/knowledge',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(form)});setForm(emptyForm);setCreateOpen(false);setMessage('기준자료를 등록했습니다. 다음으로 원본을 비공개 보관해주세요.');refresh();}catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setWorking('');}}
  async function action(nextAction){if(!active)return;const copy=ACTION_COPY[nextAction];if(copy&&!window.confirm(copy[1]))return;setWorking(nextAction);setMessage('자료 상태를 안전하게 변경하는 중입니다.');try{await jsonRequest('/api/ai/knowledge',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({id:active.id,action:nextAction})});setMessage(`${copy?.[0]||'상태 변경'}을 완료하고 서버 값을 다시 확인했습니다.`);refresh();}catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setWorking('');}}
  async function upload(){if(!active||!file)return;if(!window.confirm(`${file.name} 원본을 비공개 저장소에 보관할까요? 원본 교체 시 기존 검수는 초기화됩니다.`))return;setWorking('UPLOAD');setMessage('원본 파일을 비공개 저장소에 보관하는 중입니다.');try{const metadata={file_name:file.name,mime_type:file.type||'application/octet-stream',size_bytes:file.size};const prepared=await jsonRequest(`/api/ai/knowledge/${active.id}/source`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(metadata)});const checksum=await sha256(file);const uploadBody=new FormData();uploadBody.append('cacheControl','3600');uploadBody.append('',file);const uploaded=await fetch(prepared.upload.signed_url,{method:'PUT',headers:{'x-upsert':'false'},body:uploadBody});if(!uploaded.ok)throw new Error('비공개 저장소 업로드에 실패했습니다.');await jsonRequest(`/api/ai/knowledge/${active.id}/source`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({...metadata,storage_path:prepared.upload.storage_path,sha256:checksum})});setFile(null);setMessage('원본을 보관했습니다. 개인정보 제외 검수를 다시 진행해주세요.');refresh();}catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setWorking('');}}
  async function download(){if(!active)return;setWorking('DOWNLOAD');try{const result=await jsonRequest(`/api/ai/knowledge/${active.id}/source`,{cache:'no-store'});window.location.assign(result.signed_url);}catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setWorking('');}}
  function recommended(item){setForm({...emptyForm,title:item.title,category:item.category,scope_pages:item.scopes,notes:item.reason});}

  const context=model.dataStatus==='ERROR'?'기준자료 저장소 확인 필요':`사용 자료 ${model.summary.total}개 · 적용 대상 ${model.summary.active}개 · 개인정보 검수 ${model.summary.reviewRequired}개`;
  const rail=<KnowledgeRail item={active} file={file} setFile={setFile} working={working||pending} onAction={action} onUpload={upload} onDownload={download}/>;
  return <section className="knowledgePage" data-phase28-root="true" data-phase28-page="knowledge">
    <Phase28PageHeading context={context} title="AI가 참고할 " accent="기준자료를 관리해요." summary="원본과 적용 범위, 개인정보 검수, 검색 준비 상태를 확인한 자료만 운영 설명에 사용해요."/>
    {model.error?<div className="knowledgeNotice" role="alert"><HarinIcon name="warning" size={20}/><span><strong>기준자료를 불러오지 못했습니다.</strong><small>{model.error} · 자료 수를 0개로 표시하지 않습니다.</small></span></div>:null}
    {message?<div className="knowledgeMessage" role="status">{message}</div>:null}
    <TrustGates model={model}/><Summary model={model}/>
    <Phase28RightRailLayout label="기준자료 상세" rail={rail}>
      <section className="knowledgeWorkbench"><header className="knowledgeToolbar"><div><button type="button" data-selected={filter==='current'} onClick={()=>setFilter('current')}>사용 자료 {model.items.filter(item=>item.status!=='ARCHIVED').length}</button><button type="button" data-selected={filter==='archive'} onClick={()=>setFilter('archive')}>보관함 {model.items.filter(item=>item.status==='ARCHIVED').length}</button></div><label><HarinIcon name="search" size={17}/><input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="자료 이름·버전 찾기" aria-label="기준자료 검색"/></label><button className="newKnowledge" type="button" onClick={()=>setCreateOpen(value=>!value)} aria-expanded={createOpen}>기준자료 등록</button></header>
        {createOpen?<CreateReference model={model} form={form} setForm={setForm} busy={working==='CREATE'} onClose={()=>setCreateOpen(false)} onSubmit={create} onRecommended={recommended}/>:null}
        <div className="knowledgeList">{visible.map(item=><KnowledgeRow item={item} selected={item.id===active?.id} onSelect={()=>{setActiveId(item.id);setFile(null);}} key={item.id}/>)}{visible.length?null:<div className="knowledgeEmpty"><HarinIcon name="document" size={26}/><strong>이 조건의 기준자료가 없어요.</strong><p>검색어나 보관함 조건을 바꾸거나 새 자료를 등록해주세요.</p></div>}</div>
      </section>
    </Phase28RightRailLayout>
  </section>;
}
