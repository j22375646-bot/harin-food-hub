'use strict';

const text=value=>String(value==null?'':value).trim();
const time=value=>new Date(value||0).getTime()||0;
const number=value=>value===null||value===undefined||value===''||!Number.isFinite(Number(value))?null:Number(value);
const channelLabel=value=>({NAVER:'네이버',CAFE24:'Cafe24',COUPANG:'쿠팡',ALL:'전체 채널'}[text(value).toUpperCase()]||text(value)||'공통');
const typeLabel=value=>({NAVER_BID:'키워드 입찰가',PRODUCT_COST:'상품 원가',CHANNEL_COST:'채널 비용',SHIPPING_RULE:'배송 손실 규칙',BUSINESS_TARGET:'월 목표·광고예산'}[text(value).toUpperCase()]||text(value)||'변경 항목');
const fieldLabel=value=>({bid_amount:'입찰가',unit_cost:'상품 원가',packaging_cost:'포장비',other_unit_cost:'기타 단위비',commission_rate:'판매수수료율',payment_fee_rate:'결제수수료율',default_shipping_cost:'기본 배송비',return_shipping_cost:'반품 택배비',return_rate:'예상 반품률',remote_area_surcharge:'도서산간 추가비',remote_area_rate:'도서산간 비율',revenue_target:'월 매출목표',ad_budget:'월 광고예산',target_roas:'목표 ROAS',notes:'메모'}[text(value)]||text(value)||'변경값');

const STATUS_LABELS=Object.freeze({PREVIEWED:'변경 확인 대기',APPROVED:'실행 대기',EXECUTING:'실행 중',EXECUTED:'재조회 대기',VERIFIED:'검증 완료',VERIFICATION_FAILED:'검증 불일치',STALE:'원본 변경됨',REJECTED:'취소',FAILED:'실행 실패',ROLLBACK_REQUESTED:'복구 중',ROLLED_BACK:'복구 완료',ROLLBACK_FAILED:'복구 실패',EXPIRED:'만료'});
const EVENT_LABELS=Object.freeze({PREVIEW_CREATED:'변경값 미리보기 생성',APPROVED:'사장님 확인 완료',EXECUTION_STARTED:'실제 반영 시작',EXECUTED:'반영 완료',VERIFIED:'실제 저장값 재조회 일치',VERIFICATION_FAILED:'실제 저장값 재조회 불일치',EXECUTION_BLOCKED_STALE:'원본 변경으로 실행 차단',EXECUTION_FAILED:'실행 실패',ROLLBACK_STARTED:'원래 값 복구 시작',ROLLED_BACK:'원래 값 복구 완료',ROLLBACK_FAILED:'복구 실패',REJECTED:'변경안 취소',OWNER_DIRECT_EXECUTION_COMPLETED:'확인·반영·재조회 완료'});

function kstLabel(value){
  const date=new Date(value||0);
  if(Number.isNaN(date.getTime()))return '시각 확인 필요';
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).filter(item=>item.type!=='literal').map(item=>[item.type,item.value]));
  return `${Number(parts.month)}월 ${Number(parts.day)}일 ${parts.hour}:${parts.minute}`;
}

function valueLabel(field,value){
  if(value===null||value===undefined||value==='')return '확인 필요';
  const key=text(field);
  const numeric=number(value);
  if(['commission_rate','payment_fee_rate','return_rate','remote_area_rate'].includes(key))return numeric==null?'확인 필요':`${(numeric*100).toFixed(2)}%`;
  if(key==='target_roas')return numeric==null?'확인 필요':`${Math.round(numeric)}%`;
  if(['bid_amount','unit_cost','packaging_cost','other_unit_cost','default_shipping_cost','return_shipping_cost','remote_area_surcharge','revenue_target','ad_budget'].includes(key))return numeric==null?'확인 필요':`${Math.round(numeric).toLocaleString('ko-KR')}원`;
  return text(value)||'확인 필요';
}

function itemState(status){
  const value=text(status).toUpperCase();
  if(['PREVIEWED','APPROVED','EXECUTING'].includes(value))return 'WAITING';
  if(value==='EXECUTED')return 'RECHECK';
  if(value==='VERIFIED')return 'VERIFIED';
  if(['ROLLBACK_REQUESTED','ROLLED_BACK'].includes(value))return 'ROLLBACK';
  return 'ATTENTION';
}

function rollbackSupported(row){
  return row?.rollback_value?.exists!==false||['PRODUCT_COST','BUSINESS_TARGET','NAVER_BID'].includes(text(row?.change_type).toUpperCase());
}

function actionsFor(row,{naverWriteEnabled=false}={}){
  const status=text(row?.status).toUpperCase();
  const locked=text(row?.change_type).toUpperCase()==='NAVER_BID'&&!naverWriteEnabled;
  if(status==='PREVIEWED')return locked?['REJECT']:['REJECT','CONFIRM_EXECUTE'];
  if(status==='APPROVED'||status==='FAILED')return locked?[]:['CONFIRM_EXECUTE'];
  if(status==='EXECUTED')return rollbackSupported(row)?['VERIFY','ROLLBACK']:['VERIFY'];
  if(['VERIFIED','VERIFICATION_FAILED'].includes(status)&&rollbackSupported(row))return ['ROLLBACK'];
  return [];
}

function normalizeChange(change={}){
  return Object.freeze({field:text(change.field),label:fieldLabel(change.field),before:change.before??null,after:change.after??null,beforeLabel:valueLabel(change.field,change.before),afterLabel:valueLabel(change.field,change.after)});
}

function normalizeAudit(row={}){
  return Object.freeze({id:text(row.id),eventType:text(row.event_type).toUpperCase(),label:EVENT_LABELS[text(row.event_type).toUpperCase()]||STATUS_LABELS[text(row.to_status).toUpperCase()]||text(row.event_type)||'변경 기록',fromStatus:text(row.from_status).toUpperCase()||null,toStatus:text(row.to_status).toUpperCase()||null,createdAt:row.created_at||null,createdLabel:kstLabel(row.created_at)});
}

function buildPhase28ChangesModel(snapshot={}){
  if(snapshot.error)return Object.freeze({dataStatus:'ERROR',generatedAt:snapshot.generatedAt||null,error:text(snapshot.error),summary:Object.freeze({total:null,waiting:null,recheck:null,verified:null,attention:null,rollback:null}),items:Object.freeze([]),auditsError:null,policy:Object.freeze({ownerConfirmation:true,postWriteVerification:true,rollbackHistory:true,missingAsZero:false})});
  const auditsById=new Map();
  for(const audit of snapshot.audits||[]){const key=text(audit.change_request_id);if(!auditsById.has(key))auditsById.set(key,[]);auditsById.get(key).push(normalizeAudit(audit));}
  for(const list of auditsById.values())list.sort((a,b)=>time(a.createdAt)-time(b.createdAt));
  const items=[...(snapshot.requests||[])].sort((a,b)=>time(b.created_at)-time(a.created_at)).map(row=>{
    const status=text(row.status).toUpperCase()||'UNKNOWN';
    const state=itemState(status);
    const metadata=row?.impact_preview?.metadata||{};
    const targetLabel=text(metadata.keyword)||text(metadata.product_name)||text(row.target_key)||'대상 확인 필요';
    const writeLocked=text(row.change_type).toUpperCase()==='NAVER_BID'&&snapshot.naverWriteEnabled!==true;
    const timeline=auditsById.get(text(row.id))||[];
    const changes=(row?.impact_preview?.changes||[]).slice(0,6).map(normalizeChange);
    return Object.freeze({
      id:text(row.id),changeType:text(row.change_type).toUpperCase(),typeLabel:typeLabel(row.change_type),platform:text(row.platform).toUpperCase()||'ALL',channel:channelLabel(row.platform),
      title:`${text(row.change_type).toUpperCase()==='NAVER_BID'?'네이버 ':''}${typeLabel(row.change_type)}`,targetLabel,status,statusLabel:STATUS_LABELS[status]||status,state,
      idempotencyKey:text(row.idempotency_key),idempotencyLabel:text(row.idempotency_key)?`${text(row.idempotency_key).slice(0,12)}${text(row.idempotency_key).length>12?'…':''}`:'확인 필요',
      createdAt:row.created_at||null,createdLabel:kstLabel(row.created_at),executedAt:row.executed_at||null,verifiedAt:row.verified_at||null,rolledBackAt:row.rolled_back_at||null,
      changes:Object.freeze(changes),timeline:Object.freeze(timeline),auditCount:timeline.length,lastAuditLabel:timeline.at(-1)?.label||'미리보기 생성',
      writeLocked,rollbackSupported:rollbackSupported(row),actions:Object.freeze(actionsFor(row,{naverWriteEnabled:snapshot.naverWriteEnabled===true})),
      error:text(row.error_message)||null,verificationMatched:row?.verification_result?.matched===true||row?.verification_result?.rollback_matched===true,
      safetyCopy:writeLocked?'네이버 검색광고 쓰기 잠금이 켜져 있어 실제 반영은 차단됩니다.':'현재값과 원본 변경 여부를 다시 확인한 뒤 한 번의 확인창에서 실행합니다.'
    });
  });
  const count=state=>items.filter(item=>item.state===state).length;
  const summary=Object.freeze({total:items.length,waiting:count('WAITING'),recheck:count('RECHECK'),verified:count('VERIFIED'),attention:count('ATTENTION'),rollback:count('ROLLBACK')});
  return Object.freeze({
    dataStatus:'READY',generatedAt:snapshot.generatedAt||null,error:null,auditsError:text(snapshot.auditsError)||null,items:Object.freeze(items),summary,
    latestLabel:items[0]?.createdLabel||'변경 기록 없음',
    flow:Object.freeze([
      Object.freeze({id:'diagnoses',href:'/diagnoses',step:'01',label:'진단 근거',description:'문제와 근거를 확인'}),
      Object.freeze({id:'changes',href:'/approvals',step:'02',label:'변경 기록',description:'바꾸기 전후를 기록'}),
      Object.freeze({id:'validation',href:'/execution-validation',step:'03',label:'7·14일 결과',description:'매출과 이익을 검증'}),
      Object.freeze({id:'experiments',href:'/ab-tests',step:'04',label:'다음 실험',description:'검증된 기준을 축적'})
    ]),
    policy:Object.freeze({ownerConfirmation:true,postWriteVerification:true,rollbackHistory:true,missingAsZero:false,naverWriteEnabled:snapshot.naverWriteEnabled===true})
  });
}

module.exports={buildPhase28ChangesModel,itemState,valueLabel,actionsFor,kstLabel,STATUS_LABELS,EVENT_LABELS};
