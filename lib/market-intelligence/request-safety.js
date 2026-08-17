'use strict';

class MarketWorkbenchRequestError extends Error{
  constructor(message,{code='WORKBENCH_REQUEST_FAILED',status=0}={}){
    super(message);
    this.name='MarketWorkbenchRequestError';
    this.code=code;
    this.status=status;
  }
}

function safeMessage(value,fallback='자료를 불러오지 못했습니다.'){
  const text=String(value||'').replace(/<[^>]*>/gu,' ').replace(/\s+/gu,' ').trim();
  return (text||fallback).slice(0,240);
}

async function requestJson(url,{fetchImpl=globalThis.fetch,timeoutMs=15000,signal,...options}={}){
  if(typeof fetchImpl!=='function')throw new MarketWorkbenchRequestError('요청 기능을 사용할 수 없습니다.',{code:'FETCH_UNAVAILABLE'});
  const controller=new AbortController();
  let timedOut=false;
  const abort=()=>controller.abort();
  if(signal?.aborted)controller.abort();
  else signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>{timedOut=true;controller.abort();},Math.max(1,Number(timeoutMs)||15000));
  try{
    const response=await fetchImpl(url,{cache:'no-store',...options,signal:controller.signal});
    const text=await response.text();
    let body={};
    try{body=text?JSON.parse(text):{};}catch{throw new MarketWorkbenchRequestError('응답 형식을 확인하지 못했습니다. 잠시 뒤 다시 시도해주세요.',{code:'INVALID_JSON',status:response.status});}
    if(!response.ok||body.ok===false)throw new MarketWorkbenchRequestError(safeMessage(body.error||body.message,`요청을 처리하지 못했습니다. (${response.status})`),{code:'HTTP_ERROR',status:response.status});
    return body;
  }catch(error){
    if(error instanceof MarketWorkbenchRequestError)throw error;
    if(controller.signal.aborted)throw new MarketWorkbenchRequestError(timedOut?'자료 확인 시간이 길어 중단했습니다. 다시 시도해주세요.':'화면 이동으로 요청을 중단했습니다.',{code:timedOut?'REQUEST_TIMEOUT':'REQUEST_ABORTED'});
    throw new MarketWorkbenchRequestError(safeMessage(error?.message),{code:'NETWORK_ERROR'});
  }finally{
    clearTimeout(timer);
    signal?.removeEventListener('abort',abort);
  }
}

module.exports={MarketWorkbenchRequestError,requestJson,safeMessage};
