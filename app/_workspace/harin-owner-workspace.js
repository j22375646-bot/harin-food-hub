'use client';

import './harin-owner-workspace.css';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import hubRoutesModule from '../../lib/navigation/hub-routes.js';
import { HarinIcon } from '../_design-system/harin-icon.js';

const PRIORITY_LABEL={LOW:'여유',NORMAL:'보통',HIGH:'먼저'};
const TYPE_LABEL={TASK:'할 일',NOTE:'메모'};
const SPECIAL_COMMANDS=[
  {id:'scan-order',title:'주문·송장번호 빠른 찾기',description:'카메라 없이 주문번호나 우체국 송장을 입력',href:'/orders?focus=scan',icon:'scan',keywords:'바코드 송장 주문 번호 찾기'},
  {id:'postal',title:'우체국 송장 자동발급',description:'판매자배송 주문 선택과 송장 발급으로 이동',href:'/orders?focus=epost',icon:'truck',keywords:'우체국 자동 발급 배송'},
  {id:'today-cs',title:'오늘 CS 확인',description:'답변·취소·반품 요청부터 확인',href:'/cs',icon:'customer',keywords:'문의 취소 반품 교환'},
  {id:'inventory-risk',title:'재고 위험 확인',description:'품절·저재고·재입고 판단',href:'/inventory',icon:'inventory',keywords:'품절 저재고 재입고'},
  {id:'alerts',title:'열린 운영 알림',description:'수집 오류와 이상징후 처리',href:'/notifications',icon:'alerts',keywords:'경고 오류 예외'}
];

function currentLocation(){return typeof window==='undefined'?'/':`${window.location.pathname}${window.location.search}`;}
function dueValue(value){if(!value)return '';const date=new Date(value);return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);}
function dueIso(value){return value?new Date(value).toISOString():null;}
function friendlyTime(value){return value?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value)):'';}

function CommandResults({query,onNavigate,onCapture}){
  const commands=useMemo(()=>{
    const pages=hubRoutesModule.HUB_NAV.map(item=>({id:`page-${item.id}`,title:item.label,description:item.description,href:item.href,icon:item.id,keywords:`${item.label} ${item.description}`}));
    const workspaces=Object.entries(hubRoutesModule.HUB_WORKSPACES||{}).flatMap(([page,items])=>items.map(item=>({id:`workspace-${page}-${item.id}`,title:item.label,description:item.description,href:item.href,icon:page,keywords:`${item.label} ${item.description}`})));
    return [...SPECIAL_COMMANDS,...pages,...workspaces];
  },[]);
  const needle=query.trim().toLowerCase();
  const visible=commands.filter(item=>!needle||`${item.title} ${item.description} ${item.keywords}`.toLowerCase().includes(needle)).slice(0,10);
  return <section className="ownerCommandResults"><header><b>{needle?'검색 결과':'바로 실행'}</b><small>메뉴·업무를 한 번에 열어요</small></header><div><button type="button" className="captureCommand" onClick={()=>onCapture('TASK')}><i><HarinIcon name="execution"/></i><span><b>새 할 일 적기</b><small>현재 화면과 함께 서버에 저장</small></span><kbd>N</kbd></button><button type="button" className="captureCommand" onClick={()=>onCapture('NOTE')}><i><HarinIcon name="note"/></i><span><b>빠른 메모 남기기</b><small>PC와 휴대폰에서 같은 메모 확인</small></span><kbd>M</kbd></button>{visible.map(item=><button type="button" onClick={()=>onNavigate(item.href)} key={item.id}><i><HarinIcon name={item.icon}/></i><span><b>{item.title}</b><small>{item.description}</small></span><HarinIcon name="chevron" size={16}/></button>)}</div>{!visible.length?<p>찾는 명령이 없어요. 메뉴 이름이나 ‘송장’, ‘재고’, ‘CS’를 입력해보세요.</p>:null}</section>;
}

export default function HarinOwnerWorkspace({pageKey='main',pageLabel='메인'}){
  const router=useRouter();
  const [open,setOpen]=useState(false),[tab,setTab]=useState('COMMAND'),[query,setQuery]=useState('');
  const [data,setData]=useState({workItems:[],savedViews:[]}),[loading,setLoading]=useState(false),[busy,setBusy]=useState(''),[message,setMessage]=useState('');
  const [capture,setCapture]=useState(null),[saveName,setSaveName]=useState(''),[editing,setEditing]=useState(null),[autosave,setAutosave]=useState('');
  const [href,setHref]=useState('/');
  const searchRef=useRef(null),editReadyRef=useRef(false),loadedRef=useRef(false);
  const openTasks=data.workItems.filter(item=>item.item_type==='TASK'&&item.status==='OPEN').length;

  async function load(){setLoading(true);try{const response=await fetch('/api/owner-workspace',{cache:'no-store'});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'업무 저장함 조회 실패');setData(result);loadedRef.current=true;}catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setLoading(false);}}
  async function mutate(body){const response=await fetch('/api/owner-workspace',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'저장 실패');return result;}
  function reveal(options={}){setHref(currentLocation());setOpen(true);setTab(options.mode||'COMMAND');setQuery(options.query||'');if(!loadedRef.current)load();}
  useEffect(()=>{setHref(currentLocation());},[]);
  useEffect(()=>{
    const openPalette=event=>reveal(event.detail||{});
    const onKey=event=>{
      const target=event.target,typing=target instanceof HTMLInputElement||target instanceof HTMLTextAreaElement||target instanceof HTMLSelectElement||target?.isContentEditable;
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();openPalette({detail:{}});}
      else if(!typing&&event.key==='/'){event.preventDefault();openPalette({detail:{}});}
      else if(open&&event.key==='Escape')setOpen(false);
    };
    window.addEventListener('harin:open-command',openPalette);document.addEventListener('keydown',onKey);
    return()=>{window.removeEventListener('harin:open-command',openPalette);document.removeEventListener('keydown',onKey);};
  },[open]);
  useEffect(()=>{if(!open)return;const previous=document.body.style.overflow;document.body.style.overflow='hidden';requestAnimationFrame(()=>searchRef.current?.focus());return()=>{document.body.style.overflow=previous;};},[open]);
  useEffect(()=>{
    if(!editing)return;
    if(!editReadyRef.current){editReadyRef.current=true;return;}
    setAutosave('저장 중…');
    const timer=setTimeout(async()=>{try{const result=await mutate({action:'UPDATE_ITEM',id:editing.id,title:editing.title,body:editing.body,priority:editing.priority,dueAt:dueIso(editing.dueAt)});setData(current=>({...current,workItems:current.workItems.map(item=>item.id===result.item.id?result.item:item)}));setAutosave('자동저장됨');}catch(error){setAutosave(`저장 확인 필요 · ${error.message}`);}},750);
    return()=>clearTimeout(timer);
  },[editing]);

  function navigate(nextHref){setOpen(false);router.push(nextHref);}
  function beginCapture(itemType){setTab('WORK');setCapture({itemType,title:'',body:'',priority:'NORMAL',dueAt:''});setMessage('');}
  async function createItem(event){event.preventDefault();if(!capture?.title.trim())return;setBusy('CREATE');try{const result=await mutate({action:'CREATE_ITEM',...capture,dueAt:dueIso(capture.dueAt),pageKey,contextLabel:pageLabel,contextHref:href});setData(current=>({...current,workItems:[result.item,...current.workItems]}));setCapture(null);setMessage(`${TYPE_LABEL[result.item.item_type]}을 저장했습니다.`);}catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setBusy('');}}
  async function changeItem(item,action,extra={}){setBusy(item.id);try{const result=await mutate({action,id:item.id,...extra});if(action==='ARCHIVE_ITEM'){setData(current=>({...current,workItems:current.workItems.filter(value=>value.id!==item.id)}));setMessage('항목을 보관했습니다.');}else setData(current=>({...current,workItems:current.workItems.map(value=>value.id===item.id?result.item:value)}));}catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setBusy('');}}
  function beginEdit(item){editReadyRef.current=false;setAutosave('');setEditing({id:item.id,title:item.title,body:item.body||'',priority:item.priority,dueAt:dueValue(item.due_at)});}
  async function saveCurrentView(event){event.preventDefault();setBusy('SAVE_VIEW');try{const result=await mutate({action:'SAVE_VIEW',name:saveName.trim()||`${pageLabel} 화면`,pageKey,href,isPinned:false});setData(current=>({...current,savedViews:[result.savedView,...current.savedViews.filter(item=>item.id!==result.savedView.id)]}));setSaveName('');setMessage('현재 화면과 조건을 저장했습니다.');}catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setBusy('');}}
  async function changeView(item,action,extra={}){setBusy(item.id);try{const result=await mutate({action,id:item.id,...extra});if(action==='DELETE_VIEW')setData(current=>({...current,savedViews:current.savedViews.filter(value=>value.id!==item.id)}));else setData(current=>({...current,savedViews:current.savedViews.map(value=>value.id===item.id?result.savedView:value)}));}catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setBusy('');}}

  return <>
    <button type="button" className="ownerWorkspaceTrigger" onClick={()=>reveal()} aria-label={`빠른 명령과 할 일 열기${openTasks?`, 미완료 ${openTasks}건`:''}`}><HarinIcon name="sparkles"/><span>빠른 명령</span><kbd>⌘ K</kbd>{openTasks?<em>{openTasks}</em>:null}</button>
    {open?<div className="ownerWorkspaceLayer"><button type="button" className="ownerWorkspaceBackdrop" onClick={()=>setOpen(false)} aria-label="빠른 업무창 닫기"/><section className="ownerWorkspacePanel" role="dialog" aria-modal="true" aria-labelledby="owner-workspace-title"><header><div><span>빠른 업무창</span><b id="owner-workspace-title">무엇을 바로 처리할까요?</b><small>{pageLabel} 화면 · 모든 저장 내용은 기기 사이에 이어져요</small></div><button type="button" onClick={()=>setOpen(false)} aria-label="닫기">×</button></header><label className="ownerWorkspaceSearch"><HarinIcon name="search"/><input ref={searchRef} type="search" value={query} onChange={event=>{setQuery(event.target.value);setTab('COMMAND');}} placeholder="송장 발급, 재고 위험, 오늘 CS, 메뉴 이름…"/><kbd>ESC</kbd></label><nav><button type="button" className={tab==='COMMAND'?'active':''} onClick={()=>setTab('COMMAND')}>빠른 명령</button><button type="button" className={tab==='WORK'?'active':''} onClick={()=>setTab('WORK')}>메모·할 일 <em>{openTasks}</em></button><button type="button" className={tab==='SAVED'?'active':''} onClick={()=>setTab('SAVED')}>저장한 화면 <em>{data.savedViews.length}</em></button></nav>{message?<p className="ownerWorkspaceMessage" role="status">{message}</p>:null}<div className="ownerWorkspaceBody">
      {tab==='COMMAND'?<CommandResults query={query} onNavigate={navigate} onCapture={beginCapture}/>:null}
      {tab==='WORK'?<section className="ownerWorkTab"><header><div><b>사장님 업무 메모</b><small>고객명·주소 대신 주문번호만 적어주세요.</small></div><div><button type="button" onClick={()=>beginCapture('TASK')}>+ 할 일</button><button type="button" onClick={()=>beginCapture('NOTE')}>+ 메모</button></div></header>{capture?<form className="ownerCaptureForm" onSubmit={createItem}><div><em>{TYPE_LABEL[capture.itemType]}</em><b>{pageLabel}에 연결해 저장</b><button type="button" onClick={()=>setCapture(null)}>취소</button></div><input autoFocus maxLength={160} value={capture.title} onChange={event=>setCapture(current=>({...current,title:event.target.value}))} placeholder={capture.itemType==='TASK'?'예: 오후 2시 송장 발급 확인':'예: 이 상품 원가 다시 확인'}/><textarea maxLength={4000} value={capture.body} onChange={event=>setCapture(current=>({...current,body:event.target.value}))} placeholder="필요한 내용만 짧게 적어두세요."/><footer><select value={capture.priority} onChange={event=>setCapture(current=>({...current,priority:event.target.value}))}><option value="HIGH">먼저</option><option value="NORMAL">보통</option><option value="LOW">여유</option></select>{capture.itemType==='TASK'?<input type="datetime-local" value={capture.dueAt} onChange={event=>setCapture(current=>({...current,dueAt:event.target.value}))}/>:null}<button disabled={busy==='CREATE'||!capture.title.trim()}>{busy==='CREATE'?'저장 중…':'저장'}</button></footer></form>:null}{editing?<form className="ownerAutosaveEditor" onSubmit={event=>event.preventDefault()}><header><b>내용 편집</b><span className={autosave.startsWith('저장 확인')?'error':''}>{autosave||'바꾸면 자동으로 저장됩니다.'}</span><button type="button" onClick={()=>setEditing(null)}>완료</button></header><input maxLength={160} value={editing.title} onChange={event=>setEditing(current=>({...current,title:event.target.value}))}/><textarea maxLength={4000} value={editing.body} onChange={event=>setEditing(current=>({...current,body:event.target.value}))}/><footer><select value={editing.priority} onChange={event=>setEditing(current=>({...current,priority:event.target.value}))}>{Object.entries(PRIORITY_LABEL).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select><input type="datetime-local" value={editing.dueAt} onChange={event=>setEditing(current=>({...current,dueAt:event.target.value}))}/></footer></form>:null}<div className="ownerWorkList">{loading?<p>저장된 업무를 불러오는 중이에요…</p>:data.workItems.map(item=><article className={`${item.status.toLowerCase()} ${item.priority.toLowerCase()}`} key={item.id}><button type="button" className="ownerWorkCheck" onClick={()=>changeItem(item,'TOGGLE_ITEM',{done:item.status!=='DONE'})} disabled={busy===item.id} aria-label={item.status==='DONE'?'다시 할 일로':'완료 처리'}>{item.status==='DONE'?'✓':'○'}</button><section><span><em>{TYPE_LABEL[item.item_type]}</em><small>{PRIORITY_LABEL[item.priority]}{item.due_at?` · ${friendlyTime(item.due_at)}`:''}</small></span><b>{item.title}</b>{item.body?<p>{item.body}</p>:null}<a href={item.context_href}>{item.context_label||'연결 화면'}로 이동 →</a></section><aside><button type="button" onClick={()=>beginEdit(item)}>편집</button><button type="button" onClick={()=>changeItem(item,'ARCHIVE_ITEM')} disabled={busy===item.id}>보관</button></aside></article>)}{!loading&&!data.workItems.length?<p>저장한 메모나 할 일이 아직 없어요.</p>:null}</div></section>:null}
      {tab==='SAVED'?<section className="ownerSavedTab"><header><div><b>기기 사이에 이어지는 저장 화면</b><small>현재 주소와 플랫폼·기간 조건을 함께 기억합니다.</small></div></header><form onSubmit={saveCurrentView}><input maxLength={80} value={saveName} onChange={event=>setSaveName(event.target.value)} placeholder={`${pageLabel} 화면 이름`}/><button disabled={busy==='SAVE_VIEW'}>{busy==='SAVE_VIEW'?'저장 중…':'현재 화면 저장'}</button></form><div>{data.savedViews.map(item=><article className={item.is_pinned?'pinned':''} key={item.id}><button type="button" className="savedViewOpen" onClick={()=>navigate(item.href)}><i><HarinIcon name={item.page_key}/></i><span><b>{item.name}</b><small>{item.href}</small></span><HarinIcon name="chevron" size={16}/></button><footer><button type="button" onClick={()=>changeView(item,'TOGGLE_PIN',{isPinned:!item.is_pinned})}>{item.is_pinned?'고정 해제':'위에 고정'}</button><button type="button" onClick={()=>changeView(item,'DELETE_VIEW')}>삭제</button></footer></article>)}{!data.savedViews.length?<p>자주 보는 필터 화면을 저장하면 이곳에 표시됩니다.</p>:null}</div></section>:null}
    </div></section></div>:null}
  </>;
}
