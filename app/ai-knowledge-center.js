'use client';

import { useEffect, useMemo, useState } from 'react';

const statusLabel={DRAFT:'작성 중',READY:'검수 완료',ACTIVE:'적용 대상',ARCHIVED:'보관'};
const privacyLabel={REVIEW_REQUIRED:'개인정보 검수 필요',APPROVED:'개인정보 제외 확인',BLOCKED:'사용 금지'};
const vectorLabel={NOT_CONNECTED:'File Search 미연결',QUEUED:'연결 대기',PROCESSING:'자료 처리 중',READY:'검색 준비 완료',FAILED:'연결 실패'};
const sourceLabel={NOT_UPLOADED:'원본 없음',UPLOAD_PENDING:'업로드 확인 중',STORED:'원본 보관 완료',FAILED:'원본 보관 실패'};
const emptyForm={title:'',category:'PLANNING',version_label:'v1.0',scope_pages:['main'],source_label:'',notes:''};

const bytes=value=>{const size=Number(value||0);if(!size)return '-';if(size<1024)return `${size}B`;if(size<1024*1024)return `${(size/1024).toFixed(1)}KB`;return `${(size/1024/1024).toFixed(1)}MB`;};
async function sha256(file){const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());return [...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');}

export default function AiKnowledgeCenter() {
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [message,setMessage]=useState('');
  const [working,setWorking]=useState('');
  const [form,setForm]=useState(emptyForm);
  const [createOpen,setCreateOpen]=useState(false);
  const [query,setQuery]=useState('');
  const [status,setStatus]=useState('CURRENT');
  const [sourceFiles,setSourceFiles]=useState({});

  async function load(){
    setLoading(true);
    try{
      const response=await fetch('/api/ai/knowledge',{cache:'no-store'});
      const result=await response.json();
      if(!response.ok||!result.ok)throw new Error(result.error||'기준자료 조회 실패');
      setData(result);
    }catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setLoading(false);}
  }
  useEffect(()=>{load();},[]);

  async function create(event){
    event.preventDefault();setWorking('CREATE');setMessage('기준자료의 이름과 적용 범위를 저장하는 중입니다.');
    try{
      const response=await fetch('/api/ai/knowledge',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(form)});
      const result=await response.json();
      if(!response.ok||!result.ok)throw new Error(result.error||'자료 등록 실패');
      setForm(emptyForm);setCreateOpen(false);
      setMessage('자료를 등록했습니다. 아래 목록에서 원본 파일을 비공개 보관해주세요.');
      await load();
    }catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setWorking('');}
  }

  async function action(item,nextAction){
    const key=`${item.id}:${nextAction}`;setWorking(key);setMessage('자료 상태를 안전하게 변경하는 중입니다.');
    try{
      const response=await fetch('/api/ai/knowledge',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({id:item.id,action:nextAction})});
      const result=await response.json();
      if(!response.ok||!result.ok)throw new Error(result.error||'상태 변경 실패');
      setMessage(nextAction==='REVIEW'?'원본에 고객 개인정보가 없는 것으로 검수했습니다.':nextAction==='ACTIVATE'?'페이지별 분석 적용 대상으로 승인했습니다. 아직 AI 호출은 하지 않습니다.':nextAction==='ARCHIVE'?'자료를 보관함으로 옮겼습니다.':'자료를 다시 작성 중으로 돌렸습니다.');
      await load();
    }catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setWorking('');}
  }

  async function uploadSource(item){
    const file=sourceFiles[item.id];
    if(!file)return;
    const key=`${item.id}:UPLOAD`;setWorking(key);setMessage(`${file.name} 원본을 비공개 저장소에 보관하는 중입니다.`);
    try{
      const metadata={file_name:file.name,mime_type:file.type||'application/octet-stream',size_bytes:file.size};
      const preparedResponse=await fetch(`/api/ai/knowledge/${item.id}/source`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(metadata)});
      const prepared=await preparedResponse.json();
      if(!preparedResponse.ok||!prepared.ok)throw new Error(prepared.error||'원본 업로드 준비 실패');
      const checksum=await sha256(file);
      const uploadBody=new FormData();uploadBody.append('cacheControl','3600');uploadBody.append('',file);
      const uploaded=await fetch(prepared.upload.signed_url,{method:'PUT',headers:{'x-upsert':'false'},body:uploadBody});
      if(!uploaded.ok)throw new Error('비공개 저장소 업로드에 실패했습니다.');
      const completedResponse=await fetch(`/api/ai/knowledge/${item.id}/source`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({...metadata,storage_path:prepared.upload.storage_path,sha256:checksum})});
      const completed=await completedResponse.json();
      if(!completedResponse.ok||!completed.ok)throw new Error(completed.error||'업로드 확인 실패');
      setSourceFiles(current=>({...current,[item.id]:null}));
      setMessage('원본을 비공개 보관했습니다. 파일이 바뀌었으므로 개인정보 검수를 다시 진행해주세요.');
      await load();
    }catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setWorking('');}
  }

  async function downloadSource(item){
    const key=`${item.id}:DOWNLOAD`;setWorking(key);
    try{
      const response=await fetch(`/api/ai/knowledge/${item.id}/source`,{cache:'no-store'});
      const result=await response.json();
      if(!response.ok||!result.ok)throw new Error(result.error||'원본 열기 실패');
      window.location.assign(result.signed_url);
    }catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setWorking('');}
  }

  const items=useMemo(()=>{
    const term=query.trim().toLowerCase();
    return (data?.items||[]).filter(item=>(status==='ARCHIVED'?item.status==='ARCHIVED':item.status!=='ARCHIVED')&&(!term||`${item.title} ${item.version_label} ${item.source_label||''}`.toLowerCase().includes(term)));
  },[data,query,status]);
  const toggleScope=id=>setForm(current=>({...current,scope_pages:current.scope_pages.includes(id)?current.scope_pages.filter(item=>item!==id):[...current.scope_pages,id]}));
  const startRecommended=item=>{setForm({...emptyForm,title:item.title,category:item.category,scope_pages:item.scopes,notes:item.reason});setCreateOpen(true);setMessage('권장 자료의 이름과 적용 범위를 채웠습니다. 등록한 뒤 원본 파일을 보관해주세요.');window.requestAnimationFrame(()=>document.querySelector('.knowledgeCreate')?.scrollIntoView({behavior:'smooth',block:'start'}));};
  const summary=data?.summary||{};

  return <section className="knowledgeCenter">
    <section className="knowledgeHero knowledgeHeroC">
      <div><span>12-5C · HARIN AI KNOWLEDGE</span><h1>AI 기준자료와 분석 설계</h1><p>원본은 비공개로 보관하고, 페이지마다 어떤 숫자를 받아 어떤 형식으로 설명할지 미리 고정합니다.</p></div>
      <aside><small>현재 OpenAI 비용</small><strong>0원</strong><em>원본 보관 가능 · AI 호출 잠금</em><button onClick={()=>setCreateOpen(value=>!value)}>{createOpen?'등록 닫기':'기준자료 등록'}</button></aside>
    </section>
    <section className="knowledgeFlow five" aria-label="기준자료 적용 순서"><span className="done"><i>1</i><b>자료 등록</b><small>이름·버전·용도</small></span><strong>→</strong><span className="done"><i>2</i><b>원본 보관</b><small>비공개 저장소</small></span><strong>→</strong><span><i>3</i><b>개인정보 검수</b><small>고객자료 제외</small></span><strong>→</strong><span><i>4</i><b>범위 승인</b><small>페이지별 허용</small></span><strong>→</strong><span className="locked"><i>5</i><b>AI 검색 연결</b><small>크레딧 충전 후</small></span></section>
    <details className="knowledgeHelp"><summary><span><b>도움말 · 원본은 어디에 저장되나요?</b><small>외부 공개 주소가 없는 Supabase 비공개 저장소에 보관합니다.</small></span><em>열기</em></summary><div><p><b>지금 가능한 일</b> PDF·DOCX·TXT·MD 원본을 최대 20MB까지 보관하고 버전을 구분할 수 있습니다.</p><p><b>아직 하지 않는 일</b> OpenAI 파일 업로드, File Search 연결, 자동분석은 실행하지 않습니다.</p><p><b>주의</b> 고객 이름·연락처·주소·이메일·주문 원문이 들어간 파일은 등록하지 마세요.</p></div></details>
    {message&&<div className="knowledgeMessage" role="status">{message}</div>}
    {createOpen&&<form className="knowledgeCreate" onSubmit={create}><header><div><span>NEW REFERENCE</span><h2>새 기준자료 등록</h2></div><b>목록 저장 · AI 호출 없음</b></header><div className="knowledgeFormGrid"><label><span>자료 이름</span><input required minLength="2" maxLength="160" value={form.title} onChange={event=>setForm({...form,title:event.target.value})} placeholder="예: 상품별 광고 운영 기준서"/></label><label><span>자료 종류</span><select value={form.category} onChange={event=>setForm({...form,category:event.target.value})}>{Object.entries(data?.categories||{}).map(([id,label])=><option value={id} key={id}>{label}</option>)}</select></label><label><span>버전</span><input required maxLength="40" value={form.version_label} onChange={event=>setForm({...form,version_label:event.target.value})}/></label><label><span>원본 이름·출처</span><input maxLength="200" value={form.source_label} onChange={event=>setForm({...form,source_label:event.target.value})} placeholder="예: 통합기획서 v3.0.docx"/></label><fieldset><legend>적용할 페이지</legend>{Object.entries(data?.page_labels||{}).map(([id,label])=><label key={id}><input type="checkbox" checked={form.scope_pages.includes(id)} onChange={()=>toggleScope(id)}/><span>{label}</span></label>)}</fieldset><label className="wide"><span>이 자료를 쓰는 이유</span><textarea maxLength="1000" value={form.notes} onChange={event=>setForm({...form,notes:event.target.value})} placeholder="어떤 판단에 참고해야 하는지 쉬운 말로 적어주세요."/></label></div><button disabled={working==='CREATE'}>{working==='CREATE'?'등록 중…':'작성 중 자료로 등록'}</button></form>}
    <section className="knowledgeKpis"><article><small>등록 자료</small><b>{Number(summary.total||0)}개</b><span>버전 관리 대상</span></article><article><small>원본 보관</small><b>{Number(summary.source_stored||0)}개</b><span>비공개 저장 완료</span></article><article className={summary.review_required?'warn':''}><small>검수 필요</small><b>{Number(summary.review_required||0)}개</b><span>개인정보 제외 확인</span></article><article className="locked"><small>AI 검색 연결</small><b>{summary.file_search_configured?'설정됨':'대기'}</b><span>크레딧 충전 후 실행</span></article></section>
    <section className="analysisContractSection"><header><div><span>PAGE ANALYSIS CONTRACT</span><h2>페이지별 자동분석 설계</h2><p>허브 서버가 계산할 자료와 AI가 설명할 범위를 미리 고정했습니다.</p></div><b>{(data?.analysis_contracts||[]).length}개 화면 준비</b></header><div className="analysisContractGrid">{(data?.analysis_contracts||[]).map(contract=><details key={contract.id}><summary><span><em>{data?.page_labels?.[contract.id]}</em><b>{contract.title}</b><small>{contract.schedule}</small></span><i>＋</i></summary><div><p>{contract.purpose}</p><h3>서버 입력</h3><div className="contractTags">{contract.inputs.map(input=><span key={input}>{input}</span>)}</div><h3>AI 출력</h3><p>관찰 → 영향 → 근거 → 추천 → 신뢰도 → 주의사항</p><footer><span>숫자 계산: 서버</span><span>AI 역할: 설명만</span><span>직접 변경: 금지</span></footer></div></details>)}</div></section>
    <section className="knowledgeRecommended"><header><div><span>RECOMMENDED SET</span><h2>먼저 등록하면 좋은 자료</h2></div><small>자료를 등록한 뒤 해당 원본을 연결하세요.</small></header><div>{(data?.recommended||[]).map(item=><article key={item.id}><span>{data?.categories?.[item.category]}</span><b>{item.title}</b><p>{item.reason}</p><footer><div>{item.scopes.map(scope=><em key={scope}>{data?.page_labels?.[scope]}</em>)}</div><button type="button" onClick={()=>startRecommended(item)}>이 자료로 시작</button></footer></article>)}</div></section>
    <section className="knowledgeLibrary"><header><div><span>REFERENCE LIBRARY</span><h2>등록된 기준자료</h2></div><div><input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="자료 이름 찾기"/><button className={status==='CURRENT'?'active':''} onClick={()=>setStatus('CURRENT')}>사용 자료</button><button className={status==='ARCHIVED'?'active':''} onClick={()=>setStatus('ARCHIVED')}>보관함</button></div></header>{loading?<div className="knowledgeEmpty">기준자료를 불러오는 중입니다…</div>:<div className="knowledgeList">{items.map(item=><article className={`${String(item.status).toLowerCase()} ${String(item.privacy_status).toLowerCase()}`} key={item.id}><header><div><span>{data?.categories?.[item.category]} · {item.version_label}</span><b>{item.title}</b><small>{item.source_label||'원본 이름 미입력'} · 최근 수정 {String(item.updated_at||'').slice(0,10)}</small></div><em>{statusLabel[item.status]}</em></header><div className="knowledgeBadges"><span className={item.source_status==='STORED'?'stored':'missing'}>{sourceLabel[item.source_status]||'원본 없음'}</span><span>{privacyLabel[item.privacy_status]}</span><span>{vectorLabel[item.vector_status]}</span>{(item.scope_pages||[]).map(scope=><span key={scope}>{data?.page_labels?.[scope]}</span>)}</div>{item.notes&&<p>{item.notes}</p>}<details className="knowledgeSource"><summary><span><b>원본 파일</b><small>{item.source_status==='STORED'?`${item.source_file_name} · ${bytes(item.source_size_bytes)}`:'PDF·DOCX·TXT·MD · 최대 20MB'}</small></span><em>{item.source_status==='STORED'?'확인·교체':'보관하기'}</em></summary><div>{item.source_status==='STORED'&&<button type="button" className="sourceDownload" disabled={Boolean(working)} onClick={()=>downloadSource(item)}>원본 내려받기</button>}<label><span>{item.source_status==='STORED'?'새 버전으로 교체':'원본 선택'}</span><input type="file" accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown" onChange={event=>setSourceFiles(current=>({...current,[item.id]:event.target.files?.[0]||null}))}/></label>{sourceFiles[item.id]&&<small>{sourceFiles[item.id].name} · {bytes(sourceFiles[item.id].size)}</small>}<button type="button" disabled={Boolean(working)||!sourceFiles[item.id]} onClick={()=>uploadSource(item)}>{working===`${item.id}:UPLOAD`?'비공개 보관 중…':item.source_status==='STORED'?'원본 교체':'원본 비공개 보관'}</button><p>원본을 바꾸면 개인정보 검수와 적용 승인이 자동으로 다시 필요해집니다.</p></div></details><footer><small>{item.source_status==='STORED'?'OpenAI로 전송하지 않은 비공개 원본입니다.':'원본을 보관해야 개인정보 검수를 진행할 수 있습니다.'}</small><div>{item.status==='DRAFT'&&item.privacy_status!=='BLOCKED'&&<button disabled={Boolean(working)||item.source_status!=='STORED'} onClick={()=>action(item,'REVIEW')}>개인정보 제외 검수</button>}{item.status==='READY'&&<button disabled={Boolean(working)} onClick={()=>action(item,'ACTIVATE')}>적용 대상으로 승인</button>}{item.status==='ARCHIVED'?<button disabled={Boolean(working)} onClick={()=>action(item,'RESTORE')}>다시 사용 준비</button>:<button className="secondary" disabled={Boolean(working)} onClick={()=>action(item,'ARCHIVE')}>보관</button>}</div></footer></article>)}{!items.length&&<div className="knowledgeEmpty">이 조건의 기준자료가 없습니다. 위의 ‘기준자료 등록’에서 첫 자료를 추가해보세요.</div>}</div>}</section>
    <p className="knowledgeGuard"><b>OpenAI 잠금 유지:</b> 원본은 Supabase 비공개 저장소에만 보관됩니다. OpenAI 파일 업로드, File Search, 자동분석, 광고·상품 변경은 실행되지 않습니다.</p>
  </section>;
}
