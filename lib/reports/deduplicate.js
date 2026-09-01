'use strict';

const supabaseModule=require('../cafe24/supabase.js');

function normalizedCount(value){
  const number=Number(value);
  return Number.isFinite(number)?number:0;
}

async function cleanupDuplicateDiagnosisReports(db=supabaseModule.getSupabase()){
  const result=await db.rpc('cleanup_duplicate_diagnosis_reports',{});
  if(result.error)throw new Error(result.error.message||'자동진단 중복 정리에 실패했습니다.');
  const row=Array.isArray(result.data)?result.data[0]:result.data;
  return {
    deletedCount:normalizedCount(row?.deleted_count),
    keptCount:normalizedCount(row?.kept_count),
    auditedCount:normalizedCount(row?.audited_count)
  };
}

module.exports={cleanupDuplicateDiagnosisReports};
