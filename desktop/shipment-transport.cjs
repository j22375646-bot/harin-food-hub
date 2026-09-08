'use strict';
const {HARIN_ORIGIN}=require('./connection-policy.cjs');
const ENDPOINT=`${HARIN_ORIGIN}/api/epost/issue`;
const ORDER=/^HR-(?:C24|CP)-[A-F0-9]{8}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BYTES=65536;

// Main-only adapter. Host supplies its authenticated session.fetch binding and
// freshly verified order, never a renderer URL/session/business choice.
// This is NOT authorization and is not yet enabled by the app network policy.
function createShipmentTransport({fetch,hubOrderId}={}) {
  if(typeof fetch!=='function'||typeof hubOrderId!=='string'||!ORDER.test(hubOrderId))throw new TypeError('Invalid shipment transport');
  async function request(url,method,body,options) {
    const parent=options?.signal;
    if(!parent||typeof parent.addEventListener!=='function'||typeof parent.removeEventListener!=='function'||parent.aborted)throw Error('Shipment transport unavailable');
    const controller=new AbortController();
    let reader,response,timer,rejectAbort;
    const aborted=new Promise((_,reject)=>{rejectAbort=reject;});
    const stop=()=>{
      controller.abort();
      rejectAbort(Error('Shipment transport unavailable'));
      void (reader ? reader.cancel() : response?.body?.cancel())?.catch(()=>{});
    };
    parent.addEventListener('abort',stop,{once:true});
    timer=setTimeout(stop,15000);
    const work=async()=>{
      if(parent.aborted||controller.signal.aborted)throw Error();
      response=await fetch(url,{method,credentials:'include',cache:'no-store',redirect:'error',signal:controller.signal,
        headers:{Accept:'application/json',...(method==='POST'?{'Content-Type':'application/json'}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
      if(controller.signal.aborted){void response.body?.cancel().catch(()=>{});throw Error();}
      if(![200,202,409].includes(response.status)){
        void response.body?.cancel().catch(()=>{});
        return {status:response.status,body:null};
      }
      if(response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw Error();
      const length=response.headers.get('content-length');
      if(length!==null&&(!/^\d+$/.test(length)||Number(length)>MAX_BYTES))throw Error();
      if(!response.body?.getReader)throw Error();
      reader=response.body.getReader();
      const chunks=[];let size=0;
      while(true){
        const {done,value}=await reader.read();
        if(controller.signal.aborted)throw Error();
        if(done)break;
        size+=value.byteLength;if(size>MAX_BYTES)throw Error();
        chunks.push(value);
      }
      const bytes=new Uint8Array(size);let offset=0;
      for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
      return {status:response.status,body:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))};
    };
    try {return await Promise.race([work(),aborted]);}
    catch {stop();throw Error('Shipment transport unavailable');}
    finally {clearTimeout(timer);parent.removeEventListener('abort',stop);}
  }
  async function submit(body,options) {
    if(body?.confirm!==true||!Array.isArray(body.orderIds)||body.orderIds.length!==1||body.orderIds[0]!==hubOrderId)throw new TypeError('Invalid shipment submission');
    return request(ENDPOINT,'POST',{confirm:true,orderIds:[hubOrderId]},options);
  }
  async function poll(requestId,options) {
    if(typeof requestId!=='string'||!UUID.test(requestId))throw new TypeError('Invalid shipment request id');
    return request(`${ENDPOINT}?requestId=${requestId}`,'GET',undefined,options);
  }
  return Object.freeze({submit,poll});
}
module.exports=Object.freeze({createShipmentTransport});
