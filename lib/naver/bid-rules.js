'use strict';

const MIN_BID=70;
const MAX_BID=100000;
const MIN_TARGET_RANK=1;
const MAX_TARGET_RANK=5;
const MAX_BATCH_SIZE=500;

class NaverBidRuleError extends Error{
  constructor(message,code='INVALID_BID_RULE',status=400){
    super(message);
    this.name='NaverBidRuleError';
    this.code=code;
    this.status=status;
  }
}

function cleanText(value,maxLength=200){
  return String(value??'').trim().slice(0,maxLength);
}

function keywordId(value){
  return cleanText(value).replace(/^NAVER:/i,'');
}

function bidValue(value,{field,defaultValue,min=MIN_BID,max=MAX_BID}={}){
  const resolved=value==null||value===''?defaultValue:Number(value);
  if(!Number.isInteger(resolved)||resolved<min||resolved>max||resolved%10!==0){
    throw new NaverBidRuleError(`${field||'입찰 값'}은 ${min.toLocaleString('ko-KR')}원부터 ${max.toLocaleString('ko-KR')}원 사이의 10원 단위여야 합니다.`,'BID_STEP_INVALID');
  }
  return resolved;
}

function validateNaverBidRule(input={}){
  if(String(input.platform||'NAVER').toUpperCase()!=='NAVER'){
    throw new NaverBidRuleError('네이버 입찰 설정에는 네이버 키워드만 사용할 수 있습니다.','NAVER_SCOPE_REQUIRED');
  }
  const nccKeywordId=keywordId(input.ncc_keyword_id||input.id);
  if(!nccKeywordId)throw new NaverBidRuleError('설정할 네이버 키워드 ID가 필요합니다.','KEYWORD_ID_REQUIRED');
  const targetRank=input.target_rank==null||input.target_rank===''?null:Number(input.target_rank);
  if(targetRank!=null&&(!Number.isInteger(targetRank)||targetRank<MIN_TARGET_RANK||targetRank>MAX_TARGET_RANK)){
    throw new NaverBidRuleError('공식 PC·모바일 예상 API에서 확인된 목표 순위 1~5위만 저장할 수 있습니다.','TARGET_RANK_UNSUPPORTED');
  }
  const minimumBid=bidValue(input.minimum_bid,{field:'최저 입찰가',defaultValue:MIN_BID});
  const maximumBid=bidValue(input.maximum_bid,{field:'최고 입찰가',defaultValue:MAX_BID});
  if(minimumBid>maximumBid){
    throw new NaverBidRuleError('최저 입찰가는 최고 입찰가보다 클 수 없습니다.','BID_RANGE_INVALID');
  }
  return {
    ncc_keyword_id:nccKeywordId,
    ncc_adgroup_id:cleanText(input.ncc_adgroup_id,200),
    enabled:input.enabled===true,
    target_rank:targetRank,
    minimum_bid:minimumBid,
    maximum_bid:maximumBid,
    increase_step:bidValue(input.increase_step,{field:'인상 폭',defaultValue:10,min:10}),
    decrease_step:bidValue(input.decrease_step,{field:'인하 폭',defaultValue:10,min:10}),
    target_rank_mode:'REFERENCE_ONLY'
  };
}

function validateNaverBidRuleBatch(payload={}){
  if(String(payload.platform||'').toUpperCase()!=='NAVER'){
    throw new NaverBidRuleError('네이버 전용 설정 요청만 받을 수 있습니다.','NAVER_SCOPE_REQUIRED');
  }
  if(!Array.isArray(payload.rules)||payload.rules.length===0){
    throw new NaverBidRuleError('저장할 네이버 입찰 설정을 선택해주세요.','RULES_REQUIRED');
  }
  if(payload.rules.length>MAX_BATCH_SIZE){
    throw new NaverBidRuleError(`한 번에 최대 ${MAX_BATCH_SIZE}개까지 저장할 수 있습니다.`,'RULE_BATCH_TOO_LARGE',413);
  }
  const seen=new Set();
  return payload.rules.map(input=>{
    const rule=validateNaverBidRule({...input,platform:'NAVER'});
    if(seen.has(rule.ncc_keyword_id)){
      throw new NaverBidRuleError('같은 키워드가 설정 요청에 두 번 포함되어 있습니다.','DUPLICATE_KEYWORD');
    }
    seen.add(rule.ncc_keyword_id);
    return rule;
  });
}

function normalizeStoredRule(input){
  try{return validateNaverBidRule({...input,platform:'NAVER'});}
  catch{return null;}
}

function buildNaverBidRuleWorkspace(rows=[],storedRules=[],options={}){
  const byKeyword=new Map(storedRules.map(normalizeStoredRule).filter(Boolean).map(rule=>[rule.ncc_keyword_id,rule]));
  const hasSelection=Object.prototype.hasOwnProperty.call(options,'selectedIds');
  const selected=new Set((options.selectedIds||[]).map(String));
  const scoped=rows.filter(item=>item?.platform==='NAVER'&&item?.source==='REGISTERED')
    .filter(item=>!hasSelection||selected.has(String(item.id)))
    .map(item=>{
      const id=keywordId(item.id);
      const rule=byKeyword.get(id)||null;
      return {...item,nccKeywordId:id,rule,ruleConfigured:Boolean(rule)};
    });
  return {
    rows:scoped,
    summary:{
      selected:scoped.length,
      configured:scoped.filter(item=>item.ruleConfigured).length,
      enabled:scoped.filter(item=>item.rule?.enabled===true).length
    }
  };
}

function verifyNaverRuleTargets(rules=[],keywords=[]){
  const current=new Map(keywords.map(item=>[keywordId(item.ncc_keyword_id),{
    ncc_keyword_id:keywordId(item.ncc_keyword_id),
    ncc_adgroup_id:cleanText(item.ncc_adgroup_id,200)
  }]));
  return rules.map(rule=>{
    const keyword=current.get(rule.ncc_keyword_id);
    if(!keyword)throw new NaverBidRuleError('현재 네이버 계정에서 키워드를 다시 확인해주세요.','KEYWORD_NOT_FOUND',409);
    if(rule.ncc_adgroup_id&&rule.ncc_adgroup_id!==keyword.ncc_adgroup_id){
      throw new NaverBidRuleError('키워드가 다른 광고그룹으로 이동했습니다. 목록을 다시 불러와주세요.','ADGROUP_SCOPE_MISMATCH',409);
    }
    return {...rule,ncc_adgroup_id:keyword.ncc_adgroup_id};
  });
}

function roundBid(value){return Math.round(Number(value)/10)*10;}
function clamp(value,min,max){return Math.min(max,Math.max(min,value));}

function simulateNaverBidRule({row={},rule:rawRule={},action='KEEP',requested_bid=null}={}){
  if(row.platform!=='NAVER')throw new NaverBidRuleError('네이버 키워드만 입찰 설정을 미리 볼 수 있습니다.','NAVER_SCOPE_REQUIRED');
  const rule=validateNaverBidRule({...rawRule,platform:'NAVER',ncc_keyword_id:rawRule.ncc_keyword_id||row.id,ncc_adgroup_id:rawRule.ncc_adgroup_id||row.adgroupId});
  const currentBid=Number(row.currentBid);
  if(!Number.isInteger(currentBid)||currentBid<MIN_BID||currentBid>MAX_BID||currentBid%10!==0){
    throw new NaverBidRuleError('현재 입찰가를 다시 수집한 뒤 미리 볼 수 있습니다.','CURRENT_BID_INVALID',409);
  }
  const ownerMinimum=Number.isFinite(Number(row.minimumBid))?Number(row.minimumBid):MIN_BID;
  const ownerMaximum=Number.isFinite(Number(row.maximumBid))?Number(row.maximumBid):MAX_BID;
  const effectiveMinimum=Math.max(MIN_BID,ownerMinimum,rule.minimum_bid);
  const effectiveMaximum=Math.min(MAX_BID,ownerMaximum,rule.maximum_bid);
  if(effectiveMinimum>effectiveMaximum){
    throw new NaverBidRuleError('저장한 안전선과 현재 서버 변경 범위가 겹치지 않습니다. 현재값을 다시 확인해주세요.','RULE_WINDOW_STALE',409);
  }
  const normalizedAction=String(action||'KEEP').toUpperCase();
  let rawBid=requested_bid==null?currentBid:Number(requested_bid);
  if(requested_bid==null&&normalizedAction==='INCREASE')rawBid=currentBid+rule.increase_step;
  if(requested_bid==null&&normalizedAction==='DECREASE')rawBid=currentBid-rule.decrease_step;
  if(!Number.isFinite(rawBid))throw new NaverBidRuleError('미리 볼 입찰가를 확인해주세요.','BID_REQUIRED');
  rawBid=roundBid(rawBid);
  const proposedBid=roundBid(clamp(rawBid,effectiveMinimum,effectiveMaximum));
  return {
    ncc_keyword_id:rule.ncc_keyword_id,
    current_bid:currentBid,
    requested_bid:rawBid,
    proposed_bid:proposedBid,
    effective_minimum_bid:effectiveMinimum,
    effective_maximum_bid:effectiveMaximum,
    clamped:proposedBid!==rawBid,
    delta:proposedBid-currentBid,
    target_rank:rule.target_rank,
    target_rank_supported:false,
    target_rank_mode:'REFERENCE_ONLY'
  };
}

module.exports={
  MIN_BID,MAX_BID,MIN_TARGET_RANK,MAX_TARGET_RANK,MAX_BATCH_SIZE,
  NaverBidRuleError,validateNaverBidRule,validateNaverBidRuleBatch,
  buildNaverBidRuleWorkspace,verifyNaverRuleTargets,simulateNaverBidRule
};
