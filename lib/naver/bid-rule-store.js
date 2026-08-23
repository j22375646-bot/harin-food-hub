'use strict';

const {getSupabase}=require('../cafe24/supabase.js');
const bidRules=require('./bid-rules.js');

const TABLE='naver_bid_keyword_rules';
const FIELDS='ncc_keyword_id,ncc_adgroup_id,enabled,target_rank,target_rank_mode,minimum_bid,maximum_bid,increase_step,decrease_step,updated_at';

class NaverBidRuleStoreError extends Error{
  constructor(message,code='BID_RULE_STORE_FAILED',status=500){
    super(message);
    this.name='NaverBidRuleStoreError';
    this.code=code;
    this.status=status;
  }
}

function isSetupMissing(error){
  return ['42P01','PGRST204','PGRST205'].includes(String(error?.code||''))||/naver_bid_keyword_rules/i.test(String(error?.message||''))&&/schema cache|does not exist|not find/i.test(String(error?.message||''));
}

function fail(error,defaultMessage){
  if(isSetupMissing(error))throw new NaverBidRuleStoreError('네이버 입찰 안전설정 저장소를 준비한 뒤 다시 시도해주세요.','SETUP_REQUIRED',503);
  throw new NaverBidRuleStoreError(defaultMessage,'BID_RULE_STORE_FAILED',500);
}

async function listNaverBidRules({db=getSupabase()}={}){
  const result=await db.from(TABLE).select(FIELDS).order('updated_at',{ascending:false});
  if(result.error)fail(result.error,'네이버 입찰 안전설정을 불러오지 못했습니다.');
  return (result.data||[]).map(item=>bidRules.validateNaverBidRule({...item,platform:'NAVER'}));
}

async function saveNaverBidRules({db=getSupabase(),rules=[],actor='dashboard-session'}={}){
  const ids=rules.map(item=>item.ncc_keyword_id);
  const current=await db.from('naver_keywords').select('ncc_keyword_id,ncc_adgroup_id').in('ncc_keyword_id',ids);
  if(current.error)fail(current.error,'현재 네이버 키워드를 확인하지 못했습니다.');
  const verified=bidRules.verifyNaverRuleTargets(rules,current.data||[]);
  const rows=verified.map(item=>({...item,updated_by:String(actor||'dashboard-session').trim().slice(0,100)||'dashboard-session'}));
  const saved=await db.from(TABLE).upsert(rows,{onConflict:'ncc_keyword_id'}).select(FIELDS);
  if(saved.error)fail(saved.error,'네이버 입찰 안전설정을 저장하지 못했습니다.');
  return (saved.data||[]).map(item=>bidRules.validateNaverBidRule({...item,platform:'NAVER'}));
}

module.exports={TABLE,FIELDS,NaverBidRuleStoreError,listNaverBidRules,saveNaverBidRules,isSetupMissing};
