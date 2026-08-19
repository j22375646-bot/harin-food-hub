'use strict';

const ALERT_PAGE_SIZES=Object.freeze([8,16,24]);
const PROVIDER_PAGE_SIZES=Object.freeze([10,20,30]);
const READY_STATUSES=new Set(['READY','PARTIAL']);
const ATTENTION_STATUSES=new Set(['FAILED','STALE','NO_DATA']);
const SETUP_STATUSES=new Set(['SETUP_REQUIRED','VERIFY_REQUIRED','READ_PROBE_REQUIRED','ELIGIBILITY_REQUIRED']);
const LOCKED_STATUSES=new Set(['LOCKED','NOT_NEEDED']);

function paginateDensityRows(rows=[],page=1,pageSize,allowedSizes=ALERT_PAGE_SIZES){
  const sizes=Array.isArray(allowedSizes)&&allowedSizes.length?allowedSizes:ALERT_PAGE_SIZES;
  const size=sizes.includes(Number(pageSize))?Number(pageSize):sizes[0];
  const totalPages=Math.max(1,Math.ceil(rows.length/size));
  const current=Math.min(totalPages,Math.max(1,Number(page)||1));
  return {items:rows.slice((current-1)*size,current*size),page:current,pageSize:size,total:rows.length,totalPages};
}

function matchesProviderStatus(status,filter='ALL'){
  const value=String(status||'VERIFY_REQUIRED').toUpperCase();
  if(filter==='READY')return READY_STATUSES.has(value);
  if(filter==='ATTENTION')return ATTENTION_STATUSES.has(value);
  if(filter==='SETUP')return SETUP_STATUSES.has(value);
  if(filter==='LOCKED')return LOCKED_STATUSES.has(value);
  return true;
}

function filterProviderServices(services=[],{query='',group='ALL',status='ALL'}={}){
  const needle=String(query||'').trim().toLowerCase();
  return services.filter(service=>{
    if(group!=='ALL'&&service.group!==group)return false;
    if(!matchesProviderStatus(service.status,status))return false;
    if(!needle)return true;
    return [service.label,service.subtitle,service.provider,service.group].some(value=>String(value||'').toLowerCase().includes(needle));
  });
}

module.exports={ALERT_PAGE_SIZES,PROVIDER_PAGE_SIZES,paginateDensityRows,matchesProviderStatus,filterProviderServices};
