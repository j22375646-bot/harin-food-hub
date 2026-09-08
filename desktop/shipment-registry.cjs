'use strict';
const path=require('node:path');
const {createShipmentJob}=require('./shipment-job.cjs');
const {createOrderShipmentJournal}=require('./shipment-journal.cjs');
const DISCONNECTED=Object.freeze({status:'DISCONNECTED',hubOrderId:null,requestId:null});

// Main-only. One registry per authenticated session in the single-instance app.
// This is not authorization: the host still must recheck and confirm each order.
// Suspend and await before replacing a registry or clearing its credentials.
function createShipmentRegistry({directory,businessId,createTransport,timeoutMs=15000}={}) {
  if(typeof directory!=='string'||!path.isAbsolute(directory)
    ||typeof businessId!=='string'||!businessId||businessId.length>128
    ||typeof createTransport!=='function'
    ||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000)throw new TypeError('Invalid shipment registry');
  const jobs=new Map(),ready=new Set(),active=new Set();
  let closed=false;
  function get(hubOrderId) {
    if(!jobs.has(hubOrderId)) {
      // Cache the initialization promise, not just its result: concurrent clicks
      // must not create two EMPTY controllers while the disk read is pending.
      const pending=Promise.resolve().then(async()=>{
        const job=await createShipmentJob({businessId,timeoutMs,
          store:createOrderShipmentJournal({directory,businessId,hubOrderId}),
          transport:createTransport(hubOrderId)});
        ready.add(job);
        if(closed)job.suspend();
        return job;
      });
      jobs.set(hubOrderId,pending);
    }
    return jobs.get(hubOrderId);
  }
  async function run(hubOrderId,action) {
    if(typeof hubOrderId!=='string'||!/^HR-(?:C24|CP)-[A-F0-9]{8}$/.test(hubOrderId))throw new TypeError('Invalid shipment order');
    if(closed)return DISCONNECTED;
    const operation=(async()=>{
      const job=await get(hubOrderId);
      return closed ? DISCONNECTED : action(job);
    })();
    active.add(operation);
    try {return await operation;} finally {active.delete(operation);}
  }
  async function suspend() {
    closed=true;
    for(const job of ready)job.suspend();
    await Promise.allSettled([...active]);
    return DISCONNECTED;
  }
  return Object.freeze({
    snapshot:hubOrderId=>run(hubOrderId,job=>job.snapshot()),
    submit:(hubOrderId,input)=>run(hubOrderId,job=>job.submit({hubOrderId,confirm:input?.confirm})),
    poll:hubOrderId=>run(hubOrderId,job=>job.poll()),
    suspend,
  });
}
module.exports=Object.freeze({createShipmentRegistry});
