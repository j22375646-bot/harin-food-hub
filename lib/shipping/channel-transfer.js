'use strict';

const operationQueue = require('../coupang/operation-queue.js');

const text = value => value == null ? '' : String(value).trim();
const CAFE24_OPERATION = 'CAFE24_UPLOAD_INVOICE';
const DIRECT_TRANSFER_TIMEOUT_MS = 2 * 60 * 1000;

function postalTracking(value) {
  const tracking = text(value);
  if (tracking === 'TESTREGINOAPI') {
    throw Object.assign(new Error('우체국 테스트 번호는 쇼핑몰에 전송할 수 없습니다.'), { status:400, code:'EPOST_TEST_TRACKING_BLOCKED' });
  }
  if (!/^\d{13}$/.test(tracking)) {
    throw Object.assign(new Error('실제 우체국 송장번호 숫자 13자리를 입력하세요.'), { status:400, code:'EPOST_TRACKING_REQUIRED' });
  }
  return tracking;
}

function courierCode(platform, value) {
  const normalized = text(value).toUpperCase();
  if (normalized && !/^[A-Z0-9_-]{2,20}$/.test(normalized)) {
    throw Object.assign(new Error('배송업체 코드를 확인하세요.'), { status:400 });
  }
  if (platform === 'COUPANG') return normalized || 'EPOST';
  if (platform === 'CAFE24') return normalized || text(process.env.CAFE24_EPOST_SHIPPING_COMPANY_CODE) || '00004';
  throw Object.assign(new Error('송장 전송을 지원하지 않는 채널입니다.'), { status:409 });
}

function transferKey({ platform, hubOrderId, invoiceNumber }) {
  return `shipping:${platform}:UPLOAD_INVOICE:${hubOrderId}:${invoiceNumber}`;
}

function successfulTransferKey(platform, { hubOrderId, shipmentId } = {}) {
  return platform === 'COUPANG' ? `COUPANG:${text(shipmentId)}` : `CAFE24:${text(hubOrderId)}`;
}

function successfulTransferIndex(rows = []) {
  const latest = new Map();
  for (const row of rows) {
    const platform = row.operation_type === CAFE24_OPERATION ? 'CAFE24' : row.operation_type === 'UPLOAD_INVOICE' ? 'COUPANG' : '';
    if (!platform || row.status !== 'SUCCESS') continue;
    let payload = {};
    try { payload = operationQueue.open(row.payload); } catch { continue; }
    const key = platform === 'COUPANG' ? `COUPANG:${text(row.target_id)}` : `CAFE24:${text(row.target_id)}`;
    if (!latest.has(key)) latest.set(key, { platform, invoiceNumber:text(payload.invoiceNumber), requestId:row.id });
  }
  return latest;
}

async function findDirectTransfer(db, idempotencyKey) {
  return db.from('coupang_operation_requests')
    .select('id,operation_type,target_type,target_id,status,attempt_count,created_at,started_at,executed_at,error_message')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
}

async function beginCafe24Transfer(db, input) {
  const idempotencyKey = transferKey({ platform:'CAFE24', ...input });
  const prior = await findDirectTransfer(db, idempotencyKey);
  if (prior.error) throw prior.error;
  if (prior.data?.status === 'SUCCESS') return { completed:true, reused:true, request:prior.data };
  const priorStartedAt=Date.parse(prior.data?.started_at||prior.data?.created_at||0);
  const staleExecuting=prior.data?.status==='EXECUTING'&&(!Number.isFinite(priorStartedAt)||Date.now()-priorStartedAt>DIRECT_TRANSFER_TIMEOUT_MS);
  if (prior.data?.status === 'EXECUTING'&&!staleExecuting) return { pending:true, reused:true, request:prior.data };

  const envelope = operationQueue.seal({
    hubOrderId:input.hubOrderId,
    externalOrderId:input.externalOrderId,
    invoiceNumber:input.invoiceNumber,
    deliveryCompanyCode:input.deliveryCompanyCode
  });
  const values = {
    operation_type:CAFE24_OPERATION, target_type:'HUB_ORDER', target_id:input.hubOrderId,
    status:'EXECUTING', payload:envelope, result_json:operationQueue.seal({}), error_message:null,
    confirmed_at:new Date().toISOString(), started_at:new Date().toISOString(), executed_at:null,
    collector:'VERCEL_CAFE24', expires_at:new Date(Date.now()+DIRECT_TRANSFER_TIMEOUT_MS).toISOString(), next_attempt_at:null, idempotency_key:idempotencyKey
  };
  if (prior.data && (['FAILED','CANCELLED'].includes(prior.data.status)||staleExecuting)) {
    const retried = await db.from('coupang_operation_requests').update({...values,attempt_count:Number(prior.data.attempt_count||0)+1})
      .eq('id', prior.data.id).in('status', ['FAILED','CANCELLED','EXECUTING'])
      .select('id,operation_type,target_type,target_id,status,attempt_count,created_at').maybeSingle();
    if (retried.error) throw retried.error;
    if (retried.data) return { retried:true, request:retried.data };
  }
  const inserted = await db.from('coupang_operation_requests').insert({ ...values, attempt_count:1 })
    .select('id,operation_type,target_type,target_id,status,attempt_count,created_at').single();
  if (inserted.error) {
    if (inserted.error.code === '23505') {
      const winner = await findDirectTransfer(db, idempotencyKey);
      if (!winner.error && winner.data) return { reused:true, pending:winner.data.status === 'EXECUTING', completed:winner.data.status === 'SUCCESS', request:winner.data };
    }
    throw inserted.error;
  }
  return { request:inserted.data };
}

async function finishCafe24Transfer(db, requestId, status, result = {}, errorMessage = null) {
  const saved = await db.from('coupang_operation_requests').update({
    status,
    result_json:operationQueue.seal(result),
    error_message:errorMessage,
    executed_at:new Date().toISOString()
  }).eq('id', requestId).eq('status', 'EXECUTING').select('id').maybeSingle();
  if (saved.error) throw saved.error;
  if (!saved.data) throw new Error('Cafe24 송장 전송 기록이 다른 작업으로 변경되어 결과를 저장하지 못했습니다.');
}

function publicStatus(row) {
  if (!row) return null;
  const status = ['PENDING','RUNNING'].includes(row.status) ? 'QUEUED' : row.status === 'EXECUTING' ? 'RUNNING' : row.status;
  return {
    requestId:row.id,
    status,
    error:row.status === 'FAILED' ? text(row.error_message) || '쇼핑몰 전송에 실패했습니다.' : '',
    attemptedAt:row.executed_at || row.created_at || null
  };
}

module.exports = {
  CAFE24_OPERATION,
  DIRECT_TRANSFER_TIMEOUT_MS,
  postalTracking,
  courierCode,
  transferKey,
  successfulTransferKey,
  successfulTransferIndex,
  findDirectTransfer,
  beginCafe24Transfer,
  finishCafe24Transfer,
  publicStatus
};
