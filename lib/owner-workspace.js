'use strict';

const hubRoutes=require('./navigation/hub-routes.js');

const PAGE_KEYS=new Set(hubRoutes.HUB_NAV.map(item=>item.id));
const ALLOWED_PATHS=new Set([
  ...hubRoutes.HUB_NAV.map(item=>item.href),
  ...Object.values(hubRoutes.HUB_WORKSPACES||{}).flat().map(item=>item.href)
]);
const ALLOWED_QUERY_KEYS=new Set(['platform','period','product','focus']);
const ITEM_TYPES=new Set(['TASK','NOTE']);
const PRIORITIES=new Set(['LOW','NORMAL','HIGH']);

class OwnerWorkspaceInputError extends Error {
  constructor(message){super(message);this.name='OwnerWorkspaceInputError';this.status=400;}
}

function cleanText(value,max,label,{required=false}={}){
  const text=String(value||'').replace(/\r\n?/g,'\n').trim();
  if(required&&!text)throw new OwnerWorkspaceInputError(`${label}을 입력해주세요.`);
  if(text.length>max)throw new OwnerWorkspaceInputError(`${label}은 ${max}자 이하여야 합니다.`);
  return text;
}

function safePageKey(value){
  const pageKey=String(value||'main').toLowerCase();
  if(!PAGE_KEYS.has(pageKey))throw new OwnerWorkspaceInputError('저장할 화면을 확인해주세요.');
  return pageKey;
}

function safeHubHref(value){
  let url;
  try{url=new URL(String(value||'/'),'https://hub.local');}catch{throw new OwnerWorkspaceInputError('허브 안의 올바른 화면 주소만 저장할 수 있습니다.');}
  if(url.origin!=='https://hub.local'||!ALLOWED_PATHS.has(url.pathname))throw new OwnerWorkspaceInputError('허브 안의 올바른 화면 주소만 저장할 수 있습니다.');
  [...url.searchParams.keys()].forEach(key=>{if(!ALLOWED_QUERY_KEYS.has(key))url.searchParams.delete(key);});
  const query=url.searchParams.toString();
  return `${url.pathname}${query?`?${query}`:''}`;
}

function itemInput(body,{partial=false}={}){
  const result={};
  if(!partial||body.itemType!==undefined){const value=String(body.itemType||'TASK').toUpperCase();if(!ITEM_TYPES.has(value))throw new OwnerWorkspaceInputError('할 일 또는 메모 중 하나를 선택해주세요.');result.item_type=value;}
  if(!partial||body.title!==undefined)result.title=cleanText(body.title,160,'제목',{required:true});
  if(!partial||body.body!==undefined)result.body=cleanText(body.body,4000,'내용');
  if(!partial||body.priority!==undefined){const value=String(body.priority||'NORMAL').toUpperCase();if(!PRIORITIES.has(value))throw new OwnerWorkspaceInputError('우선순위를 확인해주세요.');result.priority=value;}
  if(!partial||body.pageKey!==undefined)result.page_key=safePageKey(body.pageKey);
  if(!partial||body.contextLabel!==undefined)result.context_label=cleanText(body.contextLabel,120,'화면 이름');
  if(!partial||body.contextHref!==undefined)result.context_href=safeHubHref(body.contextHref);
  if(!partial||body.dueAt!==undefined){
    if(!body.dueAt)result.due_at=null;
    else {const parsed=new Date(body.dueAt);if(Number.isNaN(parsed.getTime()))throw new OwnerWorkspaceInputError('마감 시간을 확인해주세요.');result.due_at=parsed.toISOString();}
  }
  return result;
}

function savedViewInput(body){
  const href=safeHubHref(body.href);
  return {
    name:cleanText(body.name,80,'저장 화면 이름',{required:true}),
    page_key:safePageKey(body.pageKey),
    href,
    query_state:Object.fromEntries(new URL(href,'https://hub.local').searchParams.entries()),
    is_pinned:Boolean(body.isPinned)
  };
}

function validId(value){
  const id=String(value||'');
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))throw new OwnerWorkspaceInputError('저장 항목을 다시 선택해주세요.');
  return id;
}

async function queryWorkspace(db){
  const [itemsResult,viewsResult]=await Promise.all([
    db.from('hub_work_items').select('*').neq('status','ARCHIVED').order('status',{ascending:false}).order('updated_at',{ascending:false}).limit(100),
    db.from('hub_saved_views').select('*').order('is_pinned',{ascending:false}).order('updated_at',{ascending:false}).limit(50)
  ]);
  if(itemsResult.error)throw itemsResult.error;if(viewsResult.error)throw viewsResult.error;
  return {workItems:itemsResult.data||[],savedViews:viewsResult.data||[],generatedAt:new Date().toISOString()};
}

async function mutateWorkspace(db,body){
  const action=String(body.action||'').toUpperCase(),now=new Date().toISOString();
  if(action==='CREATE_ITEM'){
    const result=await db.from('hub_work_items').insert(itemInput(body)).select('*').single();
    if(result.error)throw result.error;return {item:result.data};
  }
  if(action==='UPDATE_ITEM'){
    const updates={...itemInput(body,{partial:true}),updated_at:now};
    if(Object.keys(updates).length===1)throw new OwnerWorkspaceInputError('바꿀 내용을 입력해주세요.');
    const result=await db.from('hub_work_items').update(updates).eq('id',validId(body.id)).neq('status','ARCHIVED').select('*').single();
    if(result.error)throw result.error;return {item:result.data};
  }
  if(['TOGGLE_ITEM','ARCHIVE_ITEM','RESTORE_ITEM'].includes(action)){
    const status=action==='ARCHIVE_ITEM'?'ARCHIVED':action==='RESTORE_ITEM'?'OPEN':String(body.done)==='true'||body.done===true?'DONE':'OPEN';
    const updates={status,completed_at:status==='DONE'?now:null,updated_at:now};
    let query=db.from('hub_work_items').update(updates).eq('id',validId(body.id));
    if(body.contextHref!==undefined)query=query.eq('context_href',safeHubHref(body.contextHref));
    if(action==='ARCHIVE_ITEM')query=query.neq('status','ARCHIVED');
    const result=await query.select('*').maybeSingle();
    if(result.error)throw result.error;
    if(!result.data)throw new OwnerWorkspaceInputError(action==='ARCHIVE_ITEM'?'이미 삭제됐거나 삭제할 항목을 찾지 못했습니다.':'저장 항목을 다시 선택해주세요.');
    return {item:result.data};
  }
  if(action==='SAVE_VIEW'){
    const result=await db.from('hub_saved_views').upsert(savedViewInput(body),{onConflict:'name,href'}).select('*').single();
    if(result.error)throw result.error;return {savedView:result.data};
  }
  if(action==='TOGGLE_PIN'){
    const result=await db.from('hub_saved_views').update({is_pinned:Boolean(body.isPinned),updated_at:now}).eq('id',validId(body.id)).select('*').single();
    if(result.error)throw result.error;return {savedView:result.data};
  }
  if(action==='DELETE_VIEW'){
    const result=await db.from('hub_saved_views').delete().eq('id',validId(body.id)).select('id').single();
    if(result.error)throw result.error;return {deletedViewId:result.data.id};
  }
  throw new OwnerWorkspaceInputError('지원하지 않는 업무 저장 요청입니다.');
}

module.exports={OwnerWorkspaceInputError,itemInput,mutateWorkspace,queryWorkspace,safeHubHref,savedViewInput};
