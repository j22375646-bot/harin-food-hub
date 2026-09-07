'use strict';

const serviceAccount=require('./service-account.js');

const MEASUREMENT_VERSION='ga4-ecommerce-v1';
const SCOPE='https://www.googleapis.com/auth/analytics.readonly';
const ENDPOINT='https://analyticsdata.googleapis.com/v1beta';
const PAGE_SIZE=1000;
const ROW_CAP=10000;
const EVENT_NAMES=Object.freeze([
  'view_item','add_to_cart','begin_checkout','add_payment_info','purchase','refund'
]);
const TRANSACTION_EVENT_NAMES=Object.freeze(['purchase','refund']);
const STAGES=Object.freeze([
  ['view_item','상품 상세 조회'],
  ['add_to_cart','장바구니 담기'],
  ['begin_checkout','결제 시작'],
  ['add_payment_info','결제 정보 입력'],
  ['purchase','구매'],
  ['refund','환불']
]);
const NOTES=Object.freeze([
  '이 값은 단계별 이벤트 관측치이며 순서가 있는 고유 사용자 퍼널이나 실제 전환율이 아닙니다.',
  'GA4 기록 구매액과 환불액은 은행 매출이나 허브 주문 매출이 아니며 서로 차감해 총매출로 사용하지 않습니다.',
  'GA4 API 보고 지연과 동의 설정·필터 때문에 실제 발생 시점과 수치가 다를 수 있습니다.',
  'API 응답만으로 테스트 주문의 구매·환불 태깅이 처음부터 끝까지 검증되지는 않습니다.',
  '같은 거래 ID의 반복 환불은 부분 환불일 수 있으므로 검토 대상으로만 표시합니다.',
  '선택 기간의 거래 자료 부재는 과거 구매 자료가 유실됐다는 뜻이 아닙니다.'
]);

function safeError(code,message,status){
  const error=new Error(message);
  error.code=code;
  if(Number.isInteger(status)) error.status=status;
  return error;
}

function invalidResponse(){
  throw safeError('GA4_RESPONSE_INVALID','GA4 응답 형식을 확인할 수 없습니다.');
}

function asObject(value){
  return value!==null&&typeof value==='object'&&!Array.isArray(value)?value:null;
}

function headerIndexes(headers,required){
  if(!Array.isArray(headers)) invalidResponse();
  const names=headers.map(header=>asObject(header)&&typeof header.name==='string'?header.name:null);
  if(names.some(name=>name===null)||new Set(names).size!==names.length) invalidResponse();
  const indexes={};
  for(const name of required){
    const index=names.indexOf(name);
    if(index<0) invalidResponse();
    indexes[name]=index;
  }
  return indexes;
}

function rowCountValue(payload){
  const value=payload.rowCount===undefined?0:payload.rowCount;
  if(!Number.isSafeInteger(value)||value<0) invalidResponse();
  return value;
}

function responseRows(payload,{paged=false}={}){
  if(!asObject(payload)) invalidResponse();
  const rows=payload.rows===undefined?[]:payload.rows;
  if(!Array.isArray(rows)) invalidResponse();
  const rowCount=rowCountValue(payload);
  if((!paged&&!payload.truncated&&rowCount!==rows.length)||rows.length>rowCount) invalidResponse();
  return rows;
}

function dimensionValue(row,index){
  const values=asObject(row)&&Array.isArray(row.dimensionValues)?row.dimensionValues:null;
  const value=values&&asObject(values[index])?values[index].value:null;
  if(typeof value!=='string') invalidResponse();
  return value;
}

function metricText(row,index){
  const values=asObject(row)&&Array.isArray(row.metricValues)?row.metricValues:null;
  const value=values&&asObject(values[index])?values[index].value:null;
  if(typeof value!=='string'||value.trim()==='') invalidResponse();
  return value;
}

function countValue(row,index){
  const value=metricText(row,index);
  if(!/^\d+$/.test(value)) invalidResponse();
  const number=Number(value);
  if(!Number.isSafeInteger(number)||number<0) invalidResponse();
  return number;
}

function moneyValue(row,index){
  const value=metricText(row,index);
  const number=Number(value);
  if(!Number.isFinite(number)||number<0) invalidResponse();
  return number;
}

function metadataReasons(metadata,prefix){
  const value=asObject(metadata)||{};
  const reasons=[];
  if(value.subjectToThresholding===true) reasons.push(`${prefix}_THRESHOLDING`);
  if(value.dataLossFromOtherRow===true) reasons.push(`${prefix}_DATA_LOSS`);
  if(Array.isArray(value.samplingMetadatas)&&value.samplingMetadatas.length>0) reasons.push(`${prefix}_SAMPLING`);
  return reasons;
}

function restrictedMetrics(metadata){
  const restrictions=asObject(metadata)?.schemaRestrictionResponse?.activeMetricRestrictions;
  if(!Array.isArray(restrictions)) return new Set();
  return new Set(restrictions.map(item=>asObject(item)?.metricName).filter(name=>typeof name==='string'));
}

function parseEvents(events){
  const rows=responseRows(events);
  const dimension=headerIndexes(events.dimensionHeaders,['eventName']);
  const metric=headerIndexes(events.metricHeaders,['eventCount','totalUsers','grossPurchaseRevenue','refundAmount']);
  const byEvent=new Map();
  for(const row of rows){
    const eventName=dimensionValue(row,dimension.eventName);
    const values={
      eventCount:countValue(row,metric.eventCount),
      users:countValue(row,metric.totalUsers),
      grossPurchaseRevenue:moneyValue(row,metric.grossPurchaseRevenue),
      refundAmount:moneyValue(row,metric.refundAmount)
    };
    if(!EVENT_NAMES.includes(eventName)) continue;
    if(byEvent.has(eventName)) invalidResponse();
    byEvent.set(eventName,values);
  }
  return byEvent;
}

function parseTransactions(transactions){
  const rows=responseRows(transactions);
  const dimension=headerIndexes(transactions.dimensionHeaders,['eventName','transactionId']);
  const metric=headerIndexes(transactions.metricHeaders,['eventCount']);
  const totals={purchase:0,refund:0};
  const missing={purchase:0,refund:0};
  const idCounts={purchase:new Map(),refund:new Map()};
  for(const row of rows){
    const eventName=dimensionValue(row,dimension.eventName);
    const transactionId=dimensionValue(row,dimension.transactionId);
    const eventCount=countValue(row,metric.eventCount);
    if(!TRANSACTION_EVENT_NAMES.includes(eventName)) continue;
    totals[eventName]+=eventCount;
    if(!Number.isSafeInteger(totals[eventName])) invalidResponse();
    if(transactionId.trim()===''||transactionId.trim().toLowerCase()==='(not set)'){
      missing[eventName]+=eventCount;
      if(!Number.isSafeInteger(missing[eventName])) invalidResponse();
      continue;
    }
    const counts=idCounts[eventName];
    const next=(counts.get(transactionId)||0)+eventCount;
    if(!Number.isSafeInteger(next)) invalidResponse();
    counts.set(transactionId,next);
  }
  return {totals,missing,idCounts};
}

function timezone(metadata){
  const value=asObject(metadata)?.timeZone;
  return typeof value==='string'&&value.trim()?value:null;
}

function currency(metadata){
  const value=asObject(metadata)?.currencyCode;
  return typeof value==='string'&&value.trim()?value:null;
}

function unknownDiagnostics(){
  return {missingPurchaseIdEvents:null,missingRefundIdEvents:null,duplicatePurchaseIds:null,repeatedRefundIds:null};
}

function summarizeEcommerce({events,transactions,now=new Date(),host}){
  const timestamp=new Date(now);
  if(Number.isNaN(timestamp.getTime())||typeof host!=='string'||!host.trim()){
    throw safeError('GA4_INPUT_INVALID','GA4 요약 입력을 확인할 수 없습니다.');
  }
  const byEvent=parseEvents(events);
  const eventsMetadata=asObject(events.metadata)||{};
  const eventsTimeZone=timezone(eventsMetadata);
  const eventsCurrency=currency(eventsMetadata);
  const reasons=metadataReasons(eventsMetadata,'EVENTS');
  if(!eventsTimeZone) reasons.push('EVENTS_TIME_ZONE_MISSING');

  const restrictions=restrictedMetrics(eventsMetadata);
  const grossRestricted=restrictions.has('grossPurchaseRevenue');
  const refundRestricted=restrictions.has('refundAmount');
  if(grossRestricted||refundRestricted) reasons.push('EVENTS_REVENUE_METRICS_RESTRICTED');

  let transactionData=null;
  let transactionReasons=[];
  if(!transactions){
    transactionReasons.push('TRANSACTIONS_MISSING');
  }else{
    transactionData=parseTransactions(transactions);
    const transactionMetadata=asObject(transactions.metadata)||{};
    transactionReasons=metadataReasons(transactionMetadata,'TRANSACTIONS');
    const transactionTimeZone=timezone(transactionMetadata);
    const transactionCurrency=currency(transactionMetadata);
    if(!transactionTimeZone) transactionReasons.push('TRANSACTIONS_TIME_ZONE_MISSING');
    else if(eventsTimeZone&&transactionTimeZone!==eventsTimeZone) transactionReasons.push('TRANSACTIONS_TIME_ZONE_MISMATCH');
    if(eventsCurrency&&transactionCurrency&&transactionCurrency!==eventsCurrency) transactionReasons.push('TRANSACTIONS_CURRENCY_MISMATCH');
    if(transactions.truncated===true) transactionReasons.push('TRANSACTIONS_TRUNCATED');
  }

  if(transactionData){
    for(const eventName of TRANSACTION_EVENT_NAMES){
      const observed=byEvent.get(eventName);
      if((observed&&observed.eventCount!==transactionData.totals[eventName])||(!observed&&transactionData.totals[eventName]>0)){
        transactionReasons.push('TRANSACTIONS_AGGREGATE_MISMATCH');
        break;
      }
    }
  }

  const eventCoverage=reasons.length?'PARTIAL':'COMPLETE';
  const transactionCoverage=transactionReasons.length?'PARTIAL':'COMPLETE';
  reasons.push(...transactionReasons);
  const stages=STAGES.map(([eventName,label])=>{
    const observed=byEvent.get(eventName);
    return {
      eventName,label,eventCount:observed?.eventCount??null,users:observed?.users??null,observed:Boolean(observed)
    };
  });
  const completeTransactions=transactionCoverage==='COMPLETE'&&transactionData;
  const diagnostics=completeTransactions?{
    missingPurchaseIdEvents:transactionData.missing.purchase,
    missingRefundIdEvents:transactionData.missing.refund,
    duplicatePurchaseIds:[...transactionData.idCounts.purchase.values()].filter(count=>count>1).length,
    repeatedRefundIds:[...transactionData.idCounts.refund.values()].filter(count=>count>1).length
  }:unknownDiagnostics();
  const purchase=byEvent.get('purchase');
  const refund=byEvent.get('refund');
  const partial=eventCoverage==='PARTIAL'||transactionCoverage==='PARTIAL';
  return {
    version:MEASUREMENT_VERSION,source:'GA4_DATA_API',host:host.trim(),fetchedAt:timestamp.toISOString(),
    window:{startDate:'7daysAgo',endDate:'yesterday',timeZone:eventsTimeZone},
    currencyCode:eventsCurrency,
    coverage:{events:eventCoverage,transactions:transactionCoverage,reasons:[...new Set(reasons)]},
    status:partial?'PARTIAL':(stages.some(stage=>stage.observed)?'OBSERVED':'NO_DATA'),
    stages,
    money:{
      grossPurchaseRevenue:purchase&&!grossRestricted?purchase.grossPurchaseRevenue:null,
      refundAmount:refund&&!refundRestricted?refund.refundAmount:null
    },
    diagnostics,trackingVerification:'VERIFY_REQUIRED',notes:[...NOTES]
  };
}

function validatedConfig(config,now){
  if(!asObject(config)||typeof config.propertyId!=='string'||!/^\d+$/.test(config.propertyId)||
    typeof config.clientEmail!=='string'||!config.clientEmail.trim()||
    typeof config.privateKey!=='string'||!config.privateKey.trim()){
    throw safeError('GA4_CONFIG_INVALID','GA4 읽기 설정을 확인해 주세요.');
  }
  let site;
  try{ site=new URL(config.siteUrl); }
  catch{ throw safeError('GA4_CONFIG_INVALID','GA4 읽기 설정을 확인해 주세요.'); }
  if(site.protocol!=='https:'||!site.hostname||site.username||site.password||Number.isNaN(new Date(now).getTime())){
    throw safeError('GA4_CONFIG_INVALID','GA4 읽기 설정을 확인해 주세요.');
  }
  return {host:site.hostname.toLowerCase(),propertyId:config.propertyId};
}

function requestFilter(host,eventNames){
  return {andGroup:{expressions:[
    {filter:{fieldName:'hostName',stringFilter:{matchType:'EXACT',value:host,caseSensitive:false}}},
    {filter:{fieldName:'eventName',inListFilter:{values:eventNames,caseSensitive:true}}}
  ]}};
}

function requestBody(host,{transactions=false,offset=0}={}){
  const base={
    dateRanges:[{startDate:'7daysAgo',endDate:'yesterday'}],
    dimensionFilter:requestFilter(host,transactions?TRANSACTION_EVENT_NAMES:EVENT_NAMES),
    keepEmptyRows:true,returnPropertyQuota:true
  };
  if(transactions){
    return {...base,
      dimensions:[{name:'eventName'},{name:'transactionId'}],metrics:[{name:'eventCount'}],
      orderBys:[{dimension:{dimensionName:'eventName'}},{dimension:{dimensionName:'transactionId'}}],
      limit:String(PAGE_SIZE),offset:String(offset)
    };
  }
  return {...base,
    dimensions:[{name:'eventName'}],
    metrics:[{name:'eventCount'},{name:'totalUsers'},{name:'grossPurchaseRevenue'},{name:'refundAmount'}],
    limit:'100'
  };
}

function mappedFetchError(error){
  if(error?.code&&String(error.code).startsWith('GA4_')) return error;
  if(error?.name==='AbortError'||error?.name==='TimeoutError') return safeError('GA4_TIMEOUT','GA4 읽기 시간이 초과됐습니다.');
  return safeError('GA4_NETWORK_FAILED','GA4 자료에 연결하지 못했습니다.');
}

function statusError(status){
  if(status===401||status===403) return safeError('GA4_AUTH_FAILED','GA4 읽기 권한을 확인해 주세요.',status);
  if(status===429) return safeError('GA4_RATE_LIMITED','GA4 읽기 요청이 일시적으로 제한됐습니다.',status);
  return safeError('GA4_PROVIDER_FAILED','GA4 제공자 응답을 확인할 수 없습니다.',status);
}

async function readJson(url,options,fetchImpl){
  let response;
  try{ response=await fetchImpl(url,options); }
  catch(error){ throw mappedFetchError(error); }
  if(!asObject(response)||typeof response.ok!=='boolean') invalidResponse();
  if(!response.ok) throw statusError(Number.isInteger(response.status)?response.status:502);
  try{
    const payload=await response.json();
    if(!asObject(payload)) invalidResponse();
    return payload;
  }catch(error){
    if(error?.code==='GA4_RESPONSE_INVALID') throw error;
    if(error?.name==='AbortError'||error?.name==='TimeoutError') throw mappedFetchError(error);
    invalidResponse();
  }
}

function validateTransactionPage(page){
  const rows=responseRows(page,{paged:true});
  if(rows.length>PAGE_SIZE) invalidResponse();
  const dimension=headerIndexes(page.dimensionHeaders,['eventName','transactionId']);
  const metric=headerIndexes(page.metricHeaders,['eventCount']);
  return rows.map(row=>({
    dimensionValues:[
      {value:dimensionValue(row,dimension.eventName)},
      {value:dimensionValue(row,dimension.transactionId)}
    ],
    metricValues:[{value:String(countValue(row,metric.eventCount))}]
  }));
}

function mergeMetadata(target,source){
  const next=asObject(source)||{};
  if(next.subjectToThresholding===true) target.subjectToThresholding=true;
  if(next.dataLossFromOtherRow===true) target.dataLossFromOtherRow=true;
  if(Array.isArray(next.samplingMetadatas)&&next.samplingMetadatas.length) target.samplingMetadatas=[{}];
  if(target.timeZone===undefined&&typeof next.timeZone==='string') target.timeZone=next.timeZone;
  if(target.currencyCode===undefined&&typeof next.currencyCode==='string') target.currencyCode=next.currencyCode;
  if(asObject(next.schemaRestrictionResponse)) target.schemaRestrictionResponse=next.schemaRestrictionResponse;
}

async function collectEcommerce({config,fetchImpl=fetch,now=new Date()}){
  const safeConfig=validatedConfig(config,now);
  const signal=AbortSignal.timeout(30000);
  let timedOut=false;
  const guardedFetch=async(url,options={})=>{
    let response;
    try{ response=await fetchImpl(url,{...options,signal,redirect:'error',cache:'no-store'}); }
    catch(error){
      if(error?.name==='AbortError'||error?.name==='TimeoutError') timedOut=true;
      throw error;
    }
    if(!asObject(response)||typeof response.json!=='function') return response;
    return {
      ok:response.ok,status:response.status,
      json:async()=>{
        try{ return await response.json(); }
        catch(error){
          if(error?.name==='AbortError'||error?.name==='TimeoutError') timedOut=true;
          throw error;
        }
      }
    };
  };
  let token;
  try{
    token=await serviceAccount.accessToken({...config,scope:SCOPE,fetchImpl:guardedFetch,now:new Date(now).getTime()});
  }catch(error){
    if(timedOut||error?.name==='AbortError'||error?.name==='TimeoutError') throw safeError('GA4_TIMEOUT','GA4 읽기 시간이 초과됐습니다.');
    if(error?.status===401||error?.status===403) throw statusError(error.status);
    if(error?.status===429) throw statusError(429);
    if(error?.status>=500) throw statusError(error.status);
    throw safeError('GA4_TOKEN_FAILED','GA4 읽기 토큰을 발급받지 못했습니다.');
  }
  if(typeof token!=='string'||!token) throw safeError('GA4_TOKEN_FAILED','GA4 읽기 토큰을 발급받지 못했습니다.');
  const endpoint=`${ENDPOINT}/properties/${encodeURIComponent(safeConfig.propertyId)}:runReport`;
  const options=body=>({
    method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify(body),signal,redirect:'error',cache:'no-store'
  });
  const events=await readJson(endpoint,options(requestBody(safeConfig.host)),guardedFetch);
  parseEvents(events);

  const rows=[];
  const metadata={};
  let expectedRowCount=null;
  let truncated=false;
  let emptyPages=0;
  while(rows.length<ROW_CAP){
    const page=await readJson(endpoint,options(requestBody(safeConfig.host,{transactions:true,offset:rows.length})),guardedFetch);
    const pageRows=validateTransactionPage(page);
    const pageRowCount=rowCountValue(page);
    if(expectedRowCount===null) expectedRowCount=pageRowCount;
    else if(pageRowCount!==expectedRowCount){ truncated=true;break; }
    const priorTimeZone=metadata.timeZone;
    const priorCurrency=metadata.currencyCode;
    mergeMetadata(metadata,page.metadata);
    if((priorTimeZone&&timezone(page.metadata)&&priorTimeZone!==timezone(page.metadata))||
      (priorCurrency&&currency(page.metadata)&&priorCurrency!==currency(page.metadata))) truncated=true;
    if(pageRows.length===0){
      if(expectedRowCount===0||rows.length>=expectedRowCount) break;
      emptyPages+=1;
      if(emptyPages>=2){ truncated=true;break; }
      continue;
    }
    emptyPages=0;
    const room=ROW_CAP-rows.length;
    rows.push(...pageRows.slice(0,room));
    if(pageRows.length>room) truncated=true;
    if(rows.length>=expectedRowCount) break;
    if(rows.length>=ROW_CAP){ truncated=true;break; }
  }
  if(expectedRowCount===null) expectedRowCount=0;
  if(rows.length<expectedRowCount||expectedRowCount>ROW_CAP) truncated=true;
  const transactions={
    dimensionHeaders:[{name:'eventName'},{name:'transactionId'}],metricHeaders:[{name:'eventCount'}],
    rows,rowCount:expectedRowCount,metadata,...(truncated?{truncated:true}:{})
  };
  return summarizeEcommerce({events,transactions,now,host:safeConfig.host});
}

module.exports={ MEASUREMENT_VERSION, collectEcommerce, summarizeEcommerce };
