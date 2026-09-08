'use strict';

// Main-process core only: not an IPC handler or an execution authorization.
// The host must bind an authenticated business, verify the current order,
// show native confirmation, and supply an atomic durable journal before use.
const ORDER = /^HR-(?:C24|CP)-[A-F0-9]{8}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isRequestId = value => typeof value === 'string' && UUID.test(value);
const STATUSES = new Set(['SUBMITTING','PENDING','RUNNING','SUCCEEDED','FAILED','CANCELLED','UNKNOWN']);
const TERMINAL = new Set(['SUCCEEDED','FAILED','CANCELLED','STORAGE_ERROR']);
const empty = () => Object.freeze({status:'EMPTY',hubOrderId:null,requestId:null});

function validRecord(row, businessId) {
  return row && typeof row === 'object' && !Array.isArray(row)
    && Object.keys(row).sort().join(',') === 'businessId,hubOrderId,requestId,status,version'
    && row.version === 1 && row.businessId === businessId && typeof row.hubOrderId === 'string' && ORDER.test(row.hubOrderId)
    && STATUSES.has(row.status) && (row.requestId === null || isRequestId(row.requestId))
    && (!['PENDING','RUNNING','SUCCEEDED','FAILED','CANCELLED'].includes(row.status) || isRequestId(row.requestId));
}

function accepted(response, order) {
  const body = response?.body;
  if (response?.status !== 202 || body?.ok !== true || !Array.isArray(body.results) || body.results.length !== 1) return null;
  const row = body.results[0];
  if (row?.ok !== true || row.hubOrderId !== order || !isRequestId(row.request?.id)
    || !['PENDING','RUNNING','SUCCESS'].includes(row.request?.status)) return null;
  // Reused successful jobs are read back for the authoritative result too.
  return {requestId:row.request.id,status:row.request.status === 'RUNNING' ? 'RUNNING' : 'PENDING'};
}

function polled(response, state) {
  const body=response?.body, row=body?.request;
  if (!row || row.id !== state.requestId || row.hubOrderId !== state.hubOrderId) return 'UNKNOWN';
  if (response.status === 202 && body.ok === true && ['PENDING','RUNNING'].includes(row.status)) return row.status;
  if (response.status === 200 && body.ok === true && row.status === 'SUCCESS'
    && typeof body.result?.trackingNo === 'string' && /^\d{13}$/.test(body.result.trackingNo)) return 'SUCCEEDED';
  if (response.status === 409 && body.ok === false && ['FAILED','CANCELLED'].includes(row.status)) return row.status;
  return 'UNKNOWN';
}

async function createShipmentJob({businessId,store,transport,timeoutMs=15000}={}) {
  if (typeof businessId !== 'string' || !businessId || businessId.length > 128
    || typeof store?.read !== 'function' || typeof store?.write !== 'function'
    || typeof transport?.submit !== 'function' || typeof transport?.poll !== 'function'
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) throw new TypeError('Invalid shipment job dependencies');
  let state=empty(), busy=false;
  try {
    const record=await store.read();
    if (record !== null) {
      if (!validRecord(record,businessId)) throw Error();
      state=Object.freeze({status:record.status === 'SUBMITTING' ? 'UNKNOWN' : record.status,hubOrderId:record.hubOrderId,requestId:record.requestId});
    }
  } catch { state=Object.freeze({...empty(),status:'STORAGE_ERROR'}); }

  async function save(next) {
    state=Object.freeze({...next});
    try {
      await store.write(Object.freeze({version:1,businessId,hubOrderId:state.hubOrderId,requestId:state.requestId,status:state.status}));
      return true;
    } catch {state=Object.freeze({...state,status:'STORAGE_ERROR'});return false;}
  }

  async function bounded(action) {
    const controller=new AbortController();
    let timer;
    try {
      return await Promise.race([
        Promise.resolve().then(()=>action(controller.signal)),
        new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('Unconfirmed shipment result'));},timeoutMs);}),
      ]);
    } finally {clearTimeout(timer);}
  }

  async function submit(input) {
    if (busy || state.status !== 'EMPTY') return state;
    if (input?.confirm !== true || typeof input.hubOrderId !== 'string' || !ORDER.test(input.hubOrderId)) throw new TypeError('Shipment confirmation and supported order are required');
    const hubOrderId=input.hubOrderId;
    busy=true;
    try {
      if (!await save({status:'SUBMITTING',hubOrderId,requestId:null})) return state;
      let outcome;
      try {outcome=accepted(await bounded(signal=>transport.submit({confirm:true,orderIds:[hubOrderId]},{signal})),hubOrderId);}
      catch {outcome=null;}
      await save({hubOrderId,requestId:outcome?.requestId || null,status:outcome?.status || 'UNKNOWN'});
      return state;
    } finally {busy=false;}
  }

  async function poll() {
    if (busy || TERMINAL.has(state.status) || !state.requestId) return state;
    busy=true;
    try {
      let status;
      try {status=polled(await bounded(signal=>transport.poll(state.requestId,{signal})),state);}
      catch {status='UNKNOWN';}
      await save({...state,status});
      return state;
    } finally {busy=false;}
  }

  // No reset/retry API: ambiguous or failed work needs explicit reconciliation.
  return Object.freeze({snapshot:()=>state,submit,poll});
}

module.exports=Object.freeze({createShipmentJob});
