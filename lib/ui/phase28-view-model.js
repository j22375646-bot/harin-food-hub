'use strict';

const PHASE28_METRIC_KINDS=Object.freeze(['actual','calculated','relative','sample','estimate']);
const PHASE28_DATA_STATUSES=Object.freeze(['READY','PARTIAL','BLOCKED','SETUP_REQUIRED','ERROR']);

function normalizeReasons(value){
  return [...new Set((Array.isArray(value)?value:[]).map(item=>String(item||'').trim()).filter(Boolean))];
}

function normalizePhase28Metric(input={}){
  const metricKind=String(input.metricKind||'');
  const requestedStatus=String(input.status||'');
  if(!PHASE28_METRIC_KINDS.includes(metricKind))throw new TypeError(`Unsupported Phase 28 metricKind: ${metricKind||'(empty)'}`);
  if(!PHASE28_DATA_STATUSES.includes(requestedStatus))throw new TypeError(`Unsupported Phase 28 status: ${requestedStatus||'(empty)'}`);
  if(!String(input.source||'').trim())throw new TypeError('Phase 28 metric source is required');
  const reasons=normalizeReasons(input.reasons);
  const missing=requestedStatus==='READY'&&(input.value===null||input.value===undefined||input.value==='');
  const status=missing?'BLOCKED':requestedStatus;
  if(missing&&!reasons.includes('VALUE_MISSING'))reasons.push('VALUE_MISSING');
  const numericAllowed=typeof input.value==='number'&&Number.isFinite(input.value);
  const exposesValue=['READY','PARTIAL'].includes(status)&&numericAllowed;
  const sampleSize=input.sampleSize===null||input.sampleSize===undefined||input.sampleSize===''?null:Number(input.sampleSize);
  return Object.freeze({
    value:exposesValue?input.value:null,
    unit:String(input.unit||''),
    source:String(input.source).trim(),
    metricKind,
    status,
    period:String(input.period||''),
    asOf:input.asOf?String(input.asOf):null,
    sampleSize:Number.isFinite(sampleSize)?sampleSize:null,
    formulaVersion:input.formulaVersion?String(input.formulaVersion):null,
    reasons:Object.freeze(reasons)
  });
}

module.exports={PHASE28_METRIC_KINDS,PHASE28_DATA_STATUSES,normalizePhase28Metric};
